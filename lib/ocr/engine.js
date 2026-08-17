import { createWorker, PSM } from 'tesseract.js';
import { buildOcrVariants, normalizeOrientation, rotateImage } from './preprocess';
import { blocksToText } from './postprocess';

const LANGUAGE = process.env.OCR_LANGUAGE || 'eng';
const CACHE_PATH = '/tmp/tesseract-cache';
const ROTATION_CONFIDENCE_FLOOR = 6;
// Below this, the primary pass is treated as genuinely unreliable and worth a
// second attempt. Short strings (a bare URL, a phone number) naturally score
// lower than prose without being wrong, so this used to sit at 92 and ended
// up re-running almost every simple image.
const RETRY_CONFIDENCE_FLOOR = 65;
const WORKER_POOL_SIZE = Number(process.env.OCR_WORKER_POOL_SIZE || 2);

let poolPromise = null;
let osdAvailable = false;
const waiters = [];

async function createOcrWorker() {
  try {
    const worker = await createWorker(`${LANGUAGE}+osd`, undefined, { cachePath: CACHE_PATH });
    osdAvailable = true;
    await worker.setParameters({ preserve_interword_spaces: '1' });
    return worker;
  } catch {
    osdAvailable = false;
    const worker = await createWorker(LANGUAGE, undefined, { cachePath: CACHE_PATH });
    await worker.setParameters({ preserve_interword_spaces: '1' });
    return worker;
  }
}

async function initPool() {
  const workers = await Promise.all(
    Array.from({ length: WORKER_POOL_SIZE }, () => createOcrWorker())
  );
  return workers.map((worker) => ({ worker, busy: false }));
}

function getPool() {
  if (!poolPromise) poolPromise = initPool();
  return poolPromise;
}

// Tesseract.js workers can only run one recognize/detect call at a time, so a
// single shared worker forces concurrent requests to queue behind each other.
// This hands out whichever pool entry is free, and queues callers only when
// every worker is genuinely busy.
async function acquireWorker() {
  const pool = await getPool();
  const free = pool.find((entry) => !entry.busy);
  if (free) {
    free.busy = true;
    return free;
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

export async function runOcr(inputBuffer) {
  const entry = await acquireWorker();
  const { worker } = entry;

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });

    const oriented = await normalizeOrientation(inputBuffer);
    let variants = await buildOcrVariants(oriented);

    const rotation = await detectRotation(worker, variants.cleanBuffer);
    if (rotation) {
      const rotated = await rotateImage(oriented, rotation);
      variants = await buildOcrVariants(rotated);
    }

    const primary = await recognize(worker, variants.cleanBuffer);
    let best = primary;

    if (primary.confidence < RETRY_CONFIDENCE_FLOOR) {
      const secondary = await recognize(worker, variants.binarizedBuffer);
      if (secondary.confidence > best.confidence) best = secondary;
    }

    return {
      text: blocksToText(best.blocks) || '',
      confidence: Number.isFinite(best.confidence) ? Math.round(best.confidence) : null,
    };
  } finally {
    releaseWorker(entry);
  }
}
