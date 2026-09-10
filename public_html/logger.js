/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

/**
 * @class Logger
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
 * @property {Array} history - Most recent log entries, oldest first
 */
class Logger
{
  /**
   * Number of entries kept in memory, so that the local configuration page can show
   * the tail of the log without file logging being enabled.
   * @type {Number}
   */
  static historySize = 500;


  constructor()
  {
    this.history = [];
    this.init();
  }


  /**
   * Initializes the logger instance.
   * Sets up file streams for daily log rotation when file logging is enabled.
   * Currently a placeholder as file-based logging is disabled.
   */
  init()
  {
    /*
     if ((new Date()).toISOString().substring(0, 10) !== this.date) {
     this.date = (new Date()).toISOString().substring(0, 10);
     //
     // generate a new stream for each day
     this.stream = fs.createWriteStream("log/" + this.date + ".log", {"flags": "a"});
     this.errStream = fs.createWriteStream("log/" + this.date + "-err.log", {"flags": "a"});
     }
     */
  }


  /**
   * Logs a message with the specified level and optional data.
   * Outputs JSON-formatted log entries to the console.
   * When file logging is enabled, would also write to daily log files.
   * @param {String} level - Log level (ERROR, WARNING, INFO, DEBUG)
   * @param {String} message - The message to log
   * @param {Object} [data] - Additional data to include in the log entry
   */
  log(level, message, data)
  {
    let logString = JSON.stringify({level, message, /*date: new Date(),*/ data});
    //
    this.history.push({date: (new Date()).toISOString(), level, message, data});
    if (this.history.length > Logger.historySize)
      this.history.shift();
    //
    console.log(logString);
    /*
     this.stream.write(logString + "\n");
     if (level === "ERROR")
     this.errStream.write(logString + "\n");
     */
  }


  /**
   * Returns the most recent log entries, oldest first.
   * @param {Number} [count] - How many entries to return; all of them when omitted
   * @returns {Array} Log entries, each with date, level, message and data
   */
  getHistory(count)
  {
    return count > 0 ? this.history.slice(-count) : this.history.slice();
  }
}


// Export module for node
module.exports = Logger;
