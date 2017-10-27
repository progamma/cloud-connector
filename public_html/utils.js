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
  var base64 = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.length;
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (var i = 0; i < len; i += 3) {
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
  var bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === "=") {
    bufferLength--;
    if (base64[base64.length - 2] === "=")
      bufferLength--;
  }
  //
  var p = 0;
  var len = base64.length;
  var arraybuffer = new ArrayBuffer(bufferLength);
  var bytes = new Uint8Array(arraybuffer);
  var lookup = new Uint8Array(256);
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (var i = 0; i < chars.length; i++)
    lookup[chars.charCodeAt(i)] = i;
  for (var i = 0; i < len; i += 4) {
    var encoded1 = lookup[base64.charCodeAt(i)];
    var encoded2 = lookup[base64.charCodeAt(i + 1)];
    var encoded3 = lookup[base64.charCodeAt(i + 2)];
    var encoded4 = lookup[base64.charCodeAt(i + 3)];
    //
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }
  //
  return arraybuffer;
};


//export module for node
if (module)
  module.exports = Node.Utils;
