import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { transcribeCallArchiveChunks } from '../server/services/callArchiveChunks.js';

test('long audio without configured chunker fails explicitly, with no truncation', async () => {
  await assert.rejects(() => transcribeCallArchiveChunks({}, { head: async () => ({ length: 5000 }) }, { maxAiBytes: 1000, ffmpegPath: '' }, () => {}), error => error.code === 'CHUNKER_UNCONFIGURED');
});

test('real ffmpeg splits synthetic long audio and merges mocked transcription offsets', { skip: !process.env.CALL_ARCHIVE_TEST_FFMPEG_PATH }, async () => {
  const ffmpeg = process.env.CALL_ARCHIVE_TEST_FFMPEG_PATH;
  const temporary = await mkdtemp(path.join(tmpdir(), 'nukhab-chunks-test-'));
  try {
    const filename = path.join(temporary, 'synthetic.mp4');
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'lavfi', '-i', 'sine=frequency=400:duration=605', '-c:a', 'aac', '-b:a', '128k', filename], { shell: false, windowsHide: true, stdio: 'ignore' });
      child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg fixture failed (${code})`)));
    });
    const contents = await readFile(filename);
    let chunks = 0;
    const result = await transcribeCallArchiveChunks({}, { head: async () => ({ length: contents.length }), read: async () => createReadStream(filename) },
      { maxAiBytes: 5 * 1024 * 1024, ffmpegPath: ffmpeg }, async (buffer, _config, _fetcher, audio) => {
        chunks++; assert.ok(buffer.length < 5 * 1024 * 1024); assert.equal(audio.mime, 'audio/mpeg');
        return { text: 'تفريغ وهمي لصوت اصطناعي', segments: [{ start: 1, end: 2, speaker: 'A', text: 'اختبار' }] };
      });
    assert.equal(chunks, 2); assert.equal(result.segments[1].start, 601);
    assert.equal(result.segments[1].speaker, 'chunk-2:A');
  } finally {
    if (path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(temporary).startsWith('nukhab-chunks-test-')) await rm(temporary, { recursive: true, force: true });
  }
});
