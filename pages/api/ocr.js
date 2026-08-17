import { runOcr } from '../../lib/ocr/engine';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
  // Pages Router functions default to a short platform timeout on most
  // hosts; this pipeline (preprocess + OCR, sometimes twice) can run past
  // that on larger images. Raise it if your host supports per-route config
  // (e.g. Vercel Pro), and keep the in-code timeout below as a hard backstop
  // either way so the client always gets JSON back instead of a raw
  // platform error page.
  maxDuration: 55,
};

const REQUEST_TIMEOUT_MS = 45000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('OCR_TIMEOUT')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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

  const progress = { stage: 'starting' };
  try {
    const { text, confidence } = await withTimeout(runOcr(buffer, progress), REQUEST_TIMEOUT_MS);
    return res.status(200).json({ text, confidence, debug: progress });
  } catch (err) {
    console.error('OCR failed:', err, progress);
    if (err.message === 'OCR_TIMEOUT') {
      return res.status(504).json({
        error: 'OCR took too long and was cancelled. Try a smaller image.',
        debug: progress,
      });
    }
    return res.status(500).json({ error: 'OCR processing failed.', debug: progress });
  }
}
