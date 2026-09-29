"""Server-owned forced SSH command. Configuration is installed from data1.yml.

The deploy key has no shell, forwarding, or database access. Releases never replace
runtime data. Database migrations require an independent reviewed release.
"""
import hashlib
import http.client
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.parse import urlparse

ROOTS = {'server', 'shared', 'src', 'scripts', 'config', 'public', 'dist'}
INDEX_FILE = 'index.html'
LOCK_FILE = 'package-lock.json'
PACKAGE_FILE = 'package.json'
CONFIG_FILE = 'config.json'
READY_FILE = '.ready'
INVALID_CONFIGURED_PATH = 'Invalid configured path'
SERVICE_NAME_PATTERN = r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}'
FILES = {PACKAGE_FILE, LOCK_FILE, INDEX_FILE, 'vite.config.js',
         'tailwind.config.js', 'postcss.config.js'}
RELEASE_NAME = r'github-\d{8}-\d{6}-[a-f0-9]{12}'
BROWSER_CHECK = "import puppeteer from 'puppeteer'; const b=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox']}); await b.close();"
PREFLIGHT_FAILURES = {
    41: 'PREFLIGHT_CONFIG_INVALID: Check server-owned configuration and environment file.',
    42: 'PREFLIGHT_DEPENDENCIES_FAILED: Required database dependencies could not load.',
    43: 'PREFLIGHT_MIGRATIONS_INVALID: Release migration files could not load.',
    44: 'PREFLIGHT_DATABASE_FAILED: Check database connectivity, credentials and read permissions.',
    45: 'PREFLIGHT_MIGRATIONS_PENDING: Database migrations require a separate reviewed deployment with a backup.',
}


class PreflightFailure(RuntimeError):
    """Only fixed, non-sensitive diagnostics may be returned to the SSH caller."""


def public_failure(error):
    if isinstance(error, PreflightFailure):
        return str(error)
    return 'Deployment failed'


def checked_token(value, pattern):
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise ValueError('Invalid deployment identifier')
    return value


def configured_path(value):
    if not isinstance(value, (str, Path)) or not re.fullmatch(r'(?:/[A-Za-z0-9_.-]+)+|[A-Za-z]:[\\/][A-Za-z0-9_./\\-]+', str(value)):
        raise ValueError(INVALID_CONFIGURED_PATH)
    if any(part in {'.', '..'} for part in re.split(r'[/\\]', str(value))):
        raise ValueError(INVALID_CONFIGURED_PATH)
    path = Path(value)
    if not path.is_absolute() or any(part in {'.', '..'} for part in path.parts):
        raise ValueError(INVALID_CONFIGURED_PATH)
    return path


def load_config(config_path):
    """Bind deployment authority to the installed receiver, not JSON-selected roots."""
    control = config_path.parent.resolve(strict=True)
    if control.name != 'github-deploy' or control.parent.name != 'shared':
        raise ValueError('Invalid receiver installation directory')
    root = control.parent.parent
    if config_path.is_symlink():
        raise ValueError('Linked deployment configuration is prohibited')
    raw = json.loads(config_path.read_text())
    if not isinstance(raw, dict):
        raise ValueError('Expected deployment configuration object')
    fixed_paths = {
        'release_root': root / 'releases',
        'dependency_cache': root / 'shared' / 'dependencies',
        'current': root / 'current',
        'preflight': control / 'preflight.mjs',
    }
    config = dict(raw)
    for key, expected in fixed_paths.items():
        if configured_path(raw.get(key)) != expected:
            raise ValueError('Deployment configuration does not match installation')
        if key != 'current':
            inside(root, expected)
        config[key] = str(expected)
    for key in ('runtime_source', 'env_source'):
        config[key] = str(inside(root, configured_path(raw.get(key))))
    services = raw.get('services')
    if not isinstance(services, list) or not services:
        raise ValueError('Missing deployment services')
    config['services'] = [checked_token(name, SERVICE_NAME_PATTERN) for name in services]
    config['config_path'] = str(control / CONFIG_FILE)
    return config


def inside(root, value):
    """Reject escapes and symlink aliases before filesystem probes or writes."""
    root = configured_path(root).resolve(strict=True)
    value = configured_path(value)
    relative = value.relative_to(root)
    if not relative.parts:
        raise ValueError('Expected a child path')
    candidate = root
    for part in relative.parts:
        if part in {'.', '..'} or '\\' in part or ':' in part:
            raise ValueError('Unsafe child path')
        candidate = candidate / part
        if candidate.is_symlink():
            raise ValueError('Symlink paths are prohibited')
    candidate.resolve().relative_to(root)
    return candidate


