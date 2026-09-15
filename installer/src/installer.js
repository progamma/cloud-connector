/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const fs = require("fs");
const os = require("os");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const {spawnSync} = require("child_process");

const Payload = require("./payload");
const ProgramList = require("./programlist");
const serviceFor = require("./service");
const {giveTo} = require("./posix");


/**
 * @class Installer
 * @classdesc
 * Puts the Cloud Connector on a machine, brings one that is already there up to date, and takes
 * one away.
 *
 * It does the part that comes before the connector's own configuration page and that the page
 * cannot do for itself: the runtime, the code, the password key, and the service registration
 * that makes the connector come up with the machine. Everything the page can do it leaves to the
 * page, which is why installing ends by opening it.
 *
 * An update keeps `config.json` and the environment the service runs with - the password key, and
 * whatever else was set there - and replaces everything else. Replacing rather than writing over
 * matters, because a driver dropped between two versions would otherwise stay on the disk and go
 * on being loadable.
 *
 * Nothing is half done. The old installation is moved aside rather than deleted, and it is put
 * back if any step of the new one fails: an update that goes wrong leaves a connector that works.
 *
 * @property {Object} options - What the command line asked for
 * @property {String} dir - Installation directory
 * @property {Object} service - The service of this platform
 * @property {Payload} payload - The runtime and the connector to lay down
 * @property {String[]} notes - Things worth saying at the end rather than in the middle
 */
class Installer
{
  static defaultPort = 8099;
  // The same number of ports the configuration page steps through when the one it wants is taken.
  // If that ever changes in ConfigServer, the installer would start reporting a page as missing
  // while it is answering one door past where this stops looking
  static portsToTry = 10;
  static keyPlaceholder = "%CC_KEY%";
  static backupName = ".previous";
  static uninstallerNames = {win32: "cc-installer.exe", linux: "cc-installer", darwin: "cc-installer"};
  static pageTimeout = 30000;
  static installDirs = {
    win32: path.join(process.env.ProgramW6432 || process.env.ProgramFiles || "C:\\Program Files", "Cloud Connector"),
    linux: "/opt/cloudconnector",
    darwin: "/usr/local/cloudconnector"
  };


  /**
   * @param {String[]} argv - Command line, without the runtime and the program
   */
  constructor(argv)
  {
    this.options = Installer.parse(argv);
    this.dir = this.options.dir || Installer.installDirs[process.platform];
    this.notes = [];
    // Being double clicked and being run from a prompt with no arguments look the same from in
    // here, and want the same thing: somebody who said nothing about where to install has not
    // chosen Program Files, they just have not been asked yet. Anybody who passed an argument has
    // said what they want, and is asked nothing.
    //
    // Read once, here: answering the questions fills in options, and asking again afterwards
    // would say no
    this.bare = !argv.length && process.stdin.isTTY;
  }


  /**
   * Reads the command line. Anything it does not recognise is an error rather than something to
   * ignore: a misspelled --dir would otherwise install somewhere nobody asked for.
   * @param {String[]} argv - Command line, without the runtime and the program
   * @returns {Object} What was asked for
   */
  static parse(argv)
  {
    let options = {};
    for (let i = 0; i < argv.length; i++) {
      let [name, inlineValue] = argv[i].split(/=(.*)/);
      let value = () => {
        let read = inlineValue !== undefined ? inlineValue : argv[++i];
        if (read === undefined)
          throw new Error(`${name} needs a value`);
        return read;
      };
      switch (name) {
        case "--dir":
          options.dir = path.resolve(value());
          break;

        case "--port":
          options.port = parseInt(value(), 10);
          if (!(options.port > 0 && options.port < 65536))
            throw new Error("--port must be a port number");
          break;

        case "--user":
          options.user = value();
          break;

        case "--uninstall":
          options.uninstall = true;
          break;

        case "--no-browser":
          options.noBrowser = true;
          break;

        case "--help":
        case "-h":
          options.help = true;
          break;

        default:
          throw new Error(`${name} is not something this installer understands. Try --help.`);
      }
    }
    return options;
  }


