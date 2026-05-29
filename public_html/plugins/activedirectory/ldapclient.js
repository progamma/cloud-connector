/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

let {Client, Control, InvalidCredentialsError} = require("ldapts");


// LDAP_MATCHING_RULE_IN_CHAIN: AD-specific matching rule for transitive
// (nested) group membership. See MS-ADTS section 3.1.1.3.4.4.3.
let MATCHING_RULE_IN_CHAIN = "1.2.840.113556.1.4.1941";

// LDAP_SERVER_SHOW_DELETED_OID: control that includes tombstoned (deleted)
// objects in search results — required to enumerate the AD Recycle Bin.
let SHOW_DELETED_OID = "1.2.840.113556.1.4.417";

// Default attributes returned by the legacy activedirectory library. Kept
// verbatim so callers reading these properties without setting `attributes`
// keep receiving the same fields.
let DEFAULT_USER_ATTRIBUTES = [
  "dn",
  "userPrincipalName", "sAMAccountName", "mail",
  "lockoutTime", "whenCreated", "pwdLastSet", "userAccountControl",
  "employeeID", "sn", "givenName", "initials", "cn", "displayName",
  "comment", "description"
];
let DEFAULT_GROUP_ATTRIBUTES = ["dn", "cn", "description"];

// Default object-class filters (no outer parentheses — combined as `(&<filter><extra>)`).
let DEFAULT_USER_FILTER = "(|(objectClass=user)(objectClass=person))(!(objectClass=computer))(!(objectClass=group))";
let DEFAULT_GROUP_FILTER = "(objectClass=group)(!(objectClass=computer))(!(objectClass=user))(!(objectClass=person))";

// Heuristic DN matcher: a sequence of `attr=value` pairs separated by commas.
let DN_REGEX = /^(?:[A-Za-z][\w-]*=[^,]+,?\s*)+$/;


/**
 * Heuristic check that returns true when the given string looks like an
 * LDAP distinguished name (a sequence of `attr=value` pairs separated by
 * commas). Used to decide whether an identifier should be matched as
 * `distinguishedName=…` rather than `sAMAccountName=…`/`cn=…`.
 * @param {String} s - Value to test
 * @returns {Boolean} True if `s` matches the DN syntax
 */
function isDistinguishedName(s)
{
  return typeof s === "string" && DN_REGEX.test(s.trim());
}


/**
 * Escapes an LDAP filter value per RFC 4515. Converts `\\`, `*`, `(`, `)` and
 * NUL into their hex-encoded form. Also blocks filter injection coming from
 * untrusted username/group inputs.
 * @param {*} v - Value to escape (coerced to String)
 * @returns {String} Escaped filter value safe to embed inside a filter expression
 */
function escapeFilterValue(v)
{
  return String(v)
    .replace(/\\/g, "\\5c")
    .replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28")
    .replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}


/**
 * Builds the LDAP filter used to look up a single user. Matches by DN when the
 * argument looks like a distinguished name, otherwise by `sAMAccountName` OR
 * `userPrincipalName`. With no argument returns the bare category filter
 * `(objectCategory=User)`.
 * @param {String} [username] - User identifier (DN, sAMAccountName or UPN)
 * @returns {String} LDAP filter expression
 */
function getUserQueryFilter(username)
{
  if (!username)
    return "(objectCategory=User)";
  //
  let v = escapeFilterValue(username);
  if (isDistinguishedName(username))
    return `(&(objectCategory=User)(distinguishedName=${v}))`;
  //
  return `(&(objectCategory=User)(|(sAMAccountName=${v})(userPrincipalName=${v})))`;
}


/**
 * Builds the LDAP filter used to look up a single group. Matches by DN when
 * the argument looks like a distinguished name, otherwise by `cn`. With no
 * argument returns the bare category filter `(objectCategory=Group)`.
 * @param {String} [groupName] - Group identifier (DN or CN)
 * @returns {String} LDAP filter expression
 */
function getGroupQueryFilter(groupName)
{
  if (!groupName)
    return "(objectCategory=Group)";
  //
  let v = escapeFilterValue(groupName);
  if (isDistinguishedName(groupName))
    return `(&(objectCategory=Group)(distinguishedName=${v}))`;
  //
  return `(&(objectCategory=Group)(cn=${v}))`;
}


