/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const Plugin = require("../plugin");
const LdapClient = require("./ldapclient");


/**
 * @class ActiveDirectory
 * @classdesc
 * Active Directory integration plugin for the Cloud Connector.
 * Provides methods to authenticate users and query Active Directory information through LDAP.
 *
 * Key features:
 * - **User Authentication**: Validate credentials against Active Directory
 * - **User and Group Management**: Query and verify users and groups
 * - **Group Membership**: Check and retrieve membership information (transitive via LDAP_MATCHING_RULE_IN_CHAIN)
 * - **LDAP Search**: Perform complex LDAP queries with filters
 *
 * Note: Public methods that proxy to the underlying LDAP client are declared `static`
 * because the plugin dispatcher invokes them via `Class.method.apply(instance, args)` —
 * see Plugin.onMessage. `this` is rebound to the plugin instance at call time, so
 * `this.exec(...)` resolves the instance method on the prototype.
 *
 * @extends Plugin
 * @property {Object} config - Configuration object for the Active Directory connection
 * @property {Object} ad - Local LDAP client instance
 * @param {CloudServer} parent - Parent CloudServer instance
 * @param {Object} config - Configuration object containing connection parameters
 * @param {String} config.name - Name of this plugin instance
 * @param {String} config.APIKey - API key for plugin authentication
 * @param {String} [config.url] - LDAP URL for the Active Directory server
 * @param {String} [config.baseDN] - Base Distinguished Name for searches
 * @param {String} [config.username] - Username (DN or UPN) for binding to Active Directory
 * @param {String} [config.password] - Password for binding to Active Directory
 * @param {Object} [config.tlsOptions] - Options forwarded to the TLS layer for `ldaps://` URLs
 * @param {Number} [config.timeout] - Operation timeout in milliseconds
 * @param {Number} [config.connectTimeout] - TCP connection timeout in milliseconds
 */
class ActiveDirectory extends Plugin
{
  constructor(parent, config)
  {
    super(parent, config);
    //
    this.config = config;
    this.ad = new LdapClient(this.config);
  }


  /**
   * Executes an Active Directory command.
   * Dispatches the call to the internal LDAP client.
   * @param {String} cid - Command identifier to execute
   * @param {Array} args - Arguments to pass to the command
   * @returns {Promise<*>} Result from the Active Directory command
   * @private
   */
  async exec(cid, args)
  {
    return await this.ad[cid].apply(this.ad, args);
  }


  /**
   * Authenticates a user against Active Directory using username and password.
   * Validates the provided credentials by attempting to bind to the LDAP server.
   * @param {String} username - Username to authenticate (can be UPN, DN, or simple username)
   * @param {String} password - Password to use for authentication
   * @returns {Promise<Boolean>} True if authentication successful, false otherwise
   * @throws {Error} Throws error if connection to Active Directory fails
   */
  static async authenticate(username, password)
  {
    return await this.exec("authenticate", [username, password]);
  }


  /**
   * Checks if a user is a member of a specific group.
   * Recursively checks nested group memberships.
   * @param {String} username - Username to check for membership (can be UPN, DN, or simple username)
   * @param {String} groupName - Group name to check for membership (can be CN or DN)
   * @param {Object} [options] - Optional LDAP query parameters
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - Additional LDAP filter to apply
   * @param {Array<String>} [options.attributes] - Attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Boolean>} True if user is member of the group, false otherwise
   */
  static async isUserMemberOf(username, groupName, options)
  {
    return await this.exec("isUserMemberOf", [username, groupName, options]);
  }


  /**
   * Performs a generic LDAP search returning both groups and users.
   * Searches the entire directory for objects matching the specified filter.
   * @param {Object|String} [options] - LDAP query parameters or filter string
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - LDAP filter to apply
   * @param {Array<String>} [options.attributes] - Attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Object>} Search results containing groups and users
   */
  static async find(options)
  {
    return await this.exec("find", [options]);
  }


  /**
   * Finds a user by username and retrieves their information.
   * Searches for the user in the Active Directory and returns their attributes.
   * @param {String} username - Username to search for (can be UPN, DN, or simple username)
   * @param {Object} [options] - Optional LDAP query parameters
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - Additional LDAP filter to apply
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Object>} User object with attributes or null if not found
   */
  static async findUser(username, options)
  {
    return await this.exec("findUser", [username, options]);
  }


  /**
   * Finds a group by name and retrieves its information.
   * Searches for the group in the Active Directory and returns its attributes.
   * @param {String} groupName - Group name to search for (can be CN or DN)
   * @param {Object} [options] - Optional LDAP query parameters
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - Additional LDAP filter to apply
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Object>} Group object with attributes or null if not found
   */
  static async findGroup(groupName, options)
  {
    return await this.exec("findGroup", [groupName, options]);
  }


