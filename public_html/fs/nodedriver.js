/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */


var Node = Node || {};
if (module)
  Node.FS = require("./fs");

/**
 * @class Node.NodeDriver
 * Represents a node driver object that handles files and folders operations on Node.js filesystem
 * @extends {Node.FS}
 * @param {Object} parent
 * @param {Object} config
 */
Node.NodeDriver = function (parent, config)
{
  // Import modules
  Node.nodeFs = require("fs").promises;
  Node.File = require("./file");
  Node.Directory = require("./directory");
  //
  Node.FS.call(this, parent, config);
};

// Make Node.NodeDriver extend Node.FS
Node.NodeDriver.prototype = new Node.FS();


/**
 * Returns the absolute path for a file or directory object, with security validation
 * @param {Node.File|Node.Directory} obj - The file or directory object
 * @returns {String} - The validated absolute path
 * @throws {Error} Throws error if the path is invalid or attempts to access restricted folders
 */
Node.NodeDriver.prototype.getAbsolutePath = function (obj)
{
  obj.path = Node.FS.normalizePath(obj.path);
  //
  // Absolute path
  let absPath = [this.path, obj.path].join("/");
  //
  // Remove final slash
  if (absPath.endsWith("/"))
    absPath = absPath.slice(0, -1);
  //
  return absPath;
};


/**
 * Creates a file physically on the filesystem.
 * Opens the file in write mode, overwrites if exists.
 * @param {Node.File} file - The file object to create
 * @throws {Error} If parameter is not an instance of Node.File
 */
Node.NodeDriver.prototype.createFile = async function (file)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  file.handle = await Node.nodeFs.open(file.absolutePath, "w+");
  this.files[file.id] = file;

};


/**
 * Opens a file for reading operations.
 * @param {Node.File} file - The file object to open
 * @throws {Error} If parameter is not an instance of Node.File
 */
Node.NodeDriver.prototype.openFile = async function (file)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  file.handle = await Node.nodeFs.open(file.absolutePath, "r");
  this.files[file.id] = file;
};


/**
 * Opens a file for appending data.
 * Writes at the end of the file.
 * @param {Node.File} file - The file object to open for append
 * @throws {Error} If parameter is not an instance of Node.File
 */
Node.NodeDriver.prototype.openFileForAppend = async function (file)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  file.handle = await Node.nodeFs.open(file.absolutePath, "a");
  this.files[file.id] = file;
};


/**
 * Closes an open file handle and releases resources.
 * @param {Node.File} file - The file object to close
 * @throws {Error} If parameter is not an instance of Node.File
 */
Node.NodeDriver.prototype.close = async function (file)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  delete this.files[file.id];
  await file.handle?.close();
  delete file.handle;
};


/**
 * Checks existence of a file.
 * @param {Node.File} file - The file object to check.
 * @returns {Promise<Boolean>} True if the file exists and is a file (not a directory), false if the file does not exist
 * @throws {Error} For permission denied or other filesystem errors
 */
Node.NodeDriver.prototype.fileExists = async function (file)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  try {
    return (await Node.nodeFs.stat(file.absolutePath)).isFile();
  }
  catch (e) {
    // Return false only if file does not exist, otherwise propagate the error
    if (e.code === "ENOENT")
      return false;
    //
    throw e;
  }
};


/**
 * Reads a block of binary data from a file
 * @param {Node.File} file - The file object to read from (must be opened)
 * @param {Number} [length] - Number of bytes to read (defaults to file length)
 * @param {Number} [offset] - Position in file to start reading from (null for current position)
 * @returns {Promise<ArrayBuffer>} - The data read as an ArrayBuffer
 * @throws {Error} If file is not opened or parameter is not an instance of Node.File
 */
Node.NodeDriver.prototype.read = async function (file, length, offset)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  // Check that the file is opened (reading)
  if (!file.handle)
    throw new Error("File not opened");
  //
  // Setting the correct limit: if length or offset are null take respectively the current position of the
  // reader and the position of the last byte of the file
  if (!length)
    length = await file.length();
  //
  let opts = {
    length,
    position: typeof offset === "number" ? offset : null,
    buffer: Buffer.alloc(length)
  };
  //
  let {bytesRead, buffer} = await file.handle.read(opts);
  //
  // Converts the Buffer to ArrayBuffer
  return (new Uint8Array(buffer.slice(0, bytesRead))).buffer;
};


