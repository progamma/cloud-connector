/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const LinuxService = require("./linux");
const MacService = require("./macos");
const WindowsService = require("./windows");


/**
 * The three platforms know nothing of each other: each writes what its own init system reads, and
 * keeps the password key wherever that platform can keep a secret. What they share is the shape
 * the installer talks to them through.
 * @param {String} dir - Installation directory
 * @returns {Object} The service of this platform
 */
function serviceFor(dir)
{
  switch (process.platform) {
    case "win32":
      return new WindowsService(dir);

    case "linux":
      return new LinuxService(dir);

    case "darwin":
      return new MacService(dir);

    default:
      throw new Error(`${process.platform} is not a platform the Cloud Connector is installed on. ` +
              "Windows, Linux and macOS are.");
  }
}


module.exports = serviceFor;
