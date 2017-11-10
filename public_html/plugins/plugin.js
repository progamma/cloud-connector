/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
 * All rights reserved
 */


/* global module */

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
  //
  this.instances = {};
};


Node.Plugin.msgTypes = {
  callMethod: "cm",
  destroyObject: "do"
};


/*
 * Deserialize an object
 * @param {Object} obj
 */
Node.Plugin.prototype.deserializeObject = function (obj) {
  if (obj.instanceIndex && this.instances[obj.instanceIndex])
    return this.instances[obj.instanceIndex];
  //
  var instance = new Node[obj._t](this, obj);
  this.instances[obj.instanceIndex] = instance;
  //
  return instance;
};


/**
 * Receive a message
 * @param {Object} msg
 * @param {Function} callback - for response
 */
Node.Plugin.prototype.onMessage = function (msg, callback)
{
  switch (msg.type) {
    case Node.Plugin.msgTypes.callMethod:
      msg.args.push(callback);
      //
      // Deserialize instance
      var caller, applyCaller;
      if (typeof msg.obj === "object") {
        caller = this.deserializeObject(msg.obj);
        applyCaller = caller;
      }
      else {
        caller = require("./" + msg.obj.toLowerCase());
        applyCaller = this;
      }

      //
      // Call function
      caller[msg.cmd].apply(applyCaller, msg.args);
      break;

    case Node.Plugin.msgTypes.destroyObject:
      this.destroyObject(msg.obj, callback);
      break;
  }
};


/**
 * Destroy an object
 * @param {Object} obj
 * @param {Function} callback - for response
 */
Node.Plugin.prototype.destroyObject = function (obj, callback)
{
  delete this.instances[obj.instanceIndex];
  //
  callback();
};


// export module for node
if (module)
  module.exports = Node.Plugin;
