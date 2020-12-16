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
  //
  // Date, time and datetime -> string
  this.connectionOptions.dateStrings = true;
};

// Make Node.MySQL extend Node.DataModel
Node.MySQL.prototype = new Node.DataModel();


/**
 * Open the connection to the database
 * @param {Function} callback - function to be called at the end
 */
Node.MySQL.prototype._openConnection = function (callback)
{
  this.pool.getConnection(function (err, connection) {
    // Stop auto closure and return the connection from pool
    if (connection && connection.closeTimer) {
      clearTimeout(connection.closeTimer);
      delete connection.closeTimer;
    }
    //
    callback({conn: connection}, err);
  }.bind(this));
};


/**
 * Init the application pool
 * @param {Function} callback - function to be called at the end
 */
Node.MySQL.prototype._initPool = function (callback) {
  callback(new mysql.createPool(this.connectionOptions));
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
  conn.conn.query(msg.sql, msg.pars, function (error, result, md) {
    if (error)
      return callback(null, error);
    //
    let rs = {};
    rs.cols = [];
    rs.rows = [];
    //
    if (result) {
      // Serialize rows
      for (let i = 0; i < result.length; i++) {
        let row = [];
        rs.rows.push(row);
        //
        if (i === 0)
          rs.cols = Object.keys(result[i]);
        //
        for (let j = 0; j < rs.cols.length; j++)
          row.push(this.convertValue(result[i][rs.cols[j]], md[j]));
      }
      //
      // Serialize extra info
      rs.rowsAffected = result.affectedRows;
      rs.insertId = result.insertId;
    }
    callback(rs);
  }.bind(this));
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
