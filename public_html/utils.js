/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

/* global module */

var Node = Node || {};
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
  stream.push(null);
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
  config.datamodels?.forEach(dm => {
    let password = dm.connectionOptions.password;
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
