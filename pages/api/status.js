// pages/api/status.js
// Polls Replicate prediction status — called by client to avoid Vercel 60s timeout

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });

  const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: {
      'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
    },
  });

  if (!response.ok) {
    const err = await response.text();
    return res.status(500).json({ error: `Replicate error: ${err}` });
  }

  const prediction = await response.json();

  if (prediction.status === 'succeeded') {
    const outputUrl = Array.isArray(prediction.output)
      ? prediction.output[0]
      : prediction.output;
    return res.status(200).json({ status: 'succeeded', outputUrl });
  }

  if (prediction.status === 'failed') {
    return res.status(200).json({ status: 'failed', error: prediction.error || 'Generation failed' });
  }

  // Still running
  return res.status(200).json({ status: prediction.status });
}
