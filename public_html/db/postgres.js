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
  // Convert bigserial + bigint (both with typeId = 20) to integer:
  pg.types.setTypeParser(20, parseInt);
  this.pool = this.pool || new pg.Pool(this.connectionOptions);
  this.pool.connect(function (err, client, done) {
    if (err) {
      done();
      return callback(null, err);
    }
    //
    callback({conn: client, done: done});
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
  var parameters = msg.pars || [];
  conn.conn.query(msg.sql, parameters, function (error, result) {
    if (error)
      return callback(null, error);
    //
    var rs = {};
    rs.cols = [];
    rs.rows = [];
    //
    // Serialize rows
    for (var i = 0; i < result.rows.length; i++) {
      var row = [];
      rs.rows.push(row);
      for (var j = 0; j < result.fields.length; j++) {
        var colname = result.fields[j].name;
        if (i === 0)
          rs.cols.push(colname);
        row.push(Node.Postgres.convertValue(result.rows[i][colname], result.fields[j].dataTypeID));
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
  });
};


/**
 * Convert a value
 * @param {Object} value
 * @param {Integer} datatype
 */
Node.Postgres.convertValue = function (value, datatype)
{
  if (value === null)
    return value;
  //
  switch (datatype) {
    case 701:  // float
    case 790:  // money
    case 1700: // numeric
      return parseFloat(value);

    case 1082: // date
      var v = value.getFullYear() + "-";
      v += (value.getMonth() + 1 < 10 ? "0" : "") + (value.getMonth() + 1) + "-";
      v += (value.getDate() < 10 ? "0" : "") + value.getDate();
      return v;

    case 1184: // timestamp with time zone
      return value.toISOString();
  }
  return Node.DataModel.convertValue(value);
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
