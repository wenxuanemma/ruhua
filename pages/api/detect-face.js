// pages/api/detect-face.js
// Proxy for MediaPipe face detection on ersha, callable from client-side calibrate tool.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;
  if (!LOCAL_SERVER) return res.status(503).json({ error: 'LOCAL_INFERENCE_URL not set' });

  try {
    const r = await fetch(`${LOCAL_SERVER}/detect-face-mp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    return res.status(r.ok ? 200 : 500).json(data);
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
