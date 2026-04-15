/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global pg */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Node.Postgres
 * @classdesc
 * PostgreSQL database connector implementation for the Cloud Connector.
 * Provides PostgreSQL-specific database operations with advanced features
 * like dollar-quoted parameters, custom type parsing, and efficient connection pooling.
 * Uses the pg driver for high-performance PostgreSQL access.
 *
 * Key features:
 * - **Connection pooling**: Efficient PostgreSQL connection management
 * - **Transaction support**: Full ACID transactions with explicit begin/commit/rollback
 * - **Type parsing**: Custom handling for dates, timestamps, and bigint values
 * - **Dollar parameters**: PostgreSQL-style $1, $2 parameter binding
 * - **Auto-increment support**: Handles SERIAL/BIGSERIAL counter fields
 *
 * @extends Node.DataModel
 * @param {Node.CloudServer} parent - Parent CloudServer instance
 * @param {Object} config - PostgreSQL configuration
 * @param {String} config.name - Name of this datamodel instance
 * @param {String} config.APIKey - API key for authentication
 * @param {Object} config.connectionOptions - PostgreSQL connection parameters
 * @param {String} config.connectionOptions.host - Database host
 * @param {Number} config.connectionOptions.port - Database port (default 5432)
 * @param {String} config.connectionOptions.database - Database name
 * @param {String} config.connectionOptions.user - Database user
 * @param {String} config.connectionOptions.password - Database password
 */
Node.Postgres = function (parent, config)
{
  this.moduleName = "pg";
  Node.DataModel.call(this, parent, config);
};

// Make Node.Postgres extend Node.DataModel
Node.Postgres.prototype = new Node.DataModel();


/**
 * Opens a connection to the PostgreSQL database from the connection pool.
 * Configures type parsers for proper handling of PostgreSQL data types.
 * @private
 * @returns {Promise<Object>} PostgreSQL connection object from the pool
 * @throws {Error} Connection errors from the PostgreSQL driver
 */
Node.Postgres.prototype._openConnection = async function ()
{
  // Bigserial and bigint -> integer
  pg.types.setTypeParser(pg.types.builtins.INT8, parseInt);
  //
  // Date, time and datetime -> string
  let parseDate = val => val;
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, parseDate);
  pg.types.setTypeParser(pg.types.builtins.DATE, parseDate);
  pg.types.setTypeParser(pg.types.builtins.TIME, parseDate);
  pg.types.setTypeParser(pg.types.builtins.TIMETZ, parseDate);
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, parseDate);
//  pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, parseDate);
  //
  return await this.pool.connect();
};


/**
 * Initializes the PostgreSQL connection pool using pg.Pool.
 * @private
 * @returns {Promise<Object>} PostgreSQL connection pool instance
 */
Node.Postgres.prototype._initPool = async function ()
{
  return new pg.Pool(this.connectionOptions);
};


/**
 * Closes the current database connection and returns it to the pool.
 * @private
 * @param {Object} conn - PostgreSQL connection object to close
 */
Node.Postgres.prototype._closeConnection = async function (conn)
{
  conn.release();
};


/**
 * Closes the PostgreSQL connection pool and releases all resources.
 * @private
 */
Node.Postgres.prototype._closePool = async function ()
{
  await this.pool.end();
};


/**
 * Executes a SQL command on the PostgreSQL database.
 * Handles result set serialization and extracts auto-increment values.
 * @private
 * @param {Object} conn - PostgreSQL connection object
 * @param {Object} msg - Message containing SQL and parameters
 * @param {String} msg.sql - SQL statement to execute
 * @param {Array} [msg.pars] - Query parameters
 * @returns {Promise<Object>} Result set with cols, rows, rowsAffected, and insertId
 */
Node.Postgres.prototype._execute = async function (conn, msg)
{
  // Execute the statement
  let result = await conn.query(msg.sql, msg.pars || []);
  //
  let rs = {
    cols: [],
    rows: []
  };
  //
  // Serialize rows
  for (let i = 0; i < result.rows.length; i++) {
    let row = [];
    rs.rows.push(row);
    for (let j = 0; j < result.fields.length; j++) {
      let colname = result.fields[j].name;
      if (i === 0)
        rs.cols.push(colname);
      row.push(this.convertValue(result.rows[i][colname], result.fields[j]));
    }
  }
  //
  // Serialize extra info
  if (["INSERT", "UPDATE", "DELETE"].includes(result.command)) {
    rs.rowsAffected = result.rowCount;
    if (result.command === "INSERT" && result.rows.length === 1 && result.rows[0].counter > 0)
      rs.insertId = result.rows[0].counter;
  }
  return rs;
};


/**
 * Begins a database transaction using PostgreSQL's BEGIN statement.
 * @private
 * @param {Object} conn - PostgreSQL connection object
 * @throws {Error} Transaction start errors
 */
Node.Postgres.prototype._beginTransaction = async function (conn)
{
  await conn.query("begin");
};


/**
 * Commits the current database transaction using PostgreSQL's COMMIT statement.
 * @private
 * @param {Object} conn - PostgreSQL connection object
 * @throws {Error} Transaction commit errors
 */
Node.Postgres.prototype._commitTransaction = async function (conn)
{
  await conn.query("commit");
};


/**
 * Rolls back the current database transaction using PostgreSQL's ROLLBACK statement.
 * @private
 * @param {Object} conn - PostgreSQL connection object
 * @throws {Error} Transaction rollback errors
 */
Node.Postgres.prototype._rollbackTransaction = async function (conn)
{
  await conn.query("rollback");
};


/**
 * Gets the PostgreSQL parameter placeholder name for prepared statements.
 * PostgreSQL uses dollar-numbered parameters ($1, $2, etc.).
 * @param {Number} index - Zero-based parameter index
 * @returns {String} Parameter placeholder (e.g., "$1", "$2")
 * @override
 */
Node.Postgres.prototype.getParameterName = function (index)
{
  return `$${index + 1}`;
};


// Export module for node
module.exports = Node.Postgres;
