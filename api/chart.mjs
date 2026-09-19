import { service, init, cors, sanitize, errJson } from './_service.mjs';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' || req.headers['x-portfolio-client'] !== '1') return res.status(403).json({ error: 'Forbidden' });
  try {
    await init();
    const [asset] = sanitize([(req.body || {}).asset]);
    res.json(await service.chartSources(asset));
  } catch (e) { errJson(res, e); }
}
