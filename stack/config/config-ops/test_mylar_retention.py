import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import configparser

spec = importlib.util.spec_from_file_location('retention', Path(__file__).with_name('mylar-retention.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

FIXTURE = '''import os, shutil
class Processor:
    def duplicate_process(self, dupeinfo):
        path_to_move, dump_folder, file_to_move = dupeinfo
        shutil.move(path_to_move, os.path.join(dump_folder, file_to_move))
'''


class RetentionTests(unittest.TestCase):
    def test_same_name_duplicates_preserve_both_files_and_existing_retention(self):
        namespace = {}
        exec(guard.guarded_source(FIXTURE), namespace)
        processor = namespace['Processor']()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            retained = root / 'retained'
            retained.mkdir()
            (retained / 'issue.cbz').write_bytes(b'previous retained original')
            for name, contents in [('first', b'first original'), ('second', b'second original')]:
                source = root / name
                source.write_bytes(contents)
                processor.duplicate_process((str(source), str(retained), 'issue.cbz'))
            self.assertEqual(sorted(p.read_bytes() for p in retained.rglob('issue.cbz')),
                             sorted([b'previous retained original', b'first original', b'second original']))

    def test_repeat_startup_is_idempotent(self):
        patched = guard.guarded_source(FIXTURE)
        self.assertEqual(guard.guarded_source(patched), patched)

    def test_unknown_upstream_handler_is_rejected(self):
        with self.assertRaises(ValueError):
            guard.guarded_source(FIXTURE.replace(guard.OLD, 'pass'))

    def test_unknown_source_disables_processing_and_preserves_other_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'PostProcessor.py'
            config = Path(directory) / 'config.ini'
            source.write_text('upstream changed')
            config.write_text('[PostProcess]\npost_processing = True\n[Other]\nvalue = keep-me\n')
            with patch.object(guard, 'SOURCE', source), patch.object(guard, 'CONFIG', config):
                with self.assertRaises(RuntimeError):
                    guard.main()
            readback = configparser.ConfigParser()
            readback.read(config)
            self.assertFalse(readback.getboolean('PostProcess', 'post_processing'))
            self.assertEqual(readback['Other']['value'], 'keep-me')
            self.assertEqual(source.read_text(), 'upstream changed')


if __name__ == '__main__':
    unittest.main()
