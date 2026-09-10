/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const path = require("path");
const fs = require("fs").promises;

/**
 * @class Utils
 * @classdesc
 * Utility class providing helper functions for the Cloud Connector.
 * Contains static methods for encryption, data transformation, environment variable handling,
 * and system operations.
 *
 * Key features:
 * - **Encryption/Decryption**: AES-256-CBC encryption for sensitive data like passwords
 * - **Environment variables**: Dynamic replacement of environment variables in configuration
 * - **Data conversion**: Stream conversion and buffer handling utilities
 * - **Script execution**: Secure script execution with platform-specific handling
 * - **Timezone utilities**: DST detection and timezone offset calculations
 * - **Password management**: Automated encryption/decryption of database passwords
 *
 * Note: This is a static utility class - all methods are static and no instances are created.
 */
class Utils
{
  /**
   * Converts an ArrayBuffer or Buffer to a readable stream.
   * Used for streaming data through pipes and transformations.
   * @param {ArrayBuffer|Buffer} buffer - Buffer to convert
   * @returns {Object} Readable stream containing the buffer data
   */
  static bufferToStream(buffer)
  {
    let stream = new require("stream").Readable();
    stream.push(buffer);
    stream.push(null); // Signal the end of the stream
    return stream;
  }


  /**
   * Generates a 36-character unique identifier.
   * Creates a UUID v4 compliant identifier in the format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
   * where x is any hexadecimal digit and y is one of 8, 9, A, or B.
   * @returns {String} A 36-character unique identifier string
   */
  static generateUID36()
  {
    let lut = [];
    for (let i = 0; i < 256; i++)
      lut[i] = (i < 16 ? "0" : "") + (i).toString(16);
    //
    // Use crypto for secure random generation
    let buf = require("crypto").randomBytes(16);
    let d0 = buf.readUInt32BE(0);
    let d1 = buf.readUInt32BE(4);
    let d2 = buf.readUInt32BE(8);
    let d3 = buf.readUInt32BE(12);
    return (lut[d0 & 0xff] + lut[d0 >> 8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + "-" +
            lut[d1 & 0xff] + lut[d1 >> 8 & 0xff] + "-" + lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + "-" +
            lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & 0xff] + "-" + lut[d2 >> 16 & 0xff] + lut[d2 >> 24 & 0xff] +
            lut[d3 & 0xff] + lut[d3 >> 8 & 0xff] + lut[d3 >> 16 & 0xff] + lut[d3 >> 24 & 0xff]).toUpperCase();
  }


