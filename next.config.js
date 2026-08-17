/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // tesseract.js reads the bundled .traineddata files from disk at runtime
  // (not via require/import), so Next's automatic dependency tracing won't
  // pick them up on its own. Without this, they build fine locally but are
  // silently missing from the deployed Vercel function, and worker init
  // falls back to a CDN download in production.
  // NOTE: this option is stable/top-level as of Next.js 15. On 14.2.5 it
  // must stay under `experimental` — if you upgrade Next, move it back out.
  experimental: {
    outputFileTracingIncludes: {
      '/api/ocr': ['./lib/ocr/tessdata/**'],
    },
  },
};

module.exports = nextConfig;
