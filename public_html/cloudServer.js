/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global process, Promise, __dirname */

var Node = Node || {};

// Import global modules
Node.fs = require("fs").promises;
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


Node.CloudServer.messageTypes = {
  init: "init",
  response: "response"
};

Node.CloudServer.commandTypes = {
  restart: "restart",
  changeConfig: "changeConfig",
  changeCode: "changeCode",
  ping: "ping"
};


/**
 * Start the cloud connector
 */
Node.CloudServer.prototype.start = async function ()
{
  this.log("INFO", "Start Cloud Connector");
  try {
    await this.loadConfig();
  }
  catch (ex) {
    this.log("ERROR", ex.message);
  }
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
Node.CloudServer.serverForUser = async function (username)
{
  return await new Promise((resolve, reject) => {
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
          reject(data);
        else
          resolve(data);
      });
    });
    req.on("error", reject);
    req.end();
  });
};


/**
 * Read the JSON of the configuration from the file config.json
 * @param {String/Object} newConfig
 */
Node.CloudServer.prototype.loadConfig = async function (newConfig)
{
  let file;
  try {
    if (newConfig)
      file = JSON.stringify(newConfig);
    else
      file = await Node.fs.readFile("config.json", {encoding: "utf8"});
  }
  catch (e) {
    throw new Error("Error reading the configuration");
  }
  //
  // If the read is successful the variable "file" contains the content of config.json
  let config;
  try {
    Node.Utils = require("./utils");
    config = JSON.parse(file, function (k, v) {
      if (typeof v !== "string")
        return v;
      //
      // Replace environment variables
      let res = v.split("%").map(function (v, i) {
        if (i % 2 && v in process.env)
          return process.env[v];
        else
          return v;
      }).join("");
      //
      // Try to decrypt passwords
      if (k === "password" && v) {
        try {
          res = Node.Utils.decrypt(v);
        }
        catch (e) {
        }
      }
      //
      return res;
    });
  }
  catch (e) {
    throw new Error(`Error parsing the configuration: ${e}\n${e.stack}`);
  }
  //
  this.configChanged = (this.name !== config.name);
  this.name = config.name;
  if (config.remoteConfigurationKey !== "00000000-0000-0000-0000-000000000000")
    this.remoteConfigurationKey = config.remoteConfigurationKey;
  //
  await this.createDataModels(config);
  await this.createFileSystems(config);
  await this.createPlugins(config);
  await this.createServers(config);
  delete this.configChanged;
  //
  this.log("INFO", "Configuration loaded with success");
  //
  // Reparse the config for mantain the environment variables
  config = JSON.parse(file, function (k, v) {
    if (typeof v !== "string" || k !== "password" || !v)
      return v;
    //
    let res;
    try {
      Node.Utils.decrypt(v);
      res = v;
    }
    catch (e) {
      res = Node.Utils.encrypt(v);
    }
    return res;
  });
  //
  // Resave the config because the passwords have been encrypted
  await Node.fs.writeFile("config.json", JSON.stringify(config, null, 2), {encoding: "utf8"});
};


/**
 * Start all the clients
 * @param {Object} config
 */
Node.CloudServer.prototype.createServers = async function (config)
{
  this.oldServers = this.servers.slice();
  //
  // First attach app servers
  for (let i = 0; i < config.remoteServers.length; i++)
    await this.createServer(config.remoteServers[i]);
  //
  // Next, attach "IDE" servers
  for (let i = 0; i < config.remoteUserNames.length; i++) {
    let uname = config.remoteUserNames[i];
    //
    // Handled formats: http://domain, http://domain@username, username
    if (uname.startsWith("http://") || uname.startsWith("https://")) {
      let parts = uname.split("@");
      await this.createServer(parts[0], parts[1]);
    }
    else
      await this.createServer(undefined, uname);
  }
  //
  // Disconnect from the remaining servers
  this.oldServers.forEach(function (s) {
    s.disconnect();
  });
  delete this.oldServers;
};


/**
 * Start a client
 * @param {String} srvUrl
 * @param {String} username
 */
