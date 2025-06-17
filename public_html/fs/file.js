/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */


/* global module, Client */

var Node = Node || {};


/**
 * @class File
 * Represents a file object
 * @param {Node.FS} fs
 * @param {String} path
 * @param {String} id
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
  },
  parentDirectory: {
    get: function () {
      let path = this.path.split("/");
      path.pop();
      return this.fs.directory(path.join("/"), this.type);
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
Node.File.prototype.getDebugInfo = function ()
{
  let info = {};
  info._class = "File";
  info.path = this.path;
  return info;
};


/**
 * Creates the file physically (Opens the file and overwrites it)
 * @param {String} encoding
 */
Node.File.prototype.create = async function (encoding)
{
  // String containing the encoding of the file, null only for binary files
  this.encoding = encoding || this.encoding;
  await this.fs.createFile(this);
  //
  // Write utf-8 BOM
  if (this.encoding === "utf-8")
    await this.write("\ufeff");
};


/**
 * Opens the file for reading
 */
Node.File.prototype.open = async function ()
{
  await this.fs.openFile(this);
};


/**
 * Opens the file to append data
 */
Node.File.prototype.append = async function ()
{
  await this.fs.openFileForAppend(this);
};


/**
 * Closes a file
 */
Node.File.prototype.close = async function ()
{
  await this.fs.close(this);
};


/**
 * Checks  the existence of the file
 */
Node.File.prototype.exists = async function ()
{
  return await this.fs.fileExists(this);
};


/**
 * Reads a block of data, return a node buffer/array buffer
 * @param {Number} length
 * @param {Number} offset
 */
Node.File.prototype.read = async function (length, offset)
{
  // The length must be greater than 0, if she's "null" is read up to the end of file
  if (length && length < 1)
    throw new Error("Length must be greater than 0");
  //
  return await this.fs.read(this, length, offset);
};


/**
 * Read the whole file as text
 */
Node.File.prototype.readAll = async function ()
{
  // If not specified the default encoding is utf-8
  this.encoding = this.encoding || "utf-8";
  //
  let data = await this.fs.readAll(this);
  //
  // Remove utf-8 BOM
  if (data.charCodeAt(0) === 65279)
    data = data.substring(1);
  //
  return data;
};


/**
 * Writes the data or the string given
 * @param {String/Buffer} data
 * @param {Number} offset
 * @param {Number} size
 * @param {Number} position
 */
Node.File.prototype.write = async function (data, offset, size, position)
{
  // If not specified the default encoding is utf-8
  if (typeof data === "string")
    this.encoding = this.encoding || "utf-8";
  //
  // offset: offset relative to the buffer
  // size: number of bytes to write
  // position: position(bytes) of the file from which you start writing
  await this.fs.write(this, data, offset, size, position);
};


/**
 * Copy the file
 * @param {String} newPath
 */
Node.File.prototype.copy = async function (newPath)
{
  let newFile = this.fs.file(newPath);
  await this.fs.copyFile(this, newFile);
  return newFile;
};


/**
 * Rename a file
 * @param {String/File/Directory} newFile
 */
Node.File.prototype.rename = async function (newFile)
{
  if (newFile instanceof Node.Directory)
    newFile = this.fs.file(newFile.path + "/" + this.name());
  else if (typeof newFile === "string" && newFile.endsWith("/"))
    newFile = this.file(newFile + this.name());
  //
  await this.fs.renameObject(this, newFile);
  //
  if (typeof newFile === "string")
    newFile = this.fs.file(this.path.substring(0, this.path.lastIndexOf("/") + 1) + newFile);
  //
  // I change the path only if the file has been renamed correctly
  this.path = newFile.path;
};


/**
 * Return the file size (in bytes)
 */
Node.File.prototype.length = async function ()
{
  return await this.fs.fileLength(this);
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
  // Returns only the extension (null for a binary file)
  if (fileName.length)
    return fileName.slice((~-fileName.lastIndexOf(".") >>> 0) + 2);
  //
  return "";
};


/**
 * Return the last modified file date
 */
Node.File.prototype.dateTime = async function ()
{
  return await this.fs.fileDateTime(this);
};


/**
 * Deletes the file
 */
Node.File.prototype.remove = async function ()
{
  await this.fs.deleteFile(this);
};


/**
 * Zip the file
 */
Node.File.prototype.zip = async function ()
{
  let zipFile = this.fs.file(this.path + ".zip");
  await this.fs.zipFile(this, zipFile);
  return zipFile;
};


/**
 * Unzip the archive
 * @param {String} path
 */
Node.File.prototype.unzip = async function (path)
{
  let unzipDir = this.fs.directory(path);
  await this.fs.unzip(this, unzipDir);
  return unzipDir;
};


//  export module for node
module.exports = Node.File;
