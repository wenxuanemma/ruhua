export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { styledFaceUrl, gender } = req.body;
  if (!styledFaceUrl) return res.status(400).json({ error: 'styledFaceUrl required' });

  const LOCAL_SERVER = process.env.LOCAL_INFERENCE_URL;
  if (!LOCAL_SERVER) return res.status(200).json({ outputUrl: styledFaceUrl });

  try {
    const imgRes = await fetch(styledFaceUrl);
    if (!imgRes.ok) throw new Error('Failed to fetch styled face');
    const imgBuf = await imgRes.arrayBuffer();
    const imgB64 = `data:image/jpeg;base64,${Buffer.from(imgBuf).toString('base64')}`;

    const genderNeg = gender === 'man'
      ? 'female, woman, feminine, dress'
      : 'male, man, masculine, beard, mustache, stubble, facial hair';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const loraRes = await fetch(`${LOCAL_SERVER}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: 'gongbi_portrait, Tang dynasty Chinese court painting, gongbi fine line brushwork, flat matte warm skin, warm ivory complexion, golden undertone, warm ochre and vermillion mineral pigments, no subsurface scattering, no specular highlights, no shadows, no shading, flat even lighting, warm amber light, painted on silk, meticulous detail, traditional Chinese figure painting, museum quality, 2D flat painting, warm color palette',
        negative_prompt: `photorealistic, photograph, 3d render, 3d cg, subsurface scattering, specular highlight, rim light, dramatic lighting, chiaroscuro, shadow, depth of field, bokeh, modern, anime, ukiyo-e, oil painting, western art, european, japanese style, glasses, earrings, jewelry, braids, black and white, grayscale, blurry, cold, pale, ghostly, desaturated, blue tones, gray tones, ${genderNeg}`,
        init_image: imgB64,
        strength: 0.45,
        steps: 20,
        guidance: 8.0,
        width: 640,
        height: 640,
        seed: -1,
      }),
    });
    clearTimeout(timeout);

    if (!loraRes.ok) {
      console.warn('LoRA server error, using InstantID output');
      return res.status(200).json({ outputUrl: styledFaceUrl });
    }

    const loraBuf = Buffer.from(await loraRes.arrayBuffer());
    const outputUrl = `data:image/png;base64,${loraBuf.toString('base64')}`;
    return res.status(200).json({ outputUrl });

  } catch (e) {
    console.warn('Refine failed:', e.message);
    return res.status(200).json({ outputUrl: styledFaceUrl });
  }
}
