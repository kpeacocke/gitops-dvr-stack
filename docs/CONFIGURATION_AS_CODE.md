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

## Deliberately Not Stored in Git

- API keys, passwords, tracker cookies, VPN credentials, and Plex tokens.
- Application databases and qBittorrent resume data.
- Provider credentials and private indexer definitions.

These belong in Portainer environment variables and the persistent `/config`
bind mounts. Back up `${CONFIG_ROOT}` with Synology Hyper Backup. Do not archive
live SQLite files with a naive `tar`; use application-native backups or a
filesystem snapshot so databases are consistent.

## Required Secrets

Portainer must supply `SONARR_API_KEY`, `RADARR_API_KEY`,
`PROWLARR_API_KEY`, and the existing VPN credentials. `VPN_EXPECTED_COUNTRY`
defaults to `CH` because Gluetun is pinned to Switzerland.

## Run Manually

From Portainer, open the `config-audit` container log. A successful run ends
with `Audit passed.` To force a new run, restart only `config-audit`.

The audit verifies service reachability, Swiss VPN egress, Prowlarr links,
absence of Transmission, localhost client addressing, and NZB-first Sonarr and
Radarr delay profiles.