/**
 * Wraps a raw filter as a compound (parenthesized) expression so it can be
 * safely AND-ed inside `(&...)`. Idempotent: if the input is already wrapped
 * the value is returned unchanged. Empty/falsy inputs return an empty string.
 * @param {String} filter - Filter expression with or without surrounding parens
 * @returns {String} Compound-safe filter expression
 */
function compoundFilter(filter)
{
  if (!filter)
    return "";
  //
  let s = String(filter).trim();
  if (s.startsWith("(") && s.endsWith(")"))
    return s;
  //
  return `(${s})`;
}


/**
 * Merges caller-supplied search options into a base set. Caller fields override
 * the base, EXCEPT `filter`: a caller filter is AND-combined with the base
 * filter. Also normalizes the legacy `timelimit` (lowercase, used by the old
 * activedirectory library) into ldapts' `timeLimit` (camelCase).
 * @param {Object} base - Base search options built by the caller method
 * @param {Object} [caller] - User-supplied options
 * @returns {Object} Merged search options ready for `ldapts.Client.search`
 */
function mergeSearchOptions(base, caller)
{
  if (!caller || typeof caller !== "object")
    return {...base};
  //
  // Spread caller over base but skip undefined values: call sites use
  // `{...callerObj, filter: undefined}` to opt out of overriding a base
  // field — a plain spread would propagate the undefined and wipe it.
  let opts = {...base};
  for (let key of Object.keys(caller)) {
    if (caller[key] !== undefined)
      opts[key] = caller[key];
  }
  if (caller.filter && base.filter)
    opts.filter = `(&${base.filter}${compoundFilter(caller.filter)})`;
  //
  if (caller.timelimit && !caller.timeLimit)
    opts.timeLimit = caller.timelimit;
  //
  delete opts.timelimit;
  return opts;
}


/**
 * Returns the entry's `objectClass` values as an array, regardless of whether
 * ldapts surfaced them as a single string or as a string[].
 * @param {Object} entry - LDAP entry (as returned by `ldapts`)
 * @returns {Array<String>} Object class values (empty array if missing)
 */
function getObjectClasses(entry)
{
  let cls = entry?.objectClass;
  if (!cls)
    return [];
  //
  return Array.isArray(cls) ? cls : [cls];
}


/**
 * Returns true when the entry looks like an Active Directory user — i.e.
 * its `objectClass` contains `user` or `person` and does not contain
 * `computer` or `group`.
 * @param {Object} entry - LDAP entry
 * @returns {Boolean}
 */
function isUserEntry(entry)
{
  let classes = getObjectClasses(entry).map(c => String(c).toLowerCase());
  if (classes.includes("computer") || classes.includes("group"))
    return false;
  //
  return classes.includes("user") || classes.includes("person");
}


/**
 * Returns true when the entry looks like an Active Directory group — i.e.
 * its `objectClass` contains `group` and none of `user`, `person`, `computer`.
 * @param {Object} entry - LDAP entry
 * @returns {Boolean}
 */
function isGroupEntry(entry)
{
  let classes = getObjectClasses(entry).map(c => String(c).toLowerCase());
  return classes.includes("group") && !classes.includes("user") && !classes.includes("person") && !classes.includes("computer");
}


/**
 * Re-shapes an LDAP entry into a plain object containing only the `requested`
 * attributes (plus `dn`, which is always present in ldapts entries). When
 * `requested` is empty or missing, returns a shallow copy of the entry.
 * @param {Object} entry - LDAP entry as returned by `ldapts`
 * @param {Array<String>} [requested] - Names of attributes to keep
 * @returns {Object} Plain object with the selected attributes
 */
function pickAttributes(entry, requested)
{
  if (!entry)
    return entry;
  //
  if (!requested || !requested.length)
    return {...entry};
  //
  let out = {dn: entry.dn};
  for (let key of requested) {
    if (key in entry)
      out[key] = entry[key];
  }
  return out;
}


/**
 * Builds a fresh LDAP_SERVER_SHOW_DELETED control instance. Marked critical so
 * the server fails the request if it cannot honour the control instead of
 * silently ignoring it. Required to query the AD Recycle Bin.
 * @returns {Control} ldapts control instance bound to OID 1.2.840.113556.1.4.417
 */
function showDeletedControl()
{
  return new Control(SHOW_DELETED_OID, {critical: true});
}


