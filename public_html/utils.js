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
  let stream = new require('stream').Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
};


Node.Utils.algorithm = "aes-256-cbc";
Node.Utils.key = Buffer.from([30, 109, 66, 153, 47, 66, 187, 238, 218, 5, 30, 168, 33, 238, 88, 86, 95, 253, 56, 134, 228, 52, 99, 22, 251, 177, 232, 174, 238, 220, 29, 126]);
Node.Utils.iv = Buffer.from([157, 22, 24, 132, 59, 136, 219, 139, 49, 175, 15, 214, 90, 102, 202, 4]);

/**
 * Encrypt a text
 * @param {String} text to encrypt
 */
Node.Utils.encrypt = function (text)
{
  let crypto = require("crypto");
  let cipher = crypto.createCipheriv(Node.Utils.algorithm, Buffer.from(Node.Utils.key), Node.Utils.iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return encrypted.toString("hex");
};


/**
 * Decrypt a text
 * @param {String} text to decrypt
 */
Node.Utils.decrypt = function (text)
{
  let crypto = require("crypto");
  let encryptedText = Buffer.from(text, "hex");
  let decipher = crypto.createDecipheriv(Node.Utils.algorithm, Buffer.from(Node.Utils.key), Node.Utils.iv);
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


//export module for node
module.exports = Node.Utils;
