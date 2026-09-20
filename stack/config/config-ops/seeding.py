#!/usr/bin/env python3
"""Reconcile seed limits; Arr owns removal after successful import.

Only preferences and download-handling settings are written. This program
never deletes torrents/files or rewrites per-torrent/indexer share limits.
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
        # These endpoints are all inside the shared VPN namespace.
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
    minutes = int(env.get("SEED_TIME_MINUTES", "2880"))
    if not math.isfinite(ratio) or ratio <= 0 or minutes <= 0:
        raise ValueError("Seed ratio and time must be finite and positive")
    return {
        "max_ratio_enabled": True,
        "max_ratio": ratio,
        "max_seeding_time_enabled": True,
        "max_seeding_time": minutes,
        "max_inactive_seeding_time_enabled": False,
        "max_ratio_act": 0,  # Stop; never remove before Arr imports.
    }


def changes(current, desired):
    return {key: value for key, value in desired.items() if current.get(key) != value}


def save_original(state_dir, name, value):
    """Keep only managed fields, with no credentials, for manual rollback."""
    state_dir.mkdir(parents=True, exist_ok=True)
    path = state_dir / (name + ".json")
    if not path.exists():
        with path.open("x", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)


def reconcile(qbit, apps, desired, state_dir, apply=False):
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
    print("Seeding policy verified." if apply else "Seeding policy preview complete.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write and verify settings; default is preview")
    parser.add_argument("--loop", action="store_true", help="Reconcile every hour; retry failures in 60 seconds")
    args = parser.parse_args()
    if args.loop and not args.apply:
        parser.error("--loop requires --apply")
    desired = desired_preferences(os.environ)
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
            reconcile(API("http://127.0.0.1:8081"), apps, desired, Path("/state"), args.apply)
            if args.apply:
                marker.touch()
            success = True
        except Exception as exc:
            marker.unlink(missing_ok=True)
            # Never print response bodies or request headers containing credentials.
            print(f"Seeding policy failed: {type(exc).__name__}: {exc}", flush=True)
            if not args.loop:
                raise SystemExit(1) from None
        if not args.loop:
            return
        time.sleep(3600 if success else 60)


if __name__ == "__main__":
    main()
