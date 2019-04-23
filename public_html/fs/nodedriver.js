/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
 * All rights reserved
 */


/* global ArrayBuffer, module */

var Node = Node || {};

if (module)
  Node.FS = require("./fs");

/**
 * @class NodeDriver
 * Represents a node driver object,that will handle files and folders
 * @param {Object} parent
 * @param {Object} config
 */
Node.NodeDriver = function (parent, config)
{
  // Import modules
  if (module) {
    Node.nodeFs = require("fs");
    Node.pathNode = require("path");
    Node.querystring = require("querystring");
    Node.async = require("async"); //license and detail: https://github.com/caolan/async
    Node.fsExtra = require("fs.extra"); //license and detail: https://www.npmjs.com/package/fs.extra
    Node.archiver = require("archiver"); //license and detail: https://github.com/ctalkington/node-archiver
    Node.yauzl = require("yauzl"); //license and detail: https://github.com/thejoshwolfe/yauzl
  }
  //
  // Files opened
  this.files = {};
  //
  Node.FS.call(this, parent, config);
};

// Make Node.NodeDriver extend Node.FS
Node.NodeDriver.prototype = new Node.FS();


/**
 * Checks the validity of path
 * @param {File/Directory} obj
 */
Node.NodeDriver.prototype.checkPath = function (obj)
{
  // Absolute path
  var path = [this.path, obj.path].join("/");
  //
  // Remove final slash
  if (path.endsWith("/"))
    path = path.slice(0, -1);
  //
  return path;
};


/**
 * Creates the file physically (Opens the file and overwrites it)
 * @param {File} file
 * @param {function} cb
 */
Node.NodeDriver.prototype.createFile = function (file, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check the validity of the path (writing)
  var path = this.checkPath(file);
  //
  // Object of type write stream used to write
  file.wstream = Node.nodeFs.createWriteStream(path, {encoding: file.encoding});
  //
  // Listen to open event
  file.wstream.on("open", function () {
    file.wstream.removeAllListeners("error");
    this.files[file.id] = file;
    cb();
  }.bind(this));
  //
  // Listen to next error event
  file.wstream.once("error", function (error) {
    delete file.wstream;
    cb(error);
  });
};


/**
 * Opens the file for reading
 * @param {File} file
 * @param {function} cb
 */
Node.NodeDriver.prototype.openFile = function (file, cb)
{
  // Check the validity of the path (reading)
  var fullPath = this.checkPath(file);
  //
  // Object of type read stream used to read
  file.rstream = Node.nodeFs.createReadStream(fullPath, {encoding: file.encoding});
  //
  // Listen to open event
  file.rstream.on("open", function () {
    file.rstream.removeAllListeners("error");
    this.files[file.id] = file;
    cb();
  }.bind(this));
  //
  // Listen to next error event
  file.rstream.once("error", function (error) {
    delete file.rstream;
    cb(error);
  });
};


/**
 * Opens the file to append data
 * @param {File} file
 * @param {function} cb
 */
Node.NodeDriver.prototype.openFileForAppend = function (file, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check the validity of the path (wiriting)
  var path = this.checkPath(file);
  //
  // Object of type write stream used to write (setting the append flag)
  file.wstream = Node.nodeFs.createWriteStream(path, {flags: "a", encoding: file.encoding});
  //
  // Listen to open event
  file.wstream.on("open", function () {
    file.wstream.removeAllListeners("error");
    this.files[file.id] = file;
    cb();
  }.bind(this));
  //
  // Listen to next error event
  file.wstream.once('error', function () {
    delete file.wstream;
    cb(new Error("Open file for append error"));
  });
};


/**
 * Closes the file
 * @param {File} file
 * @param {function} cb
 */
Node.NodeDriver.prototype.close = function (file, cb)
{
  delete this.files[file.id];
  delete file.rspos;
  //
  if (file.rstream) {
    file.rstream.destroy();
    delete file.rstream;
  }
  //
  if (file.wstream) {
    file.wstream.on("finish", cb);
    file.wstream.end();
    delete file.wstream;
  }
  else
    cb();
};


/**
 * Checks existence of a file
 * @param {File} file
 * @param {function} cb
 */
Node.NodeDriver.prototype.fileExists = function (file, cb)
{
  // Check the validity of the path (reading)
  var path = this.checkPath(file);
  //
  // Check stats of file
  Node.nodeFs.stat(path, function (err, stats) {
    cb(err || !stats.isFile() ? false : true);
  });
};


