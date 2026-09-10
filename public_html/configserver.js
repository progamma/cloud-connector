/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const http = require("http");
const path = require("path");
const fs = require("fs").promises;

const Utils = require("./utils");
const dbDrivers = require("./db/drivers");


/**
 * @class ConfigServer
 * @classdesc
 * HTTP server that serves the local configuration page of the Cloud Connector.
 * It listens on the loopback interface only, so that the page needs no authentication:
 * whoever can reach it is already on the machine the connector runs on.
 *
 * Key features:
 * - **Loopback only**: the socket is bound to 127.0.0.1, and both the peer address and the
 *   Host header are checked again on every request
 * - **Driver aware forms**: each database driver describes its own options, so the page offers
 *   only the ones that driver understands
 * - **Secrets stay put**: every value a driver declares as a password is replaced by a placeholder
 *   on the way out, and the stored value is put back on the way in
 * - **Hot reload**: saving goes through CloudServer.loadConfig, the same path remote configuration uses
 * - **Translatable**: a language is a file under configpage/lang, and nothing else has to know it exists
 *
 * The port the page listens on is read once at startup: changing it takes effect at the next
 * restart, so that a save can never pull the socket out from under the request making it.
 *
 * @property {CloudServer} parent - Parent CloudServer instance
 * @property {Object} server - Node HTTP server, present only while listening
 * @property {Number} requestedPort - Port the configuration asked for, which is the one a save is
 *                                    weighed against: what answered may be a step further along
 * @property {Number} port - Port the page ended up listening on
 * @property {String} configFile - Full path of config.json
 * @property {String} root - Directory the page assets are served from
 * @property {String} langDir - Directory the translations are read from
 */
class ConfigServer
{
  /**
   * Settings used when config.json says nothing about the local configuration page
   * @type {Object}
   */
  static defaults = {
    enabled: true,
    port: 8099
  };

  /**
   * How many ports to try, starting from the one asked for, before giving up. A page nobody can
   * reach is also a page from which the port cannot be changed, so being turned away by whoever
   * holds that one port is not a good enough reason to be absent: it steps along instead, but
   * within a range short enough to be worth looking through.
   * @type {Number}
   */
  static portsToTry = 10;

  /**
   * Value sent to the page in place of every secret, and understood on the way back as
   * "keep the one already stored"
   * @type {String}
   */
  static secretPlaceholder = "********";

  /**
   * Names that mark a value as secret where nothing declares what the values are, which is the
   * case of the settings block of a plugin: every plugin writes its own. It errs towards masking,
   * because a name it does not recognise would be a password sent to the browser in clear.
   * @type {RegExp}
   */
  static secretKeyPattern = /password|passwd|pwd|secret|token|credential/i;

  /**
   * Host names the page may be addressed with. Anything else is a name that merely resolves
   * to the loopback address, which is how a remote page would try to reach this one.
   * @type {Array<String>}
   */
  static allowedHosts = ["localhost", "127.0.0.1", "[::1]"];

  /**
   * Peer addresses the loopback interface produces
   * @type {Array<String>}
   */
  static loopbackAddresses = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

  /**
   * Largest request body accepted, in bytes
   * @type {Number}
   */
  static maxBodySize = 1024 * 1024;

  /**
   * Language the page falls back to. Its texts are the ones written in the page and in the driver
   * schemas, so it needs no translation of its own to be complete.
   * @type {String}
   */
  static fallbackLanguage = "en";

