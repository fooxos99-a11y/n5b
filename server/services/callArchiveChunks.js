import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

/** Long recordings are streamed to private temp storage, then transcoded to
 * bounded ten-minute audio files. No public uploads or shell command strings. */
export async function transcribeCallArchiveChunks(media, storage, config, transcribe) {
  const details = await storage.head(media);
  if (details.length <= config.maxAiBytes) return transcribe(await storage.buffer(media, config.maxAiBytes), config, undefined,
    { mime: media.mime || 'audio/mp4', durationSeconds: media.duration_seconds == null ? undefined : Number(media.duration_seconds) });
  if (!config.ffmpegPath || !path.isAbsolute(config.ffmpegPath)) throw Object.assign(new Error('التسجيل الطويل يحتاج إعداد أداة تقسيم الصوت. يبقى التسجيل الكامل محفوظًا ولم يُختصر للتحليل.'), { code: 'CHUNKER_UNCONFIGURED' });
  const temporary = await mkdtemp(path.join(tmpdir(), 'nukhab-call-archive-'));
  try {
    const input = path.join(temporary, 'recording.mp4');
    await pipeline(await storage.read(media), createWriteStream(input, { mode: 0o600 }));
    await new Promise((resolve, reject) => {
      const child = spawn(config.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input, '-vn', '-ac', '1', '-ar', '16000',
        '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'segment', '-segment_time', '600', '-reset_timestamps', '1', path.join(temporary, 'chunk-%04d.mp3')],
      { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let detail = '';
      child.stderr.on('data', data => { detail = (detail + data).slice(-2000); });
      const timer = setTimeout(() => { child.kill(); reject(new Error('انتهت مهلة تقسيم الصوت.')); }, 240000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`تعذر تقسيم التسجيل (${code}; ${detail.length} diagnostic bytes).`)); });
    });
    const files = (await readdir(temporary)).filter(name => /^chunk-\d{4}\.mp3$/.test(name)).sort();
    if (!files.length || files.length > 144) throw new Error('عدد المقاطع الصوتية غير صالح.');
    const transcript = { text: '', segments: [] };
    for (let index = 0; index < files.length; index++) {
      const buffer = await readFile(path.join(temporary, files[index]));
      if (buffer.length > config.maxAiBytes) throw new Error('المقطع الصوتي يتجاوز حد التحليل.');
      const duration = media.duration_seconds == null ? 600 : Math.max(0, Math.min(600, Number(media.duration_seconds) - index * 600));
      const part = await transcribe(buffer, config, undefined, { filename: files[index], mime: 'audio/mpeg', durationSeconds: duration });
      transcript.text += `${part.text}\n`;
      transcript.segments.push(...part.segments.map(item => ({ ...item, start: item.start + index * 600, end: item.end + index * 600,
        speaker: `chunk-${index + 1}:${item.speaker}` })));
    }
    return transcript;
  } finally {
    // This directory is created above, never supplied by a request or config.
    const parent = path.resolve(tmpdir()) + path.sep;
    if (path.resolve(temporary).startsWith(parent) && path.basename(temporary).startsWith('nukhab-call-archive-')) await rm(temporary, { recursive: true, force: true });
  }
}