/**
 * Reads the entire file content as text
 * @param {Node.File} file - The file object to read
 * @returns {Promise<string>} - The entire file content as a string with specified encoding
 * @throws {Error} If parameter is not an instance of Node.File
 */
Node.NodeDriver.prototype.readAll = async function (file)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  // Client-size is done in file.readAll (must be different)
  // If not specified the default encoding is utf-8
  file.encoding = file.encoding || "utf-8";
  //
  // Read content
  return await Node.nodeFs.readFile(file.absolutePath, {encoding: file.encoding});
};


/**
 * Writes data to an open file
 * @param {Node.File} file - The file object to write to (must be opened for writing)
 * @param {String|ArrayBuffer|Buffer|Object} data - Data to write (objects are JSON stringified)
 * @param {Number} [offset] - Offset in the buffer to start writing from (for binary data)
 * @param {Number} [length] - Number of bytes to write (for binary data)
 * @param {Number} [position] - Position in file to write at
 * @throws {Error} If file is not opened, no data provided, or invalid parameters
 */
Node.NodeDriver.prototype.write = async function (file, data, offset, length, position)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  // Check that the file is opened (writing)
  if (!file.handle)
    throw new Error("File not open for write");
  //
  if (!data)
    throw new Error("No data to write");
  //
  if (!(data instanceof ArrayBuffer) && !(data instanceof Buffer) && typeof data !== "string")
    data = JSON.stringify(data);
  //
  // Checks if param data is an array buffer or a string
  if (typeof data === "string")
    await file.handle.write(data, position, file.encoding);
  else {
    if (!length)
      length = data.length;
    //
    if (!offset || offset < 0)
      offset = 0;
    //
    let buffer = Buffer.from(new Uint8Array(data));
    await file.handle.write(buffer, offset, length, position);
  }
};


/**
 * Copies a file to a new location
 * @param {Node.File} file - The source file to copy
 * @param {Node.File} newFile - The destination file object
 * @throws {Error} If files are not instances of Node.File or source doesn't exist
 */
Node.NodeDriver.prototype.copyFile = async function (file, newFile)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  if (!(newFile instanceof Node.File))
    throw new Error("The provided parameter 'newFile' must be an instance of Node.File");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  let exists = await file.exists();
  if (!exists)
    throw new Error("Error: file to copy doesn't exist");
  //
  await Node.nodeFs.copyFile(file.absolutePath, newFile.absolutePath);
};


/**
 * Renames or moves a file or directory
 * @param {Node.File|Node.Directory} obj - The source file or directory to rename
 * @param {Node.File|Node.Directory|String} newObj - The new file/directory object or name string
 * @throws {Error} If objects are not valid instances
 */
Node.NodeDriver.prototype.renameObject = async function (obj, newObj)
{
  if (!(obj instanceof Node.File || obj instanceof Node.Directory))
    throw new Error("The provided parameter 'obj' must be an instance of Node.File or Node.Directory");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  // Back compatibility (newObj as name)
  if (typeof newObj === "string")
    newObj = this[obj instanceof Node.File ? "file" : "directory"](obj.path.substring(0, obj.path.lastIndexOf("/") + 1) + newObj);
  else if (!(newObj instanceof Node.File || newObj instanceof Node.Directory))
    throw new Error("The provided parameter 'newObj' must be an instance of Node.File or Node.Directory");
  //
  await Node.nodeFs.rename(obj.absolutePath, newObj.absolutePath);
};


/**
 * Returns the size of a file in bytes
 * @param {Node.File} file - The file object
 * @returns {Promise<Number>} - The file size in bytes
 * @throws {Error} If parameter is not an instance of Node.File
 */
Node.NodeDriver.prototype.fileLength = async function (file)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  return (await Node.nodeFs.stat(file.absolutePath)).size;
};


/**
 * Returns the last modified date of a file
 * @param {Node.File} file - The file object
 * @returns {Promise<Date>} - The last modified date as a Date object
 * @throws {Error} If parameter is not an instance of Node.File
 */