def release_path(config, value):
    root = configured_path(config['release_root']).resolve(strict=True)
    path = inside(root, value)
    if path.parent != root:
        raise ValueError('Expected a direct release directory')
    return path


def command(value):
    match = re.fullmatch(r'deploy ([a-f0-9]{40}) ([a-f0-9]{64})', value)
    if not match:
        raise ValueError('Only a verified deployment command is allowed')
    return match.groups()


def validate_member(member):
    path = PurePosixPath(member.name)
    if (path.is_absolute() or not path.parts or any(p.startswith('.') for p in path.parts)
            or '\\' in member.name or ':' in member.name or '\x00' in member.name):
        raise ValueError('Unsafe archive path')
    if path.parts[0] not in ROOTS and member.name not in FILES:
        raise ValueError('Unapproved archive path')
    if not member.isfile() and not member.isdir():
        raise ValueError('Archive links and devices are prohibited')
    if path.parts[0] == 'dist' and (len(path.parts) < 2 or path.parts[1] != 'n5b'):
        raise ValueError('Unexpected build target')
    if path.parts[:2] == ('public', 'downloads'):
        raise ValueError('Native downloads are managed independently')


def run(operation, cwd=None, *, services=(), release=None):
    fixed = {
        'dependencies': ['npm', 'ci', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'],
        'browser-install': ['npx', '--no-install', 'puppeteer', 'browsers', 'install', 'chrome'],
        'browser-check': ['node', '--input-type=module', '-e', BROWSER_CHECK],
        'service-list': ['pm2', 'jlist'],
    }
    if not isinstance(operation, str):
        raise ValueError('Unapproved deployment operation')
    if operation in {'stop', 'restart'}:
        if not services or isinstance(services, str):
            raise ValueError('Missing service names')
        names = [checked_token(name, SERVICE_NAME_PATTERN) for name in services]
        args = ['pm2', operation, *names]
        if operation == 'restart':
            args.append('--update-env')
    elif operation == 'preflight':
        control = Path(__file__).resolve().parent
        release = inside(control.parent.parent / 'releases', configured_path(release))
        checked_token(release.name, RELEASE_NAME)
        args = ['node', str(control / 'preflight.mjs'), str(release), str(control / CONFIG_FILE)]
    elif operation in fixed:
        args = fixed[operation]
    else:
        raise ValueError('Unapproved deployment operation')
    executable = shutil.which(args[0])
    if not executable:
        raise RuntimeError('Deployment executable unavailable')
    # Avoid printing service environment variables or npm configuration.
    result = subprocess.run([executable, *args[1:]], cwd=cwd, capture_output=True, text=True, shell=False)
    if result.returncode:
        if operation == 'preflight':
            raise PreflightFailure(PREFLIGHT_FAILURES.get(result.returncode,
                'PREFLIGHT_FAILED: Check the server-owned preflight runtime and configuration.'))
        raise RuntimeError('Command failed: ' + args[0] + ' ' + args[1])
    return result.stdout


def receive(stream, destination, expected):
    digest = hashlib.sha256()
    size = 0
    with destination.open('xb') as output:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            if size > 1024 * 1024 * 1024:
                raise ValueError('Release exceeds size limit')
            digest.update(chunk)
            output.write(chunk)
    if digest.hexdigest() != expected:
        raise ValueError('Release checksum mismatch')


def unpack(archive, destination):
    with tarfile.open(archive) as tar:
        members = tar.getmembers()
        if sum(m.size for m in members) > 3 * 1024 * 1024 * 1024:
            raise ValueError('Expanded release exceeds size limit')
        names = set()
        for member in members:
            validate_member(member)
            if member.name in names:
                raise ValueError('Duplicate archive entry')
            names.add(member.name)
        # Links are prohibited and destination is a fresh directory.
        for member in members:
            target = inside(destination, destination / member.name)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)