  /**
   * What the command line accepts, as it is shown to whoever asks.
   * @returns {String} The help text
   */
  static help()
  {
    return ["Installs, updates and removes the Instant Developer Cloud Connector.",
      "",
      "  --dir <path>     where to install, by default " + Installer.installDirs[process.platform],
      "  --port <number>  port of the configuration page, by default " + Installer.defaultPort,
      "                   (on an update, the port already configured is kept unless this is given)",
      process.platform === "win32"
        ? "                   (the service runs as LocalSystem; --user is not available on Windows)"
        : "  --user <name>    user the connector runs as, by default root",
      "  --uninstall      remove the connector and its service, keeping config.json",
      "                   (where it is installed is read from the service, so --dir is not needed)",
      "  --no-browser     do not open the configuration page at the end",
      "  --help           this",
      ""].join("\n");
  }


  /**
   * Says something as it happens. Installing is slow enough that silence reads as a hang.
   * @param {String} message - What to say
   */
  say(message)
  {
    console.log(message);
  }


  /**
   * Does what the command line asked for.
   * @returns {Promise<Number>} Exit code
   */
  async run()
  {
    if (this.options.help) {
      this.say(Installer.help());
      return 0;
    }
    try {
      // Before the questions, not after: being told that this needs administrator rights is worth
      // hearing before being asked where to put something that is not going to be put anywhere
      this.checkPrivileges();
      if (this.bare)
        await this.askWhatToDo();
      this.service = serviceFor(this.dir);
      if (this.options.uninstall) {
        // Where to uninstall from is worked out here and not in there, so that what does the
        // removing is handed the installation it is removing rather than going to look for it
        this.dir = this.whereToUninstall();
        this.service = serviceFor(this.dir);
        this.uninstall();
      }
      else
        await this.install();
      return await this.holdTheWindow(0);
    }
    catch (e) {
      console.error(`\n${e.message}`);
      return await this.holdTheWindow(1);
    }
  }


  /**
   * Asks where to install and which port the configuration page should answer on.
   */
  async askWhatToDo()
  {
    this.say("Instant Developer Cloud Connector\n");
    this.dir = path.resolve(await Installer.ask("Install it in", this.dir));
    let previous = this.readInstalled();
    if (previous) {
      // The port lives in the config.json that is about to be kept, so asking would be offering
      // to change something that was not asked about
      this.say(`\nThere is a Cloud Connector ${previous.version || ""} there already: it will be ` +
              "updated, keeping its configuration.");
      return;
    }
    this.options.port = parseInt(await Installer.ask("Configuration page on port",
            String(Installer.defaultPort)), 10);
    if (!(this.options.port > 0 && this.options.port < 65536))
      throw new Error("That is not a port number.");
    this.say("");
  }


  /**
   * Asks a question, offering an answer for whoever just wants to press Enter.
   * @param {String} question - What to ask
   * @param {String} fallback - What pressing Enter means
   * @returns {Promise<String>} What was answered
   */
  static ask(question, fallback)
  {
    let asker = readline.createInterface({input: process.stdin, output: process.stdout});
    return new Promise(resolve => {
      asker.question(fallback ? `${question} [${fallback}]: ` : `${question}: `, answer => {
        asker.close();
        resolve(answer.trim() || fallback);
      });
    });
  }


  /**
   * Keeps the console open when there is nobody to read it otherwise.
   *
   * A double clicked console program writes into a window that closes the moment it returns. That
   * is no loss when it worked, because the browser is already open on the configuration page, and
   * it is the whole message when it did not.
   *
   * @param {Number} code - Exit code to return
   * @returns {Promise<Number>} The same exit code
   */
  async holdTheWindow(code)
  {
    if (this.bare)
      await Installer.ask("\nPress Enter to close", "");
    return code;
  }


  /**
   * Stops before anything has been touched when this is not going to work. Finding out halfway
   * through is what leaves a machine with neither the old installation nor the new one.
   */
  checkPrivileges()
  {
    if (process.platform === "win32") {
      // There is no direct question to ask. "net session" is refused to anyone not elevated,
      // and asks nothing of the machine beyond the service it always has running
      let answer = spawnSync("net", ["session"], {encoding: "utf8", windowsHide: true});
      if (answer.error || answer.status !== 0)
        throw new Error("This installer must run as administrator: right click it and choose " +
                "\"Run as administrator\", or start it from an elevated prompt.");
      return;
    }
    if (process.getuid() !== 0)
      throw new Error("This installer must run as root: try again with sudo.");
  }