/**
 * @class LdapClient
 * @classdesc
 * Active Directory LDAP client built on top of `ldapts`. Replaces the
 * legacy abandoned `activedirectory` npm package. Method names and argument
 * positions match the subset of the legacy API consumed by `ActiveDirectory`
 * so the public wrapper can dispatch through `this.ad[cid](...args)` unchanged.
 *
 * Key features:
 * - **Authentication**: simple LDAP bind with username/password
 * - **User/Group lookup**: AD-specific filters with RFC 4515 escaping
 * - **Transitive membership**: server-side recursion via LDAP_MATCHING_RULE_IN_CHAIN
 * - **Range retrieval**: transparently re-fetches `attr;range=X-N` chunks
 * - **Recycle Bin**: enumerates tombstoned objects via the SHOW_DELETED control
 *
 * @property {Object} config - Connection configuration
 * @param {Object} config - Connection configuration
 * @param {String} config.url - LDAP URL (e.g. `ldap://dc.example.com:389` or `ldaps://...`)
 * @param {String} config.baseDN - Base distinguished name used as root for searches
 * @param {String} config.username - Bind DN or UPN of the service account
 * @param {String} config.password - Bind password for the service account
 * @param {Object} [config.tlsOptions] - Options forwarded to Node's TLS layer for `ldaps://`
 * @param {Number} [config.timeout] - Operation timeout in milliseconds
 * @param {Number} [config.connectTimeout] - TCP connection timeout in milliseconds
 * @param {Boolean} [config.strictDN=true] - Enables strict DN parsing in the ldapts client
 */
class LdapClient
{
  constructor(config)
  {
    this.config = config || {};
  }


  /**
   * Builds the options object passed to `ldapts.Client`. Forwards only the
   * fields that are actually configured — ldapts uses its own defaults for any
   * field left out.
   * @returns {Object} `ldapts.ClientOptions`
   * @private
   */
  _clientOptions()
  {
    let opts = {url: this.config.url};
    if (this.config.tlsOptions)
      opts.tlsOptions = this.config.tlsOptions;
    if (this.config.timeout)
      opts.timeout = this.config.timeout;
    if (this.config.connectTimeout)
      opts.connectTimeout = this.config.connectTimeout;
    if (this.config.strictDN === false)
      opts.strictDN = false;
    return opts;
  }


  /**
   * Opens a fresh `ldapts.Client`, binds with the configured service account,
   * runs `action(client)`, then unbinds in `finally` (best-effort: unbind
   * failures are swallowed). The bind step uses the service-account credentials
   * from `config.username`/`config.password`.
   * @param {Function} action - Async callback receiving the bound client; its resolved value is returned
   * @returns {Promise<*>} Whatever `action` resolves to
   * @throws {Error} Re-throws bind errors and any error thrown by `action`
   * @private
   */
  async _withClient(action)
  {
    let client = new Client(this._clientOptions());
    let bound = false;
    try {
      await client.bind(this.config.username, this.config.password);
      bound = true;
      return await action(client);
    }
    finally {
      if (bound)
        client.unbind().catch(() => {});
    }
  }


  /**
   * Transparently resolves AD-style ranged attributes. AD truncates large
   * multi-valued attributes (typically beyond 1500 entries on `member`) by
   * returning them under a `name;range=0-N` key. This method iterates additional
   * search requests on the same entry to fetch subsequent chunks and folds them
   * back under the bare attribute name, matching the legacy library's behavior.
   * The entry is mutated in place.
   * @param {Object} client - Bound `ldapts.Client` to reuse for follow-up searches
   * @param {Object} entry - LDAP entry to scan and complete
   * @returns {Promise<Object>} The same entry with ranged attributes folded
   * @private
   */
  async _resolveRangedAttributes(client, entry)
  {
    let ranged = [];
    for (let key of Object.keys(entry)) {
      let m = key.match(/^(.+?);range=(\d+)-(\d+|\*)$/i);
      if (m && m[3] !== "*")
        ranged.push({key, attr: m[1], next: parseInt(m[3], 10) + 1});
    }
    if (!ranged.length)
      return entry;
    //
    for (let r of ranged) {
      let combined = [].concat(entry[r.key] || []);
      delete entry[r.key];
      let next = r.next;
      let done = false;
      while (!done) {
        let rangedAttr = `${r.attr};range=${next}-*`;
        let {searchEntries} = await client.search(entry.dn, {
          scope: "base",
          filter: "(objectClass=*)",
          attributes: [rangedAttr]
        });
        let chunk = searchEntries[0];
        if (!chunk)
          break;
        //
        let chunkKey = Object.keys(chunk).find(k => k.toLowerCase().startsWith(`${r.attr.toLowerCase()};range=`));
        if (!chunkKey)
          break;
        //
        combined = combined.concat(chunk[chunkKey] || []);
        let m = chunkKey.match(/^(.+?);range=(\d+)-(\d+|\*)$/i);
        if (!m || m[3] === "*")
          done = true;
        else
          next = parseInt(m[3], 10) + 1;
      }
      entry[r.attr] = combined;
    }
    return entry;
  }


