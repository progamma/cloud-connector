/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
 * All rights reserved
 */


/* global module */

var Node = Node || {};


/**
 * @class Url
 * Represents an URL object
 * @param {App.FS} fs
 * @param {string} url
 */
Node.Url = function (fs, url)
{
  Node.FS = require("./fs");
  //
  // Url string
  this.url = url.url;
  //
  this.fs = fs;
};


/**
 * Make GET request
 * @param {object} options
 * @param {function} cb
 */
Node.Url.prototype.get = function (options, cb)
{
  // If requested, change method
  var method = "GET";
  if (options && options.method)
    method = options.method;
  //
  this.fs.httpRequest(this, method, options, cb);
};


/**
 * Make POST request
 * @param {object} options
 * @param {function} cb
 */
Node.Url.prototype.post = function (options, cb)
{
  this.fs.httpRequest(this, "POST", options, cb);
};


/**
 * Make PUT request
 * @param {object} options
 * @param {function} cb
 */
Node.Url.prototype.put = function (options, cb)
{
  this.fs.httpRequest(this, "PUT", options, cb);
};


/**
 * Make DELETE request
 * @param {object} options
 * @param {function} cb
 */
Node.Url.prototype.delete = function (options, cb)
{
  this.fs.httpRequest(this, "DELETE", options, cb);
};


/**
 * Make PATCH request
 * @param {object} options
 * @param {function} cb
 */
Node.Url.prototype.patch = function (options, cb)
{
  this.fs.httpRequest(this, "PATCH", options, cb);
};


/**
 * Make HEAD request
 * @param {object} options
 * @param {function} cb
 */
Node.Url.prototype.head = function (options, cb)
{
  this.fs.httpRequest(this, "HEAD", options, cb);
};


/**
 * Make a request whit custom method
 * @param {string} method
 * @param {object} options
 * @param {function} cb
 */
Node.Url.prototype.request = function (method, options, cb)
{
  this.fs.httpRequest(this, method, options, cb);
};


/**
 * Download a file
 * @param {object} file
 * @param {object} options
 * @param {function} cb
 */
Node.Url.prototype.download = function (file, options, cb)
{
  // Create object file if it doesn't exist
  if (!file) {
    var path = "tempDownloadedFile";
    if (Node.utils)
      path = Node.utils.generateUID36();
    file = this.fs.file(path, Node.FS.internalType.temp);
  }
  else
    this.type = file.type;
  //
  // Set internal request options
  var _options = {};
  if (options)
    _options = options;
  _options._file = file;
  //
  // Make request
  this.fs.httpRequest(this, "DOWNLOAD", _options, function (response) {
    if (!response.error) {
      if (response.publicUrl)
        file._publicUrl = response.publicUrl;
      response.file = file;
    }
    cb();
  });
};


/**
 * Upload a file
 * @param {object} file
 * @param {object} options
 * @param {function} cb
 */
Node.Url.prototype.upload = function (file, options, cb)
{
  if (!file)
    return cb({error: new Error("file missing")});
  //
  // Set internal request options
  options = options || {};
  options._fileName = options.fileName || file.path.substr(file.path.lastIndexOf('/') + 1);
  options._nameField = options.nameField || "file";
  options._fileContentType = options.fileContentType || "application/octet-stream";
  //
  // Get file size
  file.length(function (size, err) {
    if (err)
      return cb(null, err);
    //
    options._fileSize = size;
    options._file = file;
    //
    // Make request
    this.fs.httpRequest(this, "UPLOAD", options, cb);
  }.bind(this));
};


/**
 * Event fired when the object url sent a chunk bytes while uploading
 * @param {int} bytesSent
 * @param {int} total
 */
Node.Url.prototype.onUploadProgress = function (bytesSent, total)
{
  return true;
};


/**
 * Event fired when the object url sent a chunk bytes while uploading
 * @param {int} bytesTransfered
 * @param {int} total
 */
Node.Url.prototype.onDownloadProgress = function (bytesTransfered, total)
{
  return true;
};


//  export module for node
if (module)
  module.exports = Node.Url;

