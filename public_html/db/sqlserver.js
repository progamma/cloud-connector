/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global module, mssql */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Node.SQLServer
 * @classdesc
 * SQL Server database connector implementation for the Cloud Connector.
 * Provides Microsoft SQL Server-specific database operations including connection pooling,
 * transaction handling, and advanced SQL Server features. Uses the mssql driver
 * for reliable SQL Server connectivity.
 *
 * Key features:
 * - **Connection pooling**: Efficient SQL Server connection management
 * - **Transaction support**: Full ACID transactions with explicit control
 * - **Date handling**: Local timezone support with multiple date/time types
 * - **Named parameters**: SQL Server-style @P1, @P2 parameter binding
 * - **Identity support**: Automatic SCOPE_IDENTITY() retrieval for inserts
 * - **Multiple result sets**: Support for batch operations
 *
 * @extends Node.DataModel
 * @param {Node.CloudServer} parent - Parent CloudServer instance
 * @param {Object} config - SQL Server configuration
 * @param {String} config.name - Name of this datamodel instance
 * @param {String} config.APIKey - API key for authentication
 * @param {Object} config.connectionOptions - SQL Server connection parameters
 * @param {String} config.connectionOptions.server - Database server hostname
 * @param {Number} [config.connectionOptions.port] - Database port (default 1433)
 * @param {String} config.connectionOptions.database - Database name
 * @param {String} config.connectionOptions.user - Database user
 * @param {String} config.connectionOptions.password - Database password
 */
Node.SQLServer = function (parent, config)
{
  this.moduleName = "mssql";
  Node.DataModel.call(this, parent, config);
  //
  // Date parsed with local timezone
  this.connectionOptions.options = this.connectionOptions.options || {};
  this.connectionOptions.options.useUTC = false;
};

// Make Node.SQLServer extend Node.DataModel
Node.SQLServer.prototype = new Node.DataModel();


/**
 * Opens a connection to the SQL Server database.
 * Connects the pool if not already connected and returns an empty connection object.
 * @private
 * @returns {Promise<Object>} Empty connection object (pool manages connections internally)
 */
Node.SQLServer.prototype._openConnection = async function ()
{
  await this.pool.connect();
  return {};
};


/**
 * Initializes the SQL Server connection pool.
 * Sets up error handler to clean up pool on connection errors.
 * @private
 * @returns {Promise<Object>} SQL Server connection pool instance
 */
Node.SQLServer.prototype._initPool = async function ()
{
  let pool = new mssql.ConnectionPool(this.connectionOptions);
  //
  pool.on("error", () => delete this.pool);
  //
  return pool;
};


/**
 * Closes the connection to the SQL Server database.
 * SQL Server pool manages connections internally, so this is a no-op.
 * @private
 * @param {Object} conn - Connection object (not used)
 */
Node.SQLServer.prototype._closeConnection = async function (conn)
{
};


/**
 * Closes the SQL Server connection pool and releases all resources.
 * @private
 */
Node.SQLServer.prototype._closePool = async function ()
{
  await this.pool.close();
};


/**
 * Executes a SQL command on the SQL Server database.
 * Automatically adds SCOPE_IDENTITY() for INSERT statements to retrieve identity values.
 * @private
 * @param {Object} conn - Connection object with optional transaction
 * @param {Object} msg - Message containing SQL and parameters
 * @param {String} msg.sql - SQL statement to execute
 * @param {Array} [msg.pars] - Query parameters
 * @returns {Promise<Object>} Result set with cols, rows, rowsAffected, and insertId
 */
