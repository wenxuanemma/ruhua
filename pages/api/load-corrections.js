// pages/api/load-corrections.js
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const filePath = path.join(process.cwd(), 'museum-paintings/face-corrections.json');
  if (!fs.existsSync(filePath)) return res.status(200).json({});
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // Strip _readme and other non-painting keys
    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([k]) => !k.startsWith('_'))
    );
    res.status(200).json(cleaned);
  } catch {
    res.status(200).json({});
  }
}
