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
  oracledb.fetchAsBuffer = [oracledb.BLOB];
  oracledb.fetchAsString = [oracledb.CLOB];
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
  var options = {outFormat: oracledb.OBJECT, autoCommit: !conn.transaction};
  var bindParams = {};
  //
  // Set output parameter for read value of counter field
  if (msg.ct)
    bindParams.counter = {type: oracledb.NUMBER, dir: oracledb.BIND_OUT};
  //
  // Add input parameters
  var parameters = msg.pars || [];
  for (var i = 0; i < parameters.length; i++)
    bindParams["P" + (i + 1)] = parameters[i];
  //
  conn.conn.execute(msg.sql, bindParams, options, function (error, result) {
    if (error)
      return callback(null, error);
    //
    var rs = {};
    rs.cols = [];
    rs.rows = [];
    //
    if (result.rows) {
      // Serialize rows
      for (var i = 0; i < result.rows.length; i++) {
        var row = [];
        rs.rows.push(row);
        for (var j = 0; j < result.metaData.length; j++) {
          var colname = result.metaData[j].name;
          if (i === 0)
            rs.cols.push(colname);
          //
          row.push(Node.Oracle.convertValue(result.rows[i][colname]));
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
  });
};


/**
 * Convert a value
 * @param {Object} value
 */
Node.Oracle.convertValue = function (value)
{
  if (value instanceof Date)
    return value.toISOString();
  return Node.DataModel.convertValue(value);
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
