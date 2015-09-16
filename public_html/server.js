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
  opt.timeout = 1000;
  this.socket = Node.io(this.serverUrl, opt);
  //
  var pthis = this;
  //
  this.socket.on("connect", function () {
    pthis.parent.log("INFO", "Connected to " + pthis.serverUrl);
  });
  //
  this.socket.on("cloudServerMsg", function (data) {
    pthis.parent.log("INFO", "Server onMessage: " + JSON.stringify(data));
    //
    var dm = pthis.parent.dataModelByName(data.dm);
    if (!dm) {
      pthis.parent.log("ERROR", "datamodel '" + data.dm + "' not found");
      pthis.sendMessage({cid: data.cid, error: "datamodel '" + data.dm + "' not found"});
    }
    else {
      // Ask the datamodel
      msg.server = this;
      dm.onMessage(data, function (result, error) {
        var msg = {};
        msg.type = Node.Server.messageTypes.response;
        if (pthis.ideUserName)
          msg.userName = pthis.ideUserName;
        //
        // Compose the message with error or result
        msg.sid = data.sid;
        if (data.appid)
          msg.appid = data.appid;
        msg.data = {};
        msg.data.name = pthis.parent.name;
        if (error)
          msg.data.error = error.message;
        else
          msg.data.result = result;
        //
        // If command has a callback send response
        if (data.cbid) {
          msg.cbid = data.cbid;
          pthis.sendMessage(msg);
        }
      });
    }
  });
  //
  this.socket.on("connect_error", function (error) {
    pthis.parent.log("ERROR", "Connect error to " + pthis.serverUrl);
  });
  //
  this.socket.on("connect_timeout", function () {
    pthis.parent.log("ERROR", "Connect timeout to " + pthis.serverUrl);
  });
  //
  this.socket.on("disconnect", function () {
    pthis.parent.log("INFO", "Disconnect to " + pthis.serverUrl);
    //
    // Notify to all datamodels that a server is disconnected
    for (var i = 0; i < pthis.parent.datamodels.length; i++)
      pthis.parent.datamodels[i].serverDisconnected();
  });
  //
  this.socket.on("indeError", function (data) {
    pthis.parent.log("INFO", "indeError: " + data.msg);
  });
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
    msg.data.dmlist.push(dm);
  }
  //
  // Send username if is a IDE server
  if (this.ideUserName)
    msg.userName = this.ideUserName;
  //
  this.sendMessage(msg);
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
