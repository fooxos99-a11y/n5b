import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat, readFile, realpath } from 'node:fs/promises';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getCallArchiveConfig } from './callArchiveConfig.js';

export function validArchiveKey(key) {
  return typeof key === 'string' && /^[a-f0-9]{20}\/call-archives\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.mp4$/.test(key);
}

export function parseArchiveRange(value, length) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw Object.assign(new Error('Invalid range'), { statusCode: 416 });
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), length - 1) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= length || end < start) {
    throw Object.assign(new Error('Invalid range'), { statusCode: 416 });
  }
  return { start, end };
}

export function createCallArchiveStorage(config = getCallArchiveConfig()) {
  let s3;
  if (config.s3) s3 = new S3Client({ region: config.s3.region, endpoint: config.s3.endpoint, forcePathStyle: config.s3.forcePathStyle,
    credentials: { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secret } });
  const localFile = async key => {
    if (!validArchiveKey(key)) throw new Error('Invalid archive object key');
    const base = await realpath(config.localPath);
    const file = await realpath(path.join(base, ...key.split('/')));
    if (!file.startsWith(base + path.sep)) throw new Error('Archive path is outside private storage');
    return file;
  };
  return {
    async head(media) {
      if (!validArchiveKey(media.object_key) || media.storage !== config.storage) throw new Error('Archive storage configuration does not match this recording');
      if (s3) {
        const object = await s3.send(new HeadObjectCommand({ Bucket: config.s3.bucket, Key: media.object_key }));
        return { length: Number(object.ContentLength), type: media.mime };
      }
      const details = await stat(await localFile(media.object_key));
      if (!details.isFile()) throw new Error('Archive object is not a file');
      return { length: details.size, type: media.mime };
    },
    async read(media, range) {
      if (s3) return (await s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: media.object_key,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}) }))).Body;
      return createReadStream(await localFile(media.object_key), range || {});
    },
    async buffer(media, maxBytes) {
      const details = await this.head(media);
      if (!details.length || details.length > maxBytes) throw Object.assign(new Error('التسجيل أكبر من حد التحليل التلقائي؛ يبقى متاحًا للاستماع والمراجعة اليدوية.'), { code: 'AUDIO_TOO_LARGE' });
      if (s3) {
        const body = await this.read(media);
        const chunks = []; let size = 0;
        for await (const chunk of body) { size += chunk.length; if (size > maxBytes) { body.destroy(); throw new Error('Audio exceeds limit'); } chunks.push(chunk); }
        return Buffer.concat(chunks);
      }
      return readFile(await localFile(media.object_key));
    },
  };
}
