// pages/api/status.js
//
// GET /api/status?id=PREDICTION_ID
//
// Returns:
//   { status: 'starting' | 'processing' | 'succeeded' | 'failed', outputUrl? }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id is required' });

  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch prediction status' });
    }

    const prediction = await response.json();

    // Normalize output
    const result = {
      status: prediction.status, // 'starting' | 'processing' | 'succeeded' | 'failed'
    };

    if (prediction.status === 'succeeded') {
      // InstantID returns an array; take first image
      result.outputUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;
    }

    if (prediction.status === 'failed') {
      result.error = prediction.error || 'Generation failed';
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error('Status error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