Node.SQLServer.prototype._execute = async function (conn, msg)
{
  let sql = msg.sql;
  //
  let req = new mssql.Request(conn.transaction || this.pool);
  if (sql.toLowerCase().includes("insert into ")) {
    req.multiple = true;
    sql += "; select SCOPE_IDENTITY() as Counter";
  }
  //
  // Add input parameters
  let parameters = msg.pars || [];
  for (let i = 0; i < parameters.length; i++)
    req.input("P" + (i + 1), parameters[i]);
  //
  // Execute the statement
  let result = await req.query(sql);
  //
  let rs = {};
  if (result.recordset && !req.multiple) {
    // Serialize rows
    rs.cols = Object.keys(result.recordset.columns);
    rs.rows = [];
    for (let i = 0; i < result.recordset.length; i++) {
      let row = [];
      rs.rows.push(row);
      for (let j = 0; j < rs.cols.length; j++)
        row.push(this.convertValue(result.recordset[i][rs.cols[j]], result.recordset.columns[rs.cols[j]]));
    }
  }
  else {
    // Serialize extra info
    rs.rowsAffected = result.rowsAffected[0];
    if (result.recordset)
      rs.insertId = result.recordset && result.recordsets[0][0].Counter;
  }
  //
  return rs;
};


/**
 * Converts SQL Server-specific data types to JavaScript values.
 * Handles various date/time formats based on SQL Server column types.
 * @param {*} value - Raw value from SQL Server database
 * @param {Object} colDef - Column definition with type information
 * @returns {*} Converted JavaScript value
 * @override
 */
Node.SQLServer.prototype.convertValue = function (value, colDef)
{
  if (value instanceof Date) {
    switch (colDef.type) {
      case mssql.DATE:
      {
        let v = value.getFullYear() + "-";
        v += (value.getMonth() + 1).toString().padStart(2, "0") + "-";
        v += value.getDate().toString().padStart(2, "0");
        return v;
      }

      case mssql.TIME:
      {
        let v = value.getHours().toString().padStart(2, "0") + ":";
        v += value.getMinutes().toString().padStart(2, "0") + ":";
        v += value.getSeconds().toString().padStart(2, "0") + ".";
        v += value.getMilliseconds().toString().padStart(3, "0");
        return v;
      }

      case mssql.DATETIME:
      case mssql.DATETIME2:
      case mssql.SMALLDATETIME:
      {
        let v = value.getFullYear() + "-";
        v += (value.getMonth() + 1).toString().padStart(2, "0") + "-";
        v += value.getDate().toString().padStart(2, "0") + " ";
        v += value.getHours().toString().padStart(2, "0") + ":";
        v += value.getMinutes().toString().padStart(2, "0") + ":";
        v += value.getSeconds().toString().padStart(2, "0") + ".";
        v += value.getMilliseconds().toString().padStart(3, "0");
        return v;
      }

      case mssql.DATETIMEOFFSET:
        return value.toISOString();
    }
  }
  //
  return Node.DataModel.prototype.convertValue.call(this, value);
};


/**
 * Begins a new database transaction.
 * Sets up rollback event handler to warn if transaction is aborted unexpectedly.
 * @private
 * @param {Object} conn - Connection object
 * @returns {Promise<Object>} SQL Server transaction object
 */
Node.SQLServer.prototype._beginTransaction = async function (conn)
{
  let tr = new mssql.Transaction(this.pool);
  await tr.begin();
  //
  this.onRollback = () => this.parent.log("WARNING", `transaction on ${this.name} aborted unexpectedly`);
  tr.on("rollback", this.onRollback);
  //
  return tr;
};


/**
 * Commits the current database transaction.
 * @private
 * @param {Object} conn - Connection object with active transaction
 */
Node.SQLServer.prototype._commitTransaction = async function (conn)
{
  await conn.transaction.commit();
};


/**
 * Rolls back the current database transaction.
 * Removes the rollback event handler before executing the rollback.
 * @private
 * @param {Object} conn - Connection object with active transaction
 */
Node.SQLServer.prototype._rollbackTransaction = async function (conn)
{
  conn.transaction.off("rollback", this.onRollback);
  await conn.transaction.rollback();
};


/**
 * Gets the SQL Server parameter placeholder name for prepared statements.
 * SQL Server uses at-sign prefixed named parameters (@P1, @P2, etc.).
 * @param {Number} index - Zero-based parameter index
 * @returns {String} Parameter placeholder (e.g., "@P1", "@P2")
 * @override
 */
Node.SQLServer.prototype.getParameterName = function (index)
{
  return `@P${index + 1}`;
};


// Export module for node
module.exports = Node.SQLServer;
