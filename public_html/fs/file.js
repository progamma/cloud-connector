/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */
var Node = Node || {};


/**
 * @class Node.File
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


/**
 * Define dynamic properties for the File class.
 */
Object.defineProperties(Node.File.prototype, {
  /**
   * Gets or sets the file path.
   * Automatically normalizes the path when set.
   * @type {String}
   */
  path: {
    get() {
      return this._path;
    },
    set(newValue) {
      this._path = Node.FS.normalizePath(newValue);
    }
  },
  /**
   * Gets the parent directory of this file.
   * @type {App.Directory}
   * @readonly
   */
  parentDirectory: {
    get() {
      let path = this.path.split("/");
      path.pop();
      return this.fs.directory(path.join("/"), this.type);
    }
  },
  /**
   * Gets the absolute path to the file.
   * @type {String}
   * @readonly
   */
  absolutePath: {
    get() {
      return this.fs.getAbsolutePath(this);
    }
  }
});


/**
 * Returns debug information about this File instance for the DTT module.
 * Note: Used internally by the framework for debugging and logging purposes.
 * @returns {Object} Debug info containing _class, and path properties
 */
Node.File.prototype.getDebugInfo = function ()
{
  return {
    _class: "File",
    path: this.path
  };
};


/**
 * Creates the file physically on the filesystem.
 * Opens and overwrites if the file already exists.
 * Temporary files are automatically tracked for cleanup on termination.
 * **Note:** UTF-8 files automatically get a BOM (Byte Order Mark) prepended.
 * @param {String} [encoding] - File encoding ('utf8', 'utf-8', 'ascii', etc.). Null for binary files
 * @throws {Error} If attempting to create a resource type file
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
 * Opens the file for reading operations.
 * **Note:** File must be closed after reading operations are complete to free resources.
 * @see Node.File#close - To close the file after reading
 */
Node.File.prototype.open = async function ()
{
  await this.fs.openFile(this);
};


/**
 * Opens the file to append data at the end.
 * **Note:** File must be closed after append operations are complete to free resources.
 * @throws {Error} If attempting to append to a resource type file
 * @see Node.File#close - To close the file after appending
 */
Node.File.prototype.append = async function ()
{
  await this.fs.openFileForAppend(this);
};


/**
 * Closes an open file handle.
 * **Note:** Always close files after open/append operations to free system resources.
 */
Node.File.prototype.close = async function ()
{
  await this.fs.close(this);
};


/**
 * Checks whether the file exists on the filesystem.
 * **Note:** Does not throw an error if the file doesn't exist, simply returns false.
 * @returns {Promise<Boolean>} True if file exists, false otherwise
 */
Node.File.prototype.exists = async function ()
{
  return await this.fs.fileExists(this);
};


/**
 * Reads a block of data from the file.
 * **Note:** File must be opened before calling this method.
 * @param {Number} [length] - Number of bytes to read (omit to read entire file)
 * @param {Number} [offset] - Starting position in the file
 * @returns {Promise<Buffer>} Node Buffer or ArrayBuffer with the data
 * @throws {Error} If length is less than 1 (when specified)
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
 * Reads the entire file as text.
 * **Note:** Default encoding is 'utf-8' if not specified.
 * **Note:** UTF-8 BOM is automatically removed if present.
 * **Note:** Resource files are downloaded via HTTP if needed.
 * @returns {Promise<String>} File contents as string
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
 * Writes data to the file.
 * **Note:** Default encoding is 'utf-8' for string data if not specified.
 * **Note:** File must be opened/created before writing.
 * @param {String|Buffer} data - Data to write (string or buffer)
 * @param {Number} [offset] - Offset within the buffer to start writing from
 * @param {Number} [size] - Number of bytes to write
 * @param {Number} [position] - Position in file where to start writing
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
 * Copies the file to a new location.
 * The original file remains unchanged.
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
 * Renames or moves the file.
 * If newFile is a Directory or path ending with '/', keeps the original filename.
 * Updates the file's path and public URL after successful rename.
 * @param {String|Node.File|Node.Directory} newFile - New name, path, File object, or Directory to move into
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
 * Gets the file size in bytes.
 * @returns {Promise<Number>} File size in bytes
 */
Node.File.prototype.length = async function ()
{
  return await this.fs.fileLength(this);
};


/**
 * Gets the filename including extension.
 * @returns {String} Filename with extension (e.g., 'document.pdf')
 */
Node.File.prototype.name = function ()
{
  return this.path.replace(/^.*(\\|\/|:)/, "");
};


/**
 * Gets the file extension without the dot.
 * @returns {String} Extension (e.g., 'pdf') or empty string if no extension
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
 * Gets the last modified date of the file.
 * @returns {Promise<Date>} Last modified date as Date object
 */
Node.File.prototype.dateTime = async function ()
{
  return await this.fs.fileDateTime(this);
};


/**
 * Deletes the file from the filesystem.
 * **Note:** This operation is permanent and cannot be undone.
 * @throws {Error} If attempting to remove a resource type file
 */
Node.File.prototype.remove = async function ()
{
  await this.fs.deleteFile(this);
};


/**
 * Compresses the file into a ZIP archive.
 * **Note:** Creates a .zip file with the same name in the same directory.
 * @returns {Promise<Node.File>} New File object for the created .zip file
 * @throws {Error} If attempting to zip a resource type file
 */
Node.File.prototype.zip = async function ()
{
  let zipFile = this.fs.file(`${this.path}.zip`);
  await this.fs.zipFile(this, zipFile);
  return zipFile;
};


/**
 * Extracts a ZIP archive to a directory.
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
