/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save } from 'lucide-react';
import { sanitizeUUID } from '../supabase';

export interface PlayerEvaluationRecord {
  id: string;
  teamId: string;
  playerId: string;
  coachId: string;
  scheduleId: string;
  sessionDate: string;
  attitude: number | null;
  effort: number | null;
  performance: number | null;
  leadership: number | null;
  notes: string;
  totalScore: number;
}

export interface PlayerEvaluationInput {
  playerId: string;
  teamId: string;
  scheduleId: string; // '' when the evaluation is not tied to a scheduled session
  sessionDate: string; // YYYY-MM-DD
  attitude: number | null;
  effort: number | null;
  performance: number | null;
  leadership: number | null;
  notes: string;
}

export interface EvaluationSessionOption {
  id: string;
  sessionDate: string;
  sessionTime?: string;
  location?: string;
}

interface PlayerEvaluationModalProps {
  /** The player being evaluated. The popup is closed while this is null. */
  player: { id: string; name: string } | null;
  teamId: string;
  /** The team's scheduled sessions (practices / games). */
  sessions: EvaluationSessionOption[];
  /** All evaluations already loaded for this coach. */
  evaluations: PlayerEvaluationRecord[];
  onSave: (input: PlayerEvaluationInput) => Promise<void>;
  onClose: () => void;
  /** Optional: open on this session first. */
  initialScheduleId?: string;
}

type CategoryKey = 'attitude' | 'effort' | 'performance' | 'leadership';

const CATEGORIES: { key: CategoryKey; label: string; hint: string }[] = [
  { key: 'attitude', label: 'Attitude', hint: 'Respect, coachability, positivity' },
  { key: 'effort', label: 'Effort', hint: 'Work rate and commitment' },
  { key: 'performance', label: 'Performance', hint: 'Quality of play on the day' },
  { key: 'leadership', label: 'Leadership', hint: 'Communication and example' },
];

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const sameId = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    return sanitizeUUID(a) === sanitizeUUID(b);
  } catch (_) {
    return false;
  }
};

// Evaluations with no scheduled session store the all-zero id.
const isNoSchedule = (id?: string | null) => !id || id === ZERO_UUID;

const todayKey = () => {
  const n = new Date();
  return [
    n.getFullYear(),
    String(n.getMonth() + 1).padStart(2, '0'),
    String(n.getDate()).padStart(2, '0'),
  ].join('-');
};

