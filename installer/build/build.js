/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const {spawnSync} = require("child_process");


/**
 * @class Build
 * @classdesc
 * Makes the installer: the payload it carries, and the single executable that carries it.
 *
 * **It builds for the machine it runs on, and only for that one.** The connector's modules are
 * not all Javascript: `odbc` and `@node-rs/crc32` resolve to a binary chosen by the platform and
 * the architecture `npm` is run on. Building every platform from one machine would produce trees
 * with the wrong binary, or with none, and nothing would say so until an operator somewhere tried
 * to open an ODBC datamodel. So the release runs this once per platform, on that platform.
 *
 * The Node.js runtime is downloaded from nodejs.org and checked against the SHASUMS256.txt
 * published beside it. The installer is signed afterwards and shipped: a runtime taken on faith
 * would be a runtime we sign without knowing what it is.
 *
 * @property {Object} options - What the command line asked for
 * @property {String} root - The installer directory, which everything is relative to
 * @property {String} out - Where the built artifacts go
 * @property {String} staging - Where the payload is assembled before being packed
 */
class Build
{
  static nodeVersion = "22.14.0";
  static fuse = "fce680ab2cc467b6e072b8b5df1996b2";
  static executableNames = {win32: "cc-installer.exe", linux: "cc-installer", darwin: "cc-installer"};


  /**
   * @param {String[]} argv - Command line, without the runtime and the program
   */
  constructor(argv)
  {
    this.options = {nodeVersion: Build.nodeVersion};
    for (let i = 0; i < argv.length; i++) {
      switch (argv[i]) {
        case "--payload-only":
          this.options.payloadOnly = true;
          break;

        case "--executable-only":
          this.options.executableOnly = true;
          break;

        case "--node":
          this.options.nodeVersion = argv[++i];
          break;

        default:
          throw new Error(`${argv[i]} is not something this build understands`);
      }
    }
    this.root = path.join(__dirname, "..");
    this.out = path.join(__dirname, "out");
    this.staging = path.join(__dirname, "staging");
  }


  /**
   * Says something as it happens.
   * @param {String} message - What to say
   */
  say(message)
  {
    console.log(message);
  }


  /**
   * Runs a program, and stops the build when it fails: a build that goes on after a step did not
   * work produces an artifact that looks finished.
   * @param {String} command - Program to run
   * @param {String[]} args - Its arguments
   * @param {Object} [options] - Options for spawnSync
   * @returns {String} What it wrote out
   */
  run(command, args, options)
  {
    let answer = spawnSync(command, args, Object.assign({encoding: "utf8", shell: false}, options));
    if (answer.error)
      throw new Error(`Could not run ${command}: ${answer.error.message}`);
    if (answer.status !== 0)
      throw new Error(`${command} ${args.join(" ")} failed:\n${(answer.stderr || answer.stdout || "").trim()}`);
    return answer.stdout || "";
  }


  /**
   * Builds what was asked for.
   */
  async make()
  {
    if (this.options.executableOnly) {
      // Reusing what is there is for going round the loop while writing the installer. A release
      // never takes this path: make() starts by throwing the previous build away, so that what
      // comes out of it is made of what is in the tree and nothing that was lying about
      if (!fs.existsSync(path.join(this.out, "payload.tar.gz")))
        throw new Error("There is no payload to put in it. Build one first, without --executable-only.");
      this.say("reusing the payload that is already built");
      return this.makeExecutable();
    }
    fs.rmSync(this.out, {recursive: true, force: true});
    fs.mkdirSync(this.out, {recursive: true});
    await this.makePayload();
    if (this.options.payloadOnly)
      return this.say("\nThe payload is built. Run without --payload-only to make the executable.");
    this.makeExecutable();
  }


  /**
   * Assembles the runtime, the connector and its modules, and packs them.
   */
  async makePayload()
  {
    fs.rmSync(this.staging, {recursive: true, force: true});
    fs.mkdirSync(this.staging, {recursive: true});
    await this.addRuntime();
    this.addConnector();
    this.addServiceWrapper();
    this.say("packing the payload");
    // See unpack(): the argument of -f must carry no drive letter, or GNU tar takes it for a host
    this.run("tar", ["-czf", "payload.tar.gz", "-C", this.staging, "."], {cwd: this.out});
    let size = fs.statSync(path.join(this.out, "payload.tar.gz")).size;
    this.say(`  ${(size / 1024 / 1024).toFixed(1)} MB`);
  }