def prepare_dependencies(release, config):
    release = release_path(config, release)
    manifests = {name: inside(release, release / name) for name in (PACKAGE_FILE, LOCK_FILE)}
    digest = hashlib.sha256(manifests[LOCK_FILE].read_bytes()).hexdigest()
    cache = configured_path(config['dependency_cache'])
    cache.mkdir(parents=True, exist_ok=True)
    cache = cache.resolve(strict=True)
    folder = inside(cache, cache / checked_token(digest, r'[a-f0-9]{64}'))
    if folder.exists():
        for name in (READY_FILE, PACKAGE_FILE, LOCK_FILE, 'node_modules'):
            inside(folder, folder / name)
    if not (folder / READY_FILE).is_file():
        folder.mkdir(parents=True, exist_ok=True)
        for name in (PACKAGE_FILE, LOCK_FILE):
            shutil.copyfile(manifests[name], folder / name)
        run('dependencies', folder)
        run('browser-install', folder)
        (folder / READY_FILE).write_text(digest)
    (release / 'node_modules').symlink_to(folder / 'node_modules')
    run('browser-check', release)


def health(url):
    if not json.loads(fetch(url)).get('ok'):
        raise RuntimeError('Health check failed')


def switch(current, target):
    temporary = current.with_name(current.name + '.github-next')
    temporary.symlink_to(target)
    temporary.replace(current)


def wait_for_health(url):
    for attempt in range(30):
        try:
            health(url)
            return
        except Exception:
            if attempt == 29:
                raise
            time.sleep(1)


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'script' and attrs.get('src'):
            self.urls.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') in {'stylesheet', 'modulepreload'}:
            self.urls.append(attrs['href'])


class BeaconFilter(HTMLParser):
    """Locate only empty Cloudflare beacon elements without a backtracking regex."""
    def __init__(self, source):
        super().__init__()
        self.source = source
        self.line_offsets = [0]
        for index, character in enumerate(source):
            if character == '\n':
                self.line_offsets.append(index + 1)
        self.pending = None
        self.removals = []

    def source_offset(self):
        line, column = self.getpos()
        return self.line_offsets[line - 1] + column

    def handle_starttag(self, tag, attributes):
        if tag != 'script':
            return
        src = dict(attributes).get('src') or ''
        prefix = 'https://static.cloudflareinsights.com/beacon.min.js/'
        if src.startswith(prefix) and len(src) > len(prefix):
            start = self.source_offset()
            self.pending = (start, start + len(self.get_starttag_text()))

    def handle_endtag(self, tag):
        if tag != 'script' or self.pending is None:
            return
        start, content_start = self.pending
        self.pending = None
        end_start = self.source_offset()
        if end_start != content_start:
            return
        end = self.source.find('>', end_start) + 1
        while end < len(self.source) and self.source[end] in ' \t\n\r\f\v':
            end += 1
        self.removals.append((start, end))


def strip_cloudflare_beacon(html):
    source = html.decode('utf-8')
    parser = BeaconFilter(source)
    parser.feed(source)
    parser.close()
    parts = []
    cursor = 0
    for start, end in parser.removals:
        parts.append(source[cursor:start])
        cursor = end
    parts.append(source[cursor:])
    return ''.join(parts).encode('utf-8')


def fetch(base, relative=''):
    # The origin comes only from server-owned configuration, never HTML content.
    if relative and (not re.fullmatch(r'[A-Za-z0-9_./-]+', relative) or '..' in relative or relative.startswith('/')):
        raise ValueError('Invalid asset path')
    origin = urlparse(base)
    if origin.scheme not in {'http', 'https'} or not origin.hostname or origin.username:
        raise ValueError('Invalid configured website origin')
    connection_type = http.client.HTTPSConnection if origin.scheme == 'https' else http.client.HTTPConnection
    connection = connection_type(origin.hostname, origin.port, timeout=30)
    try:
        path = origin.path + relative
        if not relative:
            path += '?release=' + str(time.time_ns())
        connection.request('GET', path, headers={'Cache-Control': 'no-cache', 'User-Agent': 'Nukhab-Release-Verification'})
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError('Asset probe failed; redirects are not followed')
        return response.read()
    finally:
        connection.close()


def verify_public_files(release, config):
    for target in config['public_checks']:
        base, folder = target['url'], release / target['directory']
        html = fetch(base)
        html = strip_cloudflare_beacon(html)
        if html != (folder / INDEX_FILE).read_bytes():
            raise RuntimeError('Published HTML does not match release')
        parser = Assets()
        parser.feed((folder / INDEX_FILE).read_text())
        for asset in parser.urls:
            parsed = urlparse(asset)
            if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
                raise ValueError('Only local built assets can be verified')
            relative = parsed.path.removeprefix(urlparse(base).path)
            if fetch(base, relative) != (folder / relative).read_bytes():
                raise RuntimeError('Published asset does not match release')


