/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

/* global Client */

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
    get() {
      return this._path;
    },
    set(newValue) {
      this._path = Node.FS.normalizePath(newValue);
    }
  },
  parentDirectory: {
    get() {
      let path = this.path.split("/");
      path.pop();
      return this.fs.directory(path.join("/"), this.type);
    }
  },
  absolutePath: {
    get() {
      return this.fs.getAbsolutePath(this);
    }
  }
});


/**
 * Get debug information about this file object
 * @returns {Object} Debug info containing class name, path, type, and public URL
 * @note Used by DTT (Debug Telemetry Tools) module for diagnostics
 */
Node.File.prototype.getDebugInfo = function ()
{
  return {
    _class: "File",
    path: this.path
  };
};


/**
 * Creates the file physically (opens and overwrites if exists)
 * @param {String} [encoding] - File encoding ('utf8', 'utf-8', 'ascii', etc.). Null for binary files
 * @throws {Error} If attempting to create a resource type file
 * @note UTF-8 files automatically get a BOM (Byte Order Mark) prepended
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
 * @note File must be closed after reading operations are complete
 */
Node.File.prototype.open = async function ()
{
  await this.fs.openFile(this);
};


/**
 * Opens the file to append data at the end
 * @throws {Error} If attempting to append to a resource type file
 * @note File must be closed after append operations are complete
 */
Node.File.prototype.append = async function ()
{
  await this.fs.openFileForAppend(this);
};


/**
 * Closes an open file handle
 * @note Always close files after open/append operations to free resources
 */
Node.File.prototype.close = async function ()
{
  await this.fs.close(this);
};


/**
 * Checks the existence of the file
 * @returns {Promise<Boolean>} True if file exists, false otherwise
 */
Node.File.prototype.exists = async function ()
{
  return await this.fs.fileExists(this);
};


/**
 * Reads a block of data from the file
 * @param {Number} [length] - Number of bytes to read (omit to read entire file)
 * @param {Number} [offset] - Starting position in the file
 * @returns {Promise<Buffer>} Node Buffer or ArrayBuffer with the data
 * @note File must be opened before calling this method
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
 * Read the entire file as text
 * @returns {Promise<String>} File contents as string
 * @note Default encoding is 'utf-8' if not specified
 * @note UTF-8 BOM is automatically removed if present
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
 * Writes data to the file
 * @param {string|Buffer} data - Data to write (string or buffer)
 * @param {Number} [offset] - Offset within the buffer to start writing from
 * @param {Number} [size] - Number of bytes to write
 * @param {Number} [position] - Position in file where to start writing
 * @note Default encoding is 'utf-8' for string data if not specified
 * @note File must be opened/created before writing
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
 * Copy the file to a new location
 * @param {String} newPath - Destination path for the copy
 * @returns {Promise<Node.File>} The new File object
 * @throws {Error} If attempting to copy a resource type file
 */
Node.File.prototype.copy = async function (newPath)
{
  let newFile = this.fs.file(newPath);
  await this.fs.copyFile(this, newFile);
  return newFile;
};


/**
 * Rename or move a file
 * @param {String|Node.File|Node.Directory} newFile - New name, path, File object, or Directory to move into
 * @throws {Error} If attempting to rename to a resource type file
 * @note If newFile is a Directory or path ending with '/', keeps the original filename
 * @note Updates the file's path and public URL after successful rename
 */
Node.File.prototype.rename = async function (newFile)
{
  if (newFile instanceof Node.Directory)
    newFile = this.fs.file(`${newFile.path}/${this.name()}`);
  else if (typeof newFile === "string" && newFile.endsWith("/"))
    newFile = this.fs.file(`${newFile}${this.name()}`);
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
 * Get the file size in bytes
 * @returns {Promise<Number>} File size in bytes
 */
Node.File.prototype.length = async function ()
{
  return await this.fs.fileLength(this);
};


/**
 * Get the filename including extension
 * @returns {String} Filename with extension (e.g., 'document.pdf')
 */
Node.File.prototype.name = function ()
{
  return this.path.replace(/^.*(\\|\/|:)/, "");
};


/**
 * Get the file extension without the dot
 * @returns {String|null} Extension (e.g., 'pdf') or null if no extension
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
 * Get the last modified date of the file
 * @returns {Promise<Date>} Last modified date as Date object
 */
Node.File.prototype.dateTime = async function ()
{
  return await this.fs.fileDateTime(this);
};


/**
 * Delete the file from the filesystem
 * @throws {Error} If attempting to remove a resource type file
 * @note This operation is permanent and cannot be undone
 */
Node.File.prototype.remove = async function ()
{
  await this.fs.deleteFile(this);
};


/**
 * Compress the file into a ZIP archive
 * @returns {Promise<Node.File>} New File object for the created .zip file
 * @throws {Error} If attempting to zip a resource type file
 * @note Creates a .zip file with the same name in the same directory
 */
Node.File.prototype.zip = async function ()
{
  let zipFile = this.fs.file(`${this.path}.zip`);
  await this.fs.zipFile(this, zipFile);
  return zipFile;
};


/**
 * Extract a ZIP archive to a directory
 * @param {String} path - Destination directory path for extraction
 * @returns {Promise<Node.Directory>} Directory object where files were extracted
 * @throws {Error} If attempting to unzip a resource type file
 */
Node.File.prototype.unzip = async function (path)
{
  let unzipDir = this.fs.directory(path);
  await this.fs.unzip(this, unzipDir);
  return unzipDir;
};


//  export module for node
module.exports = Node.File;
