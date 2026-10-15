"""Register/sign only the separately requested Expo preview; never mutate the old app."""
import base64
import json
import os
import plistlib
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from app_store_auth import create_app_token

IDENTIFIER = 'sa.nukhab.app.preview'
TEAM = 'N3VFH76QCU'
CERTIFICATE = 'HBD4733F3Z'
PROFILE = 'Nukhab Expo Preview App Store'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('Unexpected Apple API redirect')


def prepare():
    if os.environ.get('NUKHAB_APP_VARIANT') != 'testflight-preview' or os.environ.get('APPLE_TEAM_ID') != TEAM:
        raise RuntimeError('This tool is restricted to the Nukhba preview target')
    token = create_app_token(os.environ['APPSTORE_API_KEY_ID'], os.environ['APPSTORE_ISSUER_ID'],
                             os.environ['APPSTORE_API_PRIVATE_KEY'])
    opener = urllib.request.build_opener(NoRedirect())

    def api(route, method='GET', body=None):
        if route.split('?')[0].split('/')[1] not in ('bundleIds', 'profiles', 'certificates'):
            raise RuntimeError('Apple endpoint outside preview provisioning scope')
        request = urllib.request.Request('https://api.appstoreconnect.apple.com/v1' + route,
          data=None if body is None else json.dumps(body).encode(), method=method,
          headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with opener.open(request, timeout=30) as response:
                return json.load(response)['data']
        except urllib.error.HTTPError as error:
            try:
                errors = json.load(error).get('errors', [])
                codes = ', '.join(str(item.get('code', 'UNKNOWN')) for item in errors)
            except (ValueError, AttributeError):
                codes = 'UNKNOWN'
            raise RuntimeError(f'Apple preview provisioning returned HTTP {error.code} ({codes})') from None

    bundles = api('/bundleIds?' + urllib.parse.urlencode({'filter[identifier]': IDENTIFIER}))
    bundles = [row for row in bundles if row['attributes']['identifier'] == IDENTIFIER]
    if len(bundles) > 1:
        raise RuntimeError('Ambiguous preview identifier')
    bundle = bundles[0] if bundles else api('/bundleIds', 'POST', {'data': {'type': 'bundleIds',
      'attributes': {'identifier': IDENTIFIER, 'name': 'Nukhab Expo Preview', 'platform': 'IOS'}}})
    certificate = api('/certificates/' + CERTIFICATE)
    if certificate['attributes']['certificateType'] not in ('DISTRIBUTION', 'IOS_DISTRIBUTION'):
        raise RuntimeError('Expected existing Apple distribution certificate')
    profiles = api('/profiles?' + urllib.parse.urlencode({'filter[name]': PROFILE, 'limit': 200}))
    profiles = [row for row in profiles if row['attributes']['name'] == PROFILE
                and row['attributes']['profileState'] == 'ACTIVE']
    if len(profiles) > 1:
        raise RuntimeError('Ambiguous preview profile')
    profile = profiles[0] if profiles else api('/profiles', 'POST', {'data': {
      'type': 'profiles', 'attributes': {'name': PROFILE, 'profileType': 'IOS_APP_STORE'},
      'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bundle['id']}},
                        'certificates': {'data': [{'type': 'certificates', 'id': CERTIFICATE}]}}}})
    linked = api('/profiles/' + profile['id'] + '/bundleId')
    if linked['id'] != bundle['id']:
        raise RuntimeError('Preview profile belongs to a different app')
    content = base64.b64decode(profile['attributes']['profileContent'])
    start, end = content.index(b'<?xml'), content.index(b'</plist>') + len(b'</plist>')
    decoded = plistlib.loads(content[start:end])
    if decoded['Entitlements']['application-identifier'] != TEAM + '.' + IDENTIFIER:
        raise RuntimeError('Preview entitlement does not match the separate app')
    directory = Path.home() / 'Library/MobileDevice/Provisioning Profiles'
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / (decoded['UUID'] + '.mobileprovision')
    path.write_bytes(content)
    path.chmod(0o600)
    with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as output:
        output.write('PREVIEW_PROFILE=' + PROFILE + '\n')
    print(json.dumps({'identifier': IDENTIFIER, 'bundleResourceId': bundle['id'],
                      'profile': PROFILE, 'certificateReused': CERTIFICATE}))


if __name__ == '__main__':
    prepare()
