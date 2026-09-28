/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");


/**
 * @class WindowsService
 * @classdesc
 * Registers the connector as a Windows service.
 *
 * A Windows service is not simply a program that runs at boot: it has to answer the Service
 * Control Manager within seconds of starting, and go on answering it, or the SCM kills it as
 * hung. Node cannot do that, so `sc.exe create ... node.exe cloudServer.js` produces a service
 * that fails to start every time. What stands in between is a wrapper: a small program that is
 * a proper service to the SCM and a parent process to the connector.
 *
 * The wrapper here is winsw, which is what `node-windows` uses underneath and what the payload
 * carries beside the runtime. It is driven by an XML file that must be named after it, and the
 * key goes in that XML, which is why the file is left readable by administrators alone.
 *
 * @property {String} dir - Installation directory
 */
class WindowsService
{
  static id = "cloudconnector";
  static wrapperName = "cloudconnector.exe";
  // Where the build puts the wrapper inside the payload, which is where it is looked for before
  // anything has been unpacked. Forward slashes: it is a tar entry, not a Windows path
  static wrapperInPayload = "service/cloudconnector.exe";


  /**
   * @param {String} dir - Installation directory
   */
  constructor(dir)
  {
    this.dir = dir;
  }


  /**
   * Full path of the wrapper, which the payload puts beside the runtime.
   * @returns {String} Full path
   */
  get wrapper()
  {
    return path.join(this.dir, "service", WindowsService.wrapperName);
  }


  /**
   * Full path of the XML, which winsw insists on finding next to itself under its own name.
   * @returns {String} Full path
   */
  get configFile()
  {
    return this.wrapper.replace(/\.exe$/i, ".xml");
  }


  /**
   * Full path of the file the password key is kept in, which here is the wrapper's XML.
   * @returns {String} Full path
   */
  get keyFile()
  {
    return this.configFile;
  }


  /**
   * Says whether this machine can have the service registered, before anything has been moved.
   * Finding out at the service step is finding out after the old installation has been taken
   * apart, and although that is put back, an update that rolls back is an update that failed.
   *
   * The payload is asked and not the disk. The wrapper arrives with the payload, so on a fresh
   * install there is nothing in the installation directory yet to look for it in.
   *
   * @param {Payload} payload - What this installer carries
   */
  checkReady(payload)
  {
    if (!payload.contains(WindowsService.wrapperInPayload))
      throw new Error("This installer cannot register the Windows service: it was built without " +
              "the service wrapper.\n" +
              "Windows will not run a Node program as a service on its own, so there is nothing " +
              "to fall back on. Use an installer built with the wrapper.");
  }


  /**
   * Runs the wrapper with a command, and says what it answered.
   * @param {String} command - Command for the wrapper
   * @returns {Object} Answer, as spawnSync returns it
   */
  winsw(command)
  {
    if (!fs.existsSync(this.wrapper))
      throw new Error(`The service wrapper is missing from ${this.wrapper}. The payload was built without it.`);
    let answer = spawnSync(this.wrapper, [command], {encoding: "utf8"});
    if (answer.error)
      throw new Error(`Could not run the service wrapper: ${answer.error.message}`);
    return answer;
  }


  /**
   * Where the registered service was installed from, which is not a thing to be assumed: the
   * Service Control Manager knows of one service by this name for the whole machine, and it may
   * well have been installed somewhere other than where this installer is pointed.
   * @returns {String} The installation directory it belongs to, or nothing when there is no service
   */
  registeredIn()
  {
    let answer = spawnSync("sc.exe", ["qc", WindowsService.id], {encoding: "utf8"});
    if (answer.error || answer.status !== 0)
      return;
    return WindowsService.readPath(answer.stdout);
  }


