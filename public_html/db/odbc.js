/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global odbc */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Node.ODBC
 * @classdesc
 * ODBC database connector implementation for the Cloud Connector.
 * Provides database connectivity through ODBC (Open Database Connectivity) drivers,
 * supporting various database systems including MS Access, SQL Server, Oracle, MySQL,
 * and any ODBC-compliant database.
 *
 * Key features:
 * - **Universal connectivity**: Works with any ODBC-compliant database
 * - **Connection pooling**: Efficient connection management
 * - **Transaction support**: Full ACID transactions (when supported by driver)
 * - **Parametric queries**: Safe parameter binding (with fallback for unsupported drivers)
 * - **Schema introspection**: Metadata operations for tables, columns, keys
 * - **Driver compatibility**: Automatic detection of driver capabilities
 *
 * @extends Node.DataModel
 * @param {Node.CloudServer} parent - Parent CloudServer instance
 * @param {Object} config - ODBC configuration
 * @param {String} config.name - Name of this datamodel instance
 * @param {String} config.APIKey - API key for authentication
 * @param {Object} config.connectionOptions - ODBC connection parameters
 * @param {String} config.connectionOptions.connectionString - ODBC connection string
 */
Node.ODBC = function (parent, config)
{
  this.moduleName = "odbc";
  Node.DataModel.call(this, parent, config);
};

// Make Node.ODBC extend Node.DataModel
Node.ODBC.prototype = new Node.DataModel();


/**
 * Opens a connection to the database from the connection pool
 * Extracts and throws ODBC-specific error messages when connection fails.
 * @private
 * @returns {Promise<Object>} ODBC connection object
 */
Node.ODBC.prototype._openConnection = async function ()
{
  try {
    return await this.pool.connect();
  }
  catch (e) {
    if (e.odbcErrors?.[0])
      throw new Error(e.odbcErrors?.[0].message);
    else
      throw e;
  }
};


/**
 * Initializes the ODBC connection pool.
 * @private
 * @returns {Promise<Object>} ODBC connection pool instance
 */
Node.ODBC.prototype._initPool = async function ()
{
  return new odbc.pool(this.connectionOptions);
};


/**
 * Closes the current database connection and returns it to the pool.
 * The connection is not destroyed but returned to the pool for reuse.
 * @private
 * @param {Object} conn - ODBC connection object
 */
Node.ODBC.prototype._closeConnection = async function (conn)
{
  await conn.close();
};


/**
 * Closes the ODBC connection pool and releases all resources.
 * @private
 */
Node.ODBC.prototype._closePool = async function ()
{
  await this.pool.close();
};


/**
 * Executes a SQL command on the ODBC database.
 * Automatically detects driver support for parametric queries and falls back to
 * manual parameter binding if not supported.
 * @private
 * @param {Object} conn - ODBC connection object
 * @param {Object} msg - Message containing SQL and parameters
 * @param {String} msg.sql - SQL statement to execute
 * @param {Array} [msg.pars] - Query parameters
 * @returns {Promise<Object>} Result set with cols, rows, rowsAffected, and insertId
 */
Node.ODBC.prototype._execute = async function (conn, msg)
{
  let {sql, pars} = msg;
  //
  // Check if parametric queries are supported
  if (pars?.length > 0 && !(await this.isQueryParametricSupported(conn))) {
    // If not supported, directly bind parameters
    sql = this.bindParameters(sql, pars);
    pars = [];
  }
  //
  let result = await conn.query(sql, pars);
  //
  let rs = {
    cols: [],
    rows: []
  };
  //
  // Serialize rows
  for (let i = 0; i < result.length; i++) {
    let row = [];
    rs.rows.push(row);
    for (let j = 0; j < result.columns.length; j++) {
      let colname = result.columns[j].name;
      if (i === 0)
        rs.cols.push(colname);
      row.push(this.convertValue(result[i][colname], result.columns[j]));
    }
  }
  //
  // Serialize extra info
  rs.rowsAffected = result.count;
  rs.insertId = result.insertId; // ODBC does not always return insertId
  //
  return rs;
};


/**
 * Checks if the ODBC driver supports parametric queries.
 * Tests driver capability on first call and caches the result.
 * @param {Object} conn - ODBC connection object
 * @returns {Promise<Boolean>} True if parametric queries are supported, false otherwise
 */
