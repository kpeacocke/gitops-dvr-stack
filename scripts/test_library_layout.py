import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import library_layout as layout


class LayoutTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / 'media'
        self.root.mkdir()
        for name in ['A show', 'B movie']:
            (self.root / name).mkdir()
            (self.root / name / 'media.bin').write_bytes(b'original media')
        self.journal = self.base / 'journal.json'
        self.journal.write_text(json.dumps(layout.plan(self.root)))

    def test_apply_and_rollback_preserve_inode_and_new_data(self):
        original = layout.identity(self.root / 'A show' / 'media.bin')
        layout.apply(self.journal)
        self.assertEqual(layout.identity(self.root / 'library/A show/media.bin'), original)
        self.assertEqual((self.root / 'A show/media.bin').read_bytes(), b'original media')
        (self.root / 'library/A show/new.srt').write_text('new subtitle')
        layout.rollback(self.journal)
        self.assertEqual(layout.identity(self.root / 'A show/media.bin'), original)
        self.assertEqual((self.root / 'A show/new.srt').read_text(), 'new subtitle')

    def test_resume_after_interruption_between_rename_and_link(self):
        with patch.object(Path, 'symlink_to', side_effect=OSError('interruption')):
            with self.assertRaises(OSError):
                layout.apply(self.journal)
        self.assertTrue((self.root / 'library/A show/media.bin').exists())
        layout.apply(self.journal)
        layout.apply(self.journal)
        self.assertEqual((self.root / 'A show/media.bin').read_bytes(), b'original media')

    def test_collision_never_overwrites(self):
        (self.root / 'library').mkdir()
        (self.root / 'library/A show').mkdir()
        (self.root / 'library/A show/other.bin').write_bytes(b'other media')
        with self.assertRaises(ValueError):
            layout.apply(self.journal)
        self.assertEqual((self.root / 'A show/media.bin').read_bytes(), b'original media')
        self.assertEqual((self.root / 'library/A show/other.bin').read_bytes(), b'other media')

    def test_rollback_refuses_new_titles(self):
        layout.apply(self.journal)
        (self.root / 'library/New title').mkdir()
        with self.assertRaises(ValueError):
            layout.rollback(self.journal)
        self.assertTrue((self.root / 'library/A show/media.bin').exists())
        self.assertTrue((self.root / 'library/New title').exists())

    def test_root_symlink_or_file_is_not_migrated(self):
        (self.root / 'unexpected').symlink_to('A show')
        with self.assertRaises(ValueError):
            layout.plan(self.root)

    def test_changed_source_blocks_before_any_moves(self):
        (self.root / 'B movie').rename(self.root / '.retained')
        (self.root / 'B movie').mkdir()
        with self.assertRaises(ValueError):
            layout.apply(self.journal)
        self.assertFalse((self.root / 'A show').is_symlink())
        self.assertEqual((self.root / '.retained/media.bin').read_bytes(), b'original media')


if __name__ == '__main__':
    unittest.main()