Node.CloudServer.prototype.createServer = async function (srvUrl, username)
{
  if (username) {
    if (!srvUrl) {
      // Ask the InDe console where is this user
      try {
        srvUrl = await Node.CloudServer.serverForUser(username);
        if (!srvUrl)
          return this.log("WARNING", `Can't locate the server for the user ${username}`);
      }
      catch (e) {
        return this.log("ERROR", `Error locating the server for the user ${username}: ${e}`);
      }
    }
    //
    username = username.split("/").pop();
  }
  //
  // Check if server already exists
  for (let i = 0; i < this.oldServers.length; i++) {
    let s = this.oldServers[i];
    if (s.serverUrl === srvUrl && s.ideUserName === username) {
      this.oldServers.splice(i, 1);
      //
      // If config is changed resend init event
      if (this.configChanged)
        this.onServerConnected(s);
      //
      return;
    }
  }
  //
  // Create the server and connect it
  let s = new Node.Server(this, srvUrl, username);
  this.servers.push(s);
  //
  s.connect();
};


/**
 * Create all the datamodels
 * @param {Object} config
 */
Node.CloudServer.prototype.createDataModels = async function (config)
{
  this.oldDatamodels = this.datamodels.slice();
  //
  if (config.datamodels)
    config.datamodels.forEach(this.createDataModel.bind(this));
  //
  // Disconnect from the remaining datamodels
  await Promise.all(this.oldDatamodels.map(async function (d) {
    this.configChanged = true;
    await d.disconnect();
    this.log("INFO", `Datamodel '${d.name}' removed`);
  }.bind(this)));
  delete this.oldDatamodels;
};


/**
 * Create a dataModel
 * @param {Object} config
 */
Node.CloudServer.prototype.createDataModel = function (config)
{
  // Check if datamodel already exists
  for (let i = 0; i < this.oldDatamodels.length; i++) {
    let d = this.oldDatamodels[i];
    if (d.name === config.name) {
      this.oldDatamodels.splice(i, 1);
      if (d.APIKey !== config.APIKey)
        this.configChanged = true;
      return;
    }
  }
  //
  try {
    // Import local module
    Node[config.class] = require("./db/" + config.class.toLowerCase());
  }
  catch (e) {
    this.log("ERROR", `Error creating datamodel ${config.name}: ${e}`,
            {source: "Node.CloudServer.prototype.createDataModels"});
  }
  //
  // Create datamodel from config
  let d = new Node[config.class](this, config);
  this.datamodels.push(d);
  this.log("INFO", `Datamodel '${d.name}' initialized`);
  this.configChanged = true;
};


/**
 * Create all fileSystems
 * @param {Object} config
 */
Node.CloudServer.prototype.createFileSystems = async function (config)
{
  this.oldFileSystems = this.fileSystems.slice();
  //
  if (config.fileSystems)
    config.fileSystems.forEach(this.createFileSystem.bind(this));
  //
  // Disconnect from the remaining fileSytems
  await Promise.all(this.oldFileSystems.map(async function (f) {
    this.configChanged = true;
    await f.disconnect();
    this.log("INFO", `FileSystem '${f.name}' removed`);
  }.bind(this)));
  delete this.oldFileSystems;
};


/**
 * Create a fileSystem
 * @param {Object} config
 */
Node.CloudServer.prototype.createFileSystem = function (config)
{
  // Check if fileSystem already exists
  for (let i = 0; i < this.oldFileSystems.length; i++) {
    let f = this.oldFileSystems[i];
    if (f.name === config.name) {
      this.oldFileSystems.splice(i, 1);
      if (f.APIKey !== config.APIKey)
        this.configChanged = true;
      return;
    }
  }
  //
  try {
    // Import local module
    Node.NodeDriver = require("./fs/nodedriver");
  }
  catch (e) {
    this.log("ERROR", `Error creating file system ${config.name}: ${e}`,
            {source: "Node.CloudServer.prototype.createFS"});
  }
  //
  // Create fileSystem from config
  let f = new Node.NodeDriver(this, config);
  this.fileSystems.push(f);
  this.log("INFO", `FileSystem '${f.name}' initialized`);
  this.configChanged = true;
};


/**
 * Create all plugins
 * @param {Object} config
 */
Node.CloudServer.prototype.createPlugins = async function (config)
{
  this.oldPlugins = this.plugins.slice();
  //
  if (config.plugins)
    config.plugins.forEach(this.createPlugin.bind(this));
  //
  // Disconnect from the remaining plugins
  await Promise.all(this.oldPlugins.map(async function (p) {
    this.configChanged = true;
    await p.disconnect();
    this.log("INFO", `Plugin '${p.name}' removed`);
  }.bind(this)));
  delete this.oldPlugins;
};


