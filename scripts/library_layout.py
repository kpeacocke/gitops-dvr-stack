"""Journalled, same-filesystem directory migration with compatibility links.

Plan is read-only. Apply requires stopped media writers and a saved plan outside
the media root. Originals are renamed, never copied or deleted. Relative links
preserve old paths. A crash after rename is recoverable by reapplying the plan.
Run rollback only with media writers stopped. It preserves newly written data.
"""
import argparse
import json
import os
from pathlib import Path
import stat


def identity(path):
    s = path.lstat()
    return [s.st_dev, s.st_ino]


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def plan(root):
    root = Path(root).resolve(strict=True)
    if root == Path('/') or not root.is_dir():
        raise ValueError('Expected an existing media root')
    if os.path.lexists(root / 'library') or os.path.lexists(root / 'downloads'):
        raise ValueError('Destination already exists; inspect before proceeding')
    entries = []
    for p in sorted(root.iterdir()):
        if p.name.startswith(('.', '@', '#')):
            continue
        mode = p.lstat().st_mode
        if not stat.S_ISDIR(mode):
            raise ValueError('Unexpected non-directory at root: ' + p.name)
        if p.stat().st_dev != root.stat().st_dev:
            raise ValueError('Nested filesystem: ' + p.name)
        entries.append({'name': p.name, 'identity': identity(p)})
    if not entries:
        raise ValueError('No media directories found')
    return {'version': 1, 'root': str(root), 'root_identity': identity(root),
            'entries': entries, 'state': 'planned', 'library_identity': None}


def save(path, data):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    with temporary.open('x') as f:
        os.chmod(temporary, 0o600)
        json.dump(data, f, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())
    os.replace(temporary, path)
    sync_directory(path.parent)


def validate(data):
    if data['version'] != 1:
        raise ValueError('Unknown plan version')
    root = Path(data['root'])
    if root.is_symlink() or identity(root) != data['root_identity']:
        raise ValueError('Media root changed')
    names = [e['name'] for e in data['entries']]
    if len(set(names)) != len(names) or any(
            n in ('', '.', '..', 'library', 'downloads') or '/' in n
            for n in names):
        raise ValueError('Invalid plan paths')
    return root


def apply(journal):
    data = json.loads(Path(journal).read_text())
    root = validate(data)
    library = root / 'library'
    if data['state'] == 'rolled_back':
        raise ValueError('Create a new plan after rollback')
    if not os.path.lexists(library):
        root_stat = root.stat()
        library.mkdir(mode=stat.S_IMODE(root_stat.st_mode))
        if os.geteuid() == 0:
            os.chown(library, root_stat.st_uid, root_stat.st_gid)
        data['library_identity'] = identity(library)
        save(journal, data)
    if library.is_symlink() or not library.is_dir():
        raise ValueError('Unsafe library destination')
    if identity(library) != data['library_identity']:
        raise ValueError('Library destination changed; inspect interrupted setup')
    # Validate every entry before the first rename. Never merge or overwrite.
    for e in data['entries']:
        old, new = root / e['name'], library / e['name']
        if os.path.lexists(new):
            if new.is_symlink() or identity(new) != e['identity']:
                raise ValueError('Destination collision: ' + e['name'])
            if os.path.lexists(old) and not (
                    old.is_symlink() and os.readlink(old) == 'library/' + e['name']):
                raise ValueError('Original path reused: ' + e['name'])
        elif old.is_symlink() or not old.is_dir() or identity(old) != e['identity']:
            raise ValueError('Original directory changed: ' + e['name'])
    data['state'] = 'applying'
    save(journal, data)
    for e in data['entries']:
        old, new = root / e['name'], library / e['name']
        if not os.path.lexists(new):
            old.rename(new)
            sync_directory(library)
            sync_directory(root)
        if not os.path.lexists(old):
            old.symlink_to('library/' + e['name'], target_is_directory=True)
            sync_directory(root)
        if identity(new) != e['identity'] or old.resolve() != new.resolve():
            raise ValueError('Post-move verification failed')
    data['state'] = 'applied'
    save(journal, data)
    return {'directories': len(data['entries']), 'state': data['state']}


def rollback(journal):
    data = json.loads(Path(journal).read_text())
    root = validate(data)
    library = root / 'library'
    if not library.is_dir() or library.is_symlink() or identity(library) != data['library_identity']:
        raise ValueError('Library destination changed')
    # Refuse rollback if new titles were added; no data is discarded.
    names = {e['name'] for e in data['entries']}
    if any(p.name not in names for p in library.iterdir()):
        raise ValueError('New library entries need a separate rollback plan')
    for e in data['entries']:
        old, new = root / e['name'], library / e['name']
        if not os.path.lexists(new):
            if old.is_symlink() or identity(old) != e['identity']:
                raise ValueError('Original directory changed')
            continue
        if new.is_symlink() or identity(new) != e['identity']:
            raise ValueError('Library directory changed')
        if os.path.lexists(old) and not (
                old.is_symlink() and os.readlink(old) == 'library/' + e['name']):
            raise ValueError('Original path collision')
    data['state'] = 'rolling_back'
    save(journal, data)
    for e in reversed(data['entries']):
        old, new = root / e['name'], library / e['name']
        if not os.path.lexists(new):
            continue
        if old.is_symlink():
            old.unlink()  # Only the exact compatibility link verified above.
        new.rename(old)
        sync_directory(root)
        sync_directory(library)
    library.rmdir()  # Empty directory only; no recursive deletion exists.
    data['state'] = 'rolled_back'
    save(journal, data)
    return {'directories': len(data['entries']), 'state': data['state']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['plan', 'apply', 'rollback'])
    parser.add_argument('path', help='Media root for plan; journal for apply/rollback')
    parser.add_argument('--writers-stopped', action='store_true')
    args = parser.parse_args()
    if args.mode == 'plan':
        print(json.dumps(plan(args.path), indent=2))
    else:
        if not args.writers_stopped:
            parser.error('Stop media writers before changing paths')
        print(json.dumps((apply if args.mode == 'apply' else rollback)(args.path)))
