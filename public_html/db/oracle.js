/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Oracle database connector implementation
 * @classdesc Provides Oracle-specific database operations including connection pooling,
 * transaction handling, schema operations, and SQL generation. Extends the base Database
 * class with Oracle-specific features like PL/SQL support, LOB handling, sequences,
 * and Oracle-specific SQL syntax.
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.Oracle = function (parent, config)
{
  this.moduleName = "oracledb";
  Node.DataModel.call(this, parent, config);
};

// Make Node.Oracle extend Node.DataModel
Node.Oracle.prototype = new Node.DataModel();



/**
 * Load module
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
 * Opens a connection to the Oracle database
 * Gets a connection from the pool and returns it for use
 * @returns {Promise<Object>} Oracle database connection object
 */
Node.Oracle.prototype._openConnection = async function ()
{
  return await this.pool.getConnection();
};


/**
 * Init the application pool
 */
Node.Oracle.prototype._initPool = async function ()
{
  return await oracledb.createPool(this.connectionOptions);
};


/**
 * Closes the current database connection
 * Returns the connection to the pool for reuse
 * @param {Object} conn
 * @returns {Promise<void>}
 */
Node.Oracle.prototype._closeConnection = async function (conn)
{
  await conn.close();
};


/**
 * Close the connection pool
 */
Node.Oracle.prototype._closePool = async function ()
{
  await this.pool.close();
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
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
 * Convert a value
 * @param {Object} value
 * @param {Object} colDef
 */
Node.Oracle.prototype.convertValue = function (value, colDef)
{
  if (value instanceof Date) {
    switch (colDef.dbType) {
      case oracledb.DB_TYPE_DATE:
      {
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
 * Begins a database transaction
 * Oracle transactions are implicit, so this is a no-op
 * @private
 * @param {Object} conn
 * @returns {Promise<void>}
 */
Node.Oracle.prototype._beginTransaction = async function (conn)
{
};


/**
 * Commits the current database transaction
 * @private
 * @param {Object} conn
 * @returns {Promise<void>}
 * @throws {Error} Transaction commit errors
 */
Node.Oracle.prototype._commitTransaction = async function (conn)
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
Node.Oracle.prototype._rollbackTransaction = async function (conn)
{
  await conn.rollback();
};


/**
 * Gets the Oracle parameter placeholder name for prepared statements
 * @param {Number} index - Zero-based parameter index
 * @returns {String} Parameter placeholder (e.g., ":P1", ":P2")
 */
Node.Oracle.prototype.getParameterName = function (index)
{
  return `:P${index + 1}`;
};


// Export module for node
module.exports = Node.Oracle;
