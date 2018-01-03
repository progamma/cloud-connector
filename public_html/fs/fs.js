/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
 * All rights reserved
 */


/* global module */

var Node = Node || {};

if (module) {
  Node.File = require("./file");
  Node.Directory = require("./directory");
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
  for (var k in config)
    this[k] = config[k];
  //
  // Set default permissions
  this.permissions = this.permissions || Node.FS.permissions.read;
};

Node.FS.permissions = {
  read: "r",
  readWrite: "rw"
};


/**
 * Creates a file object with the appropriate driver and path
 * @param {Object} file
 */
Node.FS.prototype.file = function (file)
{
  return new Node.File(this, file);
};


/**
 * Creates a directory object with the appropriate driver
 * @param {Object} dir
 */
Node.FS.prototype.directory = function (dir)
{
  return new Node.Directory(this, dir);
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
  var parts = path.split("/");
  for (var i = 0; i < parts.length; i++) {
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


// export module for node
if (module)
  module.exports = Node.FS;
