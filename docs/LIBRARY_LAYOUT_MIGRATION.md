# Same-share download and library layout

Deploy these mounts only during the coordinated migration below, after the
filesystem switch. A Git deployment alone does not migrate data or change
download categories. Keep the migration PR unmerged until the cutover is ready.

The target is two separate directory trees inside each existing Btrfs share:

| Host share | Arr library root | Download-client category destination |
| --- | --- | --- |
| `TV_PATH` | `/tv/library` | `/tv/downloads` |
| `MOVIES_PATH` | `/movies/library` | `/movies/downloads` |

Sonarr, Radarr and Bazarr retain their parent-share mounts. Download clients
receive only the download subdirectories, plus the existing `/downloads` mount
for queued jobs and other applications. Tdarr's `/tv` and `/movies` mounts use
the library subdirectories. Plex must be
updated separately to bind those same library subdirectories at its existing
container paths. Music, books, comics and manually added downloads retain their
existing paths.

## Preconditions

1. Verify application backups completed, preserve original per-title paths,
   and inventory missing files before making changes. Preserve all credentials.
2. Confirm a synthetic hardlink test succeeds as the application's service UID
   in both shares. Do not infer this from mount names or free-space reports.
3. Inventory all consumers, active jobs and playback. Stop media writers and
   scanners for the filesystem switch. Disable Plex automatic trash emptying.
4. Save a plan outside each media root, with permissions `0600`:
   `python3 scripts/library_layout.py plan /tv > /protected/tv-plan.json`.
   Repeat for `/movies`. Inspect every excluded top-level entry: names beginning
   with `.`, `@` or `#` are intentionally left in place.

## Filesystem and application switch

Run `apply` against each saved journal with `--writers-stopped`. The helper
renames title directories within the same filesystem and creates relative
compatibility symlinks at the old paths. It never copies or deletes media.
The helper rejects changed source identities and destination collisions. A
failed run must be inspected, then resumed using the same journal.

Before restarting scanners, update Plex and Tdarr mounts to the new library
directories so they cannot scan both the compatibility links and `library/`.
Keep Arr/Bazarr parent-share mounts. Add the new Arr roots and update title
paths without requesting a second file move. Preserve quality profiles,
monitoring flags, tags and all other settings. Compare every path with the
saved inventory; pre-existing missing paths must be distinguished from new
failures. Remove obsolete Arr root entries only after no titles refer to them.

Create sibling `downloads` directories writable by the download-client UID.
Change only the Sonarr/Radarr category destinations after their library roots
are switched. Do not relocate existing queued jobs. Retain `/downloads` and
all old data. Verify the new category paths through the client and Arr APIs.

Finally, verify a real imported download has the same device and inode as its
seeding copy. Keep retention at 48 hours since completion or ratio 2. Native
seeding-hour timers stay disabled. Removal remains gated on successful import.

## Recovery

Stop writers before recovery. Restore application paths and mounts from the
saved configuration. `rollback` with the same journal and `--writers-stopped`
removes only verified compatibility symlinks and renames the original title
directories back. It preserves files added inside those titles after the
migration. It refuses rollback if new title directories have appeared in the
new library; those need a separately reviewed plan. Do not delete either tree
to resolve a collision. Keep journals and backups until end-to-end validation.

This is a reversible path migration, not an off-device backup. Existing backup
and storage-capacity requirements still apply.