  /**
   * Convenience helper around `_withClient`: runs a search and post-processes
   * each returned entry through `_resolveRangedAttributes` so callers never see
   * truncated multi-valued attributes.
   * @param {String} baseDN - Search base DN
   * @param {Object} options - `ldapts.SearchOptions`
   * @returns {Promise<Array<Object>>} Result entries with ranged attributes resolved
   * @private
   */
  async _searchWithRanges(baseDN, options)
  {
    return await this._withClient(async client => {
      let {searchEntries} = await client.search(baseDN, options);
      for (let e of searchEntries)
        await this._resolveRangedAttributes(client, e);
      //
      return searchEntries;
    });
  }


  /**
   * Resolves a user or group identifier into its canonical distinguishedName.
   * Used by membership queries that need to pin the chained-matching rule
   * against a fully-qualified DN. Returns the identifier unchanged when it
   * already looks like a DN. Matching attributes depend on `kind`: user uses
   * `sAMAccountName` OR `userPrincipalName`, group uses `cn`.
   * @param {Object} client - Bound `ldapts.Client` to reuse
   * @param {String} kind - Either `"user"` or `"group"` — drives the lookup filter
   * @param {String} identifier - User (DN, sAMAccountName, UPN) or group (DN, CN) identifier
   * @returns {Promise<String|null>} The DN, or `null` if no entry matches
   * @private
   */
  async _resolveDN(client, kind, identifier)
  {
    if (!identifier)
      return null;
    //
    if (isDistinguishedName(identifier))
      return identifier;
    //
    let filter = kind === "user" ? getUserQueryFilter(identifier) : getGroupQueryFilter(identifier);
    let {searchEntries} = await client.search(this.config.baseDN, {
      filter,
      scope: "sub",
      attributes: ["distinguishedName"],
      sizeLimit: 1
    });
    if (!searchEntries.length)
      return null;
    //
    return searchEntries[0].distinguishedName || searchEntries[0].dn || null;
  }


  /**
   * Validates a user's credentials by attempting an LDAP bind. Connection
   * errors (network down, server unreachable, TLS failure, …) are propagated.
   * Returns false only when the server explicitly rejects the credentials
   * (LDAP result code 49, `InvalidCredentialsError`).
   * @param {String} username - Bind DN or UPN
   * @param {String} password - Password
   * @returns {Promise<Boolean>} True on successful bind, false when credentials are invalid
   * @throws {Error} On any non-credential failure (connection/TLS/server errors)
   */
  async authenticate(username, password)
  {
    if (!username || !password)
      return false;
    //
    let client = new Client(this._clientOptions());
    try {
      await client.bind(username, password);
      return true;
    }
    catch (err) {
      if (err instanceof InvalidCredentialsError || err?.code === 49)
        return false;
      //
      throw err;
    }
    finally {
      client.unbind().catch(() => {});
    }
  }


  /**
   * Looks up a single user by identifier. Matches `sAMAccountName` OR
   * `userPrincipalName` when given a plain username, or `distinguishedName`
   * when given a DN. Returns the user's attributes, picking the default set
   * unless `options.attributes` overrides it.
   * @param {String} username - User identifier (DN, sAMAccountName, or UPN)
   * @param {Object} [options] - Search options
   * @param {String} [options.scope] - LDAP scope (`base`, `one`, or `sub`)
   * @param {String} [options.filter] - Extra filter AND-combined with the user filter
   * @param {Array<String>} [options.attributes] - Attributes to retrieve
   * @param {Number} [options.sizeLimit] - Maximum entries to return
   * @param {Number} [options.timelimit] - Maximum search time in seconds
   * @returns {Promise<Object|null>} The user attributes, or null if not found
   */
  async findUser(username, options)
  {
    let requested = options?.attributes || DEFAULT_USER_ATTRIBUTES;
    let baseOpts = {
      filter: getUserQueryFilter(username),
      scope: "sub",
      attributes: requested.slice(),
      paged: true
    };
    let opts = mergeSearchOptions(baseOpts, options);
    let entries = await this._searchWithRanges(this.config.baseDN, opts);
    if (!entries.length)
      return null;
    //
    return pickAttributes(entries[0], requested);
  }


