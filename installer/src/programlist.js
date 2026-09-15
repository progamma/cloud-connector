/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");


/**
 * @class ProgramList
 * @classdesc
 * The list of installed programs Windows shows in Settings, and how the connector gets into it.
 *
 * This is what makes the connector removable by somebody who no longer has the installer they
 * downloaded, which is everybody: an installer is a thing people delete the moment it has run.
 * Windows will only offer to uninstall something if it was told, at install time, which program
 * to run to do it - so the installer leaves a copy of itself behind and points the entry at that.
 *
 * Nothing here applies to Linux and macOS, where there is no such list to be in: on those the
 * copy is still left, and running it with --uninstall is the whole of the procedure.
 *
 * @property {String} dir - Installation directory
 */
class ProgramList
{
  static key = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\CloudConnector";
  static displayName = "Instant Developer Cloud Connector";
  static publisher = "Pro Gamma Spa";


  /**
   * @param {String} dir - Installation directory
   */
  constructor(dir)
  {
    this.dir = dir;
  }


  /**
   * Runs reg, and says what it answered. Failures are the caller's to read: being in this list is
   * a convenience, and an installation that works but is missing from it is still an installation.
   * @param {String[]} args - Arguments for reg
   * @returns {Object} Answer, as spawnSync returns it
   */
  reg(args)
  {
    return spawnSync("reg.exe", args, {encoding: "utf8", windowsHide: true});
  }


  /**
   * Puts the connector in the list, or brings its entry up to date.
   * @param {String} uninstaller - Full path of the program that removes it
   * @param {String} version - Version to show
   * @returns {String} What went wrong, when something did
   */
  add(uninstaller, version)
  {
    if (process.platform !== "win32")
      return;
    let values = ProgramList.entryFor(this.dir, uninstaller, version);
    for (let name of Object.keys(values)) {
      let answer = this.reg(["add", ProgramList.key, "/v", name, "/t", "REG_SZ", "/d", values[name], "/f"]);
      if (answer.error || answer.status !== 0)
        return `the entry in the list of installed programs could not be written: ${(answer.stderr || "").trim()}`;
    }
    // Neither of these can be done from here, and an entry that offers them offers nothing
    for (let name of ["NoModify", "NoRepair"])
      this.reg(["add", ProgramList.key, "/v", name, "/t", "REG_DWORD", "/d", "1", "/f"]);
    this.reg(["add", ProgramList.key, "/v", "EstimatedSize", "/t", "REG_DWORD",
      "/d", String(ProgramList.kilobytesIn(this.dir)), "/f"]);
  }


  /**
   * Takes the connector out of the list. A missing entry is not a failure: it is the state being
   * asked for.
   */
  remove()
  {
    if (process.platform !== "win32")
      return;
    this.reg(["delete", ProgramList.key, "/f"]);
  }


  /**
   * What Windows is told about the connector.
   *
   * The paths are quoted inside UninstallString because it is a command line and not a path, and
   * "Program Files" has a space in it: unquoted, Windows would try to run "C:\Program" and say
   * nothing useful about why it could not.
   *
   * @param {String} dir - Installation directory
   * @param {String} uninstaller - Full path of the program that removes it
   * @param {String} version - Version to show
   * @returns {Object} The values, by name
   */
  static entryFor(dir, uninstaller, version)
  {
    let command = `"${uninstaller}" --uninstall --dir "${dir}"`;
    return {
      DisplayName: ProgramList.displayName,
      DisplayVersion: version || "",
      Publisher: ProgramList.publisher,
      InstallLocation: dir,
      DisplayIcon: uninstaller,
      UninstallString: command,
      QuietUninstallString: command,
      URLInfoAbout: "https://github.com/progamma/cloud-connector"
    };
  }


  /**
   * How big something is, in kilobytes, which is the unit the list shows sizes in.
   * @param {String} where - Directory to measure
   * @returns {Number} Its size in kilobytes
   */
  static kilobytesIn(where)
  {
    let bytes = 0;
    let walk = here => {
      for (let entry of fs.readdirSync(here, {withFileTypes: true})) {
        let full = path.join(here, entry.name);
        if (entry.isDirectory())
          walk(full);
        else if (entry.isFile())
          bytes += fs.statSync(full).size;
      }
    };
    try {
      walk(where);
    }
    catch {
      // A size that could not be measured is shown as nothing, which is what it was before
    }
    return Math.round(bytes / 1024);
  }
}


module.exports = ProgramList;
