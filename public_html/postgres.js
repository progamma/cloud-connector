/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module */

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
  Node.DataModel.call(this, parent, config);
};

// Make Node.Postgres extend Node.DataModel
Node.Postgres.prototype = new Node.DataModel();


/**
 * Open a connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype.openConnection = function (msg, callback)
{
  // Import global modules (could be missing)
  try {
    Node.pg = require("pg");
  }
  catch (ex) {
    callback(null, new Error("Postgres driver not found.\nInstall \"pg\" module and try again"));
    return;
  }
  //
  // Open connection
  var pthis = this;
  Node.pg.connect(this.connectionOptions, function (err, client, done) {
    if (err) {
      done();
      callback(null, err);
    }
    else {
      pthis.connections[msg.cid] = {conn: client, server: msg.server, done: done};
      callback();
    }
  });
};


/**
 * Close the connection to the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype.closeConnection = function (msg, callback)
{
  if (this.connections[msg.cid]) {
    this.connections[msg.cid].done();
    delete this.connections[msg.cid];
  }
  callback();
};


/**
 * Execute a command on the database
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype.execute = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  // Execute the statement
  var startTime = new Date();
  this.connections[msg.cid].conn.query(msg.sql, function (error, result) {
    if (error)
      callback(null, error);
    else {
      var rs = {};
      rs.cols = [];
      rs.rows = [];
      rs.times = {qry: (new Date()).getTime() - startTime.getTime()};
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
    }
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
      break;

    case 1082: // date
    case 1184: // timestamp with time zone
      return value.toISOString();
      break;
  }
  return value;
};


/**
 * Begin a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype.beginTransaction = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  // Execute the statement
  var pthis = this;
  this.connections[msg.cid].conn.query("BEGIN", function (error, result) {
    if (error)
      callback(null, error);
    else {
      pthis.connections[msg.cid].transaction = true;
      callback();
    }
  });
};


/**
 * Commit a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype.commitTransaction = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  // Execute the statement
  var pthis = this;
  this.connections[msg.cid].conn.query("COMMIT", function (error, result) {
    delete pthis.connections[msg.cid].transaction;
    callback(null, error);
  });
};


/**
 * Rollback a transaction
 * @param {Object} msg - message received
 * @param {Function} callback - function to be called at the end
 */
Node.Postgres.prototype.rollbackTransaction = function (msg, callback)
{
  if (!this.connections[msg.cid]) {
    callback(null, new Error("Connection closed"));
    return;
  }
  //
  // Execute the statement
  var pthis = this;
  this.connections[msg.cid].conn.query("ROLLBACK", function (error, result) {
    delete pthis.connections[msg.cid].transaction;
    callback(null, error);
  });
};


// Export module for node
module.exports = Node.Postgres;