/**
 * Reads a block of data, return an array buffer
 * @param {File} file
 * @param {int} length
 * @param {int} offset
 * @param {function} cb
 */
Node.NodeDriver.prototype.read = function (file, length, offset, cb)
{
  // Check the validity of the path (reading)
  var path = this.checkPath(file);
  //
  // Check that the file is opened (reading)
  if (!file.rstream)
    return cb(null, new Error("File not opened"));
  //
  // Setting the correct limit: if length or offset are null take respectively the current position of the
  // reader and the position of the last byte of the file
  var opts = {};
  if (typeof offset === "number")
    opts.start = offset;
  else if (file.rspos)
    opts.start = file.rspos;
  //
  if (length)
    opts.end = opts.start + length - 1;
  opts.encoding = null;
  //
  // I recreate the reader with the correct limits
  file.rstream.destroy();
  file.rstream = Node.nodeFs.createReadStream(path, opts);
  //
  // I create the buffer where the bytes read will be placed on
  var buf = new Buffer(length || 1024);
  var bytesRead = 0;
  //
  // Listen to next error event
  file.rstream.once("error", function (error) {
    cb(null, error);
  });
  //
  // Listen to data events
  file.rstream.on("data", function (chunk) {
    // Check if buffer is large enough
    if (buf.length < bytesRead + chunk.length) {
      // Enlarge buffer
      var bufTmp = new Buffer(Math.max(buf.length, chunk.length) * 2);
      buf.copy(bufTmp);
      buf = bufTmp;
    }
    //
    // Write the bytes in the buffer
    chunk.copy(buf, bytesRead);
    bytesRead += chunk.length;
  });
  //
  // Listen to end event
  file.rstream.once("end", function () {
    file.rspos = (opts.start || 0) + bytesRead;
    //
    // Converts the Buffer to ArrayBuffer
    cb(bytesRead ? (new Uint8Array(buf.slice(0, bytesRead))).buffer : null);
  });
};


/**
 * Read the whole file as text
 * @param {File} file
 * @param {function} cb
 */
Node.NodeDriver.prototype.readAll = function (file, cb)
{
  // Check the validity of the path (reading)
  var path = this.checkPath(file);
  //
  // Read content
  Node.nodeFs.readFile(path, {encoding: file.encoding || "utf-8"}, function (err, content) {
    cb(content, err);
  });
};


/**
 * Writes the data or the string given
 * @param {File} file
 * @param {string/buffer} data
 * @param {int} offset
 * @param {int} size
 * @param {int} position
 * @param {function} cb
 */
Node.NodeDriver.prototype.write = function (file, data, offset, size, position, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check that the file is opened (writing)
  if (!file.wstream)
    return cb(new Error("File not open for write"));
  //
  if (!data)
    return cb(new Error("No data to write"));
  //
  if (!(data instanceof ArrayBuffer) && typeof data !== "string")
    data = JSON.stringify(data);
  //
  // Checks if param data is an array buffer or a string
  if (typeof data === "string") {
    // If not specified the default encoding is utf-8
    file.encoding = file.encoding || "utf-8";
    //
    file.wstream.write(data, file.encoding, function (err) {
      if (file.wstream)
        file.wstream.removeAllListeners("error");
      cb(err);
    });
  }
  else {
    // Setting the correct limit: if offset or size are null take respectively the current
    // position of the writer and the position of the last byte of the file
    if (position !== null && position >= 0)
      file.wstream.pos = position;
    //
    if (!size)
      size = data.length;
    //
    if (!offset || offset < 0)
      offset = 0;
    //
    var buffer = new Buffer(new Uint8Array(data));
    buffer.slice(offset, offset + size);
    //
    // Write buffer
    file.wstream.write(buffer, function (error) {
      if (file.wstream)
        file.wstream.removeAllListeners("error");
      cb(error);
    });
    //
    // Listen to next error event; if not listened don't is called write callback
    file.wstream.once("error", function (error) {
    });
  }
};


/**
 * Copy the file
 * @param {File} file
 * @param {File} newFile
 * @param {function} cb
 */
