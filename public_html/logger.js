/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module */

var Node = Node || {};

// Import global modules
Node.fs = require("fs");

/**
 * Class Logger
 */
Node.Logger = function ()
{
  this.init();
};



/**
 * Inits the logger
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
 * Logs a message
 * @param {string} level
 * @param {string} message
 * @param {object} data
 */
Node.Logger.prototype.log = function (level, message, data)
{
  let logString = JSON.stringify({level: level, message: message, /*date: new Date(),*/ data: data});
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