  /**
   * Content types of the assets the page is made of. An extension missing from here is not served.
   * @enum {String}
   */
  static contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };


  constructor(parent)
  {
    this.parent = parent;
    this.configFile = path.join(__dirname, "config.json");
    this.root = path.join(__dirname, "configpage");
    this.langDir = path.join(this.root, "lang");
  }


  /**
   * Logs a message through the parent Cloud Connector.
   * @param {String} level - Log level (ERROR, WARNING, INFO, DEBUG)
   * @param {String} message - Message to log
   */
  log(level, message)
  {
    this.parent.log(level, message);
  }


  /**
   * Reads the settings of the local configuration page from config.json.
   * They are read straight from the file rather than from the loaded configuration, so that the
   * page comes up on a fresh install where config.json does not exist yet or cannot be loaded.
   * @returns {Promise<Object>} Settings with enabled and port always filled in
   */
  async readSettings()
  {
    let settings = Object.assign({}, ConfigServer.defaults);
    try {
      let config = JSON.parse(await fs.readFile(this.configFile, "utf8"));
      Object.assign(settings, config.localConfiguration);
    }
    catch (e) {
      if (e.code !== "ENOENT")
        this.log("WARNING", `The local configuration page falls back to its defaults: ${e.message}`);
    }
    //
    Utils.replaceEnvVariables(settings);
    settings.port = Number(settings.port) || ConfigServer.defaults.port;
    return settings;
  }


  /**
   * Starts listening on the loopback interface, unless the configuration turns the page off.
   * A port that cannot be bound is reported and nothing else: the connector must keep working
   * without its configuration page.
   */
  async start()
  {
    let settings = await this.readSettings();
    this.requestedPort = settings.port;
    //
    if (!settings.enabled)
      return this.log("INFO", "The local configuration page is disabled");
    //
    for (let port = this.requestedPort; port < this.requestedPort + ConfigServer.portsToTry; port++) {
      let server = http.createServer((req, res) => this.onRequest(req, res));
      //
      try {
        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen(port, "127.0.0.1", resolve);
        });
      }
      catch (e) {
        // A bind that failed leaves nothing to close. Somebody else holding the port is the one
        // case worth stepping over; anything else is about this machine, and trying again a port
        // along would only hide it.
        if (e.code === "EADDRINUSE")
          continue;
        //
        return this.log("ERROR", `The local configuration page cannot listen on port ${port}: ${e.message}`);
      }
      //
      server.removeAllListeners("error");
      server.on("error", e => this.log("ERROR", `Local configuration page: ${e.message}`));
      this.server = server;
      this.port = port;
      //
      if (port !== this.requestedPort)
        this.log("WARNING", `Port ${this.requestedPort} was taken, so the local configuration page took ${port} instead`);
      //
      return this.log("INFO", `Local configuration page available at http://127.0.0.1:${port}`);
    }
    //
    this.log("ERROR", "The local configuration page found no free port between " +
            `${this.requestedPort} and ${this.requestedPort + ConfigServer.portsToTry - 1}`);
  }


  /**
   * Stops listening and drops every open connection.
   */
  async stop()
  {
    if (!this.server)
      return;
    //
    let server = this.server;
    delete this.server;
    //
    // Idle keep-alive sockets would hold the port open long after close() was asked for
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    this.log("INFO", "The local configuration page has stopped");
  }


  /**
   * Entry point of every request. Turns a failure into a response instead of an unhandled rejection.
   * @param {Object} req - Incoming request
   * @param {Object} res - Response being built
   */
  onRequest(req, res)
  {
    this.handleRequest(req, res).catch(e => {
      this.log("ERROR", `Local configuration page, ${req.method} ${req.url}: ${e.message}`);
      this.sendJson(res, 500, {error: e.message});
    });
  }


  /**
   * Checks that the request comes from this machine and is addressed to this machine.
   * The bound address already keeps remote peers out; this catches a proxy put in front of the
   * page, and a remote page trying to reach it through a name that resolves to the loopback address.
   * @param {Object} req - Incoming request
   * @returns {Boolean} True when the request may be served
   */
  isLocal(req)
  {
    if (!ConfigServer.loopbackAddresses.includes(req.socket.remoteAddress))
      return false;
    //
    let host = (req.headers.host || "").replace(/:\d+$/, "");
    return ConfigServer.allowedHosts.includes(host);
  }


  /**
   * Checks that a request that changes something was not sent by another origin.
   * A request with no Origin at all comes from a local tool rather than from a browser, and the
   * peer address has already shown it to be local.
   * @param {Object} req - Incoming request
   * @returns {Boolean} True when the origin is this page itself, or absent
   */
  isSameOrigin(req)
  {
    let origin = req.headers.origin;
    if (!origin)
      return true;
    //
    try {
      return ConfigServer.allowedHosts.includes(new URL(origin).hostname);
    }
    catch {
      return false;
    }
  }


  /**
   * Routes a request to the page assets or to one of the API endpoints.
   * @param {Object} req - Incoming request
   * @param {Object} res - Response being built
   */
  async handleRequest(req, res)
  {
    if (!this.isLocal(req))
      return this.sendJson(res, 403, {error: "The configuration page answers on localhost only"});
    //
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    //
    let url = new URL(req.url, `http://127.0.0.1:${this.port}`);
    let route = url.pathname;
    if (!route.startsWith("/api/"))
      return await this.sendAsset(res, route);
    //
    if (req.method === "POST") {
      if (!this.isSameOrigin(req))
        return this.sendJson(res, 403, {error: "Requests from another origin are not allowed"});
      //
      // Insisting on JSON is what makes a browser preflight a cross origin request, and the
      // preflight fails because this server answers with no CORS header at all
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return this.sendJson(res, 415, {error: "The request body must be application/json"});
    }
    //
    switch (`${req.method} ${route}`) {
      case "GET /api/schema":
        return this.sendJson(res, 200, ConfigServer.getSchema());

      case "GET /api/strings":
        return this.sendJson(res, 200,
                await this.getStrings(url.searchParams.get("lang"), req.headers["accept-language"]));

      case "GET /api/config":
        return this.sendJson(res, 200, await this.getConfig());

      case "GET /api/status":
        return this.sendJson(res, 200, this.getStatus());

      case "GET /api/log":
        return this.sendJson(res, 200, this.parent.logger.getHistory(Number(url.searchParams.get("count")) || 200));

      case "GET /api/uid":
        return this.sendJson(res, 200, {uid: Utils.generateUID36()});

      case "GET /api/ideserver":
        return this.sendJson(res, 200, await this.findIdeServer(url.searchParams.get("user")));

      case "GET /api/dirs":
        return this.sendJson(res, 200, await this.listDirectories(url.searchParams.get("path")));

      case "POST /api/config":
        return this.sendJson(res, 200, await this.saveConfig(await this.readBody(req)));

      case "POST /api/test":
        return this.sendJson(res, 200, await this.testDatamodel(await this.readBody(req)));

      default:
        return this.sendJson(res, 404, {error: `Unknown route '${route}'`});
    }
  }


  /**
   * Sends a JSON response, unless the response is already gone.
   * @param {Object} res - Response being built
   * @param {Number} status - HTTP status code
   * @param {Object} body - Value to serialize
   */
  sendJson(res, status, body)
  {
    if (res.writableEnded || res.destroyed)
      return;
    //
    res.writeHead(status, {"Content-Type": "application/json; charset=utf-8"});
    res.end(JSON.stringify(body));
  }


  /**
   * Serves one of the files the page is made of.
   * @param {Object} res - Response being built
   * @param {String} route - Path taken from the request URL
   */
  async sendAsset(res, route)
  {
    let target = path.join(this.root, route === "/" ? "index.html" : route.slice(1));
    //
    // A route made of ".." segments resolves outside the page directory, and nothing out there is served
    let relative = path.relative(this.root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      return this.sendJson(res, 403, {error: "Forbidden"});
    //
    let contentType = ConfigServer.contentTypes[path.extname(target).toLowerCase()];
    let content;
    if (contentType) {
      try {
        content = await fs.readFile(target);
      }
      catch (e) {
        if (e.code !== "ENOENT" && e.code !== "EISDIR")
          throw e;
      }
    }
    //
    if (!content)
      return this.sendJson(res, 404, {error: `Unknown route '${route}'`});
    //
    // frame-ancestors has no fallback on default-src and has to be written: without it a hostile
    // page open in the same browser can hold this one in an invisible frame and take the clicks,
    // and the footer with the save button never moves. It is the one way in that the preflight,
    // which stops everything else from another origin, has nothing to say about.
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    });
    res.end(content);
  }


  /**
   * Reads and parses the JSON body of a request.
   * @param {Object} req - Incoming request
   * @returns {Promise<Object>} Parsed body
   * @throws {Error} If the body is larger than maxBodySize or is not valid JSON
   */
  async readBody(req)
  {
    return await new Promise((resolve, reject) => {
      let chunks = [];
      let size = 0;
      //
      req.on("data", chunk => {
        size += chunk.length;
        if (size > ConfigServer.maxBodySize) {
          req.destroy();
          return reject(new Error("The request body is too large"));
        }
        //
        chunks.push(chunk);
      });
      //
      req.on("error", reject);
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        }
        catch (e) {
          reject(new Error(`The request body is not valid JSON: ${e.message}`));
        }
      });
    });
  }


  /**
   * Collects the option descriptions every driver publishes, so that the page can build a form
   * per driver class instead of knowing the drivers itself.
   * @returns {Object} Schema of every driver, plus the placeholder used for secrets
   */
  static getSchema()
  {
    let drivers = {};
    for (let [name, DriverClass] of Object.entries(dbDrivers)) {
      drivers[name] = {
        connectionOptions: DriverClass.connectionOptionsSchema,
        datamodel: DriverClass.datamodelOptionsSchema
      };
    }
    //
    // The page shows an example path in the shape of the machine the connector runs on
    return {
      drivers,
      platform: process.platform
    };
  }


  /**
   * Replaces with the placeholder every value whose name marks it as secret, at any depth.
   * Used where nothing declares what the values are, so that a plugin's own settings cannot carry
   * a password into the browser.
   * @param {Object} obj - Object to go through, changed in place
   */
  static maskSecretKeys(obj)
  {
    if (!obj || typeof obj !== "object")
      return;
    //
    for (let [key, value] of Object.entries(obj)) {
      if (value && typeof value === "object")
        ConfigServer.maskSecretKeys(value);
      else if (value !== undefined && ConfigServer.secretKeyPattern.test(key))
        obj[key] = ConfigServer.secretPlaceholder;
    }
  }


  /**
   * Puts back the stored value wherever the page sent the placeholder untouched. It looks at the
   * value rather than at the name, because the placeholder coming back is the page saying "keep it".
   * @param {Object} target - Object received from the page, changed in place
   * @param {Object} previous - The same object as read from disk
   * @param {String} where - What to name in the error, when there is nothing to put back
   * @throws {Error} If a value is still masked and there is nothing stored to keep
   */
  static restoreSecretKeys(target, previous, where)
  {
    if (!target || typeof target !== "object")
      return;
    //
    for (let [key, value] of Object.entries(target)) {
      if (value && typeof value === "object") {
        ConfigServer.restoreSecretKeys(value, previous?.[key], where);
        continue;
      }
      //
      if (value !== ConfigServer.secretPlaceholder)
        continue;
      //
      if (previous?.[key] === undefined)
        throw new Error(`${where}: '${key}' is still masked but there is nothing stored to keep, type it again`);
      //
      target[key] = previous[key];
    }
  }


  /**
   * Lists the languages the page can be shown in. A language is a file under configpage/lang named
   * after its code, so adding one is adding a file: no other part of the connector has to know.
   * @returns {Promise<Array<Object>>} Each language with its code and its name written in itself
   */
  async readLanguages()
  {
    let files;
    try {
      files = await fs.readdir(this.langDir);
    }
    catch (e) {
      this.log("WARNING", `The configuration page found no translations: ${e.message}`);
      return [];
    }
    //
    let languages = [];
    for (let file of files.filter(f => path.extname(f) === ".json")) {
      let code = path.basename(file, ".json");
      try {
        let content = JSON.parse(await fs.readFile(path.join(this.langDir, file), "utf8"));
        //
        // The texts come along with the name: the one language that is about to be chosen would
        // otherwise be opened and read through a second time
        languages.push({code, name: content.name || code, strings: content.strings || {}});
      }
      catch (e) {
        this.log("WARNING", `The '${code}' translation of the configuration page cannot be read: ${e.message}`);
      }
    }
    //
    return languages;
  }


  /**
   * Orders the language codes to try, from the one asked for to the ones the browser accepts.
   * The tags of Accept-Language are taken in the order they arrive, which is the order browsers
   * write them in, rather than by their quality value.
   * @param {String} [wanted] - Language code explicitly asked for
   * @param {String} [accepted] - Accept-Language header
   * @returns {Array<String>} Codes to look for, best first, a bare language after each regional one
   */
  static preferredLanguages(wanted, accepted)
  {
    let tags = wanted ? [wanted] : [];
    (accepted || "").split(",").forEach(part => tags.push(part.split(";")[0]));
    //
    let codes = [];
    for (let tag of tags) {
      let code = tag.trim().toLowerCase();
      if (!code || code === "*")
        continue;
      //
      // "it-ch" is served by its own file when there is one, and by "it" when there is not
      codes.push(code);
      if (code.includes("-"))
        codes.push(code.split("-")[0]);
    }
    //
    return codes;
  }


  /**
   * Picks a language and returns what the page has to say in it. The English texts written in the
   * page and in the driver schemas are the keys, so an entry nobody translated yet shows up in
   * English rather than as a key no one can read.
   * @param {String} [wanted] - Language code asked for
   * @param {String} [accepted] - Accept-Language header, used when nothing was asked for
   * @returns {Promise<Object>} The chosen code, its texts, and every language on offer
   */
  async getStrings(wanted, accepted)
  {
    let languages = await this.readLanguages();
    let chosen = ConfigServer.preferredLanguages(wanted, accepted)
            .map(code => languages.find(language => language.code === code))
            .find(Boolean);
    //
    // Only the code and the name of each are of any use to the page: it asks again when it changes
    return {
      code: chosen ? chosen.code : ConfigServer.fallbackLanguage,
      strings: chosen ? chosen.strings : {},
      languages: languages.map(language => ({code: language.code, name: language.name}))
    };
  }


  /**
   * Reads the value at a dotted path inside an object.
   * @param {Object} obj - Object to read from
   * @param {String} fieldPath - Path such as "pool.max"
   * @returns {*} The value, or undefined when any step of the path is missing
   */
  static getPath(obj, fieldPath)
  {
    return fieldPath.split(".").reduce((o, k) => o?.[k], obj);
  }


  /**
   * Writes a value at a dotted path inside an object, creating the intermediate objects.
   * @param {Object} obj - Object to write into
   * @param {String} fieldPath - Path such as "pool.max"
   * @param {*} value - Value to write
   */
  static setPath(obj, fieldPath, value)
  {
    let keys = fieldPath.split(".");
    let last = keys.pop();
    keys.reduce((o, k) => o[k] ??= {}, obj)[last] = value;
  }


  /**
   * Names of the connectionOptions entries a driver class declares as secret.
   * @param {String} className - Database driver class, as written in config.json
   * @returns {Array<String>} Paths of the secret entries, empty for an unknown class
   */
  static secretFields(className)
  {
    let DriverClass = dbDrivers[className];
    if (!DriverClass)
      return [];
    //
    return DriverClass.connectionOptionsSchema.filter(f => f.type === "password").map(f => f.name);
  }


  /**
   * Reads config.json as it is written on disk, with the passwords still encrypted and the
   * environment variable references still in place.
   * @returns {Promise<Object>} Stored configuration, or an empty one when the file does not exist
   */
  async readConfigFile()
  {
    try {
      return JSON.parse(await fs.readFile(this.configFile, "utf8"));
    }
    catch (e) {
      if (e.code !== "ENOENT")
        throw e;
      //
      return {
        name: "",
        passwordPrivateKey: "%CC_KEY%",
        remoteServers: [],
        remoteUserNames: [],
        remoteConfigurationKey: "",
        connectionOptions: {},
        datamodels: [],
        fileSystems: [],
        plugins: []
      };
    }
  }


  /**
   * Builds the configuration the page works on: what is on disk, with every secret replaced by
   * the placeholder. A password never leaves this process, encrypted or not.
   * @returns {Promise<Object>} Configuration with the secrets masked
   */
  async getConfig()
  {
    let config = await this.readConfigFile();
    //
    // A private key written out is a secret; a reference to an environment variable is not
    if (config.passwordPrivateKey && !/^%\w+%$/.test(config.passwordPrivateKey))
      config.passwordPrivateKey = ConfigServer.secretPlaceholder;
    //
    config.datamodels?.forEach(dm => {
      for (let field of ConfigServer.secretFields(dm.class)) {
        if (ConfigServer.getPath(dm.connectionOptions, field) !== undefined)
          ConfigServer.setPath(dm.connectionOptions, field, ConfigServer.secretPlaceholder);
      }
      //
      // The iv belongs to the stored ciphertext and means nothing to the page
      delete dm.iv;
    });
    //
    // A plugin carries the settings it invented, so there is no schema to go by
    config.plugins?.forEach(plugin => ConfigServer.maskSecretKeys(plugin.config));
    //
    return config;
  }


  /**
   * Puts the stored secrets back into a configuration coming from the page, wherever the page
   * sent the placeholder back untouched.
   * @param {Object} config - Configuration received from the page, changed in place
   * @param {Object} stored - Configuration as read from disk
   * @param {Object} originalNames - Arrays datamodels and plugins holding the name each of them had
   *                                 on disk, by position, so that one renamed in the page still
   *                                 finds its secrets
   * @throws {Error} If a secret is still masked and there is nothing stored to put back
   */
  restoreSecrets(config, stored, originalNames)
  {
    if (config.passwordPrivateKey === ConfigServer.secretPlaceholder)
      config.passwordPrivateKey = stored.passwordPrivateKey;
    //
    // A stored password is ciphertext under the key that was in force when it was written. Under a
    // new key it cannot be read, and what loadConfig would then write back is that same ciphertext
    // encrypted a second time, under a fresh iv that replaces the only one that could undo the
    // first: the password would be gone for good, the old key included.
    let keyChanged = config.passwordPrivateKey !== stored.passwordPrivateKey;
    //
    config.plugins?.forEach((plugin, i) => {
      let previous = stored.plugins?.find(p => p.name === (originalNames.plugins?.[i] || plugin.name));
      ConfigServer.restoreSecretKeys(plugin.config, previous?.config, `Plugin '${plugin.name}'`);
    });
    //
    config.datamodels?.forEach((dm, i) => {
      let previous = stored.datamodels?.find(d => d.name === (originalNames.datamodels?.[i] || dm.name));
      //
      // The iv pairs with the stored ciphertext of connectionOptions.password, the only value
      // Utils.processPasswords encrypts: it stays with a kept password and goes with a retyped one
      let passwordKept = dm.connectionOptions?.password === ConfigServer.secretPlaceholder;
      //
      for (let field of ConfigServer.secretFields(dm.class)) {
        if (ConfigServer.getPath(dm.connectionOptions, field) !== ConfigServer.secretPlaceholder)
          continue;
        //
        let value = ConfigServer.getPath(previous?.connectionOptions, field);
        if (value === undefined)
          throw new Error(`Datamodel '${dm.name}': '${field}' is still masked but there is nothing stored to keep, type it again`);
        //
        if (keyChanged && field === "password") {
          throw new Error(`Datamodel '${dm.name}': the password key has changed, so the stored password ` +
                  "can no longer be read. Type it again in this same save.");
        }
        //
        ConfigServer.setPath(dm.connectionOptions, field, value);
      }
      //
      if (passwordKept && previous?.iv)
        dm.iv = previous.iv;
      else
        delete dm.iv;
    });
  }


  /**
   * Applies a configuration coming from the page. It goes through CloudServer.loadConfig, which
   * is the same path remote configuration takes, so the connector reloads without restarting and
   * config.json is rewritten with the passwords encrypted.
   * @param {Object} body - Request body with config and originalNames
   * @returns {Promise<Object>} What the page has to know about what happened
   * @throws {Error} If the body carries no configuration
   */
  async saveConfig(body)
  {
    let config = body?.config;
    if (!config || typeof config !== "object")
      throw new Error("The request carries no configuration");
    //
    let stored = await this.readConfigFile();
    this.restoreSecrets(config, stored, body.originalNames || {});
    //
    await this.parent.loadConfig(config);
    //
    // Both the port and whether the page is served at all are read at startup, so what is asked
    // for here is only a promise until then. Being switched off has to be said as much as being
    // moved: otherwise the page answers "saved and reloaded" and then goes on answering.
    // Against the port that was asked for, not the one that answered: a page that had to step
    // along would otherwise call every save a change
    let wanted = Object.assign({}, ConfigServer.defaults, config.localConfiguration);
    let restartNeeded = Number(wanted.port) !== this.requestedPort || Boolean(wanted.enabled) !== Boolean(this.server);
    //
    // loadConfig has just weighed the key on the resolved configuration, and a save is where a
    // password is actually written: the answer carries what it found, so that the page can say it
    return {
      saved: true,
      restartNeeded,
      passwordKeyError: this.parent.passwordKeyError
    };
  }


  /**
   * The places a walk through the file system starts from: the drives on Windows, the root
   * elsewhere. A drive letter with nothing behind it is simply left out.
   * @returns {Promise<Array<Object>>} Each starting point with its name and its path
   */
  static async rootDirectories()
  {
    if (process.platform !== "win32")
      return [{name: "/", path: "/"}];
    //
    let drives = [];
    for (let i = 0; i < 26; i++) {
      let letter = `${String.fromCharCode(65 + i)}:\\`;
      try {
        await fs.access(letter);
        drives.push({name: letter, path: letter});
      }
      catch {
        // Not a drive on this machine
      }
    }
    //
    return drives;
  }


  /**
   * Lists the directories inside a path, so that a shared folder can be picked instead of typed.
   * It walks the machine the connector runs on, which is the machine whoever is reading this page
   * is already sitting at, and it never says what is inside a file.
   * @param {String} [target] - Directory to look inside; without it, the starting points
   * @returns {Promise<Object>} Where it looked, what lies above it, and the directories it found
   */
  async listDirectories(target)
  {
    if (!target)
      return {
        ok: true,
        path: "",
        parent: "",
        entries: await ConfigServer.rootDirectories()
      };
    //
    let here = path.resolve(target);
    //
    // At the top of a drive, or at the root, dirname answers with the path it was given: from there
    // the way up is the list of starting points
    let above = path.dirname(here);
    let parent = above === here ? "" : above;
    //
    try {
      let found = await fs.readdir(here, {withFileTypes: true});
      let entries = found.filter(e => e.isDirectory()).map(e => ({name: e.name, path: path.join(here, e.name)}));
      entries.sort((a, b) => a.name.localeCompare(b.name));
      return {
        ok: true,
        path: here,
        parent,
        entries
      };
    }
    catch (e) {
      return {
        ok: false,
        path: here,
        parent,
        entries: [],
        error: e.message
      };
    }
  }


  /**
   * Asks the Instant Developer Cloud console which server hosts a user, so that an IDE user given
   * by name alone can be checked before it is saved. It is the same question the connector asks
   * itself when it connects, so an answer here means the entry will work.
   * @param {String} user - Username, possibly as organization/username
   * @returns {Promise<Object>} The address found, or what went wrong looking for it
   * @throws {Error} If no user was asked about
   */
  async findIdeServer(user)
  {
    if (!user)
      throw new Error("The request names no user");
    //
    try {
      let url = await Utils.serverForUser(user);
      return url ? {ok: true, url} : {ok: false, error: `The console does not know '${user}'`};
    }
    catch (e) {
      return {
        ok: false,
        error: e.message || String(e)
      };
    }
  }


  /**
   * Describes what the connector is doing right now: which remote servers are connected, and
   * which resources are loaded.
   * @returns {Object} Current state of the connector
   */
  getStatus()
  {
    return {
      id: this.parent.id,
      name: this.parent.name,
      version: require("./package.json").version,
      nodeVersion: process.version,
      hostname: require("os").hostname(),
      platform: `${process.platform} ${process.arch}`,
      uptime: Math.floor(process.uptime()),
      servers: this.parent.servers.map(s => {
        return {
          url: s.serverUrl,
          ideUserName: s.ideUserName,
          connected: s.connected
        };
      }),
      datamodels: this.parent.datamodels.map(d => {
        return {
          name: d.name,
          class: d.class,
          driver: d.getDriverInfo(),
          poolOpen: Boolean(d.pool),
          connections: Object.keys(d.connections).length
        };
      }),
      fileSystems: this.parent.fileSystems.map(f => {
        return {
          name: f.name,
          path: f.path,
          permissions: f.permissions
        };
      }),
      plugins: this.parent.plugins.map(p => {
        return {
          name: p.name,
          class: p.class
        };
      })
    };
  }


  /**
   * Opens a connection with the options the page is showing, and closes it again, so that a
   * datamodel can be tried before it is saved. The datamodel it builds never joins the loaded
   * ones, and the pool it opens is closed on the way out.
   * @param {Object} body - Request body with datamodel and, when it was renamed, originalName
   * @returns {Promise<Object>} Outcome of the attempt, with the driver's own message when it failed
   * @throws {Error} If the body carries no datamodel, or names a driver class that does not exist
   */
  async testDatamodel(body)
  {
    let datamodel = body?.datamodel;
    if (!datamodel)
      throw new Error("The request carries no datamodel");
    //
    let DriverClass = dbDrivers[datamodel.class];
    if (!DriverClass)
      throw new Error(`Unknown driver class '${datamodel.class}'`);
    //
    // Prepared exactly as loadConfig would prepare it: same secrets, same environment variables,
    // same decryption, but on a copy, because the driver constructors change what they are given
    let stored = await this.readConfigFile();
    let probe = {
      passwordPrivateKey: stored.passwordPrivateKey,
      datamodels: [JSON.parse(JSON.stringify(datamodel))]
    };
    this.restoreSecrets(probe, stored, {datamodels: [body.originalName]});
    Utils.replaceEnvVariables(probe);
    //
    // The rule loadConfig follows: a key that cannot be used leaves the password as the file has it,
    // and the attempt is made with what the connector itself would hand the driver
    let usableKey = !probe.passwordPrivateKey || Utils.isValidKey(probe.passwordPrivateKey);
    if (usableKey)
      Utils.processPasswords(probe, probe.passwordPrivateKey, false, this.parent);
    //
    let startTime = new Date();
    let driver = new DriverClass(this.parent, probe.datamodels[0]);
    try {
      let info = await driver.testConnection();
      return {
        ok: true,
        driver: info,
        elapsed: (new Date()).getTime() - startTime.getTime()
      };
    }
    catch (e) {
      // Said only when the key really is what the driver stumbled on: after restoreSecrets an iv is
      // there when the password handed over is the stored ciphertext, which no key could open.
      // Without it the password arrived whole, and an address or a database name was the problem
      let blamesTheKey = !usableKey && probe.datamodels[0].iv;
      let error = blamesTheKey ? `${e.message}. ${Utils.invalidKeyMessage(probe.passwordPrivateKey)}` : e.message;
      return {
        ok: false,
        error,
        elapsed: (new Date()).getTime() - startTime.getTime()
      };
    }
  }
}


// Export module for node
module.exports = ConfigServer;
