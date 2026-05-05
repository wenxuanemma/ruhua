// pages/api/refine.js
// Stage 2: LoRA refinement — currently disabled for identity testing
// Returns InstantID output unchanged until identity is confirmed working

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { styledFaceUrl } = req.body;
  if (!styledFaceUrl) return res.status(400).json({ error: 'styledFaceUrl required' });

  // LoRA refinement temporarily disabled — testing identity preservation
  // Re-enable once identity is confirmed working with InstantID alone
  return res.status(200).json({ outputUrl: styledFaceUrl });
}
