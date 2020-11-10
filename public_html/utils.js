/*
 * Instant Developer Next
 * Copyright Pro Gamma Spa 2000-2016
 * All rights reserved
 */

/* global module */

var Node = Node || {};


Node.Utils = function ()
{
};


/**
 * Convert an ArrayBuffer to base64 string
 * @param {ArrayBuffer} buffer
 * See https://www.npmjs.com/package/base64-arraybuffer
 */
Node.Utils.bufferToBase64 = function (buffer) {
  if (module)
    return new Buffer(buffer).toString("base64");
  //
  let base64 = "";
  let bytes = new Uint8Array(buffer);
  let len = bytes.length;
  let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < len; i += 3) {
    base64 += chars[bytes[i] >> 2];
    base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    base64 += chars[bytes[i + 2] & 63];
  }
  //
  if ((len % 3) === 2)
    base64 = base64.substring(0, base64.length - 1) + "=";
  else if (len % 3 === 1)
    base64 = base64.substring(0, base64.length - 2) + "==";
  //
  return base64;
};


/**
 * Convert an exadecimal string to ArrayBuffer
 * @param {String} base64
 * See https://www.npmjs.com/package/base64-arraybuffer
 */
Node.Utils.base64ToBuffer = function (base64) {
  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === "=") {
    bufferLength--;
    if (base64[base64.length - 2] === "=")
      bufferLength--;
  }
  //
  let p = 0;
  let len = base64.length;
  let arraybuffer = new ArrayBuffer(bufferLength);
  let bytes = new Uint8Array(arraybuffer);
  let lookup = new Uint8Array(256);
  let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < chars.length; i++)
    lookup[chars.charCodeAt(i)] = i;
  for (let i = 0; i < len; i += 4) {
    let encoded1 = lookup[base64.charCodeAt(i)];
    let encoded2 = lookup[base64.charCodeAt(i + 1)];
    let encoded3 = lookup[base64.charCodeAt(i + 2)];
    let encoded4 = lookup[base64.charCodeAt(i + 3)];
    //
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }
  //
  return arraybuffer;
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


//export module for node
if (module)
  module.exports = Node.Utils;