  /**
   * Installs, or updates what is already there.
   */
  async install()
  {
    let tar = Payload.checkTar();
    this.checkNothingWasLeftBehind();
    let previous = this.readInstalled();
    if (previous)
      this.say(`Updating the Cloud Connector${previous.version ? " " + previous.version : ""} in ${this.dir}`);
    else
      this.say(`Installing the Cloud Connector in ${this.dir}`);
    this.payload = Payload.find();
    // The payload is a temporary file the size of the whole connector by now, so everything from
    // here on is inside a try: the two refusals below throw, and a refused installation must not
    // leave 47 MB behind in the temporary directory for having said no
    let env;
    // What has actually been done to this machine, so far. Three separate facts, because the
    // recovery needs all three and no one of them implies another: the service is taken apart
    // before anything moves, and registered again after everything has been laid down, so a
    // failure in between finds a machine that none of these alone describes
    let done = {tookApart: false, laidDown: false, registered: false};
    try {
      // Said before it is done, not after: reading the list costs a few seconds, because a
      // compressed archive has to be uncompressed all the way through to be listed at all
      this.say("  checking what this installer carries");
      this.service.checkReady(this.payload);
      // One machine, one service by that name. Installing into a second directory would register
      // a service over the first and leave its files behind, running nothing and explaining nothing
      let registered = this.service.registeredIn();
      if (registered && !Installer.samePlace(registered, this.dir))
        throw new Error("A Cloud Connector service is already registered on this machine, from " +
                `${registered}, and there can only be one.\nInstall into that directory to update ` +
                "it, or remove it first with --uninstall.");
      this.say(`  unpacking with ${tar}`);
      //
      // Read before anything is taken apart, because on every platform the service definition is
      // where these live, and taking the service apart deletes it. The whole environment and not
      // just the key: whatever an operator added there - ORACLE_INSTANT_CLIENT_DIR for Oracle's
      // Thick mode - has nowhere else to be, and an update that dropped it would say nothing
      env = previous ? this.service.readEnv() : {};
      if (previous && !env.CC_KEY)
        this.notes.push("The previous installation had no key with its service definition, so a new " +
                "one was generated. Any password already stored in config.json can no longer be read " +
                "and has to be typed again on the configuration page.");
      env.CC_KEY = env.CC_KEY || Installer.newKey();
      let carried = Object.keys(env).filter(name => name !== "CC_KEY");
      if (carried.length)
        this.say(`  keeping the variables that were set: ${carried.join(", ")}`);
      this.service.stop();
      if (registered) {
        this.service.uninstall();
        done.tookApart = true;
      }
      // Inside the try, not before it. By this point the service is already unregistered, so a
      // rename that fails - on Windows one open handle under runtime/ is enough - would otherwise
      // leave the machine with no service and a tree moved half aside, and nobody to put it back
      this.moveAside();
      // Before the unpacking, for the same reason the one below is before the registration: tar
      // can stop halfway with half a tree already written, and what the recovery needs to know is
      // that files may be there, not that they all arrived
      done.laidDown = true;
      fs.mkdirSync(this.dir, {recursive: true});
      this.payload.unpack(this.dir);
      this.writeConfig(previous);
      // Before the call and not after it. What the recovery needs to know is not "the service was
      // registered" but "from here on a service definition may exist", and install() writes things
      // that outlive it long before it returns: cc.env with the key in it is its first line, the
      // unit and the plist come before the enable and the load that can fail. Set afterwards, a
      // throw halfway through left the key on the disk and a unit in /etc/systemd/system pointing
      // at a tree the undo had just removed - with Restart=always to keep trying forever.
      //
      // Calling uninstall() when there is nothing to remove is safe on all three: systemctl and
      // launchctl are only checked for having run at all, the removals are forced, and on Windows
      // the wrapper is there because unpacking has already happened
      done.registered = true;
      this.service.install(env, this.options.user);
      this.giveAwayTo(this.options.user);
      this.say("  starting the service");
      this.service.start();
    }
    catch (e) {
      // What the recovery actually managed, and not a sentence that assumes it worked. Somebody
      // reading this is deciding whether the machine still serves its connector
      let trouble = this.putBack(env, done);
      let outcome;
      if (trouble)
        outcome = `The machine could not be put back as it was: ${trouble}.`;
      else if (done.tookApart)
        outcome = "Nothing was changed: the previous installation was put back.";
      else if (done.laidDown || done.registered)
        outcome = "Nothing was installed: what had been laid down was taken away again.";
      else
        // The refusals at the top of the try land here, and being refused is a first class outcome
        // and not a rare one. Telling somebody that what was laid down has been taken away, when
        // the installer stopped before laying anything down, describes an undoing that never was
        outcome = "Nothing was changed.";
      throw new Error(`${e.message}\n\n${outcome}`);
    }
    finally {
      // Getting the payload out of the executable meant writing it to a temporary file
      let complaint = this.payload.cleanUp();
      if (complaint)
        this.notes.push(complaint);
    }
    this.discard();
    this.checkPrerequisites();
    let version = this.readInstalled()?.version;
    this.leaveAWayOut(version);
    //
    this.say(`\nThe Cloud Connector${version ? " " + version : ""} is installed and running as a service.`);
    await this.finish();
  }