/**
 * Create a plugin
 * @param {Object} config
 */
Node.CloudServer.prototype.createPlugin = function (config)
{
  // Check if plugin already exists
  for (let i = 0; i < this.oldPlugins.length; i++) {
    let p = this.oldPlugins[i];
    if (p.name === config.name) {
      this.oldPlugins.splice(i, 1);
      if (p.APIKey !== config.APIKey)
        this.configChanged = true;
      return;
    }
  }
  //
  try {
    // Import local module
    Node[config.class] = require("./plugins/" + config.class.toLowerCase() + "/index");
  }
  catch (e) {
    this.log("ERROR", `Error creating plugin ${config.name}: ${e}`,
            {source: "Node.CloudServer.prototype.createPlugins"});
  }
  //
  // Create plugin from config
  let p = new Node[config.class](this, config);
  this.plugins.push(p);
  this.log("INFO", `Plugin '${p.name}' initialized`);
  this.configChanged = true;
};


/**
 * Returns a datamodel with a specific name
 * @param {String} name
 */
Node.CloudServer.prototype.dataModelByName = function (name)
{
  return this.datamodels.find(d => d.name === name);
};


/**
 * Returns a file system with a specific name
 * @param {String} name
 */
Node.CloudServer.prototype.getFileSystemByName = function (name)
{
  return this.fileSystems.find(f => f.name === name);
};


/**
 * Returns a plugin with a specific name
 * @param {String} name
 */
Node.CloudServer.prototype.getPluginByName = function (name)
{
  return this.plugins.find(p => p.name === name);
};


/**
 * Notified when a server connects
 * @param {Server} server
 */
