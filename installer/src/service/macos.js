/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");

const EnvFile = require("./envfile");
const {giveTo} = require("../posix");


/**
 * @class MacService
 * @classdesc
 * Registers the connector with launchd as a daemon, so that it runs without anybody logging in.
 *
 * The key is not in the plist. launchd refuses to load a plist that anyone but its owner can
 * write, but it is quite happy for everyone to read one, and a world readable file is no place
 * for the key that protects the database passwords. So the plist starts a shell that reads the
 * key out of a file only root can read, and then becomes the connector: `exec` means no shell
 * stays behind, and launchd goes on watching the process it expects to be watching.
 *
 * @property {String} dir - Installation directory
 */
class MacService
{
  static id = "com.progamma.cloudconnector";
  static plistDir = "/Library/LaunchDaemons";


  /**
   * @param {String} dir - Installation directory
   */
  constructor(dir)
  {
    this.dir = dir;
  }


  /**
   * Full path of the plist.
   * @returns {String} Full path
   */
  get plistFile()
  {
    return path.join(MacService.plistDir, `${MacService.id}.plist`);
  }


  /**
   * Full path of the file the password key is kept in, which is not the plist.
   * @returns {String} Full path
   */
  get keyFile()
  {
    return EnvFile.pathOf(this.dir);
  }


  /**
   * Says whether this machine can have the service registered, before anything has been moved.
   * launchctl has no --version, so it is asked something harmless that it does answer.
   */
  checkReady()
  {
    let answer = spawnSync("launchctl", ["print-disabled", "system"], {encoding: "utf8"});
    if (answer.error)
      throw new Error("launchctl was not found, so the connector cannot be registered as a " +
              "service on this machine.");
  }


  /**
   * Runs launchctl, and says what it answered.
   * @param {String[]} args - Arguments for launchctl
   * @returns {Object} Answer, as spawnSync returns it
   */
  launchctl(args)
  {
    let answer = spawnSync("launchctl", args, {encoding: "utf8"});
    if (answer.error)
      throw new Error(`Could not run launchctl: ${answer.error.message}`);
    return answer;
  }


  /**
   * Where the registered service was installed from. The plist lives at one fixed path for the
   * whole machine, so that it is there says nothing about which directory it belongs to.
   * @returns {String} The installation directory it belongs to, or nothing when there is no plist
   */
  registeredIn()
  {
    if (!fs.existsSync(this.plistFile))
      return;
    let found = fs.readFileSync(this.plistFile, "utf8")
            .match(/<key>WorkingDirectory<\/key>\s*<string>([^<]*)<\/string>/);
    if (!found)
      return;
    // WorkingDirectory is <dir>/public_html, and it went in through escape() on the way
    return path.dirname(found[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  }


  /**
   * Reads every variable the registered service carries, not the key alone: this file is also
   * where an operator puts the variables the connector reads and the installer knows nothing
   * about, and an update rewrites it whole.
   * @returns {Object} Variables by name
   */
  readEnv()
  {
    return EnvFile.read(this.dir);
  }


  /**
   * Writes the plist and loads it, so that the connector comes up with the machine.
   * @param {Object} env - Variables the service runs with, the password key among them
   * @param {String} [user] - User the connector runs as, root when not said
   */
  install(env, user)
  {
    EnvFile.write(this.dir, env);
    //
    // systemd reads its EnvironmentFile as root and only then drops to User=, but here the file
    // is read by the shell launchd has already put under UserName. So the owner has to be that
    // user, or the connector starts with no key at all and every stored password stops opening
    if (user)
      giveTo(EnvFile.pathOf(this.dir), user);
    //
    // `set -a`, and not `export CC_KEY`. Sourcing a file sets shell variables, and only what is
    // exported becomes the environment the connector starts with: naming one variable carried the
    // key across and left everything else in the file read and then discarded - no use at all to
    // an operator who put ORACLE_INSTANT_CLIENT_DIR there because there is nowhere else to put it.
    // Between `set -a` and `set +a` every assignment is exported as it is made.
    //
    // The paths are quoted for the shell, which is what stands between this and an installation
    // directory with a space in it - on macOS the normal kind - or with an apostrophe in it,
    // which a home directory called O'Brien has and which plain quotes would not survive
    let start = `set -a; . ${MacService.quote(EnvFile.pathOf(this.dir))}; set +a; ` +
            `exec ${MacService.quote(path.join(this.dir, "runtime", "bin", "node"))} cloudServer.js`;
    let plist = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>Label</key>",
      `  <string>${MacService.id}</string>`,
      "  <key>ProgramArguments</key>",
      "  <array>",
      "    <string>/bin/sh</string>",
      "    <string>-c</string>",
      `    <string>${MacService.escape(start)}</string>`,
      "  </array>",
      "  <key>WorkingDirectory</key>",
      `  <string>${MacService.escape(path.join(this.dir, "public_html"))}</string>`,
      "  <key>UserName</key>",
      `  <string>${MacService.escape(user || "root")}</string>`,
      "  <key>RunAtLoad</key>",
      "  <true/>",
      "  <key>KeepAlive</key>",
      "  <true/>",
      "  <key>StandardOutPath</key>",
      `  <string>${MacService.escape(path.join(this.dir, "logs", "connector.log"))}</string>`,
      "  <key>StandardErrorPath</key>",
      `  <string>${MacService.escape(path.join(this.dir, "logs", "connector.log"))}</string>`,
      "</dict>",
      "</plist>",
      ""];
    fs.mkdirSync(path.join(this.dir, "logs"), {recursive: true});
    if (user)
      giveTo(path.join(this.dir, "logs"), user);
    fs.writeFileSync(this.plistFile, plist.join("\n"));
    //
    // launchd checks these and refuses the plist otherwise, with a message that does not say so
    fs.chmodSync(this.plistFile, 0o644);
    fs.chownSync(this.plistFile, 0, 0);
    let answer = this.launchctl(["load", "-w", this.plistFile]);
    if (answer.status !== 0)
      throw new Error(`launchctl could not load the service: ${answer.stderr.trim()}`);
  }


  /**
   * Removes the plist, and the key with it.
   */
  uninstall()
  {
    this.launchctl(["unload", "-w", this.plistFile]);
    fs.rmSync(this.plistFile, {force: true});
    fs.rmSync(EnvFile.pathOf(this.dir), {force: true});
  }


  /**
   * Starts the connector.
   */
  start()
  {
    let answer = this.launchctl(["start", MacService.id]);
    if (answer.status !== 0)
      throw new Error(`launchctl could not start the service: ${answer.stderr.trim()}. ` +
              `See why in ${path.join(this.dir, "logs", "connector.log")}`);
  }


  /**
   * Stops the connector, if it is running. KeepAlive would bring it straight back, so stopping
   * for an update means unloading: `start` after an `install` loads it again.
   */
  stop()
  {
    if (fs.existsSync(this.plistFile))
      this.launchctl(["unload", this.plistFile]);
  }


  /**
   * Wraps a path so that the shell reads it as one word, whatever is in it.
   *
   * Inside single quotes the shell takes everything literally, so the only character that needs
   * handling is the single quote itself: it is closed, escaped on its own, and reopened.
   *
   * @param {String} text - Path to quote
   * @returns {String} The path, quoted for sh
   */
  static quote(text)
  {
    return `'${text.replace(/'/g, "'\\''")}'`;
  }


  /**
   * Makes a string safe to put inside a plist element.
   * @param {String} text - Text to escape
   * @returns {String} Escaped text
   */
  static escape(text)
  {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}


module.exports = MacService;
