/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class PostgreSQL database connector implementation for the InDe platform
 * @classdesc Comprehensive PostgreSQL adapter that extends the base Database class with full support
 * for PostgreSQL's advanced features and optimizations. This connector provides enterprise-grade
 * database connectivity with robust error handling, connection pooling, and PostgreSQL-specific
 * SQL generation that leverages the database's unique capabilities.
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 * @extends Node.DataModel
 */
Node.Postgres = function (parent, config)
{
  this.moduleName = "pg";
  Node.DataModel.call(this, parent, config);
};

// Make Node.Postgres extend Node.DataModel
Node.Postgres.prototype = new Node.DataModel();



/**
 * Opens a connection to the PostgreSQL database
 * @private
 * @returns {Promise<Object>} Database connection object from the connection pool
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
 * Init the application pool
 */
Node.Postgres.prototype._initPool = async function ()
{
  return new pg.Pool(this.connectionOptions);
};


/**
 * Closes the current database connection and returns it to the pool
 * @private
 * @param {Object} conn
 * @returns {Promise<void>}
 */
Node.Postgres.prototype._closeConnection = async function (conn)
{
  conn.release();
};


/**
 * Close the connection pool
 */
Node.Postgres.prototype._closePool = async function ()
{
  await this.pool.end();
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
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
 * Begins a database transaction
 * @private
 * @param {Object} conn
 * @returns {Promise<void>}
 * @throws {Error} Transaction start errors
 */
Node.Postgres.prototype._beginTransaction = async function (conn)
{
  await conn.query("begin");
};


/**
 * Commits the current database transaction
 * @private
 * @param {Object} conn
 * @returns {Promise<void>}
 * @throws {Error} Transaction commit errors
 */
Node.Postgres.prototype._commitTransaction = async function (conn)
{
  await conn.query("commit");
};


/**
 * Rolls back the current database transaction
 * @private
 * @param {Object} conn
 * @returns {Promise<void>}
 * @throws {Error} Transaction rollback errors
 */
Node.Postgres.prototype._rollbackTransaction = async function (conn)
{
  await conn.query("rollback");
};


/**
 * Gets the PostgreSQL parameter placeholder name for prepared statements
 * @param {Number} index - Zero-based parameter index
 * @returns {String} Parameter placeholder (e.g., "$1", "$2")
 */
Node.Postgres.prototype.getParameterName = function (index)
{
  return `$${index + 1}`;
};


// Export module for node
module.exports = Node.Postgres;
