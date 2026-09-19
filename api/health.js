import { cors } from './_service.js';

export default function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.json({ ok: true, service: 'coin-portfolio', providers: ['CoinGecko', 'CoinPaprika', 'Google News', 'Deribit public', 'Hyperliquid'], accountProviders: ['Hyperliquid'], updatedAt: Date.now() });
}
