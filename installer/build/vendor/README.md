# Third party binaries that go inside what we sign

## winsw.exe — the Windows service wrapper

Windows will not run `node cloudServer.js` as a service. A service has to answer the Service
Control Manager within seconds of starting and keep answering it, and Node has no way to; a
service registered with `sc.exe create` straight onto the runtime fails to start, every time.
What stands in between is a wrapper that is a proper service to the SCM and a parent process to
the connector.

winsw is that wrapper. It is what `node-windows` uses underneath, so choosing it directly is one
dependency fewer rather than one more, and it is driven by a single XML file, which is what lets
the installer write the whole service definition — the key included — without a Windows API.

**It is not downloaded by the build.** It is committed here, because it ends up inside an
executable that Pro Gamma signs: a binary fetched at build time is a binary we would be vouching
for without having looked at it. Updating it is a commit like any other, and gets reviewed.

### What is here

| File | Where it came from | SHA-256 |
|------|--------------------|---------|
| `winsw.exe` | `WinSW.NET461.exe` from [winsw v2.12.0](https://github.com/winsw/winsw/releases/tag/v2.12.0), renamed | `b5066b7bbdfba1293e5d15cda3caaea88fbeab35bd5b38c41c913d492aadfc4f` |
| `winsw.LICENSE.txt` | `LICENSE.txt` at the same tag | |

winsw publishes no checksums of its own, so the one above is what the downloaded file hashes to.
It is here to catch the file changing, not to prove where it came from.

**Why the 641 KB build and not the 17 MB one.** The release offers `WinSW-x64.exe`, which carries
a whole .NET runtime, and `WinSW.NET461.exe`, which uses the .NET Framework that every Windows 10
and 11 already has. There is nothing to gain from bringing a second runtime along.

**Why v2.12.0 and not v3.** The v3 line has been in alpha since 2021 and the last one is from
January 2023. v2.12.0 is the newest release that is not.

### If it is not here

`node build/build.js` says so and carries on: what comes out lays the connector down and then
refuses to register the service, saying why, before it has moved anything. Useful for looking at,
not for installing with. Linux and macOS need nothing here at all — systemd and launchd run a
plain process, and the installer writes their definitions itself.
