/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2014
 * All rights reserved
 */
/* global module */

var Node = Node || {};

// Import global modules
Node.io = require("socket.io-client");

// Import local modules


/**
 * @class Definition of Client object
 * @param {Node.CloudServer} parent
 * @param {String} url - server url
 */
Node.Server = function (parent, url)
{
  this.parent = parent;
  //
  this.serverUrl = url;
};


/**
 * Connect this client to the given target
 */
Node.Server.prototype.connect = function ()
{
  this.parent.log("INFO", "Connect to " + this.serverUrl);
  //
  var opt = {};
  opt.forceNew = true;
  opt.reconnection = true;
  opt.timeout = 1000;
  this.socket = Node.io(this.serverUrl, opt);
  //
  var pthis = this;
  this.socket.on("connect", function () {
    pthis.parent.log("INFO", "Connected to " + pthis.serverUrl);
    //
    // Send list of databases supported by this connector
    var dmlist = [];
    for (var i = 0; i < pthis.parent.config.datamodels.length; i++)
      dmlist.push({name: pthis.parent.config.datamodels[i].name});
    //
    pthis.socket.emit("cloudConnector", {name: pthis.parent.config.name, dmlist: dmlist});
  });
  //
  this.socket.on("cloudServerMsg", function (data) {
    pthis.parent.log("INFO", "Server onMessage: " + data);
    //
    var dm = pthis.parent.dataModelByName(data.dm);
    if (!dm) {
      this.log("ERROR", data.dm + " datamodel not found");
      pthis.socket.emit('cloudServerMsgResp', {result: null, error: "Can't locate a valid datamodel"});
    }
    else { // Ask the datamodel
      dm.onMessage(data.msg, function (result, error) {
        pthis.socket.emit('cloudServerMsgResp', {result: result, error: error});
      });
    }
  });
  //
  this.socket.on("error", function (error) {
    pthis.parent.log("ERROR", "Error: " + error);
  });
  //
  this.socket.on("timeout", function () {
    pthis.parent.log("ERROR", "Timeout");
  });
  //
  this.socket.on("disconnect", function () {
    pthis.parent.log("ERROR", "Disconnect");
  });
};


// Export module for node
if (module)
  module.exports = Node.Server;
