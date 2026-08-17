import { runOcr } from '../../lib/ocr/engine';

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

  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'No image data received.' });
  }

  let buffer;
  try {
    buffer = Buffer.from(image, 'base64');
  } catch {
    return res.status(400).json({ error: 'Image data is not valid base64.' });
  }
  if (!buffer.length) {
    return res.status(400).json({ error: 'Image data is empty.' });
  }

  try {
    const { text, confidence } = await runOcr(buffer);
    return res.status(200).json({ text, confidence });
  } catch (err) {
    console.error('OCR failed:', err);
    return res.status(500).json({ error: 'OCR processing failed.' });
  }
}
