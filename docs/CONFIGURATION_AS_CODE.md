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
