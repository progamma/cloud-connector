/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

var Node = Node || {};


Node.AD = require("activedirectory");
Node.Plugin = require("../plugin");

/**
 * @class Node.ActiveDirectory
 * @classdesc
 * Active Directory authentication and management plugin for the Cloud Connector.
 * Provides comprehensive LDAP/Active Directory operations including authentication,
 * user and group management, and directory queries. Uses the activedirectory module
 * to interface with Microsoft Active Directory services.
 *
 * Key features:
 * - **Authentication**: Validate user credentials against AD
 * - **User management**: Find, check existence, and retrieve user information
 * - **Group management**: Query groups, memberships, and relationships
 * - **LDAP queries**: Execute custom LDAP filters and searches
 * - **Membership verification**: Check user/group membership relationships
 * - **Recycle bin**: Access deleted objects in AD recycle bin
 *
 * @extends Node.Plugin
 * @param {Node.CloudServer} parent - Parent CloudServer instance
 * @param {Object} config - Active Directory configuration
 * @param {String} config.name - Name of this plugin instance
 * @param {String} config.APIKey - API key for authentication
 * @param {String} config.url - LDAP URL (e.g., ldap://dc.domain.com)
 * @param {String} config.baseDN - Base DN for searches
 * @param {String} config.username - Service account username
 * @param {String} config.password - Service account password
 */
Node.ActiveDirectory = function (parent, config)
{
  Node.Plugin.call(this, parent, config);
};


// Make Node.ActiveDirectory extend Node.Plugin
Node.ActiveDirectory.prototype = new Node.Plugin();


/**
 * Executes a command on the Active Directory instance.
 * Creates a new AD connection and invokes the specified method with provided arguments.
 * @private
 * @param {String} cid - Command identifier (method name to invoke on AD instance)
 * @param {Array} args - Arguments to pass to the AD method
 * @returns {Promise<*>} Result from the Active Directory operation
 * @throws {Error} Active Directory errors or connection failures
 */
Node.ActiveDirectory.prototype.exec = async function (cid, args)
{
  let ad = new Node.AD(this.config);
  //
  let argsArray = [];
  for (let i = 0; i < args.length; i++)
    argsArray.push(args[i]);
  //
  return await new Promise((resolve, reject) => {
    argsArray.push((err, res) => err ? reject(err) : resolve(res));
    ad[cid].apply(ad, argsArray);
  });
};


/**
 * Authenticates a user against Active Directory using username and password.
 * Validates credentials and returns authentication status.
 * @param {String} username - The username to authenticate (can be UPN, DN, or sAMAccountName)
 * @param {String} password - The password to use for authentication
 * @returns {Promise<Boolean>} True if authentication successful, false otherwise
 * @throws {Error} LDAP connection or authentication errors
 */
Node.ActiveDirectory.authenticate = async function (username, password)
{
  return await this.exec("authenticate", [username, password]);
};


/**
 * Checks if a user is a member of a specific group.
 * Performs recursive membership checking including nested groups.
 * @param {Object} [options] - Optional LDAP query parameters
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @param {String} username - The username to check for membership
 * @param {String} groupName - The group to check for membership
 * @returns {Promise<Boolean>} True if user is member of group, false otherwise
 * @throws {Error} LDAP query errors or connection issues
 */
Node.ActiveDirectory.isUserMemberOf = async function (options, username, groupName)
{
  return await this.exec("isUserMemberOf", [options, username, groupName]);
};


/**
 * Performs a generic search and returns both groups and users that match the specified filter.
 * Searches across all object types in the directory.
 * @param {Object|String} [options] - LDAP query parameters or filter string. If string, treated as LDAP filter
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @returns {Promise<Object>} Search results with users and groups arrays
 * @throws {Error} LDAP query errors or invalid filter syntax
 */
Node.ActiveDirectory.find = async function (options)
{
  return await this.exec("find", [options]);
};


/**
 * Finds a user by username and retrieves their information.
 * Searches for user objects in Active Directory by sAMAccountName, userPrincipalName, or DN.
 * @param {Object} [options] - Optional LDAP query parameters
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - Additional LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @param {String} username - The username to retrieve (sAMAccountName, UPN, or DN)
 * @returns {Promise<Object>} User object with requested attributes or null if not found
 * @throws {Error} LDAP query errors or connection issues
 */
Node.ActiveDirectory.findUser = async function (options, username)
{
  return await this.exec("findUser", [options, username]);
};


/**
 * Finds a group by name and retrieves its information.
 * Searches for group objects in Active Directory by common name (cn) or DN.
 * @param {Object} [options] - Optional LDAP query parameters
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - Additional LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @param {String} groupName - The group name (cn) or DN to retrieve
 * @returns {Promise<Object>} Group object with requested attributes or null if not found
 * @throws {Error} LDAP query errors or connection issues
 */
Node.ActiveDirectory.findGroup = async function (options, groupName)
{
  return await this.exec("findGroup", [options, groupName]);
};


/**
 * Finds all users that match the specified filter.
 * Searches for user objects across the directory with optional filtering.
 * @param {Object|String} [options] - LDAP query parameters or filter string. If string, appended to default user filter (objectClass=user)
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @returns {Promise<Array<Object>>} Array of user objects with requested attributes
 * @throws {Error} LDAP query errors or invalid filter syntax
 */
