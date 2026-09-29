"""Package tracked runtime sources and built web assets; never local secrets/data."""
import os
from pathlib import Path
import subprocess
import tarfile

ROOTS = {'server', 'shared', 'src', 'scripts', 'config', 'public'}
FILES = {'package.json', 'package-lock.json', 'index.html', 'vite.config.js',
         'tailwind.config.js', 'postcss.config.js'}


def package(destination):
    tracked = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
    paths = [Path(p) for p in tracked if p and (p.split('/')[0] in ROOTS or p in FILES)]
    folder = Path('dist/n5b')
    if not (folder / 'index.html').is_file():
        raise ValueError('Missing web build: ' + str(folder))
    paths.extend(p for p in folder.rglob('*') if p.is_file())
    with tarfile.open(destination, 'w:gz') as archive:
        for path in sorted(set(paths)):
            if path.is_symlink() or any(part.startswith('.') for part in path.parts):
                raise ValueError('Unexpected deployment file: ' + str(path))
            archive.add(path, arcname=path.as_posix(), recursive=False)


if __name__ == '__main__':
    package(os.environ['RELEASE_ARCHIVE'])
