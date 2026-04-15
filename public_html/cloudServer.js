/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

var Node = Node || {};

// Import global modules
Node.fs = require("fs").promises;
Node.https = require("https");

// Import local modules
Node.Server = require("./server");
Node.Logger = require("./logger");
Node.Utils = require("./utils");


/**
 * @class Node.CloudServer
 * @classdesc
 * Main server class for Instant Developer Cloud Connector.
 * Acts as a reverse proxy that allows databases and file systems to initiate
 * secure connections to cloud applications rather than exposing ports to the internet.
 *
 * Key features:
 * - **Multi-tenant architecture**: Supports multiple databases, file systems, and plugins simultaneously
 * - **WebSocket communication**: Uses Socket.IO for real-time message passing instead of REST APIs
 * - **Dynamic configuration**: Supports hot-reloading of configuration without service restart
 * - **Security**: API key-based authentication for all resources
 * - **Extensibility**: Plugin system for additional functionality (e.g., Active Directory)
 *
 * @property {Array} servers - List of connected remote servers (IDE/apps)
 * @property {Array} datamodels - List of configured database connections
 * @property {Array} fileSystems - List of configured file system shares
 * @property {Array} plugins - List of loaded plugins
 * @property {Node.Logger} logger - Logger instance for centralized logging
 * @property {String} id - Unique identifier for this Cloud Connector instance
 * @property {String} name - Name of this Cloud Connector from configuration
 * @property {String} remoteConfigurationKey - Security key for remote configuration changes
 */
Node.CloudServer = function ()
{
  this.servers = [];
  this.datamodels = [];
  this.fileSystems = [];
  this.plugins = [];
  this.logger = new Node.Logger();
  this.id = require("crypto").randomUUID();
};


/**
 * Message types used for communication between Cloud Connector and remote servers
 * @enum {String}
 */
Node.CloudServer.messageTypes = {
  /** Initial handshake message sent when server connects */
  init: "init",
  /** Response message for command execution results */
  response: "response"
};

/**
 * Command types supported by the Cloud Connector for remote management
 * @enum {String}
 */
Node.CloudServer.commandTypes = {
  /** Restart the Cloud Connector service */
  restart: "restart",
  /** Change configuration dynamically without restart */
  changeConfig: "changeConfig",
  /** Update source code and optionally restart */
  changeCode: "changeCode",
  /** Keep-alive ping command */
  ping: "ping"
};


/**
 * Starts the Cloud Connector server.
 * Initializes the configuration and sets up global error handlers.
 * This is the main entry point for the application.
 */
