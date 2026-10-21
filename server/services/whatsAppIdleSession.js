import { mkdir, open, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import nodePath from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const execute = promisify(execFile);
const dispatchContext = new AsyncLocalStorage();

export function withWhatsAppDispatchKey(key, operation) {
  return dispatchContext.run(key || null, operation);
}

async function destroyBrowser(instance, close = () => instance.destroy()) {
  let timeout;
  try {
    await Promise.race([
      (async () => {
        await close();
        const browser = instance.pupBrowser;
        const connected = typeof browser?.isConnected === 'function' ? await browser.isConnected() : browser?.connected;
        if (connected) await browser.close();
      })(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error('WhatsApp close timed out.'), { code: 'WHATSAPP_CLOSE_TIMEOUT' })), 15_000);
        timeout.unref?.();
      }),
    ]);
  } catch (error) {
    const browserProcess = instance.pupBrowser?.process?.();
    if (!browserProcess?.pid) throw error;
    if (browserProcess.exitCode !== null && browserProcess.exitCode !== undefined) return;
    const site = process.env.WHATSAPP_BROWSER_SITE || '';
    if (process.platform === 'linux' && process.env.WHATSAPP_BROWSER_WRAPPER && /^[a-z0-9-]+$/.test(site)) {
      const userMode = process.getuid() !== 0;
      const runtimeDirectory = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`;
      await execute('systemctl', [...(userMode ? ['--user'] : []), 'kill', '--signal=SIGKILL', `whatsapp-${site}-${browserProcess.pid}.scope`], {
        timeout: 5000,
        env: userMode ? { ...process.env, XDG_RUNTIME_DIR: runtimeDirectory, DBUS_SESSION_BUS_ADDRESS: `unix:path=${runtimeDirectory}/bus` } : process.env,
      });
    } else if (!browserProcess.kill('SIGKILL')) {
      throw error;
    }
  } finally { clearTimeout(timeout); }
}

export async function whatsAppBrowserOptions(options) {
  const wrapper = process.env.WHATSAPP_BROWSER_WRAPPER;
  if (!wrapper || process.platform !== 'linux') return options;
  const libraryRequire = createRequire(require.resolve('whatsapp-web.js'));
  const executable = options.executablePath || await libraryRequire('puppeteer').executablePath();
  return {
    ...options,
    executablePath: wrapper,
    env: { ...process.env, WHATSAPP_CHROME_REAL: executable },
  };
}

/** Keep dispatch intent durable; an interrupted dispatch is never replayed automatically. */
export function createWhatsAppDispatchJournal(directory, { maxPending = 1000, maxBytes = 128 * 1024 * 1024 } = {}) {
  let serial = Promise.resolve();
  const exclusive = (operation) => {
    const result = serial.then(operation);
    serial = result.catch(() => undefined);
    return result;
  };
  async function checkBudget(incomingBytes) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let pending = 0;
    let bytes = 0;
    for (const name of await readdir(directory)) {
      if (!/^(?:[a-f0-9-]{36}|[a-f0-9]{64})(?:\.submitted)?\.json$/.test(name)) continue;
      const file = nodePath.join(directory, name);
      const metadata = await stat(file);
      if (name.endsWith('.submitted.json')) {
        if (Date.now() - metadata.mtimeMs > 7 * 24 * 60 * 60_000) {
          await unlink(file);
          await unlink(file.replace(/\.submitted\.json$/, '.lock')).catch((error) => { if (error.code !== 'ENOENT') throw error; });
        }
      } else { pending += 1; bytes += metadata.size; }
    }
    if (pending >= maxPending || bytes + incomingBytes > maxBytes) {
      throw Object.assign(new Error('WhatsApp dispatch journal is full.'), { code: 'WHATSAPP_OUTBOX_FULL' });
    }
  }
  async function save(file, value) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temporary, file);
      if (process.platform !== 'win32') {
        const folder = await open(directory, 'r');
        try { await folder.sync(); } finally { await folder.close(); }
      }
    } catch (error) {
      await unlink(temporary).catch((cleanupError) => {
        if (cleanupError.code !== 'ENOENT') throw cleanupError;
      });
      throw error;
    }
  }
  return {
    async lookup(arguments_) {
      const key = dispatchContext.getStore();
      if (!key) return null;
      const id = createHash('sha256').update(`${key}\n${JSON.stringify(arguments_)}`).digest('hex');
      const file = nodePath.join(directory, `${id}.json`);
      try {
        const previous = JSON.parse(await readFile(file.replace(/\.json$/, '.submitted.json'), 'utf8'));
        return { file, job: previous, submitted: previous };
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      for (const candidate of [file, file.replace(/\.json$/, '.lock')]) {
        try { await stat(candidate); return { pending: true }; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return null;
    },
    begin(arguments_) { return exclusive(async () => {
      const key = dispatchContext.getStore();
      const id = key ? createHash('sha256').update(`${key}\n${JSON.stringify(arguments_)}`).digest('hex') : randomUUID();
      const file = nodePath.join(directory, `${id}.json`);
      if (key) {
        try {
          const previous = JSON.parse(await readFile(file.replace(/\.json$/, '.submitted.json'), 'utf8'));
          return { file, job: previous, submitted: previous };
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        try {
          await stat(file);
          throw Object.assign(new Error('تعذر تأكيد الإرسال السابق؛ لم تُكرر الرسالة.'), { code: 'WHATSAPP_DELIVERY_UNCONFIRMED', deliveryUnconfirmed: true });
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      const job = { id, state: 'dispatching', keyed: Boolean(key), createdAt: new Date().toISOString(), arguments: arguments_ };
      await checkBudget(Buffer.byteLength(JSON.stringify(job)));
      if (key) {
        try {
          const reservation = await open(file.replace(/\.json$/, '.lock'), 'wx', 0o600);
          try { await reservation.sync(); } finally { await reservation.close(); }
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          try {
            const previous = JSON.parse(await readFile(file.replace(/\.json$/, '.submitted.json'), 'utf8'));
            return { file, job: previous, submitted: previous };
          } catch (readError) {
            if (readError.code !== 'ENOENT') throw readError;
            throw Object.assign(new Error('تعذر تأكيد الإرسال السابق؛ لم تُكرر الرسالة.'), { code: 'WHATSAPP_DELIVERY_UNCONFIRMED', deliveryUnconfirmed: true });
          }
        }
      }
      try { await save(file, job); }
      catch (error) {
        if (key) await unlink(file.replace(/\.json$/, '.lock')).catch((cleanupError) => { if (cleanupError.code !== 'ENOENT') throw cleanupError; });
        throw error;
      }
      return { file, job };
    }); },
    complete(entry, message) { return exclusive(async () => {
      await save(entry.file.replace(/\.json$/, '.submitted.json'), {
        id: entry.job.id,
        keyed: entry.job.keyed === true,
        state: 'submitted',
        createdAt: entry.job.createdAt,
        submittedAt: new Date().toISOString(),
        messageId: message?.id?._serialized || null,
        ack: Number.isFinite(message?.ack) ? message.ack : null,
      });
      await unlink(entry.file).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }); },
    unconfirmed(entry) { return exclusive(async () => {
      await save(entry.file, { ...entry.job, state: 'unconfirmed', updatedAt: new Date().toISOString() });
    }); },
  };
}

/** Sleep preserves LocalAuth. Only an explicit disconnect may call logout(). */
export function createWhatsAppIdleSession({
  idleMs = 5 * 60_000,
  qrIdleMs = 2 * 60_000,
  onSuspend = () => {},
  onError = (error) => console.error('WhatsApp lifecycle failed:', error.code || error.name),
  journal,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  let client = null;
  let linked = false;
  let active = 0;
  let timer = null;
  let closing = null;
  let version = 0;

  function clear() {
    if (timer !== null) cancel(timer);
    timer = null;
  }
  function arm() {
    clear();
    if (!client || active || closing) return;
    timer = schedule(() => { void suspend().catch(onError); }, linked ? idleMs : qrIdleMs);
    timer?.unref?.();
  }
  async function suspend() {
    if (closing) return closing;
    if (!client || active) return false;
    clear();
    const previous = client;
    const previousLinked = linked;
    client = null;
    version += 1;
    closing = (async () => {
      onSuspend(previous, { linked: previousLinked });
      await previous.destroy();
      return true;
    })();
    try { return await closing; }
    finally { closing = null; }
  }
  async function runOperation(operation) {
    if (closing) await closing;
    if (!client) {
      const error = new Error('WhatsApp session is suspended.');
      error.code = 'WHATSAPP_SESSION_SUSPENDED';
      throw error;
    }
    active += 1;
    clear();
    try { return await operation(); }
    finally { active -= 1; arm(); }
  }
  async function inspectDispatch(arguments_) {
    const entry = await journal?.lookup(arguments_);
    if (!entry) return null;
    if (entry.submitted) {
      const previous = entry.submitted;
      if (Number(previous.ack) >= 2) return { id: { _serialized: previous.messageId }, ack: previous.ack };
      if (client && previous.messageId && typeof client.getMessageById === 'function') {
        try {
          const actual = await client.getMessageById(previous.messageId);
          if (actual && Number(actual.ack) >= 2) { await journal.complete(entry, actual); return actual; }
        } catch (error) { onError(error); }
      }
    }
    throw Object.assign(new Error('تعذر تأكيد الإرسال السابق؛ لم تُكرر الرسالة.'), { code: 'WHATSAPP_DELIVERY_UNCONFIRMED', deliveryUnconfirmed: true });
  }
  function attach(instance) {
    if (client || closing) throw new Error('WhatsApp session is already active.');
    client = instance;
    linked = false;
    const currentVersion = ++version;
    const submitted = new Map();
    const acknowledgments = new Map();
    instance.on('message_ack', (message, ack) => {
      const id = message?.id?._serialized;
      if (!id || !Number.isFinite(ack)) return;
      acknowledgments.set(id, Math.max(ack, acknowledgments.get(id) || 0));
      if (acknowledgments.size > 1000) acknowledgments.delete(acknowledgments.keys().next().value);
      const entry = submitted.get(id);
      if (entry && journal) void journal.complete(entry, { id: { _serialized: id }, ack }).catch(onError);
    });
    const originalDestroy = instance.destroy.bind(instance);
    let disposal;
    instance.destroy = (...arguments_) => {
      if (disposal) return disposal;
      const owned = client === instance;
      if (owned) {
        clear();
        client = null;
        version += 1;
      }
      disposal = destroyBrowser(instance, () => originalDestroy(...arguments_));
      if (owned) {
        const tracked = disposal.finally(() => { if (closing === tracked) closing = null; });
        closing = tracked;
        return tracked;
      }
      return disposal;
    };
    if (typeof instance.logout === 'function') {
      const originalLogout = instance.logout.bind(instance);
      instance.logout = async (...arguments_) => {
        try { return await originalLogout(...arguments_); }
        finally { await instance.destroy(); }
      };
    }
    for (const method of ['sendMessage', 'isRegisteredUser', 'getNumberId', 'getContactById', 'getChatById']) {
      if (typeof instance[method] !== 'function') continue;
      const operation = instance[method].bind(instance);
      instance[method] = (...arguments_) => runOperation(async () => {
        if (client !== instance) {
          const error = new Error('WhatsApp session is suspended.');
          error.code = 'WHATSAPP_SESSION_SUSPENDED';
          throw error;
        }
        let entry;
        if (method === 'sendMessage' && journal) entry = await journal.begin(arguments_);
        try {
          if (entry?.submitted) {
            const previous = entry.submitted;
            let cached = { id: { _serialized: previous.messageId }, ack: previous.ack || 0 };
            if (previous.messageId) {
              submitted.set(previous.messageId, entry);
              if (typeof instance.getMessageById === 'function') {
                try {
                  const actual = await instance.getMessageById(previous.messageId);
                  if (actual) { cached = actual; await journal.complete(entry, actual); }
                } catch (error) { onError(error); }
              }
            }
            return cached;
          }
          const result = await operation(...arguments_);
          if (entry) {
            const id = result?.id?._serialized;
            if (id) {
              submitted.set(id, entry);
              if (submitted.size > 1000) submitted.delete(submitted.keys().next().value);
            }
            await journal.complete(entry, {
              id: result?.id,
              ack: Math.max(result?.ack || 0, acknowledgments.get(id) || 0),
            });
          }
          return result;
        } catch (error) {
          if (entry) {
            await journal.unconfirmed(entry);
            error.deliveryUnconfirmed = true;
          }
          throw error;
        }
      });
    }
    instance.on('ready', () => {
      if (client !== instance || version !== currentVersion) return;
      linked = true;
      arm();
    });
    arm();
    return instance;
  }
  return { attach, suspend, inspectDispatch, use: runOperation, waitForClose: () => closing || Promise.resolve(), get active() { return active; } };
}
