# Mylar duplicate retention

Enable Mylar's Duplicate Dump Folder before automatic post-processing. The live
destination is `/comics/.mylar-duplicates`; ordinary imports use move mode.

The upstream duplicate handler moves retained files to their original basename.
A later duplicate with the same basename could replace an earlier retained file.
The startup guard gives each retained file its own `retained-*` directory. This
does not copy the comic library or start searches.

`config-ops-sync` supplies the guard in the read-only `mylar-init` volume.
LinuxServer's custom initialization runs it before Mylar starts. The patch is
idempotent and only accepts the known handler. If an upstream update changes the
handler, the guard disables automatic post-processing and preserves the prior
configuration for inspection rather than silently continuing without protection.

Validation includes two same-name incoming duplicates plus an already retained
file, repeat initialization, and an incompatible upstream handler. A successful
connection test does not prove an actual comic import; verify the next real job
separately without launching a bulk search.