  /**
   * Finds all users matching the specified filter.
   * Returns an array of user objects with their attributes.
   * @param {Object|String} [options] - LDAP query parameters or filter string
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - LDAP filter to apply (appended to default user filter)
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Array<Object>>} Array of user objects matching the filter
   */
  static async findUsers(options)
  {
    return await this.exec("findUsers", [options]);
  }


  /**
   * Finds all groups matching the specified filter.
   * Returns an array of group objects with their attributes.
   * @param {Object|String} [options] - LDAP query parameters or filter string
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - LDAP filter to apply (appended to default group filter)
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Array<Object>>} Array of group objects matching the filter
   */
  static async findGroups(options)
  {
    return await this.exec("findGroups", [options]);
  }


  /**
   * Checks if a group exists in Active Directory.
   * @param {String} groupName - Group name to check (can be CN or DN)
   * @param {Object} [options] - Optional LDAP query parameters
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - Additional LDAP filter to apply
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Boolean>} True if the group exists, false otherwise
   */
  static async groupExists(groupName, options)
  {
    return await this.exec("groupExists", [groupName, options]);
  }


  /**
   * Checks if a user exists in Active Directory.
   * @param {String} username - Username to check (can be UPN, DN, or simple username)
   * @param {Object} [options] - Optional LDAP query parameters
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - Additional LDAP filter to apply
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Boolean>} True if the user exists, false otherwise
   */
  static async userExists(username, options)
  {
    return await this.exec("userExists", [username, options]);
  }


  /**
   * Gets all groups that a group is a member of (nested group membership).
   * Recursively retrieves parent groups up the hierarchy.
   * @param {String} groupName - Group name to retrieve membership for (can be CN or DN)
   * @param {Object} [options] - Optional LDAP query parameters
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - Additional LDAP filter to apply
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Array<Object>>} Array of parent group objects
   */
  static async getGroupMembershipForGroup(groupName, options)
  {
    return await this.exec("getGroupMembershipForGroup", [groupName, options]);
  }


  /**
   * Gets all groups that a user belongs to.
   * Recursively retrieves nested group memberships.
   * @param {String} username - Username to retrieve membership for (can be UPN, DN, or simple username)
   * @param {Object} [options] - Optional LDAP query parameters
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - Additional LDAP filter to apply
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Array<Object>>} Array of group objects the user belongs to
   */
  static async getGroupMembershipForUser(username, options)
  {
    return await this.exec("getGroupMembershipForUser", [username, options]);
  }


  /**
   * Gets all users that belong to a group.
   * Recursively retrieves users from nested groups.
   * @param {String} groupName - Group name to retrieve members from (can be CN or DN)
   * @param {Object} [options] - Optional LDAP query parameters
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - Additional LDAP filter to apply
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Array<Object>>} Array of user objects that are members of the group
   */
  static async getUsersForGroup(groupName, options)
  {
    return await this.exec("getUsersForGroup", [groupName, options]);
  }


  /**
   * Gets the root DSE (Directory Server Entry) for the specified LDAP URL.
   * The root DSE provides server capabilities and configuration information.
   * @param {String} url - LDAP URL to retrieve the root DSE from
   * @param {Array<String>} [attributes] - Optional list of attributes to retrieve (returns all if not specified)
   * @returns {Promise<Object>} Root DSE object containing server information
   */
  static async getRootDSE(url, attributes)
  {
    return await this.exec("getRootDSE", [url, attributes]);
  }


  /**
   * Finds deleted objects in the Active Directory Recycle Bin.
   * Retrieves objects that have been deleted but not yet purged from the directory.
   * Note: Requires Active Directory Recycle Bin feature to be enabled.
   * @param {Object|String} [options] - LDAP query parameters or filter string
   * @param {String} [options.scope] - LDAP search scope (base, one, or sub)
   * @param {String} [options.filter] - LDAP filter to apply to deleted objects
   * @param {Array<String>} [options.attributes] - Specific attributes to return
   * @param {Number} [options.sizeLimit] - Maximum number of entries to return
   * @param {Number} [options.timelimit] - Maximum time in seconds for the search
   * @returns {Promise<Array<Object>>} Array of deleted objects from the Recycle Bin
   */
  static async findDeletedObjects(options)
  {
    return await this.exec("findDeletedObjects", [options]);
  }
}


// export module for node
module.exports = ActiveDirectory;
