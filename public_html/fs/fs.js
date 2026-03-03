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
 * Includes comprehensive security checks against various attack vectors.
 * @param {String} path - Path to normalize (can contain . and .. segments)
 * @returns {String} Normalized path with resolved references
 * @throws {Error} If path attempts to traverse above root directory or contains malicious patterns
 */
Node.FS.normalizePath = function (path)
{
  // Validate input
  if (typeof path !== "string")
    throw new Error("Path must be a string");
  //
  // Remove null bytes (common attack vector)
  path = path.replace(/\0/g, '');
  //
  // Decode URL-encoded sequences that could hide traversal attempts
  // e.g., %2e%2e%2f = ../
  try {
    // Only decode if there are encoded characters
    if (path.includes('%')) {
      path = decodeURIComponent(path);
      // Check for double-encoded sequences after first decode
      if (path.match(/%/))
        throw new Error("Path contains suspicious encoded sequences");
    }
  }
  catch (e) {
    // If decoding fails or suspicious encoding detected
    throw new Error("Invalid or suspicious URL encoding in path");
  }
  //
  // Convert Windows path separators to Unix style
  path = path.replace(/\\/g, "/");
  //
  // Check for Unicode/UTF-8 variants of dots and slashes
  // These could be used to bypass filters
  if (path.match(/[\u2024\u2025\u2026\uFF0E\uFF0F]/))
    throw new Error("Path contains suspicious Unicode characters");
  //
  // Reject absolute paths (starting with / or drive letters like C:)
  if (path.match(/^\/|^[a-zA-Z]:/))
    throw new Error("Absolute paths are not allowed");
  //
  // First normalize the path to resolve all . and .. segments
  let parts = path.split("/");
  let normalizedParts = [];
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];
    //
    // Check for segments with three or more consecutive dots
    // Allow "." and ".." as they're handled below
    // Allow filenames like "file..txt" or "fi.le.txt"
    if (part.match(/^\.{3,}$/))
      throw new Error("Multiple consecutive dots not allowed");
    //
    switch (part) {
      case ".":
      case "":
        // Skip empty and current directory references
        continue;

      case "..":
        if (normalizedParts.length > 0) // Go up one level if possible
          normalizedParts.pop();
        else // We're trying to go above root - this is a traversal attempt
          throw new Error("Path traversal above root not allowed");
        break;

      default:
        // Allow dots in filenames (e.g., "file.txt", "fi..le.txt")
        // The ".." case is already handled above, so any other use of dots is allowed
        normalizedParts.push(part);
        break;
    }
  }
  //
  // Build the final path
  let result = normalizedParts.join("/");
  //
  // Final validation: ensure no traversal patterns remain after normalization
  // This shouldn't happen if the above logic is correct, but it's a safety net
  if (result.includes("../") || result.startsWith(".."))
    throw new Error("Path contains traversal pattern after normalization");
  //
  return result;
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
