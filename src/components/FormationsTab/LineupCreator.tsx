/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Download, ImageOff, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { downloadCanvasImage } from '../../utils/downloadImage';
import TEMPLATE_5V5 from './templates/Starting_Lineup_-_5v5_Template_.png';
import TEMPLATE_7V7 from './templates/Starting_Lineup_-_7v7_Template_.png';
import TEMPLATE_9V9 from './templates/Starting_Lineup_-_9v9_Template_.png';
import TEMPLATE_11V11 from './templates/Starting_Lineup_-_11v11_Template_.png';

export interface LineupStarter {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface LineupCreatorProps {
  system: string;
  formationName: string;
  starters: (LineupStarter | null)[];
}

// Template artwork is 1000x1000. Photo squares are 215px (5v5) / 208px (7v7, 9v9, 11v11),
// sized to sit just inside each template's thin gold border.
const TEMPLATE_SIZE = 1000;

// Slot order: fill top row left->right, then remaining rows top->bottom.
// Positions are the top-left corner of the photo square inside each template.
// 7v7, 9v9 and 11v11 rows sit flush against each other, so names are drawn inside the squares.
interface TemplateLayout {
  template: string;
  square: number;
  slots: { left: number; top: number }[];
  namesInside: boolean;
}
const LAYOUT_BY_SYSTEM: Record<string, TemplateLayout> = {
  '5v5': {
    template: TEMPLATE_5V5,
    square: 215,
    namesInside: false,
    slots: [
      { left: 232, top: 295 },
      { left: 549, top: 295 },
      { left: 64, top: 581 },
      { left: 392, top: 581 },
      { left: 720, top: 581 },
    ],
  },
  '7v7': {
    template: TEMPLATE_7V7,
    square: 208,
    namesInside: true,
    slots: [
      { left: 169, top: 331 },
      { left: 394, top: 331 },
      { left: 619, top: 331 },
      { left: 57, top: 557 },
      { left: 282, top: 557 },
      { left: 506, top: 557 },
      { left: 730, top: 557 },
    ],
  },
  '9v9': {
    template: TEMPLATE_9V9,
    square: 208,
    namesInside: true,
    slots: [
      { left: 170, top: 234 },
      { left: 394, top: 234 },
      { left: 619, top: 234 },
      { left: 170, top: 459 },
      { left: 394, top: 459 },
      { left: 619, top: 459 },
      { left: 170, top: 683 },
      { left: 394, top: 683 },
      { left: 619, top: 683 },
    ],
  },
  '11v11': {
    template: TEMPLATE_11V11,
    square: 208,
    namesInside: true,
    slots: [
      { left: 169, top: 232 },
      { left: 393, top: 232 },
      { left: 617, top: 232 },
      { left: 60, top: 457 },
      { left: 284, top: 457 },
      { left: 508, top: 457 },
      { left: 732, top: 457 },
      { left: 60, top: 682 },
      { left: 284, top: 682 },
      { left: 508, top: 682 },
      { left: 732, top: 682 },
    ],
  },
};

interface PhotoOffset { x: number; y: number; zoom: number }
const DEFAULT_OFFSET: PhotoOffset = { x: 0, y: 0, zoom: 1 };
const OFFSETS_KEY = 'echelon_lineup_photo_offsets_v1';

const pct = (px: number) => `${(px / TEMPLATE_SIZE) * 100}%`;
const pctOf = (px: number, base: number) => `${(px / base) * 100}%`;

// "Trevor Okafor" -> "Trevor O."  |  "Madison" -> "Madison"
const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
};

// Shared measuring context so the preview and the downloaded PNG compute the
// exact same font size for a name.
const measureCtx = document.createElement('canvas').getContext('2d');

