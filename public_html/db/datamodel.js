/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module, global, Buffer, Promise */

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
  for (let k in config)
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
 * Received a message
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
 * Load module
 */
Node.DataModel.prototype.loadModule = function ()
{
  try {
    if (!global[this.moduleName])
      global[this.moduleName] = require(this.moduleName);
    return true;
  }
  catch (ex) {
    return false;
  }
};


/**
 * Init the application pool
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.getPool = function (callback) {
  if (this.pool)
    return callback();
  //
  this._initPool(function (pool, error) {
    if (error)
      return callback(null, error);
    //
    this.pool = pool;
    callback();
  }.bind(this));
};


/**
 * Open the connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.openConnection = function (msg, callback)
{
  // Load module
  if (!this.loadModule())
    return callback(null, new Error(this.class + " driver not found.\nInstall \"" + this.moduleName + "\" module and try again"));
  //
  this.getPool(function (result, error) {
    if (error)
      return callback(null, error);
    //
    this._openConnection(function (result, error) {
      if (error)
        return callback(null, error);
      //
      this.connections[msg.cid] = result;
      result.server = msg.server;
      callback();
    }.bind(this));
  }.bind(this));
};


/**
 * Close the connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.closeConnection = function (msg, callback)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    return callback();
  //
  this._closeConnection(conn, function (result, error) {
    delete this.connections[msg.cid];
    callback(null, error);
  }.bind(this));
};


/**
 * Execute a command on the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.execute = function (msg, callback)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    return callback(null, new Error("Connection closed"));
  //
  // Deserialize some parameters
  if (msg.pars) {
    msg.pars.forEach(function (p, i) {
      if (p && typeof p === "object" && p.type === "buffer", p.data)
        msg.pars[i] = Buffer.from(p.data, "base64");
    });
  }
  //
  let startTime = new Date();
  this._execute(conn, msg, function (rs, error) {
    if (error)
      return callback(null, error);
    //
    rs.times = {qry: (new Date()).getTime() - startTime.getTime()};
    callback(rs);
  });
};


/**
 * Convert a value
 * @param {Object} value
 */
Node.DataModel.prototype.convertValue = function (value)
{
  if (value instanceof Buffer)
    return {type: "buffer", data: value.toString("base64")};
  return value;
};


/**
 * Begin a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.beginTransaction = function (msg, callback)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    return callback(null, new Error("Connection closed"));
  //
  this._beginTransaction(conn, function (tr, error) {
    if (error)
      return callback(null, error);
    //
    conn.transaction = tr;
    callback();
  });
};


/**
 * Commit a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.commitTransaction = function (msg, callback)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    return callback(null, new Error("Connection closed"));
  //
  this._commitTransaction(conn, function (error) {
    delete conn.transaction;
    callback(null, error);
  });
};


/**
 * Rollback a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.DataModel.prototype.rollbackTransaction = function (msg, callback)
{
  let conn = this.connections[msg.cid];
  if (!conn)
    return callback(null, new Error("Connection closed"));
  //
  this._rollbackTransaction(conn, function (error) {
    delete conn.transaction;
    callback(null, error);
  });
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
 * Notified when a server disconnects
 * @param {Node.Server} server - server disconnected
 */
Node.DataModel.prototype.onServerDisconnected = function (server)
{
  // Close all pending connections to that server
  this.disconnect(server).then();
};


/**
 * Close all connections
 * @param {Node.Server} server - server disconnected
 */
Node.DataModel.prototype.disconnect = async function (server)
{
  // Close all pending connections
  await Promise.all(Object.keys(this.connections).map(async function (cbid) {
    if (server && this.connections[cbid].server !== server)
      return;
    //
    await new Promise(function (resolve, reject) {
      this.closeConnection({cid: cbid}, function (result, error) {
        if (error)
          reject(new Error()`Error closing connection of datamodel ${this.name}': ${error}`);
        else
          resolve();
      }.bind(this));
    }.bind(this));
  }.bind(this)));
};


// Export module for node
module.exports = Node.DataModel;
