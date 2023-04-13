/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */


/* global module */

var Node = Node || {};


/**
 * @class Url
 * Represents an URL object
 * @param {Node.FS} fs
 * @param {String} url
 */
Node.Url = function (fs, url)
{
  Node.FS = require("./fs");
  //
  // Url string
  this.url = url;
  //
  this.fs = fs;
};


/**
 * Make GET request
 * @param {Object} options
 */
Node.Url.prototype.get = async function (options)
{
  // If requested, change method
  let method = options?.method || "GET";
  //
  return await this.fs.httpRequest(this, method, options);
};


/**
 * Make POST request
 * @param {Object} options
 */
Node.Url.prototype.post = async function (options)
{
  return await this.fs.httpRequest(this, "POST", options);
};


/**
 * Make PUT request
 * @param {Object} options
 */
Node.Url.prototype.put = async function (options)
{
  return await this.fs.httpRequest(this, "PUT", options);
};


/**
 * Make DELETE request
 * @param {Object} options
 */
Node.Url.prototype.delete = async function (options)
{
  return await this.fs.httpRequest(this, "DELETE", options);
};


/**
 * Make PATCH request
 * @param {Object} options
 */
Node.Url.prototype.patch = async function (options)
{
  return await this.fs.httpRequest(this, "PATCH", options);
};


/**
 * Make HEAD request
 * @param {Object} options
 */
Node.Url.prototype.head = async function (options)
{
  return await this.fs.httpRequest(this, "HEAD", options);
};


/**
 * Make a request whit custom method
 * @param {String} method
 * @param {Object} options
 */
Node.Url.prototype.request = async function (method, options)
{
  return await this.fs.httpRequest(this, method, options);
};


/**
 * Download a file
 * @param {Object} file
 * @param {Object} options
 */
Node.Url.prototype.download = async function (file, options)
{
  // Create object file if it doesn't exist
  if (!file) {
    let path = "tempDownloadedFile";
    if (Node.utils)
      path = Node.utils.generateUID36();
    file = this.fs.file(path);
  }
  else
    this.type = file.type;
  //
  // Set internal request options
  options = Object.assign({_file: file}, options);
  //
  // Make request
  let response = await this.fs.httpRequest(this, "DOWNLOAD", options);
  if (!response.error)
    response.file = file;
  //
  return response;
};


/**
 * Upload a file
 * @param {Object} file
 * @param {Object} options
 */
Node.Url.prototype.upload = async function (file, options)
{
  try {
    if (!file)
      throw new Error("file missing");
    //
    options = Object.assign({
      _fileName: options?.fileName || file.path.substr(file.path.lastIndexOf('/') + 1),
      _nameField: options?.nameField || "file",
      _fileContentType: options?.fileContentType || "application/octet-stream",
      _fileSize: await file.length(),
      _file: file
    }, options);
    //
    // Make request
    return await this.fs.httpRequest(this, "UPLOAD", options);
  }
  catch (e) {
    return {error: e};
  }
};


/**
 * Event fired when the object url sent a chunk bytes while uploading
 * @param {Number} bytesSent
 * @param {Number} total
 */
Node.Url.prototype.onUploadProgress = function (bytesSent, total)
{
  return true;
};


/**
 * Event fired when the object url sent a chunk bytes while uploading
 * @param {Number} bytesTransfered
 * @param {Number} total
 */
Node.Url.prototype.onDownloadProgress = function (bytesTransfered, total)
{
  return true;
};


//  export module for node
if (module)
  module.exports = Node.Url;
