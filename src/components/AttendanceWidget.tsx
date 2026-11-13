/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Calendar, Users, BookOpen } from 'lucide-react';
import { UserProfile, TeamSchedule, SessionAttendance, ClassroomSession, ModuleCompletion, Assignment } from '../types';
import { sanitizeUUID } from '../supabase';

// Ball icons used for attendance: check ball = attended, X ball = absent.
const CHECK_BALL_ICON = '/attendance-check-ball.webp';
const X_BALL_ICON = '/attendance-x-ball.webp';

interface AttendanceWidgetProps {
  currentProfile: UserProfile;
  players: UserProfile[];
  teamSchedules: TeamSchedule[];
  sessionAttendance: SessionAttendance[];
  modules: ClassroomSession[];
  completions: ModuleCompletion[];
  assignments: Assignment[];
}

// Matches loosely-typed keys (names, ids, legacy text ids) the same way the
// rest of the dashboards do, so team/player links resolve consistently.
const matchKeys = (
  k1: string | null | undefined,
  k2: string | null | undefined
) => {
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

export default function AttendanceWidget({
  currentProfile,
  players,
  teamSchedules,
  sessionAttendance,
  modules,
  completions,
  assignments
}: AttendanceWidgetProps) {
  // Always follow the coach's active focus team (set from the header bar),
  // so the widget can never show a different squad than the rest of the page.
  const activeTeamId = currentProfile.teamId || '';

  const roster = useMemo(
    () =>
      players.filter(
        player =>
          player.role === 'player' && matchKeys(player.teamId, activeTeamId)
      ),
    [players, activeTeamId]
  );

  const [selectedPlayerId, setSelectedPlayerId] = useState('');

  // Keep a valid selection as teams/roster change.
  const activePlayer =
    roster.find(p => p.id === selectedPlayerId) || roster[0] || null;

  // Sessions belonging to the active team, oldest first.
  const teamSessions = useMemo(() => {
    return teamSchedules
      .filter(s => matchKeys(s.teamId, activeTeamId))
      .sort(
        (a, b) =>
          new Date(`${a.sessionDate}T${a.sessionTime || '00:00'}`).getTime() -
          new Date(`${b.sessionDate}T${b.sessionTime || '00:00'}`).getTime()
      );
  }, [teamSchedules, activeTeamId]);

  // For a given session, did this player attend?
  const isPresentAt = (
    playerId: string,
    session: TeamSchedule
  ) =>
    sessionAttendance.some(
      a =>
        a.playerId === playerId &&
        a.present &&
        (a.scheduleId
          ? a.scheduleId === session.id
          : a.sessionDate === session.sessionDate &&
            matchKeys(a.teamId, session.teamId))
    );

  const playerBars = useMemo(() => {
    if (!activePlayer) return [];
    return teamSessions.map(session => ({
      session,
      present: isPresentAt(activePlayer.id, session)
    }));
  }, [activePlayer?.id, teamSessions, sessionAttendance]);

  const attendedCount = playerBars.filter(b => b.present).length;
  const totalSessions = playerBars.length;

  const assignedTasks = useMemo(
    () =>
      assignments.filter(
        a =>
          a.type === 'module' &&
          (matchKeys(a.teamId, activeTeamId) || a.teamId === '')
      ),
    [assignments, activeTeamId]
  );

  const formatAxisDate = (date: string) => {
    if (!date) return '--';
    const parsed = new Date(`${date}T00:00`);
    if (isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString([], {
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <Calendar className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-sans text-slate-200 uppercase tracking-wider">
              Attendance
            </h3>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5">
              Per-session attendance by athlete for the active team
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Roster selector */}
        <div className="lg:col-span-4 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Roster ({roster.length})
            </span>
          </div>

          {roster.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs font-mono border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
              No players on this team roster yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {roster.map(player => {
                const isActive = activePlayer?.id === player.id;
                const attended = teamSessions.filter(s =>
                  isPresentAt(player.id, s)
                ).length;

                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(player.id)}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between gap-2 ${
                      isActive
                        ? 'bg-emerald-500/10 border-emerald-500/40'
                        : 'bg-slate-950/60 border-slate-850 hover:bg-slate-950 hover:border-slate-800'
                    }`}
                  >
                    <span
                      className={`text-xs font-semibold truncate ${
                        isActive ? 'text-emerald-300' : 'text-slate-200'
                      }`}
                    >
                      {player.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {attended}/{teamSessions.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Attendance graph */}
        <div className="lg:col-span-8 min-w-0">
          {!activePlayer ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40 p-6">
              <Calendar className="w-7 h-7 text-slate-600 mb-2" />
              <p className="text-xs text-slate-400 font-mono">
                Select an athlete to view their session attendance.
              </p>
            </div>
          ) : totalSessions === 0 ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40 p-6">
              <Calendar className="w-7 h-7 text-slate-600 mb-2" />
              <p className="text-xs text-slate-400 font-mono">
                No sessions have been scheduled for this team yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 border border-slate-850 rounded-xl px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-100 truncate">
                    {activePlayer.name}
                  </p>
                  <p className="text-[10px] font-mono text-slate-500 uppercase mt-0.5">
                    Attendance record
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold font-mono text-emerald-400 leading-none">
                    {attendedCount}/{totalSessions}
                  </div>
                  <div className="text-[9px] font-mono uppercase text-slate-500 mt-1">
                    attended / sessions
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 overflow-x-auto">
                <div className="flex items-start gap-4 min-w-max">
                  {playerBars.map(({ session, present }) => (
                    <div
                      key={session.id}
                      className="flex flex-col items-center shrink-0"
                    >
                      <div
                        className={`w-12 h-12 rounded-full border flex items-center justify-center overflow-hidden transition ${
                          present
                            ? 'bg-emerald-500/10 border-emerald-500/40'
                            : 'bg-rose-500/10 border-rose-500/40'
                        }`}
                        title={present ? 'Attended' : 'Absent'}
                      >
                        <img
                          src={present ? CHECK_BALL_ICON : X_BALL_ICON}
                          alt={present ? 'Attended' : 'Absent'}
                          className="w-10 h-10 object-contain"
                        />
                      </div>

                      <span className="mt-2 text-[9px] font-mono text-slate-400 whitespace-nowrap">
                        {formatAxisDate(session.sessionDate)}
                      </span>

                      <span
                        className={`text-[8px] font-mono font-bold uppercase ${
                          present ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {present ? 'Attended' : 'Absent'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Assigned classroom tasks for the selected athlete */}
      {activePlayer && (
        <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-[#00bbff]" />
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Assigned Classroom Tasks
            </span>
          </div>

          {assignedTasks.length === 0 ? (
            <p className="text-[10px] font-mono text-slate-500 italic">
              No classroom tasks assigned to this team yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {assignedTasks.map(task => {
                const isDone =
                  task.completedByPlayerIds.includes(activePlayer.id) ||
                  completions.some(
                    c =>
                      c.playerId === activePlayer.id &&
                      c.moduleId === task.moduleId
                  );
                const title =
                  modules.find(m => m.id === task.moduleId)?.title ||
                  task.title ||
                  'Learning Module';

                return (
                  <div
                    key={task.id}
                    className="p-2.5 bg-slate-900 rounded-lg border border-slate-850 text-[10px] font-mono flex justify-between items-center gap-2"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-slate-300 font-semibold">
                        {title}
                      </span>
                      <span className="text-[8px] text-slate-500">
                        Due: {task.dueDate}
                      </span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold uppercase text-[8px] shrink-0 ${
                        isDone
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {isDone ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
