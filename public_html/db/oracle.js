/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global oracledb */

const DataModel = require("./datamodel");
const Utils = require("../utils");


/**
 * @class Oracle
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
 * @extends DataModel
 * @param {CloudServer} parent - Parent CloudServer instance
 * @param {Object} config - Oracle configuration
 * @param {String} config.name - Name of this datamodel instance
 * @param {String} config.APIKey - API key for authentication
 * @param {Object} config.connectionOptions - Oracle connection parameters
 * @param {String} config.connectionOptions.user - Database user
 * @param {String} config.connectionOptions.password - Database password
 * @param {String} config.connectionOptions.connectString - TNS connect string or Easy Connect
 * @param {Number} [config.maxRows] - Maximum rows to fetch per query
 */
class Oracle extends DataModel
{
  /** Process-wide flag tracking whether oracledb Thick mode has been initialised */
  static thickInitialized = false;


  constructor(parent, config)
  {
    super(parent, config);
    //
    this.moduleName = "oracledb";
  }


  /**
   * Loads and configures the Oracle database module.
   * Sets up Oracle-specific options like BLOB/CLOB fetching and metadata handling.
   * @returns {Boolean} True if module loaded successfully, false otherwise
   * @override
   */
  loadModule()
  {
    if (!super.loadModule())
      return false;
    //
    // Blob -> buffer
    oracledb.fetchAsBuffer = [oracledb.BLOB];
    //
    // Date, time and datetime -> string
    oracledb.fetchAsString = [oracledb.CLOB];
    oracledb.extendedMetaData = true;
    oracledb.poolTimeout = 30;
    //
    if (this.maxRows)
      oracledb.maxRows = this.maxRows;
    //
    return true;
  }


  /**
   * Opens a connection to the Oracle database from the connection pool.
   * @private
   * @returns {Promise<Object>} Oracle database connection object
   */
  async _openConnection()
  {
    return await this.pool.getConnection();
  }


  /**
   * Builds the instructions for making an Oracle client available to node-oracledb Thick mode.
   * How the client is found depends on the platform: node-oracledb loads it from the directory handed to
   * initOracleClient only on Windows and macOS, while elsewhere the libraries must already be in the loader
   * search path when the process starts.
   * @returns {String} the sentences to append to a message about enabling Thick mode on this machine
   */
  static getThickModeHelp()
  {
    // Whatever the platform, the client has to be the one the machine already uses: see _initPool
    let sameClient = "The client must be the same one already loaded by the other processes on this machine, because two client versions on the same machine stop those processes from opening their own connections. Install a separate Oracle Instant Client only where no Oracle client is present.";
    //
    // An Oracle Home keeps its libraries in bin, an Instant Client in the directory it was unpacked into
    if (process.platform === "win32")
      return `Set the ORACLE_INSTANT_CLIENT_DIR environment variable to the directory the Oracle client libraries are loaded from, which is the bin directory of an Oracle Home or the Instant Client directory itself, to enable Thick mode. ${sameClient}`;
    //
    if (process.platform === "darwin")
      return `Set the ORACLE_INSTANT_CLIENT_DIR environment variable to the directory the Oracle client libraries are loaded from, which for an Instant Client is the directory it was unpacked into, to enable Thick mode. ${sameClient}`;
    //
    return `To enable Thick mode on this platform the Oracle client libraries must already be in the loader search path when the process starts, so add them with ldconfig or LD_LIBRARY_PATH, and set the ORACLE_INSTANT_CLIENT_DIR environment variable to that same directory: here its value does not locate the client, it only asks for Thick mode. ${sameClient}`;
  }


  /**
   * Initializes the Oracle connection pool using oracledb.
   * On first pool creation, if the ORACLE_INSTANT_CLIENT_DIR environment variable is set,
   * enables node-oracledb Thick mode to support Oracle servers older than 12.1.
   * @private
   * @returns {Promise<Object>} Oracle connection pool instance
   */
  async _initPool()
  {
    // Enable Thick mode before the first pool is created, if requested via env var. initOracleClient is
    // process-wide and must run once before any createPool; the client it loads must be the same one loaded
    // by the other processes on this machine, or they can no longer open their own connections.
    if (!Oracle.thickInitialized && process.env.ORACLE_INSTANT_CLIENT_DIR) {
      // libDir is honoured only on Windows and macOS, and it narrows the search to that directory alone:
      // elsewhere the loader search path the process started with is the only mechanism, so there the variable
      // just asks for Thick mode and handing over its value would rule out the very libraries that do work.
      let clientOptions = {};
      if (["win32", "darwin"].includes(process.platform))
        clientOptions.libDir = process.env.ORACLE_INSTANT_CLIENT_DIR;
      //
      try {
        oracledb.initOracleClient(clientOptions);
      }
      catch (e) {
        throw new Error(`Oracle Thick mode initialization failed: ${e.message}. The Oracle client must match the Node.js architecture. ${Oracle.getThickModeHelp()}`, {cause: e});
      }
      Oracle.thickInitialized = true;
    }
    //
    try {
      return await oracledb.createPool(this.connectionOptions);
    }
    catch (e) {
      if (e.message?.includes("NJS-138"))
        throw new Error(`The Oracle server version is older than 12.1 and is not supported in node-oracledb Thin mode. ${Oracle.getThickModeHelp()}`, {cause: e});
      throw e;
    }
  }


  /**
   * Closes the current database connection and returns it to the pool.
   * @private
   * @param {Object} conn - Oracle connection object to close
   */
  async _closeConnection(conn)
  {
    await conn.close();
  }


  /**
   * Closes the Oracle connection pool and releases all resources.
   * @private
   */
  async _closePool()
  {
    await this.pool.close();
  }


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
  async _execute(conn, msg)
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
  }


  /**
   * Converts Oracle-specific data types to JavaScript values.
   * Handles special date/time conversions with DST adjustments.
   * @param {*} value - Raw value from Oracle database
   * @param {Object} colDef - Column definition with type information
   * @returns {*} Converted JavaScript value
   * @override
   */
  convertValue(value, colDef)
  {
    if (value instanceof Date) {
      switch (colDef.dbType) {
        case oracledb.DB_TYPE_DATE: {
          // Some adjustments for daylight savings time
          let stdTimezoneOffset = Utils.stdTimezoneOffset();
          if (!Utils.isDstObserved(value))
            value = new Date(value.getTime() - (stdTimezoneOffset * 60000));
          if (!Utils.isDstObserved(new Date()))
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
    return super.convertValue(value);
  }


  /**
   * Begins a database transaction.
   * Oracle transactions are implicit, so this is a no-op.
   * @private
   * @param {Object} conn - Oracle connection object
   */
  async _beginTransaction(conn)
  {
  }


  /**
   * Commits the current database transaction.
   * @private
   * @param {Object} conn - Oracle connection object
   * @throws {Error} Transaction commit errors
   */
  async _commitTransaction(conn)
  {
    await conn.commit();
  }


  /**
   * Rolls back the current database transaction.
   * @private
   * @param {Object} conn - Oracle connection object
   * @throws {Error} Transaction rollback errors
   */
  async _rollbackTransaction(conn)
  {
    await conn.rollback();
  }


  /**
   * Gets the Oracle parameter placeholder name for prepared statements.
   * Oracle uses named parameters with colon prefix.
   * @param {Number} index - Zero-based parameter index
   * @returns {String} Parameter placeholder (e.g., ":P1", ":P2")
   * @override
   */
  getParameterName(index)
  {
    return `:P${index + 1}`;
  }
}


// Export module for node
module.exports = Oracle;
