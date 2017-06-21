/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module, mssql */

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
  this.moduleName = "mssql";
  Node.DataModel.call(this, parent, config);
};

// Make Node.SQLServer extend Node.DataModel
Node.SQLServer.prototype = new Node.DataModel();


/**
 * Open the connection to the database
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._openConnection = function (callback)
{
  this.initPool(function (err) {
    return callback({}, err);
  });
};


/**
 * Init the application pool
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype.initPool = function (callback) {
  if (this.pool)
    return callback();
  //
  this.pool = new mssql.Connection(this.connectionOptions);
  this.pool.connect(callback);
};


/**
 * Close the connection to the database
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._closeConnection = function (conn, callback)
{
  callback();
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._execute = function (conn, msg, callback)
{
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
  var req = new mssql.Request(conn.transaction || this.pool);
  if (command) {
    req.multiple = true;
    sql += "; select @@rowcount as RowsAffected";
    if (command === "insert")
      sql += "; select @@identity as Counter";
  }
  //
  // Execute the statement
  req.query(sql, function (error, result) {
    if (error)
      return callback(null, error);
    //
    var rs = {};
    rs.cols = [];
    rs.rows = [];
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
  });
};


/**
 * Begin a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._beginTransaction = function (conn, callback)
{
  var tr = new mssql.Transaction(this.pool);
  tr.begin(function (error) {
    callback(tr, error);
  });
};


/**
 * Commit a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._commitTransaction = function (conn, callback)
{
  conn.transaction.commit(callback);
};


/**
 * Rollback a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._rollbackTransaction = function (conn, callback)
{
  conn.transaction.rollback(callback);
};


// Export module for node
module.exports = Node.SQLServer;
