const WORD_CONFIDENCE_FLOOR = 35;

function isNoiseWord(word) {
  if (word.confidence >= WORD_CONFIDENCE_FLOOR) return false;
  const text = word.text.trim();
  return text.length <= 1 || !/[A-Za-z0-9]/.test(text);
}

function lineToText(line) {
  return line.words
    .filter((word) => !isNoiseWord(word))
    .map((word) => word.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function joinHyphenatedLines(lines) {
  const merged = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    if (prev && /[a-z]-$/.test(prev) && /^[a-z]/.test(line)) {
      merged[merged.length - 1] = prev.slice(0, -1) + line;
    } else {
      merged.push(line);
    }
  }
  return merged;
}

function paragraphToText(paragraph) {
  const lines = paragraph.lines.map(lineToText).filter(Boolean);
  return joinHyphenatedLines(lines).join('\n');
}

export function blocksToText(blocks) {
  if (!Array.isArray(blocks)) return '';

  const paragraphs = blocks
    .flatMap((block) => block.paragraphs || [])
    .map(paragraphToText)
    .filter(Boolean);

  return paragraphs.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}
