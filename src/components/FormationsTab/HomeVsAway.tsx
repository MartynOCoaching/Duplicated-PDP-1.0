/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../supabase';
import { downloadCanvasImage } from '../../utils/downloadImage';
import TEMPLATE_POSTER from './templates/Match_-_TEMPLATE.png';

// Template artwork is 1000x1000. All positions below are in template pixels,
// calibrated against the template's printed labels and bars.
const TEMPLATE_SIZE = 1000;

// Bottom-right box the opponent crest is drawn into.
const OPPONENT_BOX = { left: 580, top: 580, width: 350, height: 315 };

// Team name drawn in bold white centered just below the opponent logo box,
// matching the age/gender text style.
const OPPONENT_NAME = { centerX: 755, centerY: 942, maxWidth: 520 };

// Age + gender drawn in bold white just after the "RATTLERS FC" text
// beneath the top-left club logo box.
const CLUB_TEXT_VALUE = { left: 304, centerY: 466 };

// The three gray bars next to the printed Date:/Time:/Location: labels.
// Values are centered vertically inside each bar and shrink to fit.
const INFO_BARS = [
  { label: 'Date', left: 158, centerY: 726, maxWidth: 330 },
  { label: 'Time', left: 158, centerY: 775, maxWidth: 330 },
  { label: 'Location', left: 222, centerY: 823, maxWidth: 270 },
];

interface AwayLogo {
  name: string;
  url: string;
}

const fileNameToLabel = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });

