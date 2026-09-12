# Configuration as Code

The stack separates declarative configuration from persistent application
state. This avoids committing credentials, cookies, tokens, or live SQLite
databases while still detecting drift.

## Managed in Git

- Compose topology, mounts, ports, health checks, permissions, and Gluetun.
- Recyclarr quality profiles and custom formats.
- Inter-application addressing: `localhost:<port>` in the shared Gluetun
  namespace.
- Desired-state assertions in `stack/config/config-ops/audit.sh`.

The `config-ops-sync` one-shot service downloads the versioned audit script to
persistent storage. `config-audit` runs it at startup and every six hours. A
failed audit makes that container unhealthy without interrupting downloads.
Increment `CONFIG_OPS_VERSION` whenever the audit script changes so Compose
recreates both the one-shot sync and the long-running auditor. The equivalent
`RECYCLARR_CONFIG_VERSION` and `KOMETA_CONFIG_VERSION` values force their
one-shot Git template loaders to run after a versioned configuration change.

## Dolby Vision Compatibility

The Samsung TV's Plex app requires HDR10 fallback. All four Git-managed
profiles explicitly score TRaSH's `DV (w/o HDR fallback)` format at `-10000`,
with a minimum custom-format score of `0`: Radarr's HD/UHD Bluray + WEB and
Sonarr's WEB-1080p/WEB-2160p. HDR10 and compatible Dolby Vision are not banned
by this rule; the existing quality and other custom-format rules still apply.

This is acquisition filtering based on release metadata, not a media probe.
The upstream format targets WEB-DL/WEBRip Dolby Vision without an HDR label
and includes upstream Hulu/Flights exceptions. It does not inspect the actual
Dolby Vision profile or prove fallback exists in mislabeled files. Existing
files are not converted, deleted, or automatically searched for replacement.

References:

- [Radarr format](https://github.com/TRaSH-Guides/Guides/blob/master/docs/json/radarr/cf/dv-wo-hdr-fallback.json)
- [Sonarr format](https://github.com/TRaSH-Guides/Guides/blob/master/docs/json/sonarr/cf/dv-wo-hdr-fallback.json)

After merging and redeploying through Portainer:

1. If Portainer explicitly sets `RECYCLARR_CONFIG_VERSION`, update it to
   `2026-09-13.1` so `recyclarr-config` reloads the templates. Otherwise the
   Compose default handles this. A pinned `RECYCLARR_CONFIG_REF` must also
   include the policy change.
2. Wait for `recyclarr-config` to be healthy, then preview and apply from the
   NAS: `docker exec recyclarr recyclarr sync --preview`, followed by
   `docker exec recyclarr recyclarr sync`. Alternatively, wait for the
   configured scheduled sync.
3. Verify the format score is `-10000` and minimum score is `0` in each of
   the four profiles. Confirm the intended movies/series use these profiles.
4. Use an interactive search to check a DV-only WEB release is rejected and
   a DV HDR10 release avoids this penalty. Do not manually grab rejected
   releases. Verify actual playback/fallback for any suspect release.

## Deliberately Not Stored in Git

- API keys, passwords, tracker cookies, VPN credentials, and Plex tokens.
- Application databases and qBittorrent resume data.
- Provider credentials and private indexer definitions.

These belong in Portainer environment variables and the persistent `/config`
bind mounts. The enforceable backup and restore contract is in
[BACKUPS.md](./BACKUPS.md).

## Required Secrets

Portainer must supply `SONARR_API_KEY`, `RADARR_API_KEY`, `LIDARR_API_KEY`,
`PROWLARR_API_KEY`, `NOTIFIARR_API_KEY`, `KOMETA_PLEX_TOKEN`,
`KOMETA_TMDB_APIKEY`, and the existing VPN credentials. `VPN_EXPECTED_COUNTRY`
defaults to `CH` because Gluetun is pinned to Switzerland.

## Run Manually

From Portainer, open the `config-audit` container log. A successful run ends
with `Audit passed.` To force a new run, restart only `config-audit`.

The audit verifies all interactive service endpoints, public reverse-proxy
routes, Swiss VPN egress, Arr health APIs, Prowlarr links and enabled indexers,
absence of Transmission, localhost client addressing, NZB-first delay profiles,
qBittorrent categories and its Gluetun-managed listening port, free space, and
fresh native backups. Public routes deliberately accept authentication responses
(HTTP 401/403) as proof that the proxy and upstream are reachable.
