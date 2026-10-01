/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const fs = require("fs");
const path = require("path");
const {spawnSync} = require("child_process");


/**
 * @class Sign
 * @classdesc
 * Signs the Windows installer with the Pro Gamma certificate, checks that the signature took, and
 * if asked attaches it to a release.
 *
 * **It runs on a person's machine, not in the workflow.** The certificate is the one INDE.exe is
 * signed with: Certum, and its private key is on SimplySign, Certum's remote HSM. signtool reaches
 * it through SimplySign Desktop, which has to be logged in, and every signature waits for a
 * confirmation on the SimplySign app of a phone. Nobody is there to confirm on a GitHub runner,
 * so the workflow builds the Windows installer unsigned and leaves it to this.
 *
 * Nothing secret is in here. The thumbprint names the certificate, it does not unlock it: what
 * does is the SimplySign login and the phone.
 *
 * @property {Object} options - What the command line asked for
 * @property {String} file - The installer to sign
 */
class Sign
{
  static thumbprint = "5133BA1CB0E9D6D5247B2C0E9F22226FC3D16294";
  // Certum's own, as INDE.exe uses. A timestamp is what keeps the signature valid after the
  // certificate expires: without one, every installer already downloaded stops being trusted on
  // the day it lapses
  static timestamp = "http://time.certum.pl";
  // The name the workflow gives the Windows installer on a release page, beside the other three
  static releaseName = "cc-installer-win-x64.exe";


  /**
   * @param {String[]} argv - Command line, without the runtime and the program
   */
  constructor(argv)
  {
    this.options = {};
    for (let i = 0; i < argv.length; i++) {
      switch (argv[i]) {
        case "--release":
          this.options.release = argv[++i];
          if (!this.options.release)
            throw new Error("--release needs the tag of the release, as in --release v26.6.0");
          break;

        default:
          if (argv[i].startsWith("-") || this.options.file)
            throw new Error(`${argv[i]} is not something this understands`);
          this.options.file = argv[i];
          break;
      }
    }
    this.file = path.resolve(this.options.file || path.join(__dirname, "out", "cc-installer.exe"));
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
   * Signs, checks, and attaches when asked to.
   */
  make()
  {
    if (process.platform !== "win32")
      throw new Error("This signs the Windows installer, and signtool only runs on Windows.");
    if (!fs.existsSync(this.file))
      throw new Error(`There is no ${this.file} to sign. Build it with node build/build.js, or ` +
              "download it from the Installer workflow.");
    //
    this.say(`signing ${this.file}`);
    this.say("  SimplySign Desktop has to be logged in: confirm on the phone when the app asks");
    let answer = spawnSync(Sign.signtool(), ["sign", "/sha1", Sign.thumbprint, "/tr", Sign.timestamp,
      "/td", "sha256", "/fd", "sha256", this.file], {encoding: "utf8"});
    if (answer.error)
      throw new Error(`Could not run signtool: ${answer.error.message}`);
    if (answer.status !== 0) {
      let said = (answer.stderr || answer.stdout || "").trim();
      // What signtool says when SimplySign is not logged in is that the certificate does not
      // exist, which sends whoever reads it looking in the wrong place
      if (/No certificates were found/i.test(said))
        said += "\n\nThe certificate is only there while SimplySign Desktop is logged in: log in and try again.";
      throw new Error(`signtool failed:\n${said}`);
    }
    //
    this.check();
    if (this.options.release)
      this.attach(this.options.release);
  }


  /**
   * Finds signtool among the Windows SDKs installed, the newest first.
   * @returns {String} Full path of signtool.exe
   */
  static signtool()
  {
    let bin = path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
    let versions = fs.existsSync(bin) ? fs.readdirSync(bin).filter(name => /^\d+(\.\d+)+$/.test(name)) : [];
    versions.sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
    let found = versions.map(version => path.join(bin, version, "x64", "signtool.exe")).find(fs.existsSync);
    if (!found)
      throw new Error(`signtool.exe was not found under ${bin}. It comes with the Windows SDK.`);
    return found;
  }


  /**
   * Asks the file whether it is signed, by whom, and with a timestamp, rather than taking
   * signtool's word for it: Windows is what will be asked when somebody downloads it.
   */
  check()
  {
    let script = `$s = Get-AuthenticodeSignature -LiteralPath '${this.file.replace(/'/g, "''")}'; ` +
            "@{status = \"$($s.Status)\"; signer = $s.SignerCertificate.Subject; " +
            "thumbprint = $s.SignerCertificate.Thumbprint; timestamp = $s.TimeStamperCertificate.Subject} " +
            "| ConvertTo-Json -Compress";
    let answer = spawnSync("powershell", ["-NoProfile", "-Command", script], {encoding: "utf8"});
    if (answer.error || answer.status !== 0)
      throw new Error(`Could not read the signature back: ${answer.error?.message || answer.stderr.trim()}`);
    let signature = JSON.parse(answer.stdout);
    this.say(`  ${signature.status}, by ${signature.signer}`);
    this.say(`  timestamp by ${signature.timestamp || "nobody"}`);
    if (signature.status !== "Valid")
      throw new Error(`The signature is not valid: ${signature.status}.`);
    if (signature.thumbprint?.toUpperCase() !== Sign.thumbprint)
      throw new Error(`It was signed with ${signature.thumbprint}, and not with the Pro Gamma certificate.`);
    if (!signature.timestamp)
      throw new Error("The signature has no timestamp, so it would stop being trusted the day the " +
              "certificate expires. Sign it again.");
  }


  /**
   * Puts the signed installer on a release, under the name the workflow gives it.
   * @param {String} tag - Tag of the release
   */
  attach(tag)
  {
    let named = path.join(path.dirname(this.file), Sign.releaseName);
    if (named !== this.file)
      fs.copyFileSync(this.file, named);
    this.say(`attaching it to ${tag} as ${Sign.releaseName}`);
    let answer = spawnSync("gh", ["release", "upload", tag, named, "--clobber"],
            {encoding: "utf8", cwd: __dirname});
    if (answer.error)
      throw new Error(`Could not run gh: ${answer.error.message}. The signed file is ${named}: ` +
              "attach it to the release by hand.");
    if (answer.status !== 0)
      throw new Error(`gh release upload failed:\n${(answer.stderr || answer.stdout).trim()}`);
    this.say("  done");
  }
}


try {
  new Sign(process.argv.slice(2)).make();
}
catch (e) {
  console.error(`\n${e.message}`);
  process.exit(1);
}
