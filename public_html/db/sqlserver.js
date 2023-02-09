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
  //
  // Date parsed with local timezone
  this.connectionOptions.options = this.connectionOptions.options || {};
  this.connectionOptions.options.useUTC = false;
};

// Make Node.SQLServer extend Node.DataModel
Node.SQLServer.prototype = new Node.DataModel();


/**
 * Open the connection to the database
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._openConnection = function (callback)
{
  callback({});
};


/**
 * Init the application pool
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._initPool = function (callback) {
  let pool = new mssql.ConnectionPool(this.connectionOptions);
  pool.connect(function (error) {
    callback(pool, error);
  });
  //
  pool.on("error", function (error) {
    delete this.pool;
  }.bind(this));
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
  let sql = msg.sql;
  //
  let req = new mssql.Request(conn.transaction || this.pool);
  if (sql.toLowerCase().indexOf("insert into ") !== -1) {
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
  req.query(sql, function (error, result) {
    if (error)
      return callback(null, error);
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
    callback(rs);
  }.bind(this));
};


/**
 * Convert a value
 * @param {Object} value
 * @param {Object} colDef
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
 * Begin a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._beginTransaction = function (conn, callback)
{
  let tr = new mssql.Transaction(this.pool);
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
  conn.transaction.commit(function (error) {
    callback(null, error);
  });
};


/**
 * Rollback a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.SQLServer.prototype._rollbackTransaction = function (conn, callback)
{
  conn.transaction.rollback(function (error) {
    callback(null, error);
  });
};


// Export module for node
module.exports = Node.SQLServer;
