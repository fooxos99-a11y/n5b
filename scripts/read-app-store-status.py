"""Read original-app release state without changing any build or submission."""
import json
import os
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


def main():
    bundle = os.environ['APP_IDENTIFIER']
    if bundle != 'sa.nukhab.app':
        raise RuntimeError('Only the configured original app may be inspected')
    token = create_app_token(os.environ['APPSTORE_API_KEY_ID'], os.environ['APPSTORE_ISSUER_ID'], os.environ['APPSTORE_API_PRIVATE_KEY'])
    app_id = find_app_id(bundle, token)
    result = read_status(app_id, lambda resource: request_json(resource, token))
    Path('app-store-status.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