  /**
   * Looks up a single group by identifier. Matches `cn` when given a plain
   * name, or `distinguishedName` when given a DN. Returns the group's
   * attributes, picking the default set unless `options.attributes`
   * overrides it.
   * @param {String} groupName - Group identifier (DN or CN)
   * @param {Object} [options] - Search options
   * @param {String} [options.scope] - LDAP scope (`base`, `one`, or `sub`)
   * @param {String} [options.filter] - Extra filter AND-combined with the group filter
   * @param {Array<String>} [options.attributes] - Attributes to retrieve
   * @param {Number} [options.sizeLimit] - Maximum entries to return
   * @param {Number} [options.timelimit] - Maximum search time in seconds
   * @returns {Promise<Object|null>} The group attributes, or null if not found
   */
  async findGroup(groupName, options)
  {
    let requested = options?.attributes || DEFAULT_GROUP_ATTRIBUTES;
    let baseOpts = {
      filter: getGroupQueryFilter(groupName),
      scope: "sub",
      attributes: requested.slice(),
      paged: true
    };
    let opts = mergeSearchOptions(baseOpts, options);
    let entries = await this._searchWithRanges(this.config.baseDN, opts);
    if (!entries.length)
      return null;
    //
    return pickAttributes(entries[0], requested);
  }


  /**
   * Returns every user matching the caller's filter, AND-combined with the
   * default user filter `(|(objectClass=user)(objectClass=person))…`.
   * Passing `options` as a plain string is also accepted and treated as a bare
   * filter expression appended to the default. Results are paged on the server
   * side so result sets larger than 1000 entries are returned in full.
   * @param {Object|String} [options] - Search options or bare LDAP filter
   * @param {String} [options.scope] - LDAP scope (`base`, `one`, or `sub`)
   * @param {String} [options.filter] - Extra filter AND-combined with the user filter
   * @param {Array<String>} [options.attributes] - Attributes to retrieve
   * @param {Number} [options.sizeLimit] - Maximum entries to return
   * @param {Number} [options.timelimit] - Maximum search time in seconds
   * @returns {Promise<Array<Object>>} Array of matching users (empty when nothing matches)
   */
  async findUsers(options)
  {
    let extra = "";
    let callerObj = null;
    if (typeof options === "string")
      extra = compoundFilter(options);
    else if (options && typeof options === "object") {
      callerObj = options;
      if (options.filter)
        extra = compoundFilter(options.filter);
    }
    //
    let requested = callerObj?.attributes || DEFAULT_USER_ATTRIBUTES;
    let baseOpts = {
      filter: `(&${DEFAULT_USER_FILTER}${extra})`,
      scope: "sub",
      attributes: requested.slice(),
      paged: true
    };
    // Strip filter from caller before merge — already combined into baseOpts.
    let merged = mergeSearchOptions(baseOpts, callerObj && {...callerObj, filter: undefined});
    let entries = await this._searchWithRanges(this.config.baseDN, merged);
    return entries.map(e => pickAttributes(e, requested));
  }


  /**
   * Returns every group matching the caller's filter, AND-combined with the
   * default group filter `(objectClass=group)…`. Passing `options` as a plain
   * string is also accepted and treated as a bare filter expression appended
   * to the default. Results are paged on the server side.
   * @param {Object|String} [options] - Search options or bare LDAP filter
   * @param {String} [options.scope] - LDAP scope (`base`, `one`, or `sub`)
   * @param {String} [options.filter] - Extra filter AND-combined with the group filter
   * @param {Array<String>} [options.attributes] - Attributes to retrieve
   * @param {Number} [options.sizeLimit] - Maximum entries to return
   * @param {Number} [options.timelimit] - Maximum search time in seconds
   * @returns {Promise<Array<Object>>} Array of matching groups (empty when nothing matches)
   */
  async findGroups(options)
  {
    let extra = "";
    let callerObj = null;
    if (typeof options === "string")
      extra = compoundFilter(options);
    else if (options && typeof options === "object") {
      callerObj = options;
      if (options.filter)
        extra = compoundFilter(options.filter);
    }
    //
    let requested = callerObj?.attributes || DEFAULT_GROUP_ATTRIBUTES;
    let baseOpts = {
      filter: `(&${DEFAULT_GROUP_FILTER}${extra})`,
      scope: "sub",
      attributes: requested.slice(),
      paged: true
    };
    let merged = mergeSearchOptions(baseOpts, callerObj && {...callerObj, filter: undefined});
    let entries = await this._searchWithRanges(this.config.baseDN, merged);
    return entries.map(e => pickAttributes(e, requested));
  }


