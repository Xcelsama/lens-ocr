# Lens OCR

Batch OCR tool. Upload up to 20 images and download the extracted text as a single `.txt` file. No database — processing happens per-request in a serverless function, results live only in the browser until downloaded.

## Stack

- Next.js (Pages Router)
- Tailwind CSS
- Tesseract.js (Node, LSTM engine) for OCR
- Sharp for pre-recognition image processing

## OCR pipeline

Each image is processed server-side before Tesseract ever sees it, to close the gap
with hosted OCR services:

1. **Orientation** — EXIF auto-rotate, then an OSD detection pass corrects residual
   90/180/270° rotation.
2. **Contrast** — grayscale + CLAHE (adaptive contrast) to even out shadows and
   uneven lighting, plus a mild sharpen.
3. **Resolution** — images below ~1600px on the long edge are upscaled (capped at 3x)
   since Tesseract's accuracy drops sharply on low-resolution text.
4. **Binarization** — a second variant is produced using an Otsu-computed threshold,
   which tends to outperform the grayscale pass on flat, high-contrast text (screenshots,
   scans).
5. **Adaptive dual-pass** — the grayscale variant is recognized first; the binarized
   variant is only run if the first pass's confidence is below 92, and whichever scores
   higher is kept.
6. **Reconstruction** — output text is rebuilt from Tesseract's word/line/paragraph data:
   low-confidence noise tokens are dropped, hyphenated line breaks are rejoined, and
   paragraphs are preserved instead of returning one flat blob.

See `lib/ocr/`.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. No API key is required.

Optionally copy `.env.example` to `.env.local` to change the OCR language
(`OCR_LANGUAGE=eng+fra`, etc.) — defaults to English.

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
```

No environment variables are required. Sharp ships prebuilt Linux binaries that
Vercel's build step picks up automatically.

## Project structure

```
pages/
  index.js        UI: upload, processing state, results, .txt export
  api/ocr.js       serverless endpoint that runs the OCR pipeline
  _app.js
  _document.js
lib/ocr/
  preprocess.js    Sharp: orientation, CLAHE, upscaling, Otsu binarization
  engine.js        Tesseract.js worker lifecycle, OSD rotation, dual-pass recognition
  postprocess.js   confidence-filtered, paragraph-aware text reconstruction
styles/
  globals.css
```

## Limits

- 20 images per session, enforced client-side
- Images are downscaled to a max 1800px edge before upload
- Tesseract.js is CPU-bound and slower than a hosted OCR API, especially when the
  dual-pass fallback runs — the Vercel serverless function timeout applies per image
  (10s Hobby / 15s Pro). For heavier batches, raise `maxDuration` on a Pro plan or
  self-host.
- The Tesseract worker and its language data are cached per warm serverless
  instance (`/tmp/tesseract-cache`), so the first request after a cold start is
  the slowest.