Node.NodeDriver.prototype.copyFile = function (file, newFile, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check that the relative paths are valid and I get absolute paths
  var oldFullPath = this.checkPath(file);
  //
  var newFullPath = this.checkPath(newFile);
  //
  // Check the file existence
  this.fileExists(file, function (exists) {
    if (!exists)
      return cb(new Error("Error: file to copy doesn't exist"));
    //
    var cbCalled = false;
    var done = function (err) {
      if (cbCalled)
        return;
      //
      cbCalled = true;
      cb(err);
    };
    //
    // Create reader and writer streams
    var rs = Node.nodeFs.createReadStream(oldFullPath, {encoding: null});
    var ws = Node.nodeFs.createWriteStream(newFullPath, {encoding: null});
    //
    // Listen to error and close events
    rs.on("error", done);
    ws.on("error", done);
    ws.on("close", done);
    //
    // Copy file trough pipe the streams
    rs.pipe(ws);
  });
};


/**
 * Rename a file or directory
 * @param {File/Directory} obj
 * @param {string} newName
 * @param {function} cb
 */
Node.NodeDriver.prototype.renameObject = function (obj, newName, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check that the relative paths are valid and I get absolute paths
  var path = this.checkPath(obj);
  //
  var newPath = path.substring(0, path.lastIndexOf("/") + 1) + newName;
  //
  // Rename
  Node.nodeFs.rename(path, newPath, cb);
};


/**
 * Return the file size (in bytes)
 * @param {File} file
 * @param {function} cb
 */
Node.NodeDriver.prototype.fileLength = function (file, cb)
{
  // Check the validity of the path (reading)
  var path = this.checkPath(file);
  //
  // Get the size
  Node.nodeFs.stat(path, function (err, stats) {
    if (err)
      cb(null, err);
    else
      cb(stats.size);
  });
};


/**
 * Return the last modified file date
 * @param {File} file
 * @param {function} cb
 */
Node.NodeDriver.prototype.fileDateTime = function (file, cb)
{
  // Check the validity of the path (reading)
  var path = this.checkPath(file);
  //
  // Get the date
  Node.nodeFs.stat(path, function (err, stats) {
    if (err)
      cb(null, err);
    else
      cb(stats.mtime);
  });
};


/**
 * Deletes a file
 * @param {File} file
 * @param {function} cb
 */
Node.NodeDriver.prototype.deleteFile = function (file, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check the validity of the path (writing)
  var path = this.checkPath(file);
  //
  // Remove
  Node.nodeFs.unlink(path, cb);
};


/**
 * Zip a file
 * @param {File} file
 * @param {File} zipFile
 * @param {function} cb
 */
Node.NodeDriver.prototype.zipFile = function (file, zipFile, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  var path = this.checkPath(file);
  var zipPath = this.checkPath(zipFile);
  //
  var cbCalled = false;
  var done = function (err) {
    if (cbCalled)
      return;
    //
    cbCalled = true;
    cb(err);
  };
  //
  // Create the write stream
  var output = Node.nodeFs.createWriteStream(zipPath);
  //
  // Create the archive object
  var archive = Node.archiver('zip');
  //
  // Listen to next error event
  output.once("error", function (err) {
    deleteVoidZip(err);
  });
  //
  // Listen to close finalization archive
  output.on('close', function () {
    done();
  });
  //
  // Listen to error event
  archive.on("error", function (err) {
    deleteVoidZip(err);
  });
  //
  output.on("open", function () {
    // Push data into the archive
    archive.pipe(output);
    //
    var input = Node.nodeFs.createReadStream(path);
    //
    // Listen to error event
    input.on("error", function (err) {
      deleteVoidZip(err);
    });
    //
    // Listen to error event
    input.on("open", function () {
      // Get the file name
      var sepPath = file.path.split("/");
      archive.append(input, {name: sepPath[sepPath.length - 1]}).finalize();
    });
  });
  //
  // Function that deletes the new zip file (if there is an error)
  var deleteVoidZip = function (err) {
    archive.finalize();
    Node.nodeFs.unlink(zipPath, function (err1) {
      done(err || err1);
    });
  };
};


/**
 * Unzip the archiver
 * @param {File} file
 * @param {Directory} directory
 * @param {function} cb
 */