Node.ActiveDirectory.findUsers = async function (options)
{
  return await this.exec("findUsers", [options]);
};


/**
 * Finds all groups that match the specified filter.
 * Searches for group objects across the directory with optional filtering.
 * @param {Object|String} [options] - LDAP query parameters or filter string. If string, appended to default group filter (objectClass=group)
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @returns {Promise<Array<Object>>} Array of group objects with requested attributes
 * @throws {Error} LDAP query errors or invalid filter syntax
 */
Node.ActiveDirectory.findGroups = async function (options)
{
  return await this.exec("findGroups", [options]);
};


/**
 * Checks if a group exists in Active Directory.
 * Verifies the existence of a group by name without retrieving full details.
 * @param {Object} [options] - Optional LDAP query parameters
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - Additional LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve (minimal for existence check)
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @param {String} groupName - The group name (cn) to check for existence
 * @returns {Promise<Boolean>} True if the group exists, false otherwise
 * @throws {Error} LDAP query errors or connection issues
 */
Node.ActiveDirectory.groupExists = async function (options, groupName)
{
  return await this.exec("groupExists", [options, groupName]);
};


/**
 * Checks if a user exists in Active Directory.
 * Verifies the existence of a user by username without retrieving full details.
 * @param {Object} [options] - Optional LDAP query parameters
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - Additional LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve (minimal for existence check)
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @param {String} username - The username to check for existence (sAMAccountName, UPN, or DN)
 * @returns {Promise<Boolean>} True if the user exists, false otherwise
 * @throws {Error} LDAP query errors or connection issues
 */
Node.ActiveDirectory.userExists = async function (options, username)
{
  return await this.exec("userExists", [options, username]);
};


/**
 * Gets all groups that contain the specified group as a member.
 * Retrieves the group membership hierarchy including nested group memberships.
 * @param {Object} [options] - Optional LDAP query parameters
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - Additional LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve for each group
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @param {String} groupName - The group name (cn) to retrieve membership for
 * @returns {Promise<Array<Object>>} Array of group objects that contain this group
 * @throws {Error} LDAP query errors or connection issues
 */
Node.ActiveDirectory.getGroupMembershipForGroup = async function (options, groupName)
{
  return await this.exec("getGroupMembershipForGroup", [options, groupName]);
};


/**
 * Gets all groups that the specified user belongs to.
 * Retrieves direct and nested group memberships for the user.
 * @param {Object} [options] - Optional LDAP query parameters
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - Additional LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve for each group
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @param {String} username - The username to retrieve group membership for
 * @returns {Promise<Array<Object>>} Array of group objects the user belongs to
 * @throws {Error} LDAP query errors or connection issues
 */
Node.ActiveDirectory.getGroupMembershipForUser = async function (options, username)
{
  return await this.exec("getGroupMembershipForUser", [options, username]);
};


/**
 * Gets all users that belong to the specified group.
 * Retrieves direct and nested user members of the group.
 * @param {Object} [options] - Optional LDAP query parameters
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - Additional LDAP filter to apply
 * @param {Array<String>} [options.attributes] - Attributes to retrieve for each user
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @param {String} groupName - The group name (cn) to retrieve members from
 * @returns {Promise<Array<Object>>} Array of user objects that are members of the group
 * @throws {Error} LDAP query errors or connection issues
 */
Node.ActiveDirectory.getUsersForGroup = async function (options, groupName)
{
  return await this.exec("getUsersForGroup", [options, groupName]);
};


/**
 * Gets the root DSE (Directory Server Entry) for the specified LDAP server.
 * Retrieves server capabilities, supported controls, naming contexts, and other metadata.
 * @param {String} url - The LDAP URL to retrieve the root DSE from (e.g., ldap://dc.domain.com)
 * @param {Array<String>} [attributes] - Optional list of attributes to retrieve. Returns all if not specified
 * @returns {Promise<Object>} Root DSE object with server metadata and capabilities
 * @throws {Error} LDAP connection or query errors
 */
Node.ActiveDirectory.getRootDSE = async function (url, attributes)
{
  return await this.exec("getRootDSE", [url, attributes]);
};


/**
 * Gets items from the Active Directory recycle bin.
 * Retrieves deleted objects that can potentially be restored if the AD recycle bin is enabled.
 * @param {Object|String} [options] - LDAP query parameters or filter string. If string, used as LDAP filter for deleted objects
 * @param {String} [options.scope] - Search scope (base, one, sub)
 * @param {String} [options.filter] - LDAP filter to apply to deleted objects
 * @param {Array<String>} [options.attributes] - Attributes to retrieve
 * @param {Number} [options.sizeLimit] - Maximum number of entries to return
 * @param {Number} [options.timeLimit] - Maximum time in seconds for search
 * @returns {Promise<Array<Object>>} Array of deleted objects from the AD recycle bin
 * @throws {Error} LDAP query errors or if recycle bin is not enabled
 */
Node.ActiveDirectory.findDeletedObjects = async function (options)
{
  return await this.exec("findDeletedObjects", [options]);
};


// export module for node
module.exports = Node.ActiveDirectory;
