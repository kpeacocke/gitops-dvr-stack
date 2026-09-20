import copy
import json
from pathlib import Path
import tempfile
import unittest

from seeding import desired_preferences, reconcile


class FakeAPI:
    def __init__(self, resources):
        self.resources = copy.deepcopy(resources)
        self.writes = []
        self.ignore_preferences = False

    def request(self, path, method="GET", body=None, form=False):
        if method == "GET":
            return copy.deepcopy(self.resources[path])
        self.writes.append((method, path, copy.deepcopy(body)))
        if path == "/api/v2/app/setPreferences":
            if not self.ignore_preferences:
                self.resources["/api/v2/app/preferences"].update(json.loads(body["json"]))
        elif path.startswith("/downloadclient/"):
            clients = self.resources["/downloadclient"]
            self.resources["/downloadclient"] = [
                copy.deepcopy(body) if c["id"] == body["id"] else c for c in clients
            ]
        else:
            self.resources[path] = copy.deepcopy(body)


class SeedingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name)
        self.desired = desired_preferences({})
        self.qbit = FakeAPI({"/api/v2/app/preferences": {
            **self.desired, "max_ratio_enabled": False,
            "max_seeding_time_enabled": False, "max_ratio_act": 3,
            "listen_port": 54321, "share_limits_mode": "MatchAll",
        }})
        client = {
            "id": 1, "enable": True, "implementation": "QBittorrent",
            "removeCompletedDownloads": False, "priority": 10,
            "fields": [{"name": k, "value": v} for k, v in {
                "host": "localhost", "port": 8081, "tvCategory": "tv",
                "password": "not-a-real-password", "postImportCategory": "",
                "tvImportedCategory": None, "movieImportedCategory": None, "musicImportedCategory": None,
            }.items()],
        }
        self.app = FakeAPI({
            "/config/downloadclient": {"id": 1, "enableCompletedDownloadHandling": False,
                                       "autoRedownloadFailed": True},
            "/downloadclient": [client, {"id": 2, "enable": True, "implementation": "Sabnzbd"}],
        })

    def run_policy(self, apply=True):
        reconcile(self.qbit, [("sonarr", self.app)], self.desired, self.state, apply)

    def test_preview_never_writes(self):
        self.run_policy(False)
        self.assertEqual(self.qbit.writes + self.app.writes, [])
        self.assertEqual(list(self.state.iterdir()), [])

    def test_apply_is_idempotent_and_preserves_unmanaged_fields(self):
        before = copy.deepcopy(self.app.resources["/downloadclient"])
        self.run_policy()
        prefs = self.qbit.resources["/api/v2/app/preferences"]
        self.assertEqual(prefs["max_ratio_act"], 0)
        self.assertEqual(prefs["share_limits_mode"], "MatchAny")
        self.assertEqual(prefs["listen_port"], 54321)
        after = self.app.resources["/downloadclient"]
        self.assertEqual(after[0]["fields"], before[0]["fields"])
        self.assertEqual(after[1], before[1])
        self.assertTrue(after[0]["removeCompletedDownloads"])
        count = len(self.qbit.writes + self.app.writes)
        self.run_policy()
        self.assertEqual(len(self.qbit.writes + self.app.writes), count)
        backups = "".join(p.read_text() for p in self.state.iterdir())
        self.assertNotIn("password", backups)
        self.assertEqual(json.loads((self.state / "qbittorrent.json").read_text())["max_ratio_act"], 3)
        self.assertTrue(all("torrents/" not in path for _, path, _ in self.qbit.writes))

    def test_unverified_stop_settings_never_enable_removal(self):
        self.qbit.ignore_preferences = True
        with self.assertRaises(RuntimeError):
            self.run_policy()
        self.assertEqual(self.app.writes, [])

    def test_unsafe_client_fails_before_any_write(self):
        for field, value in (("host", "other-host"), ("port", 9999),
                             ("tvCategory", ""), ("postImportCategory", "imported"),
                             ("tvImportedCategory", "imported"), ("movieImportedCategory", "imported"),
                             ("musicImportedCategory", "imported")):
            with self.subTest(field=field):
                fields = self.app.resources["/downloadclient"][0]["fields"]
                target = next(f for f in fields if f["name"] == field)
                original = target["value"]
                target["value"] = value
                with self.assertRaises(ValueError):
                    self.run_policy()
                target["value"] = original
                self.assertEqual(self.qbit.writes + self.app.writes, [])

    def test_failure_reading_later_app_does_not_partially_enable_removal(self):
        broken = FakeAPI({})
        with self.assertRaises(KeyError):
            reconcile(self.qbit, [("sonarr", self.app), ("radarr", broken)],
                      self.desired, self.state, True)
        self.assertEqual(self.qbit.writes + self.app.writes, [])

    def test_older_qbittorrent_without_mode(self):
        del self.qbit.resources["/api/v2/app/preferences"]["share_limits_mode"]
        self.run_policy()
        sent = json.loads(self.qbit.writes[0][2]["json"])
        self.assertNotIn("share_limits_mode", sent)

    def test_invalid_limits_fail_closed(self):
        for env in ({"SEED_RATIO": "nan"}, {"SEED_RATIO": "inf"}, {"SEED_RATIO": "0"},
                    {"SEED_TIME_MINUTES": "-1"}, {"SEED_TIME_MINUTES": "1.5"}):
            with self.subTest(env=env), self.assertRaises(ValueError):
                desired_preferences(env)


if __name__ == "__main__":
    unittest.main()