Node.CloudServer.prototype.onServerConnected = function (server)
{
  // Send list of databases supported by this connector
  let msg = {};
  msg.type = Node.CloudServer.messageTypes.init;
  msg.data = {};
  msg.data.name = this.name;
  msg.data.version = require("./package.json").version;
  msg.data.nodeVersion = process.version;
  msg.data.hostname = require("os").hostname();
  msg.data.dmlist = this.datamodels.map(function (def) {
    return {
      name: def.name,
      "class": def.class,
      key: def.APIKey
    };
  });
  //
  // Send list of file systems supported by this connector
  msg.data.fslist = this.fileSystems.map(function (def) {
    return {
      name: def.name,
      path: def.path,
      permissions: def.permissions,
      key: def.APIKey
    };
  });
  //
  // Send list of plugins supported by this connector
  msg.data.pluginslist = this.plugins.map(function (def) {
    return {
      name: def.name,
      "class": def.class,
      key: def.APIKey
    };
  });
  //
  server.sendMessage(msg);
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


/**
 * Notified when received a message from a server
 * @param {Server} server
 * @param {Object} data
 */
Node.CloudServer.prototype.onServerMessage = function (server, data)
{
  let done = function (result, error) {
    if (error) {
      error = error.message || error.toString();
      this.log("ERROR", `Error executing '${data.cmd}': ${error}`);
    }
    //
    if (!data.cbid)
      return;
    //
    if (error)
      msg.data.error = error;
    else
      msg.data.result = result;
    server.sendMessage(msg);
  }.bind(this);
  //
  let startTime = new Date();
  //
  // Compose the message of response
  let msg = {};
  msg.type = Node.CloudServer.messageTypes.response;
  msg.sid = data.sid;
  msg.dmid = data.dmid;
  msg.appid = data.appid;
  msg.cbid = data.cbid;
  msg.data = {};
  msg.data.name = this.name;
  data.server = server;
  if (data.dm) {
    let dm = this.dataModelByName(data.dm);
    if (!dm)
      return done(null, new Error(`Datamodel '${data.dm}' not found`));
    //
    // Ask the datamodel
    dm.onMessage(data, function (result, error) {
      if (error)
        return done(null, error);
      //
      if (result && result.times)
        result.times.cc = (new Date()).getTime() - startTime.getTime();
      //
      done(result);
    });
  }
  else if (data.fs) {
    msg.fs = true;
    let fs = this.getFileSystemByName(data.fs);
    if (!fs)
      return done(null, new Error(`File system '${data.fs}' not found`));
    //
    fs.onMessage(data, function (result, error) {
      Array.prototype.slice.apply(arguments).forEach(function (a, i) {
        if (a instanceof Error) {
          error = a;
          result = null;
        }
      });
      //
      done(result, error);
    });
  }
  else if (data.plugin) {
    msg.plugin = true;
    let plugin = this.getPluginByName(data.plugin);
    if (!plugin)
      return done(null, new Error(`Plugin '${data.plugin}' not found`));
    //
    plugin.onMessage(data, function (result, error) {
      Array.prototype.slice.apply(arguments).forEach(function (a, i) {
        if (a instanceof Error) {
          error = a;
          result = null;
        }
      });
      //
      done(result, error);
    });
  }
  else if (data.app) {
    msg.app = true;
    this.onMessage(data)
            .then(done)
            .catch(function (error) {
              done(null, error);
            });
  }
  else
    done(null, new Error(`Command '${data.cmd}' unknown`));
};


/**
 * Received a message
 * @param {Object} msg
 */
Node.CloudServer.prototype.onMessage = async function (msg)
{
  switch (msg.cmd) {
    case Node.CloudServer.commandTypes.restart:
      await this.restart(msg);
      break;

    case Node.CloudServer.commandTypes.changeConfig:
      await this.changeConfig(msg);
      break;

    case Node.CloudServer.commandTypes.changeCode:
      await this.changeCode(msg);
      break;

    case Node.CloudServer.commandTypes.ping:
      this.ping(msg);
      break;

    default:
      throw new Error(`Command '${msg.type}' unknown`);
      break;
  }
};


/**
 * Restart cloud connector
 * @param {Object} msg - message received
 */
Node.CloudServer.prototype.restart = async function (msg)
{
  if (msg) {
    // Check the key
    let options = msg.args[0];
    if (!this.remoteConfigurationKey)
      throw new Error("Restart is not allowed.\nFor allow it you need to set the remoteConfigurationKey in the config.");
    if (!options || options.key !== this.remoteConfigurationKey)
      throw new Error("Key for remote configuration is wrong");
  }
  //
  // Execute restart batch in another process
  child_process = require("child_process");
  if (process.platform === "win32")
    child_process.spawn(`${__dirname}/restart.bat`).unref();
  else {
    await Node.fs.chmod(`${__dirname}/restart.bat`, 0o777);
    child_process.spawn("bash", ["-c", `${__dirname}/restart.bat`]).unref();
  }
};


/**
 * Change the config
 * @param {Object} msg - message received
 */
Node.CloudServer.prototype.changeConfig = async function (msg)
{
  // Check the key
  let options = msg.args[1];
  if (!this.remoteConfigurationKey)
    throw new Error("Change of config is not allowed.\nFor allow it you need to set the remoteConfigurationKey in the config.");
  if (!options || options.key !== this.remoteConfigurationKey)
    throw new Error("Key for remote configuration is wrong");
  //
  await this.loadConfig(msg.args[0]);
};


/**
 * Change the config
 * @param {Object} msg - message received
 */
Node.CloudServer.prototype.changeCode = async function (msg)
{
  // Check the key
  let options = msg.args[1];
  if (!this.remoteConfigurationKey)
    throw new Error("Change of source code is not allowed.\nFor allow it you need to set the remoteConfigurationKey in the config.");
  if (!options || options.key !== this.remoteConfigurationKey)
    throw new Error("Key for remote configuration is wrong");
  //
  // Unpack new source code
  const tar = require("tar");
  let unpack = tar.extract({cwd: __dirname});
  await new Promise((resolve, reject) => {
    unpack.on("close", resolve);
    unpack.on("error", reject);
    Node.Utils.bufferToStream(msg.args[0]).pipe(unpack);
  });
  //
  // Update node_modules
  const util = require('util');
  const execFile = util.promisify(require('child_process').execFile);
  let batch = `${__dirname}/update_node_modules.bat`;
  if (process.platform === "win32")
    await execFile(batch, [], {cwd: __dirname});
  else {
    await Node.fs.chmod(batch, 0o777);
    await execFile("bash", ["-c", batch], {cwd: __dirname});
  }
  //
  // Restart if required
  if (options.restart)
    await this.restart();
};


/**
 * Do nothing
 * @param {Object} msg - message received
 */
Node.CloudServer.prototype.ping = function (msg)
{
};


// Start the server
new Node.CloudServer().start();
