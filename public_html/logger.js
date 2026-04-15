/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

var Node = Node || {};

// Import global modules
// Node.fs = require("fs");

/**
 * @class Node.Logger
 * @classdesc
 * Lightweight logging utility for the Cloud Connector.
 * Provides centralized logging with support for different log levels.
 * Currently outputs to console with JSON formatting.
 *
 * Key features:
 * - **JSON formatted output**: Structured logging for easy parsing
 * - **Multiple log levels**: Support for ERROR, WARNING, INFO, DEBUG levels
 * - **Extensible design**: Prepared for file-based logging (currently commented out)
 * - **Daily log rotation support**: Infrastructure for date-based log files
 *
 * Note: File-based logging is currently disabled but the infrastructure remains
 * for future activation.
 *
 * @property {String} date - Date for log file rotation (when file logging is enabled)
 * @property {Stream} stream - File stream for general logs (when file logging is enabled)
 * @property {Stream} errStream - File stream for error logs (when file logging is enabled)
 */
Node.Logger = function ()
{
  this.init();
};


/**
 * Initializes the logger instance.
 * Sets up file streams for daily log rotation when file logging is enabled.
 * Currently a placeholder as file-based logging is disabled.
 */
Node.Logger.prototype.init = function ()
{
  /*
   if ((new Date()).toISOString().substring(0, 10) !== this.date) {
   this.date = (new Date()).toISOString().substring(0, 10);
   //
   // generate a new stream for each day
   this.stream = Node.fs.createWriteStream("log/" + this.date + ".log", {"flags": "a"});
   this.errStream = Node.fs.createWriteStream("log/" + this.date + "-err.log", {"flags": "a"});
   }
   */
};


/**
 * Logs a message with the specified level and optional data.
 * Outputs JSON-formatted log entries to the console.
 * When file logging is enabled, would also write to daily log files.
 * @param {String} level - Log level (ERROR, WARNING, INFO, DEBUG)
 * @param {String} message - The message to log
 * @param {Object} [data] - Additional data to include in the log entry
 */
Node.Logger.prototype.log = function (level, message, data)
{
  let logString = JSON.stringify({level, message, /*date: new Date(),*/ data});
  //
  console.log(logString);
  /*
   this.stream.write(logString + "\n");
   if (level === "ERROR")
   this.errStream.write(logString + "\n");
   */
};


// Export module for node
module.exports = Node.Logger;
