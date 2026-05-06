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
    if (!imgRes.ok) throw new Error('Failed to fetch');
    const imgBuf = await imgRes.arrayBuffer();
    const imgB64 = `data:image/jpeg;base64,${Buffer.from(imgBuf).toString('base64')}`;

    const genderNeg = gender === 'man'
      ? 'female, woman, feminine'
      : 'male, man, masculine, beard, mustache, stubble, facial hair';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const loraRes = await fetch(`${LOCAL_SERVER}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        prompt: 'gongbi_portrait, Tang dynasty Chinese court painting, gongbi fine line brushwork, flat 2D matte warm skin, warm ochre and vermillion mineral pigments, no subsurface scattering, no specular highlights, no shadows, flat even lighting, painted on silk, traditional Chinese figure painting',
        negative_prompt: `photorealistic, 3d render, subsurface scattering, specular highlight, shadow, oil painting, western art, european, japanese, anime, ${genderNeg}`,
        init_image: imgB64,
        strength: 0.30,
        steps: 20,
        guidance: 7.5,
        width: 640,
        height: 640,
        seed: -1,
      }),
    });
    clearTimeout(timeout);

    if (!loraRes.ok) return res.status(200).json({ outputUrl: styledFaceUrl });

    const loraBuf = Buffer.from(await loraRes.arrayBuffer());
    return res.status(200).json({ outputUrl: `data:image/png;base64,${loraBuf.toString('base64')}` });

  } catch (e) {
    console.warn('Refine failed:', e.message);
    return res.status(200).json({ outputUrl: styledFaceUrl });
  }
}
