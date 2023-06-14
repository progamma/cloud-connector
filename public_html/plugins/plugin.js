/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
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
  for (let k in config)
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
Node.Plugin.prototype.deserializeObject = function (obj)
{
  if (obj.instanceIndex && this.instances[obj.instanceIndex])
    return this.instances[obj.instanceIndex];
  //
  let instance = new Node[obj._t](this, obj);
  this.instances[obj.instanceIndex] = instance;
  //
  return instance;
};


/**
 * Received a message
 * @param {Object} msg
 */
Node.Plugin.prototype.onMessage = async function (msg)
{
  switch (msg.type) {
    case Node.Plugin.msgTypes.callMethod:
    {
      // Deserialize instance
      let caller, applyCaller;
      if (typeof msg.obj === "object") {
        caller = this.deserializeObject(msg.obj);
        applyCaller = caller;
      }
      else {
        caller = require(`./${msg.obj.toLowerCase()}/index`);
        applyCaller = this;
      }
      //
      // Call function
      return await caller[msg.cmd].apply(applyCaller, msg.args);
    }

    case Node.Plugin.msgTypes.destroyObject:
      await this.destroyObject(msg.obj);
      break;
  }
};


/**
 * Destroy an object
 * @param {Object} obj
 */
Node.Plugin.prototype.destroyObject = async function (obj)
{
  delete this.instances[obj.instanceIndex];
};


/**
 * Notified when a server disconnects
 * @param {Node.Server} server - server disconnected
 */
Node.Plugin.prototype.onServerDisconnected = async function (server)
{
  // Close all opened files to that server
  await this.disconnect(server);
};


/**
 * Close all opened files
 * @param {Node.Server} server - server disconnected
 */
Node.Plugin.prototype.disconnect = async function (server)
{
};


// export module for node
if (module)
  module.exports = Node.Plugin;
