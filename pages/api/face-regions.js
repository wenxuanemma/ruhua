// pages/api/face-regions.js
// Serves current FACE_REGIONS from the single source of truth
import { FACE_REGIONS } from '../../lib/faceRegions.js';

export default function handler(req, res) {
  res.status(200).json(FACE_REGIONS);
}
