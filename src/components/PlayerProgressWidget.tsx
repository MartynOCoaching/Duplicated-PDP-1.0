/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { ClipboardCheck, Star, CalendarCheck } from 'lucide-react';
import { TeamSchedule, SessionAttendance } from '../types';
import { sanitizeUUID } from '../supabase';
import type { PlayerEvaluationRecord } from './PlayerEvaluationModal';

const CHECK_BALL_ICON = '/attendance-check-ball.webp';
const X_BALL_ICON = '/attendance-x-ball.webp';

const matchKeys = (k1: string | null | undefined, k2: string | null | undefined) => {
  if (!k1 || !k2) return false;
  const clean1 = k1.trim().toLowerCase();
  const clean2 = k2.trim().toLowerCase();
  if (clean1 === clean2) return true;
  try {
    return sanitizeUUID(clean1) === sanitizeUUID(clean2);
  } catch (_) {
    return false;
  }
};

const dayKey = (value: unknown) => String(value ?? '').substring(0, 10);

const formatSessionDate = (date: string, time?: string) => {
  const d = new Date(`${date}T${time || '00:00'}`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

const CATEGORIES = [
  { key: 'attitude', label: 'Attitude' },
  { key: 'effort', label: 'Effort' },
  { key: 'performance', label: 'Performance' },
  { key: 'leadership', label: 'Leadership' }
] as const;

interface PlayerProgressWidgetProps {
  athleteId: string;
  athleteName: string;
  teamId?: string;
  isParent: boolean;
  teamSchedules: TeamSchedule[];
  sessionAttendance: SessionAttendance[];
  playerEvaluations: PlayerEvaluationRecord[];
}

export default function PlayerProgressWidget({
  athleteId,
  athleteName,
  teamId,
  isParent,
  teamSchedules,
  sessionAttendance,
  playerEvaluations
}: PlayerProgressWidgetProps) {
  // Sessions this athlete's team has scheduled, oldest first.
  const teamSessions = useMemo(() => {
    return teamSchedules
      .filter(s => matchKeys(s.teamId, teamId))
      .sort(
        (a, b) =>
          new Date(`${a.sessionDate}T${a.sessionTime || '00:00'}`).getTime() -
          new Date(`${b.sessionDate}T${b.sessionTime || '00:00'}`).getTime()
      );
  }, [teamSchedules, teamId]);

  // One entry per team session: true / false / null (not recorded yet).
  const attendanceRecords = useMemo(() => {
    return teamSessions.map(session => {
      const row = sessionAttendance.find(a => {
        if (!matchKeys(a.playerId, athleteId)) return false;
        if (a.scheduleId) return matchKeys(a.scheduleId, session.id);
        const rowDate = dayKey(a.sessionDate);
        return !!rowDate && rowDate === dayKey(session.sessionDate);
      });
      return {
        session,
        present: row ? !!row.present : null
      };
    });
  }, [teamSessions, sessionAttendance, athleteId]);

  const tracked = attendanceRecords.filter(r => r.present !== null);
  const attendedCount = tracked.filter(r => r.present === true).length;
  const attendanceRate = tracked.length > 0 ? Math.round((attendedCount / tracked.length) * 100) : null;
  const recentRecords = [...tracked].reverse().slice(0, 8);

  // Evaluations recorded about this athlete only.
  const myEvaluations = useMemo(
    () => playerEvaluations.filter(e => matchKeys(e.playerId, athleteId)),
    [playerEvaluations, athleteId]
  );

  const averageScore = myEvaluations.length > 0
    ? myEvaluations.reduce((sum, e) => sum + (e.totalScore || 0), 0) / myEvaluations.length
    : null;
  const starRating = averageScore !== null ? Math.round((averageScore / 20) * 5 * 10) / 10 : null;

  const categoryAverages = useMemo(() => {
    return CATEGORIES.map(cat => {
      const values = myEvaluations
        .map(e => e[cat.key])
        .filter((v): v is number => typeof v === 'number');
      return {
        key: cat.key,
        label: cat.label,
        average: values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null
      };
    });
  }, [myEvaluations]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-[#00bbff]" />
          {isParent ? `${athleteName}'s Progress` : 'My Progress'}
        </h2>
        <p className="text-[10px] font-mono text-slate-400 mt-1">
          Attendance recorded by the coaching staff and the star rating from your player evaluations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Attendance record */}
        <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-[10px] font-bold font-mono uppercase tracking-widest text-slate-300">
              Attendance Record
            </h3>
          </div>

          {attendanceRate === null ? (
            <p className="text-xs text-slate-500 font-mono italic">
              No attendance has been recorded for {isParent ? athleteName : 'you'} yet.
            </p>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <span className="text-3xl font-bold font-mono text-emerald-400 leading-none">
                  {attendanceRate}%
                </span>
                <span className="text-[11px] font-mono text-slate-400 pb-0.5">
                  {attendedCount} of {tracked.length} session{tracked.length === 1 ? '' : 's'} attended
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-slate-900 border border-slate-850 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${attendanceRate}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {recentRecords.map(({ session, present }) => (
                  <div
                    key={session.id}
                    className="flex flex-col items-center gap-1"
                    title={`${formatSessionDate(session.sessionDate, session.sessionTime)} · ${present ? 'Attended' : 'Absent'}`}
                  >
                    <img
                      src={present ? CHECK_BALL_ICON : X_BALL_ICON}
                      alt={present ? 'Attended' : 'Absent'}
                      className="w-7 h-7 object-contain"
                    />
                    <span className="text-[9px] font-mono text-slate-500">
                      {formatSessionDate(session.sessionDate, session.sessionTime)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Evaluation star rating */}
        <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            <h3 className="text-[10px] font-bold font-mono uppercase tracking-widest text-slate-300">
              Coach Evaluations
            </h3>
          </div>

          {starRating === null ? (
            <p className="text-xs text-slate-500 font-mono italic">
              No evaluations recorded yet. Your coach scores each session out of 5 stars.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-0.5" aria-label={`${starRating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <span
                      key={n}
                      style={{
                        color: n <= Math.round(starRating) ? '#f59e0b' : '#475569',
                        fontSize: '22px',
                        lineHeight: 1
                      }}
                    >
                      {'\u2605'}
                    </span>
                  ))}
                </div>
                <span className="text-sm font-bold font-mono text-slate-100">
                  {starRating.toFixed(1)}
                  <span className="text-[11px] font-normal text-slate-400"> / 5</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  avg {averageScore !== null ? averageScore.toFixed(1) : '0'}/20 · {myEvaluations.length} evaluation
                  {myEvaluations.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-2 pt-1">
                {categoryAverages.map(cat => (
                  <div key={cat.key} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400 uppercase tracking-wider">{cat.label}</span>
                      <span className="text-slate-300">
                        {cat.average !== null ? `${cat.average.toFixed(1)} / 5` : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-900 border border-slate-850 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400/80 transition-all duration-500"
                        style={{ width: `${cat.average !== null ? (cat.average / 5) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
