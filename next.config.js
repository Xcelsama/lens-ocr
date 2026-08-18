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
  // tesseract.js does its own Node-vs-browser environment detection at
  // runtime, and webpack's bundling of it (rewriting requires, injecting
  // browser-ish polyfills for process/module) breaks that detection. That's
  // what produced the permanent "initializing tesseract" hang at 0% — it was
  // misdetecting itself as a browser worker and trying to fetch its WASM
  // core over the network instead of requiring it locally. Marking it
  // external tells webpack to leave it as a plain Node `require()` instead
  // of bundling it, so it behaves exactly as it would in a normal Node app.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'tesseract.js', 'tesseract.js-core'];
    }
    return config;
  },
};

module.exports = nextConfig;
