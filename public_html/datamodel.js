/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module */

var Node = Node || {};

/**
 * @class Definition of DataModel object
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.DataModel = function (parent, config)
{
  this.parent = parent;
  this.connections = {};
  //
  for (var k in config)
    this[k] = config[k];
};


Node.DataModel.commandTypes = {
  open: "open",
  close: "close",
  execute: "execute",
  begin: "begin",
  commit: "commit",
  rollback: "rollback",
  ping: "ping"
};


/**
 * Recived a message
 * @param {Object} msg
 * @param {Function} callback - for response
 */
Node.DataModel.prototype.onMessage = function (msg, callback)
{
  switch (msg.cmd) {
    case Node.DataModel.commandTypes.open:
      this.openConnection(msg, callback);
      break;
    case Node.DataModel.commandTypes.close:
      this.closeConnection(msg, callback);
      break;
    case Node.DataModel.commandTypes.execute:
      this.execute(msg, callback);
      break;
    case Node.DataModel.commandTypes.begin:
      this.beginTransaction(msg, callback);
      break;
    case Node.DataModel.commandTypes.commit:
      this.commitTransaction(msg, callback);
      break;
    case Node.DataModel.commandTypes.rollback:
      this.rollbackTransaction(msg, callback);
      break;
    case Node.DataModel.commandTypes.ping:
      this.ping(msg, callback);
      break;
    default:
      callback(null, new Error("Command '" + msg.type + "' not supported"));
      break;
  }
};


/**
 * Open the connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.openConnection = function (msg, callback)
{
  callback(null, new Error("openConnection not implemented"));
};


/**
 * Close the connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.closeConnection = function (msg, callback)
{
  callback(null, new Error("closeConnection not implemented"));
};


/**
 * Execute a command on the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.execute = function (msg, callback)
{
  callback(null, new Error("execute not implemented"));
};


/**
 * Begin a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.beginTransaction = function (msg, callback)
{
  callback(null, new Error("beginTransaction not implemented"));
};


/**
 * Commit a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.commitTransaction = function (msg, callback)
{
  callback(null, new Error("commitTransaction not implemented"));
};


/**
 * Rollback a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.rollbackTransaction = function (msg, callback)
{
  callback(null, new Error("rollbackTransaction not implemented"));
};


/**
 * Do nothing
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.ping = function (msg, callback)
{
  callback();
};


/**
 * Close all connections opened to a server
 * @param {Node.Server} server - server disconnected
 */
Node.DataModel.prototype.serverDisconnected = function (server)
{
  var pthis = this;
  var cids = Object.keys(this.connections);
  for (var i = 0; i < cids.length; i++) {
    if (this.connections[cids[i]].server === server) {
      this.closeConnection({cid: cids[i]}, function (result, error) {
        if (error)
          pthis.parent.log("ERROR", "Error closing connection of datamodel '"
                  + this.name + "': " + error);
      });
    }
  }
};


// Export module for node
module.exports = Node.DataModel;
