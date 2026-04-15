/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Node.MySQL
 * @classdesc
 * MySQL database connector implementation for the Cloud Connector.
 * Provides MySQL-specific database operations including connection management,
 * transaction handling, and query execution. Uses mysql2/promise driver for
 * async/await support and connection pooling.
 *
 * Key features:
 * - **Connection pooling**: Efficient connection management via mysql2
 * - **Transaction support**: Full ACID transaction support
 * - **Date handling**: Automatic conversion of dates to strings
 * - **Native async/await**: Uses mysql2/promise for modern async patterns
 * - **Prepared statements**: Support for parameterized queries
 *
 * @extends Node.DataModel
 * @param {Node.CloudServer} parent - Parent CloudServer instance
 * @param {Object} config - MySQL configuration
 * @param {String} config.name - Name of this datamodel instance
 * @param {String} config.APIKey - API key for authentication
 * @param {Object} config.connectionOptions - MySQL connection parameters
 * @param {String} config.connectionOptions.host - Database host
 * @param {Number} config.connectionOptions.port - Database port
 * @param {String} config.connectionOptions.database - Database name
 * @param {String} config.connectionOptions.user - Database user
 * @param {String} config.connectionOptions.password - Database password
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
 * Initializes the MySQL connection pool using mysql2/promise.
 * @private
 * @returns {Promise<Object>} MySQL connection pool instance
 */
Node.MySQL.prototype._initPool = async function ()
{
  return global["mysql2/promise"].createPool(this.connectionOptions);
};


/**
 * Closes the current database connection and returns it to the pool.
 * @private
 * @param {Object} conn - MySQL connection object to close
 */
Node.MySQL.prototype._closeConnection = async function (conn)
{
  conn.release();
};


/**
 * Closes the MySQL connection pool and releases all resources.
 * @private
 */
Node.MySQL.prototype._closePool = async function ()
{
  await this.pool.end();
};


/**
 * Executes a SQL command on the MySQL database.
 * Handles result set serialization and metadata extraction.
 * @private
 * @param {Object} conn - MySQL connection object
 * @param {Object} msg - Message containing SQL and parameters
 * @param {String} msg.sql - SQL statement to execute
 * @param {Array} [msg.pars] - Query parameters
 * @returns {Promise<Object>} Result set with cols, rows, rowsAffected, and insertId
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
 * Begins a database transaction on the MySQL connection.
 * @private
 * @param {Object} conn - MySQL connection object
 * @throws {Error} Transaction start errors
 */
Node.MySQL.prototype._beginTransaction = async function (conn)
{
  await conn.beginTransaction();
};


/**
 * Commits the current database transaction.
 * @private
 * @param {Object} conn - MySQL connection object
 * @throws {Error} Transaction commit errors
 */
Node.MySQL.prototype._commitTransaction = async function (conn)
{
  await conn.commit();
};


/**
 * Rolls back the current database transaction.
 * @private
 * @param {Object} conn - MySQL connection object
 * @throws {Error} Transaction rollback errors
 */
Node.MySQL.prototype._rollbackTransaction = async function (conn)
{
  await conn.rollback();
};


// Export module for node
module.exports = Node.MySQL;
