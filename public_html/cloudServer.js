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
Node.Server = require("./server");
Node.Logger = require("./logger");


/**
 * @class Definition of Cloud Connector object
 */
Node.CloudServer = function ()
{
  this.servers = [];        // List of servers (IDE/apps)
  this.datamodels = [];     // List of datamodels (DBs)
  this.fileSystems = [];    // List of file systems
  this.plugins = [];        // List of plugins
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
  let options = {hostname: "console.instantdevelopercloud.com",
    path: "/CCC/?mode=rest&cmd=serverURL&user=" + username,
    method: "GET"
  };
  //
  let req = Node.https.request(options, function (res) {
    let data = "";
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
  let file = Node.fs.readFileSync("config.json", {encoding: "utf8"});
  //
  // If the read is successful the variable "file" contains the content of config.json
  if (!file)
    return this.log("ERROR", "Error reading the configuration",
            {source: "Node.CloudServer.prototype.loadConfig"});
  //
  try {
    let config = JSON.parse(file);
    this.name = config.name;
    //
    this.createDataModels(config);
    this.createFileSystems(config);
    this.createPlugins(config);
    this.createServers(config);
    //
    this.log("INFO", "Configuration loaded with success");
    //
    // Resave the config because the passwords have been encrypted
    Node.fs.writeFileSync("config.json", JSON.stringify(config, null, 2), {encoding: "utf8"});
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
  for (let i = 0; i < config.remoteServers.length; i++)
    this.createServer(config.remoteServers[i]);
  //
  // Next, attach "IDE" servers
  for (let i = 0; i < config.remoteUserNames.length; i++) {
    let uname = config.remoteUserNames[i];
    //
    // Handled formats: http://domain, http://domain@username, username
    if (uname.startsWith("http://") || uname.startsWith("https://")) {
      let parts = uname.split("@");
      this.createServer(parts[0], parts[1]);
    }
    else
      this.createServer(undefined, uname);
  }
};


/**
 * Start a client
 * @param {String} srvUrl
 * @param {String} username
 */
Node.CloudServer.prototype.createServer = function (srvUrl, username)
{
  if (srvUrl) {
    // Create the server and connect it
    let cli = new Node.Server(this, srvUrl);
    //
    // Set ideUserName without organization
    if (username)
      cli.ideUserName = username.split("/").pop();
    //
    cli.connect();
    //
    // Add server to list
    this.servers.push(cli);
  }
  else {
    // Ask the InDe console where is this user
    Node.CloudServer.serverForUser(username, function (srvUrl, error) {
      if (error)
        return this.log("ERROR", "Can't locate the server for the user " + username + ": " + error);
      //
      if (!srvUrl)
        return this.log("WARNING", "Can't locate the server for the user " + username);
      //
      this.createServer(srvUrl, username);
    }.bind(this));
  }
};


/**
 * Create all the datamodels
 * @param {Object} config
 */
Node.CloudServer.prototype.createDataModels = function (config)
{
  if (!config.datamodels)
    return;
  //
  // Create all connections
  Node.Utils = require("./utils");
  for (let i = 0; i < config.datamodels.length; i++) {
    let db = config.datamodels[i];
    //
    // Import local module
    try {
      Node[db.class] = require("./db/" + db.class.toLowerCase());
      //
      // Try to decrypt password
      if (db.connectionOptions.password) {
        try {
          db.connectionOptions.password = Node.Utils.decrypt(db.connectionOptions.password);
        }
        catch (e) {
        }
      }
      //
      // Create datamodel from config
      let dbobj = new Node[db.class](this, db);
      this.datamodels.push(dbobj);
      //
      // Encrypt the password
      if (db.connectionOptions.password) {
        db.connectionOptions = Object.assign({}, db.connectionOptions);
        db.connectionOptions.password = Node.Utils.encrypt(db.connectionOptions.password);

      }
    }
    catch (e) {
      this.log("ERROR", "Error creating datamodel " + db.name + ": " + e,
              {source: "Node.CloudServer.prototype.createDataModels"});
    }
  }
};


/**
 * Create all file systems
 * @param {Object} config
 */
Node.CloudServer.prototype.createFileSystems = function (config)
{
  if (!config.fileSystems)
    return;
  //
  // Create all connections
  for (let i = 0; i < config.fileSystems.length; i++) {
    let fs = config.fileSystems[i];
    //
    // Import local module
    try {
      Node.NodeDriver = require("./fs/nodedriver");
      //
      // Create file system from config
      let fsobj = new Node.NodeDriver(this, fs);
      this.fileSystems.push(fsobj);
    }
    catch (e) {
      this.log("ERROR", "Error creating file system " + fs.name + ": " + e,
              {source: "Node.CloudServer.prototype.createFS"});
    }
  }
};


/**
 * Create all plugins
 * @param {Object} config
 */
Node.CloudServer.prototype.createPlugins = function (config)
{
  if (!config.plugins)
    return;
  //
  // Create all connections
  for (let i = 0; i < config.plugins.length; i++) {
    let plugin = config.plugins[i];
    //
    // Import local module
    try {
      Node[plugin.class] = require("./plugins/" + plugin.class.toLowerCase() + "/index");
      //
      // Create datamodel from config
      let pluginobj = new Node[plugin.class](this, plugin);
      this.plugins.push(pluginobj);
    }
    catch (e) {
      this.log("ERROR", "Error creating plugin " + plugin.name + ": " + e,
              {source: "Node.CloudServer.prototype.createPlugins"});
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
  for (let i = 0; i < this.datamodels.length; i++) {
    let dm = this.datamodels[i];
    if (dm.name === dmname)
      return dm;
  }
};


/**
 * Returns a file system with a specific name
 * @param {String} fsname
 */
Node.CloudServer.prototype.getFileSystemByName = function (fsname)
{
  // Get the right file system
  for (let i = 0; i < this.fileSystems.length; i++) {
    let fs = this.fileSystems[i];
    if (fs.name === fsname)
      return fs;
  }
};


/**
 * Returns a plugin with a specific name
 * @param {String} pluginName
 */
Node.CloudServer.prototype.getPluginByName = function (pluginName)
{
  // Get the right plugin
  for (let i = 0; i < this.plugins.length; i++) {
    let plugin = this.plugins[i];
    if (plugin.name === pluginName)
      return plugin;
  }
};


/**
 * Notified when a server disconnects
 * @param {Server} server
 */
Node.CloudServer.prototype.onServerDisconnected = function (server)
{
  // Notify to all datamodels that a server is disconnected
  for (let i = 0; i < this.datamodels.length; i++)
    this.datamodels[i].onServerDisconnected(server);
  //
  // Notify to all filesystems that a server is disconnected
  for (let i = 0; i < this.fileSystems.length; i++)
    this.fileSystems[i].onServerDisconnected(server);
  //
  // Notify to all plugins that a server is disconnected
  for (let i = 0; i < this.plugins.length; i++)
    this.plugins[i].onServerDisconnected(server);
};


// Start the server
new Node.CloudServer().start();