Node.NodeDriver.prototype.fileDateTime = async function (file)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  return (await Node.nodeFs.stat(file.absolutePath)).mtime;
};


/**
 * Deletes a file from the filesystem
 * @param {Node.File} file - The file object to delete
 * @throws {Error} If parameter is not an instance of Node.File
 */
Node.NodeDriver.prototype.deleteFile = async function (file)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  await Node.nodeFs.rm(file.absolutePath);
};


/**
 * Compresses a file into a ZIP archive
 * @param {Node.File} file - The source file to compress
 * @param {Node.File} zipFile - The destination ZIP file
 * @throws {Error} If parameters are not instances of Node.File or operation fails
 */
Node.NodeDriver.prototype.zipFile = async function (file, zipFile)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  if (!(zipFile instanceof Node.File))
    throw new Error("The provided parameter 'zipFile' must be an instance of Node.File");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  let filePath = file.absolutePath;
  let zipPath = zipFile.absolutePath;
  //
  await new Promise((resolve, reject) => {
    let error;
    let done = () => error ? reject(error) : resolve();
    //
    // Create the write stream
    let output = require("fs").createWriteStream(zipPath);
    //
    // Create the archive object
    let archive = require("archiver")("zip"); //license and detail: https://github.com/ctalkington/node-archiver
    //
    // Function that deletes the new zip file (if there is an error)
    let deleteVoidZip = err => {
      error = err;
      zipFile.remove();
      archive.finalize();
    };
    //
    // Listen to next error event
    output.once("error", deleteVoidZip);
    //
    // Listen to error event
    archive.on("error", deleteVoidZip);
    //
    output.on("open", () => {
      // Push data into the archive
      archive.pipe(output);
      //
      let input = require("fs").createReadStream(filePath);
      //
      // Listen to error event
      input.on("error", deleteVoidZip);
      //
      // Listen to error event
      input.on("open", () => {
        // Get the file name
        let sepPath = file.path.split("/");
        archive.append(input, {name: sepPath[sepPath.length - 1]}).finalize();
      });
      //
      // Listen to close finalization archive
      output.on('close', done);
    });
  });
};


/**
 * Extracts a ZIP archive to a directory
 * @param {Node.File} file - The ZIP file to extract
 * @param {Node.Directory} directory - The destination directory
 * @throws {Error} If parameters are not valid instances or extraction fails
 */
Node.NodeDriver.prototype.unzip = async function (file, directory)
{
  if (!(file instanceof Node.File))
    throw new Error("The provided parameter 'file' must be an instance of Node.File");
  if (!(directory instanceof Node.Directory))
    throw new Error("The provided parameter 'directory' must be an instance of Node.Directory");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  let zipFile = await require("yauzl-promise").open(file.absolutePath);
  try {
    let {pipeline} = require("stream/promises");
    for await (let entry of zipFile) {
      if (entry.filename.endsWith("/"))
        await this.directory(`${directory.path}/${entry.filename}`).create();
      else {
        let readStream = await entry.openReadStream();
        let writeStream = require("fs").createWriteStream(`${directory.absolutePath}/${entry.filename}`);
        await pipeline(readStream, writeStream);
      }
    }
  }
  finally {
    await zipFile.close();
  }
};


/**
 * Creates a directory (recursively creates parent directories if needed)
 * @param {Node.Directory} directory - The directory object to create
 * @returns {Promise<void>} - Does nothing if directory already exists
 * @throws {Error} If parameter is not an instance of Node.Directory
 */
Node.NodeDriver.prototype.mkDir = async function (directory)
{
  if (!(directory instanceof Node.Directory))
    throw new Error("The provided parameter 'directory' must be an instance of Node.Directory");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  if (await directory.exists())
    return;
  //
  await Node.nodeFs.mkdir(directory.absolutePath, {recursive: true});
};


/**
 * Checks the existence of the directory
 * @param {Node.Directory} directory - The directory object to check
 * @returns {Promise<Boolean>} - Returns true if the directory exists and is a directory (not a file),
 *                                false if the directory does not exist (ENOENT error)
 * @throws {Error} Throws an error for permission denied or other filesystem errors
 */
