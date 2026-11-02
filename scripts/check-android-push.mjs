import { readFile } from 'node:fs/promises';
import { validateAndroidPushConfig, validateHuaweiPushConfig } from './lib/android-push-config.mjs';

const brand = process.argv[2];
const applicationIds = { nukhab: 'sa.nukhab.app' };
if (!Object.hasOwn(applicationIds, brand)) throw new Error('Unknown Android brand.');
const distribution = process.argv[3] || 'standard';
if (!['standard', 'huawei'].includes(distribution)) throw new Error('Unknown Android distribution.');
const configPath = distribution === 'huawei' ? `${brand}Huawei/agconnect-services.json` : `${brand}/google-services.json`;
const config = JSON.parse(await readFile(new URL(`../android/app/src/${configPath}`, import.meta.url), 'utf8'));
if (distribution === 'huawei') validateHuaweiPushConfig(config, applicationIds[brand]);
else validateAndroidPushConfig(config, applicationIds[brand]);
console.info('Android push configuration validated.');
