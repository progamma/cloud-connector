/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */


/* global module */

var Node = Node || {};


/**
 * @class Directory
 * Represents a directory object
 * @param {Node.FS} fs
 * @param {String} path
 */
Node.Directory = function (fs, path)
{
  Node.FS = require("./fs");
  //
  // String containing the relative path of the directory
  this.path = path || "";
  if (path) {
    // Remove slash
    if (this.path.startsWith("/"))
      this.path = this.path.slice(1);
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
  },
  absolutePath: {
    get: function () {
      return this.fs.getAbsolutePath(this);
    }
  }
});


/**
 * Tells something about this object to the DTT module
 */
Node.Directory.prototype.getDebugInfo = function ()
{
  let info = {};
  info._class = "Directory";
  info.path = this.path;
  return info;
};


/**
 * Return the name of directory
 */
Node.Directory.prototype.name = function ()
{
  return this.path.replace(/^.*(\\|\/|\:)/, "");
};


/**
 * Creates the directory physically
 */
Node.Directory.prototype.create = async function ()
{
  await this.fs.mkDir(this);
};


/**
 * Checks the existence of the directory
 */
Node.Directory.prototype.exists = async function ()
{
  return await this.fs.dirExists(this);
};


/**
 * Renames the directory
 * @param {string/Directory} newDir
 */
Node.Directory.prototype.rename = async function (newDir)
{
  if (typeof newDir === "string" && newDir.endsWith("/"))
    newDir = this.fs.directory(newDir + this.name());
  //
  await this.fs.renameObject(this, newDir);
  //
  if (typeof newDir === "string")
    newDir = this.fs.directory(this.path.substring(0, this.path.lastIndexOf("/") + 1) + newDir);
  //
  // I change the path only if the file has been renamed correctly
  this.path = newDir.path;
};


/**
 * Copies the entire directory
 * @param {String} newPath
 */
Node.Directory.prototype.copy = async function (newPath)
{
  let newDir = this.fs.directory(newPath);
  await this.fs.copyDir(this, newDir);
  return newDir;
};


/**
 * Reads the content of directory: returns an array of files and folders
 * @param {Number} depth
 */
Node.Directory.prototype.list = async function (depth)
{
  // Set default depth to 0
  depth = depth || 0;
  return await this.fs.readDirectory(this, depth);
};


/**
 * Zip the directory
 */
Node.Directory.prototype.zip = async function ()
{
  let zipFile = this.fs.file(this.path + ".zip");
  await this.fs.zipDirectory(this, zipFile);
  return zipFile;
};


/**
 * Removes the entire directory
 */
Node.Directory.prototype.remove = async function ()
{
  await this.fs.removeDirRecursive(this);
};


// export module for node
if (module)
  module.exports = Node.Directory;
