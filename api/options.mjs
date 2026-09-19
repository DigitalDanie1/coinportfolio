import { service, init, cors, errJson } from './_service.mjs';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' || req.headers['x-portfolio-client'] !== '1') return res.status(403).json({ error: 'Forbidden' });
  try {
    await init();
    const input = req.body || {};
    if (!Array.isArray(input.positions) || input.positions.length > 100) throw new Error('Invalid positions');
    const result = await service.optionQuotes(input.positions.map(p => ({
      id: String(p.id).slice(0, 150), ticker: String(p.ticker).slice(0, 30),
      venue: String(p.venue || '').slice(0, 40), expiry: String(p.expiry || '').slice(0, 10),
      strike: Number(p.strike), kind: p.kind === 'put' ? 'put' : 'call',
      instrument: String(p.instrument || '').slice(0, 100)
    })));
    res.json(result);
  } catch (e) { errJson(res, e); }
}
