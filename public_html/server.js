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
 * @class Definition of Client object
 * @param {Node.CloudServer} parent
 * @param {String} url - server url
 * @param {String} username
 */
Node.Server = function (parent, url, username)
{
  this.parent = parent;
  this.serverUrl = url;
  this.ideUserName = username;
};


/**
 * Connect this client to the given target
 * @param {Object} options
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
            return "<Buffer length " + value.length + ">";
          else
            return value;
        });
      }
      else if (k === "remoteConfigurationKey")
        v = "****";
      else
        return v;
    }));
    this.parent.onServerMessage(this, data).then();
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
  this.socket.on("disconnect", () => {
    this.parent.log("INFO", `Disconnect to ${this.serverUrl}`);
    this.parent.onServerDisconnected(this).then();
  });
  //
  this.socket.on("indeError", data => {
    this.parent.log("INFO", `IndeError from ${this.serverUrl}: ${data.msg}`);
  });
};


/**
 * Disconnect this client to the given target
 */
Node.Server.prototype.disconnect = function ()
{
  if (!this.socket)
    return;
  //
  this.socket.disconnect();
};


/**
 * Send a message to server
 * @param {Object} msg to send
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
