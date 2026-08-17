import { createWorker, PSM } from 'tesseract.js';
import { buildOcrVariants, normalizeOrientation, rotateImage } from './preprocess';
import { blocksToText } from './postprocess';

const LANGUAGE = process.env.OCR_LANGUAGE || 'eng';
const CACHE_PATH = '/tmp/tesseract-cache';
const ROTATION_CONFIDENCE_FLOOR = 6;
const HIGH_CONFIDENCE_SHORTCUT = 92;

let workerPromise = null;
let osdAvailable = false;

async function initWorker() {
  try {
    const worker = await createWorker(`${LANGUAGE}+osd`, undefined, { cachePath: CACHE_PATH });
    osdAvailable = true;
    return worker;
  } catch {
    osdAvailable = false;
    return createWorker(LANGUAGE, undefined, { cachePath: CACHE_PATH });
  }
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = initWorker().then(async (worker) => {
      await worker.setParameters({ preserve_interword_spaces: '1' });
      return worker;
    });
  }
  return workerPromise;
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
  const worker = await getWorker();
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

  if (primary.confidence < HIGH_CONFIDENCE_SHORTCUT) {
    const secondary = await recognize(worker, variants.binarizedBuffer);
    if (secondary.confidence > best.confidence) best = secondary;
  }

  return {
    text: blocksToText(best.blocks) || '',
    confidence: Number.isFinite(best.confidence) ? Math.round(best.confidence) : null,
  };
}