Node.NodeDriver.prototype.unzip = function (file, directory, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check the validity of the path (writing)
  var zipPath = this.checkPath(file);
  //
  var dirPath = this.checkPath(directory);
  //
  // Create the parent directory
  Node.fsExtra.mkdirs(dirPath, function (err) {
    if (err)
      return cb(err);
    //
    // Opens the archive for decompression using the library yauzl
    Node.yauzl.open(zipPath, {lazyEntries: true}, function (err, zipfile) {
      if (err)
        return cb(err);
      //
      var ok = false;
      zipfile.readEntry();
      //
      // For each file/directory
      zipfile.on("entry", function (entry) {
        // Directory file names end with '/'
        if (entry.fileName.endsWith("/")) {
          // Create the directory
          Node.fsExtra.mkdirs(dirPath + "/" + entry.fileName, function (err) {
            if (err)
              return cb(err);
            //
            zipfile.readEntry();
          });
        }
        else {
          zipfile.openReadStream(entry, function (err, readStream) {
            if (err)
              return cb(err);
            //
            // Ensure parent directory exists
            Node.fsExtra.mkdirs(Node.pathNode.dirname(entry.fileName), function (err) {
              if (err)
                return cb(err);
              //
              // Extract the files
              var output = Node.nodeFs.createWriteStream(dirPath + "/" + entry.fileName);
              //
              // Listen to open output event
              output.on("open", function () {
                readStream.pipe(output);
              });
              //
              // Listen to next error output event
              output.once("error", function (err) {
                return cb(err);
              });
              //
              // Listen to close output event
              output.on("close", function (err) {
                zipfile.readEntry();
              });
            });
          });
        }
      });
      //
      // When the parsing is in error
      zipfile.on("error", function (error) {
        cb(error);
      });
      //
      // When the parsing is to end
      zipfile.on("end", function (error) {
        ok = true;
      });
      //
      // When the parsing is over
      zipfile.on("close", function () {
        // Create the parent directory object
        if (ok)
          cb();
      });
    });
  });
};


/**
 * Create the directory
 * @param {Directory} directory
 * @param {function} cb
 */
Node.NodeDriver.prototype.mkDir = function (directory, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check the validity of the path (writing)
  var path = this.checkPath(directory);
  //
  // Use fs extra to create even the parent hierarchy
  Node.fsExtra.mkdirs(path, cb);
};


/**
 * Checks the existence of the directory
 * @param {Directory} directory
 * @param {function} cb
 */
Node.NodeDriver.prototype.dirExists = function (directory, cb)
{
  // Check the validity of the path (reading)
  var path = this.checkPath(directory);
  //
  Node.nodeFs.exists(path, cb);
};


/**
 * Copies the entire directory
 * @param {Directory} srcDir
 * @param {Directory} dstDir
 * @param {function} cb
 */
Node.NodeDriver.prototype.copyDir = function (srcDir, dstDir, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check that the relative paths are valid and I get absolute paths
  var srcPath = this.checkPath(srcDir);
  var dstPath = this.checkPath(dstDir);
  //
  // Check if source directory exists
  Node.nodeFs.exists(srcPath, function (exists) {
    if (!exists)
      return cb(new Error("Directory " + srcDir.path + " doesn't exist"));
    //
    // Use fs extra to copy the entire directory
    Node.fsExtra.copyRecursive(srcPath, dstPath, function (err) {
      if (err)
        return cb(err);
      //
      cb();
    });
  });
};


/**
 * Reads recursively the content of directory
 * @param {Directory} directory
 * @param {Integer} depth
 * @param {function} cb
 */
