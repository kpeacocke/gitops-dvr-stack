# Seeding and completed download removal

The `seeding-policy` service applies and verifies these settings at startup
and hourly. Failures retry after one minute and make its health check fail.

| Setting | Default |
| --- | --- |
| Upload amount | Ratio 2.0 (upload twice the downloaded amount) |
| Wall-clock retention | 48 hours after download completion |
| Stop condition | Ratio 2.0 or 48 wall-clock hours after completion |
| qBittorrent action | Stop, retaining the torrent and its files |
| Completed handling | Enabled in Sonarr, Radarr and Lidarr |
| Removal | Enabled for their active local qBittorrent clients |

Override `SEED_RATIO` and `SEED_MAX_AGE_HOURS` in Portainer. Both must be
positive. `SEED_MAX_AGE_HOURS` is measured from qBittorrent's `completion_on`
timestamp, so the default 48 hours is elapsed wall-clock time, not accumulated
seeding time. qBittorrent's native seeding-time and inactive-seeding-time limits
are disabled. The policy stops completed torrents once they reach the wall-clock
cap; the native ratio limit can stop them earlier. At wall-clock expiry the
policy sets the individual ratio limit to zero and verifies it before stopping.
This satisfies Arr's seed-limit check, which stopping alone does not satisfy.
Already-stopped completed torrents are included to recover the existing backlog.
Only categories belonging to validated Arr download clients are eligible.
The policy never calls the torrent deletion API; Arr still verifies successful
import before deleting downloaded data.

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
categories, client credentials, queue priorities. Only eligible expired torrents receive a zero ratio limit.
Only changed fields are managed; the surrounding API resources are preserved.

## Deployment and verification

Merge through a PR and deploy through Portainer GitOps. If Portainer explicitly
sets `CONFIG_OPS_VERSION`, set it to `2026-10-07.3`; if `CONFIG_OPS_REF` is pinned,
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
Inspect a completed torrent through import and expiry. The policy uses
`completion_on`, so a torrent completed 48 hours ago is eligible even if it has
only seeded for a fraction of that time.

The first changed values are retained without credentials in the persistent
`seeding-state` volume. To roll back, stop `seeding-policy`, inspect those JSON
files, and restore the settings through the relevant application UI. Stopping
the reconciler alone does not undo settings already saved by the applications.

References:

- [qBittorrent API](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1))
- [Sonarr completed download handling](https://wiki.servarr.com/sonarr/settings#completed-download-handling)
