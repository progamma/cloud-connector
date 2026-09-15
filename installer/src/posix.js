/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

const {spawnSync} = require("child_process");


/**
 * Hands a file or a directory over to the user the connector runs as.
 *
 * The installer runs as root and everything it lays down belongs to root, which is right until
 * somebody asks for --user: from then on the connector is a process that has to write into that
 * tree. `config.json` above all, because the configuration page rewrites it, and the page is the
 * reason installing ends by opening a browser.
 *
 * Nothing to do on Windows, where the service runs as LocalSystem and --user is refused.
 *
 * @param {String} target - What to hand over
 * @param {String} user - User to hand it to
 */
function giveTo(target, user)
{
  if (process.platform === "win32")
    return;
  let answer = spawnSync("chown", ["-R", user, target], {encoding: "utf8"});
  if (answer.error || answer.status !== 0)
    throw new Error(`Could not give ${target} to ${user}: ` +
            `${(answer.stderr || answer.error?.message || "").trim()}. Check that the user exists.`);
}


module.exports = {giveTo};
