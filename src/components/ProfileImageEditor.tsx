import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  X,
  Loader2,
  Eraser,
  RotateCcw,
  Crosshair,
  Save,
  ImagePlus,
  Trash2,
  Undo2,
  SquareSlash,
} from 'lucide-react';
import templateUrl from './FormationsTab/templates/Profile_Image_Template.jpg';

interface ProfileImageEditorProps {
  onUpload: (file: Blob) => Promise<void>;
  onRemove?: () => Promise<void>;
  hasAvatar: boolean;
  onClose: () => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.webp';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // matches the bucket's 2 MB limit
const EXPORT_SIZE = 512; // square profile-picture output
const MAX_SOURCE_DIMENSION = 1024; // keeps model input small and fast

interface Adjust {
  x: number; // -50..50 (% of frame width)
  y: number; // -50..50 (% of frame height)
  scale: number; // 0.5..3
}

const DEFAULT_ADJUST: Adjust = { x: 0, y: 0, scale: 1 };

const checkerboardStyle: React.CSSProperties = {
  backgroundImage:
    'conic-gradient(#dbe4ee 25%, #f1f5f9 0 50%, #dbe4ee 0 75%, #f1f5f9 0)',
  backgroundSize: '16px 16px',
};

// Shrink very large photos before feeding them to the model.
async function downscale(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_SOURCE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) return blob;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    return out || blob;
  } finally {
    bitmap.close();
  }
}

type BgMode = 'transparent' | 'template';

// Render the exact composition shown in the preview onto an export canvas.
function composeExport(
  bitmap: ImageBitmap,
  adjust: Adjust,
  size: number,
  bgBitmap: ImageBitmap | null
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');

  if (bgBitmap) {
    const bgCover = Math.max(size / bgBitmap.width, size / bgBitmap.height);
    const bgW = bgBitmap.width * bgCover;
    const bgH = bgBitmap.height * bgCover;
    ctx.drawImage(bgBitmap, (size - bgW) / 2, (size - bgH) / 2, bgW, bgH);
  }

  const cover = Math.max(size / bitmap.width, size / bitmap.height);
  const drawW = bitmap.width * cover * adjust.scale;
  const drawH = bitmap.height * cover * adjust.scale;
  const cx = size / 2 + (adjust.x / 100) * size;
  const cy = size / 2 + (adjust.y / 100) * size;

  ctx.drawImage(bitmap, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not create the image.'))),
      'image/png'
    );
  });
}