  /**
   * Checks whether the given user exists in the directory. Internally performs
   * a `findUser` and casts the result to a boolean.
   * @param {String} username - User identifier (DN, sAMAccountName, or UPN)
   * @param {Object} [options] - Search options (see {@link LdapClient#findUser})
   * @returns {Promise<Boolean>} True if the user exists, false otherwise
   */
  async userExists(username, options)
  {
    let user = await this.findUser(username, options);
    return !!user;
  }


  /**
   * Checks whether the given group exists in the directory. Internally performs
   * a `findGroup` and casts the result to a boolean.
   * @param {String} groupName - Group identifier (DN or CN)
   * @param {Object} [options] - Search options (see {@link LdapClient#findGroup})
   * @returns {Promise<Boolean>} True if the group exists, false otherwise
   */
  async groupExists(groupName, options)
  {
    let group = await this.findGroup(groupName, options);
    return !!group;
  }


  /**
   * Returns true if `username` is a member of `groupName`, recursing through
   * nested groups. Implemented server-side via the AD-specific
   * LDAP_MATCHING_RULE_IN_CHAIN (OID `1.2.840.113556.1.4.1941`) so no
   * client-side recursion is performed. Resolves both identifiers to their DNs
   * first; returns false when either cannot be resolved.
   * @param {String} username - User identifier (DN, sAMAccountName, or UPN)
   * @param {String} groupName - Group identifier (DN or CN)
   * @param {Object} [options] - Reserved for future use; currently ignored
   * @returns {Promise<Boolean>} True if the user belongs to the group (directly or transitively)
   */
  async isUserMemberOf(username, groupName, options)
  {
    return await this._withClient(async client => {
      let userDN = await this._resolveDN(client, "user", username);
      let groupDN = await this._resolveDN(client, "group", groupName);
      if (!userDN || !groupDN)
        return false;
      //
      let filter = `(&(distinguishedName=${escapeFilterValue(userDN)})(memberOf:${MATCHING_RULE_IN_CHAIN}:=${escapeFilterValue(groupDN)}))`;
      let {searchEntries} = await client.search(this.config.baseDN, {
        filter,
        scope: "sub",
        attributes: ["distinguishedName"],
        sizeLimit: 1
      });
      return searchEntries.length > 0;
    });
  }


  /**
   * Returns every group the user belongs to, recursing through nested
   * memberships. Implemented server-side via LDAP_MATCHING_RULE_IN_CHAIN so the
   * server walks the membership graph and returns the full transitive closure.
   * @param {String} username - User identifier (DN, sAMAccountName, or UPN)
   * @param {Object} [options] - Search options
   * @param {String} [options.scope] - LDAP scope (`base`, `one`, or `sub`)
   * @param {String} [options.filter] - Extra filter AND-combined with the group filter
   * @param {Array<String>} [options.attributes] - Attributes to retrieve on each group
   * @param {Number} [options.sizeLimit] - Maximum entries to return
   * @param {Number} [options.timelimit] - Maximum search time in seconds
   * @returns {Promise<Array<Object>>} Groups the user is a (transitive) member of
   */
  async getGroupMembershipForUser(username, options)
  {
    return await this._withClient(async client => {
      let userDN = await this._resolveDN(client, "user", username);
      if (!userDN)
        return [];
      //
      let requested = options?.attributes || DEFAULT_GROUP_ATTRIBUTES;
      let baseOpts = {
        filter: `(&(objectCategory=Group)(member:${MATCHING_RULE_IN_CHAIN}:=${escapeFilterValue(userDN)}))`,
        scope: "sub",
        attributes: requested.slice(),
        paged: true
      };
      let opts = mergeSearchOptions(baseOpts, options && {...options, filter: undefined});
      let {searchEntries} = await client.search(this.config.baseDN, opts);
      return searchEntries.map(e => pickAttributes(e, requested));
    });
  }


