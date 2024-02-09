/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */


/* global module */

var Node = Node || {};


Node.AD = require("activedirectory");
Node.Plugin = require("../plugin");

/**
 * @class ActiveDirectory
 * Represents an ActiveDirectory plugin
 * @param {Object} parent
 * @param {Object} config
 */
Node.ActiveDirectory = function (parent, config)
{
  Node.Plugin.call(this, parent, config);
};


// Make Node.ActiveDirectory extend Node.Plugin
Node.ActiveDirectory.prototype = new Node.Plugin();


/*
 * Execute a command
 * @param {type} cid
 * @param {type} args
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
 * Execute authentication using username and password
 * @param {String} username The username to authenticate
 * @param {String} password The password to use for authentication
 */
Node.ActiveDirectory.authenticate = async function (username, password)
{
  return await this.exec("authenticate", [username, password]);
};


/**
 * Return true if username is member of groupName
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to check for membership
 * @param {String} groupName The group to check for membership
 */
Node.ActiveDirectory.isUserMemberOf = async function (options, username, groupName)
{
  return await this.exec("isUserMemberOf", [options, username, groupName]);
};


/**
 * Perform a generic search and return both groups and users that match the specified filter
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter
 */
Node.ActiveDirectory.find = async function (options)
{
  return await this.exec("find", [options]);
};


/**
 * Find a user by given username
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to retrieve information about. Optionally can pass in the distinguishedName (dn) of the user to retrieve
 */
Node.ActiveDirectory.findUser = async function (options, username)
{
  return await this.exec("findUser", [options, username]);
};


/**
 * Find a group by given groupName
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The group (cn) to retrieve information about. Optionally can pass in the distinguishedName (dn) of the group to retrieve
 */
Node.ActiveDirectory.findGroup = async function (options, groupName)
{
  return await this.exec("findGroup", [options, groupName]);
};


/**
 * Find users that match the specified filter
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter that will be appended as the last parameter in the default LDAP filter
 */
Node.ActiveDirectory.findUsers = async function (options)
{
  return await this.exec("findUsers", [options]);
};


/**
 * Find groups that match the specified filter
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter that will be appended as the last parameter in the default LDAP filter
 */
Node.ActiveDirectory.findGroups = async function (options)
{
  return await this.exec("findGroups", [options]);
};


/**
 * Return true if groupName exists
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The group to check to see if it exists
 */
Node.ActiveDirectory.groupExists = async function (options, groupName)
{
  return await this.exec("groupExists", [options, groupName]);
};


/**
 * Return true if username exists
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to check to see if it exits
 */
Node.ActiveDirectory.userExists = async function (options, username)
{
  return await this.exec("userExists", [options, username]);
};


/**
 * Get all of the groups that groupName is a member of
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The group to retrieve membership information about
 */
Node.ActiveDirectory.getGroupMembershipForGroup = async function (options, groupName)
{
  return await this.exec("getGroupMembershipForGroup", [options, groupName]);
};


/**
 * Get all of the groups that username belongs to
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} username The username to retrieve membership information about
 */
Node.ActiveDirectory.getGroupMembershipForUser = async function (options, username)
{
  return await this.exec("getGroupMembershipForUser", [options, username]);
};


/**
 * Get all of the users that belong to groupName
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }
 * @param {String} groupName The name of the group to retrieve membership from
 */
Node.ActiveDirectory.getUsersForGroup = async function (options, groupName)
{
  return await this.exec("getUsersForGroup", [options, groupName]);
};


/**
 * Get the root DSE for the specified url
 * @param {String} url The url to retrieve the root DSE for
 * @param {Array} [attributes] The optional list of attributes to retrieve. Returns all if not specified
 */
Node.ActiveDirectory.getRootDSE = async function (url, attributes)
{
  return await this.exec("getRootDSE", [url, attributes]);
};


/**
 * Get items in the active directory recycle bin
 * @param {Object} [options] Optional LDAP query string parameters to execute. { scope: '', filter: '', attributes: [ '', '', ... ], sizeLimit: 0, timelimit: 0 }. Optionally, if only a string is provided, then the string is assumed to be an LDAP filter.
 */
Node.ActiveDirectory.findDeletedObjects = async function (options)
{
  return await this.exec("findDeletedObjects", [options]);
};


// export module for node
module.exports = Node.ActiveDirectory;
