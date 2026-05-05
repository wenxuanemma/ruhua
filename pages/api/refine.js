// pages/api/refine.js
// Stage 2 of generation: apply local LoRA gongbi style on top of InstantID output
// Called separately from generate.js to avoid Vercel 60s timeout

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { styledFaceUrl } = req.body;
  if (!styledFaceUrl) return res.status(400).json({ error: 'styledFaceUrl required' });

  const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;
  if (!LOCAL_SERVER) return res.status(200).json({ outputUrl: styledFaceUrl }); // passthrough if not configured

  try {
    // Fetch InstantID result
    const imgRes = await fetch(styledFaceUrl);
    if (!imgRes.ok) throw new Error('Failed to fetch styled face');
    const imgBuf = await imgRes.arrayBuffer();
    const imgB64 = `data:image/jpeg;base64,${Buffer.from(imgBuf).toString('base64')}`;

    // Call local LoRA server
    const loraRes = await fetch(`${LOCAL_SERVER}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'gongbi_portrait, portrait of a person, Tang dynasty Chinese court painting style, flat matte skin, warm ochre mineral pigments on silk, fine brushwork, aged silk texture, soft even lighting, no specular highlights, traditional Chinese figure painting',
        negative_prompt: 'photorealistic, photograph, modern, anime, ukiyo-e, japanese style, 3d render, glasses, earrings, jewelry, braids, black and white, grayscale, blurry',
        init_image: imgB64,
        strength: 0.20,  // lower = more identity preservation from InstantID
        steps: 30,
        guidance: 7.0,
        width: 640,
        height: 640,
        seed: Math.floor(Math.random() * 2**32),
      }),
    });

    if (!loraRes.ok) {
      console.warn('LoRA server failed, using InstantID output');
      return res.status(200).json({ outputUrl: styledFaceUrl });
    }

    // Return LoRA output directly — composite.js handles the crop
    const loraBuf = Buffer.from(await loraRes.arrayBuffer());
    const outputUrl = `data:image/png;base64,${loraBuf.toString('base64')}`;
    return res.status(200).json({ outputUrl });

  } catch (e) {
    console.warn('Refine failed, using InstantID output:', e.message);
    return res.status(200).json({ outputUrl: styledFaceUrl });
  }
}