  /**
   * Returns every parent group the given group belongs to, recursing up the
   * hierarchy. Implemented server-side via LDAP_MATCHING_RULE_IN_CHAIN on the
   * `member` attribute.
   * @param {String} groupName - Group identifier (DN or CN)
   * @param {Object} [options] - Search options
   * @param {String} [options.scope] - LDAP scope (`base`, `one`, or `sub`)
   * @param {String} [options.filter] - Extra filter AND-combined with the group filter
   * @param {Array<String>} [options.attributes] - Attributes to retrieve on each group
   * @param {Number} [options.sizeLimit] - Maximum entries to return
   * @param {Number} [options.timelimit] - Maximum search time in seconds
   * @returns {Promise<Array<Object>>} Parent groups (transitive closure)
   */
  async getGroupMembershipForGroup(groupName, options)
  {
    return await this._withClient(async client => {
      let groupDN = await this._resolveDN(client, "group", groupName);
      if (!groupDN)
        return [];
      //
      let requested = options?.attributes || DEFAULT_GROUP_ATTRIBUTES;
      let baseOpts = {
        filter: `(&(objectCategory=Group)(member:${MATCHING_RULE_IN_CHAIN}:=${escapeFilterValue(groupDN)}))`,
        scope: "sub",
        attributes: requested.slice(),
        paged: true
      };
      let opts = mergeSearchOptions(baseOpts, options && {...options, filter: undefined});
      let {searchEntries} = await client.search(this.config.baseDN, opts);
      return searchEntries.map(e => pickAttributes(e, requested));
    });
  }


  /**
   * Returns every user that belongs to `groupName`, recursing through nested
   * groups. Implemented server-side via LDAP_MATCHING_RULE_IN_CHAIN on the
   * `memberOf` attribute, so the matching is performed by the directory and
   * range retrieval is not needed on the group's `member` attribute.
   * @param {String} groupName - Group identifier (DN or CN)
   * @param {Object} [options] - Search options
   * @param {String} [options.scope] - LDAP scope (`base`, `one`, or `sub`)
   * @param {String} [options.filter] - Extra filter AND-combined with the user filter
   * @param {Array<String>} [options.attributes] - Attributes to retrieve on each user
   * @param {Number} [options.sizeLimit] - Maximum entries to return
   * @param {Number} [options.timelimit] - Maximum search time in seconds
   * @returns {Promise<Array<Object>>} Users that are members (transitive) of the group
   */
  async getUsersForGroup(groupName, options)
  {
    return await this._withClient(async client => {
      let groupDN = await this._resolveDN(client, "group", groupName);
      if (!groupDN)
        return [];
      //
      let requested = options?.attributes || DEFAULT_USER_ATTRIBUTES;
      let baseOpts = {
        filter: `(&(objectCategory=User)(memberOf:${MATCHING_RULE_IN_CHAIN}:=${escapeFilterValue(groupDN)}))`,
        scope: "sub",
        attributes: requested.slice(),
        paged: true
      };
      let opts = mergeSearchOptions(baseOpts, options && {...options, filter: undefined});
      let {searchEntries} = await client.search(this.config.baseDN, opts);
      return searchEntries.map(e => pickAttributes(e, requested));
    });
  }


