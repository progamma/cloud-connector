/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Definition of Oracle object
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.Oracle = function (parent, config)
{
  Node.DataModel.call(this, parent, config);
};

// Make Node.Oracle extend Node.DataModel
Node.Oracle.prototype = new Node.DataModel();


/**
 * Open the connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype.openConnection = function (msg, callback)
{
  // Import global modules (could be missing)
  try {
    Node.oracledb = require("oracledb");
  }
  catch (ex) {
    callback(null, new Error("Oracle driver not found.\nInstall \"oracledb\" module and try again"));
    return;
  }
  //
  if (this.maxRows)
    Node.oracledb.maxRows = this.maxRows;
  //
  // Open connection
  var pthis = this;
  Node.oracledb.getConnection(this.connectionOptions, function (err, connection) {
    if (err)
      callback(null, err);
    else {
      pthis.connections[msg.cid] = {conn: connection, server: msg.server};
      callback();
    }
  });
};


/**
 * Close the connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype.closeConnection = function (msg, callback)
{
  if (this.connections[msg.cid]) {
    this.connections[msg.cid].conn.release(function (error) {
      callback(null, error);
    });
    delete this.connections[msg.cid];
  }
};


/**
 * Execute a command on the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype.execute = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  // Execute the statement
  var conn = this.connections[msg.cid];
  var params = {outFormat: Node.oracledb.OBJECT, autoCommit: !conn.transaction};
  var bind = {};
  if (msg.sql.toLowerCase().indexOf("insert into ") !== -1)
    bind.counter = {type: Node.oracledb.NUMBER, dir: Node.oracledb.BIND_OUT};
  //
  conn.conn.execute(msg.sql, bind, params, function (error, result) {
    if (error)
      callback(null, error);
    else {
      var rs = {};
      rs.cols = [];
      rs.rows = [];
      //
      if (result.rows) {
        // Serialize rows
        for (var i = 0; i < result.rows.length; i++) {
          var row = [];
          rs.rows.push(row);
          if (i === 0)
            rs.cols = Object.keys(result.rows[0]);
          for (var j = 0; j < rs.cols.length; j++)
            row.push(result.rows[i][rs.cols[j]]);
        }
      }
      //
      // Serialize extra info
      if (result) {
        rs.rowsAffected = result.rowsAffected;
        rs.insertId = (result.outBinds ? result.outBinds.counter : null);
      }
      callback(rs);
    }
  });
};


/**
 * Begin a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype.beginTransaction = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  this.connections[msg.cid].transaction = true;
  callback();
};


/**
 * Commit a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype.commitTransaction = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  var pthis = this;
  this.connections[msg.cid].conn.commit(function (error) {
    delete pthis.connections[msg.cid].transaction;
    callback(null, error);
  });
};


/**
 * Rollback a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype.rollbackTransaction = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  var pthis = this;
  this.connections[msg.cid].conn.rollback(function (error) {
    delete pthis.connections[msg.cid].transaction;
    callback(null, error);
  });
};


// Export module for node
module.exports = Node.Oracle;
