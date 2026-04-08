/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

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
 * Define dynamic properties for the Directory class.
 */
Object.defineProperties(Node.Directory.prototype, {
  /**
   * Gets or sets the directory path.
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
   * Gets the absolute path to the directory.
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
 * Returns debug information about this Directory instance for the DTT module.
 * Used internally by the framework for debugging and logging purposes.
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
 * Extracts the final directory name from the full path, removing any parent directories.
 * @returns {String} Directory name without path prefix
 */
Node.Directory.prototype.name = function ()
{
  return this.path.replace(/^.*(\\|\/|:)/, "");
};


/**
 * Creates the directory physically on the file system.
 * Parent directories are created automatically if they don't exist (recursive).
 * If the directory already exists, the operation completes without error.
 * @see Node.Directory#exists - To check if directory exists before creation
 */
Node.Directory.prototype.create = async function ()
{
  await this.fs.mkDir(this);
};


/**
 * Checks whether the directory exists on the file system.
 * Does not throw an error if the directory doesn't exist, simply returns false.
 * @returns {Promise<Boolean>} True if directory exists, false otherwise
 */
Node.Directory.prototype.exists = async function ()
{
  return await this.fs.dirExists(this);
};


/**
 * Renames or moves the directory to a new location.
 * Updates the directory's path property after successful rename.
 * If newDir ends with "/", the directory is moved into that location keeping its current name.
 * @param {String|App.Directory} newDir - New directory name or path (string for rename, Directory object for move)
 * @throws {Error} If the rename operation fails due to permissions or invalid paths
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
 * The original directory remains unchanged.
 * @param {String} newPath - Destination path where the directory will be copied
 * @returns {Promise<Node.Directory} The new Directory object representing the copied directory
 * @throws {Error} If the copy operation fails due to permissions or disk space
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
 * @param {Number} [depth=0] - Depth level for recursive listing (0 for immediate children only, -1 for full recursive scan, positive numbers for specific depth levels)
 * @returns {Promise<Array<Node.File|Node.Directory>>} Array of File and Directory objects found in the directory
 * @throws {Error} If the directory doesn't exist or cannot be read
 */
Node.Directory.prototype.list = async function (depth = 0)
{
  return await this.fs.readDirectory(this, depth);
};


/**
 * Compresses the directory and all its contents into a ZIP file.
 * The ZIP file is created in the same location with .zip extension added to the directory name.
 * All subdirectories and files are included recursively in the archive.
 * @returns {Promise<Node.File>} File object representing the created ZIP file
 * @throws {Error} If compression fails or insufficient disk space
 * @see Node.File#unzip - To extract the created ZIP file
 */
Node.Directory.prototype.zip = async function ()
{
  let zipFile = this.fs.file(this.path + ".zip");
  await this.fs.zipDirectory(this, zipFile);
  return zipFile;
};


/**
 * Removes the entire directory and all its contents recursively.
 * This operation is irreversible and permanently deletes all subdirectories and files.
 * **Note:** Use with caution as this operation cannot be undone.
 * @throws {Error} If the directory cannot be removed due to permissions or if it's in use
 */
Node.Directory.prototype.remove = async function ()
{
  await this.fs.removeDirRecursive(this);
};


// export module for node
module.exports = Node.Directory;
