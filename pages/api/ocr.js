export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is missing GOOGLE_CLOUD_VISION_API_KEY. Add it in your Vercel project settings.',
    });
  }

  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'No image data received.' });
  }

  try {
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
              imageContext: { languageHints: [] },
            },
          ],
        }),
      }
    );

    const data = await visionRes.json();
    const result = data?.responses?.[0];

    if (result?.error) {
      return res.status(502).json({ error: result.error.message || 'Vision API error.' });
    }

    const text = result?.fullTextAnnotation?.text ?? '';
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach the Vision API.' });
  }
}
