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

check_public_http() {
  name=$1
  url=$2
  code=$(curl -ksS -L --max-time 20 -o /dev/null -w '%{http_code}' "$url" || true)
  case "$code" in
    200|204|301|302|303|307|308|401|403)
      ok "$name public route responded with HTTP $code"
      ;;
    *)
      fail "$name public route returned HTTP ${code:-unavailable}: $url"
      ;;
  esac
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

check_free_space() {
  directory=$1
  minimum_gib=${MIN_FREE_SPACE_GIB:-500}
  available_kib=$(df -Pk "$directory" | awk 'NR == 2 { print $4 }')
  minimum_kib=$((minimum_gib * 1024 * 1024))
  if [ "${available_kib:-0}" -ge "$minimum_kib" ]; then
    available_gib=$((available_kib / 1024 / 1024))
    ok "$directory has ${available_gib} GiB free (minimum ${minimum_gib} GiB)"
  else
    available_gib=$((${available_kib:-0} / 1024 / 1024))
    fail "$directory has only ${available_gib} GiB free (minimum ${minimum_gib} GiB)"
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

check_arr_health() {
  app=$1
  base=$2
  key=$3
  api_version=${4:-v3}
  health=$(api_json "$base/api/$api_version/health" "$key") || {
    fail "$app health API failed"
    return
  }
  errors=$(printf '%s' "$health" | jq '[.[] | select((.type // "") | ascii_downcase == "error")] | length')
  [ "$errors" -eq 0 ] && ok "$app reports no health errors" || fail "$app reports $errors health error(s)"
}

check_prowlarr_indexers() {
  key=${PROWLARR_API_KEY:-}
  minimum=${MIN_ENABLED_INDEXERS:-1}
  indexers=$(api_json "http://localhost:9696/api/v1/indexer" "$key") || {
    fail "Prowlarr indexer API failed"
    return
  }
  enabled=$(printf '%s' "$indexers" | jq '[.[] | select(.enable == true)] | length')
  [ "$enabled" -ge "$minimum" ] && ok "Prowlarr has $enabled enabled indexer(s)" || fail "Prowlarr has $enabled enabled indexer(s), expected at least $minimum"
}

check_qbittorrent_categories() {
  categories=$(curl -fsS --max-time 20 http://localhost:8081/api/v2/torrents/categories) || {
    fail "qBittorrent categories API failed"
    return
  }

  for spec in "Sonarr|http://localhost:8989|$SONARR_API_KEY|v3" "Radarr|http://localhost:7878|$RADARR_API_KEY|v3" "Lidarr|http://localhost:8686|$LIDARR_API_KEY|v1"; do
    old_ifs=$IFS
    IFS='|'
    set -- $spec
    IFS=$old_ifs
    app=$1 base=$2 key=$3 api_version=$4
    clients=$(api_json "$base/api/$api_version/downloadclient" "$key") || {
      fail "$app download-client API failed while checking categories"
      continue
    }
    # Current Arr releases use media-specific names (tvCategory,
    # movieCategory, musicCategory) rather than the legacy category field.
    category=$(printf '%s' "$clients" | jq -r '[.[] | select(.implementation == "QBittorrent" and .enable == true) | .fields[] | select(.name | test("^(tv|movie|music)Category$")) | .value][0] // empty')
    if [ -z "$category" ]; then
      fail "$app qBittorrent category is empty"
    elif printf '%s' "$categories" | jq -e --arg category "$category" 'has($category)' >/dev/null; then
      ok "$app qBittorrent category exists: $category"
    else
      fail "$app qBittorrent category is missing: $category"
    fi
  done
}

check_seerr_initialized() {
  settings=$(curl -fsS --max-time 20 http://localhost:5055/api/v1/settings/public) || {
    fail "Seerr public-settings API failed"
    return
  }
  initialized=$(printf '%s' "$settings" | jq -r '.initialized // false')
  [ "$initialized" = true ] && ok "Seerr setup is initialized" || fail "Seerr setup is not initialized"
}

check_tautulli_configured() {
  config=/tautulli-config/config.ini
  if [ ! -r "$config" ]; then
    fail "Tautulli config is unavailable"
    return
  fi
  first_run=$(sed -n 's/^first_run = //p' "$config" | head -n 1 | tr -d ' "')
  username=$(sed -n 's/^http_username = //p' "$config" | head -n 1 | tr -d ' "')
  token=$(sed -n 's/^pms_token = //p' "$config" | head -n 1 | tr -d ' "')
  pms_ip=$(sed -n 's/^pms_ip = //p' "$config" | head -n 1 | tr -d ' "')
  [ "$first_run" = 0 ] && [ -n "$username" ] && [ -n "$token" ] && [ "$pms_ip" != 127.0.0.1 ] && [ "$pms_ip" != localhost ] &&
    ok "Tautulli is secured and linked to a non-local Plex server" ||
    fail "Tautulli setup, authentication, or Plex linkage is incomplete"
}

check_kometa_last_run() {
  log=/kometa-config/logs/meta.log
  if [ ! -r "$log" ]; then
    fail "Kometa log is unavailable; no successful run can be proven"
    return
  fi
  recent=$(tail -n 1500 "$log")
  if printf '%s' "$recent" | grep -q 'Config Error:'; then
    fail "Kometa's recent log contains a configuration error"
  elif printf '%s' "$recent" | grep -q 'Finished .* Run'; then
    ok "Kometa has a recent completed run without configuration errors"
  else
    fail "Kometa has no recent completed run"
  fi
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
check_arr_health Sonarr http://localhost:8989 "$SONARR_API_KEY"
check_arr_health Radarr http://localhost:7878 "$RADARR_API_KEY"
check_arr_health Lidarr http://localhost:8686 "$LIDARR_API_KEY" v1
check_arr_health Prowlarr http://localhost:9696 "$PROWLARR_API_KEY" v1
check_prowlarr_apps
check_prowlarr_indexers
check_qbittorrent_vpn_port
check_qbittorrent_categories
check_seerr_initialized
check_tautulli_configured
check_kometa_last_run
check_free_space /downloads

check_recent_backup Sonarr /sonarr-config/Backups
check_recent_backup Radarr /radarr-config/Backups
check_recent_backup Lidarr /lidarr-config/Backups
check_recent_backup Prowlarr /prowlarr-config/Backups

public_domain=${PUBLIC_BASE_DOMAIN:-ambitiouscake.com}
public_services=${PUBLIC_SERVICE_NAMES:-"prowlarr sabnzbd qbittorrent sonarr radarr bazarr lidarr mylar lazylibrarian cleanuparr tautulli seerr notifiarr uptime plex"}
for service in $public_services; do
  check_public_http "$service" "https://$service.$public_domain"
done

if [ "$failures" -gt 0 ]; then
  printf 'Audit failed with %s finding(s).\n' "$failures" >&2
  exit 1
fi

printf 'Audit passed.\n'
