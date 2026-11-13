/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { Award, ChevronDown, ChevronUp, Download, ImageOff, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { downloadCanvasImage } from '../../utils/downloadImage';
import TEMPLATE_POTG from './templates/POG-_TEMPLATE.png';

export interface PotgCandidate {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface PlayOfTheGameProps {
  candidates: PotgCandidate[];
}

// Template artwork is 1000x1000, fully opaque. The solid black window for the
// player photo sits at x 190..999, y 0..749 ("PLAYER OF THE GAME" text starts at y 760).
// The photo is drawn ON TOP of the template, clipped to that window.
const TEMPLATE_SIZE = 1000;
const FRAME_LEFT = 190;
const FRAME_TOP = 0;
const FRAME_W = 810;
const FRAME_H = 750;

const pct = (px: number) => `${(px / TEMPLATE_SIZE) * 100}%`;

const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
};

export function PlayOfTheGame({ candidates }: PlayOfTheGameProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const selected = candidates.find(c => c.id === selectedId) || null;

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(c => c.name.toLowerCase().includes(q));
  })();

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = src;
    });

  const handleDownload = async () => {
    if (!selected) return;
    setError(null);
    setIsRendering(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = TEMPLATE_SIZE;
      canvas.height = TEMPLATE_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create the image.');

      // Template first, then the photo drawn ON TOP clipped to the window —
      // the amended template is fully opaque, so layering is photo-over-template.
      const base = await loadImage(TEMPLATE_POTG);
      ctx.drawImage(base, 0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);

      if (selected.avatarUrl) {
        const avatar = await loadImage(selected.avatarUrl);
        const scale = Math.max(FRAME_W / avatar.naturalWidth, FRAME_H / avatar.naturalHeight);
        const w = avatar.naturalWidth * scale;
        const h = avatar.naturalHeight * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(FRAME_LEFT, FRAME_TOP, FRAME_W, FRAME_H);
        ctx.clip();
        ctx.drawImage(avatar, FRAME_LEFT + (FRAME_W - w) / 2, FRAME_TOP + (FRAME_H - h) / 2, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = '#111318';
        ctx.fillRect(FRAME_LEFT, FRAME_TOP, FRAME_W, FRAME_H);
        ctx.fillStyle = '#c9a962';
        ctx.font = 'bold 220px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(selected.name.charAt(0).toUpperCase(), FRAME_LEFT + FRAME_W / 2, FRAME_TOP + FRAME_H / 2);
      }

      // Player name strip across the bottom of the photo window.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(FRAME_LEFT, FRAME_TOP + FRAME_H - 90, FRAME_W, 90);
      ctx.fillStyle = '#e8d5a3';
      ctx.font = 'bold 56px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shortName(selected.name).toUpperCase(), FRAME_LEFT + FRAME_W / 2, FRAME_TOP + FRAME_H - 45);

      await downloadCanvasImage(
        canvas,
        `play-of-the-game-${selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
      );
    } catch (err: any) {
      console.error(err);
      setError('Could not build the image. Please try again.');
    } finally {
      setIsRendering(false);
    }
  };

  if (candidates.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2.5xl shadow-lg p-5 flex items-center gap-3">
        <ImageOff className="w-4 h-4 text-slate-500 shrink-0" />
        <p className="text-[11px] text-slate-400">
          No players on the roster yet. Add verified players to your team to build a Play of the Game graphic.
        </p>
      </div>
    );
  }

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
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Player of the Game</h3>
          <p className="text-[10px] font-mono text-slate-450 uppercase mt-0.5">
            {selected ? shortName(selected.name) : 'No player selected'} · Player of the game template
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
            disabled={!selected || isRendering}
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

      {/* Player picker */}
      <div className="mx-5 mb-4 relative">
        <button
          type="button"
          onClick={() => setIsOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 hover:border-[#00bbff]/50 rounded-xl px-3 py-2.5 text-xs text-slate-200 transition cursor-pointer"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Award className="w-3.5 h-3.5 text-[#c9a962] shrink-0" />
            <span className="truncate">{selected ? selected.name : 'Select player of the game...'}</span>
            {selected?.avatarUrl && (
              <img
                src={selected.avatarUrl}
                alt=""
                className="w-6 h-6 rounded-lg object-cover shrink-0 border border-slate-700"
              />
            )}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute z-40 mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-slate-800 relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#00bbff]/50"
              />
            </div>
            <div className="max-h-[220px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-3 text-[10px] text-slate-500 italic text-center">No players match that search.</p>
              ) : (
                filtered.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(c.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition cursor-pointer ${
                      c.id === selectedId ? 'bg-[#00bbff]/10 text-[#00bbff] font-bold' : 'text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt="" className="w-6 h-6 rounded-lg object-cover shrink-0 border border-slate-700" />
                    ) : (
                      <span className="w-6 h-6 rounded-lg bg-slate-800 text-[#c9a962] font-bold flex items-center justify-center shrink-0 text-[10px]">
                        {c.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate">{c.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live preview of the template with the selected player's photo in the window */}
      <div className="relative w-full select-none" style={{ aspectRatio: '1 / 1' }}>
        <img src={TEMPLATE_POTG} alt="Play of the game template" className="absolute inset-0 w-full h-full" draggable={false} />
        {selected && (
          <div
            className="absolute overflow-hidden"
            style={{
              left: pct(FRAME_LEFT),
              top: pct(FRAME_TOP),
              width: pct(FRAME_W),
              height: pct(FRAME_H),
            }}
          >
            {selected.avatarUrl ? (
              <img
                src={selected.avatarUrl}
                alt={selected.name}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-[#111318] flex items-center justify-center text-[#c9a962] font-bold" style={{ fontSize: '20cqw' }}>
                {selected.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className="absolute bottom-0 left-0 right-0 bg-black/75 text-center font-bold uppercase text-[#e8d5a3] py-[3%]"
              style={{ fontSize: '5cqw', letterSpacing: '0.05em' }}
            >
              {shortName(selected.name)}
            </span>
          </div>
        )}
      </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
