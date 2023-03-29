/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global module, mysql */

var Node = Node || {};

// Import local modules
Node.DataModel = require("./datamodel");


/**
 * @class Definition of MySQL object
 * @param {Node.CloudConnector} parent
 * @param {Object} config
 */
Node.MySQL = function (parent, config)
{
  this.moduleName = "mysql";
  Node.DataModel.call(this, parent, config);
  //
  // Date, time and datetime -> string
  this.connectionOptions.dateStrings = true;
};

// Make Node.MySQL extend Node.DataModel
Node.MySQL.prototype = new Node.DataModel();


/**
 * Open the connection to the database
 */
Node.MySQL.prototype._openConnection = async function ()
{
  return await new Promise((resolve, reject) => {
    this.pool.getConnection((error, connection) => {
      // Stop auto closure and return the connection from pool
      if (connection && connection.closeTimer) {
        clearTimeout(connection.closeTimer);
        delete connection.closeTimer;
      }
      //
      error ? reject(error) : resolve(connection);
    });
  });
};


/**
 * Init the application pool
 */
Node.MySQL.prototype._initPool = async function ()
{
  return new mysql.createPool(this.connectionOptions);
};


/**
 * Close the connection to the database
 * @param {Object} conn
 */
Node.MySQL.prototype._closeConnection = async function (conn)
{
  conn.release();
  //
  // Program closure of connection
  conn.closeTimer = setTimeout(() => conn.destroy(), 30000);
};


/**
 * Execute a command on the database
 * @param {Object} conn
 * @param {Object} msg - message received
 */
Node.MySQL.prototype._execute = async function (conn, msg)
{
  return await new Promise((resolve, reject) => {
    conn.query(msg.sql, msg.pars, (error, result, md) => {
      if (error)
        return reject(error);
      //
      let rs = {
        cols: [],
        rows: []
      };
      //
      if (result) {
        // Serialize rows
        for (let i = 0; i < result.length; i++) {
          let row = [];
          rs.rows.push(row);
          //
          if (i === 0)
            rs.cols = Object.keys(result[i]);
          //
          for (let j = 0; j < rs.cols.length; j++)
            row.push(this.convertValue(result[i][rs.cols[j]], md[j]));
        }
        //
        // Serialize extra info
        rs.rowsAffected = result.affectedRows;
        rs.insertId = result.insertId;
      }
      //
      resolve(rs);
    });
  });
};


/**
 * Begin a transaction
 * @param {Object} conn
 */
Node.MySQL.prototype._beginTransaction = async function (conn)
{
  return await new Promise((resolve, reject) => {
    conn.beginTransaction(error => error ? reject(error) : resolve());
  });
};


/**
 * Commit a transaction
 * @param {Object} conn
 */
Node.MySQL.prototype._commitTransaction = async function (conn)
{
  return await new Promise((resolve, reject) => {
    conn.commit(error => error ? reject(error) : resolve());
  });
};


/**
 * Rollback a transaction
 * @param {Object} conn
 */
Node.MySQL.prototype._rollbackTransaction = async function (conn)
{
  return await new Promise((resolve, reject) => {
    conn.rollback(error => error ? reject(error) : resolve());
  });
};


// Export module for node
module.exports = Node.MySQL;