Node.NodeDriver.prototype.dirExists = async function (directory)
{
  if (!(directory instanceof Node.Directory))
    throw new Error("The provided parameter 'directory' must be an instance of Node.Directory");
  //
  try {
    return (await Node.nodeFs.stat(directory.absolutePath)).isDirectory();
  }
  catch (e) {
    // Return false only if directory does not exist, otherwise propagate the error
    if (e.code === "ENOENT")
      return false;
    //
    throw e;
  }
};


/**
 * Copies an entire directory tree to a new location
 * @param {Node.Directory} srcDir - The source directory to copy
 * @param {Node.Directory} dstDir - The destination directory
 * @throws {Error} If directories are not valid instances or source doesn't exist
 */
Node.NodeDriver.prototype.copyDir = async function (srcDir, dstDir)
{
  if (!(srcDir instanceof Node.Directory))
    throw new Error("The provided parameter 'srcDir' must be an instance of Node.Directory");
  if (!(dstDir instanceof Node.Directory))
    throw new Error("The provided parameter 'dstDir' must be an instance of Node.Directory");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  // Check if source directory exists
  if (!await srcDir.exists())
    throw new Error(`Directory ${srcDir.path} doesn't exist`);
  //
  await require("fs-extra").copy(srcDir.absolutePath, dstDir.absolutePath);
};


/**
 * Reads directory contents recursively up to specified depth
 * @param {Node.Directory} directory - The directory to read
 * @param {Number} [depth=0] - How many levels deep to read (0 = current level only)
 * @returns {Promise<Array<Node.File|Node.Directory>>} - Array of Node.File and Node.Directory objects
 * @throws {Error} If parameter is not an instance of Node.Directory
 */
Node.NodeDriver.prototype.readDirectory = async function (directory, depth = 0)
{
  if (!(directory instanceof Node.Directory))
    throw new Error("The provided parameter 'directory' must be an instance of Node.Directory");
  //
  // Check the validity of the path (reading)
  let path = directory.absolutePath;
  //
  let result = [];
  let entries = await Node.nodeFs.readdir(path);
  for (let entry of entries) {
    let stat = await Node.nodeFs.stat(`${path}/${entry}`);
    let obj = this[stat.isFile() ? "file" : "directory"](`${directory.path}/${entry}`);
    result.push(this.serializeObject(obj));
    //
    if (obj instanceof Node.Directory && depth > 0)
      result.push(...await this.readDirectory(obj, depth - 1));
  }
  //
  return result;
};


/**
 * Compresses an entire directory into a ZIP archive
 * @param {Node.Directory} directory - The directory to compress
 * @param {Node.File} zipFile - The destination ZIP file
 * @returns {Promise<void>}
 * @throws {Error} If parameters are not valid instances, directory doesn't exist, or operation fails
 */
Node.NodeDriver.prototype.zipDirectory = async function (directory, zipFile)
{
  if (!(directory instanceof Node.Directory))
    throw new Error("The provided parameter 'directory' must be an instance of Node.Directory");
  if (!(zipFile instanceof Node.File))
    throw new Error("The provided parameter 'zipFile' must be an instance of Node.File");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  let path = directory.absolutePath;
  let zipPath = zipFile.absolutePath;
  //
  // Check for existence of directory
  if (!await directory.exists())
    throw new Error("Directory doesn't exist");
  //
  // Create the archive object
  // license and detail: https://github.com/ctalkington/node-archiver
  let archive = require("archiver")("zip");
  //
  try {
    // Create the write stream
    let output = require("fs").createWriteStream(zipPath);
    //
    await new Promise((resolve, reject) => {
      // Listen to next error event
      output.once("error", reject);
      //
      // Listen to close finalization archive
      output.on("close", resolve);
      //
      // Listen to error event
      archive.on("error", reject);
      //
      output.on("open", () => {
        // Push data into the archive
        archive.pipe(output);
        //
        // Add to archive the folder to compress
        archive.glob("**/*", {cwd: path});
        //
        archive.finalize();
      });
    });
  }
  catch (e) {
    try {
      archive.finalize();
      await zipFile.remove();
    }
    catch {
    }
    throw e;
  }
};


