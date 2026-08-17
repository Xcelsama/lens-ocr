import { useCallback, useRef, useState } from 'react';

const MAX_IMAGES = 20;
const MAX_DIMENSION = 1800;
const CONCURRENCY = 3;

let idCounter = 0;
const nextId = () => `img-${Date.now()}-${idCounter++}`;

function fileToResizedBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.onload = () => {
      img.onerror = () => reject(new Error('Could not decode image.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        resolve({ dataUrl, base64: dataUrl.split(',')[1] });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const runners = new Array(Math.min(limit, queue.length)).fill(0).map(async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function StatusBadge({ status }) {
  const map = {
    queued: { label: 'Queued', cls: 'bg-ink-lighter text-paper-dim' },
    scanning: { label: 'Scanning', cls: 'bg-scan-soft text-scan' },
    done: { label: 'Done', cls: 'bg-scan text-ink' },
    error: { label: 'Error', cls: 'bg-rust text-paper' },
  };
  const s = map[status] || map.queued;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function Home() {
  const [images, setImages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    setImages((prev) => {
      const room = MAX_IMAGES - prev.length;
      const accepted = incoming.slice(0, Math.max(room, 0));
      const additions = accepted.map((file) => ({
        id: nextId(),
        file,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        status: 'queued',
        text: '',
        error: '',
      }));
      return [...prev, ...additions];
    });
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const removeImage = (id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
  };

  const extractAll = async () => {
    const targets = images.filter((img) => img.status === 'queued' || img.status === 'error');
    if (!targets.length) return;
    setIsProcessing(true);

    setImages((prev) =>
      prev.map((img) => (targets.some((t) => t.id === img.id) ? { ...img, status: 'scanning' } : img))
    );

    await runWithConcurrency(targets, CONCURRENCY, async (target) => {
      try {
        const { base64 } = await fileToResizedBase64(target.file);
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'OCR request failed.');
        setImages((prev) =>
          prev.map((img) =>
            img.id === target.id
              ? { ...img, status: 'done', text: data.text || '(No text found)', error: '' }
              : img
          )
        );
      } catch (err) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === target.id ? { ...img, status: 'error', error: err.message } : img
          )
        );
      }
    });

    setIsProcessing(false);
  };

  const downloadTxt = () => {
    const done = images.filter((img) => img.status === 'done');
    if (!done.length) return;
    const body = done
      .map((img) => `===== ${img.name} =====\n${img.text.trim()}\n`)
      .join('\n');
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted-text.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const doneCount = images.filter((i) => i.status === 'done').length;
  const errorCount = images.filter((i) => i.status === 'error').length;
  const atLimit = images.length >= MAX_IMAGES;

  return (
    <div className="min-h-screen bg-ink text-paper font-body pb-28">
      <div className="max-w-4xl mx-auto px-5 pt-10 pb-6">
        <p className="font-mono text-xs tracking-[0.2em] text-scan uppercase mb-3">
          Batch OCR // client-side upload, zero database
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight">
          Pull the text out of your images.
        </h1>
        <p className="mt-3 text-paper-dim max-w-xl">
          Drop up to {MAX_IMAGES} photos, screenshots, or scans. Each one is read with Google
          Cloud Vision&apos;s text detection — the same OCR family behind Google Lens — and the
          results come back as one downloadable .txt file.
        </p>
      </div>

      <div className="max-w-4xl mx-auto px-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed transition-colors px-6 py-10 text-center
            ${dragOver ? 'border-scan bg-scan-soft' : 'border-ink-lighter bg-ink-light hover:border-scan-dim'}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <p className="font-display text-lg">
            {atLimit ? `Limit reached — ${MAX_IMAGES}/${MAX_IMAGES} images` : 'Drop images here, or tap to browse'}
          </p>
          <p className="font-mono text-xs text-paper-dim mt-2">
            {images.length}/{MAX_IMAGES} selected · JPG, PNG, WEBP, HEIC
          </p>
        </div>
      </div>

      {images.length > 0 && (
        <div className="max-w-4xl mx-auto px-5 mt-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {images.map((img) => (
              <div key={img.id} className="relative rounded-xl overflow-hidden bg-paper text-ink shadow-lg">
                <div className="relative h-28 overflow-hidden bg-ink-lighter">
                  <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover" />
                  {img.status === 'scanning' && (
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="absolute left-0 right-0 h-8 bg-gradient-to-b from-transparent via-scan/70 to-transparent animate-sweep" />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-[11px] font-mono truncate">{img.name}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <StatusBadge status={img.status} />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="text-[10px] font-mono text-ink/50 hover:text-rust focus-ring"
                      aria-label={`Remove ${img.name}`}
                    >
                      remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {images.some((i) => i.status === 'done' || i.status === 'error') && (
        <div className="max-w-4xl mx-auto px-5 mt-10">
          <h2 className="font-display text-xl mb-3">Extracted text</h2>
          <div className="space-y-3">
            {images
              .filter((i) => i.status === 'done' || i.status === 'error')
              .map((img) => (
                <div key={img.id} className="rounded-xl bg-ink-light border border-ink-lighter overflow-hidden">
                  <div className="px-4 py-2 border-b border-ink-lighter flex items-center justify-between">
                    <p className="font-mono text-xs truncate">{img.name}</p>
                    <StatusBadge status={img.status} />
                  </div>
                  {img.status === 'done' ? (
                    <pre className="mono-scroll font-mono text-sm text-paper-dim whitespace-pre-wrap px-4 py-3 max-h-40 overflow-y-auto">
                      {img.text}
                    </pre>
                  ) : (
                    <p className="px-4 py-3 text-sm text-rust">{img.error}</p>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-ink-light border-t border-ink-lighter">
          <div className="max-w-4xl mx-auto px-5 py-4 flex flex-wrap items-center gap-3">
            <button
              onClick={extractAll}
              disabled={isProcessing || images.every((i) => i.status === 'done')}
              className="focus-ring px-5 py-2.5 rounded-full bg-scan text-ink font-display font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Scanning…' : 'Extract text'}
            </button>
            <button
              onClick={downloadTxt}
              disabled={doneCount === 0}
              className="focus-ring px-5 py-2.5 rounded-full border border-scan-dim text-scan font-display font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Download .txt
            </button>
            <button
              onClick={clearAll}
              disabled={isProcessing}
              className="focus-ring px-4 py-2.5 rounded-full text-paper-dim font-mono text-xs hover:text-rust disabled:opacity-30"
            >
              Clear all
            </button>
            <p className="ml-auto font-mono text-xs text-paper-dim">
              {doneCount} done{errorCount ? ` · ${errorCount} failed` : ''} · {images.length} total
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