  /**
   * Downloads the Node.js runtime for this platform, checks it against the checksums published
   * beside it, and keeps the one file that is needed: the rest of a Node distribution is npm and
   * its headers, and the connector's modules are already in the payload.
   */
  async addRuntime()
  {
    let version = this.options.nodeVersion;
    let arch = process.arch;
    let platform = {win32: "win", linux: "linux", darwin: "darwin"}[process.platform];
    if (!platform)
      throw new Error(`${process.platform} is not a platform the connector is built for`);
    let name = `node-v${version}-${platform}-${arch}`;
    let archive = `${name}${process.platform === "win32" ? ".zip" : ".tar.gz"}`;
    let url = `https://nodejs.org/dist/v${version}/${archive}`;
    //
    this.say(`downloading ${archive}`);
    let cache = path.join(os.tmpdir(), "cc-installer-build");
    fs.mkdirSync(cache, {recursive: true});
    let downloaded = path.join(cache, archive);
    if (!fs.existsSync(downloaded))
      await Build.download(url, downloaded);
    //
    this.say("  checking it against SHASUMS256.txt");
    let sums = await Build.fetch(`https://nodejs.org/dist/v${version}/SHASUMS256.txt`);
    let expected = sums.split("\n").find(line => line.trim().endsWith(` ${archive}`))?.split(/\s+/)[0];
    if (!expected)
      throw new Error(`SHASUMS256.txt for v${version} says nothing about ${archive}`);
    let got = crypto.createHash("sha256").update(fs.readFileSync(downloaded)).digest("hex");
    if (got !== expected) {
      // Leaving it in the cache would make every later build fail the same way, with no hint why
      fs.rmSync(downloaded, {force: true});
      throw new Error(`${archive} does not match its published checksum: expected ${expected}, got ${got}`);
    }
    //
    this.run(Build.unpacker(), ["-xf", path.basename(downloaded)], {cwd: cache});
    let from = process.platform === "win32" ? path.join(cache, name, "node.exe") : path.join(cache, name, "bin", "node");
    let to = process.platform === "win32" ? path.join(this.staging, "runtime", "node.exe")
      : path.join(this.staging, "runtime", "bin", "node");
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.copyFileSync(from, to);
    if (process.platform !== "win32")
      fs.chmodSync(to, 0o755);
    this.say(`  runtime: Node.js v${version} ${platform}-${arch}`);
  }


  /**
   * Copies the connector, and installs the modules it needs to run.
   *
   * What is copied is what git tracks, which leaves out config.json, node_modules and everything
   * else a working copy accumulates. A build that copied the directory as it stands would ship
   * whatever the machine that ran it happened to have lying around, including somebody's real
   * configuration and the passwords in it.
   */
  addConnector()
  {
    this.say("copying the connector");
    let repo = path.join(this.root, "..");
    let tracked = this.run("git", ["-C", repo, "ls-files", "public_html"]).split("\n").filter(line => line.trim());
    if (!tracked.length)
      throw new Error(`git tracks no file under public_html in ${repo}: is this a checkout of the repository?`);
    for (let file of tracked) {
      let to = path.join(this.staging, file);
      fs.mkdirSync(path.dirname(to), {recursive: true});
      fs.copyFileSync(path.join(repo, file), to);
    }
    this.say(`  ${tracked.length} files`);
    //
    // Every package.json that came across is something with modules of its own: the connector,
    // and each plugin that ships with it
    for (let manifest of tracked.filter(file => path.basename(file) === "package.json")) {
      let where = path.join(this.staging, path.dirname(manifest));
      this.say(`  installing the modules of ${path.dirname(manifest)}`);
      let lock = fs.existsSync(path.join(where, "package-lock.json"));
      this.run("npm", [lock ? "ci" : "install", "--omit=dev", "--no-audit", "--no-fund"],
              {cwd: where, shell: process.platform === "win32"});
    }
  }


