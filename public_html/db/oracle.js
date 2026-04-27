/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global oracledb */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Node.Oracle
 * @classdesc
 * Oracle database connector implementation for the Cloud Connector.
 * Provides Oracle-specific database operations including connection pooling,
 * transaction handling, and advanced Oracle features. Uses the oracledb driver
 * for high-performance Oracle Database access.
 *
 * Key features:
 * - **Connection pooling**: Efficient Oracle connection management
 * - **Transaction support**: Full ACID transactions with implicit begin
 * - **LOB handling**: Automatic BLOB/CLOB processing
 * - **Date handling**: Smart timezone and DST adjustments
 * - **Named parameters**: Oracle-style :P1, :P2 parameter binding
 * - **Extended metadata**: Rich column metadata support
 *
 * @extends Node.DataModel
 * @param {Node.CloudServer} parent - Parent CloudServer instance
 * @param {Object} config - Oracle configuration
 * @param {String} config.name - Name of this datamodel instance
 * @param {String} config.APIKey - API key for authentication
 * @param {Object} config.connectionOptions - Oracle connection parameters
 * @param {String} config.connectionOptions.user - Database user
 * @param {String} config.connectionOptions.password - Database password
 * @param {String} config.connectionOptions.connectString - TNS connect string or Easy Connect
 * @param {Number} [config.maxRows] - Maximum rows to fetch per query
 */
Node.Oracle = function (parent, config)
{
  this.moduleName = "oracledb";
  Node.DataModel.call(this, parent, config);
};

// Make Node.Oracle extend Node.DataModel
Node.Oracle.prototype = new Node.DataModel();


/**
 * Loads and configures the Oracle database module.
 * Sets up Oracle-specific options like BLOB/CLOB fetching and metadata handling.
 * @returns {Boolean} True if module loaded successfully, false otherwise
 * @override
 */
Node.Oracle.prototype.loadModule = function ()
{
  if (!Node.DataModel.prototype.loadModule.call(this))
    return false;
  //
  // Blob -> buffer
  oracledb.fetchAsBuffer = [oracledb.BLOB];
  //
  // Date, time and datetime -> string
  oracledb.fetchAsString = [oracledb.CLOB];
  oracledb.extendedMetaData = true;
  //
  if (this.maxRows)
    oracledb.maxRows = this.maxRows;
  //
  return true;
};


/**
 * Opens a connection to the Oracle database from the connection pool.
 * @private
 * @returns {Promise<Object>} Oracle database connection object
 */
Node.Oracle.prototype._openConnection = async function ()
{
  return await this.pool.getConnection();
};


/**
 * Initializes the Oracle connection pool using oracledb.
 * On first pool creation, if the ORACLE_INSTANT_CLIENT_DIR environment variable is set,
 * enables node-oracledb Thick mode to support Oracle servers older than 12.1.
 * @private
 * @returns {Promise<Object>} Oracle connection pool instance
 */
Node.Oracle.prototype._initPool = async function ()
{
  // Enable Thick mode before the first pool is created, if requested via env var.
  // initOracleClient is process-wide and must be called once before any createPool/getConnection.
  if (!Node.Oracle.thickInitialized && process.env.ORACLE_INSTANT_CLIENT_DIR) {
    try {
      oracledb.initOracleClient({libDir: process.env.ORACLE_INSTANT_CLIENT_DIR});
    }
    catch (e) {
      throw new Error(`Oracle Thick mode initialization failed: ${e.message}. Verify that ORACLE_INSTANT_CLIENT_DIR points to a valid Oracle Instant Client installation matching the Node.js architecture.`, {cause: e});
    }
    Node.Oracle.thickInitialized = true;
  }
  //
  try {
    return await oracledb.createPool(this.connectionOptions);
  }
  catch (e) {
    if (e.message?.includes("NJS-138"))
      throw new Error("The Oracle server version is older than 12.1 and is not supported in node-oracledb Thin mode. Install Oracle Instant Client on the IDS server and set the ORACLE_INSTANT_CLIENT_DIR environment variable to the client directory path to enable Thick mode.", {cause: e});
    throw e;
  }
};


/**
 * Closes the current database connection and returns it to the pool.
 * @private
 * @param {Object} conn - Oracle connection object to close
 */
Node.Oracle.prototype._closeConnection = async function (conn)
{
  await conn.close();
};


/**
 * Closes the Oracle connection pool and releases all resources.
 * @private
 */
Node.Oracle.prototype._closePool = async function ()
{
  await this.pool.close();
};