const formatSession = (s: EvaluationSessionOption) => {
  const d = new Date(`${s.sessionDate}T${s.sessionTime || '00:00'}`);
  const when = d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(s.sessionTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
  return s.location ? `${when} · ${s.location}` : when;
};

/** One row of five tappable stars. Tap the selected star again to clear it. */
function StarRating({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-800 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-100 uppercase tracking-wider">{label}</p>
        <p className="text-[10px] font-mono text-slate-400 mt-0.5">{hint}</p>
      </div>

      <div className="flex items-center gap-0.5 shrink-0" role="radiogroup" aria-label={`${label} rating`}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = value !== null && n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              onClick={() => onChange(value === n ? null : n)}
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg transition active:scale-90"
              // Glyph stars (not SVG) so the app-wide icon colour overrides don't recolour them.
              style={{
                color: filled ? '#f59e0b' : '#cbd5e1',
                fontSize: '26px',
                lineHeight: 1,
                background: 'transparent',
              }}
            >
              {'\u2605'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PlayerEvaluationModal({
  player,
  teamId,
  sessions,
  evaluations,
  onSave,
  onClose,
  initialScheduleId,
}: PlayerEvaluationModalProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(`${b.sessionDate}T${b.sessionTime || '00:00'}`).getTime() -
          new Date(`${a.sessionDate}T${a.sessionTime || '00:00'}`).getTime()
      ),
    [sessions]
  );

  // '' means "no scheduled session: use the date below"
  const [scheduleChoice, setScheduleChoice] = useState<string>('');
  const [customDate, setCustomDate] = useState<string>(todayKey());

  const [ratings, setRatings] = useState<Record<CategoryKey, number | null>>({
    attitude: null,
    effort: null,
    performance: null,
    leadership: null,
  });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Pick the starting session whenever a different player is opened
  useEffect(() => {
    if (!player) return;
    const today = todayKey();
    const requested = initialScheduleId
      ? sortedSessions.find((s) => sameId(s.id, initialScheduleId))
      : undefined;
    const latestPast = sortedSessions.find((s) => s.sessionDate <= today);
    const pick = requested || latestPast || sortedSessions[sortedSessions.length - 1];
    setScheduleChoice(pick ? pick.id : '');
    setCustomDate(today);
    setError(null);
    setSavedMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id]);

  const chosenSession = scheduleChoice
    ? sortedSessions.find((s) => s.id === scheduleChoice)
    : undefined;
  const sessionDate = chosenSession ? chosenSession.sessionDate : customDate;

  // The evaluation already saved for this player + session (if any)
  const existing = useMemo(() => {
    if (!player) return undefined;
    return evaluations.find((e) => {
      if (!sameId(e.playerId, player.id)) return false;
      if (scheduleChoice) return sameId(e.scheduleId, scheduleChoice);
      return isNoSchedule(e.scheduleId) && e.sessionDate === sessionDate;
    });
  }, [evaluations, player, scheduleChoice, sessionDate]);

  // Load the saved ratings (or blank them) when the player / session changes
  useEffect(() => {
    if (!player) return;
    setRatings({
      attitude: existing?.attitude ?? null,
      effort: existing?.effort ?? null,
      performance: existing?.performance ?? null,
      leadership: existing?.leadership ?? null,
    });
    setNotes(existing?.notes || '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id, scheduleChoice, sessionDate, existing?.id]);

  // Escape closes; page behind is locked while open
  useEffect(() => {
    if (!player) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [player?.id]);

  const sessionTotal =
    (ratings.attitude ?? 0) + (ratings.effort ?? 0) + (ratings.performance ?? 0) + (ratings.leadership ?? 0);
  const ratedCount = CATEGORIES.filter((c) => ratings[c.key] !== null).length;
  const hasAnything = ratedCount > 0 || notes.trim().length > 0;

  // Rolling total across this player's latest 30 evaluations
  const rolling = useMemo(() => {
    if (!player) return { count: 0, points: 0, max: 0, percent: 0 };
    const mine = evaluations
      .filter((e) => sameId(e.playerId, player.id))
      .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0))
      .slice(0, 30);
    const points = mine.reduce((sum, e) => sum + (e.totalScore || 0), 0);
    const max = mine.length * 20;
    return { count: mine.length, points, max, percent: max > 0 ? Math.round((points / max) * 1000) / 10 : 0 };
  }, [evaluations, player]);

  const handleSave = async () => {
    if (!player || !sessionDate) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await onSave({
        playerId: player.id,
        teamId,
        scheduleId: scheduleChoice,
        sessionDate,
        attitude: ratings.attitude,
        effort: ratings.effort,
        performance: ratings.performance,
        leadership: ratings.leadership,
        notes,
      });
      setSavedMsg('Evaluation saved.');
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Could not save the evaluation.');
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {player && (
        <motion.div
          key="player-evaluation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={`Evaluate ${player.name}`}
          className="fixed inset-0 overflow-y-auto overscroll-contain bg-black/70 backdrop-blur-sm"
          style={{ zIndex: 2147483000, WebkitOverflowScrolling: 'touch' }}
          onClick={() => onClose()}
        >
          <div className="min-h-full flex items-center justify-center p-3 sm:p-6">
            <motion.div
              initial={{ scale: 0.96, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 12, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.35 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-800">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Player Evaluation
                  </p>
                  <h3 className="text-lg font-bold text-slate-100 truncate">{player.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="shrink-0 p-2 rounded-xl hover:bg-slate-800/50 transition cursor-pointer"
                  title="Close (Esc)"
                  aria-label="Close evaluation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Session picker */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Session
                  </label>
                  <select
                    value={scheduleChoice}
                    onChange={(e) => {
                      setScheduleChoice(e.target.value);
                      setSavedMsg(null);
                    }}
                    className="w-full rounded-xl px-3 py-2.5 text-xs font-medium"
                  >
                    {sortedSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {formatSession(s)}
                      </option>
                    ))}
                    <option value="">Other date (not a scheduled session)</option>
                  </select>

                  {!scheduleChoice && (
                    <input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 text-xs font-medium"
                    />
                  )}

                  <p className="text-[10px] font-mono text-slate-400">
                    {existing
                      ? 'An evaluation already exists for this session. Saving will update it.'
                      : 'No evaluation saved for this session yet.'}
                  </p>
                </div>

                {/* Star ratings */}
                <div className="rounded-2xl border border-slate-800 px-4">
                  {CATEGORIES.map((c) => (
                    <StarRating
                      key={c.key}
                      label={c.label}
                      hint={c.hint}
                      value={ratings[c.key]}
                      onChange={(next) => {
                        setRatings((prev) => ({ ...prev, [c.key]: next }));
                        setSavedMsg(null);
                      }}
                    />
                  ))}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setSavedMsg(null);
                    }}
                    placeholder="What went well, what to work on next..."
                    className="w-full rounded-xl p-3 text-xs leading-relaxed"
                  />
                </div>

                {/* Totals */}
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-950/60 border border-slate-800 px-4 py-3">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">This session</p>
                    <p className="text-xl font-bold text-slate-100">
                      {sessionTotal}
                      <span className="text-xs font-normal text-slate-400"> / 20</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      Last {rolling.count} evaluation{rolling.count === 1 ? '' : 's'}
                    </p>
                    <p className="text-sm font-bold text-slate-100">
                      {rolling.points} / {rolling.max}
                      {rolling.max > 0 && (
                        <span className="text-xs font-normal text-slate-400"> ({rolling.percent}%)</span>
                      )}
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl bg-rose-950/30 border border-rose-500/20 px-3 py-2 text-xs text-rose-600">
                    {error}
                  </div>
                )}
                {savedMsg && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-400">
                    {savedMsg}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={saving || !hasAnything || !sessionDate}
                    onClick={handleSave}
                    className="flex-1 bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : existing ? 'Update Evaluation' : 'Save Evaluation'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onClose()}
                    className="px-4 py-3 rounded-xl text-xs font-bold border border-slate-800 hover:bg-slate-800/50 transition"
                  >
                    Close
                  </button>
                </div>

                <p className="text-[10px] font-mono text-slate-400 text-center">
                  Ratings are optional, so you can score during the session and finish afterwards. Only coaches can see evaluations.
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

