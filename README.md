# Lens OCR

Batch OCR tool. Upload up to 20 images and download the extracted text as a single
`.txt` file. No server, no database — everything runs client-side in the browser,
and results live only in memory until you download them.

## Stack

- Next.js (Pages Router)
- Tailwind CSS
- Tesseract.js (browser, LSTM engine) for OCR — runs entirely client-side

## How it works

Each image is handed directly to Tesseract.js in the browser, no server round-trip.
A single Tesseract worker is created once per session and reused across every image
in the batch. On first use, the browser fetches Tesseract's WASM engine and English
language data from its default CDN (a few MB, cached afterward).

There's currently no image preprocessing — images go straight to Tesseract as-is.
**Canvas-based preprocessing (contrast correction, sharpening, upscaling small
images) will be added later** to improve accuracy on low-contrast or low-resolution
photos. For now this is deliberately kept minimal to keep the pipeline simple and
reliable.

See `pages/index.js`.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
```

No environment variables or special config required — this is a static Next.js
app with no server-side OCR route.

## Project structure

```
pages/
  index.js        UI + OCR: upload, Tesseract.js worker, results, .txt export
  _app.js
  _document.js
styles/
  globals.css
```

## Limits

- 20 images per session, enforced client-side
- OCR speed depends on the visitor's device — Tesseract.js is CPU-bound
- Since a single worker handles one image at a time, images in a batch are
  processed sequentially rather than in parallel
- No preprocessing yet (see "How it works" above) — accuracy may suffer on
  low-contrast, skewed, or very low-resolution images until that's added
