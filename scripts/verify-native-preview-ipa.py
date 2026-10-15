"""Inspect the actual exported preview IPA; Apple separately validates its signature on upload."""
import argparse
import datetime
import hashlib
import json
import plistlib
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('ipa', type=Path)
parser.add_argument('--build-number', required=True)
parser.add_argument('--evidence', type=Path, required=True)
args = parser.parse_args()
with zipfile.ZipFile(args.ipa) as archive:
    names = archive.namelist()
    apps = [name for name in names if name.startswith('Payload/') and name.count('/') == 2
            and name.endswith('.app/Info.plist')]
    assert len(apps) == 1, 'Expected exactly one application in Payload'
    prefix = apps[0][:-len('Info.plist')]
    info = plistlib.loads(archive.read(apps[0]))
    assert info['CFBundleIdentifier'] == 'sa.nukhab.app.preview'
    assert info['CFBundleDisplayName'] == 'نخب تجريبي'
    assert info['CFBundleShortVersionString'] == '0.1.0'
    assert info['CFBundleVersion'] == args.build_number
    assert info['ITSAppUsesNonExemptEncryption'] is False
    schemes = [scheme for row in info.get('CFBundleURLTypes', []) for scheme in row.get('CFBundleURLSchemes', [])]
    assert 'nukhab-preview' in schemes and 'nukhab' not in schemes
    bundle = archive.read(prefix + 'main.jsbundle')
    assert len(bundle) > 100000, 'Missing embedded Release JavaScript'
    assert b'https://nokhab.cc/n5b-expo-preview/api' in bundle, 'Preview API is not embedded'
    content = archive.read(prefix + 'embedded.mobileprovision')
    start, end = content.index(b'<?xml'), content.index(b'</plist>') + len(b'</plist>')
    profile = plistlib.loads(content[start:end])
    assert profile['Name'] == 'Nukhab Expo Preview App Store'
    assert profile['TeamIdentifier'] == ['N3VFH76QCU']
    assert profile['Entitlements']['application-identifier'] == 'N3VFH76QCU.sa.nukhab.app.preview'
    assert profile['Entitlements'].get('get-task-allow', False) is False
    assert not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices')
    assert profile['ExpirationDate'].replace(tzinfo=datetime.timezone.utc) > datetime.datetime.now(datetime.timezone.utc)
    assert not any(Path(name).suffix.lower() in ('.p8', '.p12', '.env') for name in names)
    evidence = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'ipaSHA256': hashlib.sha256(args.ipa.read_bytes()).hexdigest(), 'bundleIdentifier': info['CFBundleIdentifier'],
      'displayName': info['CFBundleDisplayName'], 'version': info['CFBundleShortVersionString'],
      'buildNumber': info['CFBundleVersion'], 'embeddedJavaScriptSHA256': hashlib.sha256(bundle).hexdigest(),
      'previewAPIEmbedded': True, 'oldSchemeAbsent': True, 'profileUUID': profile['UUID'],
      'distributionProfileVerified': True, 'privateSigningFilesAbsent': True, 'actualIPhone': False}
args.evidence.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Preview IPA identity, distribution profile and embedded API checks passed')