  /**
   * Hands the whole installation over to the user the connector will run as.
   *
   * Each platform already gives away the files it writes itself - the environment file, the log
   * directory - but the tree that was unpacked belongs to root, and `config.json` is in it. The
   * configuration page rewrites that file on every save, so without this the connector under
   * --user opens the page, the operator fills it in, and saving fails on a permission error.
   *
   * @param {String} [user] - User the connector runs as, root when not said
   */
  giveAwayTo(user)
  {
    if (!user)
      return;
    this.say(`  giving it to ${user}`);
    giveTo(this.dir, user);
  }


  /**
   * Full path of the copy of this installer that is left in the installation directory.
   * @returns {String} Full path
   */
  get uninstaller()
  {
    return path.join(this.dir, Installer.uninstallerNames[process.platform]);
  }


  /**
   * Leaves behind a copy of this installer, and on Windows an entry in the list of installed
   * programs that points at it.
   *
   * An installer is a file people delete as soon as it has run, and without one on the machine
   * there is no way left to remove what it put there. The copy is also what a later update runs,
   * and what Windows offers under Uninstall.
   *
   * @param {String} version - Version that was installed
   */
  leaveAWayOut(version)
  {
    if (!Payload.isPacked())
      return this.notes.push("This installer is running from its sources rather than as the single " +
              "executable, so no copy was left behind and nothing was added to the list of " +
              "installed programs. A built installer does both.");
    // Running the copy to update in place is a normal thing to do, and copying a file onto itself
    // is not: on Windows it fails outright, because the file is open and running
    if (!Installer.samePlace(process.execPath, this.uninstaller))
      fs.copyFileSync(process.execPath, this.uninstaller);
    let complaint = new ProgramList(this.dir).add(this.uninstaller, version);
    if (complaint)
      this.notes.push(complaint);
  }


