# Seeding and completed download removal

The `seeding-policy` service applies and verifies these settings at startup
and hourly. Failures retry after one minute and make its health check fail.

| Setting | Default |
| --- | --- |
| Upload amount | Ratio 2.0 (upload twice the downloaded amount) |
| Total seeding time | 2880 minutes (2 days) |
| Stop condition | Either limit reached |
| qBittorrent action | Stop, retaining the torrent and its files |
| Completed handling | Enabled in Sonarr, Radarr and Lidarr |
| Removal | Enabled for their active local qBittorrent clients |

Override `SEED_RATIO` and `SEED_TIME_MINUTES` in Portainer. Both must be
positive. Time is qBittorrent's **seeding time**, not wall-clock time since
download. The inactive-seeding limit is disabled so it cannot stop torrents
earlier than this policy. New qBittorrent versions exposing a combination mode
are explicitly configured to match either limit.

The Arr application verifies import and seeding completion before asking
qBittorrent to remove the downloaded copy. Library files remain in place.
Unimported downloads are retained for investigation. Downloads from Mylar,
LazyLibrarian, or added manually inherit the global stop limits, but automatic
removal is not enabled for them by this service.

Explicit per-indexer and per-torrent limits are preserved, including unlimited
seeding and private tracker requirements. Forced seeding can bypass limits.
Review those exceptions in qBittorrent when an older torrent does not stop.
Cleanuparr remains responsible for failed/stalled downloads; do not configure
it to delete successfully downloaded files before their Arr import completes.
There is no disk-pressure deletion of library files or unimported downloads.

The reconciler refuses to enable removal if an Arr client uses another host,
port, an empty category, or a post-import category. It changes no indexers,
categories, client credentials, queue priorities or torrent-specific limits.
Only changed fields are managed; the surrounding API resources are preserved.

## Deployment and verification

Merge through a PR and deploy through Portainer GitOps. If Portainer explicitly
sets `CONFIG_OPS_VERSION`, set it to `2026-09-20.1`; if `CONFIG_OPS_REF` is pinned,
advance it to a commit containing the policy. The config loader downloads both
files before replacing them. The new service has no media filesystem mounts.

From the NAS, preview current drift without changing anything:

```sh
docker exec seeding-policy python /config/seeding.py
docker logs --tail 30 seeding-policy
```

Verify the qBittorrent BitTorrent share limits, then check Completed Download
Handling and Remove Completed in each Arr qBittorrent client. A successful
reconciliation logs `Seeding policy verified.` and updates its health marker.
Inspect a completed torrent through its import and limit transition; manually
stopping a torrent alone does not prove it reached its seeding goal.

The first changed values are retained without credentials in the persistent
`seeding-state` volume. To roll back, stop `seeding-policy`, inspect those JSON
files, and restore the settings through the relevant application UI. Stopping
the reconciler alone does not undo settings already saved by the applications.

References:

- [qBittorrent API](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1))
- [Sonarr completed download handling](https://wiki.servarr.com/sonarr/settings#completed-download-handling)