// Largest font size (px) at which text still fits maxWidthPx on one line.
const fitTextPx = (text: string, maxWidthPx: number, basePx: number): number => {
  if (!measureCtx) return basePx;
  if ('letterSpacing' in measureCtx) {
    (measureCtx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.05em';
  }
  measureCtx.font = `bold ${basePx}px sans-serif`;
  const width = measureCtx.measureText(text.toUpperCase()).width;
  if (width <= maxWidthPx) return basePx;
  return Math.max(10, Math.floor((basePx * maxWidthPx) / width));
};

export function LineupCreator({ system, formationName, starters }: LineupCreatorProps) {
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const layout = LAYOUT_BY_SYSTEM[system];
  const SQUARE = layout?.square ?? 215;
  const SLOTS = layout?.slots ?? [];
  const [offsets, setOffsets] = useState<Record<string, PhotoOffset>>(() => {
    try {
      const raw = localStorage.getItem(OFFSETS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, PhotoOffset>) : {};
    } catch {
      return {};
    }
  });
  const [imgDims, setImgDims] = useState<Record<string, { w: number; h: number }>>({});
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; offX: number; offY: number; scalePx: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(OFFSETS_KEY, JSON.stringify(offsets));
    } catch { /* storage full or unavailable: nudges stay for this session only */ }
  }, [offsets]);

  if (!layout) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2.5xl shadow-lg p-5 flex items-center gap-3">
        <ImageOff className="w-4 h-4 text-slate-500 shrink-0" />
        <p className="text-[11px] text-slate-400">
          A social media lineup template for <span className="text-[#00bbff] font-bold">{system}</span> is coming soon.
          Switch the preset game system to 5v5 to build one today.
        </p>
      </div>
    );
  }

  const filled = starters.filter((s): s is LineupStarter => Boolean(s));

  const getOffset = (id: string) => offsets[id] || DEFAULT_OFFSET;

  // Keep the photo covering its square: shifts are limited to the overflow the zoom creates.
  const clampOffset = (id: string, off: PhotoOffset, dims: Record<string, { w: number; h: number }>): PhotoOffset => {
    const d = dims[id];
    if (!d) return off;
    const scale = Math.max(SQUARE / d.w, SQUARE / d.h) * off.zoom;
    const rangeX = Math.max(0, (d.w * scale - SQUARE) / 2);
    const rangeY = Math.max(0, (d.h * scale - SQUARE) / 2);
    return {
      ...off,
      x: Math.min(rangeX, Math.max(-rangeX, off.x)),
      y: Math.min(rangeY, Math.max(-rangeY, off.y)),
    };
  };

  const updateOffset = (id: string, patch: Partial<PhotoOffset>) => {
    setOffsets(prev => {
      const next = clampOffset(id, { ...getOffset(id), ...patch }, imgDims);
      return { ...prev, [id]: next };
    });
  };

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = src;
    });

  const handleDownload = async () => {
    setError(null);
    setIsRendering(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = TEMPLATE_SIZE;
      canvas.height = TEMPLATE_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create the image.');

      const base = await loadImage(layout.template);
      ctx.drawImage(base, 0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);

      const namesInside = Boolean(layout.namesInside);
      if ('letterSpacing' in ctx) {
        (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.05em';
      }

      // Draw each starter inside its square, then their name below it.
      for (let i = 0; i < SLOTS.length; i++) {
        const starter = filled[i];
        if (!starter) break;
        const { left, top } = SLOTS[i];

        if (starter.avatarUrl) {
          try {
            const avatar = await loadImage(starter.avatarUrl);
            const off = clampOffset(starter.id, getOffset(starter.id), {
              ...imgDims,
              [starter.id]: { w: avatar.naturalWidth, h: avatar.naturalHeight }
            });
            const scale = Math.max(SQUARE / avatar.naturalWidth, SQUARE / avatar.naturalHeight) * off.zoom;
            const w = avatar.naturalWidth * scale;
            const h = avatar.naturalHeight * scale;
            const dx = left + (SQUARE - w) / 2 + off.x;
            const dy = top + (SQUARE - h) / 2 + off.y;
            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, SQUARE, SQUARE);
            ctx.clip();
            ctx.drawImage(avatar, dx, dy, w, h);
            ctx.restore();
          } catch (_) {
            // Avatar unreachable: fall back to the initial below.
          }
        } else {
          ctx.fillStyle = '#c9a962';
          ctx.font = 'bold 90px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(starter.name.charAt(0).toUpperCase(), left + SQUARE / 2, top + SQUARE / 2 - 8);
        }

        const nameText = shortName(starter.name).toUpperCase();
        ctx.fillStyle = '#e8d5a3';
        ctx.textAlign = 'center';
        if (namesInside) {
          // Rows are packed: draw the name on a dark strip across the square's bottom edge.
          const stripH = 34;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.fillRect(left, top + SQUARE - stripH, SQUARE, stripH);
          ctx.fillStyle = '#e8d5a3';
          ctx.font = `bold ${fitTextPx(nameText, SQUARE - 16, 22)}px sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.fillText(nameText, left + SQUARE / 2, top + SQUARE - stripH / 2);
        } else {
          ctx.font = `bold ${fitTextPx(nameText, SQUARE - 12, 24)}px sans-serif`;
          ctx.textBaseline = 'top';
          ctx.fillText(nameText, left + SQUARE / 2, top + SQUARE + 16);
        }
      }

      await downloadCanvasImage(
        canvas,
        `${formationName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'lineup'}-starting-lineup.png`
      );
    } catch (err: any) {
      console.error(err);
      setError('Could not build the image. Please try again.');
    } finally {
      setIsRendering(false);
    }
  };

  const selectedStarter = selectedIdx !== null ? filled[selectedIdx] : null;
  const selectedDims = selectedStarter ? imgDims[selectedStarter.id] : null;
  const selectedOff = selectedStarter ? clampOffset(selectedStarter.id, getOffset(selectedStarter.id), imgDims) : null;
  const selectedRange = (() => {
    if (!selectedDims || !selectedOff) return { x: 0, y: 0 };
    const scale = Math.max(SQUARE / selectedDims.w, SQUARE / selectedDims.h) * selectedOff.zoom;
    return {
      x: Math.max(0, (selectedDims.w * scale - SQUARE) / 2),
      y: Math.max(0, (selectedDims.h * scale - SQUARE) / 2),
    };
  })();

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
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Starting Lineup Graphic</h3>
          <p className="text-[10px] font-mono text-slate-450 uppercase mt-0.5">
            {filled.length} starter{filled.length === 1 ? '' : 's'} from {formationName}
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
            disabled={isRendering || filled.length === 0}
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

      <div className="relative w-full select-none" style={{ aspectRatio: '1 / 1' }}>
        <img src={layout.template} alt="Starting lineup template" className="absolute inset-0 w-full h-full" draggable={false} />
        {SLOTS.map((slot, i) => {
          const starter = filled[i];
          return (
            <div
              key={i}
              className="absolute flex flex-col items-center"
              style={{
                left: pct(slot.left),
                top: pct(slot.top),
                width: pct(SQUARE),
                height: pct(SQUARE),
              }}
            >
              {starter ? (
                <>
                  <div
                    className="relative w-full h-full overflow-hidden bg-slate-800 cursor-grab active:cursor-grabbing touch-none"
                    onPointerDown={(e) => {
                      setSelectedIdx(i);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const off = getOffset(starter.id);
                      dragRef.current = {
                        id: starter.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        offX: off.x,
                        offY: off.y,
                        scalePx: SQUARE / rect.width,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      const drag = dragRef.current;
                      if (!drag || drag.id !== starter.id) return;
                      updateOffset(starter.id, {
                        x: drag.offX + (e.clientX - drag.startX) * drag.scalePx,
                        y: drag.offY + (e.clientY - drag.startY) * drag.scalePx,
                      });
                    }}
                    onPointerUp={() => { dragRef.current = null; }}
                    onPointerCancel={() => { dragRef.current = null; }}
                  >
                    {starter.avatarUrl ? (
                      <img
                        src={starter.avatarUrl}
                        alt={starter.name}
                        className="absolute max-w-none"
                        draggable={false}
                        onLoad={(e) => {
                          const el = e.currentTarget;
                          setImgDims(prev => prev[starter.id]
                            ? prev
                            : { ...prev, [starter.id]: { w: el.naturalWidth, h: el.naturalHeight } });
                        }}
                        style={(() => {
                          const d = imgDims[starter.id];
                          if (!d) return { left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' };
                          const off = clampOffset(starter.id, getOffset(starter.id), imgDims);
                          const scale = Math.max(SQUARE / d.w, SQUARE / d.h) * off.zoom;
                          const w = d.w * scale;
                          const h = d.h * scale;
                          return {
                            left: pctOf((SQUARE - w) / 2 + off.x, SQUARE),
                            top: pctOf((SQUARE - h) / 2 + off.y, SQUARE),
                            width: pctOf(w, SQUARE),
                            height: pctOf(h, SQUARE),
                          };
                        })()}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#c9a962] font-bold"
                        style={{ fontSize: '9cqw' }}>
                        {starter.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  {/* Selection ring floats above the photo so it stays visible
                      even when the image is dragged or zoomed to fill the square */}
                  {selectedIdx === i && (
                    <div className="absolute inset-0 pointer-events-none border-2 border-[#00bbff] z-10" />
                  )}
                  {(() => {
                    const nameText = shortName(starter.name).toUpperCase();
                    const basePx = layout.namesInside ? 8 : 8;
                    const maxPx = layout.namesInside ? SQUARE - 16 : SQUARE - 12;
                    const namePx = fitTextPx(nameText, maxPx, basePx);
                    const nameNode = (
                      <span
                        className="text-center font-bold uppercase text-[#e8d5a3] whitespace-nowrap"
                        style={{ fontSize: `${namePx / 10}cqw`, letterSpacing: '0.05em', lineHeight: 1 }}
                      >
                        {nameText}
                      </span>
                    );
                    return layout.namesInside ? (
                      <div
                        className="absolute bottom-0 left-0 w-full flex items-center justify-center bg-black/70"
                        style={{ height: pctOf(34, SQUARE) }}
                      >
                        {nameNode}
                      </div>
                    ) : (
                      <div className="mt-[2.5%] w-full flex justify-center">{nameNode}</div>
                    );
                  })()}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#c9a962]/40 font-mono uppercase"
                  style={{ fontSize: '2.6cqw' }}>
                  Open
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedStarter && selectedOff && (
        <div className="mx-5 my-4 p-4 rounded-xl bg-slate-800/60 border border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-mono uppercase tracking-wide text-slate-300">
              Positioning · <span className="text-[#00bbff] font-bold">{shortName(selectedStarter.name)}</span>
            </p>
            <button
              type="button"
              onClick={() => updateOffset(selectedStarter.id, { x: 0, y: 0, zoom: 1 })}
              className="inline-flex items-center gap-1 text-[10px] font-mono uppercase text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
          {(
            [
              { label: 'X', value: selectedOff.x, range: selectedRange.x, key: 'x' as const },
              { label: 'Y', value: selectedOff.y, range: selectedRange.y, key: 'y' as const },
            ]
          ).map(({ label, value, range, key }) => (
            <div key={key} className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-mono text-slate-400 w-4">{label}</span>
              <input
                type="range"
                min={-Math.round(range)}
                max={Math.round(range)}
                step={1}
                value={Math.round(value)}
                disabled={range < 1}
                onChange={(e) => updateOffset(selectedStarter.id, { [key]: Number(e.target.value) })}
                className="flex-1 accent-[#00bbff] disabled:opacity-40"
              />
              <span className="text-[10px] font-mono text-slate-500 w-10 text-right">{Math.round(value)}px</span>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-slate-400 w-4">Z</span>
            <input
              type="range"
              min={100}
              max={200}
              step={5}
              value={Math.round(selectedOff.zoom * 100)}
              onChange={(e) => updateOffset(selectedStarter.id, { zoom: Number(e.target.value) / 100 })}
              className="flex-1 accent-[#00bbff]"
            />
            <span className="text-[10px] font-mono text-slate-500 w-10 text-right">{Math.round(selectedOff.zoom * 100)}%</span>
          </div>
          <p className="mt-2 text-[9px] font-mono text-slate-500 uppercase">
            Drag the photo in its square, or use the sliders. Zoom in to allow more shifting.
          </p>
        </div>
      )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
