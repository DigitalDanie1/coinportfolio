import { storeFromEnv, handleSync, MAX_BODY } from '../lib/sync-store.mjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Sync-Key');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) return res.status(413).json({ error: 'Payload too large' });
  const text = req.method === 'PUT' ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})) : '';
  const { status, body } = await handleSync({ method: req.method, key: req.headers['x-sync-key'], text, store: storeFromEnv() });
  res.status(status).json(body);
}
