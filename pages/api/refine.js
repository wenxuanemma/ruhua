// LoRA is now used in generate.js as txt2img style base
// refine.js is a passthrough
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { styledFaceUrl } = req.body;
  if (!styledFaceUrl) return res.status(400).json({ error: 'styledFaceUrl required' });
  return res.status(200).json({ outputUrl: styledFaceUrl });
}