  /**
   * Puts the service wrapper in the payload, on the platform that needs one.
   *
   * Windows services have to answer the Service Control Manager, which Node cannot do, so the
   * connector runs under winsw. The binary is not downloaded here: it is a third party executable
   * that ends up inside something we sign, so it is committed under build/vendor with its licence
   * and its provenance, and reviewed when it changes.
   */
  addServiceWrapper()
  {
    if (process.platform !== "win32")
      return;
    let wrapper = path.join(__dirname, "vendor", "winsw.exe");
    if (!fs.existsSync(wrapper)) {
      // Said here and not thrown, so that an installer can be built and looked at before the
      // wrapper has been chosen. The installer itself refuses the service step up front rather
      // than discovering this halfway through, so what comes out is unfinished and not a trap
      this.noWrapper = true;
      return this.say("  NO SERVICE WRAPPER: this installer will lay the connector down and then " +
              `refuse to register the service.\n  Put winsw.exe in ${path.dirname(wrapper)} to ` +
              "build a complete one: see build/vendor/README.md.");
    }
    fs.mkdirSync(path.join(this.staging, "service"), {recursive: true});
    fs.copyFileSync(wrapper, path.join(this.staging, "service", "cloudconnector.exe"));
    this.say("  service wrapper: winsw");
  }


  /**
   * Makes the single executable: the sources become one file, that file becomes a blob, and the
   * blob goes inside a copy of the runtime.
   */
  makeExecutable()
  {
    this.say("bundling the installer");
    // Inside a single executable require() resolves built-in modules and nothing else, so the
    // sources cannot stay separate files: what gets injected has to already be one
    require("esbuild").buildSync({
      entryPoints: [path.join(this.root, "src", "main.js")],
      outfile: path.join(this.out, "installer.bundle.js"),
      bundle: true,
      platform: "node",
      target: `node${this.options.nodeVersion.split(".")[0]}`,
      minify: false
    });
    //
    let config = path.join(this.out, "sea-config.json");
    fs.writeFileSync(config, JSON.stringify({
      main: path.join(this.out, "installer.bundle.js"),
      output: path.join(this.out, "installer.blob"),
      disableExperimentalSEAWarning: true,
      assets: {
        "payload.tar.gz": path.join(this.out, "payload.tar.gz")
      }
    }, undefined, 2));
    this.say("preparing the blob");
    this.run(process.execPath, ["--experimental-sea-config", config]);
    //
    let executable = path.join(this.out, Build.executableNames[process.platform]);
    fs.copyFileSync(process.execPath, executable);
    if (process.platform !== "win32")
      fs.chmodSync(executable, 0o755);
    // The runtime published by nodejs.org is signed, and injecting into a signed binary leaves a
    // signature that no longer matches what it signs. It comes off here and goes back on at release
    if (process.platform === "darwin")
      spawnSync("codesign", ["--remove-signature", executable]);
    this.stampResources(executable);
    //
    this.say("injecting the blob");
    let args = [path.join(this.root, "node_modules", "postject", "dist", "cli.js"),
      executable, "NODE_SEA_BLOB", path.join(this.out, "installer.blob"),
      "--sentinel-fuse", `NODE_SEA_FUSE_${Build.fuse}`];
    if (process.platform === "darwin")
      args.push("--macho-segment-name", "NODE_SEA");
    this.run(process.execPath, args);
    if (process.platform === "darwin")
      spawnSync("codesign", ["--sign", "-", executable]);
    //
    let size = fs.statSync(executable).size;
    this.say(`\n${executable}\n  ${(size / 1024 / 1024).toFixed(1)} MB, not yet signed`);
    if (this.noWrapper)
      this.say("  and it cannot register the Windows service: built without the wrapper");
  }


