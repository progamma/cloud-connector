/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */


/* global module */

var Node = Node || {};


/**
 * @class Node.Directory
 * @classdesc Represents a directory in the file system.
 * Provides methods for creating, reading, renaming, copying, and removing directories.
 *
 * @param {Node.FS} fs - The file system instance that manages this directory
 * @param {string} path - The relative path of the directory (leading/trailing slashes will be removed)
 *
 * @property {string} path - The normalized relative path of the directory
 * @property {string} absolutePath - The absolute path of the directory (read-only)
 * @property {Node.FS} fs - Reference to the file system instance
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


/**
 * @property {string} path - The normalized relative path of the directory
 * @property {string} absolutePath - The absolute path of the directory (read-only)
 */
Object.defineProperties(Node.Directory.prototype, {
  path: {
    get() {
      return this._path;
    },
    set(newValue) {
      this._path = Node.FS.normalizePath(newValue);
    }
  },
  absolutePath: {
    get() {
      return this.fs.getAbsolutePath(this);
    }
  }
});


/**
 * Returns debug information about this Directory instance for the DTT module.
 * @returns {Object} Debug info object containing _class, path and type properties
 */
Node.Directory.prototype.getDebugInfo = function ()
{
  return {
    _class: "Directory",
    path: this.path
  };
};


/**
 * Returns the directory name (last part of the path).
 * @returns {String} Directory name without path prefix
 */
Node.Directory.prototype.name = function ()
{
  return this.path.replace(/^.*(\\|\/|:)/, "");
};


/**
 * Creates the directory physically on the file system.
 * Parent directories are created automatically if they don't exist (recursive).
 * @returns {Promise<void>} Resolves when the directory is created
 */
Node.Directory.prototype.create = async function ()
{
  await this.fs.mkDir(this);
};


/**
 * Checks whether the directory exists on the file system.
 * @returns {Promise<Boolean>} Resolves to true if directory exists, false otherwise
 */
Node.Directory.prototype.exists = async function ()
{
  return await this.fs.dirExists(this);
};


/**
 * Renames or moves the directory to a new location.
 * Updates the directory's path property after successful rename.
 * @param {String|App.Directory} newDir - New directory name or path
 * @returns {Promise<void>} Resolves when the rename is complete
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
 * Copies the entire directory and all its contents to a new location.
 * Creates a complete recursive copy including all subdirectories and files.
 * @param {String} newPath - Destination path where the directory will be copied
 * @returns {Promise<Node.Directory>} Resolves to the new Directory object
 */
Node.Directory.prototype.copy = async function (newPath)
{
  let newDir = this.fs.directory(newPath);
  await this.fs.copyDir(this, newDir);
  return newDir;
};


/**
 * Reads the content of the directory and returns an array of files and folders.
 * Can recursively list subdirectories based on the specified depth level.
 * @param {Number} [depth=0] - Depth level for recursive listing (0=immediate children, -1=full recursive)
 * @returns {Promise<Array<Node.File|Node.Directory>>} Resolves to array of File and Directory objects
 */
Node.Directory.prototype.list = async function (depth = 0)
{
  return await this.fs.readDirectory(this, depth);
};


/**
 * Compresses the directory and all its contents into a ZIP file.
 * The ZIP file is created in the same location with .zip extension.
 * @returns {Promise<Node.File>} Resolves to the File object representing the created ZIP file
 */
Node.Directory.prototype.zip = async function ()
{
  let zipFile = this.fs.file(this.path + ".zip");
  await this.fs.zipDirectory(this, zipFile);
  return zipFile;
};


/**
 * Removes the entire directory and all its contents recursively.
 * This operation is irreversible and permanently deletes all data.
 * @returns {Promise<void>} Resolves when the directory is removed
 */
Node.Directory.prototype.remove = async function ()
{
  await this.fs.removeDirRecursive(this);
};


// export module for node
module.exports = Node.Directory;