  /**
   * Removes the service, takes the connector out of the list of installed programs, and deletes
   * what was installed.
   *
   * What it keeps is `config.json`, moved up into the installation directory where the removal
   * cannot reach it: the remote servers, the IDE users and the datamodels are in it, and an
   * uninstall is often a step in putting the same connector back.
   *
   * **The passwords in it are not among what survives.** They are encrypted with the key, and the
   * key goes with the service definition being removed - which is the point of keeping it there
   * and not beside them. A reinstallation generates a new one, and what the connector then finds
   * it cannot decrypt: `Utils.processPasswords` logs a warning and leaves the ciphertext standing
   * where the password was, so the datamodel tries to connect with that. Saying so is the whole
   * of what can be done about it, and it is said where the decision is taken.
   */
  uninstall()
  {
    this.say(`Removing the Cloud Connector registered from ${this.dir}`);
    this.service.stop();
    this.service.uninstall();
    new ProgramList(this.dir).remove();
    //
    let kept = this.keepTheConfiguration();
    if (kept && this.hasStoredPasswords(kept))
      this.notes.push("The passwords in the configuration that was kept can no longer be read: " +
              "they were encrypted with the key that has just been removed along with the service. " +
              "Everything else in the file is still good, and the passwords have to be typed again " +
              "on the configuration page after reinstalling.");
    this.say("  removing what was installed");
    let stayed = [];
    for (let what of ["runtime", "public_html", "service", "logs", Installer.backupName]) {
      try {
        fs.rmSync(path.join(this.dir, what), {recursive: true, force: true});
      }
      catch (e) {
        // force only forgives a file that is not there. One that is open - a log the wrapper has
        // not quite let go of - throws, and one of those must not stop the other four going
        stayed.push(`${what} (${e.code || e.message})`);
      }
    }
    if (stayed.length)
      this.notes.push(`These could not be removed and are still in ${this.dir}: ${stayed.join(", ")}. ` +
              "Something still has them open: try again in a moment, or delete them by hand.");
    for (let note of this.notes)
      this.say(`\n! ${note}`);
    //
    this.say("\nThe service is gone and the connector is removed.");
    if (kept)
      this.say(`Your configuration was kept, at ${kept}`);
    // Deleting the running program from under itself is not something Windows allows, and the
    // directory cannot go while it is in it. Saying so beats leaving it to be wondered about
    this.say(`${this.dir} still holds this installer${kept ? " and that file" : ""}: ` +
            "delete the folder once there is nothing in it worth keeping.");
  }


  /**
   * Tells whether a configuration has passwords in it that were encrypted with the key.
   *
   * `iv` is what says so: the connector writes one beside every password it has encrypted, and a
   * password with no `iv` is one that was left in clear and that a new key would read just fine.
   *
   * @param {String} configFile - Full path of the configuration to look at
   * @returns {Boolean} True when there is at least one encrypted password in it
   */
  hasStoredPasswords(configFile)
  {
    try {
      let config = JSON.parse(fs.readFileSync(configFile, "utf8"));
      return (config.datamodels || []).some(dm => dm.iv && dm.connectionOptions?.password);
    }
    catch {
      // Unreadable, so nothing can be promised about it either way: better to say too much than
      // to let somebody reinstall believing the passwords will come back
      return true;
    }
  }


  /**
   * Moves config.json out of what is about to be deleted.
   *
   * It looks in the backup directory as well, and not because it expects one to be there: a
   * recovery that could not finish leaves the only copy of the old installation in it, and the
   * removal below takes that directory away with the rest. Where the file is found says nothing
   * about how it got there, and none of this guesses - keeping a file that would otherwise be
   * deleted is safe whatever the answer.
   *
   * @returns {String} Where it was put, or nothing when there was none
   */
  keepTheConfiguration()
  {
    let configFile = [path.join(this.dir, "public_html", "config.json"),
      path.join(this.backup, "public_html", "config.json")].find(where => fs.existsSync(where));
    if (!configFile)
      return;
    let kept = path.join(this.dir, "config.json");
    fs.copyFileSync(configFile, kept);
    return kept;
  }


  /**
   * Works out which installation an uninstall is about.
   *
   * The question goes to the service and not to --dir. There is one service by this name for the
   * whole machine, and it knows which directory it was installed from; --dir does not. Taking
   * --dir for that answer is how an uninstall comes to look in an empty directory, find nothing
   * it can do, and announce that the service is gone while it is still running.
   *
   * @returns {String} The directory to uninstall from
   */
  whereToUninstall()
  {
    let where = this.service.registeredIn();
    if (!where)
      throw new Error("There is no Cloud Connector service on this machine.");
    if (!this.options.dir)
      return where;
    if (!Installer.samePlace(where, this.dir))
      throw new Error(`The Cloud Connector service on this machine was installed from ${where}, ` +
              `not from ${this.dir}.\nRemove that one with --dir "${where}", or leave --dir off ` +
              "and it will be found.");
    return this.dir;
  }


  /**
   * Tells whether two paths are the same place. On Windows they can be spelled differently and
   * still be: sc reports the drive letter in lower case whatever was typed.
   * @param {String} one - A path
   * @param {String} other - Another
   * @returns {Boolean} True when they are the same place
   */
  static samePlace(one, other)
  {
    let plain = where => path.resolve(where).replace(/[\\/]+$/, "");
    return process.platform === "win32"
      ? plain(one).toLowerCase() === plain(other).toLowerCase()
      : plain(one) === plain(other);
  }


