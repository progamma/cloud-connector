/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */


/* global module */

var Node = Node || {};


/**
 * @class Node.Plugin
 * @classdesc
 * Base class for all Cloud Connector plugins.
 * Provides a framework for extending the Cloud Connector's functionality through
 * modular plugins that can handle custom protocols, authentication methods, or
 * integration with external services.
 *
 * Key features:
 * - **Instance management**: Tracks and manages plugin object instances
 * - **Message handling**: Processes commands for method invocation and object lifecycle
 * - **API key validation**: Ensures plugins use valid non-default API keys
 * - **Server lifecycle**: Handles cleanup when servers disconnect
 * - **Dynamic loading**: Supports loading plugin modules dynamically by name
 * - **Object serialization**: Manages object serialization/deserialization for remote calls
 *
 * @property {Node.CloudServer} parent - Parent CloudServer instance for logging and communication
 * @property {String} name - Plugin identifier name
 * @property {String} APIKey - API key for authentication (must not be default value)
 * @property {Object} instances - Map of plugin object instances indexed by instanceIndex
 * @param {Node.CloudServer} parent - Parent CloudServer instance for logging and communication
 * @param {Object} config - Plugin configuration object
 * @param {String} config.name - Plugin identifier name
 * @param {String} config.APIKey - API key for authentication (must not be default value)
 */
Node.Plugin = function (parent, config)
{
  this.parent = parent;
  //
  for (let k in config)
    this[k] = config[k];
  //
  if (this.APIKey === "00000000-0000-0000-0000-000000000000") {
    this.parent.log("WARNING", `The APIKey of plugin '${this.name}' is set to the default value and will be ignored`);
    this.APIKey = "";
  }
  //
  this.instances = {};
};


/**
 * Message type enumerations for plugin communication.
 * @enum {String}
 */
Node.Plugin.msgTypes = {
  /** Call a method on a plugin or plugin instance */
  callMethod: "cm",
  /** Destroy a plugin object instance */
  destroyObject: "do"
};


/**
 * Deserializes an object from its serialized representation.
 * Creates a new instance or retrieves an existing one from the instances map.
 * @private
 * @param {Object} obj - Serialized object
 * @param {String} obj.instanceIndex - Unique identifier for the instance
 * @param {String} obj._t - Type name used to instantiate the object from Node namespace
 * @returns {Object} Deserialized plugin object instance
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
 * Processes incoming messages for the plugin.
 * Handles method invocation and object lifecycle management.
 * @param {Object} msg - Message object
 * @param {String} msg.type - Message type from Node.Plugin.msgTypes
 * @param {Object|String} msg.obj - Target object or plugin name
 * @param {String} msg.cmd - Method name to invoke (for callMethod type)
 * @param {Array} msg.args - Arguments to pass to the method (for callMethod type)
 * @returns {Promise<*>} Result from method invocation for callMethod messages
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
 * Destroys a plugin object instance.
 * Removes the instance from the instances map to free memory.
 * @private
 * @param {Object} obj - Object to destroy
 * @param {String} obj.instanceIndex - Unique identifier of the instance to destroy
 */
Node.Plugin.prototype.destroyObject = async function (obj)
{
  delete this.instances[obj.instanceIndex];
};


/**
 * Handles server disconnection events.
 * Called when a remote server disconnects from the Cloud Connector.
 * Performs cleanup operations for the disconnected server.
 * @param {Node.Server} server - Server instance that disconnected
 */
Node.Plugin.prototype.onServerDisconnected = async function (server)
{
  // Close all opened files to that server
  await this.disconnect(server);
};


/**
 * Performs cleanup operations for a disconnected server.
 * Override in derived classes to implement specific cleanup logic.
 * Base implementation is empty as plugins may not require cleanup.
 * @param {Node.Server} server - Server instance that disconnected
 */
Node.Plugin.prototype.disconnect = async function (server)
{
};


// export module for node
module.exports = Node.Plugin;