Node.NodeDriver.prototype.readDirectory = function (directory, depth, cb)
{
  // Check the validity of the path (reading)
  var path = this.checkPath(directory);
  //
  // Set default depth to 0
  depth = depth || 0;
  //
  // Array of files/directory objects
  var content = [];
  //
  // Array of directories yet to be examined
  var dir = [];
  dir.push({depth: 0, path: path});
  //
  // Recursive core
  var readDirRecursive = function (entries, content, cb) {
    // No directory unexplored: end of recursion
    if (!entries.length)
      return cb(content);
    //
    if (entries[0].depth > depth) {
      // Remove the folder because is deeper than depth
      entries.shift();
      //
      // recall the function
      return readDirRecursive(entries, content, cb);
    }
    //
    // Reads the current directory
    Node.nodeFs.readdir(entries[0].path, function (err, files) {
      if (err)
        return cb(null, err);
      //
      for (var i = 0; i < files.length; i++) {
        // Add the element to the content array
        content = content.concat(entries[0].path + "/" + files[i]);
        var stats = Node.nodeFs.statSync(entries[0].path + "/" + files[i]);
        //
        // if the element is a directory,i add it to the array of folders to be scanned
        if (stats.isDirectory())
          entries.push({depth: entries[0].depth + 1, path: entries[0].path + "/" + files[i]});
      }
      //
      // remove the folder just examined from the array
      entries.shift();
      //
      // recall the function
      readDirRecursive(entries, content, cb);
    });
  };
  //
  readDirRecursive(dir, content, function (files, err) {
    if (err)
      return cb(null, err);
    var content = [];
    //
    // Empty directory
    if (files.length < 1)
      return cb(content);
    //
    files.sort();
    //
    var index = path.split("/").length - (directory.path === "" ? 0 : directory.path.split("/").length);
    //
    // async for each
    Node.async.concat(files, function (files, cb) {
      Node.nodeFs.stat(files, function (err, stats) {
        if (err)
          return cb(null, err);
        //
        // adds to array an object (file or folder)
        var relativePath = files.split("/").slice(index);
        relativePath = relativePath.join("/");
        //
        var object;
        if (stats.isFile())
          object = {path: relativePath, type: "file"};
        else
          object = {path: relativePath, type: "directory"};
        //
        content.push(object);
        cb(null, object);
      }.bind(this));
    }.bind(this), function (err, files) {
      cb(files, err);
    });
  }.bind(this));
};


/**
 * Zip directory
 * @param {Directory} directory
 * @param {File} zipFile
 * @param {function} cb
 */
Node.NodeDriver.prototype.zipDirectory = function (directory, zipFile, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  var path = this.checkPath(directory);
  var zipPath = this.checkPath(zipFile);
  //
  var cbCalled = false;
  var done = function (err) {
    if (cbCalled)
      return;
    //
    cbCalled = true;
    cb(err);
  };
  //
  // Check for existence of directory
  Node.nodeFs.exists(path, function (exists) {
    if (!exists)
      return cb(new Error("Directory doesn't exist"));
    //
    // Create the write stream
    var output = Node.nodeFs.createWriteStream(zipPath);
    //
    // Create the archive object
    var archive = Node.archiver("zip");
    //
    // Listen to next error event
    output.once("error", function (err) {
      deleteVoidZip(err);
    });
    //
    // Listen to close finalization archive
    output.on("close", function () {
      done();
    });
    //
    // Listen to error event
    archive.on("error", function (err) {
      deleteVoidZip(err);
    });
    //
    output.on("open", function () {
      // Push data into the archive
      archive.pipe(output);
      //
      // Add to archive the folder to compress
      archive.glob(path + "/**/*");
      archive.finalize();
      //
    });
  });
  //
  // Function that deletes the new zip file (if there is an error)
  var deleteVoidZip = function (err) {
    Node.nodeFs.unlink(zipPath, function (err1) {
      done(err || err1);
    });
  };
};


/**
 * Removes the entire directory
 * @param {Directory} directory
 * @param {function} cb
 */
Node.NodeDriver.prototype.removeDirRecursive = function (directory, cb)
{
  // Check permissions
  if (this.permissions === Node.FS.permissions.read)
    return cb(new Error("Permission denied"));
  //
  // Check the validity of the path (writing)
  var path = this.checkPath(directory);
  //
  // Use fs extra to remove the directory and its content
  Node.fsExtra.rmrf(path, cb);
};


/**
 * Makes an HTTP request to a web server
 * @param {object} url
 * @param {string} method
 * @param {object} options
 * @param {function} cb
 */
