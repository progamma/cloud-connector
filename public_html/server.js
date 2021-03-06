/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
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
 */
Node.Server.prototype.connect = function ()
{
  this.parent.log("INFO", `Try to connect to ${this.serverUrl}`);
  //
  let opt = {};
  opt.forceNew = true;
  opt.reconnection = true;
  opt.reconnectionDelay = 30000;
  opt.reconnectionDelayMax = 50000;
  opt.timeout = 30000;
  this.socket = Node.io(this.serverUrl, opt);
  //
  this.socket.on("connect", function () {
    this.parent.log("INFO", `Connected to ${this.serverUrl}`);
    this.parent.onServerConnected(this);
  }.bind(this));
  //
  this.socket.on("cloudServerMsg", function (data) {
    this.parent.log("INFO", "Server onMessage: " + JSON.stringify(data, function (k, v) {
      if (k === "args" && v) {
        return v.map(function (value) {
          if (value instanceof Buffer)
            return "<Buffer length " + value.length + ">";
          else
            return value;
        });
      }
      else
        return v;
    }));
    this.parent.onServerMessage(this, data);
  }.bind(this));
  //
  this.socket.on("connect_error", function (error) {
    this.parent.log("ERROR", `Connect error to ${this.serverUrl}: ${error}`);
  }.bind(this));
  //
  this.socket.on("connect_timeout", function () {
    this.parent.log("ERROR", `Connect timeout to ${this.serverUrl}`);
  }.bind(this));
  //
  this.socket.on("disconnect", function () {
    this.parent.log("INFO", `Disconnect to ${this.serverUrl}`);
    this.parent.onServerDisconnected(this);
  }.bind(this));
  //
  this.socket.on("indeError", function (data) {
    this.parent.log("INFO", `IndeError from ${this.serverUrl}: ${data.msg}`);
  }.bind(this));
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