export default function ProfileImageEditor({
  onUpload,
  onRemove,
  hasAvatar,
  onClose,
}: ProfileImageEditorProps) {
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [useCutout, setUseCutout] = useState(true);
  const [bgMode, setBgMode] = useState<BgMode>('transparent');
  const [natSize, setNatSize] = useState<{ w: number; h: number } | null>(null);
  const [adjust, setAdjust] = useState<Adjust>(DEFAULT_ADJUST);
  const [processing, setProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const activeBlob = useCutout && cutoutBlob ? cutoutBlob : originalBlob;
  const activeUrl = useCutout && cutoutUrl ? cutoutUrl : originalUrl;

  // Keep object URLs tidy.
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (cutoutUrl) URL.revokeObjectURL(cutoutUrl);
    };
  }, [originalUrl, cutoutUrl]);

  // Read the displayed image's natural size so the preview matches the export.
  useEffect(() => {
    if (!activeBlob) {
      setNatSize(null);
      return;
    }
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    createImageBitmap(activeBlob)
      .then(bm => {
        if (cancelled) {
          bm.close();
          return;
        }
        bitmap = bm;
        setNatSize({ w: bm.width, h: bm.height });
      })
      .catch(() => {
        if (!cancelled) setError('Could not read that image. Please choose another one.');
      });
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [activeBlob]);

  const busy = processing || saving;

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Please choose a JPG, JPEG, PNG or WebP image.');
      return;
    }

    try {
      const small = await downscale(file);
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (cutoutUrl) URL.revokeObjectURL(cutoutUrl);
      setOriginalBlob(small);
      setOriginalUrl(URL.createObjectURL(small));
      // A new photo invalidates any previous cut-out.
      setCutoutBlob(null);
      setCutoutUrl(null);
      setUseCutout(true);
      setBgMode('transparent');
      setAdjust(DEFAULT_ADJUST);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that image.');
    }
  };

  const handleRemoveBackground = async () => {
    if (!originalBlob || processing) return;
    setProcessing(true);
    setError('');
    setProgressPct(null);
    setProgressLabel('Preparing…');
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const result = await removeBackground(originalBlob as File, {
        output: { format: 'image/png', quality: 0.9 },
        progress: (key, current, total) => {
          if (total > 0) {
            setProgressPct(Math.round((current / total) * 100));
            setProgressLabel(key.startsWith('fetch') ? 'Downloading model…' : 'Removing background…');
          }
        },
      });
      if (cutoutUrl) URL.revokeObjectURL(cutoutUrl);
      setCutoutBlob(result);
      setCutoutUrl(URL.createObjectURL(result));
      setUseCutout(true);
      setBgMode('transparent');
    } catch (err) {
      console.warn('[profile-image] background removal failed:', err);
      setError(
        'Could not remove the background. Check your connection and try again, or save the photo as-is.'
      );
    } finally {
      setProcessing(false);
      setProgressPct(null);
      setProgressLabel('');
    }
  };

  const handleSave = async () => {
    if (!activeBlob || saving) return;
    setSaving(true);
    setError('');
    try {
      const bitmap = await createImageBitmap(activeBlob);
      let bgBitmap: ImageBitmap | null = null;
      let finalBlob: Blob | null = null;
      try {
        // The chosen background is baked in beneath the cut-out.
        if (useCutout && cutoutBlob && bgMode === 'template') {
          const res = await fetch(templateUrl);
          bgBitmap = await createImageBitmap(await res.blob());
        }
        // Keep shrinking the output until it fits the storage limit.
        for (const size of [EXPORT_SIZE, 384, 256, 192]) {
          const candidate = await canvasToBlob(composeExport(bitmap, adjust, size, bgBitmap));
          finalBlob = candidate;
          if (candidate.size <= MAX_UPLOAD_BYTES) break;
        }
      } finally {
        bitmap.close();
        bgBitmap?.close();
      }
      if (!finalBlob) throw new Error('Could not create the image.');
      if (finalBlob.size > MAX_UPLOAD_BYTES) {
        throw new Error('This image is too large to save. Please choose a smaller photo.');
      }
      await onUpload(finalBlob);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the photo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!onRemove) return;
    setSaving(true);
    setError('');
    try {
      await onRemove();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the photo. Please try again.');
      setSaving(false);
    }
  };

  const sliderLabel = 'block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5';
  const secondaryBtn =
    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-[11px] transition disabled:opacity-50';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
      onClick={() => { if (!busy) onClose(); }}
    >
      {/* Wrapper keeps the dialog centered on tall screens but top-aligned
          (never clipped) when the content is taller than the viewport. */}
      <div className="min-h-full flex items-start sm:items-center justify-center p-4">
        <div
          className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl my-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 font-sans">Edit Profile Photo</h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Your current photo stays until you save the new one.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { if (!busy) onClose(); }}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-[11px] transition disabled:opacity-50"
              disabled={busy}
            >
              <X className="w-3.5 h-3.5" />
              Exit
            </button>
          </div>

          {/* Square preview frame with checkerboard transparency */}
          <div className="flex justify-center mb-4">
          <div
            className="relative w-64 h-64 max-w-full rounded-2xl overflow-hidden border-2 border-slate-700"
            style={checkerboardStyle}
          >
            {activeUrl && natSize ? (
              (() => {
                const cover = Math.max(100 / natSize.w, 100 / natSize.h);
                const showTemplateBg = useCutout && cutoutBlob && bgMode === 'template';
                return (
                  <>
                    {showTemplateBg && (
                      <img
                        src={templateUrl}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                        draggable={false}
                      />
                    )}
                    <img
                      src={activeUrl}
                      alt="Profile preview"
                      className="absolute select-none pointer-events-none"
                      style={{
                        // Tailwind's base max-width would clamp the width and
                        // stretch the image once it exceeds the frame.
                        maxWidth: 'none',
                        width: `${natSize.w * cover * adjust.scale}%`,
                        height: `${natSize.h * cover * adjust.scale}%`,
                        left: `${50 + adjust.x}%`,
                        top: `${50 + adjust.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      draggable={false}
                    />
                  </>
                );
              })()
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
                <ImagePlus className="w-8 h-8" />
                <p className="text-[11px]">Select a photo to begin</p>
              </div>
            )}

            {busy && (
              <div className="absolute inset-0 bg-slate-950/60 flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                <p className="text-[11px] text-slate-300">
                  {saving ? 'Saving…' : progressLabel || 'Working…'}
                </p>
                {progressPct !== null && (
                  <div className="w-40 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-sky-400 rounded-full transition-all duration-200"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={handleSelectFile} />

        {/* Step buttons */}
        <div className="space-y-2 mb-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            {originalBlob ? 'Choose a different photo' : 'Select Photo'}
          </button>

          {originalBlob && !cutoutBlob && (
            <button
              type="button"
              onClick={handleRemoveBackground}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#00bbff] hover:bg-[#00a8e0] text-slate-950 font-bold text-xs transition disabled:opacity-50"
            >
              <Eraser className="w-4 h-4" />
              Remove Background
            </button>
          )}

          {cutoutBlob && (
            <button
              type="button"
              onClick={() => setUseCutout(v => !v)}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#00bbff] hover:bg-[#00a8e0] text-slate-950 font-bold text-xs transition disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" />
              {useCutout ? 'Use original photo' : 'Use cut-out (background removed)'}
            </button>
          )}
        </div>

        {/* Background selector (after background removal) */}
        {cutoutBlob && useCutout && (
          <div className="mb-4 bg-slate-800/50 border border-slate-800 rounded-2xl p-4">
            <p className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-2">
              Select Background
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBgMode('transparent')}
                disabled={busy}
                className={`rounded-xl overflow-hidden border-2 transition disabled:opacity-50 ${
                  bgMode === 'transparent'
                    ? 'border-[#00bbff]'
                    : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                <span
                  className="flex items-center justify-center gap-1.5 h-16"
                  style={checkerboardStyle}
                >
                  <SquareSlash className="w-4 h-4 text-slate-500" />
                  <span className="text-[10px] font-bold text-slate-600">Transparent</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBgMode('template')}
                disabled={busy}
                className={`rounded-xl overflow-hidden border-2 transition disabled:opacity-50 ${
                  bgMode === 'template'
                    ? 'border-[#00bbff]'
                    : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                <span className="relative flex items-end justify-start h-16 bg-black">
                  <img
                    src={templateUrl}
                    alt="Chevron background"
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                  <span className="relative z-10 m-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-bold text-slate-200">
                    Chevrons
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Positioning controls */}
        {originalBlob && (
          <div className="space-y-3 mb-4 bg-slate-800/50 border border-slate-800 rounded-2xl p-4">
            <div>
              <div className="flex items-center justify-between">
                <label className={sliderLabel}>X Position</label>
                <span className="text-[10px] font-mono text-slate-400">{adjust.x}</span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                step={1}
                value={adjust.x}
                onChange={e => setAdjust(a => ({ ...a, x: Number(e.target.value) }))}
                disabled={busy}
                className="w-full accent-[#00bbff]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className={sliderLabel}>Y Position</label>
                <span className="text-[10px] font-mono text-slate-400">{adjust.y}</span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                step={1}
                value={adjust.y}
                onChange={e => setAdjust(a => ({ ...a, y: Number(e.target.value) }))}
                disabled={busy}
                className="w-full accent-[#00bbff]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className={sliderLabel}>Scale / Zoom</label>
                <span className="text-[10px] font-mono text-slate-400">{adjust.scale.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                value={adjust.scale}
                onChange={e => setAdjust(a => ({ ...a, scale: Number(e.target.value) }))}
                disabled={busy}
                className="w-full accent-[#00bbff]"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAdjust(a => ({ ...a, x: 0, y: 0 }))}
                disabled={busy}
                className={secondaryBtn}
              >
                <Crosshair className="w-3.5 h-3.5" />
                Centre Image
              </button>
              <button
                type="button"
                onClick={() => setAdjust(DEFAULT_ADJUST)}
                disabled={busy}
                className={secondaryBtn}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Adjustments
              </button>
            </div>
          </div>
        )}

        {/* Save / remove */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!originalBlob || busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Profile Image'}
          </button>

          {hasAvatar && onRemove && (
            <button
              type="button"
              onClick={handleRemovePhoto}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold text-[11px] transition disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove photo
            </button>
          )}
        </div>

          {error && (
            <p className="mt-3 text-[11px] text-rose-400 text-center leading-snug">{error}</p>
          )}
          <p className="mt-4 text-[10px] text-slate-500 text-center font-mono">
            JPG, JPEG, PNG or WebP · saved as transparent PNG · max 2 MB
          </p>
        </div>
      </div>
    </div>
  );
}