Node.ODBC.prototype.isQueryParametricSupported = async function (conn)
{
  // If not yet tested, check the pool for support
  if (this.pool.isQueryParametricSupported === undefined) {
    try {
      // Try a simple query to check if parametric queries are supported
      // This will throw an error if not supported
      await conn.query("SELECT ?", [1]);
    }
    catch (e) {
      let sqlState = e.odbcErrors?.[0]?.state;
      let msg = (e.odbcErrors?.[0]?.message || e.message || "").toLowerCase();
      //
      // Detect specific errors for unsupported parametric queries
      this.pool.isQueryParametricSupported = !(sqlState === "HYC00" ||
        sqlState === "0A000" || // feature not supported (standard SQL)
        sqlState === "HY092" || // invalid attribute/option identifier
        sqlState === "07009" || // invalid descriptor index
        sqlState === "IM001" || // driver does not support this function (Access/ODBC)
        /driver.*non.*supporta.*questa.*funzione/.test(msg) || // Access Italian
        /driver.*does.*not.*support.*this.*function/.test(msg) || // Access English
        /parameter.*not.*support(ed)?/.test(msg) ||  // parameters not supported
        /parametr.*non.*supportat/.test(msg) ||      // Italian: parameters not supported
        /placeholder.*not.*support(ed)?/.test(msg) || // placeholders not supported
        /segnaposto.*non.*supportat/.test(msg) ||    // Italian: placeholders not supported
        /\?.*not.*support(ed)?/.test(msg) ||         // ? markers not supported
        /bind.*parameter.*not.*support(ed)?/.test(msg) || // bind parameters not supported
        /dynamic.*parameter.*not.*support(ed)?/.test(msg)); // dynamic parameters not supported
    }
  }
  //
  return this.pool.isQueryParametricSupported;
};


/**
 * Checks if the ODBC driver supports transactions.
 * Analyzes error codes to determine driver capabilities and caches the result.
 * @param {Object} [err] - Error object from transaction attempt
 * @returns {Boolean} True if transactions are supported, false otherwise
 */
Node.ODBC.prototype.isTransactionSupported = function(err)
{
  if (this.pool.isTransactionSupported === undefined) {
    let sqlState = err.odbcErrors?.[0]?.state;
    let msg = (err.odbcErrors?.[0]?.message || err.message || "").toLowerCase();
    //
    this.pool.isTransactionSupported = !(sqlState === "HYC00" ||
      sqlState === "0A000" || // feature not supported (standard SQL)
      /transazion.*non.*supportata/.test(msg) ||  // italiano
      /not support(ed)?/.test(msg)); // generico inglese fallback
  }
  //
  return this.pool.isTransactionSupported;
};


/**
 * Begins a database transaction on the ODBC connection.
 * If the ODBC driver doesn't support transactions, logs a warning instead of throwing an error.
 * @private
 * @param {Object} conn - ODBC connection object
 */
Node.ODBC.prototype._beginTransaction = async function (conn)
{
  try {
    await conn.beginTransaction();
  }
  catch (e) {
    // If the driver doesn't support transactions, just log a warning
    if (!this.isTransactionSupported(e))
      this.parent.log("WARNING", `Transaction not supported by this ODBC driver: ${e.odbcErrors?.[0]?.message || e.message}`);
    else
      throw e; // Re-throw if it's a different error
  }
};


/**
 * Commits the current database transaction.
 * Only commits if the ODBC driver supports transactions.
 * @private
 * @param {Object} conn - ODBC connection object
 */
Node.ODBC.prototype._commitTransaction = async function (conn)
{
  if (this.isTransactionSupported())
    await conn.commit();
};


/**
 * Rolls back the current database transaction.
 * Only rolls back if the ODBC driver supports transactions.
 * @private
 * @param {Object} conn - ODBC connection object
 */
Node.ODBC.prototype._rollbackTransaction = async function (conn)
{
  if (this.isTransactionSupported())
    await conn.rollback();
};


/**
 * Lists all tables in the database using ODBC metadata functions.
 * @private
 * @param {Object} conn - ODBC connection object
 * @param {Object} options - Query options
 * @param {String} [options.filter] - Table name filter pattern
 * @param {String} [options.type] - Table type filter (TABLE, VIEW, etc.)
 * @returns {Promise<Array>} Array of table metadata objects
 */ 
Node.ODBC.prototype._listTables = async function (conn, options)
{
  return await conn.tables(null, null, options.filter, options.type?.toUpperCase());
};


/**
 * Retrieves list of primary key columns for a specific table.
 * @private
 * @param {Object} conn - ODBC connection object
 * @param {Object} options - Query options
 * @param {String} options.table - Table name to get primary keys for
 * @returns {Promise<Array>} Array of primary key column metadata
 */
Node.ODBC.prototype._listTablePrimaryKeys = async function (conn, options)
{
  return await conn.primaryKeys(null, null, options.table);
};


/**
 * Retrieves detailed column information for a specific table.
 * @private
 * @param {Object} conn - ODBC connection object
 * @param {Object} options - Query options
 * @param {String} options.table - Table name to get column information for
 * @returns {Promise<Array>} Array of column metadata with name, type, nullable, etc.
 */
Node.ODBC.prototype._listTableColumns = async function (conn, options)
{
  return await conn.columns(null, null, options.table, null);
};


/**
 * Retrieves list of foreign key constraints for a specific table.
 * @private
 * @param {Object} conn - ODBC connection object
 * @param {Object} options - Query options
 * @param {String} options.table - Table name to get foreign keys for
 * @returns {Promise<Array>} Array of foreign key constraint metadata
 */
Node.ODBC.prototype._listTableForeignKeys = async function (conn, options)
{
  return await conn.foreignKeys(null, null, null, null, null, options.table);
};


// Export module for node
module.exports = Node.ODBC;
