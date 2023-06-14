/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global process, child_process, Promise, __dirname */

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
  //
  process.on("uncaughtException", e => console.error("uncaughtException", e));
  process.on("unhandledRejection", e => console.error("unhandledRejection", e));
};


/**
 * Logs a message
 * @param {String} level
 * @param {String} message
 * @param {Object} data
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
    let req = Node.https.request(options, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
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
    config = JSON.parse(file, (k, v) => {
      if (typeof v !== "string")
        return v;
      //
      // Replace environment variables
      let res = v.split("%").map((v, i) => {
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
  config = JSON.parse(file, (k, v) => {
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
  for (let s of config.remoteServers)
    await this.createServer(s);
  //
  // Next, attach "IDE" servers
  for (let uname of config.remoteUserNames) {
    let url;
    //
    // Handled formats: http://domain, http://domain@username, username
    if (uname.startsWith("http://") || uname.startsWith("https://"))
      [url, uname] = uname.split("@");
    //
    await this.createServer(url, uname, config.connectionOptions);
  }
  //
  // Disconnect from the remaining servers
  this.oldServers.forEach(s => s.disconnect());
  delete this.oldServers;
};


/**
 * Start a client
 * @param {String} srvUrl
 * @param {String} username
 * @param {Object} options
 */
Node.CloudServer.prototype.createServer = async function (srvUrl, username, options)
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
  s.connect(options);
};


/**
 * Create all the datamodels
 * @param {Object} config
 */
Node.CloudServer.prototype.createDataModels = async function (config)
{
  this.oldDatamodels = this.datamodels.slice();
  //
  config.datamodels?.forEach(dm => this.createDataModel(dm));
  //
  // Disconnect from the remaining datamodels
  for (let d of this.oldDatamodels) {
    this.configChanged = true;
    await d.disconnect();
    this.log("INFO", `Datamodel '${d.name}' removed`);
  }
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
      //
      // Verify if the password is changed
      if (JSON.stringify(d.connectionOptions) !== JSON.stringify(config.connectionOptions)) {
        d.connectionOptions = config.connectionOptions;
        this.configChanged = true;
      }
      //
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
  config.fileSystems?.forEach(fs => this.createFileSystem(fs));
  //
  // Disconnect from the remaining fileSytems
  for (let fs of this.oldFileSystems) {
    this.configChanged = true;
    await fs.disconnect();
    this.log("INFO", `FileSystem '${fs.name}' removed`);
  }
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
  config.plugins?.forEach(p => this.createPlugin(p));
  //
  // Disconnect from the remaining plugins
  for (let p of this.oldPlugins) {
    this.configChanged = true;
    await p.disconnect();
    this.log("INFO", `Plugin '${p.name}' removed`);
  }
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
    Node[config.class] = require(`./plugins/${config.class.toLowerCase()}/index`);
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
  msg.data.dmlist = this.datamodels.map(def => {
    return {
      name: def.name,
      "class": def.class,
      key: def.APIKey
    };
  });
  //
  // Send list of file systems supported by this connector
  msg.data.fslist = this.fileSystems.map(def => {
    return {
      name: def.name,
      path: def.path,
      permissions: def.permissions,
      key: def.APIKey
    };
  });
  //
  // Send list of plugins supported by this connector
  msg.data.pluginslist = this.plugins.map(def => {
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
Node.CloudServer.prototype.onServerDisconnected = async function (server)
{
  // Notify to all datamodels that a server is disconnected
  for (let dm of this.datamodels)
    await dm.onServerDisconnected(server);
  //
  // Notify to all filesystems that a server is disconnected
  for (let fs of this.fileSystems)
    await fs.onServerDisconnected(server);
  //
  // Notify to all plugins that a server is disconnected
  for (let p of this.plugins)
    await p.onServerDisconnected(server);
};


/**
 * Notified when received a message from a server
 * @param {Server} server
 * @param {Object} data
 */
Node.CloudServer.prototype.onServerMessage = async function (server, data)
{
  let startTime = new Date();
  //
  // Compose the message of response
  let msg = {
    type: Node.CloudServer.messageTypes.response,
    sid: data.sid,
    dmid: data.dmid,
    appid: data.appid,
    cbid: data.cbid,
    data: {
      name: this.name
    }
  };
  data.server = server;
  try {
    let result;
    if (data.dm) {
      let dm = this.dataModelByName(data.dm);
      if (!dm)
        throw new Error(`Datamodel '${data.dm}' not found`);
      //
      // Ask the datamodel
      result = await dm.onMessage(data);
      if (result?.times)
        result.times.cc = (new Date()).getTime() - startTime.getTime();
    }
    else if (data.fs) {
      msg.fs = true;
      let fs = this.getFileSystemByName(data.fs);
      if (!fs)
        throw new Error(`File system '${data.fs}' not found`);
      //
      result = await fs.onMessage(data);
    }
    else if (data.plugin) {
      msg.plugin = true;
      let plugin = this.getPluginByName(data.plugin);
      if (!plugin)
        throw new Error(`Plugin '${data.plugin}' not found`);
      //
      result = await plugin.onMessage(data);
    }
    else if (data.app) {
      msg.app = true;
      result = await this.onMessage(data);
    }
    else
      throw new Error(`Command '${data.cmd}' unknown`);
    //
    msg.data.result = result;
  }
  catch (e) {
    e = e.message || e.toString();
    this.log("ERROR", `Error executing '${data.cmd}': ${e}`);
    msg.data.error = e;
  }
  //
  server.sendMessage(msg);
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
  let child_process = require("child_process");
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
  const util = require("util");
  const execFile = util.promisify(require("child_process").execFile);
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
