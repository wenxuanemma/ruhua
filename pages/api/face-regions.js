// pages/api/face-regions.js
// Serves current FACE_REGIONS - reads file dynamically to avoid module cache
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), 'lib/faceRegions.js');
    const code = fs.readFileSync(filePath, 'utf8');
    // Extract FACE_REGIONS using Function evaluation
    const match = code.match(/export const FACE_REGIONS\s*=\s*(\{[\s\S]*?\n\};)/);
    if (!match) return res.status(404).json({ error: 'FACE_REGIONS not found' });
    const regions = new Function(`return ${match[1].replace(/;$/, '')}`)();
    res.status(200).json(regions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
