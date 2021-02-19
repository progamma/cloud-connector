/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
 * All rights reserved
 */


/* global module, Promise */

var Node = Node || {};

if (module) {
  Node.File = require("./file");
  Node.Directory = require("./directory");
  Node.Url = require("./url");
}

/**
 * @class FS
 * Represents a file system object, parent of files and directories classes
 * @param {Object} parent
 * @param {Object} config
 */
Node.FS = function (parent, config)
{
  this.parent = parent;
  //
  for (let k in config)
    this[k] = config[k];
  //
  // Set default permissions
  this.permissions = this.permissions || Node.FS.permissions.read;
  //
  // Files opened
  this.files = {};
};

Node.FS.permissions = {
  read: "r",
  readWrite: "rw"
};


/**
 * Creates a file object with the appropriate driver and path
 * @param {String} path
 * @param {String} id
 */
Node.FS.prototype.file = function (path, id)
{
  return new Node.File(this, path, id);
};


/**
 * Creates a directory object with the appropriate driver
 * @param {String} path
 */
Node.FS.prototype.directory = function (path)
{
  return new Node.Directory(this, path);
};


/**
 * Creates a URL object with the appropriate driver
 * @param {String} url
 */
Node.FS.prototype.url = function (url)
{
  return new Node.Url(this, url);
};


/**
 * Normalize a path
 * @param {String} path
 */
Node.FS.normalizePath = function (path)
{
  // Check if path is out of root
  path = path.replace(/\\/g, "\/");
  //
  // Resources in master exception
  if (path.startsWith("../resources"))
    return path;
  //
  let parts = path.split("/");
  for (let i = 0; i < parts.length; i++) {
    switch (parts[i]) {
      case ".":
        parts.splice(i, 1);
        i--;
        break;
      case "..":
        if (i === 0)
          throw new Error("Invalid path " + path);
        parts.splice(i - 1, 2);
        i -= 2;
        break;
    }
  }
  //
  return path;
};


/**
 * Notified when a server disconnects
 * @param {Node.Server} server - server disconnected
 */
Node.FS.prototype.onServerDisconnected = function (server)
{
  // Close all opened files to that server
  this.disconnect(server).then();
};


/**
 * Close all opened files
 * @param {Node.Server} server - server disconnected
 */
Node.FS.prototype.disconnect = async function (server)
{
  // Close all opened files
  await Promise.all(Object.keys(this.files).map(async function (fileId) {
    let f = this.files[fileId];
    if (server && f.server !== server)
      return;
    //
    await new Promise(function (resolve, reject) {
      f.close(function (result, error) {
        if (error)
          reject(new Error(`Error closing file '${f.path}': ${error}`));
        else
          resolve();
      });
    });
  }));
};


// export module for node
if (module)
  module.exports = Node.FS;
