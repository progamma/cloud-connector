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
    // Send list of file systems supported by this connector
    msg.data.fslist = [];
    for (var i = 0; i < this.parent.fileSystems.length; i++) {
      var fs = {};
      fs.name = this.parent.fileSystems[i].name;
      fs.path = this.parent.fileSystems[i].path;
      fs.permissions = this.parent.fileSystems[i].permissions;
      fs.key = this.parent.fileSystems[i].APIKey;
      msg.data.fslist.push(fs);
    }
    //
    // Send list of plugins supported by this connector
    msg.data.pluginslist = [];
    for (var i = 0; i < this.parent.plugins.length; i++) {
      var plugin = {};
      plugin.name = this.parent.plugins[i].name;
      plugin.class = this.parent.plugins[i].class;
      plugin.key = this.parent.plugins[i].APIKey;
      msg.data.pluginslist.push(plugin);
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
    this.parent.log("INFO", "Server onMessage: " + JSON.stringify(data, function (k, v) {
      if (k === "args") {
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
    data.server = this;
    if (data.dm) {
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
    }
    else if (data.fs) {
      msg.fs = true;
      var fs = this.parent.getFileSystemByName(data.fs);
      if (!fs) {
        this.parent.log("ERROR", "file system '" + data.fs + "' not found");
        //
        // If command has a callback send response
        if (data.cbid) {
          msg.data.error = "file system '" + data.fs + "' not found";
          this.sendMessage(msg);
        }
      }
      else {
        fs.onMessage(data, function (result, error) {
          // If command has a callback send response
          if (data.cbid) {
            Array.prototype.slice.apply(arguments).forEach(function (a, i) {
              if (a instanceof Error) {
                msg.data.error = a.message;
                if (i === 1)
                  msg.data.result = null;
              }
              else if (i === 0)
                msg.data.result = a;
            });
            //
            this.sendMessage(msg);
          }
        }.bind(this));
      }
    }
    else if (data.plugin) {
      msg.plugin = true;
      var plugin = this.parent.getPluginByName(data.plugin);
      if (!plugin) {
        this.parent.log("ERROR", "plugin '" + data.plugin + "' not found");
        //
        // If command has a callback send response
        if (data.cbid) {
          msg.data.error = "plugin '" + data.plugin + "' not found";
          this.sendMessage(msg);
        }
      }
      else {
        plugin.onMessage(data, function (result, error) {
          // If command has a callback send response
          if (data.cbid) {
            Array.prototype.slice.apply(arguments).forEach(function (a, i) {
              if (a instanceof Error) {
                msg.data.error = a.message;
                if (i === 1)
                  msg.data.result = null;
              }
              else if (i === 0)
                msg.data.result = a;
            });
            //
            this.sendMessage(msg);
          }
        }.bind(this));
      }
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
    this.parent.onServerDisconnected(this);
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
