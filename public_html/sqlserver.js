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
 * @class Definition of SQLServer object
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.SQLServer = function (parent, config)
{
  Node.DataModel.call(this, parent, config);
};

// Make Node.SQLServer extend Node.DataModel
Node.SQLServer.prototype = new Node.DataModel();


/**
 * Open the connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype.openConnection = function (msg, callback)
{
  // Import global modules (could be missing)
  try {
    Node.mssql = require("mssql");
  }
  catch (ex) {
    callback(null, new Error("SQLServer driver not found.\nInstall \"mssql\" module and try again"));
    return;
  }
  //
  // Open connection
  var pthis = this;
  this.initPool(function (err) {
    if (err)
      callback(null, err);
    else {
      pthis.connections[msg.cid] = {server: msg.server};
      callback();
    }
  });
};


/**
 * Init the application pool
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype.initPool = function (callback) {
  if (this.pool)
    callback();
  else {
    this.pool = new Node.mssql.Connection(this.connectionOptions);
    this.pool.connect(callback);
  }
};


/**
 * Close the connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype.closeConnection = function (msg, callback)
{
  if (this.connections[msg.cid])
    delete this.connections[msg.cid];
  callback();
};


/**
 * Execute a command on the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype.execute = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  var sql = msg.sql;
  //
  // Detect type of command
  var command = "";
  if (sql.toLowerCase().indexOf("update ") !== -1)
    command = "update";
  else if (sql.toLowerCase().indexOf("delete ") !== -1)
    command = "delete";
  else if (sql.toLowerCase().indexOf("insert into ") !== -1)
    command = "insert";
  //
  // For INSERT, UPDATE and DELETE append another statement for info
  var req = new Node.mssql.Request(this.connections[msg.cid].transaction || this.pool);
  if (command) {
    req.multiple = true;
    sql += "; select @@rowcount as RowsAffected";
    if (command === "insert")
      sql += "; select @@identity as Counter";
  }
  //
  // Execute the statement
  var startTime = new Date();
  req.query(sql, function (error, result) {
    if (error)
      callback(null, error);
    else {
      var rs = {};
      rs.cols = [];
      rs.rows = [];
      rs.times = {qry: (new Date()).getTime() - startTime.getTime()};
      //
      if (result) {
        if (!command) {
          // Serialize rows
          for (var i = 0; i < result.length; i++) {
            var row = [];
            rs.rows.push(row);
            if (i === 0)
              rs.cols = Object.keys(result[0]);
            for (var j = 0; j < rs.cols.length; j++)
              row.push(result[i][rs.cols[j]]);
          }
        }
        else {
          // Serialize extra info
          for (var i = result.length - 1; i >= 0; i--) {
            if (!rs.hasOwnProperty("rowsAffected") && result[i][0].hasOwnProperty("RowsAffected"))
              rs.rowsAffected = result[i][0].RowsAffected;
            if (!rs.hasOwnProperty("insertId") && result[i][0].hasOwnProperty("Counter"))
              rs.insertId = result[i][0].Counter;
          }
        }
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
Node.SQLServer.prototype.beginTransaction = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  this.connections[msg.cid].transaction = new Node.mssql.Transaction(this.pool);
  this.connections[msg.cid].transaction.begin(function (error) {
    callback(null, error);
  });
};


/**
 * Commit a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype.commitTransaction = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  var pthis = this;
  this.connections[msg.cid].transaction.commit(function (error) {
    delete pthis.connections[msg.cid].transaction;
    callback(null, error);
  });
};


/**
 * Rollback a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype.rollbackTransaction = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  var pthis = this;
  this.connections[msg.cid].transaction.rollback(function (error) {
    delete pthis.connections[msg.cid].transaction;
    callback(null, error);
  });
};


// Export module for node
module.exports = Node.SQLServer;
