// pages/api/face-regions.js
// Serves current FACE_REGIONS from composite.js
import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  try {
    const compositePath = path.join(process.cwd(), 'pages/api/composite.js');
    const code = fs.readFileSync(compositePath, 'utf8');

    // Extract FACE_REGIONS object from the file
    const match = code.match(/const FACE_REGIONS\s*=\s*(\{[\s\S]*?\n\};)/);
    if (!match) return res.status(404).json({ error: 'FACE_REGIONS not found' });

    // Parse it safely using Function
    const regions = new Function(`return ${match[1].replace(/;$/, '')}`)();
    res.status(200).json(regions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
