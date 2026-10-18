"""Read original-app release state without changing any build or submission."""
import json
import os
import time
from pathlib import Path
import urllib.parse

from app_store_auth import create_app_token, find_app_id
from app_store_http import request_json


def read_status(app_id, request):
    def query(resource, **filters):
        return resource + '?' + urllib.parse.urlencode(filters)

    builds = request(query('/builds', **{'filter[app]': app_id, 'include': 'preReleaseVersion', 'limit': 30}))
    releases = {row['id']: row['attributes'].get('version') for row in builds.get('included', []) if row['type'] == 'preReleaseVersions'}
    versions = request(query(f'/apps/{app_id}/appStoreVersions', **{'filter[platform]': 'IOS', 'include': 'build', 'limit': 10}))
    uploads = request(query(f'/apps/{app_id}/buildUploads', limit=30))
    return {'appId': app_id, 'builds': [{'id': row['id'], 'number': row['attributes'].get('version'),
             'processingState': row['attributes'].get('processingState'), 'uploadedDate': row['attributes'].get('uploadedDate'),
             'version': releases.get(row.get('relationships', {}).get('preReleaseVersion', {}).get('data', {}).get('id'))}
             for row in builds.get('data', [])],
            'versions': [{'id': row['id'], 'version': row['attributes'].get('versionString'),
             'state': row['attributes'].get('appStoreState'), 'buildId': (row.get('relationships', {}).get('build', {}).get('data') or {}).get('id')}
             for row in versions.get('data', [])],
            'uploads': [{'id': row['id'], 'number': row['attributes'].get('cfBundleVersion'),
             'version': row['attributes'].get('cfBundleShortVersionString'), 'state': row['attributes'].get('state'),
             'uploadedDate': row['attributes'].get('uploadedDate'), 'createdDate': row['attributes'].get('createdDate')}
             for row in uploads.get('data', [])]}


def wait_for_build(app_id, number, request, sleep=time.sleep, attempts=90, on_status=None):
    for attempt in range(attempts):
        result = read_status(app_id, request)
        if on_status:
            on_status(result)
        matches = [build for build in result['builds'] if str(build['number']) == number]
        if len(matches) > 1:
            raise RuntimeError('Ambiguous Apple build number; submission stopped')
        if matches and matches[0]['processingState'] == 'VALID':
            return result
        uploads = [upload for upload in result['uploads'] if str(upload['number']) == number]
        upload_state = (uploads[0].get('state') or {}).get('state') if uploads else 'NOT_FOUND'
        if upload_state == 'FAILED' or (matches and matches[0]['processingState'] in {'FAILED', 'INVALID'}):
            raise RuntimeError('Apple rejected the uploaded build; review its upload validation errors')
        print(f'Apple upload {number}: {upload_state} ({attempt + 1}/{attempts})', flush=True)
        if attempt + 1 < attempts:
            sleep(60)
    raise RuntimeError('Apple has not completed build processing; the existing review remains unchanged')


def main():
    bundle = os.environ['APP_IDENTIFIER']
    if bundle != 'sa.nukhab.app':
        raise RuntimeError('Only the configured original app may be inspected')
    def token():
        return create_app_token(os.environ['APPSTORE_API_KEY_ID'], os.environ['APPSTORE_ISSUER_ID'], os.environ['APPSTORE_API_PRIVATE_KEY'])

    app_id = find_app_id(bundle, token())
    request = lambda resource: request_json(resource, token())
    save = lambda result: Path('app-store-status.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    number = os.environ.get('WAIT_FOR_BUILD_NUMBER', '')
    if number:
        if not number.isdecimal():
            raise RuntimeError('A numeric original-app build number is required')
        result = wait_for_build(app_id, number, request, on_status=save)
    else:
        result = read_status(app_id, request)
    save(result)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
