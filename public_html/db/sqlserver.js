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


/*
 * Get the name of a parameter
 * @param {Number} index
 */
Node.SQLServer.prototype.getParameterName = function (index)
{
  return "@P" + (index + 1);
};


/**
 * Open the connection to the database
 */
Node.SQLServer.prototype._openConnection = async function ()
{
  await this.pool.connect();
  return {};
};


/**
 * Init the application pool
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
 * Close the connection to the database
 * @param {Object} conn
 */
Node.SQLServer.prototype._closeConnection = async function (conn)
{
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
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
 * Commit a transaction
 * @param {Object} conn
 */
Node.SQLServer.prototype._commitTransaction = async function (conn)
{
  await conn.transaction.commit();
};


/**
 * Rollback a transaction
 * @param {Object} conn
 */
Node.SQLServer.prototype._rollbackTransaction = async function (conn)
{
  conn.transaction.off("rollback", this.onRollback);
  await conn.transaction.rollback();
};


// Export module for node
module.exports = Node.SQLServer;
