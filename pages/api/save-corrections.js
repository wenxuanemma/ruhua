// pages/api/save-corrections.js
// GET: load face-corrections.json
// POST: save face-corrections.json
import fs from 'fs';
import path from 'path';

const CORRECTIONS_PATH = path.join(process.cwd(), 'museum-paintings/face-corrections.json');

export default function handler(req, res) {
  if (req.method === 'GET') {
    if (!fs.existsSync(CORRECTIONS_PATH)) {
      return res.status(200).json({});
    }
    const data = JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf8'));
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const corrections = req.body;
    if (!corrections || typeof corrections !== 'object') {
      return res.status(400).json({ error: 'Invalid body' });
    }
    fs.writeFileSync(CORRECTIONS_PATH, JSON.stringify(corrections, null, 2), 'utf8');
    return res.status(200).json({ ok: true, count: Object.keys(corrections).length });
  }

  res.status(405).end();
}