Node.CloudServer.prototype.start = async function ()
{
  this.log("INFO", `Start Cloud Connector with id=${this.id}`);
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
 * Logs a message using the centralized logger.
 * @param {String} level - Log level (ERROR, WARNING, INFO, DEBUG)
 * @param {String} message - Message to log
 * @param {Object} [data] - Additional data to log
 */
Node.CloudServer.prototype.log = function (level, message, data)
{
  this.logger.log(level, message, data);
};


/**
 * Queries the Instant Developer Cloud console to find which server hosts a specific user.
 * @param {String} username - Username to look up
 * @returns {Promise<String>} Server URL hosting the user
 * @throws {Error} If user cannot be located or request fails
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
 * Loads and processes the configuration for the Cloud Connector.
 * Handles environment variable replacement, password encryption/decryption,
 * and initializes all configured resources (datamodels, file systems, plugins, servers).
 * @param {Object} [config] - Configuration object, defaults to reading config.json
 */
Node.CloudServer.prototype.loadConfig = async function (config)
{
  config = config || require("./config.json");
  //
  let resolvedConfig = JSON.parse(JSON.stringify(config));
  Node.Utils.replaceEnvVariables(resolvedConfig);
  //
  let key = resolvedConfig.passwordPrivateKey;
  Node.Utils.processPasswords(resolvedConfig, key);
  //
  this.configChanged = (this.name !== resolvedConfig.name);
  this.name = resolvedConfig.name;
  //
  if (resolvedConfig.remoteConfigurationKey === "00000000-0000-0000-0000-000000000000")
    this.log("WARNING", "The remoteConfigurationKey is set to the default value and will be ignored");
  else {
    if (resolvedConfig.remoteConfigurationKey?.length < 36)
      this.log("WARNING", " The remoteConfigurationKey is shorter than 36 characters. This may weaken security. It is recommended to use a key of at least 36 characters for better robustness.");
    this.remoteConfigurationKey = resolvedConfig.remoteConfigurationKey;
  }
  //
  await this.createDataModels(resolvedConfig);
  await this.createFileSystems(resolvedConfig);
  await this.createPlugins(resolvedConfig);
  await this.createServers(resolvedConfig);
  delete this.configChanged;
  //
  this.log("INFO", "Configuration loaded with success");
  //
  // Resave the config with the passwords encrypted
  Node.Utils.processPasswords(config, key, true);
  await Node.fs.writeFile("config.json", JSON.stringify(config, null, 2), {encoding: "utf8"});
};


/**
 * Creates and connects all configured remote servers.
 * Handles both application servers and IDE user connections.
 * Disconnects from servers that are no longer in configuration.
 * @param {Object} config - Configuration object containing remoteServers and remoteUserNames
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
 * Creates and connects a single server instance.
 * Reuses existing connections when possible, queries console for user location if needed.
 * @param {String} [srvUrl] - Server URL, can be null for username-based lookup
 * @param {String} [username] - Username for IDE connections
 * @param {Object} [options] - Connection options
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
 * Creates all configured database connections (datamodels).
 * Initializes new datamodels and removes ones no longer in configuration.
 * @param {Object} config - Configuration object containing datamodels array
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
 * Creates a single datamodel instance.
 * Loads the appropriate database driver class and initializes the connection.
 * Reuses existing datamodels when configuration hasn't changed.
 * @param {Object} config - Datamodel configuration (name, class, APIKey, connectionOptions)
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
 * Creates all configured file system shares.
 * Initializes new file systems and removes ones no longer in configuration.
 * @param {Object} config - Configuration object containing fileSystems array
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
 * Creates a single file system instance.
 * Initializes the NodeDriver for file system operations.
 * @param {Object} config - File system configuration (name, path, permissions, APIKey)
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
    //
    // Create fileSystem from config
    let f = new Node.NodeDriver(this, config);
    this.fileSystems.push(f);
    this.log("INFO", `FileSystem '${f.name}' initialized`);
    this.configChanged = true;
  }
  catch (e) {
    this.log("ERROR", `Error creating file system ${config.name}: ${e}`,
            {source: "Node.CloudServer.prototype.createFileSystem"});
  }
};


/**
 * Creates all configured plugins.
 * Initializes new plugins and removes ones no longer in configuration.
 * @param {Object} config - Configuration object containing plugins array
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
 * Creates a single plugin instance.
 * Loads the plugin class from the plugins directory.
 * @param {Object} config - Plugin configuration (name, class, APIKey)
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
 * Finds and returns a datamodel by its name.
 * @param {String} name - Name of the datamodel to find
 * @returns {Node.DataModel} The datamodel instance or undefined if not found
 */
Node.CloudServer.prototype.dataModelByName = function (name)
{
  return this.datamodels.find(d => d.name === name);
};


/**
 * Finds and returns a file system by its name.
 * @param {String} name - Name of the file system to find
 * @returns {Node.NodeDriver} The file system instance or undefined if not found
 */
Node.CloudServer.prototype.getFileSystemByName = function (name)
{
  return this.fileSystems.find(f => f.name === name);
};


/**
 * Finds and returns a plugin by its name.
 * @param {String} name - Name of the plugin to find
 * @returns {Node.Plugin} The plugin instance or undefined if not found
 */
Node.CloudServer.prototype.getPluginByName = function (name)
{
  return this.plugins.find(p => p.name === name);
};


/**
 * Event handler called when a remote server establishes connection.
 * Sends initialization message with all available resources (datamodels, file systems, plugins).
 * @param {Node.Server} server - The connected server instance
 */
Node.CloudServer.prototype.onServerConnected = function (server)
{
  // Send list of databases supported by this connector
  let msg = {
    type: Node.CloudServer.messageTypes.init,
    data: {
      id: this.id,
      name: this.name,
      version: require("./package.json").version,
      nodeVersion: process.version,
      hostname: require("os").hostname(),
      dmlist: this.datamodels.map(def => {
        return {
          name: def.name,
          class: def.class,
          key: def.APIKey
        };
      }),
      //
      // Send list of file systems supported by this connector
      fslist: this.fileSystems.map(def => {
        return {
          name: def.name,
          path: def.path,
          permissions: def.permissions,
          key: def.APIKey
        };
      }),
      //
      // Send list of plugins supported by this connector
      pluginslist: this.plugins.map(def => {
        return {
          name: def.name,
          class: def.class,
          key: def.APIKey
        };
      })
    }
  };
  //
  server.sendMessage(msg);
};


/**
 * Event handler called when a remote server disconnects.
 * Notifies all resources (datamodels, file systems, plugins) about the disconnection.
 * @param {Node.Server} server - The disconnected server instance
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
 * Event handler for incoming messages from remote servers.
 * Routes messages to appropriate resources (datamodels, file systems, plugins) based on message type.
 * @param {Node.Server} server - The server that sent the message
 * @param {Object} data - Message data containing command and parameters
 * @returns {Promise<Object>} Response message with execution result or error
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
 * Processes Cloud Connector management commands.
 * Handles restart, configuration changes, code updates, and ping operations.
 * @param {Object} msg - Message containing command type and arguments
 * @throws {Error} If command type is unknown
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
 * Validates the remote configuration key for security-sensitive operations.
 * @param {String} key - The key to validate against remoteConfigurationKey
 * @param {String} operation - Operation name for error message
 * @throws {Error} If key is invalid or remote configuration is not enabled
 */
Node.CloudServer.prototype.checkRemoteConfigurationKey = function (key, operation)
{
  if (!this.remoteConfigurationKey)
    throw new Error(`${operation} is not allowed.\nFor allow it you need to set the remoteConfigurationKey in the config.`);
  //
  if (key !== this.remoteConfigurationKey)
    throw new Error("Key for remote configuration is wrong");
};


/**
 * Restarts the Cloud Connector service.
 * Validates remote configuration key before executing restart script.
 * @param {Object} [msg] - Message containing restart options and security key
 */
Node.CloudServer.prototype.restart = async function (msg)
{
  // Check the key
  if (msg) {
    let options = msg.args[0];
    this.checkRemoteConfigurationKey(options?.key, "Restart");
  }
  //
  // Execute restart
  await Node.Utils.executeScript("restart.bat", this.logger, {detached: true});
  this.logger.log("Restart initiated successfully");
};


/**
 * Dynamically updates the Cloud Connector configuration without restart.
 * Validates remote configuration key before applying changes.
 * @param {Object} msg - Message containing new configuration and security key
 */
Node.CloudServer.prototype.changeConfig = async function (msg)
{
  // Check the key
  let options = msg.args[1];
  this.checkRemoteConfigurationKey(options?.key, "Change of config");
  //
  let config = msg.args[0];
  if (typeof config === "string")
    config = JSON.parse(config);
  //
  await this.loadConfig(config);
};


/**
 * Updates the Cloud Connector source code remotely.
 * Unpacks new code from tar archive, updates node modules, and optionally restarts.
 * Includes security checks to prevent path traversal attacks.
 * @param {Object} msg - Message containing tar archive buffer, options, and security key
 */
Node.CloudServer.prototype.changeCode = async function (msg)
{
  // Check the key
  let options = msg.args[1];
  this.checkRemoteConfigurationKey(options?.key, "Change of source code");
  //
  // Validate and sanitize extraction path
  let path = require("path");
  let extractPath = path.resolve(__dirname);
  //
  // Unpack new source code with proper validation
  let tar = require("tar");
  let unpack = tar.extract({
    cwd: extractPath,
    // Additional security options
    strip: 0,
    onentry: entry => {
      // Validate each entry to prevent path traversal
      let entryPath = path.resolve(extractPath, entry.path);
      if (!entryPath.startsWith(extractPath)) {
        entry.abort();
        throw new Error(`Security: Path traversal attempt detected in tar entry: ${entry.path}`);
      }
    }
  });
  //
  await new Promise((resolve, reject) => {
    unpack.on("close", resolve);
    unpack.on("error", reject);
    Node.Utils.bufferToStream(msg.args[0]).pipe(unpack);
  });
  //
  this.logger.log("Source code unpacked successfully");
  //
  // Update node_modules using secure script execution
  await Node.Utils.executeScript("update_node_modules.bat", this.logger);
  this.logger.log("Node modules updated successfully");
  //
  // Restart if required
  if (options.restart)
    await this.restart();
};


/**
 * Handles ping command for keep-alive purposes.
 * Does nothing but acknowledge the message.
 * @param {Object} msg - Ping message
 */
Node.CloudServer.prototype.ping = function (msg)
{
};


// Start the server
new Node.CloudServer().start();
