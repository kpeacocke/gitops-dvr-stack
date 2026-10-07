#!/usr/bin/env python3
"""Reconcile torrent retention; Arr owns removal after successful import.

qBittorrent stops at the configured ratio. This policy additionally stops
completed torrents after a wall-clock age measured from qBittorrent's
completion_on timestamp. At expiry it sets an attained per-torrent ratio
limit before stopping, so Arr can remove successfully imported downloads.
The policy never deletes torrent data itself.
"""

import argparse
import json
import math
import os
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import Request, build_opener, ProxyHandler


class API:
    def __init__(self, base, key=None):
        self.base = base
        self.headers = {"X-Api-Key": key} if key else {}
        self.opener = build_opener(ProxyHandler({}))

    def request(self, path, method="GET", body=None, form=False):
        headers = dict(self.headers)
        data = None
        if body is not None:
            data = (urlencode(body) if form else json.dumps(body)).encode()
            headers["Content-Type"] = (
                "application/x-www-form-urlencoded" if form else "application/json"
            )
        request = Request(self.base + path, data=data, headers=headers, method=method)
        with self.opener.open(request, timeout=30) as response:
            raw = response.read()
        return json.loads(raw) if raw and not form else None


def desired_preferences(env):
    ratio = float(env.get("SEED_RATIO", "2.0"))
    if not math.isfinite(ratio) or ratio <= 0:
        raise ValueError("Seed ratio must be finite and positive")
    return {
        "max_ratio_enabled": True,
        "max_ratio": ratio,
        # qBittorrent's native time limit counts seeding time, not elapsed
        # wall-clock time. Disable it; wall-clock expiry is enforced below.
        "max_seeding_time_enabled": False,
        "max_inactive_seeding_time_enabled": False,
        "max_ratio_act": 0,  # Stop; Arr owns removal after verified import.
    }


def max_age_seconds(env):
    hours = float(env.get("SEED_MAX_AGE_HOURS", "48"))
    if not math.isfinite(hours) or hours <= 0:
        raise ValueError("SEED_MAX_AGE_HOURS must be finite and positive")
    return int(hours * 3600)


def changes(current, desired):
    return {key: value for key, value in desired.items() if current.get(key) != value}


def save_original(state_dir, name, value):
    """Keep only managed fields, with no credentials, for manual rollback."""
    state_dir.mkdir(parents=True, exist_ok=True)
    path = state_dir / (name + ".json")
    if not path.exists():
        with path.open("x", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)


def expired_completed_torrents(qbit, age_seconds, categories, now=None):
    """Return completed torrents older than the wall-clock retention period."""
    now = time.time() if now is None else now
    torrents = qbit.request("/api/v2/torrents/info")
    expired = []
    for torrent in torrents:
        if torrent.get("category") not in categories:
            continue
        completion_on = int(torrent.get("completion_on") or 0)
        if completion_on <= 0 or float(torrent.get("progress") or 0) < 1:
            continue
        # A forced torrent is an explicit operator override.
        if torrent.get("force_start") or torrent.get("state") == "forcedUP":
            continue
        # Never alter explicit tracker/operator limits. Zero is our already
        # expired marker, permitting a retry if stopping previously failed.
        if torrent.get("ratio_limit") not in (-2, 0):
            continue
        if any(torrent.get(k) != -2 for k in (
            "seeding_time_limit", "inactive_seeding_time_limit"
        )):
            continue
        if torrent.get("state") not in ("uploading", "stalledUP", "queuedUP", "stoppedUP", "pausedUP"):
            continue
        if now - completion_on >= age_seconds:
            expired.append(torrent)
    return expired


def stop_expired_torrents(qbit, age_seconds, categories, state_dir, apply=False, now=None):
    expired = expired_completed_torrents(qbit, age_seconds, categories, now)
    if not expired:
        print("qBittorrent: no completed torrents exceed wall-clock retention", flush=True)
        return []
    print(
        f"qBittorrent: {len(expired)} completed torrent(s) exceed "
        f"{age_seconds // 3600}h wall-clock retention",
        flush=True,
    )
    for torrent in expired:
        torrent_hash = torrent["hash"]
        if len(torrent_hash) != 40 or any(c not in "0123456789abcdef" for c in torrent_hash):
            raise ValueError("Invalid torrent hash")
        print(f"qBittorrent: expiry {torrent_hash} category={torrent['category']} "
              f"ratio={torrent.get('ratio')} state={torrent['state']}; Arr owns import verification/removal",
              flush=True)
        if not apply:
            continue
        if torrent["ratio_limit"] != 0:
            save_original(state_dir, "torrent-" + torrent_hash, {
                k: torrent[k] for k in ("hash", "ratio_limit", "seeding_time_limit", "inactive_seeding_time_limit")
            })
            # Stopping alone leaves Sonarr's HasReachedSeedLimit false.
            # Zero makes that gate true; Arr still checks successful import.
            qbit.request("/api/v2/torrents/setShareLimits", "POST", {
                "hashes": torrent_hash, "ratioLimit": 0,
                "seedingTimeLimit": -2, "inactiveSeedingTimeLimit": -2,
            }, form=True)
        actual = qbit.request("/api/v2/torrents/info?" + urlencode({"hashes": torrent_hash}))
        if not actual:  # Arr may already have removed a previously stopped item.
            continue
        if len(actual) != 1 or actual[0].get("hash") != torrent_hash or actual[0].get("ratio_limit") != 0:
            raise RuntimeError("Torrent expiry limit verification failed")
        current = actual[0]
        if current.get("category") != torrent["category"] or current.get("force_start") or current.get("state") == "forcedUP":
            raise RuntimeError("Torrent ownership or operator override changed during expiry")
        if current.get("state") not in ("stoppedUP", "pausedUP"):
            qbit.request("/api/v2/torrents/stop", "POST", {"hashes": torrent_hash}, form=True)
    return expired


