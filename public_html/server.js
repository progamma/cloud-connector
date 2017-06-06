/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module */

var Node = Node || {};

// Import global modules
Node.io = require("socket.io-client");

/**
 * @class Definition of Client object
 * @param {Node.CloudServer} parent
 * @param {String} url - server url
 */
Node.Server = function (parent, url)
{
  this.parent = parent;
  this.serverUrl = url;
};


Node.Server.messageTypes = {
  init: "init",
  response: "response"
};


/**
 * Connect this client to the given target
 */
Node.Server.prototype.connect = function ()
{
  this.parent.log("INFO", "Try to connect to " + this.serverUrl);
  //
  var opt = {};
  opt.forceNew = true;
  opt.reconnection = true;
  opt.timeout = 30000;
  this.socket = Node.io(this.serverUrl, opt);
  //
  this.socket.on("connect", function () {
    this.parent.log("INFO", "Connected to " + this.serverUrl);
    //
    // Send list of databases supported by this connector
    var msg = {};
    msg.type = Node.Server.messageTypes.init;
    msg.data = {};
    msg.data.name = this.parent.name;
    msg.data.dmlist = [];
    for (var i = 0; i < this.parent.datamodels.length; i++) {
      var dm = {};
      dm.name = this.parent.datamodels[i].name;
      dm.class = this.parent.datamodels[i].class;
      dm.key = this.parent.datamodels[i].APIKey;
      msg.data.dmlist.push(dm);
    }
    //
    // Send username if is a IDE server
    if (this.ideUserName)
      msg.userName = this.ideUserName;
    //
    this.sendMessage(msg);
  }.bind(this));
  //
  this.socket.on("cloudServerMsg", function (data) {
    var startTime = new Date();
    this.parent.log("INFO", "Server onMessage: " + JSON.stringify(data));
    //
    // Compose the message of response
    var msg = {};
    msg.type = Node.Server.messageTypes.response;
    if (data.sid)
      msg.sid = data.sid;
    if (data.dmid)
      msg.dmid = data.dmid;
    if (this.ideUserName)
      msg.userName = this.ideUserName;
    if (data.appid)
      msg.appid = data.appid;
    if (data.cbid)
      msg.cbid = data.cbid;
    msg.data = {};
    msg.data.name = this.parent.name;
    //
    var dm = this.parent.dataModelByName(data.dm);
    if (!dm) {
      this.parent.log("ERROR", "datamodel '" + data.dm + "' not found");
      //
      // If command has a callback send response
      if (data.cbid) {
        msg.data.error = "datamodel '" + data.dm + "' not found";
        this.sendMessage(msg);
      }
    }
    else {
      // Ask the datamodel
      data.server = this;
      dm.onMessage(data, function (result, error) {
        // If command has a callback send response
        if (data.cbid) {
          if (error)
            msg.data.error = error.toString();
          else if (result) {
            msg.data.result = result;
            msg.data.result.times.cc = (new Date()).getTime() - startTime.getTime();
          }
          //
          this.sendMessage(msg);
        }
      }.bind(this));
    }
  }.bind(this));
  //
  this.socket.on("connect_error", function (error) {
    this.parent.log("ERROR", "Connect error to " + this.serverUrl);
  }.bind(this));
  //
  this.socket.on("connect_timeout", function () {
    this.parent.log("ERROR", "Connect timeout to " + this.serverUrl);
  }.bind(this));
  //
  this.socket.on("disconnect", function () {
    this.parent.log("INFO", "Disconnect to " + this.serverUrl);
    //
    // Notify to all datamodels that a server is disconnected
    for (var i = 0; i < this.parent.datamodels.length; i++)
      this.parent.datamodels[i].serverDisconnected(this);
  }.bind(this));
  //
  this.socket.on("indeError", function (data) {
    this.parent.log("INFO", "indeError: " + data.msg);
  }.bind(this));
};


/**
 * Send a message to server
 * @param {Object} msg to send
 */
Node.Server.prototype.sendMessage = function (msg)
{
  this.socket.emit("cloudConnector", msg);
};


// Export module for node
module.exports = Node.Server;
