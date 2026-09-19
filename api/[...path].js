import { DataService } from '../lib/data-service.mjs';

const service = new DataService({ cacheDir: '/tmp/coin-portfolio-cache' });
let restored = false;

function sanitize(list) {
  if (!Array.isArray(list) || list.length > 150) throw new Error('Invalid asset list');
  return list.map(x => ({
    id: String(x.id || '').slice(0, 150),
    name: String(x.name || '').slice(0, 120),
    ticker: String(x.ticker || '').slice(0, 50),
    gecko: typeof x.gecko === 'string' ? x.gecko.slice(0, 150) : null,
    providerId: typeof x.providerId === 'string' ? x.providerId.slice(0, 150) : null,
    dex: x.dex ? { chain: String(x.dex.chain || '').slice(0, 40), pair: String(x.dex.pair || '').slice(0, 100), token: String(x.dex.token || '').slice(0, 100) } : null,
    cat: String(x.cat || '')
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Portfolio-Client');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!restored) { await service.restore(); restored = true; }

  const route = '/' + (Array.isArray(req.query.path) ? req.query.path.join('/') : '');

  try {
    if (req.method === 'GET' && route === '/health') {
      return res.json({ ok: true, service: 'coin-portfolio', providers: ['CoinGecko', 'CoinPaprika', 'Google News', 'Deribit public', 'Hyperliquid'], accountProviders: ['Hyperliquid'], updatedAt: Date.now() });
    }

    if (req.method !== 'POST') return res.status(404).json({ error: 'Not found' });
    if (req.headers['x-portfolio-client'] !== '1') return res.status(403).json({ error: 'Client header required' });

    const input = req.body || {};
    let result;

    if (route === '/markets') {
      result = await service.markets(sanitize(input.coins));
    } else if (route === '/chart') {
      const [asset] = sanitize([input.asset]);
      result = await service.chartSources(asset);
    } else if (route === '/news') {
      const [asset] = sanitize([input.asset]);
      result = await service.news(asset);
    } else if (route === '/options') {
      if (!Array.isArray(input.positions) || input.positions.length > 100) throw new Error('Invalid positions');
      result = await service.optionQuotes(input.positions.map(p => ({
        id: String(p.id).slice(0, 150), ticker: String(p.ticker).slice(0, 30),
        venue: String(p.venue || '').slice(0, 40), expiry: String(p.expiry || '').slice(0, 10),
        strike: Number(p.strike), kind: p.kind === 'put' ? 'put' : 'call',
        instrument: String(p.instrument || '').slice(0, 100)
      })));
    } else if (route === '/perps') {
      result = await service.perpMarkets();
    } else if (route === '/account/hyperliquid') {
      result = await service.hyperliquidAccount(String(input.address || ''));
    } else {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json(result);
  } catch (e) {
    res.status(e.status || 502).json({
      error: e.status === 429 ? '데이터 소스 요청 제한' : '자동 데이터 갱신 실패',
      detail: e.message?.startsWith('Invalid') ? e.message : undefined
    });
  }
}
