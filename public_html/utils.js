/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

/* global module */

var Node = Node || {};

Node.path = require("path");
Node.fs = require("fs").promises;

Node.Utils = function ()
{
};


/**
 * Convert an ArrayBuffer to stream
 * @param {ArrayBuffer} buffer
 */
Node.Utils.bufferToStream = function (buffer)
{
  let stream = new require("stream").Readable();
  stream.push(buffer);
  stream.push(null); // Signal the end of the stream
  return stream;
};


Node.Utils.algorithm = "aes-256-cbc";
Node.Utils.key = "1e6d42992f42bbeeda051ea821ee58565ffd3886e4346316fbb1e8aeeedc1d7e";
Node.Utils.iv = "9d1618843b88db8b31af0fd65a66ca04";

/**
 * Encrypt a text
 * @param {String} text to encrypt
 * @param {String} key
 * @param {String} iv
 */
Node.Utils.encrypt = function (text, key, iv)
{
  if (!key)
    key = Node.Utils.key;
  if (!iv)
    iv = Node.Utils.iv;
  //
  let crypto = require("crypto");
  let cipher = crypto.createCipheriv(Node.Utils.algorithm, Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString("hex");
};


/**
 * Decrypt a text
 * @param {String} text to decrypt
 * @param {String} key
 * @param {String} iv
 */
Node.Utils.decrypt = function (text, key, iv)
{
  if (!key)
    key = Node.Utils.key;
  if (!iv)
    iv = Node.Utils.iv;
  //
  let crypto = require("crypto");
  let encryptedText = Buffer.from(text, "hex");
  let decipher = crypto.createDecipheriv(Node.Utils.algorithm, Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};


/**
 * Detect standard timezone offset
 */
Node.Utils.stdTimezoneOffset = function ()
{
  let jan = new Date(1970, 0, 1);
  let jul = new Date(1970, 6, 1);
  return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
};


/**
 * Check if a date has daylight savings time
 * @param {Date} d
 */
Node.Utils.isDstObserved = function (d)
{
  return d.getTimezoneOffset() < Node.Utils.stdTimezoneOffset();
};


/**
 * Execute a script safely with proper validation and sanitization
 * @param {String} scriptFile - Script to execute
 * @param {Object} logger - Logger instance for logging
 * @param {Object} options - Execution options
 * @returns {Promise} - Promise that resolves when script execution completes
 */
Node.Utils.executeScript = async function(scriptFile, logger, options = {})
{
  let child_process = require("child_process");
  let util = require("util");
  let execFile = util.promisify(child_process.execFile);
  //
  let scriptPath = Node.path.join(__dirname, scriptFile);
  try {
    let realPath = await Node.fs.realpath(scriptPath);
    //
    // Platform-specific permission checks
    let isWindows = process.platform === "win32";
    if (!isWindows) {
      let stats = await Node.fs.stat(realPath);
      if (stats.mode & 0o002)
        throw new Error('Script has unsafe permissions: world-writable');
      await Node.fs.chmod(realPath, 0o750); // Owner: rwx, Group: r-x, Others: ---
    }
    //
    logger.log(`Executing script: ${scriptFile} at path: ${realPath}`);
    //
    // Build execution configuration
    let command = isWindows ? realPath : "/bin/bash";
    let args = isWindows ? [] : [realPath];
    //
    // Execute based on mode (detached or regular)
    if (options.detached) {
      let spawnOptions = {
        detached: true,
        stdio: "ignore",
        ...(isWindows && {windowsHide: true})
      };
      //
      let child = child_process.spawn(command, args, spawnOptions);
      let.unref();
      return child;
    }
    else {
      let execOptions = {
        cwd: __dirname,
        timeout: options.timeout || 30000,
        ...(isWindows && {windowsHide: true})
      };
      //
      return await execFile(command, args, execOptions);
    }
  }
  catch (error) {
    logger.error(`Script execution failed for ${scriptFile}: ${error.message}`);
    throw new Error(`Failed to execute script '${scriptFile}': ${error.message}`);
  }
};


/**
 * Recursively replace environment variables in an object's values
 * @param {Object} obj
 */
Node.Utils.replaceEnvVariables = function (obj)
{
  if (!obj)
    return;
  //
  // Iterate over each key in the object
  for (let [key, value] of Object.entries(obj)) {
    switch (typeof value) {
      case "string":
        // If the value is a string, replace the environment variables
        // Replace with the environment variable value or the original match if not found
        obj[key] = value.replace(/%(\w+)%/g, (match, variable) => process.env[variable] || "");
        break;

      case "object":
        // If the value is an object, recursively replace its environment variables
        Node.Utils.replaceEnvVariables(value);
        break;
    }
  }
};


/**
 * Decrypt/encrypt the passwords of datamodels
 * @param {Object} config
 * @param {String} key
 * @param {Boolean} encrypt
 */
Node.Utils.processPasswords = function (config, key, encrypt)
{
  // Validate key length for security
  if (key && key.length < 32)
    throw new Error("passwordPrivateKey must be at least 32 characters long");
  //
  config.datamodels?.forEach(dm => {
    let password = dm.connectionOptions.password;
    if (!password)
      return;
    //
    try {
      // Try to decrypt the password; I may not be able to do this if the password is still in clear text
      dm.connectionOptions.password = Node.Utils.decrypt(password, key, dm.iv);
    }
    catch (e) {
    }
    //
    if (encrypt) {
      try {
        // Generate a new iv
        dm.iv = require("crypto").randomBytes(16).toString("hex");
        dm.connectionOptions.password = Node.Utils.encrypt(dm.connectionOptions.password, key, dm.iv);
      }
      catch (e) {
        throw new Error(`Unable to encryt the password of datamodel '${dm.name}': ${e.message}`);
      }
    }
  });
};


//export module for node
module.exports = Node.Utils;
