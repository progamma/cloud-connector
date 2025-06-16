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
 * @class Definition of Postgres object
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.Postgres = function (parent, config)
{
  this.moduleName = "pg";
  Node.DataModel.call(this, parent, config);
};

// Make Node.Postgres extend Node.DataModel
Node.Postgres.prototype = new Node.DataModel();


/**
 * Open a connection to the database
 */
Node.Postgres.prototype._openConnection = async function ()
{
  // Bigserial and bigint -> integer
  pg.types.setTypeParser(pg.types.builtins.INT8, parseInt);
  //
  // Date, time and datetime -> string
  let parseDate = val => val;
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, parseDate);
  pg.types.setTypeParser(pg.types.builtins.DATE, parseDate);
  pg.types.setTypeParser(pg.types.builtins.TIME, parseDate);
  pg.types.setTypeParser(pg.types.builtins.TIMETZ, parseDate);
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, parseDate);
//  pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, parseDate);
  //
  return await this.pool.connect();
};


/**
 * Init the application pool
 */
Node.Postgres.prototype._initPool = async function ()
{
  return new pg.Pool(this.connectionOptions);
};


/**
 * Close the connection to the database
 * @param {Object} conn
 */
Node.Postgres.prototype._closeConnection = async function (conn)
{
  conn.release();
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
 */
Node.Postgres.prototype._execute = async function (conn, msg)
{
  // Execute the statement
  let result = await conn.query(msg.sql, msg.pars || []);
  //
  let rs = {
    cols: [],
    rows: []
  };
  //
  // Serialize rows
  for (let i = 0; i < result.rows.length; i++) {
    let row = [];
    rs.rows.push(row);
    for (let j = 0; j < result.fields.length; j++) {
      let colname = result.fields[j].name;
      if (i === 0)
        rs.cols.push(colname);
      row.push(this.convertValue(result.rows[i][colname], result.fields[j]));
    }
  }
  //
  // Serialize extra info
  if (["INSERT", "UPDATE", "DELETE"].includes(result.command)) {
    rs.rowsAffected = result.rowCount;
    if (result.command === "INSERT" && result.rows.length === 1 && result.rows[0].counter > 0)
      rs.insertId = result.rows[0].counter;
  }
  return rs;
};


/**
 * Begin a transaction
 * @param {Object} conn
 */
Node.Postgres.prototype._beginTransaction = async function (conn)
{
  await conn.query("begin");
};


/**
 * Commit a transaction
 * @param {Object} conn
 */
Node.Postgres.prototype._commitTransaction = async function (conn)
{
  await conn.query("commit");
};


/**
 * Rollback a transaction
 * @param {Object} conn
 */
Node.Postgres.prototype._rollbackTransaction = async function (conn)
{
  await conn.query("rollback");
};


// Export module for node
module.exports = Node.Postgres;