/**
 * Removes a directory and all its contents recursively
 * @param {Node.Directory} directory - The directory to remove
 * @throws {Error} If parameter is not an instance of Node.Directory
 */
Node.NodeDriver.prototype.removeDirRecursive = async function (directory)
{
  if (!(directory instanceof Node.Directory))
    throw new Error("The provided parameter 'directory' must be an instance of Node.Directory");
  //
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    throw new Error("Permission denied");
  //
  // Use fs extra to remove the directory and its content
  if (!await directory.exists())
    return;
  //
  await Node.nodeFs.rmdir(directory.absolutePath, {recursive: true});
};


/**
 * Makes an HTTP request to a web server with support for various methods and options
 * @param {Object} url - URL object with request configuration
 * @param {String} url.url - The target URL
 * @param {Function} [url.onUploadProgress] - Upload progress callback
 * @param {Function} [url.onDownloadProgress] - Download progress callback
 * @param {String} method - HTTP method (GET, POST, DOWNLOAD, UPLOAD, etc.)
 * @param {Object} [options] - Request options
 * @param {String} [options.responseType='text'] - Expected response type
 * @param {Boolean} [options.gzip=true] - Enable gzip compression
 * @param {Object} [options.params={}] - Query parameters or form data
 * @param {Object} [options.headers={}] - Request headers
 * @param {Object} [options.proxy] - Proxy configuration
 * @param {File} [options.file] - File for download/upload operations
 * @param {String|ArrayBuffer|Object} [options.body] - Custom request body
 * @param {String} [options.bodyType] - Content type for custom body
 * @param {Object} [options.authentication] - Authentication credentials
 * @param {Number} [options.timeOut] - Request timeout in milliseconds
 * @param {File} [options._file] - Internal: File object for upload operations
 * @param {String} [options._fileName] - Internal: File name for upload
 * @param {String} [options._fileContentType] - Internal: MIME type for upload
 * @param {String} [options._nameField] - Internal: Form field name for file upload
 * @returns {Promise<Object>} - Response object with status, headers, body, or error
 * @throws {Error} If file parameter is not an instance of Node.File when provided
 */
