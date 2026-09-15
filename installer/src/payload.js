/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {spawnSync} = require("child_process");


/**
 * @class Payload
 * @classdesc
 * The runtime and the connector the installer carries, and how they get onto the disk.
 *
 * When the installer runs as a single executable the payload is an asset inside it, so nothing
 * is downloaded and a machine with no network installs just as well as one with it. When it runs
 * from the sources, during development, the same payload is a directory built by `build/`: the
 * two cases differ only in where the archive comes from, so what is tested unpacked is what runs
 * packed.
 *
 * Unpacking goes through the system `tar`, which is on Windows since 1803 and has always been
 * everywhere else. Writing an unpacker here would mean owning symlinks, permissions and long
 * paths, all of which `tar` already gets right.
 *
 * @property {String} archive - Full path of the archive to unpack, in a temporary directory when
 *                              it had to be written out of the executable first
 * @property {Boolean} temporary - True when the archive is ours to delete afterwards
 */
class Payload
{
  static assetName = "payload.tar.gz";


  /**
   * @param {String} archive - Full path of the archive to unpack
   * @param {Boolean} temporary - True when the archive was written by us and must be deleted
   */
  constructor(archive, temporary)
  {
    this.archive = archive;
    this.temporary = temporary;
  }


  /**
   * Tells whether this program is running as a single executable rather than from its sources.
   * @returns {Boolean} True when running packed
   */
  static isPacked()
  {
    try {
      return require("node:sea").isSea();
    }
    catch {
      // node:sea does not exist before Node 20, and there the answer is no anyway
      return false;
    }
  }


  /**
   * Finds the payload and makes it a file on disk, writing it out of the executable if that is
   * where it lives.
   * @returns {Payload} The payload, ready to unpack
   */
  static find()
  {
    if (!Payload.isPacked()) {
      let archive = path.join(__dirname, "..", "build", "out", Payload.assetName);
      if (!fs.existsSync(archive))
        throw new Error(`Payload not found at ${archive}. Build it with: node build/build.js`);
      return new Payload(archive, false);
    }
    //
    // Packed: the archive is an asset, and tar wants a file, so it goes to a temporary one
    let asset = require("node:sea").getRawAsset(Payload.assetName);
    let archive = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cc-installer-")), Payload.assetName);
    fs.writeFileSync(archive, Buffer.from(asset));
    return new Payload(archive, true);
  }


  /**
   * Checks that tar is there before anything has been moved, because finding out halfway through
   * an update leaves an installation with neither the old code nor the new one.
   * @returns {String} Version line tar answered with
   */
  static checkTar()
  {
    let answer = spawnSync("tar", ["--version"], {encoding: "utf8"});
    if (answer.error || answer.status !== 0)
      throw new Error("tar was not found. It ships with Windows since version 1803 and with every " +
              "supported Linux and macOS: on Windows check that %SystemRoot%\\System32 is in PATH.");
    return answer.stdout.split("\n")[0].trim();
  }


  /**
   * Tells whether the payload carries something, without unpacking it.
   *
   * This is how a question about what this installer was built with gets asked of the thing it
   * was built into, rather than of the disk: on a fresh install nothing has been laid down yet,
   * so looking in the installation directory for a file that arrives with the payload always
   * finds nothing.
   *
   * @param {String} entry - Path inside the payload, with forward slashes
   * @returns {Boolean} True when the payload carries it
   */
  contains(entry)
  {
    let answer = spawnSync("tar", ["-tzf", path.basename(this.archive)],
            {encoding: "utf8", cwd: path.dirname(this.archive), maxBuffer: 64 * 1024 * 1024});
    if (answer.error || answer.status !== 0)
      throw new Error(`Could not read the payload: ${(answer.stderr || answer.error?.message || "").trim()}`);
    // tar lists what it was given, and it was given ".", so every entry starts with "./"
    return answer.stdout.split("\n").some(line => line.trim().replace(/^\.\//, "") === entry);
  }


  /**
   * Unpacks the payload into a directory, which must already exist.
   * @param {String} dir - Directory to unpack into
   */
  unpack(dir)
  {
    // -o is what keeps the installed files root's. A tar records the uid and gid of whoever made
    // it, and GNU tar extracting as the superuser restores them by default: without this, the
    // files would belong to the account the release runner happened to build under - 501 on every
    // macOS runner, which is also the first user of every Mac - and anybody holding that uid
    // locally could rewrite the code that systemd and launchd start as root at boot. In extract
    // mode both GNU tar and bsdtar read -o as "use the user doing the extracting".
    //
    // The archive is named relative to a working directory rather than in full, because GNU tar
    // reads the drive letter in "C:\..." as a host to connect to and refuses the whole thing.
    // Only the argument of -f is read that way, so -C can stay the full path it has to be
    let answer = spawnSync("tar", ["-xzf", path.basename(this.archive), "-o", "-C", dir],
            {encoding: "utf8", cwd: path.dirname(this.archive)});
    if (answer.error)
      throw new Error(`Could not run tar: ${answer.error.message}`);
    if (answer.status !== 0)
      throw new Error(`tar could not unpack the payload into ${dir}: ${answer.stderr.trim()}`);
  }


  /**
   * Removes the temporary archive, when it was ours. Failing to is not worth stopping an
   * installation that worked, so it is reported and no more.
   * @returns {String} What went wrong, when something did
   */
  cleanUp()
  {
    if (!this.temporary)
      return;
    try {
      fs.rmSync(path.dirname(this.archive), {recursive: true, force: true});
    }
    catch (e) {
      return `the temporary copy at ${path.dirname(this.archive)} could not be removed: ${e.message}`;
    }
  }
}


module.exports = Payload;
