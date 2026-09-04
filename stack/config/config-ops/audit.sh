#!/bin/sh
set -eu

failures=0

ok() { printf 'OK: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; failures=$((failures + 1)); }

check_http() {
  name=$1
  url=$2
  if curl -fsS --max-time 15 -o /dev/null "$url"; then
    ok "$name is reachable at $url"
  else
    fail "$name is not reachable at $url"
  fi
}

check_recent_backup() {
  name=$1
  directory=$2
  max_age_days=${BACKUP_MAX_AGE_DAYS:-8}
  if [ ! -d "$directory" ]; then
    fail "$name native backup directory is missing: $directory"
    return
  fi
  if find "$directory" -type f -name '*.zip' -mtime "-$max_age_days" -print -quit | grep -q .; then
    ok "$name has a native backup newer than $max_age_days days"
  else
    fail "$name has no native backup newer than $max_age_days days"
  fi
}

api_json() {
  url=$1
  key=$2
  curl -fsS --max-time 20 -H "X-Api-Key: $key" "$url"
}

check_download_clients() {
  app=$1
  base=$2
  key=$3
  api_version=${4:-v3}
  clients=$(api_json "$base/api/$api_version/downloadclient" "$key") || {
    fail "$app download-client API failed"
    return
  }

  sab=$(printf '%s' "$clients" | jq '[.[] | select(.implementation == "Sabnzbd" and .enable == true)] | length')
  qbit=$(printf '%s' "$clients" | jq '[.[] | select(.implementation == "QBittorrent" and .enable == true)] | length')
  [ "$sab" -ge 1 ] || fail "$app has no enabled SABnzbd client"
  [ "$qbit" -ge 1 ] || fail "$app has no enabled qBittorrent client"

  bad_hosts=$(printf '%s' "$clients" | jq '[.[] | select((.implementation == "Sabnzbd" or .implementation == "QBittorrent") and .enable == true) | .fields[] | select(.name == "host" and (.value != "localhost" and .value != "127.0.0.1"))] | length')
  [ "$bad_hosts" -eq 0 ] || fail "$app download clients must use localhost in the shared Gluetun namespace"

  transmission=$(printf '%s' "$clients" | jq '[.[] | select(.implementation == "Transmission")] | length')
  [ "$transmission" -eq 0 ] || fail "$app still contains a Transmission client"

  [ "$sab" -ge 1 ] && [ "$qbit" -ge 1 ] && [ "$bad_hosts" -eq 0 ] && [ "$transmission" -eq 0 ] && ok "$app clients use SABnzbd and qBittorrent via localhost; Transmission is absent"
}

check_delay_profiles() {
  app=$1
  base=$2
  key=$3
  api_version=${4:-v3}
  profiles=$(api_json "$base/api/$api_version/delayprofile" "$key") || {
    fail "$app delay-profile API failed"
    return
  }

  nzb_first=$(printf '%s' "$profiles" | jq '[.[] | select(.enableUsenet == true and .enableTorrent == true and .usenetDelay == 0 and .torrentDelay > 0)] | length')
  [ "$nzb_first" -ge 1 ] && ok "$app has an NZB-first delay profile" || fail "$app has no profile with zero Usenet delay and a positive torrent delay"
}

check_prowlarr_apps() {
  prowlarr_key=${PROWLARR_API_KEY:-}
  if [ -z "$prowlarr_key" ] && [ -r /prowlarr-config/config.xml ]; then
    prowlarr_key=$(sed -n 's:.*<ApiKey>\([^<]*\)</ApiKey>.*:\1:p' /prowlarr-config/config.xml | head -n 1)
  fi
  if [ -z "$prowlarr_key" ]; then
    fail "Prowlarr API key is unavailable"
    return
  fi

  apps=$(api_json "http://localhost:9696/api/v1/applications" "$prowlarr_key") || {
    fail "Prowlarr applications API failed"
    return
  }
  for expected in Sonarr Radarr Lidarr; do
    count=$(printf '%s' "$apps" | jq --arg app "$expected" '[.[] | select(.implementation == $app)] | length')
    [ "$count" -ge 1 ] && ok "Prowlarr manages $expected" || fail "Prowlarr is missing $expected"
  done
}


check_qbittorrent_vpn_port() {
  preferences=$(curl -fsS --max-time 20 http://localhost:8081/api/v2/app/preferences) || {
    fail "qBittorrent preferences API failed"
    return
  }
  listen_port=$(printf '%s' "$preferences" | jq -r '.listen_port // 0')
  forwarded_port=$(tr -cd '0-9' </gluetun/portfwd 2>/dev/null || true)
  if [ -n "$forwarded_port" ] && [ "$listen_port" = "$forwarded_port" ]; then
    ok "qBittorrent listening port matches Gluetun port forwarding ($listen_port)"
  else
    fail "qBittorrent listening port ($listen_port) does not match Gluetun (${forwarded_port:-unavailable})"
  fi
}

printf 'DVR desired-state audit: %s\n' "$(date -Iseconds)"

country=$(curl -fsS --max-time 20 https://ipinfo.io/country 2>/dev/null | tr -d '\r\n' || true)
if [ "$country" = "${VPN_EXPECTED_COUNTRY:-CH}" ]; then
  ok "shared namespace exits through expected VPN country $country"
else
  fail "VPN country is '${country:-unknown}', expected '${VPN_EXPECTED_COUNTRY:-CH}'"
fi

check_http Prowlarr http://localhost:9696/ping
check_http SABnzbd http://localhost:8080/
check_http qBittorrent http://localhost:8081/api/v2/app/version
check_http Sonarr http://localhost:8989/ping
check_http Radarr http://localhost:7878/ping
check_http Bazarr http://localhost:6767/
check_http Cleanuparr http://localhost:11011/health
check_http Lidarr http://localhost:8686/ping
check_http Mylar http://localhost:8090/
check_http LazyLibrarian http://localhost:5299/
check_http FlareSolverr http://localhost:8191/health
check_http Tautulli http://localhost:8181/status
check_http Seerr http://localhost:5055/api/v1/settings/public
check_http Notifiarr http://localhost:5454/

check_download_clients Sonarr http://localhost:8989 "$SONARR_API_KEY"
check_download_clients Radarr http://localhost:7878 "$RADARR_API_KEY"
check_delay_profiles Sonarr http://localhost:8989 "$SONARR_API_KEY"
check_delay_profiles Radarr http://localhost:7878 "$RADARR_API_KEY"
check_download_clients Lidarr http://localhost:8686 "$LIDARR_API_KEY" v1
check_delay_profiles Lidarr http://localhost:8686 "$LIDARR_API_KEY" v1
check_prowlarr_apps
check_qbittorrent_vpn_port

check_recent_backup Sonarr /sonarr-config/Backups/scheduled
check_recent_backup Radarr /radarr-config/Backups/scheduled
check_recent_backup Lidarr /lidarr-config/Backups/scheduled
check_recent_backup Prowlarr /prowlarr-config/Backups/scheduled

if [ "$failures" -gt 0 ]; then
  printf 'Audit failed with %s finding(s).\n' "$failures" >&2
  exit 1
fi

printf 'Audit passed.\n'
