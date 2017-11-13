/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
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
Node.ActiveDirectory.prototype.exec = function (cid, args)
{
  var ad = new Node.AD(this.config);
  //
  var argsArray = [];
  for (var i = 0; i < args.length - 1; i++)
    argsArray.push(args[i]);
  //
  var cb = args[args.length - 1];
  var newCb = function (err, res) {
    cb(res, err);
  };
  argsArray.push(newCb);
  //
  ad[cid].apply(ad, argsArray);
};


/**
 * Execute authentication using username and password
 * @param {String} username
 * @param {String} password
 * @param {Function} callback
 */
Node.ActiveDirectory.authenticate = function (username, password, callback)
{
  this.exec("authenticate", arguments);
};


/**
 * Return true if username is member of groupName
 * @param {Object} options
 * @param {String} username
 * @param {String} groupName
 * @param {Function} callback
 */
Node.ActiveDirectory.isUserMemberOf = function (options, username, groupName, callback)
{
  this.exec("isUserMemberOf", arguments);
};


/**
 * Perform a generic search and return both groups and users that match the specified filter
 * @param {Object} options
 * @param {Function} callback
 */
Node.ActiveDirectory.find = function (options, callback)
{
  this.exec("find", arguments);
};


/**
 * Find a user by given username
 * @param {Object} options
 * @param {String} username
 * @param {Function} callback
 */
Node.ActiveDirectory.findUser = function (options, username, callback)
{
  this.exec("findUser", arguments);
};


/**
 * Find a group by given groupName
 * @param {Object} options
 * @param {String} groupName
 * @param {Function} callback
 */
Node.ActiveDirectory.findGroup = function (options, groupName, callback)
{
  this.exec("findGroup", arguments);
};


/**
 * Find users that match the specified filter
 * @param {Object} options
 * @param {Function} callback
 */
Node.ActiveDirectory.findUsers = function (options, callback)
{
  this.exec("findUsers", arguments);
};


/**
 * Find groups that match the specified filter
 * @param {Object} options
 * @param {Function} callback
 */
Node.ActiveDirectory.findGroups = function (options, callback)
{
  this.exec("findGroups", arguments);
};


/**
 * Return true if groupName exists
 * @param {Object} options
 * @param {String} groupName
 * @param {Function} callback
 */
Node.ActiveDirectory.groupExists = function (options, groupName, callback)
{
  this.exec("groupExists", arguments);
};


/**
 * Return true if username exists
 * @param {Object} options
 * @param {String} username
 * @param {Function} callback
 */
Node.ActiveDirectory.userExists = function (options, username, callback)
{
  this.exec("userExists", arguments);
};


/**
 * Get all of the groups that groupName is a member of
 * @param {Object} options
 * @param {String} groupName
 * @param {Function} callback
 */
Node.ActiveDirectory.getGroupMembershipForGroup = function (options, groupName, callback)
{
  this.exec("getGroupMembershipForGroup", arguments);
};


/**
 * Get all of the groups that username belongs to
 * @param {Object} options
 * @param {String} username
 * @param {Function} callback
 */
Node.ActiveDirectory.getGroupMembershipForUser = function (options, username, callback)
{
  this.exec("getGroupMembershipForUser", arguments);
};


/**
 * Get all of the users that belong to groupName
 * @param {Object} options
 * @param {String} groupName
 * @param {Function} callback
 */
Node.ActiveDirectory.getUsersForGroup = function (options, groupName, callback)
{
  this.exec("getUsersForGroup", arguments);
};


/**
 * Get the root DSE for the specified url
 * @param {String} url
 * @param {Object} attributes
 * @param {Function} callback
 */
Node.ActiveDirectory.getRootDSE = function (url, attributes, callback)
{
  this.exec("getRootDSE", arguments);
};


/**
 * Get items in the active directory recycle bin
 * @param {Object} options
 * @param {Function} callback
 */
Node.ActiveDirectory.findDeletedObjects = function (options, callback)
{
  this.exec("findDeletedObjects", arguments);
};


// export module for node
if (module)
  module.exports = Node.ActiveDirectory;
