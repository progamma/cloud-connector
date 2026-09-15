/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");

const EnvFile = require("./envfile");


/**
 * @class LinuxService
 * @classdesc
 * Registers the connector with systemd, which every supported distribution uses and which needs
 * nothing installed alongside: the unit is a text file and `systemctl` is already there.
 *
 * The key is not in the unit. `EnvironmentFile=` points at a file only its owner can read, so
 * that the unit itself can stay the world readable thing systemd expects units to be.
 *
 * @property {String} dir - Installation directory
 */
class LinuxService
{
  static id = "cloudconnector";
  static unitDir = "/etc/systemd/system";


  /**
   * @param {String} dir - Installation directory
   */
  constructor(dir)
  {
    this.dir = dir;
  }


  /**
   * Full path of the unit file.
   * @returns {String} Full path
   */
  get unitFile()
  {
    return path.join(LinuxService.unitDir, `${LinuxService.id}.service`);
  }


  /**
   * Says whether this machine can have the service registered, before anything has been moved.
   */
  checkReady()
  {
    let answer = spawnSync("systemctl", ["--version"], {encoding: "utf8"});
    if (answer.error || answer.status !== 0)
      throw new Error("systemctl did not answer, so this machine does not run systemd and the " +
              "connector cannot be registered as a service on it.");
  }


  /**
   * Runs systemctl, and says what it answered.
   * @param {String[]} args - Arguments for systemctl
   * @returns {Object} Answer, as spawnSync returns it
   */
  systemctl(args)
  {
    let answer = spawnSync("systemctl", args, {encoding: "utf8"});
    if (answer.error)
      throw new Error(`Could not run systemctl: ${answer.error.message}. This machine may not use systemd.`);
    return answer;
  }


  /**
   * Where the registered service was installed from. The unit lives at one fixed path for the
   * whole machine, so that it is there says nothing about which directory it belongs to.
   * @returns {String} The installation directory it belongs to, or nothing when there is no unit
   */
  registeredIn()
  {
    if (!fs.existsSync(this.unitFile))
      return;
    let found = fs.readFileSync(this.unitFile, "utf8").match(/^WorkingDirectory=(.+)$/m);
    // WorkingDirectory is <dir>/public_html
    return found ? path.dirname(found[1].trim()) : undefined;
  }


  /**
   * Reads the password key of an installation that is already there.
   * @returns {String} The key, or nothing when there is none to read
   */
  readKey()
  {
    return EnvFile.read(this.dir).CC_KEY;
  }


  /**
   * Writes the unit and enables it, so that the connector comes up with the machine.
   * @param {String} key - Password key to put in the environment
   * @param {String} [user] - User the connector runs as, root when not said
   */
  install(key, user)
  {
    EnvFile.write(this.dir, {CC_KEY: key});
    //
    // Restart=always and not on-failure: a connector that stopped for any reason is a connector
    // the cloud cannot reach, and there is nothing an operator would do about it but start it again
    let unit = ["[Unit]",
      "Description=Instant Developer Cloud Connector",
      "Documentation=https://github.com/progamma/cloud-connector",
      "After=network-online.target",
      "Wants=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      `User=${user || "root"}`,
      `WorkingDirectory=${path.join(this.dir, "public_html")}`,
      `ExecStart=${path.join(this.dir, "runtime", "bin", "node")} cloudServer.js`,
      `EnvironmentFile=${EnvFile.pathOf(this.dir)}`,
      "Restart=always",
      "RestartSec=5",
      "StandardOutput=journal",
      "StandardError=journal",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      ""];
    fs.writeFileSync(this.unitFile, unit.join("\n"));
    this.systemctl(["daemon-reload"]);
    let answer = this.systemctl(["enable", LinuxService.id]);
    if (answer.status !== 0)
      throw new Error(`systemctl could not enable the service: ${answer.stderr.trim()}`);
  }


  /**
   * Removes the unit, and the key with it.
   */
  uninstall()
  {
    this.systemctl(["disable", LinuxService.id]);
    fs.rmSync(this.unitFile, {force: true});
    this.systemctl(["daemon-reload"]);
    fs.rmSync(EnvFile.pathOf(this.dir), {force: true});
  }


  /**
   * Starts the connector.
   */
  start()
  {
    let answer = this.systemctl(["start", LinuxService.id]);
    if (answer.status !== 0)
      throw new Error(`systemctl could not start the service: ${answer.stderr.trim()}. ` +
              `See why with: journalctl -u ${LinuxService.id} -n 50`);
  }


  /**
   * Stops the connector, if it is running. An update calls this before touching the files, and
   * a service that was not running is not a reason to stop.
   */
  stop()
  {
    this.systemctl(["stop", LinuxService.id]);
  }
}


module.exports = LinuxService;
