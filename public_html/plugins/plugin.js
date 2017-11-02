/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
 * All rights reserved
 */


/* global ArrayBuffer, module */

var Node = Node || {};


/**
 * @class NodePlugin
 * Represents a generic plugin object
 * @param {Object} parent
 * @param {Object} config
 */
Node.Plugin = function (parent, config)
{
  this.parent = parent;
  //
  for (var k in config)
    this[k] = config[k];
};


/**
 * Receive a message
 * @param {Object} msg
 * @param {Function} callback - for response
 */
Node.Plugin.prototype.onMessage = function (msg, callback)
{
  var argsArray = [];
  //
  for (var i = 0; i < msg.args.length; i++) {
    var arg = msg.args[i];
    //
    // Deserialize arguments of type File/Directory
    if (arg && typeof arg === "object" && arg._t)
      argsArray.push(this.deserializeObject(arg));
    else if (arg && arg instanceof Buffer) // Get ArrayBuffer from Buffer
      argsArray.push(new Uint8Array(arg).buffer);
    else
      argsArray.push(arg);
  }
  argsArray.push(callback);
  //
  // Call function
  this[msg.cmd].apply(this, argsArray);
};


// export module for node
if (module)
  module.exports = Node.Plugin;