def reconcile(qbit, apps, desired, state_dir, age_seconds, apply=False, now=None):
    # Read/validate every target before enabling any removal settings.
    preferences = qbit.request("/api/v2/app/preferences")
    missing = set(desired) - preferences.keys()
    if missing:
        raise ValueError("qBittorrent lacks required preference fields")
    desired = dict(desired)
    if "share_limits_mode" in preferences:
        desired["share_limits_mode"] = "MatchAny"

    plans = []
    for name, api in apps:
        config = api.request("/config/downloadclient")
        if "enableCompletedDownloadHandling" not in config:
            raise ValueError(f"{name}: missing completed download handling setting")
        clients = api.request("/downloadclient")
        clients = [c for c in clients if c.get("enable") and c.get("implementation") == "QBittorrent"]
        if not clients:
            raise ValueError(f"{name}: no enabled qBittorrent client")
        for client in clients:
            fields = {f["name"]: f.get("value") for f in client["fields"]}
            if fields.get("host") not in ("localhost", "127.0.0.1") or int(fields.get("port", 0)) != 8081:
                raise ValueError(f"{name}: qBittorrent client does not target local port 8081")
            if any(fields.get(k) for k in (
                "postImportCategory", "tvImportedCategory", "movieImportedCategory", "musicImportedCategory"
            )):
                raise ValueError(f"{name}: post-import category prevents safe completed removal")
            if not any(fields.get(k) for k in ("tvCategory", "movieCategory", "musicCategory")):
                raise ValueError(f"{name}: empty torrent category")
            if "removeCompletedDownloads" not in client:
                raise ValueError(f"{name}: missing completed removal setting")
        plans.append((name, api, config, clients))

    delta = changes(preferences, desired)
    print(f"qBittorrent: {len(delta)} preference change(s)", flush=True)
    if delta and apply:
        save_original(state_dir, "qbittorrent", {k: preferences[k] for k in desired})
        qbit.request("/api/v2/app/setPreferences", "POST", {"json": json.dumps(desired)}, form=True)
        if changes(qbit.request("/api/v2/app/preferences"), desired):
            raise RuntimeError("qBittorrent preference verification failed; removal was not enabled")

    for name, api, config, clients in plans:
        if not config["enableCompletedDownloadHandling"]:
            print(f"{name}: enable completed download handling", flush=True)
            if apply:
                save_original(state_dir, name + "-handling", {
                    "enableCompletedDownloadHandling": config["enableCompletedDownloadHandling"]
                })
                config["enableCompletedDownloadHandling"] = True
                api.request("/config/downloadclient", "PUT", config)
        for client in clients:
            if not client["removeCompletedDownloads"]:
                print(f"{name}: enable imported-download removal for client {client['id']}", flush=True)
                if apply:
                    save_original(state_dir, f"{name}-client-{client['id']}", {
                        "id": client["id"], "removeCompletedDownloads": False
                    })
                    client["removeCompletedDownloads"] = True
                    api.request(f"/downloadclient/{client['id']}", "PUT", client)
        if apply:
            if not api.request("/config/downloadclient")["enableCompletedDownloadHandling"]:
                raise RuntimeError(f"{name}: download handling verification failed")
            actual = {c["id"]: c for c in api.request("/downloadclient")}
            if any(not actual[c["id"]]["removeCompletedDownloads"] for c in clients):
                raise RuntimeError(f"{name}: removal setting verification failed")

    categories = set()
    for _, _, _, clients in plans:
        for client in clients:
            categories.update(f["value"] for f in client["fields"]
                              if f["name"] in ("tvCategory", "movieCategory", "musicCategory") and f.get("value"))
    # Attain the seed-limit gate, including for the already-stopped backlog.
    # Arr retains responsibility for import checks and deletion.
    stop_expired_torrents(qbit, age_seconds, categories, state_dir, apply, now)
    print("Seeding policy verified." if apply else "Seeding policy preview complete.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write and verify settings; default is preview")
    parser.add_argument("--loop", action="store_true", help="Reconcile every hour; retry failures in 60 seconds")
    args = parser.parse_args()
    if args.loop and not args.apply:
        parser.error("--loop requires --apply")

    desired = desired_preferences(os.environ)
    age_seconds = max_age_seconds(os.environ)
    apps = []
    for name, port, version in (("sonarr", 8989, "v3"), ("radarr", 7878, "v3"), ("lidarr", 8686, "v1")):
        key = os.environ.get(name.upper() + "_API_KEY")
        if not key:
            raise ValueError(f"{name}: API key is missing")
        apps.append((name, API(f"http://127.0.0.1:{port}/api/{version}", key)))

    marker = Path("/tmp/seeding-ok")
    while True:
        success = False
        try:
            reconcile(
                API("http://127.0.0.1:8081"),
                apps,
                desired,
                Path("/state"),
                age_seconds,
                args.apply,
            )
            if args.apply:
                marker.touch()
            success = True
        except Exception as exc:
            marker.unlink(missing_ok=True)
            print(f"Seeding policy failed: {type(exc).__name__}: {exc}", flush=True)
            if not args.loop:
                raise SystemExit(1) from None
        if not args.loop:
            return
        time.sleep(3600 if success else 60)


if __name__ == "__main__":
    main()