  /**
   * Picks the installation directory out of what `sc qc` printed.
   *
   * It matches on the path and not on the label before it, because that label is translated:
   * on an Italian Windows it reads NOME_PERCORSO_BINARIO. The quotes around the path are
   * optional, sc leaves them off when there is no space to protect.
   *
   * @param {String} answer - What sc qc wrote out
   * @returns {String} The installation directory, or nothing when there is no path in there
   */
  static readPath(answer)
  {
    let found = answer.match(/([a-z]:[\\/][^\r\n"]*?cloudconnector\.exe)/i);
    // <dir>\service\cloudconnector.exe, so the installation is two levels up
    return found ? path.dirname(path.dirname(found[1])) : undefined;
  }


  /**
  /**
   * Reads every variable the registered service carries.
   *
   * Not only the key, because this XML is the one place on Windows where an operator can put the
   * variables the connector reads and the installer knows nothing about - ORACLE_INSTANT_CLIENT_DIR
   * for Oracle's Thick mode above all. The XML is rewritten whole on every update, so whatever is
   * in it has to be read back first or it is gone, silently.
   *
   * @returns {Object} Variables by name
   */
  readEnv()
  {
    if (!fs.existsSync(this.configFile))
      return {};
    let variables = {};
    // Both kinds of quote, because XML allows both and this file is also written by hand: somebody
    // who follows the README and adds an <env> with apostrophes would otherwise have it read as
    // absent and dropped at the next update, which is the very thing this reads the file for
    let entries = fs.readFileSync(this.configFile, "utf8")
            .matchAll(/<env\s+name=("[^"]*"|'[^']*')\s+value=("[^"]*"|'[^']*')/g);
    for (let [, name, value] of entries)
      variables[WindowsService.unescape(name.slice(1, -1))] = WindowsService.unescape(value.slice(1, -1));
    return variables;
  }


  /**
   * Writes the wrapper's XML and registers the service, set to start with the machine.
   * @param {Object} env - Variables the service runs with, the password key among them
   * @param {String} [user] - User the connector runs as, which this platform cannot honour
   */
  install(env, user)
  {
    // winsw can run a service as a named account, but only if it is given that account's password
    // as well, and an installer that asks for a Windows password is an installer nobody should
    // trust. LocalSystem it is, which is what a machine wide service normally runs as anyway
    if (user)
      throw new Error("--user is not supported on Windows: the service runs as LocalSystem. " +
              "To run it as somebody else, change the account in services.msc after installing.");
    let config = ["<service>",
      `  <id>${WindowsService.id}</id>`,
      "  <name>Instant Developer Cloud Connector</name>",
      "  <description>Connects local databases and file systems to Instant Developer Cloud applications.</description>",
      `  <executable>${WindowsService.escape(path.join(this.dir, "runtime", "node.exe"))}</executable>`,
      "  <arguments>cloudServer.js</arguments>",
      `  <workingdirectory>${WindowsService.escape(path.join(this.dir, "public_html"))}</workingdirectory>`,
      ...Object.entries(env)
              .map(([name, value]) => `  <env name="${WindowsService.escape(name)}" ` +
                      `value="${WindowsService.escape(value)}"/>`),
      "  <startmode>Automatic</startmode>",
      "  <onfailure action=\"restart\" delay=\"5 sec\"/>",
      `  <logpath>${WindowsService.escape(path.join(this.dir, "logs"))}</logpath>`,
      "  <log mode=\"roll-by-size\">",
      "    <sizeThreshold>10240</sizeThreshold>",
      "    <keepFiles>4</keepFiles>",
      "  </log>",
      "</service>",
      ""];
    fs.mkdirSync(path.join(this.dir, "logs"), {recursive: true});
    // Empty first, then locked down, then filled in. Written and protected afterwards, there is a
    // moment - short, but a moment - in which the key is on a disk under Program Files, where
    // every user of the machine has read access
    fs.writeFileSync(this.configFile, "");
    this.protect(this.configFile);
    fs.writeFileSync(this.configFile, config.join("\n"));
    let answer = this.winsw("install");
    if (answer.status !== 0)
      throw new Error(`The service could not be registered: ${(answer.stderr || answer.stdout).trim()}`);
  }


  /**
   * Removes the service, and the key with it.
   */
  uninstall()
  {
    // Not guarded by whether the wrapper is there. Skipping the work when it is missing, and
    // leaving the caller to report an uninstall that never happened, is worse than saying so
    this.winsw("uninstall");
    try {
      fs.rmSync(this.configFile, {force: true});
    }
    catch {
      // The service is already gone by now, which is what was asked for. The file left behind is
      // the one this installer took off everyone's permissions but its own, and a file that will
      // not delete must not turn a finished uninstall into a failed one
    }
  }


  /**
   * Starts the connector.
   */
  start()
  {
    let answer = this.winsw("start");
    if (answer.status !== 0)
      throw new Error(`The service could not be started: ${(answer.stderr || answer.stdout).trim()}. ` +
              `See why in ${path.join(this.dir, "logs")}`);
  }


  /**
   * Stops the connector, if it is running. An update calls this before touching the files,
   * because Windows will not let a running executable be replaced.
   */
  stop()
  {
    if (this.registeredIn() && fs.existsSync(this.wrapper))
      this.winsw("stop");
  }


  /**
   * Takes a file off the list of things everyone can read. The key is in this one, and
   * "Program Files" is readable by every user of the machine.
   * @param {String} target - File to protect
   */
  protect(target)
  {
    // /inheritance:r first, or the inherited "Users: read" survives everything granted after it.
    // The two accounts are named by SID because their names are translated: on an Italian Windows
    // "Administrators" is "Amministratori", and icacls would not know what was being asked for
    let steps = [[target, "/inheritance:r"]];
    for (let who of ["*S-1-5-32-544", "*S-1-5-18"])
      steps.push([target, "/grant", `${who}:(F)`]);
    for (let args of steps) {
      let answer = spawnSync("icacls.exe", args, {encoding: "utf8"});
      // Read, and not thrown away. This access list is the whole of what keeps the key away from
      // the other users of the machine, and config.json sits next to it readable by all of them:
      // the key and the ciphertext together are every database password in clear. An installation
      // that cannot set it is not one to finish quietly
      if (answer.error || answer.status !== 0)
        throw new Error(`Could not take ${target} off the reach of other users: ` +
                `${(answer.stderr || answer.stdout || answer.error?.message || "").trim()}\n` +
                "That file holds the key to the stored passwords, so the installation stops here.");
    }
  }


  /**
   * Makes a string safe to put inside an XML attribute or element.
   * @param {String} text - Text to escape
   * @returns {String} Escaped text
   */
  static escape(text)
  {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }


  /**
   * Reads back what escape() wrote. The ampersand goes last, or a value that was written as
   * `&amp;lt;` would come back as `<` instead of the `&lt;` somebody actually typed.
   * @param {String} text - Text to unescape
   * @returns {String} The original text
   */
  static unescape(text)
  {
    return String(text).replace(/&quot;/g, "\"").replace(/&gt;/g, ">")
            .replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  }
}


module.exports = WindowsService;
