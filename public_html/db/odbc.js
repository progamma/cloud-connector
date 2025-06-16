/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global module, pg, parseInt */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Definition of ODBC object
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.ODBC = function (parent, config)
{
  this.moduleName = "odbc";
  Node.DataModel.call(this, parent, config);
};

// Make Node.ODBC extend Node.DataModel
Node.ODBC.prototype = new Node.DataModel();


/**
 * Open a connection to the database
 */
Node.ODBC.prototype._openConnection = async function ()
{
  return await this.pool.connect();
};


/**
 * Init the application pool
 */
Node.ODBC.prototype._initPool = async function ()
{
  return new odbc.pool(this.connectionOptions);
};


/**
 * Close the connection to the database
 * @param {Object} conn
 */
Node.ODBC.prototype._closeConnection = async function (conn)
{
  await conn.close();
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
 */
Node.ODBC.prototype._execute = async function (conn, msg)
{
  let result;
  let {sql, pars} = msg;
  //
  // Check if parametric queries are supported
  if (pars?.length > 0 && !(await this.isQueryParametricSupported())) {
    let stmt;
    try {
      stmt = await conn.createStatement();
      stmt.prepare(sql);
      stmt.bindParameters(pars);
      result = stmt.execute();
    } finally {
      stmt.close();
    }
  }
  else
    result = await conn.query(sql, pars);
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
 * Check if parametric queries are supported
 * @return {Boolean} true if parametric queries are supported, false otherwise
 */
Node.ODBC.prototype.isQueryParametricSupported = async function()
{
  // If not yet tested, check the pool for support
  if (this.pool.isQueryParametricSupported === undefined) {
    try {
      // Try a simple query to check if parametric queries are supported
      // This will throw an error if not supported
      await this.connection.query("SELECT ?", [1]);
    }
    catch (e) {
      let sqlState = e.odbcErrors?.[0]?.state;
      let msg = (e.odbcErrors?.[0]?.message || e.message || '').toLowerCase();
      //
      // Detect specific errors for unsupported parametric queries
      pool.isQueryParametricSupported = !(sqlState === 'HYC00' ||
        sqlState === '0A000' || // feature not supported (standard SQL)
        sqlState === 'HY092' || // invalid attribute/option identifier
        sqlState === '07009' || // invalid descriptor index
        sqlState === 'IM001' || // driver does not support this function (Access/ODBC)
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
 * Check if the ODBC driver supports parametric queries
 * @param {Object} [err] - error object, if available
 * @returns {Boolean} - true if parametric queries are supported, false otherwise
 */
Node.ODBC.prototype.isTransactionSupported = function(err)
{
  if (this.pool.isTransactionSupported === undefined) {
    let sqlState = err.odbcErrors?.[0]?.state;
    let msg = (err.odbcErrors?.[0]?.message || err.message || '').toLowerCase();
    //
    this.pool.isTransactionSupported = !(sqlState === 'HYC00' ||
      sqlState === '0A000' || // feature not supported (standard SQL)
      /transazion.*non.*supportata/.test(msg) ||  // italiano
      /not support(ed)?/.test(msg)); // generico inglese fallback
  }
  //
  return this.pool.isTransactionSupported;
};


/**
 * Begin a transaction
 * @param {Object} conn
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
 * Commit a transaction
 * @param {Object} conn
 */
Node.ODBC.prototype._commitTransaction = async function (conn)
{
  if (this.isTransactionSupported())
    await conn.commit();
};


/**
 * Rollback a transaction
 * @param {Object} conn
 */
Node.ODBC.prototype._rollbackTransaction = async function (conn)
{
  if (this.isTransactionSupported())
    await conn.rollback();
};


/**
 * List all tables in the database
 * @param {Object} conn - connection object
 * @param {Object} options - options for the query
 * @return {Array} - list of tables
 */ 
Node.ODBC.prototype._listTables = async function (conn, options)
{
  return await conn.tables(null, null, options.filter, options.type?.toUpperCase());
};


/**
 * Read list of primary keys of a table
 * @param {Object} conn - connection object
 * @param {Object} options - options for the query
 * @return {Array} - list of primary keys
 */
Node.ODBC.prototype._listTablePrimaryKeys = async function (conn, options)
{
  return await conn.primaryKeys(null, null, options.table);
};


/**
 * Read list of columns of a table
 * @param {Object} conn - connection object
 * @param {Object} options - options for the query
 * @return {Array} - list of columns
 */
Node.ODBC.prototype._listTableColumns = async function (conn, options)
{
  return await conn.columns(null, null, options.table, null);
};


/**
 * Read list of foreign keys of a table
 * @param {Object} conn - connection object
 * @param {Object} options - options for the query
 * @return {Array} - list of foreign keys
 */
Node.ODBC.prototype._listTableForeignKeys = async function (conn, options)
{
  return await conn.foreignKeys(null, null, null, null, null, options.table);
};


// Export module for node
module.exports = Node.ODBC;
