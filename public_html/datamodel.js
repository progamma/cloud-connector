/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module */

var Node = Node || {};


/**
 * @class Definition of DataModel object
 * @param {Node.CloudConnector} parent
 */
Node.DataModel = function (parent)
{
  this.parent = parent;
};


/**
 * Recived a message
 * @param {Object} msg
 * @param {Function} callback - for response
 */
Node.DataModel.prototype.onMessage = function (msg, callback)
{
  if (msg.type === "query") {
    if (this.class === "SQLServer") {
      Node.mssql = require("mssql");
      //
      // Open connection
      var conn = new Node.mssql.Connection(this.options);
      conn.connect(function (err) {
        if (err) {
          callback(null, err);
          return;
        }
        //
        // Run the query
        var req = new Node.mssql.Request(conn);
        req.query(msg.sql, function (error, result) {
          if (error)
            callback(null, error);
          else
            callback(result);
          //
          conn.close();
        });
      });
    }
    else if (this.class === "Oracle") {
      Node.oracledb = require("oracledb");
      //
      // Open connection
      Node.oracledb.getConnection(this.options, function (err, conn) {
        if (err) {
          callback(null, err);
          return;
        }
        //
        // Run the query
        var params = {outFormat: Node.oracledb.OBJECT, autoCommit: true};
        conn.execute(msg.sql, {}, params, function (error, result) {
          if (error)
            callback(null, error);
          else
            callback(result);
          //
          conn.release();
        });
      });
    }
    else {
      this.parent.log("ERROR", "Database class " + this.class + " not supported");
      throw new Error("Database class " + this.class + " not supported");
    }
  }
};


// Export module for node
if (module)
  module.exports = Node.DataModel;