def activate(release, config):
    release = release_path(config, release)
    current = configured_path(config['current'])
    previous = release_path(config, current.resolve(strict=True))
    services = config['services']
    if not isinstance(services, list) or not services:
        raise ValueError('Missing deployment services')
    for name in services:
        checked_token(name, SERVICE_NAME_PATTERN)
    if config.get('preserve_previous_hashed_assets'):
        preserve_previous_assets(release, previous)
    try:
        if len(services) > 1:
            run('stop', services=services[1:])
        run('stop', services=services[:1])
        switch(current, release)
        run('restart', services=services)
        for url in config['health_urls']:
            wait_for_health(url)
        live = json.loads(run('service-list'))
        for name in services:
            if not any(p['name'] == name and p['pm2_env']['status'] == 'online' for p in live):
                raise RuntimeError('Service did not start')
        verify_public_files(release, config)
        (release / 'previous-release.txt').write_text(str(previous))
    except Exception:
        if current.resolve() != previous:
            switch(current, previous)
        run('restart', services=services)
        raise
    return previous


def preserve_previous_assets(release, previous):
    """Keep one generation of hashed assets for clients open during deployment."""
    folder = inside(release, release / 'dist' / 'n5b' / 'assets')
    current_names = sorted(p.name for p in folder.iterdir() if p.is_file())
    old_folder = inside(previous, previous / 'dist' / 'n5b' / 'assets')
    manifest = inside(previous, previous / 'release-assets.json')
    old_names = json.loads(manifest.read_text()) if manifest.exists() else [p.name for p in old_folder.iterdir() if p.is_file()]
    for name in old_names:
        checked_token(name, r'[A-Za-z0-9_-]+\.[A-Za-z0-9.]+')
        source = inside(previous, old_folder / name)
        target = inside(release, folder / name)
        if source.is_file() and not target.exists():
            shutil.copyfile(source, target)
    (release / 'release-assets.json').write_text(json.dumps(current_names))


def prune_releases(config, current, previous):
    root = configured_path(config['release_root']).resolve(strict=True)
    current = release_path(config, current)
    previous = release_path(config, previous)
    protected = [current, previous, configured_path(config['runtime_source']).resolve(), configured_path(config['env_source']).resolve()]
    for candidate in root.iterdir():
        if not re.fullmatch(RELEASE_NAME, candidate.name) or candidate.is_symlink():
            continue
        candidate = release_path(config, candidate)
        if any(path == candidate or candidate in path.parents for path in protected):
            continue
        if candidate.is_dir() and inside(candidate, candidate / 'github-release.json').is_file():
            shutil.rmtree(candidate)


def deploy(config, sha, digest):
    sha = checked_token(sha, r'[a-f0-9]{40}')
    digest = checked_token(digest, r'[a-f0-9]{64}')
    root = configured_path(config['release_root']).resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix='github-web-', dir=root) as staging:
        archive = Path(staging) / 'release.tar.gz'
        receive(sys.stdin.buffer, archive, digest)
        name = checked_token('github-' + time.strftime('%Y%m%d-%H%M%S') + '-' + sha[:12], RELEASE_NAME)
        release = release_path(config, root / name)
        release.mkdir()
        unpack(archive, release)
        print('PACKAGE_VERIFIED', flush=True)
        (release / '.env').symlink_to(configured_path(config['env_source']).resolve(strict=True))
        (release / 'runtime').symlink_to(configured_path(config['runtime_source']).resolve(strict=True))
        prepare_dependencies(release, config)
        print('DEPENDENCIES_VERIFIED', flush=True)
        # Use server-owned preflight, not code supplied by the archive.
        run('preflight', release=release)
        print('PREFLIGHT_PASSED', flush=True)
        (release / 'github-release.json').write_text(json.dumps({'sha': sha, 'sha256': digest}))
        previous = activate(release, config)
        print('DEPLOYED', sha, flush=True)
        prune_releases(config, release, previous)


def main():
    import fcntl  # Linux server only; pure validation functions are portable.
    config_path = Path(__file__).with_name(CONFIG_FILE)
    config = load_config(config_path)
    sha, digest = command(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    with config_path.with_suffix('.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            deploy(config, sha, digest)
        except Exception as error:
            config_path.with_suffix('.error').write_text(type(error).__name__ + ': ' + str(error))
            raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not expose filesystem existence, paths or tracebacks to the SSH caller.
        print(public_failure(error), file=sys.stderr)
        sys.exit(1)