  /**
   * Performs a generic directory search and buckets the results by object type.
   * Accepts either a raw filter string or a full options object; when no filter
   * is supplied uses `(objectClass=*)`. Entries are classified as `users`,
   * `groups`, or `other` based on their `objectClass`.
   * @param {Object|String} [options] - Search options or bare LDAP filter
   * @param {String} [options.scope] - LDAP scope (`base`, `one`, or `sub`)
   * @param {String} [options.filter] - LDAP filter
   * @param {Array<String>} [options.attributes] - Attributes to retrieve
   * @param {Number} [options.sizeLimit] - Maximum entries to return
   * @param {Number} [options.timelimit] - Maximum search time in seconds
   * @returns {Promise<Object>} Object with `users`, `groups`, `other` arrays
   */
  async find(options)
  {
    let extraFilter = "";
    let callerObj = null;
    if (typeof options === "string")
      extraFilter = compoundFilter(options);
    else if (options && typeof options === "object") {
      callerObj = options;
      if (options.filter)
        extraFilter = compoundFilter(options.filter);
    }
    //
    let filter = extraFilter || "(objectClass=*)";
    let requested = callerObj?.attributes;
    let attributes;
    if (requested) {
      attributes = requested.includes("objectClass") ? requested.slice() : [...requested, "objectClass"];
    }
    else {
      attributes = [...new Set([...DEFAULT_USER_ATTRIBUTES, ...DEFAULT_GROUP_ATTRIBUTES, "objectClass"])];
    }
    //
    let baseOpts = {
      filter,
      scope: "sub",
      attributes,
      paged: true
    };
    let opts = mergeSearchOptions(baseOpts, callerObj && {...callerObj, filter: undefined, attributes: undefined});
    let entries = await this._searchWithRanges(this.config.baseDN, opts);
    //
    let users = [];
    let groups = [];
    let other = [];
    let outUserAttrs = requested || DEFAULT_USER_ATTRIBUTES;
    let outGroupAttrs = requested || DEFAULT_GROUP_ATTRIBUTES;
    for (let e of entries) {
      if (isUserEntry(e))
        users.push(pickAttributes(e, outUserAttrs));
      else if (isGroupEntry(e))
        groups.push(pickAttributes(e, outGroupAttrs));
      else
        other.push(requested ? pickAttributes(e, requested) : {...e});
    }
    return {users, groups, other};
  }


  /**
   * Reads the directory server's Root DSE entry, which advertises supported
   * controls, naming contexts, and server capabilities. Queried anonymously
   * (no bind) with an empty base DN and `scope: base`. Optionally targets a
   * different server than the one configured for the client.
   * @param {String} [url] - LDAP URL to query (defaults to `config.url`)
   * @param {Array<String>} [attributes] - Specific attributes to fetch (defaults to `["*"]`)
   * @returns {Promise<Object|null>} Root DSE entry, or null when the server returns no result
   */
  async getRootDSE(url, attributes)
  {
    let targetUrl = url || this.config.url;
    let opts = {url: targetUrl};
    if (this.config.tlsOptions)
      opts.tlsOptions = this.config.tlsOptions;
    //
    // The RootDSE entry is queried anonymously: baseDN="" and scope="base".
    let client = new Client(opts);
    try {
      let {searchEntries} = await client.search("", {
        scope: "base",
        filter: "(objectClass=*)",
        attributes: attributes || ["*"]
      });
      return searchEntries[0] || null;
    }
    finally {
      client.unbind().catch(() => {});
    }
  }


  /**
   * Enumerates objects in the AD Recycle Bin (tombstoned entries). Sends the
   * LDAP_SERVER_SHOW_DELETED control alongside the search so the directory
   * surfaces deleted objects. Note: requires the AD Recycle Bin feature to be
   * enabled on the target domain and the bind account to have appropriate
   * permissions.
   * @param {Object|String} [options] - Search options or bare LDAP filter
   * @param {String} [options.scope] - LDAP scope (`base`, `one`, or `sub`)
   * @param {String} [options.filter] - Extra filter AND-combined with `(isDeleted=TRUE)`
   * @param {Array<String>} [options.attributes] - Attributes to retrieve (defaults to `["*"]`)
   * @param {Number} [options.sizeLimit] - Maximum entries to return
   * @param {Number} [options.timelimit] - Maximum search time in seconds
   * @returns {Promise<Array<Object>>} Deleted entries currently in the Recycle Bin
   */
  async findDeletedObjects(options)
  {
    return await this._withClient(async client => {
      let extra = "";
      let callerObj = null;
      if (typeof options === "string")
        extra = compoundFilter(options);
      else if (options && typeof options === "object") {
        callerObj = options;
        if (options.filter)
          extra = compoundFilter(options.filter);
      }
      //
      let baseOpts = {
        filter: `(&(isDeleted=TRUE)${extra})`,
        scope: "sub",
        attributes: callerObj?.attributes || ["*"],
        paged: true
      };
      let opts = mergeSearchOptions(baseOpts, callerObj && {...callerObj, filter: undefined, attributes: undefined});
      let {searchEntries} = await client.search(this.config.baseDN, opts, [showDeletedControl()]);
      return searchEntries;
    });
  }
}


if (module)
  module.exports = LdapClient;
