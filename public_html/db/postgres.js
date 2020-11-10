/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
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
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype._openConnection = function (callback)
{
  // Bigserial and bigint -> integer
  pg.types.setTypeParser(pg.types.builtins.INT8, parseInt);
  //
  // Date, time and datetime -> string
  let parseDate = function (val) {
    return val;
  };
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, parseDate);
  pg.types.setTypeParser(pg.types.builtins.DATE, parseDate);
  pg.types.setTypeParser(pg.types.builtins.TIME, parseDate);
  pg.types.setTypeParser(pg.types.builtins.TIMETZ, parseDate);
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, parseDate);
//  pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, parseDate);
  //
  this.pool = this.pool || new pg.Pool(this.connectionOptions);
  this.pool.connect(function (err, client, done) {
    if (err && done)
      done();
    //
    callback({conn: client, done: done}, err);
  });
};


/**
 * Close the connection to the database
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype._closeConnection = function (conn, callback)
{
  conn.done();
  callback();
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype._execute = function (conn, msg, callback)
{
  // Execute the statement
  let parameters = msg.pars || [];
  conn.conn.query(msg.sql, parameters, function (error, result) {
    if (error)
      return callback(null, error);
    //
    let rs = {};
    rs.cols = [];
    rs.rows = [];
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
    if (["INSERT", "UPDATE", "DELETE"].indexOf(result.command) !== -1) {
      rs.rowsAffected = result.rowCount;
      if (result.command === "INSERT" && result.rows.length === 1 && result.rows[0].counter > 0)
        rs.insertId = result.rows[0].counter;
    }
    callback(rs);
  }.bind(this));
};


/**
 * Begin a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype._beginTransaction = function (conn, callback)
{
  conn.conn.query("BEGIN", function (error) {
    callback(true, error);
  });
};


/**
 * Commit a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype._commitTransaction = function (conn, callback)
{
  conn.conn.query("COMMIT", callback);
};


/**
 * Rollback a transaction
 * @param {Object} conn
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype._rollbackTransaction = function (conn, callback)
{
  conn.conn.query("ROLLBACK", callback);
};


// Export module for node
module.exports = Node.Postgres;