Node.NodeDriver.prototype.httpRequest = async function (url, method, options)
{
  options = Object.assign({
    responseType: "text",
    gzip: true,
    params: {},
    headers: {}
  }, options);
  //
  if (options.file && !(options.file instanceof Node.File))
    throw new Error("The provided parameter 'options.file' must be an instance of Node.File");
  //
  let uri = url.url;
  if (this.whiteListedOrigins) {
    // Extract the protocol, hostname, and port
    let parsedUrl = new URL(uri);
    let baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.port ? `:${parsedUrl.port}` : ""}`;
    //
    // Check if the base URL is in the list of allowed URLs
    if (!this.whiteListedOrigins.includes(baseUrl))
      throw new Error(`The URL '${uri}' is not included in the list of permitted URLs`);
  }
  //
  // Helper functions for case-insensitive header operations
  let getHeaderKey = name => {
    let lowerName = name.toLowerCase();
    for (let key in options.headers)
      if (key.toLowerCase() === lowerName)
        return key;
  };
  //
  let getHeader = name => {
    let key = getHeaderKey(name);
    return key ? options.headers[key] : undefined;
  };
  //
  let setHeader = (name, value, skipIfExists = false) => {
    let key = getHeaderKey(name);
    if (!key)
      options.headers[name] = value;
    else if (!skipIfExists)
      options.headers[key] = value;
  };
  //
  let multiPart = false;
  let download = false;
  let upload = false;
  switch (method) {
    case "POST":
      multiPart = true;
      break;

    case "DOWNLOAD":
      download = true;
      method = options.method || "GET";
      break;

    case "UPLOAD":
      multiPart = true;
      upload = true;
      method = "POST";
      break;
  }
  //
  // If not specified, the post request type is multipart
  if (getHeader("Content-Type"))
    multiPart = false;
  //
  // Create internal request options object
  let opts = {
    url: uri,
    method,
    decompress: options.gzip,
    headers: options.headers,
    auth: options.authentication,
    responseType: options.responseType,
    params: options.params,
    timeout: options.timeOut,
    proxy: options.proxy,
    validateStatus: () => true // for back compatibility
  };
  //
  try {
    let response;
    //
    // Custom body case
    if (options.body) {
      opts.data = options.body;
      //
      if (typeof options.bodyType === "string")
        setHeader("Content-Type", options.bodyType);
      //
      // Types allowed for the custom body are: string and ArrayBuffer, but you can pass an object to
      // get a JSON custom body
      if (options.body instanceof ArrayBuffer)
        setHeader("Content-Type", "application/octet-stream", true);
      else if (typeof options.body === "object") {
        try {
          opts.data = JSON.stringify(options.body);
          setHeader("Content-Type", "application/json", true);
        }
        catch (e) {
          throw new Error(`Cannot stringify custom body: ${e.message}`);
        }
      }
      else if (typeof options.body === "string")
        setHeader("Content-Type", "text/plain", true);
      else
        throw new Error("Custom body must be String, Object or ArrayBuffer");
    }
    else if (multiPart) {
      let formData = new require("form-data")();
      for (let key in options.params)
        formData.append(key, options.params[key]);
      delete opts.params;
      //
      if (upload) {
        formData.append(options._nameField, require("fs").createReadStream(options._file.absolutePath), {
          filename: options._fileName,
          contentType: options._fileContentType
        });
        //
        opts.onUploadProgress = event => {
          if (url.onUploadProgress(event.loaded, event.total) === false)
            response.request.abort();
        };
      }
      //
      opts.data = formData;
      // opts.headers = {...opts.headers, ...formData.getHeaders() };
      opts.headers = Object.assign(opts.headers, formData.getHeaders());
    }
    else if (getHeader("Content-Type") === "application/x-www-form-urlencoded") {
      delete opts.params;
      opts.data = options.params;
    }
    //
    if (download) {
      opts.responseType = "stream";
      opts.onDownloadProgress = event => {
        if (url.onDownloadProgress(event.loaded, event.total) === false)
          response.request.abort();
      };
    }
    //
    response = await require("axios")(opts);
    if (download) {
      let writeStream = require("fs").createWriteStream(options._file.absolutePath);
      response.data.pipe(writeStream);
      //
      await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });
    }
    //
    return {
      status: response.status,
      headers: response.headers,
      body: response.data
    };
  }
  catch (e) {
    return {
      error: e
    };
  }
};


/*
 * Deserialize Node.File/Node.Directory/Node.Url
 * @param {Object} obj
 */
Node.NodeDriver.prototype.deserializeObject = function (obj)
{
  if (obj.id && this.files[obj.id])
    return this.files[obj.id];
  //
  switch (obj._t) {
    case "file":
      return this.file(obj.path, obj.id);
    case "directory":
      return this.directory(obj.path);
    case "url":
      return this.url(obj.url);
  }
};


/*
 * Serialize Node.File/Node.Directory/Node.Url
 * @param {Object} obj
 */
Node.NodeDriver.prototype.serializeObject = function (obj)
{
  if (obj instanceof Node.File)
    return {path: obj.path, type: "file"};
  else if (obj instanceof Node.Directory)
    return {path: obj.path, type: "directory"};
  else if (obj instanceof Node.Url)
    return {url: obj.url};
};


/**
 * Receive a message
 * @param {Object} msg
 */
Node.NodeDriver.prototype.onMessage = async function (msg)
{
  let argsArray = [];
  //
  for (let i = 0; i < msg.args.length; i++) {
    let arg = msg.args[i];
    //
    // Deserialize arguments of type Node.File/Node.Directory/Node.Url
    if (arg && typeof arg === "object" && arg._t) {
      let obj = this.deserializeObject(arg);
      obj.server = msg.server;
      argsArray.push(obj);
    }
    else if (arg && arg instanceof Buffer) // Get ArrayBuffer from Buffer
      argsArray.push(new Uint8Array(arg).buffer);
    else
      argsArray.push(arg);
  }
  //
  // Call function
  return await this[msg.cmd].apply(this, argsArray);
};


// export module for node
module.exports = Node.NodeDriver;
