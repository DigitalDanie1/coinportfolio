// Server side of cross-device sync: key hashing, storage backends, and the request handler.
// The raw sync key is never a storage key or logged; storage is keyed by sha256(key).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_BODY = 900_000; // stays under Upstash's 1MB request cap once wrapped in a command
const KEY_RE = /^[A-Za-z0-9_-]{22,128}$/; // >=128 bits as base64url

export const hashKey = key => crypto.createHash('sha256').update(String(key)).digest('hex');
export const storageKey = key => 'cp:sync:' + hashKey(key);

// Atomic compare-and-set on the rev counter.
const CAS = `local r=tonumber(redis.call('HGET',KEYS[1],'rev') or '0')
if r~=tonumber(ARGV[1]) then return {0,r,redis.call('HGET',KEYS[1],'data') or ''} end
redis.call('HSET',KEYS[1],'rev',r+1,'data',ARGV[2])
return {1,r+1,''}`;

export class UpstashStore {
  constructor(url, token, fetchImpl = fetch) { this.url = url.replace(/\/$/, ''); this.token = token; this.fetch = fetchImpl; }
  async cmd(args) {
    const res = await this.fetch(this.url, { method: 'POST', headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error('store error');
    return out.result;
  }
  async get(sk) {
    const [rev, data] = await this.cmd(['HMGET', sk, 'rev', 'data']);
    return { rev: Number(rev || 0), data: data || null };
  }
  async put(sk, baseRev, data) {
    const [ok, rev, current] = await this.cmd(['EVAL', CAS, '1', sk, String(baseRev), data]);
    return { ok: ok === 1, rev: Number(rev), data: current || null };
  }
}

// Dev-only: used by server.mjs when no Upstash env is present. Single process, so a promise chain is enough.
export class FileStore {
  constructor(dir) { this.dir = dir; this.chain = Promise.resolve(); }
  file(sk) { return path.join(this.dir, sk.replace(/[^a-z0-9]/gi, '_') + '.json'); }
  async get(sk) {
    try { const o = JSON.parse(await fs.readFile(this.file(sk), 'utf8')); return { rev: o.rev, data: o.data }; }
    catch { return { rev: 0, data: null }; }
  }
  put(sk, baseRev, data) {
    const run = async () => {
      const cur = await this.get(sk);
      if (cur.rev !== baseRev) return { ok: false, rev: cur.rev, data: cur.data };
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(this.file(sk), JSON.stringify({ rev: cur.rev + 1, data }));
      return { ok: true, rev: cur.rev + 1, data: null };
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }
}

export function storeFromEnv(env = process.env, fetchImpl = fetch) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new UpstashStore(url, token, fetchImpl) : null;
}

// Pure request handler: returns {status, body}. `key` is the X-Sync-Key header, `text` the raw body.
export async function handleSync({ method, key, text, store }) {
  if (!store) return { status: 503, body: { configured: false } };
  if (method === 'GET' && !key) return { status: 200, body: { configured: true } };
  if (!key || !KEY_RE.test(key)) return { status: 401, body: { error: 'Sync key required' } };
  const sk = storageKey(key);
  try {
    if (method === 'GET') {
      const { rev, data } = await store.get(sk);
      return { status: 200, body: { configured: true, rev, doc: data ? JSON.parse(data) : null } };
    }
    if (method === 'PUT') {
      if (Buffer.byteLength(text || '') > MAX_BODY) return { status: 413, body: { error: 'Payload too large' } };
      let input;
      try { input = JSON.parse(text); } catch { return { status: 400, body: { error: 'Invalid JSON' } }; }
      const doc = input && input.doc;
      if (!Number.isInteger(input && input.baseRev) || input.baseRev < 0 || !doc || typeof doc !== 'object' || !doc.recs || typeof doc.recs !== 'object')
        return { status: 400, body: { error: 'Invalid sync document' } };
      const res = await store.put(sk, input.baseRev, JSON.stringify(doc));
      if (res.ok) return { status: 200, body: { configured: true, rev: res.rev } };
      return { status: 409, body: { configured: true, rev: res.rev, doc: res.data ? JSON.parse(res.data) : null } };
    }
    return { status: 405, body: { error: 'Method not allowed' } };
  } catch {
    return { status: 502, body: { error: '동기화 저장소 오류' } };
  }
}
