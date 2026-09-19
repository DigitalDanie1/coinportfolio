export default function handler(req, res) {
  res.json({ pong: true, t: Date.now() });
}
