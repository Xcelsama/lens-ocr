# Lens OCR

Batch OCR tool. Upload up to 20 images and download the extracted text as a single `.txt` file. No database — processing happens per-request in a serverless function, results live only in the browser until downloaded.

## Stack

- Next.js (Pages Router)
- Tailwind CSS
- Google Cloud Vision API (`TEXT_DETECTION`)

## Setup

```bash
npm install
cp .env.example .env.local
```

Add your Google Cloud Vision API key to `.env.local`:

```
GOOGLE_CLOUD_VISION_API_KEY=your_key_here
```

```bash
npm run dev
```

Open http://localhost:3000.

## Deployment (Vercel)

```bash
npm i -g vercel
vercel
```

In the Vercel project settings, add `GOOGLE_CLOUD_VISION_API_KEY` as an environment variable, then redeploy.

## Project structure

```
pages/
  index.js       UI: upload, processing state, results, .txt export
  api/ocr.js      serverless endpoint that calls Cloud Vision
  _app.js
  _document.js
styles/
  globals.css
```

## Limits

- 20 images per session, enforced client-side
- Images are downscaled to a max 1800px edge before upload
- Vercel serverless function timeout applies per image (10s Hobby / 15s Pro)
