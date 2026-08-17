import sharp from 'sharp';

const TARGET_LONG_EDGE = 1600;
const MAX_UPSCALE_FACTOR = 3;
const MAX_LONG_EDGE = 3200;
const CLAHE_WINDOW = 32;

function otsuThreshold(pixels) {
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < pixels.length; i += 1) histogram[pixels[i]] += 1;

  const total = pixels.length;
  let sum = 0;
  for (let level = 0; level < 256; level += 1) sum += level * histogram[level];

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let bestThreshold = 128;

  for (let level = 0; level < 256; level += 1) {
    weightBackground += histogram[level];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += level * histogram[level];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance =
      weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = level;
    }
  }

  return bestThreshold;
}

function targetDimensions(width, height) {
  const longEdge = Math.max(width, height);

  if (longEdge > MAX_LONG_EDGE) {
    const scale = MAX_LONG_EDGE / longEdge;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }

  if (longEdge < TARGET_LONG_EDGE) {
    const scale = Math.min(TARGET_LONG_EDGE / longEdge, MAX_UPSCALE_FACTOR);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }

  return { width, height };
}

export function normalizeOrientation(buffer) {
  return sharp(buffer, { failOn: 'none' }).rotate().toBuffer();
}

export function rotateImage(buffer, degrees) {
  if (!degrees) return Promise.resolve(buffer);
  return sharp(buffer, { failOn: 'none' }).rotate(degrees).toBuffer();
}

export async function buildOcrVariants(buffer) {
  const metadata = await sharp(buffer).metadata();
  const { width, height } = targetDimensions(metadata.width, metadata.height);
  const claheWindow = Math.max(8, Math.min(CLAHE_WINDOW, Math.floor(Math.min(width, height) / 10)));

  const enhanced = sharp(buffer, { failOn: 'none' })
    .resize({ width, height, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .greyscale()
    .clahe({ width: claheWindow, height: claheWindow, maxSlope: 3 })
    .sharpen({ sigma: 1 });

  const cleanBuffer = await enhanced.clone().png().toBuffer();

  const { data: grayPixels, info } = await enhanced
    .clone()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const binarizedBuffer = await sharp(grayPixels, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .threshold(otsuThreshold(grayPixels))
    .png()
    .toBuffer();

  return { cleanBuffer, binarizedBuffer, width: info.width, height: info.height };
}