  /**
   * Gives the executable its own name, icon and version on Windows.
   *
   * A single executable is a copy of node.exe, and a copy carries node.exe's resources: without
   * this, the properties of the file say "Node.js JavaScript Runtime", published by "Node.js",
   * originally called node.exe, and Explorer shows it with the Node icon. Everything Windows
   * shows about a file comes from there, the list of installed programs included.
   *
   * **Before the blob goes in, not after.** rcedit rewrites the resource section and moves what
   * follows it; on a file with 47 MB appended it does not finish in any useful time — three
   * minutes in, it was still going. On the bare runtime it takes under two seconds.
   *
   * Only Windows has any of this. A Linux executable carries no such thing, and on macOS it would
   * be an Info.plist inside an application bundle, which a bare executable is not.
   *
   * @param {String} executable - The executable to stamp, before the blob is injected
   */
  stampResources(executable)
  {
    if (process.platform !== "win32")
      return;
    let rcedit = path.join(this.root, "node_modules", "rcedit", "bin", "rcedit-x64.exe");
    if (!fs.existsSync(rcedit))
      throw new Error(`rcedit is missing from ${rcedit}: run npm ci in the installer directory.`);
    let version = this.connectorVersion();
    this.say(`stamping it as ${version}`);
    let stamp = [executable,
      "--set-file-version", `${version}.0`,
      "--set-product-version", `${version}.0`,
      "--set-version-string", "FileDescription", "Instant Developer Cloud Connector installer",
      "--set-version-string", "ProductName", "Instant Developer Cloud Connector",
      "--set-version-string", "CompanyName", "Pro Gamma Spa",
      "--set-version-string", "LegalCopyright", "Copyright Pro Gamma Spa 2000-2026",
      "--set-version-string", "OriginalFilename", Build.executableNames.win32,
      "--set-version-string", "InternalName", "cc-installer"];
    let icon = path.join(__dirname, "icon.ico");
    if (fs.existsSync(icon))
      stamp.push("--set-icon", icon);
    this.run(rcedit, stamp);
  }


  /**
   * The version of the connector this installer carries, which is the version it makes sense for
   * the installer to claim: nobody installs an installer.
   * @returns {String} The version, as three numbers
   */
  connectorVersion()
  {
    let manifest = path.join(this.root, "..", "public_html", "package.json");
    let version = JSON.parse(fs.readFileSync(manifest, "utf8")).version || "0.0.0";
    // rcedit wants four numbers and package.json gives three, so the fourth is added by the caller
    if (!/^\d+\.\d+\.\d+$/.test(version))
      throw new Error(`The connector's version is "${version}", which is not three numbers, so ` +
              "Windows would refuse it as a file version.");
    return version;
  }


  /**
   * The tar to unpack the downloaded runtime with.
   *
   * For Windows nodejs.org publishes a zip and no tarball, and only one of the two tars that end
   * up on a Windows machine can read a zip: bsdtar, the one Windows ships in System32. The other
   * is GNU tar, which arrives with Git and, when it does, comes first in PATH — so asking for
   * "tar" is asking for whichever was installed last. Here it is asked for by name.
   *
   * Everywhere else, and for the payload itself, plain "tar" is right: both read a .tar.gz.
   *
   * @returns {String} The tar to run
   */
  static unpacker()
  {
    if (process.platform !== "win32")
      return "tar";
    let bsdtar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    if (!fs.existsSync(bsdtar))
      throw new Error(`${bsdtar} is not there, and it is the only tar on Windows that reads a zip. ` +
              "It ships with Windows since version 1803.");
    return bsdtar;
  }


  /**
   * Reads a small file off the network, following the redirects nodejs.org uses.
   * @param {String} url - What to read
   * @returns {Promise<String>} What it said
   */
  static fetch(url)
  {
    return new Promise((resolve, reject) => {
      https.get(url, response => {
        if (response.statusCode === 301 || response.statusCode === 302)
          return resolve(Build.fetch(response.headers.location));
        if (response.statusCode !== 200)
          return reject(new Error(`${url} answered ${response.statusCode}`));
        let text = "";
        response.setEncoding("utf8");
        response.on("data", chunk => text += chunk);
        response.on("end", () => resolve(text));
      }).on("error", reject);
    });
  }


  /**
   * Downloads a file, writing it out as it arrives rather than holding it in memory.
   * @param {String} url - What to download
   * @param {String} to - Where to put it
   * @returns {Promise} Resolved when the file is on the disk
   */
  static download(url, to)
  {
    return new Promise((resolve, reject) => {
      https.get(url, response => {
        if (response.statusCode === 301 || response.statusCode === 302)
          return resolve(Build.download(response.headers.location, to));
        if (response.statusCode !== 200)
          return reject(new Error(`${url} answered ${response.statusCode}`));
        // The partial file is removed on failure: left behind, the next build would take it for
        // a good download and only the checksum would catch it
        let file = fs.createWriteStream(to);
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", e => {
          fs.rmSync(to, {force: true});
          reject(e);
        });
      }).on("error", e => {
        fs.rmSync(to, {force: true});
        reject(e);
      });
    });
  }
}


new Build(process.argv.slice(2)).make().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
