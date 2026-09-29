import { readFile } from 'node:fs/promises';
import { validateAndroidPushConfig } from './lib/android-push-config.mjs';

const brand = process.argv[2];
const applicationIds = { nukhab: 'sa.nukhab.app' };
if (!Object.hasOwn(applicationIds, brand)) throw new Error('Unknown Android brand.');
const config = JSON.parse(await readFile(new URL(`../android/app/src/${brand}/google-services.json`, import.meta.url), 'utf8'));
validateAndroidPushConfig(config, applicationIds[brand]);
console.info('Android push configuration validated.');
