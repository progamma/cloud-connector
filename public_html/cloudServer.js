/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */

var Node = Node || {};

// Import global modules
Node.fs = require("fs");
Node.https = require("https");

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
  this.logger = new Node.Logger();
};


/**
 * Start the cloud connector
 */
Node.CloudServer.prototype.start = function ()
{
  this.log("INFO", "Start Cloud Server");
  this.loadConfig();
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
 * @param {Function} callback - function to be called at the end
 */
Node.CloudServer.serverForUser = function (username, callback)
{
  var options = {hostname: "console.instantdevelopercloud.com",
    path: "/IndePlatform/?mode=rest&cmd=serverURL&user=" + username,
    method: "GET"
  };
  //
  var req = Node.https.request(options, function (res) {
    var data = "";
    res.on("data", function (chunk) {
      data = data + chunk;
    });
    res.on("end", function () {
      if (res.statusCode !== 200)
        callback(null, data);
      else
        callback(data);
    });
  });
  req.on("error", function (error) {
    callback(null, error);
  });
  req.end();
};


/**
 * Read the JSON of the configuration from the file config.json
 */
Node.CloudServer.prototype.loadConfig = function ()
{
  var file = Node.fs.readFileSync("config.json", {encoding: "utf8"});
  //
  // If the read is successful the variable "file" contains the content of config.json
  if (!file) {
    this.log("ERROR", "Error reading the configuration",
            {source: "Node.CloudServer.prototype.loadConfig"});
    return;
  }
  //
  try {
    var config = JSON.parse(file);
    this.name = config.name;
    //
    this.createDataModels(config);
    this.createServers(config);
    //
    this.log("INFO", "Configuration loaded with success");
  }
  catch (e) {
    this.log("ERROR", "Error parsing the configuration: " + e,
            {source: "Node.CloudServer.prototype.loadConfig"});
  }
};


/**
 * Start all the clients
 * @param {Object} config
 */
Node.CloudServer.prototype.createServers = function (config)
{
  // First attach app servers
  for (var i = 0; i < config.remoteServers.length; i++) {
    var srvUrl = config.remoteServers[i];
    //
    // Create the server and connect it
    var cli = new Node.Server(this, srvUrl);
    cli.connect();
    //
    this.servers.push(cli);
  }
  //
  // Next, attach "IDE" servers
  var pthis = this;
  for (var i = 0; i < config.remoteUserNames.length; i++) {
    var uname = config.remoteUserNames[i];
    //
    // If server url is explicited use it
    if (uname.startsWith("http://") || uname.startsWith("https://")) {
      var parts = uname.split("@");
      pthis.createServer(parts[0], parts[1]);
      continue;
    }
    //
    // Ask the InDe console where is this user
    Node.CloudServer.serverForUser(uname, function (srvUrl, error) {
      if (error) {
        pthis.log("ERROR", "Can't locate the server for the user " + uname + ": " + error);
        return;
      }
      if (!srvUrl) {
        pthis.log("WARNING", "Can't locate the server for the user " + uname);
        return;
      }
      //
      pthis.createServer(srvUrl, uname);
    });
  }
};


/**
 * Start a client
 * @param {String} srvUrl
 */
Node.CloudServer.prototype.createServer = function (srvUrl, username)
{
  // Create the server and connect it
  var cli = new Node.Server(this, srvUrl);
  cli.ideUserName = username;
  cli.connect();
  //
  // Add server to list
  this.servers.push(cli);
};


/**
 * Create all the datamodels
 * @param {Object} config
 */
Node.CloudServer.prototype.createDataModels = function (config)
{
  // Create all connections
  for (var i = 0; i < config.datamodels.length; i++) {
    var db = config.datamodels[i];
    //
    // Import local module
    try {
      Node[db.class] = require("./" + db.class.toLowerCase());
      //
      // Create datamodel from config
      var dbobj = new Node[db.class](this, db);
      this.datamodels.push(dbobj);
    }
    catch (e) {
      this.log("ERROR", "Error creating datamodel " + db.name + ": " + e,
              {source: "Node.CloudServer.prototype.createDataModels"});
    }
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
