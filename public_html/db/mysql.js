/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class MySQL database connector implementation
 * @classdesc Provides MySQL-specific database operations including connection management,
 * transaction handling, schema operations, and SQL generation. Extends the base Database
 * class with MySQL-specific features like JSON support, custom data type handling, and
 * MySQL-specific SQL syntax.
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 * @extends Node.DataModel
 */
Node.MySQL = function (parent, config)
{
  this.moduleName = "mysql2/promise";
  Node.DataModel.call(this, parent, config);
  //
  // Date, time and datetime -> string
  this.connectionOptions.dateStrings = true;
};

// Make Node.MySQL extend Node.DataModel
Node.MySQL.prototype = new Node.DataModel();


/**
 * Opens a connection to the MySQL database from the connection pool
 * @private
 * @returns {Promise<Object>} Database connection object from the pool
 * @throws {Error} Connection errors from the MySQL driver
 */
Node.MySQL.prototype._openConnection = async function ()
{
  return await this.pool.getConnection();
};


/**
 * Init the application pool
 */
Node.MySQL.prototype._initPool = async function ()
{
  return global["mysql2/promise"].createPool(this.connectionOptions);
};


/**
 * Closes the current database connection and returns it to the pool
 * Handles connection release errors by destroying the connection if needed
 * @private
 * @returns {Promise<void>}
 */
Node.MySQL.prototype._closeConnection = async function (conn)
{
  conn.release();
};


/**
 * Close the connection pool
 */
Node.MySQL.prototype._closePool = async function ()
{
  await this.pool.end();
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
 */
Node.MySQL.prototype._execute = async function (conn, msg)
{
  let [result, fields] = await conn.query(msg.sql, msg.pars);
  //
  let rs = {
    cols: [],
    rows: []
  };
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
        row.push(this.convertValue(result[i][rs.cols[j]], fields[j]));
    }
    //
    // Serialize extra info
    rs.rowsAffected = result.affectedRows;
    rs.insertId = result.insertId;
  }
  //
  return rs;
};


/**
 * Begins a database transaction
 * @private
 * @param {Object} conn
 * @returns {Promise<void>}
 * @throws {Error} Transaction start errors
 */
Node.MySQL.prototype._beginTransaction = async function (conn)
{
  await conn.beginTransaction();
};


/**
 * Commits the current database transaction
 * @private
 * @param {Object} conn
 * @returns {Promise<void>}
 * @throws {Error} Transaction commit errors
 */
Node.MySQL.prototype._commitTransaction = async function (conn)
{
  await conn.commit();
};


/**
 * Rolls back the current database transaction
 * @private
 * @param {Object} conn
 * @returns {Promise<void>}
 * @throws {Error} Transaction rollback errors
 */
Node.MySQL.prototype._rollbackTransaction = async function (conn)
{
  await conn.rollback();
};


// Export module for node
module.exports = Node.MySQL;
