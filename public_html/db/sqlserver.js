/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module, mssql */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Definition of SQLServer object
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.SQLServer = function (parent, config)
{
  this.moduleName = "mssql";
  Node.DataModel.call(this, parent, config);
};

// Make Node.SQLServer extend Node.DataModel
Node.SQLServer.prototype = new Node.DataModel();


/**
 * Open the connection to the database
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._openConnection = function (callback)
{
  this.initPool(function (err) {
    callback({}, err);
  });
};


/**
 * Init the application pool
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype.initPool = function (callback) {
  if (this.pool)
    return callback();
  //
  this.pool = new mssql.ConnectionPool(this.connectionOptions);
  this.pool.connect(callback);
};


/**
 * Close the connection to the database
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._closeConnection = function (conn, callback)
{
  callback();
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._execute = function (conn, msg, callback)
{
  var sql = msg.sql;
  //
  var req = new mssql.Request(conn.transaction || this.pool);
  if (sql.toLowerCase().indexOf("insert into ") !== -1) {
    req.multiple = true;
    sql += "; select @@identity as Counter";
  }
  //
  // Add input parameters
  var parameters = msg.pars || [];
  for (var i = 0; i < parameters.length; i++)
    req.input("P" + (i + 1), parameters[i]);
  //
  // Execute the statement
  req.query(sql, function (error, result) {
    if (error)
      return callback(null, error);
    //
    var rs = {};
    if (result.recordset && !req.multiple) {
      // Serialize rows
      rs.cols = Object.keys(result.recordset.columns);
      rs.rows = [];
      for (var i = 0; i < result.recordset.length; i++) {
        var row = [];
        rs.rows.push(row);
        for (var j = 0; j < rs.cols.length; j++)
          row.push(Node.DataModel.convertValue(result.recordset[i][rs.cols[j]]));
      }
    }
    else {
      // Serialize extra info
      rs.rowsAffected = result.rowsAffected[0];
      if (result.recordset)
        rs.insertId = result.recordset && result.recordsets[0][0].Counter;
    }
    callback(rs);
  });
};


/**
 * Begin a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._beginTransaction = function (conn, callback)
{
  var tr = new mssql.Transaction(this.pool);
  tr.begin(function (error) {
    callback(tr, error);
  });
};


/**
 * Commit a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._commitTransaction = function (conn, callback)
{
  conn.transaction.commit(callback);
};


/**
 * Rollback a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._rollbackTransaction = function (conn, callback)
{
  conn.transaction.rollback(callback);
};


// Export module for node
module.exports = Node.SQLServer;