/**
 * Executes a SQL command on the Oracle database.
 * Handles bind parameters, output parameters for counter fields, and auto-commit.
 * @private
 * @param {Object} conn - Oracle connection object
 * @param {Object} msg - Message containing SQL and parameters
 * @param {String} msg.sql - SQL statement to execute
 * @param {Array} [msg.pars] - Query parameters
 * @param {Boolean} [msg.ct] - Whether to return counter field value
 * @returns {Promise<Object>} Result set with cols, rows, rowsAffected, and insertId
 */
Node.Oracle.prototype._execute = async function (conn, msg)
{
  // Execute the statement
  let options = {outFormat: oracledb.OBJECT, autoCommit: !conn.transaction};
  let bindParams = {};
  //
  // Set output parameter for read value of counter field
  if (msg.ct)
    bindParams.counter = {type: oracledb.NUMBER, dir: oracledb.BIND_OUT};
  //
  // Add input parameters
  let parameters = msg.pars || [];
  for (let i = 0; i < parameters.length; i++)
    bindParams["P" + (i + 1)] = parameters[i];
  //
  let result = await conn.execute(msg.sql, bindParams, options);
  //
  let rs = {
    cols: [],
    rows: []
  };
  //
  if (result.rows) {
    // Serialize rows
    for (let i = 0; i < result.rows.length; i++) {
      let row = [];
      rs.rows.push(row);
      for (let j = 0; j < result.metaData.length; j++) {
        let colname = result.metaData[j].name;
        if (i === 0)
          rs.cols.push(colname);
        //
        row.push(this.convertValue(result.rows[i][colname], result.metaData[j]));
      }
    }
  }
  //
  // Serialize extra info
  if (result) {
    rs.rowsAffected = result.rowsAffected;
    rs.insertId = (result.outBinds ? result.outBinds.counter : null);
  }
  //
  return rs;
};


/**
 * Converts Oracle-specific data types to JavaScript values.
 * Handles special date/time conversions with DST adjustments.
 * @param {*} value - Raw value from Oracle database
 * @param {Object} colDef - Column definition with type information
 * @returns {*} Converted JavaScript value
 * @override
 */
Node.Oracle.prototype.convertValue = function (value, colDef)
{
  if (value instanceof Date) {
    switch (colDef.dbType) {
      case oracledb.DB_TYPE_DATE: {
        // Some adjustments for daylight savings time
        Node.Utils = require("../utils");
        let stdTimezoneOffset = Node.Utils.stdTimezoneOffset();
        if (!Node.Utils.isDstObserved(value))
          value = new Date(value.getTime() - (stdTimezoneOffset * 60000));
        if (!Node.Utils.isDstObserved(new Date()))
          value = new Date(value.getTime() + (stdTimezoneOffset * 60000));
        //
        let v = value.getFullYear() + "-";
        v += (value.getMonth() + 1).toString().padStart(2, "0") + "-";
        v += value.getDate().toString().padStart(2, "0") + " ";
        v += value.getHours().toString().padStart(2, "0") + ":";
        v += value.getMinutes().toString().padStart(2, "0") + ":";
        v += value.getSeconds().toString().padStart(2, "0") + ".";
        v += value.getMilliseconds().toString().padStart(3, "0");
        if (v.startsWith("1970-01-01 "))
          return v.substring(11);
        else if (v.endsWith("00:00:00.000"))
          return v.substring(0, 10);
        else
          return v;
      }

      case oracledb.DB_TYPE_TIMESTAMP_TZ:
        return value.toISOString();
    }
  }
  //
  return Node.DataModel.prototype.convertValue.call(this, value);
};


/**
 * Begins a database transaction.
 * Oracle transactions are implicit, so this is a no-op.
 * @private
 * @param {Object} conn - Oracle connection object
 */
Node.Oracle.prototype._beginTransaction = async function (conn)
{
};


/**
 * Commits the current database transaction.
 * @private
 * @param {Object} conn - Oracle connection object
 * @throws {Error} Transaction commit errors
 */
Node.Oracle.prototype._commitTransaction = async function (conn)
{
  await conn.commit();
};


/**
 * Rolls back the current database transaction.
 * @private
 * @param {Object} conn - Oracle connection object
 * @throws {Error} Transaction rollback errors
 */
Node.Oracle.prototype._rollbackTransaction = async function (conn)
{
  await conn.rollback();
};


/**
 * Gets the Oracle parameter placeholder name for prepared statements.
 * Oracle uses named parameters with colon prefix.
 * @param {Number} index - Zero-based parameter index
 * @returns {String} Parameter placeholder (e.g., ":P1", ":P2")
 * @override
 */
Node.Oracle.prototype.getParameterName = function (index)
{
  return `:P${index + 1}`;
};


// Export module for node
module.exports = Node.Oracle;