const fitFont = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number) => {
  let size = startPx;
  ctx.font = `bold ${size}px sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > 12) {
    size -= 2;
    ctx.font = `bold ${size}px sans-serif`;
  }
  return size;
};

interface PosterState {
  date: string;
  time: string;
  location: string;
  ageGender: string;
  selectedLogo: AwayLogo | null;
}

// Shared drawing routine: the preview canvas and the downloaded PNG both run
// through this, so the preview is always a true-to-scale copy of the output.
const drawPoster = async (
  ctx: CanvasRenderingContext2D,
  state: PosterState,
  imageCache: Map<string, HTMLImageElement>
) => {
  const base = imageCache.get('template') ?? (await loadImage(TEMPLATE_POSTER));
  imageCache.set('template', base);

  ctx.clearRect(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);
  ctx.drawImage(base, 0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);

  // Opponent crest inside the bottom-right box, contained and centered.
  if (state.selectedLogo) {
    try {
      const logo = imageCache.get(state.selectedLogo.url) ?? (await loadImage(state.selectedLogo.url));
      imageCache.set(state.selectedLogo.url, logo);
      const scale = Math.min(OPPONENT_BOX.width / logo.naturalWidth, OPPONENT_BOX.height / logo.naturalHeight) * 0.92;
      const w = logo.naturalWidth * scale;
      const h = logo.naturalHeight * scale;
      ctx.drawImage(
        logo,
        OPPONENT_BOX.left + (OPPONENT_BOX.width - w) / 2,
        OPPONENT_BOX.top + (OPPONENT_BOX.height - h) / 2,
        w,
        h
      );
    } catch (_) {
      // Logo unreachable: leave the box empty.
    }
  }

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Opponent name below its logo box.
  if (state.selectedLogo) {
    const size = fitFont(ctx, state.selectedLogo.name, OPPONENT_NAME.maxWidth, 44);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(state.selectedLogo.name, OPPONENT_NAME.centerX, OPPONENT_NAME.centerY);
    ctx.textAlign = 'left';
  }

  // Age + gender beside the club name under the top-left logo box.
  if (state.ageGender.trim()) {
    const size = fitFont(ctx, state.ageGender.trim(), 660, 38);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillText(state.ageGender.trim(), CLUB_TEXT_VALUE.left, CLUB_TEXT_VALUE.centerY);
  }

  // Typed values inside the three gray bars, shrunk to fit each bar.
  ctx.font = 'bold 30px sans-serif';
  [state.date.trim(), state.time.trim(), state.location.trim()].forEach((value, i) => {
    if (!value) return;
    const bar = INFO_BARS[i];
    const size = fitFont(ctx, value, bar.maxWidth, 30);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillText(value, bar.left, bar.centerY);
  });
};

export function HomeVsAway() {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [ageGender, setAgeGender] = useState('');
  const [logos, setLogos] = useState<AwayLogo[]>([]);
  const [selectedLogo, setSelectedLogo] = useState<AwayLogo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());

  const infoValues = [date.trim(), time.trim(), location.trim()];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: listError } = await supabase.storage.from('away-logos').list('', {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (cancelled || listError || !data) return;
      const loaded = data
        .filter(f => f.name && !f.name.startsWith('.'))
        .map(f => ({ name: fileNameToLabel(f.name), url: supabase.storage.from('away-logos').getPublicUrl(f.name).data.publicUrl }));
      setLogos(loaded);
    })();
    return () => { cancelled = true; };
  }, []);

  const renderPreview = useCallback(async () => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      await drawPoster(ctx, { date, time, location, ageGender, selectedLogo }, imageCacheRef.current);
    } catch (_) {
      // Template not reachable yet: leave the preview blank.
    }
  }, [date, time, location, ageGender, selectedLogo]);

  useEffect(() => {
    if (isExpanded) void renderPreview();
  }, [isExpanded, renderPreview]);

  const handleDownload = async () => {
    setError(null);
    setIsRendering(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = TEMPLATE_SIZE;
      canvas.height = TEMPLATE_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create the image.');

      await drawPoster(ctx, { date, time, location, ageGender, selectedLogo }, imageCacheRef.current);

      await downloadCanvasImage(canvas, 'home-vs-away-poster.png');
    } catch (err: any) {
      console.error(err);
      setError('Could not build the image. Please try again.');
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2.5xl shadow-lg overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(e => !e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(x => !x);
          }
        }}
        className="w-full flex items-center justify-between p-5 pb-4 cursor-pointer hover:bg-slate-850/30 transition text-left"
      >
        <div>
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Home vs Away Poster</h3>
          <p className="text-[10px] font-mono text-slate-450 uppercase mt-0.5">
            Match day announcement graphic
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-[#00bbff]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#00bbff]" />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            disabled={isRendering}
            className="inline-flex items-center gap-2 bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold px-4 py-2 rounded-xl text-[11px] uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {isRendering ? 'Building...' : 'Download'}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
      {error && (
        <p className="mb-3 text-[10px] text-rose-400 font-mono uppercase tracking-wide">{error}</p>
      )}

      {/* Match detail inputs */}
      <div className="mx-5 mb-4 grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">Date</span>
          <input
            type="text"
            placeholder="e.g. Nov 8, 2026"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#00bbff]/50 transition"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">Time</span>
          <input
            type="text"
            placeholder="e.g. 2:00 PM"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#00bbff]/50 transition"
          />
        </label>
        <label className="block col-span-2">
          <span className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">Location</span>
          <input
            type="text"
            placeholder="e.g. Community Sports Field 3"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#00bbff]/50 transition"
          />
        </label>
        <label className="block col-span-2">
          <span className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">Age &amp; Gender</span>
          <input
            type="text"
            placeholder="e.g. U13 Boys"
            value={ageGender}
            onChange={(e) => setAgeGender(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#00bbff]/50 transition"
          />
        </label>
      </div>

      {/* Opponent picker fed by the away-logos bucket */}
      <div className="mx-5 mb-4 relative">
        <span className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">Opponent</span>
        <button
          type="button"
          onClick={() => setIsOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 hover:border-[#00bbff]/50 rounded-xl px-3 py-2.5 text-xs text-slate-200 transition cursor-pointer"
        >
          <span className="flex items-center gap-2 min-w-0">
            {selectedLogo ? (
              <img
                src={selectedLogo.url}
                alt=""
                className="w-6 h-6 rounded-lg object-contain shrink-0 border border-slate-700 bg-slate-800"
              />
            ) : (
              <CalendarDays className="w-3.5 h-3.5 text-[#c9a962] shrink-0" />
            )}
            <span className="truncate">{selectedLogo ? selectedLogo.name : 'Select opponent...'}</span>
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute z-40 mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
            {logos.length === 0 ? (
              <p className="p-3 text-[10px] text-slate-500 italic text-center">
                No away team logos added yet.
              </p>
            ) : (
              <div className="max-h-[220px] overflow-y-auto">
                {logos.map(logo => (
                  <button
                    key={logo.url}
                    type="button"
                    onClick={() => {
                      setSelectedLogo(logo);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition cursor-pointer ${
                      selectedLogo?.url === logo.url ? 'bg-[#00bbff]/10 text-[#00bbff] font-bold' : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <img
                      src={logo.url}
                      alt=""
                      className="w-6 h-6 rounded-lg object-contain shrink-0 border border-slate-700 bg-slate-800"
                    />
                    <span className="truncate">{logo.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live preview canvas: identical drawing code to the downloaded image */}
      <div className="w-full select-none">
        <canvas
          ref={previewRef}
          width={TEMPLATE_SIZE}
          height={TEMPLATE_SIZE}
          className="w-full h-auto"
        />
      </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
