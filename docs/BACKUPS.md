# Backup and Restore Contract

The Docker Compose stack defines persistent state; Synology Hyper Backup owns
the actual off-host copy. Do not use a tar job against live SQLite databases.

## Required Hyper Backup task

- Source: the entire `${CONFIG_ROOT}` directory (`/volume1/dkrcfg` by default).
- Destination: storage outside this NAS, encrypted before upload.
- Schedule: daily, after 06:00 Australia/Sydney so the applications' scheduled
  backups and the 05:00 Kometa run have completed.
- Retention: Smart Recycle plus at least 30 daily, 12 monthly, and 3 yearly
  versions.
- Integrity: enable backup integrity checks and notifications.

## Application-native backups

Sonarr, Radarr, Lidarr, and Prowlarr must retain scheduled backups every seven
days for 28 days. The `config-audit` service mounts those four config trees
read-only and becomes unhealthy if no ZIP is newer than
`BACKUP_MAX_AGE_DAYS` (8 by default).

Tautulli's database backups, Seerr, Bazarr, qBittorrent state, Notifiarr, Kometa,
Recyclarr, and the remaining application state are protected by the daily
Hyper Backup task and Synology filesystem snapshots. Configure daily snapshots
on `/volume1/dkrcfg` where supported.

## Restore drill

Quarterly, restore `${CONFIG_ROOT}` to a temporary directory, verify that the
four native backup ZIPs open, and record the result. Stop the affected
container before replacing its live config directory during a real restore.
