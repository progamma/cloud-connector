/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */


var Node = Node || {};

Node.File = require("./file");
Node.Directory = require("./directory");
Node.Url = require("./url");

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
  for (let k in config)
    this[k] = config[k];
  //
  if (this.APIKey === "00000000-0000-0000-0000-000000000000") {
    this.parent.log("WARNING", `The APIKey of fileSystem '${this.name}' is set to the default value and will be ignored`);
    this.APIKey = "";
  }
  //
  // Set default permissions
  this.permissions = this.permissions || Node.FS.permissions.read;
  //
  // Files opened
  this.files = {};
};

Node.FS.permissions = {
  read: "r",
  readWrite: "rw"
};


/**
 * Creates a file object with the appropriate driver and path.
 * File objects provide methods for reading, writing, copying, and managing files.
 * @param {String} path - Relative or absolute file path
 * @returns {Node.File} File object for performing file operations
 */
Node.FS.prototype.file = function (path, id)
{
  return new Node.File(this, path, id);
};


/**
 * Creates a directory object with the appropriate driver.
 * Directory objects provide methods for creating, listing, and managing directories.
 * @param {String} path - Relative or absolute directory path
 * @returns {Node.Directory} Directory object for performing directory operations
 */
Node.FS.prototype.directory = function (path)
{
  return new Node.Directory(this, path);
};


/**
 * Creates a URL object for handling remote file operations.
 * URL objects provide methods for fetching and working with remote resources.
 * @param {String} url - Full URL of the remote resource
 * @returns {Node.Url} URL object for performing remote file operations
 */
Node.FS.prototype.url = function (url)
{
  return new Node.Url(this, url);
};


/**
 * Normalizes a file system path by resolving relative references.
 * Converts backslashes to forward slashes, removes "." segments,
 * and resolves ".." segments. Prevents path traversal outside root.
 * @param {String} path - Path to normalize (can contain . and .. segments)
 * @returns {String} Normalized path with resolved references
 * @throws {Error} If path attempts to traverse above root directory
 */
Node.FS.normalizePath = function (path)
{
  // Check if path is out of root
  path = path.replace(/\\/g, "/");
  //
  let parts = path.split("/");
  for (let i = 0; i < parts.length; i++) {
    switch (parts[i]) {
      case ".":
        parts.splice(i, 1);
        i--;
        break;
      case "..":
        if (i === 0)
          throw new Error(`Invalid path ${path}`);
        parts.splice(i - 1, 2);
        i -= 2;
        break;
    }
  }
  //
  return parts.join("/");
};


/**
 * Notified when a server disconnects
 * @param {Node.Server} server - server disconnected
 */
Node.FS.prototype.onServerDisconnected = async function (server)
{
  // Close all opened files to that server
  await this.disconnect(server);
};


/**
 * Close all opened files
 * @param {Node.Server} server - server disconnected
 */
Node.FS.prototype.disconnect = async function (server)
{
  // Close all opened files
  for (let fileId in this.files) {
    let f = this.files[fileId];
    if (server && f.server !== server)
      return;
    //
    try {
      await f.close();
    }
    catch (e) {
//      throw new Error(`Error closing file '${f.path}': ${error}`);
    }
  }
};


/**
 * Returns the absolute path for a file or directory object.
 * Must be overridden in driver implementations (LocalDriver, NodeDriver, ShellDriver).
 * @param {Node.File|Node.Directory} obj - File or directory object to get absolute path for
 * @returns {String} Absolute path to the file or directory
 */
Node.FS.prototype.getAbsolutePath = function (obj)
{
};


// export module for node
module.exports = Node.FS;
