/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module, oracledb */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Definition of Oracle object
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
 * Open the connection to the database
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype._openConnection = function (callback)
{
  // Open connection
  this.initPool(function (err) {
    if (err)
      return callback(null, err);
    //
    this.pool.getConnection(function (err, connection) {
      callback({conn: connection}, err);
    });
  }.bind(this));
};


/**
 * Init the application pool
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype.initPool = function (callback) {
  if (this.pool)
    return callback();
  //
  oracledb.createPool(this.connectionOptions, function (error, pool) {
    if (!error)
      this.pool = pool;
    callback(error);
  }.bind(this));
};


/**
 * Close the connection to the database
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype._closeConnection = function (conn, callback)
{
  conn.conn.release(function (error) {
    callback(null, error);
  });
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype._execute = function (conn, msg, callback)
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
  conn.conn.execute(msg.sql, bindParams, options, function (error, result) {
    if (error)
      return callback(null, error);
    //
    let rs = {};
    rs.cols = [];
    rs.rows = [];
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
    callback(rs);
  }.bind(this));
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
 * Begin a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype._beginTransaction = function (conn, callback)
{
  callback(true);
};


/**
 * Commit a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype._commitTransaction = function (conn, callback)
{
  conn.conn.commit(callback);
};


/**
 * Rollback a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.Oracle.prototype._rollbackTransaction = function (conn, callback)
{
  conn.conn.rollback(callback);
};


// Export module for node
module.exports = Node.Oracle;
