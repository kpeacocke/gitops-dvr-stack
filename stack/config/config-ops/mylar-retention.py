#!/usr/bin/env python3
"""Give every Mylar retained duplicate its own directory before services start."""
import configparser
import os
from pathlib import Path
import shutil
import tempfile

SOURCE = Path('/app/mylar3/mylar/PostProcessor.py')
CONFIG = Path('/config/mylar/config.ini')
OLD = 'shutil.move(path_to_move, os.path.join(dump_folder, file_to_move))'
NEW = ('shutil.move(path_to_move, os.path.join(\n'
       '                            __import__("tempfile").mkdtemp(prefix="retained-", dir=dump_folder),\n'
       '                            file_to_move))')


def guarded_source(source):
    if source.count(NEW) == 1 and OLD not in source:
        return source
    if source.count(OLD) != 1 or 'def duplicate_process(self, dupeinfo):' not in source:
        raise ValueError('Unrecognised Mylar duplicate handler')
    updated = source.replace(OLD, NEW)
    compile(updated, str(SOURCE), 'exec')
    return updated


def atomic_write(path, content):
    stat = path.stat()
    fd, pending = tempfile.mkstemp(dir=path.parent, prefix=path.name + '.')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(pending, stat.st_mode & 0o777)
        os.chown(pending, stat.st_uid, stat.st_gid)
        os.replace(pending, path)
    finally:
        if os.path.exists(pending):
            os.unlink(pending)


def main():
    try:
        source = SOURCE.read_text()
        updated = guarded_source(source)
        if updated != source:
            shutil.copy2(SOURCE, str(SOURCE) + '.before-retention')
            atomic_write(SOURCE, updated)
        print('Mylar duplicate retention: unique destinations verified')
    except Exception:
        # An upstream change must not silently reactivate unsafe processing.
        config = configparser.ConfigParser(interpolation=None)
        config.read(CONFIG)
        if not config.has_section('PostProcess'):
            config.add_section('PostProcess')
        config.set('PostProcess', 'post_processing', 'False')
        import io
        output = io.StringIO()
        config.write(output)
        shutil.copy2(CONFIG, str(CONFIG) + '.before-retention-disable')
        atomic_write(CONFIG, output.getvalue())
        raise RuntimeError('Retention guard unavailable; automatic post-processing disabled') from None


if __name__ == '__main__':
    main()