Node.NodeDriver.prototype.httpRequest = function (url, method, options, cb)
{
  options = Object.assign({responseType: "text"}, options);
  //
  var uri = url.url;
  //
  // Multipart request
  var multiPart = false;
  //
  // Download
  var download = false;
  //
  // Upload
  var upload = false;
  //
  // Node module variable
  var request = require("request");
  //
  // Create internal request options object
  var opts = {};
  //
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
  // Check user options
  if (!options.headers)
    options.headers = {};
  //
  // Add an Accept-Encoding header to request compressed content encodings from the server, default true
  opts.gzip = options.hasOwnProperty("gzip") ? options.gzip : true;
  //
  // Get custom headers
  opts.headers = options.headers;
  //
  // Get eventually values for the autentication
  if (options.authentication)
    opts.auth = options.authentication;
  //
  // Set timeout
  if (options.timeOut)
    opts.timeout = options.timeOut;
  //
  // If not specified, the post request type is multipart
  if (options.headers["Content-Type"])
    multiPart = false;
  //
  opts.method = method;
  opts.uri = uri;
  //
  // Custom body case
  if (options.body) {
    if (typeof options.bodyType === "string")
      opts.headers["Content-Type"] = options.bodyType;
    else if (!options.headers["Content-Type"])
      opts.headers["Content-Type"] = "application/octet-stream";
    //
    // Types allowed for the custom body are: string and ArrayBuffer, but you can pass an object to
    // get a JSON custom body
    if (options.body && (typeof options.body === "object") && !(options.body instanceof ArrayBuffer)) {
      try {
        options.body = JSON.stringify(options.body);
      }
      catch (ex) {
        return cb({error: new Error("Cannot stringify custom body")});
      }
      options.headers["Content-Type"] = "application/json";
    }
    if (options.body instanceof ArrayBuffer || typeof options.body === "string")
      opts.body = options.body;
    else
      return cb({error: new Error("Custom body must be string or ArrayBuffer")});
  }
  else if (multiPart) { // multipart
    // Create multipart request for upload
    opts.formData = options.params || {};
    //
    // Delete custom Content-Type
    delete opts.headers["Content-Type"];
    //
    // File section (only fot the upload)
    if (upload) {
      // Check if the path of file is valid
      var path = this.checkPath(false, options._file);
      if (!path)
        return cb({error: new Error("Invalid path")});
      //
      // Add the files
      opts.formData[options._nameField] = {
        value: Node.nodeFs.createReadStream(path),
        options: {
          filename: options._fileName,
          contentType: options._fileContentType
        }
      };
    }
  }
  else if (opts.headers["Content-Type"] === "application/x-www-form-urlencoded")
    opts.form = options.params;
  else {
    // GET request
    //
    // Concatenate options params and url params
    var posQuery = uri.indexOf("?");
    if (posQuery > 0) {
      var qs = Node.querystring.parse(encodeURI(uri.substr(posQuery + 1)));
      if (options.params) {
        for (var propertyName in options.params)
          qs[propertyName] = options.params[propertyName];
      }
      opts.qs = qs;
    }
    else
      opts.qs = options.params;
    opts.useQuerystring = true;
  }
  //
  // For download check file path
  var downloadError = null;
  if (download) {
    // Check path
    var downloadPath = this.checkPath(true, options._file);
    if (!downloadPath)
      return cb({error: new Error("invalid download path")});
    //
    // Create stream
    var writeStream = Node.nodeFs.createWriteStream(downloadPath, {encoding: null});
    writeStream.once("error", function (error) {
      downloadError = error;
    });
  }
  //
  // Set response as buffer
  if (download || options.responseType === "arraybuffer")
    opts.encoding = null;
  //
  // Make request
  var res = {};
  var req = request(opts, function (error, response, body) {
    // Stop the progress events when the response is complete
    clearInterval(uploadprogressTimer);
    //
    if (error)
      return cb({error: error});
    //
    // Remove bom utf-8
    if (typeof body === "string" && body.charCodeAt(0) === 65279)
      body = body.substring(1);
    //
    res.body = (body instanceof Buffer ? body.buffer : body);
    cb(res);
  });
  //
  // Listen to response event
  req.on("response", function (response) {
    // Listen to next abort event
    req.once("abort", function () {
      cb({error: downloadError || new Error("request aborted")});
    });
    //
    res.status = response.statusCode;
    //
    // Download
    if (download && response.statusCode === 200) {
      if (downloadError)
        req.abort();
      else
        req.pipe(writeStream);
    }
    //
    // Amount of byte downloaded
    var byteDownloaded = 0;
    //
    // Listen to data response event
    response.on('data', function (data) {
      res.headers = response.headers;
      var totalBytes = response.headers["Content-Length"];
      //
      byteDownloaded += data.length;
      if (url.onDownloadProgress(byteDownloaded, totalBytes) === false) {
        // Stop response writing
        req.abort();
      }
    });
  });
  //
  // Last value of byte sent
  var lastByteSent = 0;
  //
  // Upload progress handler
  var uploadprogressTimer = setInterval(function () {
    var byteTotal;
    var byteSent;
    if (req.req) {
      if (upload)
        byteTotal = options._fileSize;
      else
        byteTotal = req.req._headers["Content-Length"];
      byteSent = Math.min(req.req.connection._bytesDispatched, byteTotal);
    }
    else
      clearInterval(uploadprogressTimer);
    //
    // If the information is not avaible, stop the event
    if (byteTotal === undefined)
      return clearInterval(uploadprogressTimer);
    //
    // If the values have not changed, they are not notified
    if (lastByteSent === byteSent)
      return;
    //
    // Check if the upload was interrupted
    var abort = (url.onUploadProgress(byteSent, byteTotal) === false);
    lastByteSent = byteSent;
    //
    // In these cases, stops the event
    if (req._ended || abort)
      clearInterval(uploadprogressTimer);
    //
    if (abort)
      req.abort();
  }, 250);
};