  /**
   * Encrypts text using AES-256-CBC algorithm.
   * Used primarily for encrypting database passwords in configuration.
   * @param {String} text - Text to encrypt
   * @param {String} [key] - Encryption key in hex format (defaults to Utils.key)
   * @param {String} [iv] - Initialization vector in hex format (defaults to Utils.iv)
   * @returns {String} Encrypted text in hex format
   */
  static encrypt(text, key, iv)
  {
    if (!key)
      key = Utils.key;
    if (!iv)
      iv = Utils.iv;
    //
    let crypto = require("crypto");
    let cipher = crypto.createCipheriv(Utils.algorithm, Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString("hex");
  }


  /**
   * Decrypts text encrypted with AES-256-CBC algorithm.
   * Used primarily for decrypting database passwords from configuration.
   * @param {String} text - Encrypted text in hex format
   * @param {String} [key] - Decryption key in hex format (defaults to Utils.key)
   * @param {String} [iv] - Initialization vector in hex format (defaults to Utils.iv)
   * @returns {String} Decrypted plain text
   * @throws {Error} If decryption fails (e.g., wrong key or corrupted data)
   */
  static decrypt(text, key, iv)
  {
    if (!key)
      key = Utils.key;
    if (!iv)
      iv = Utils.iv;
    //
    let crypto = require("crypto");
    let encryptedText = Buffer.from(text, "hex");
    let decipher = crypto.createDecipheriv(Utils.algorithm, Buffer.from(key, "hex"), Buffer.from(iv, "hex"));
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }


  /**
   * Queries the Instant Developer Cloud console to find which server hosts a specific user.
   * @param {String} username - Username to look up
   * @returns {Promise<String>} Server URL hosting the user
   * @throws {Error} If user cannot be located or request fails
   */
  static async serverForUser(username)
  {
    return await new Promise((resolve, reject) => {
      let options = {hostname: "console.instantdevelopercloud.com",
        path: "/CCC/?mode=rest&cmd=serverURL&user=" + username,
        method: "GET"
      };
      //
      let req = require("https").request(options, res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => {
          if (res.statusCode !== 200)
            reject(data);
          else
            resolve(data);
        });
      });
      req.on("error", reject);
      req.end();
    });
  }


  /**
   * Detects the standard timezone offset (without DST) for the current locale.
   * Calculates the maximum offset between January and July to find non-DST offset.
   * @returns {Number} Standard timezone offset in minutes
   */
  static stdTimezoneOffset()
  {
    let jan = new Date(1970, 0, 1);
    let jul = new Date(1970, 6, 1);
    return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  }


  /**
   * Checks if a given date is during daylight saving time.
   * Compares the date's timezone offset with the standard offset.
   * @param {Date} d - Date to check
   * @returns {Boolean} True if DST is active for the given date
   */
  static isDstObserved(d)
  {
    return d.getTimezoneOffset() < Utils.stdTimezoneOffset();
  }


  /**
   * Executes a script file safely with proper validation and sanitization.
   * Includes platform-specific permission checks and execution methods.
   * Supports both regular and detached process execution modes.
   * @param {String} scriptFile - Script filename to execute (relative to current directory)
   * @param {Object} logger - Logger instance for logging execution details
   * @param {Object} [options] - Execution options
   * @param {Boolean} [options.detached] - Run script as detached process
   * @param {Number} [options.timeout=30000] - Execution timeout in milliseconds
   * @returns {Promise<Object>} Child process object for detached mode, execution result otherwise
   * @throws {Error} If script execution fails or has unsafe permissions
   */
  static async executeScript(scriptFile, logger, options = {})
  {
    let child_process = require("child_process");
    let util = require("util");
    let execFile = util.promisify(child_process.execFile);
    //
    let scriptPath = path.join(__dirname, "scripts", scriptFile);
    try {
      let realPath = await fs.realpath(scriptPath);
      //
      // Platform-specific permission checks
      let isWindows = process.platform === "win32";
      if (!isWindows) {
        let stats = await fs.stat(realPath);
        if (stats.mode & 0o002)
          throw new Error("Script has unsafe permissions: world-writable");
        await fs.chmod(realPath, 0o750); // Owner: rwx, Group: r-x, Others: ---
      }
      //
      logger.log("INFO", `Executing script: ${scriptFile} at path: ${realPath}`);
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
        child.unref();
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
      logger.log("ERROR", `Script execution failed for ${scriptFile}: ${error.message}`);
      throw new Error(`Failed to execute script '${scriptFile}': ${error.message}`);
    }
  }


  /**
   * Recursively replaces environment variable placeholders in an object's values.
   * Replaces patterns like %VARIABLE_NAME% with actual environment variable values.
   * Traverses nested objects to replace variables at all levels.
   * @param {Object} obj - Object containing values with environment variable placeholders
   */
  static replaceEnvVariables(obj)
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
          Utils.replaceEnvVariables(value);
          break;
      }
    }
  }


  /**
   * Processes passwords in datamodel configurations for encryption or decryption.
   * Automatically handles both plaintext and encrypted passwords.
   * Generates unique initialization vectors for each datamodel when encrypting.
   * @param {Object} config - Configuration object containing datamodels
   * @param {String} key - Encryption/decryption key (must be at least 32 characters)
   * @param {Boolean} [encrypt] - If true, encrypt passwords; if false or omitted, decrypt
   * @param {Object} logger - Logger with a log(level, message) method used to surface decryption warnings
   * @throws {Error} If key is too short or encryption fails
   */
  static processPasswords(config, key, encrypt, logger)
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
        dm.connectionOptions.password = Utils.decrypt(password, key, dm.iv);
      }
      catch (e) {
        // dm.iv is set only when this connector previously encrypted the password;
        // without it the value is in clear text and the failure is expected.
        if (dm.iv)
          logger.log("WARNING", `Unable to decrypt the password of datamodel '${dm.name}': ${e.message}`);
      }
      //
      if (encrypt) {
        try {
          // Generate a new iv
          dm.iv = require("crypto").randomBytes(16).toString("hex");
          dm.connectionOptions.password = Utils.encrypt(dm.connectionOptions.password, key, dm.iv);
        }
        catch (e) {
          throw new Error(`Unable to encryt the password of datamodel '${dm.name}': ${e.message}`);
        }
      }
    });
  }
}

/**
 * Encryption algorithm used for sensitive data
 * @type {String}
 */
Utils.algorithm = "aes-256-cbc";

/**
 * Default encryption key (hex format) - should be overridden in production
 * @type {String}
 */
Utils.key = "1e6d42992f42bbeeda051ea821ee58565ffd3886e4346316fbb1e8aeeedc1d7e";

/**
 * Default initialization vector (hex format) for encryption
 * @type {String}
 */
Utils.iv = "9d1618843b88db8b31af0fd65a66ca04";


//export module for node
module.exports = Utils;