  /**
   * Looks at what is installed in the directory, if anything is.
   * @returns {Object} Name and version of the connector that is there, or nothing
   */
  readInstalled()
  {
    let manifest = path.join(this.dir, "public_html", "package.json");
    if (!fs.existsSync(path.join(this.dir, "public_html", "cloudServer.js")))
      return;
    try {
      return JSON.parse(fs.readFileSync(manifest, "utf8"));
    }
    catch {
      // A connector is there, its package.json is not readable: still an update, just a quiet one
      return {};
    }
  }


  /**
   * A password key the connector will accept: AES-256 wants 32 bytes, and config.json carries
   * them as the 64 hexadecimal characters Utils.isValidKey insists on.
   * @returns {String} A new key
   */
  static newKey()
  {
    return crypto.randomBytes(32).toString("hex");
  }


  /**
   * Refuses to start when an earlier attempt left its backup behind.
   *
   * A backup directory is only ever left in place by a recovery that could not finish - `putBack`
   * removes it when it has put everything back, and keeps it when it has not, which is the right
   * thing to do because at that moment it holds the only copy of the old installation. Running
   * again is then the most natural thing in the world, and the first thing this would do is
   * `moveAside`, whose first line deletes that directory. `config.json` goes with it: the remote
   * servers, the IDE users, the datamodels and their passwords, under a line that says a new
   * configuration is being written.
   *
   * Stopping is the only answer that does not guess. Putting it back by hand would work in the
   * case this was written for, but it would be a supposition about how the directory came to be
   * there, and a wrong supposition costs exactly the file being protected.
   */
  checkNothingWasLeftBehind()
  {
    if (!fs.existsSync(this.backup))
      return;
    let configFile = path.join(this.backup, "public_html", "config.json");
    throw new Error(`${this.backup} is still here, which means an earlier attempt could not put ` +
            "the previous installation back where it was.\n\n" +
            (fs.existsSync(configFile)
              ? `The configuration of that installation is in it, at\n  ${configFile}\n\n`
              : "") +
            "Nothing has been done. Move whatever is worth keeping somewhere safe, remove\n" +
            `  ${this.backup}\nand run this again.`);
  }


  /**
   * Where the old installation is moved to while the new one is laid down.
   * @returns {String} Full path
   */
  get backup()
  {
    return path.join(this.dir, Installer.backupName);
  }


  /**
   * Moves the installation out of the way instead of deleting it, so that there is something to
   * go back to. What is moved is only what this installer owns: anything else in the directory,
   * logs included, stays where it is.
   *
   * It says nothing about where it put things, and on purpose. A caller that learns the location
   * from the return value learns it only if this returns - and the case worth surviving is the
   * one where it does not, three directories in, with one already moved. Where the backup lives
   * is `this.backup`, known before any of this runs and true whether it finishes or not.
   */
  moveAside()
  {
    fs.rmSync(this.backup, {recursive: true, force: true});
    for (let what of ["runtime", "public_html", "service"]) {
      if (!fs.existsSync(path.join(this.dir, what)))
        continue;
      fs.mkdirSync(this.backup, {recursive: true});
      fs.renameSync(path.join(this.dir, what), path.join(this.backup, what));
    }
  }


