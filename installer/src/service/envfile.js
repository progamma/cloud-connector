/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const fs = require("fs");
const path = require("path");


/**
 * @class EnvFile
 * @classdesc
 * The file the password key lives in on Linux and macOS, and the only place it lives: an update
 * reads the key back from here, so a connector that is upgraded keeps reading the passwords it
 * had already stored.
 *
 * The format is the one systemd's `EnvironmentFile=` reads and `sh` sources, which is why both
 * platforms can use the same file with their own mechanism and no translation in between.
 *
 * The file is readable by its owner alone. That is the whole of its protection, and it is why the
 * key does not go in the launchd plist, which launchd insists on being able to read as everyone.
 */
class EnvFile
{
  static fileName = "cc.env";


  /**
   * Full path of the environment file of an installation.
   * @param {String} dir - Installation directory
   * @returns {String} Full path
   */
  static pathOf(dir)
  {
    return path.join(dir, EnvFile.fileName);
  }


  /**
   * Reads the variables of an installation, or nothing when there is no file to read.
   * @param {String} dir - Installation directory
   * @returns {Object} Variables by name
   */
  static read(dir)
  {
    let file = EnvFile.pathOf(dir);
    if (!fs.existsSync(file))
      return {};
    let variables = {};
    for (let line of fs.readFileSync(file, "utf8").split("\n")) {
      let cut = line.indexOf("=");
      if (cut > 0 && !line.trimStart().startsWith("#"))
        variables[line.slice(0, cut).trim()] = line.slice(cut + 1).trim();
    }
    return variables;
  }


  /**
   * Writes the variables of an installation, keeping any others that were already there.
   *
   * Kept and not replaced, because this file is also the only place an operator can put the
   * variables the connector reads and the installer knows nothing about - ORACLE_INSTANT_CLIENT_DIR
   * for Oracle's Thick mode above all, which has to be set before the connector starts and so, for
   * a service, belongs to the service definition. Replacing the file would take those away at the
   * first update, silently, from someone who had no other place to put them.
   *
   * @param {String} dir - Installation directory
   * @param {Object} variables - Variables by name, added to or replacing what is there
   */
  static write(dir, variables)
  {
    let all = Object.assign(EnvFile.read(dir), variables);
    let lines = ["# Read by the Cloud Connector service. CC_KEY is written by the installer and is",
      "# the only copy: losing it means the stored passwords can no longer be read.",
      "# Anything else here is kept as it is across updates - this is where variables the",
      "# connector reads go, ORACLE_INSTANT_CLIENT_DIR among them.", ""];
    for (let name of Object.keys(all))
      lines.push(`${name}=${all[name]}`);
    //
    // The mode is on the open so that a new file is never readable, not even for the instant
    // between creating it and tightening it. writeFileSync ignores mode when the file is already
    // there, though, so an update needs the chmod as well
    fs.writeFileSync(EnvFile.pathOf(dir), lines.join("\n") + "\n", {mode: 0o600});
    fs.chmodSync(EnvFile.pathOf(dir), 0o600);
  }
}


module.exports = EnvFile;
