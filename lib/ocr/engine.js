import path from 'path';
import { createWorker, PSM } from 'tesseract.js';
import { buildOcrVariants, normalizeOrientation, rotateImage } from './preprocess';
import { blocksToText } from './postprocess';

const LANGUAGE = process.env.OCR_LANGUAGE || 'eng';
const CACHE_PATH = '/tmp/tesseract-cache';
// Bundled locally so worker init never has to fetch language data from a CDN
// on a cold start — that network round trip was the actual bottleneck (see
// the [ocr] timing logs). These are raw, uncompressed .traineddata files, so
// gzip must be off.
const LANG_PATH = path.join(process.cwd(), 'lib', 'ocr', 'tessdata');
const ROTATION_CONFIDENCE_FLOOR = 6;
// Below this, the primary pass is treated as genuinely unreliable and worth a
// second attempt. Short strings (a bare URL, a phone number) naturally score
// lower than prose without being wrong, so this used to sit at 92 and ended
// up re-running almost every simple image.
const RETRY_CONFIDENCE_FLOOR = 65;

let osdAvailable = false;
const waiters = [];
const MAX_POOL_SIZE = Number(process.env.OCR_WORKER_POOL_SIZE || 2);
let pool = [];
let pendingCreations = 0;

async function createOcrWorker() {
  const start = Date.now();
  try {
    const worker = await createWorker(`${LANGUAGE}+osd`, undefined, {
      cachePath: CACHE_PATH,
      langPath: LANG_PATH,
      gzip: false,
    });
    osdAvailable = true;
    await worker.setParameters({ preserve_interword_spaces: '1' });
    console.log(`[ocr] worker init (eng+osd, local langPath) took ${Date.now() - start}ms`);
    return worker;
  } catch (err) {
    osdAvailable = false;
    console.warn(`[ocr] eng+osd worker init failed after ${Date.now() - start}ms, falling back to eng only:`, err.message);
    const fallbackStart = Date.now();
    const worker = await createWorker(LANGUAGE, undefined, {
      cachePath: CACHE_PATH,
      langPath: LANG_PATH,
      gzip: false,
    });
    await worker.setParameters({ preserve_interword_spaces: '1' });
    console.log(`[ocr] worker init (eng only, fallback, local langPath) took ${Date.now() - fallbackStart}ms`);
    return worker;
  }
}

// Grows the pool one worker at a time, only when there's real demand for it.
// Eagerly spinning up MAX_POOL_SIZE workers on the very first request means a
// single image pays for N cold-start language-data downloads in parallel
// instead of one — worse, not better. A lone request should only ever create
// one worker.
async function acquireWorker() {
  const free = pool.find((entry) => !entry.busy);
  if (free) {
    free.busy = true;
    return free;
  }

  if (pool.length + pendingCreations < MAX_POOL_SIZE) {
    pendingCreations += 1;
    try {
      const worker = await createOcrWorker();
      const entry = { worker, busy: true };
      pool.push(entry);
      return entry;
    } finally {
      pendingCreations -= 1;
    }
  }

  return new Promise((resolve) => waiters.push(resolve));
}

function releaseWorker(entry) {
  const next = waiters.shift();
  if (next) {
    next(entry);
  } else {
    entry.busy = false;
  }
}

function normalizeAngle(degrees) {
  return (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
}

async function detectRotation(worker, buffer) {
  if (!osdAvailable) return 0;
  try {
    const { data } = await worker.detect(buffer);
    if (!data || data.orientation_confidence < ROTATION_CONFIDENCE_FLOOR) return 0;
    return normalizeAngle(data.orientation_degrees);
  } catch {
    return 0;
  }
}

async function recognize(worker, buffer) {
  const { data } = await worker.recognize(buffer, {}, { text: true, blocks: true });
  return data;
}

export async function runOcr(inputBuffer, progress = {}) {
  const t0 = Date.now();
  progress.stage = 'acquiring-worker';

  const entry = await acquireWorker();
  const tWorkerReady = Date.now();
  progress.stage = 'worker-ready';
  progress.workerMs = tWorkerReady - t0;
  const { worker } = entry;

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });

    progress.stage = 'preprocessing';
    const oriented = await normalizeOrientation(inputBuffer);
    let variants = await buildOcrVariants(oriented);
    const tPreprocessed = Date.now();
    progress.stage = 'preprocessed';
    progress.preprocessMs = tPreprocessed - tWorkerReady;

    progress.stage = 'checking-rotation';
    const rotation = await detectRotation(worker, variants.cleanBuffer);
    if (rotation) {
      const rotated = await rotateImage(oriented, rotation);
      variants = await buildOcrVariants(rotated);
    }
    const tRotationChecked = Date.now();
    progress.stage = 'rotation-checked';
    progress.rotationMs = tRotationChecked - tPreprocessed;

    progress.stage = 'recognizing-primary';
    const primary = await recognize(worker, variants.cleanBuffer);
    let best = primary;

    if (primary.confidence < RETRY_CONFIDENCE_FLOOR) {
      progress.stage = 'recognizing-secondary';
      const secondary = await recognize(worker, variants.binarizedBuffer);
      if (secondary.confidence > best.confidence) best = secondary;
    }
    const tRecognized = Date.now();
    progress.stage = 'done';
    progress.recognizeMs = tRecognized - tRotationChecked;
    progress.totalMs = tRecognized - t0;

    console.log(
      `[ocr] timings(ms) worker=${progress.workerMs} preprocess=${progress.preprocessMs} ` +
        `rotation=${progress.rotationMs} recognize=${progress.recognizeMs} total=${progress.totalMs}`
    );

    return {
      text: blocksToText(best.blocks) || '',
      confidence: Number.isFinite(best.confidence) ? Math.round(best.confidence) : null,
    };
  } finally {
    releaseWorker(entry);
  }
}