  /**
   * Puts the old installation back, after something went wrong with the new one.
   *
   * Whether there is anything to put back is read from the disk, not from how far the moving got:
   * it may have stopped in the middle, with one directory moved and the next one still where it
   * was, and that is precisely the case worth surviving.
   *
   * There are two ways back, and which one applies is decided by whether there was an
   * installation here to begin with:
   *
   * - **An update that failed** goes back to the installation that was moved aside, and its
   *   service is registered again from it.
   * - **A fresh install that failed** has nothing to go back to, so what there is to do is undo:
   *   take away the service that was registered and the tree that was unpacked. Leaving them is
   *   what makes the next attempt refuse to run - it finds a service already registered - and it
   *   is the machine being left changed by an installer that says it changed nothing.
   *
   * Whether the service has to be registered again, whether one was created, and whether anything
   * was moved are three questions and not one. Answering any of them with another is an
   * approximation, and every such approximation has broken here at least once: the service is
   * taken apart before anything moves, and registered again after everything is laid down.
   *
   * The environment has to be handed in rather than read: taking the service apart is what
   * deleted the only copy of it, and generating a fresh key here would restore an installation
   * whose stored passwords no longer open - a worse outcome than the failure being recovered from.
   *
   * @param {Object} env - Variables that installation was running with
   * @param {Object} done - What had been done: tookApart, laidDown, registered
   * @returns {String} What could not be put back, when something could not
   */
  putBack(env, done)
  {
    let trouble = [];
    if (fs.existsSync(this.backup)) {
      for (let what of fs.readdirSync(this.backup)) {
        try {
          fs.rmSync(path.join(this.dir, what), {recursive: true, force: true});
          fs.renameSync(path.join(this.backup, what), path.join(this.dir, what));
        }
        catch (e) {
          trouble.push(`${what} is still in ${this.backup} (${e.code || e.message})`);
        }
      }
      if (!trouble.length)
        fs.rmSync(this.backup, {recursive: true, force: true});
    }
    if (done.tookApart) {
      try {
        this.service.install(env || {CC_KEY: Installer.newKey()}, this.options.user);
        this.service.start();
      }
      catch (e) {
        trouble.push(`the service could not be registered again: ${e.message}`);
      }
      return trouble.join("; ");
    }
    // Nothing was here before, so there is nothing to put back and everything to undo
    if (done.registered) {
      try {
        this.service.stop();
        this.service.uninstall();
      }
      catch (e) {
        trouble.push(`the service that had just been registered could not be removed: ${e.message}`);
      }
    }
    if (done.laidDown) {
      for (let what of ["runtime", "public_html", "service", "logs"]) {
        try {
          fs.rmSync(path.join(this.dir, what), {recursive: true, force: true});
        }
        catch (e) {
          trouble.push(`${what} is still in ${this.dir} (${e.code || e.message})`);
        }
      }
    }
    return trouble.join("; ");
  }


  /**
   * Throws away the old installation, once the new one is running.
   */
  discard()
  {
    fs.rmSync(this.backup, {recursive: true, force: true});
  }


  /**
   * Puts config.json in place: the one that was already there on an update, a minimal one that
   * the configuration page can then fill in on a fresh install.
   *
   * config_example.json is not that minimal one. It is documentation: every field in it is a
   * placeholder and its five datamodels point at nothing, so a connector started on a copy of it
   * would spend its life failing to reach databases that were never meant to exist.
   *
   * @param {Object} previous - What was installed before, when something was
   */
  writeConfig(previous)
  {
    let configFile = path.join(this.dir, "public_html", "config.json");
    let backup = path.join(this.dir, Installer.backupName, "public_html", "config.json");
    if (previous && fs.existsSync(backup)) {
      fs.copyFileSync(backup, configFile);
      if (this.options.port)
        this.setPort(configFile, this.options.port);
      return this.say("  keeping the configuration that was already there");
    }
    let config = {
      name: os.hostname(),
      passwordPrivateKey: Installer.keyPlaceholder,
      remoteServers: [],
      remoteUserNames: [],
      localConfiguration: {
        enabled: true,
        port: this.options.port || Installer.defaultPort
      },
      datamodels: [],
      fileSystems: [],
      plugins: []
    };
    fs.writeFileSync(configFile, JSON.stringify(config, undefined, 2) + "\n");
    this.say("  writing a new configuration");
  }


  /**
   * Changes the port of the configuration page in a config.json that is already written, keeping
   * everything else in it exactly as it was.
   * @param {String} configFile - Full path of config.json
   * @param {Number} port - Port to set
   */
  setPort(configFile, port)
  {
    let config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    config.localConfiguration = Object.assign({enabled: true}, config.localConfiguration, {port});
    fs.writeFileSync(configFile, JSON.stringify(config, undefined, 2) + "\n");
  }


