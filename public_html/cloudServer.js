/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module */

var Node = Node || {};

// Import global modules
Node.fs = require("fs");

// Import local modules
Node.DataModel = require("./datamodel");
Node.Server = require("./server");
Node.Logger = require("./logger");


/**
 * @class Definition of Cloud Connector object
 */
Node.CloudServer = function ()
{
  this.servers = [];        // List of servers (IDE/apps)
  this.datamodels = [];     // List of datamodels (DBs)
  //
  this.logger = new Node.Logger();
};


/**
 * Start the cloud connector
 */
Node.CloudServer.prototype.start = function ()
{
  this.logger.log("INFO", "Start Cloud Server");
  //
  var file = Node.fs.readFileSync("config.json", {encoding: "utf8"});
  this.config = JSON.parse(file);
  //
  this.createServers();
  //
  this.createDataModels();
};


/**
 * Logs a message
 * @param {string} level
 * @param {string} message
 * @param {object} data
 */
Node.CloudServer.prototype.log = function (level, message, data)
{
  this.logger.log(level, message, data);
};


/**
 * Given a username returns the server that hosts that user
 * @param {String} username
 */
Node.CloudServer.serverForUser = function (username)
{
  return "http://internal.instantdevelopercloud.com";
};


/**
 * Start all the clients
 */
Node.CloudServer.prototype.createServers = function ()
{
  // First attach app servers
  for (var i = 0; i < this.config.remoteServers.length; i++) {
    var srvName = this.config.remoteServers[i];
    //
    var cli = new Node.Server(this, srvName);
    cli.connect();
    //
    this.servers.push(cli);
  }
  //
  // Next, attach "IDE" servers
  for (var i = 0; i < this.config.remoteUserNames.length; i++) {
    var uname = this.config.remoteUserNames[i];
    //
    // Ask the InDe console where is this user
    var srvName = Node.CloudServer.serverForUser(uname);
    if (!srvName) {
      this.log("WARNING", "Can't locate the server for the user " + uname);
      continue;
    }
    //
    var cli = new Node.Server(this, srvName);
    cli.connect();
    //
    this.servers.push(cli);
  }
};


/**
 * Start all the datamodel connections
 */
Node.CloudServer.prototype.createDataModels = function ()
{
  // Create all connections
  for (var i = 0; i < this.config.datamodels.length; i++) {
    var db = this.config.datamodels[i];
    //
    var dbobj = new Node.DataModel(this);
    dbobj.class = db.class;
    //
    // Add name so that I can look for it
    dbobj.name = db.name;
    //
    // Add connection options
    dbobj.options = db.connectionOptions;
    //
    this.datamodels.push(dbobj);
  }
};


/**
 * Returns a datamodel with a specific name
 * @param {String} dmname
 */
Node.CloudServer.prototype.dataModelByName = function (dmname)
{
  // Get the right datamodel
  for (var i = 0; i < this.datamodels.length; i++) {
    var dm = this.datamodels[i];
    if (dm.name === dmname)
      return dm;
  }
};


// Start the server
new Node.CloudServer().start();
console.log("Started");