/**
 * Put a local file on the other side file system (local/remote)
 * @param {File} localFile
 * @param {File} dstFile
 * @param {function} cb
 */
Node.NodeDriver.prototype.put = function (localFile, dstFile, cb)
{
  if (!dstFile)
    return cb(new Error("Destination file cannot be null"));
  //
  var done = function (error) {
    localFile.close(function (result, remoteError) {
      dstFile.close(function (result, dstError) {
        cb(error || remoteError || dstError);
      });
    });
  };
  //
  var readChunk = function (length, offset, create, callback) {
    // Read chunk
    localFile.read(length, offset, function (res, err) {
      if (err)
        return callback(err);
      //
      var result = {};
      result.chunk = res;
      result.create = create;
      //
      // Write current chunk
      writeChunk(result, function (writeError) {
        if (writeError)
          return callback(writeError);
        //
        // Check if I need to read the next chunk
        if (!res || res.byteLength !== length)
          return callback();
        else // Read next chunk
          readChunk(length, offset + length, false, callback);
      });
    });
  };
  //
  var writeChunk = function (content, callback) {
    // Check if dstFile needs to be created
    if (content.create) {
      dstFile.create(undefined, function (createRes, createErr) {
        if (createErr)
          return callback(createErr);
        //
        // Write chunk into dstFile
        dstFile.write(content.chunk, undefined, undefined, undefined, function (writeRes, writeErr) {
          callback(writeErr);
        });
      });
    }
    else {
      // Write chunk into dstFile
      dstFile.write(content.chunk, undefined, undefined, undefined, function (writeRes, writeErr) {
        callback(writeErr);
      });
    }
  };
  //
  // Open remote file
  localFile.open(function (res, err) {
    if (err)
      return done(err);
    //
    // Start reading and writing chunk by chunk (256 KB is size of a chunk)
    readChunk(1024 * 256, 0, true, done);
  }.bind(this));
};


/*
 * Deserialize File/Directory/Url
 * @param {Object} obj
 */
Node.NodeDriver.prototype.deserializeObject = function (obj) {
  if (obj.id && this.files[obj.id])
    return this.files[obj.id];
  //
  return this[obj._t](obj);
};


/**
 * Receive a message
 * @param {Object} msg
 * @param {Function} callback - for response
 */
Node.NodeDriver.prototype.onMessage = function (msg, callback)
{
  var argsArray = [];
  //
  for (var i = 0; i < msg.args.length; i++) {
    var arg = msg.args[i];
    //
    // Deserialize arguments of type File/Directory/Url
    if (arg && typeof arg === "object" && arg._t) {
      var obj = this.deserializeObject(arg);
      obj.server = msg.server;
      argsArray.push(obj);
    }
    else if (arg && arg instanceof Buffer) // Get ArrayBuffer from Buffer
      argsArray.push(new Uint8Array(arg).buffer);
    else
      argsArray.push(arg);
  }
  argsArray.push(callback);
  //
  // Call function
  this[msg.cmd].apply(this, argsArray);
};


/**
 * Notified when a server disconnects
 * @param {Node.Server} server - server disconnected
 */
Node.NodeDriver.prototype.onServerDisconnected = function (server)
{
  // Close all opened files
  var filesOpened = Object.keys(this.files);
  for (var i = 0; i < filesOpened.length; i++) {
    var f = this.files[filesOpened[i]];
    if (f.server === server) {
      f.close(function (error) {
        if (error)
          this.parent.log("ERROR", "Error closing file '" + f.path + "': " + error);
      }.bind(this));
    }
  }
};


// export module for node
if (module)
  module.exports = Node.NodeDriver;
