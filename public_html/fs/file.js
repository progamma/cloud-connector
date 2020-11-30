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
Node.File = function (fs, path, id)
{
  Node.FS = require("./fs");
  //
  // String containing the relative path of the file
  if (path)
    this.path = path;
  //
  this.fs = fs;
  //
  // String containing the encoding of the file, null by default: decided by the user at the time
  // of the creation of the physical file
  this.encoding = null;
  //
  if (id)
    this.id = id;
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
  this.encoding = encoding || this.encoding;
  this.fs.createFile(this, function (err) {
    if (err)
      return cb(null, err);
    //
    if (this.encoding !== "utf-8")
      return cb();
    //
    // Write utf-8 BOM
    this.write("\ufeff", null, null, null, function (err) {
      cb(null, err);
    });
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
  this.fs.close(this, function (err) {
    cb(null, err);
  });
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
 * @param {string/File/Directory} newFile
 * @param {function} cb
 */
Node.File.prototype.rename = function (newFile, cb)
{
  if (newFile instanceof Node.Directory)
    newFile = this.fs.file(newFile.path + "/" + this.name());
  else if (typeof newFile === "string" && newFile.endsWith("/"))
    newFile = this.file(newFile + this.name());
  //
  this.fs.renameObject(this, newFile, function (err) {
    if (err)
      return cb(null, err);
    //
    if (typeof newFile === "string")
      newFile = this.fs.file(this.path.substring(0, this.path.lastIndexOf("/") + 1) + newFile);
    //
    // I change the path only if the file has been renamed correctly
    this.path = newFile.path;
    //
    cb();
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
 * Return the name of file (with the extension)
 */
Node.File.prototype.name = function ()
{
  return this.path.replace(/^.*(\\|\/|\:)/, "");
};


/**
 * Return the extension of file (without the dot)
 */
Node.File.prototype.extension = function ()
{
  // Get only the file name
  let fileName = this.name();
  //
  /* jshint ignore:start */
  if (fileName.length)
    // Returns only the extension (null for a binary file)
    return fileName.substr((~-fileName.lastIndexOf(".") >>> 0) + 2);
  /* jshint ignore:end */
  //
  return "";
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
