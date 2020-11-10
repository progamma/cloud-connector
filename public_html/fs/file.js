/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
 * All rights reserved
 */


/* global module, Client */

var Node = Node || {};


/**
 * @class File
 * Represents a file object
 * @param {Node.FS} fs
 * @param {Object} file
 */
Node.File = function (fs, file)
{
  Node.FS = require("./fs");
  //
  file = file || {};
  if (file.id)
    this.id = file.id;
  //
  // String containing the relative path of the file
  if (file.path)
    this.path = file.path;
  //
  this.fs = fs;
  //
  // String containing the encoding of the file, null by default: decided by the user at the time
  // of the creation of the physical file
  this.encoding = null;
};


Object.defineProperties(Node.File.prototype, {
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
Node.File.prototype.getDebugInfo = function ()
{
  let info = {};
  info._class = "File";
  info.path = this.path;
  return info;
};


/**
 * Creates the file physically (Opens the file and overwrites it)
 * @param {string} encoding
 * @param {function} cb
 */
Node.File.prototype.create = function (encoding, cb)
{
  // String containing the encoding of the file, null only for binary files
  this.encoding = encoding;
  this.fs.createFile(this, function (err) {
    cb(null, err);
  });
};


/**
 * Opens the file for reading
 * @param {function} cb
 */
Node.File.prototype.open = function (cb)
{
  this.fs.openFile(this, function (err) {
    cb(null, err);
  });
};


/**
 * Opens the file to append data
 * @param {function} cb
 */
Node.File.prototype.append = function (cb)
{
  this.fs.openFileForAppend(this, function (err) {
    cb(null, err);
  });
};


/**
 * Closes a file
 * @param {function} cb
 */
Node.File.prototype.close = function (cb)
{
  this.fs.close(this, cb);
};


/**
 * Checks  the existence of the file
 * @param {function} cb
 */
Node.File.prototype.exists = function (cb)
{
  this.fs.fileExists(this, cb);
};


/**
 * Reads a block of data, return a node buffer/array buffer
 * @param {int} length
 * @param {int} offset
 * @param {function} cb
 */
Node.File.prototype.read = function (length, offset, cb)
{
  // The length must be greater than 0, if she's "null" is read up to the end of file
  if (length && length < 1)
    return cb(null, new Error("Length must be greater than 0"));
  //
  this.fs.read(this, length, offset, cb);
};


/**
 * Read the whole file as text
 * @param {function} cb
 */
Node.File.prototype.readAll = function (cb)
{
  this.fs.readAll(this, cb);
};


/**
 * Writes the data or the string given
 * @param {string/buffer} data
 * @param {int} offset
 * @param {int} size
 * @param {int} position
 * @param {function} cb
 */
Node.File.prototype.write = function (data, offset, size, position, cb)
{
  // offset: offset relative to the buffer
  // size: number of bytes to write
  // position: position(bytes) of the file from which you start writing
  this.fs.write(this, data, offset, size, position, function (err) {
    cb(null, err);
  });
};


/**
 * Copy the file
 * @param {string} newPath
 * @param {function} cb
 */
Node.File.prototype.copy = function (newPath, cb)
{
  let newFile = this.fs.file(newPath);
  this.fs.copyFile(this, newFile, function (err) {
    cb(newFile, err);
  });
};


/**
 * Rename a file
 * @param {string} newName
 * @param {function} cb
 */
Node.File.prototype.rename = function (newName, cb)
{
  this.fs.renameObject(this, newName, function (err) {
    if (err)
      return cb(null, err);
    //
    // I change the path only if the file has been renamed correctly
    // Takes only the name of the file from the new path
    this.path = this.path.substring(0, this.path.lastIndexOf("/") + 1) + newName;
  }.bind(this));
};


/**
 * Return the file size (in bytes)
 * @param {function} cb
 */
Node.File.prototype.length = function (cb)
{
  this.fs.fileLength(this, cb);
};


/**
 * Return the extension of file (without the dot)
 * @param {function} cb
 */
Node.File.prototype.extension = function (cb)
{
  // Get only the file name
  let fileName = this.path.replace(/^.*(\\|\/|\:)/, "");
  //
  /* jshint ignore:start */
  if (fileName.length)
    // Returns only the extension (null for a binary file)
    cb(fileName.substr((~-fileName.lastIndexOf(".") >>> 0) + 2));
  else
    cb("");
  /* jshint ignore:end */
};


/**
 * Return the last modified file date
 * @param {function} cb
 */
Node.File.prototype.dateTime = function (cb)
{
  this.fs.fileDateTime(this, cb);
};


/**
 * Deletes the file
 * @param {function} cb
 */
Node.File.prototype.remove = function (cb)
{
  this.fs.deleteFile(this, function (err) {
    cb(null, err);
  });
};


/**
 * Zip the file
 * @param {function} cb
 */
Node.File.prototype.zip = function (cb)
{
  let zipFile = this.fs.file(this.path + ".zip");
  this.fs.zipFile(this, zipFile, function (err) {
    cb(zipFile, err);
  });
};


/**
 * Unzip the archive
 * @param {string} path
 * @param {function} cb
 */
Node.File.prototype.unzip = function (path, cb)
{
  let unzipDir = this.fs.directory(path);
  this.fs.unzip(this, unzipDir, function (err) {
    cb(unzipDir, err);
  });
};


//  export module for node
if (module)
  module.exports = Node.File;