  /**
   * The port the configuration page will be answering on, as config.json has it. The page moves
   * on by itself when that port is taken, so this is where to start looking and not a promise.
   * @returns {Number} The port
   */
  get port()
  {
    try {
      let config = JSON.parse(fs.readFileSync(path.join(this.dir, "public_html", "config.json"), "utf8"));
      return config.localConfiguration?.port || Installer.defaultPort;
    }
    catch {
      return Installer.defaultPort;
    }
  }


  /**
   * Looks for the things the connector needs that are not Node modules and that no installer can
   * put there: they are system packages, and which one depends on the database. Their absence is
   * said and not treated as a failure, because a connector with no ODBC datamodel does not care.
   */
  checkPrerequisites()
  {
    if (process.platform === "win32")
      return;
    let answer = spawnSync("odbcinst", ["-j"], {encoding: "utf8"});
    if (answer.error || answer.status !== 0)
      this.notes.push("unixODBC was not found. It is only needed by ODBC datamodels, and it is a " +
              "system package: install it with the package manager (unixodbc on Debian and Ubuntu, " +
              "unixODBC on Red Hat, unixodbc from Homebrew on macOS), along with the ODBC driver of " +
              "the database itself.");
  }


  /**
   * Says how it went, and opens the configuration page, which is where everything else is done.
   */
  async finish()
  {
    let url = await this.findPage();
    if (!url) {
      url = `http://127.0.0.1:${this.port}`;
      this.notes.push(`The configuration page did not answer within ${Installer.pageTimeout / 1000} ` +
              `seconds, on ${this.port} or on the ports after it. The service is registered: see ` +
              "its log to find out why, then open the page again.");
    }
    else if (!url.endsWith(`:${this.port}`)) {
      this.notes.push(`Port ${this.port} was taken, so the configuration page moved to the first ` +
              `free one after it: ${url}. It will look again at every start, and go back to ` +
              `${this.port} as soon as that is free.`);
    }
    for (let note of this.notes)
      this.say(`\n! ${note}`);
    this.say(`\nConfigure it at ${url}`);
    if (!this.options.noBrowser)
      this.openBrowser(url);
  }


  /**
   * Waits for the configuration page to answer, and says where it is answering from, so that the
   * browser is not opened on a door that is not open yet or on the wrong one.
   *
   * Where it looks is a range and not a port. The page steps forward when the port it wants is
   * taken - by another connector on the same machine, or by anything else - so the installer
   * looks along the same range it would step through, or it would report a page as missing while
   * it is serving one door further along.
   *
   * @returns {Promise<String>} Where the page answered, or nothing when it never did
   */
  async findPage()
  {
    let deadline = Date.now() + Installer.pageTimeout;
    let ports = [];
    for (let port = this.port; port < this.port + Installer.portsToTry; port++)
      ports.push(port);
    while (Date.now() < deadline) {
      for (let port of ports) {
        if (await Installer.knock(`http://127.0.0.1:${port}`))
          return `http://127.0.0.1:${port}`;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }


  /**
   * Asks an address whether the configuration page is behind it.
   *
   * It asks for the status rather than knocking on the socket, because the ports after the one
   * that was taken belong to whoever got there first: something is listening on them, and
   * something is not the page. Only an answer this connector could have written counts.
   *
   * @param {String} url - Address to try
   * @returns {Promise<Boolean>} True when the configuration page answered
   */
  static knock(url)
  {
    return new Promise(resolve => {
      let request = http.get(`${url}/api/status`, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => body += chunk);
        response.on("end", () => {
          try {
            resolve(typeof JSON.parse(body).name === "string");
          }
          catch {
            resolve(false);
          }
        });
      });
      request.on("error", () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });
  }


  /**
   * Opens the configuration page in whatever the machine uses for a browser. A server may have
   * none, which is why the address has already been written out either way.
   * @param {String} url - Page to open
   */
  openBrowser(url)
  {
    let open = {
      win32: ["cmd", ["/c", "start", "", url]],
      darwin: ["open", [url]],
      linux: ["xdg-open", [url]]
    }[process.platform];
    let answer = spawnSync(open[0], open[1], {encoding: "utf8", windowsHide: true});
    if (answer.error || answer.status !== 0)
      this.say("  (no browser was opened: open the address above by hand)");
  }
}


module.exports = Installer;
