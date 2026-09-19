export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.json({ ok: true, service: 'coin-portfolio', updatedAt: Date.now() });
}
