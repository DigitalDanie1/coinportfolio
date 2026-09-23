import { DataService } from '../lib/data-service.mjs';

export const service = new DataService({ cacheDir: '/tmp/coin-portfolio-cache' });
let restored = false;

export async function init() {
  if (!restored) { await service.restore(); restored = true; }
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Portfolio-Client');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
}

export function sanitize(list) {
  if (!Array.isArray(list) || list.length > 150) throw new Error('Invalid asset list');
  return list.map(x => ({
    id: String(x.id || '').slice(0, 150),
    name: String(x.name || '').slice(0, 120),
    ticker: String(x.ticker || '').slice(0, 50),
    gecko: typeof x.gecko === 'string' ? x.gecko.slice(0, 150) : null,
    providerId: typeof x.providerId === 'string' ? x.providerId.slice(0, 150) : null,
    dex: x.dex ? { chain: String(x.dex.chain || '').slice(0, 40), pair: String(x.dex.pair || '').slice(0, 100), token: String(x.dex.token || '').slice(0, 100) } : null,
    equity: x.equity && typeof x.equity.symbol === 'string' ? { symbol: x.equity.symbol.slice(0, 20) } : null,
    cat: String(x.cat || '')
  }));
}

export function sanitizeNewsAssets(list) {
  if (!Array.isArray(list) || list.length > 200) throw new Error('Invalid asset list');
  return list.map(x => ({
    key: String(x.key || x.id || '').slice(0, 160),
    name: String(x.name || '').slice(0, 120),
    ticker: String(x.ticker || '').slice(0, 50)
  })).filter(x => x.key);
}

export function errJson(res, e) {
  res.status(e.status || 502).json({
    error: e.status === 429 ? '데이터 소스 요청 제한' : '자동 데이터 갱신 실패',
    detail: e.message?.startsWith('Invalid') ? e.message : undefined
  });
}
