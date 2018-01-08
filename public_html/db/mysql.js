/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module, mysql */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Definition of MySQL object
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.MySQL = function (parent, config)
{
  this.moduleName = "mysql";
  Node.DataModel.call(this, parent, config);
};

// Make Node.MySQL extend Node.DataModel
Node.MySQL.prototype = new Node.DataModel();


/**
 * Open the connection to the database
 * @param {Function} callback - function to be called at the end
 */
Node.MySQL.prototype._openConnection = function (callback)
{
  // Get connection pool
  this.pool = this.pool || new mysql.createPool(this.connectionOptions);
  //
  // Open connection
  this.pool.getConnection(function (err, connection) {
    // Stop auto closure and return the connection from pool
    if (connection.closeTimer) {
      clearTimeout(connection.closeTimer);
      delete connection.closeTimer;
    }
    //
    callback({conn: connection}, err);
  }.bind(this));
};


/**
 * Close the connection to the database
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.MySQL.prototype._closeConnection = function (conn, callback)
{
  conn.conn.release();
  //
  // Program closure of connection
  conn.conn.closeTimer = setTimeout(function () {
    conn.conn.destroy();
  }, 30000);
  //
  callback();
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.MySQL.prototype._execute = function (conn, msg, callback)
{
  conn.conn.query(msg.sql, msg.pars, function (error, result) {
    if (error)
      return callback(null, error);
    //
    var rs = {};
    rs.cols = [];
    rs.rows = [];
    //
    if (result) {
      // Serialize rows
      for (var i = 0; i < result.length; i++) {
        var row = [];
        rs.rows.push(row);
        var cols = Object.keys(result[i]);
        for (var j = 0; j < cols.length; j++) {
          if (i === 0)
            rs.cols.push(cols[j]);
          row.push(Node.MySQL.convertValue(result[i][cols[j]]));
        }
      }
      //
      // Serialize extra info
      rs.rowsAffected = result.affectedRows;
      rs.insertId = result.insertId;
    }
    callback(rs);
  });
};


/**
 * Convert a value
 * @param {Object} value
 * @param {Integer} datatype
 */
Node.MySQL.convertValue = function (value, datatype)
{
  if (value === null)
    return value;
  //
  if (datatype === "DateTime" || datatype === "TimeStamp") {

  }
  else if (datatype === "Date") {

  }
  //
  return Node.DataModel.convertValue(value);
};


/**
 * Begin a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.MySQL.prototype._beginTransaction = function (conn, callback)
{
  conn.conn.beginTransaction(function (error) {
    callback(null, error);
  });
};


/**
 * Commit a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.MySQL.prototype._commitTransaction = function (conn, callback)
{
  conn.conn.commit(callback);
};


/**
 * Rollback a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.MySQL.prototype._rollbackTransaction = function (conn, callback)
{
  conn.conn.rollback(callback);
};


// Export module for node
module.exports = Node.MySQL;
