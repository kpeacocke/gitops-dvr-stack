"""Exercise functional failures with fixture responses, never live services."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

FUNCTIONS = Path(__file__).with_name('audit.sh').read_text().split("printf 'DVR desired-state audit:", 1)[0]


class AuditTests(unittest.TestCase):
    def check(self, setup, command, source=FUNCTIONS):
        return subprocess.run(['sh', '-c', source + '\n' + setup + '\n' + command + '\nexit "$failures"'], text=True, capture_output=True)

    def test_health_warnings_fail(self):
        for payload, expected in [([{'type': 'warning'}], 1), ([{'type': 'error'}], 1), ([], 0)]:
            result = self.check("api_json() { printf '%s' '" + json.dumps(payload) + "'; }", 'check_arr_health Sonarr http://fixture unused')
            self.assertEqual(result.returncode, expected, result.stderr)

    def test_library_access(self):
        for payload, expected in [([], 1), ([{'accessible': False}], 1), ([{'accessible': True}], 0)]:
            result = self.check("api_json() { printf '%s' '" + json.dumps(payload) + "'; }", 'check_arr_roots Lidarr http://fixture unused v1')
            self.assertEqual(result.returncode, expected, result.stderr)

    def test_low_percentage_on_large_disk_fails(self):
        setup = "df() { printf 'Filesystem Blocks Used Available Capacity Mounted\\nfixture 10000000000 9300000000 700000000 93%% /downloads\\n'; }"
        result = self.check(setup, 'check_free_space /downloads')
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('7% free', result.stderr)

    def test_public_route_verifies_tls_without_claiming_app_health(self):
        setup = "curl() { case \" $* \" in *' -k'*|*'--insecure'*) return 1;; esac; printf 403; }"
        result = self.check(setup, 'check_public_http fixture https://fixture')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('transport only', result.stdout)

    def test_kometa_completion_is_not_enough(self):
        cases = [('[ERROR] Plex failed\nFinished Daily Run\n', 1010, 1), ('Finished Daily Run\n', 200000, 1), ('Finished Daily Run\n', 1010, 0), ('Starting run\n', 1010, 0), ('Starting run\n', 6000, 1)]
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / 'meta.log'
            source = FUNCTIONS.replace('log=/kometa-config/logs/meta.log', 'log=' + str(log))
            for content, now, expected in cases:
                log.write_text(content)
                result = self.check('stat() { printf 1000; }; date() { printf ' + str(now) + '; };', 'check_kometa_last_run', source)
                self.assertEqual(result.returncode, expected, result.stderr)


if __name__ == '__main__':
    unittest.main()
