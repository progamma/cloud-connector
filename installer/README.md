# Cloud Connector installer

One executable per platform that installs the Cloud Connector, updates an installation that is
already there, and hands over to the connector's own configuration page for the rest.

It carries everything it needs: the Node.js runtime, the connector, its modules. Nothing is
downloaded, so it works on a machine with no network and no Node.js of its own.

## What it does

1. Lays down the runtime and the connector under the install directory
2. On a fresh install, generates the password key and puts it where the service will read it
3. Registers the connector as a service that starts with the machine
4. Leaves a copy of itself behind, so that there is still a way to update or remove the connector
   once the file that was downloaded has been deleted — and on Windows, puts the connector in the
   list of installed programs, pointing at that copy
5. Starts it, and opens the configuration page

On an installation that is already there it does the same, except that it **keeps `config.json`
and the key**: what it replaces is the code.

Run it with no arguments and it asks where to install and which port the page should answer on,
then waits before closing, because a console window that vanishes takes the reason with it. Pass
an argument and it asks nothing.

## The password key

`config.json` says `"passwordPrivateKey": "%CC_KEY%"`, and `CC_KEY` is set for the service and for
nothing else: in `<install dir>\service\cloudconnector.xml` on Windows, readable by administrators
alone, and in `<install dir>/cc.env` on Linux and macOS, readable by root and by the account the
service runs as, which is root unless `--user` said otherwise. There is nothing
to set by hand, and it should not be set as a system environment variable either: every user and
every process of the machine would read it, and the key with `config.json` is every database
password in clear.

```
cc-installer --show-key
```

prints it. That is the way to keep a copy before an uninstall, which takes the key away with the
service. Putting it back after reinstalling in the same directory takes two things, because the
new installation starts from an empty configuration of its own and does not read the one that was
kept:

1. copy `<install dir>/config.json`, the one the uninstall kept, over
   `<install dir>/public_html/config.json`
2. put the copy of the key in place of the new one, in the file named above

Then restart the service, and the stored passwords open again.

## Removing it

```
cc-installer --uninstall
```

There is no `--dir` to get right: which installation this is about is read from the service, which
knows where it was registered from. Passing a `--dir` that says otherwise is refused, and told
where the connector actually is.

It stops the service, unregisters it, takes the entry out of the list of installed programs, and
deletes what was installed — keeping `config.json`, which it moves up into the installation
directory. That file is the one thing in there nobody else can write again: the remote servers,
the IDE users, the datamodels and their passwords are all in it, and an uninstall is often a step
in putting the same connector back.

What is left is that file and the copy of the installer, which cannot delete itself while it is
running. It says so, and the folder is the operator's to remove.

On Windows the same thing happens from Settings → Installed apps, which is what step 4 above is for.

## What it deliberately does not do

**It has no configuration screens of its own.** The connector serves a configuration page on the
loopback interface, and that page already writes the whole of `config.json`: name, remote servers,
IDE users, datamodels with a connection test, shared file systems, plugins. The installer's job is
the part that comes before the page and that the page cannot do for itself.

**It cannot install what is not a Node module.** On Linux and macOS the ODBC driver manager
(`unixODBC`) is a system package, and so is the ODBC driver of each database; the Oracle Instant
Client is one too, for Thick mode.

Of those it checks for `unixODBC` alone, and says how to install it. The other two it cannot look
for: which ODBC driver is needed depends on which database each datamodel points at, and neither
is known before the configuration page has been filled in. They are named here and in the note the
installer prints, so that their absence is read as a missing package and not as a broken connector.

For Thick mode, `ORACLE_INSTANT_CLIENT_DIR` has to be set before the connector starts, which for a
service means the service definition. Put it in `<install dir>/cc.env` on Linux and macOS, or in
`<install dir>/service/cloudconnector.xml` as another `<env>` on Windows: an update reads what is
there and writes it back, so it survives.

A value with a space in it needs quoting in `cc.env` — `ORACLE_INSTANT_CLIENT_DIR='/opt/oracle/instant
client'` — and the installer writes it that way itself. Without the quotes the line is read as an
assignment followed by a command and the variable is quietly never set, which is the kind of thing
that is only noticed when a datamodel fails to connect.

## Layout it creates

```
<install dir>/
  runtime/          the Node.js it carries
  public_html/      the connector, its modules, and config.json
```

`config.json` keeps `"passwordPrivateKey": "%CC_KEY%"`: the key itself lives with the service
definition, not beside the passwords it protects.

## Building it

### All four at once

The `Installer` workflow builds Windows x64, Linux x64, macOS x64 and macOS arm64, each on its own
runner, and signs them. Run it from the Actions tab, or publish a release and let that run it: in
that case the installers are attached to the release as they are built.

That is the way to get the installers for the other platforms. **There is no cross build**, and
there is no flag to ask for one: the payload carries native modules that `npm` resolves for the
machine it runs on, so a Linux installer can only be built on Linux.

### One, on the machine you are sitting at

```
cd installer
npm ci
node build/build.js
```

Out comes `build/out/cc-installer.exe`, or `build/out/cc-installer` everywhere else. Unsigned:
signing happens in the workflow, where the certificates are.

It needs Node.js (any recent one — the runtime that ends up in the payload is downloaded, not this
one), git, and the network. It takes a few minutes, most of it `npm ci` for the connector.

Two flags for going round the loop rather than for releasing:

- `--payload-only` stops after assembling the payload
- `--executable-only` reuses the payload that is already built, and only rebuilds the executable
  around it — seconds instead of minutes, when what changed is the installer and not the connector
- `--node <version>` builds against a different Node.js than the one pinned in `build.js`

A build with no flags always starts by throwing the previous one away, so what comes out of a
release is made of what is in the tree and nothing that was lying about.

### Why there is no cross build

`odbc` and `@node-rs/crc32` are native. `npm` picks their binary from the platform and
architecture it is running on: `@node-rs/crc32` resolves to a different package per platform, and
`odbc` fetches a prebuilt binary for the one it finds itself on. Assembling all four payloads on
one machine would produce three of them carrying the wrong binary, and nothing would say so until
an operator somewhere opened an ODBC datamodel.

`oracledb` is not like that — it ships every platform's binary in one package — so it is those two
that decide this, not Oracle.

### What the file says it is, on Windows

A single executable is a copy of `node.exe`, and a copy carries `node.exe`'s resources. Left
alone, the Properties of the installer read "Node.js JavaScript Runtime", published by "Node.js",
originally called `node.exe`, and Explorer draws it with the Node icon — which is also what the
list of installed programs would show.

The build rewrites them with `rcedit`, using `build/icon.ico` and the connector's own version out
of `public_html/package.json`. **It does this before injecting the blob**: rcedit moves everything
after the resource section, and on a file with 47 MB appended it does not finish in any useful
time. On the bare runtime it takes under two seconds.

Nothing of the sort exists on Linux, and on macOS it would be an `Info.plist` inside an
application bundle, which a bare executable is not.

### On Windows, the service wrapper

The build needs `build/vendor/winsw.exe` to produce a complete installer. Without it, it says so
and carries on: what comes out lays the connector down and then refuses to register the service.
See `build/vendor/README.md`.
