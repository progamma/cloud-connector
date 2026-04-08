/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */


/* global module */

var Node = Node || {};


/**
 * @class Node.Url
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
 * Makes an HTTP GET request to the URL.
 * Supports custom HTTP methods via the options.method parameter.
 * @param {Object} options - Request options (headers, timeout, body, etc.)
 * @param {String} [options.method] - Override HTTP method (defaults to GET)
 * @returns {Promise<Object>} Response object with status, headers, and body
 */
Node.Url.prototype.get = async function (options)
{
  // If requested, change method
  let method = options?.method || "GET";
  //
  return await this.fs.httpRequest(this, method, options);
};


/**
 * Makes an HTTP POST request to the URL.
 * @param {Object} options - Request options (headers, timeout, body, etc.)
 * @returns {Promise<Object>} Response object with status, headers, and body
 */
Node.Url.prototype.post = async function (options)
{
  return await this.fs.httpRequest(this, "POST", options);
};


/**
 * Makes an HTTP PUT request to the URL.
 * @param {Object} options - Request options (headers, timeout, body, etc.)
 * @returns {Promise<Object>} Response object with status, headers, and body
 */
Node.Url.prototype.put = async function (options)
{
  return await this.fs.httpRequest(this, "PUT", options);
};


/**
 * Makes an HTTP DELETE request to the URL.
 * @param {Object} options - Request options (headers, timeout, body, etc.)
 * @returns {Promise<Object>} Response object with status, headers, and body
 */
Node.Url.prototype.delete = async function (options)
{
  return await this.fs.httpRequest(this, "DELETE", options);
};


/**
 * Makes an HTTP PATCH request to the URL.
 * @param {Object} options - Request options (headers, timeout, body, etc.)
 * @returns {Promise<Object>} Response object with status, headers, and body
 */
Node.Url.prototype.patch = async function (options)
{
  return await this.fs.httpRequest(this, "PATCH", options);
};


/**
 * Make HEAD request
 * @param {Object} options
 * @param {Object} options - Request options (headers, timeout, etc.)
 * @returns {Promise<Object>} Response object with status and headers
 */
App.Url.prototype.head = async function (options, callback) {
{
  return await this.fs.httpRequest(this, "HEAD", options);
};


/**
 * Makes an HTTP request with a custom method.
 * Allows for non-standard HTTP methods or custom verbs.
 * @param {String} method - HTTP method to use (e.g., "OPTIONS", "CONNECT", custom verbs)
 * @param {Object} options - Request options (headers, timeout, body, etc.)
 * @returns {Promise<Object>} Response object with status, headers, and body
 */
Node.Url.prototype.request = async function (method, options)
{
  return await this.fs.httpRequest(this, method, options);
};


/**
 * Downloads content from the URL to a file.
 * Creates a temporary file if none is provided. The response includes
 * the file object with the downloaded content.
 * @param {Node.File} [file] - Target file for download (auto-created if not provided)
 * @param {Object} options - Request options (headers, timeout, etc.)
 * @returns {Promise<Object>} Response object with file property and download metadata
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
  return response;
};


/**
 * Uploads a file to the URL using multipart/form-data.
 * Automatically determines file size and sets appropriate headers.
 * @param {Node.File} file - File object to upload
 * @param {Object} options - Upload options
 * @param {String} [options.fileName] - Override filename in upload (defaults to file's basename)
 * @param {String} [options.nameField="file"] - Form field name for the file
 * @param {String} [options.fileContentType="application/octet-stream"] - MIME type for upload
 * @returns {Promise<Object>} Response object with upload status and server response
 * @throws {Error} If file parameter is missing
 */
Node.Url.prototype.upload = async function (file, options)
{
  try {
    if (!file)
      throw new Error("file missing");
    //
    options = Object.assign({
      _fileName: options?.fileName || file.path.slice(file.path.lastIndexOf("/") + 1),
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
 * Event handler called when upload progress is updated.
 * Override this method to track upload progress.
 * @param {Number} bytesSent - Number of bytes uploaded so far
 * @param {Number} total - Total number of bytes to upload
 * @returns {Boolean} Return false to cancel the upload
 */
Node.Url.prototype.onUploadProgress = function (bytesSent, total)
{
  return true;
};


/**
 * Event handler called when download progress is updated.
 * Override this method to track download progress.
 * @param {Number} bytesTransfered - Number of bytes downloaded so far
 * @param {Number} total - Total number of bytes to download
 * @returns {Boolean} Return false to cancel the download
 */
Node.Url.prototype.onDownloadProgress = function (bytesTransfered, total)
{
  return true;
};


//  export module for node
module.exports = Node.Url;
