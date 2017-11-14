/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
 * All rights reserved
 */


/* global module */

var Node = Node || {};


/**
 * @class Directory
 * Represents a directory object
 * @param {Node.FS} fs
 * @param {Object} dir
 */
Node.Directory = function (fs, dir)
{
  Node.FS = require("./fs");
  dir = dir || {};
  //
  // String containing the relative path of the directory
  this.path = dir.path || "";
  if (dir.path) {
    // Remove final slash
    if (this.path.endsWith("/"))
      this.path = this.path.slice(0, -1);
  }
  //
  this.fs = fs;
};


Object.defineProperties(Node.Directory.prototype, {
  path: {
    get: function () {
      return this._path;
    },
    set: function (newValue) {
      this._path = Node.FS.normalizePath(newValue);
    }
  }
});


/**
 * Tells something about this object to the DTT module
 */
Node.Directory.prototype.getDebugInfo = function ()
{
  var info = {};
  info._class = "Directory";
  info.path = this.path;
  return info;
};


/**
 * Creates the directory physically
 * @param {function} cb
 */
Node.Directory.prototype.create = function (cb)
{
  this.fs.mkDir(this, function (err) {
    cb(null, err);
  });
};


/**
 * Checks the existence of the directory
 * @param {function} cb
 */
Node.Directory.prototype.exists = function (cb)
{
  this.fs.dirExists(this, cb);
};


/**
 * Renames the directory
 * @param {string} newName
 * @param {function} cb
 */
Node.Directory.prototype.rename = function (newName, cb)
{
  this.fs.renameObject(this, newName, function (err) {
    if (err)
      return cb(null, err);
    //
    // I change the path only if the file has been renamed correctly
    this.path = this.path.substring(0, this.path.lastIndexOf("/") + 1) + newName;
    cb();
  }.bind(this));
};


/**
 * Copies the entire directory
 * @param {string} newPath
 * @param {function} cb
 */
Node.Directory.prototype.copy = function (newPath, cb)
{
  var newDir = this.fs.directory(newPath);
  this.fs.copyDir(this, newDir, function (err) {
    cb(newDir, err);
  });
};


/**
 * Reads the content of directory: returns an array of files and folders
 * @param {Integer} depth
 * @param {function} cb
 */
Node.Directory.prototype.list = function (depth, cb) {
  this.fs.readDirectory(this, depth, cb);
};


/**
 * Zip the directory
 * @param {function} cb
 */
Node.Directory.prototype.zip = function (cb)
{
  var zipFile = this.fs.file(this.path + ".zip");
  this.fs.zipDirectory(this, zipFile, function (err) {
    cb(zipFile, err);
  });
};


/**
 * Removes the entire directory
 * @param {function} cb
 */
Node.Directory.prototype.remove = function (cb) {
  this.fs.removeDirRecursive(this, function (err) {
    cb(null, err);
  });
};


// export module for node
if (module)
  module.exports = Node.Directory;
