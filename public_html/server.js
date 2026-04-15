/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
/* global module, Buffer */

var Node = Node || {};

// Import global modules
Node.io = require("socket.io-client");

/**
 * @class Node.Server
 * @classdesc
 * Socket.IO client that manages connections to remote Instant Developer Cloud servers.
 * Handles bidirectional WebSocket communication between the Cloud Connector and remote servers.
 * Supports both IDE user connections and application server connections.
 *
 * Key features:
 * - **WebSocket communication**: Uses Socket.IO for real-time message exchange
 * - **Automatic reconnection**: Configurable reconnection with exponential backoff
 * - **Event handling**: Manages connection lifecycle events (connect, disconnect, errors)
 * - **Message routing**: Forwards messages between Cloud Connector and remote servers
 * - **Security**: Sanitizes sensitive data in logs (passwords, API keys)
 *
 * @property {Node.CloudServer} parent - Parent CloudServer instance for callbacks
 * @property {String} serverUrl - URL of the remote server to connect to
 * @property {String} ideUserName - Username for IDE connections (optional)
 * @property {Object} socket - Socket.IO client instance
 *
 * @param {Node.CloudServer} parent - Parent CloudServer instance
 * @param {String} url - Server URL to connect to
 * @param {String} [username] - Username for IDE connections
 */
Node.Server = function (parent, url, username)
{
  this.parent = parent;
  this.serverUrl = url;
  this.ideUserName = username;
};


/**
 * Establishes connection to the remote server using Socket.IO.
 * Sets up all necessary event handlers for connection lifecycle and message handling.
 * Applies default connection options with configurable overrides.
 * @param {Object} [options] - Socket.IO connection options
 * @param {Boolean} [options.forceNew=true] - Force a new connection
 * @param {Boolean} [options.reconnection=true] - Enable automatic reconnection
 * @param {Number} [options.reconnectionDelay=30000] - Initial reconnection delay in ms
 * @param {Number} [options.reconnectionDelayMax=50000] - Maximum reconnection delay in ms
 * @param {Number} [options.timeout=30000] - Connection timeout in ms
 */
Node.Server.prototype.connect = function (options)
{
  this.parent.log("INFO", `Try to connect to ${this.serverUrl}`);
  //
  options = Object.assign({
    forceNew: true,
    reconnection: true,
    reconnectionDelay: 30000,
    reconnectionDelayMax: 50000,
    timeout: 30000
  }, options);
  this.socket = Node.io(this.serverUrl, options);
  //
  this.socket.on("connect", () => {
    this.parent.log("INFO", `Connected to ${this.serverUrl}`);
    this.parent.onServerConnected(this);
  });
  //
  this.socket.on("cloudServerMsg", data => {
    this.parent.log("INFO", "Server onMessage: " + JSON.stringify(data, (k, v) => {
      if (k === "args" && v) {
        return v.map(value => {
          if (value instanceof Buffer)
            return `<Buffer length ${value.length}>`;
          else
            return value;
        });
      }
      else if (["remoteConfigurationKey", "APIKey", "password"].includes(k))
        v = "****";
      else
        return v;
    }));
    this.parent.onServerMessage(this, data);
  });
  //
  this.socket.on("connect_error", error => {
    this.parent.log("ERROR", `Connect error to ${this.serverUrl}: ${error}`);
  });
  //
  this.socket.on("connect_timeout", () => {
    this.parent.log("ERROR", `Connect timeout to ${this.serverUrl}`);
  });
  //
  this.socket.on("disconnect", err => {
    this.parent.log("INFO", `Disconnect to ${this.serverUrl}: ${err}`);
    this.parent.onServerDisconnected(this);
  });
  //
  this.socket.on("indeError", data => {
    this.parent.log("INFO", `IndeError from ${this.serverUrl}: ${data.msg}`);
  });
};


/**
 * Disconnects from the remote server.
 * Safely closes the Socket.IO connection if it exists.
 */
Node.Server.prototype.disconnect = function ()
{
  if (!this.socket)
    return;
  //
  this.socket.disconnect();
};


/**
 * Sends a message to the connected remote server.
 * Automatically adds username for IDE connections.
 * Uses the 'cloudConnector' event channel for message transmission.
 * @param {Object} msg - Message object to send
 * @param {String} msg.type - Message type
 * @param {Object} msg.data - Message payload
 * @param {String} [msg.userName] - Username (automatically added for IDE connections)
 */
Node.Server.prototype.sendMessage = function (msg)
{
  if (!this.socket)
    return;
  //
  // Send username if is a IDE server
  if (this.ideUserName)
    msg.userName = this.ideUserName;
  this.socket.emit("cloudConnector", msg);
};


// Export module for node
module.exports = Node.Server;
