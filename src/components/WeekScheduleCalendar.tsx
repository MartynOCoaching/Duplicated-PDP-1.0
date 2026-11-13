
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  MapPin,
  Clock,
  Dumbbell,
  Trophy,
  Gamepad2,
  Sparkles,
  BookOpen,
  Play,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { TeamSchedule, Assignment, RunLog } from '../types';

export const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Monday-to-Sunday week that rolls over at Monday 00:01.
// Shifting "now" back one minute keeps Monday 00:00 in the previous week.
export const getCalendarWeek = (now: Date) => {
  const anchor = new Date(now.getTime() - 60_000);
  const day = anchor.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diffToMonday);
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return names.map((name, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return { day: name, num: String(d.getDate()), dateStr: toLocalDateStr(d) };
  });
};

type ScheduleEventType = 'practice' | 'game' | 'activity' | 'tournament';

const getScheduleEventType = (schedule: TeamSchedule): ScheduleEventType => {
  const value = (schedule as TeamSchedule & { eventType?: string }).eventType;
  return value === 'game' || value === 'activity' || value === 'tournament'
    ? value
    : 'practice';
};

// Calendar indicator colours for each event type.
const getSessionIndicatorColor = (session: TeamSchedule) => {
  const type = getScheduleEventType(session);

  switch (type) {
    case 'game':
      return '#81bd85';
    case 'activity':
      return '#3c7027';
    case 'tournament':
      return '#3c7027';
    default:
      return '#38bdf8'; // Existing practice blue
  }
};

const EVENT_META: Record<ScheduleEventType, { label: string; icon: React.ReactNode; badge: string }> = {
  practice: {
    label: 'Practice',
    icon: <Dumbbell className="w-3.5 h-3.5" />,
    badge: 'bg-sky-500/10 text-sky-300 border-sky-500/30'
  },
  game: {
    label: 'Game',
    icon: <Trophy className="w-3.5 h-3.5" />,
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
  },
  activity: {
    label: 'Event',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
  },
  tournament: {
    label: 'Tournament',
    icon: <Gamepad2 className="w-3.5 h-3.5" />,
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30'
  }
};

interface WeekScheduleCalendarProps {
  teamSchedules: TeamSchedule[];
  teamId?: string;
  assignments: Assignment[];
  runLogs: RunLog[];
  matchKeys: (k1: string | null | undefined, k2: string | null | undefined) => boolean;
  onStartRun?: (assign: Assignment) => void;
  onOpenClassroom?: (moduleId: string) => void;
}

export default function WeekScheduleCalendar({
  teamSchedules,
  teamId,
  assignments,
  runLogs,
  matchKeys,
  onStartRun,
  onOpenClassroom
}: WeekScheduleCalendarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [monthOffset, setMonthOffset] = useState(0);

  const todayStr = toLocalDateStr(now);
  const weekDays = useMemo(() => getCalendarWeek(now), [now]);

  const monthAnchorDate = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return d;
  }, [now, monthOffset]);

  const monthLabel = monthAnchorDate.toLocaleDateString([], {
    month: 'long',
    year: 'numeric'
  });

  // Monday-first grid covering the 1st through the last day of the month
  const monthDays = useMemo(() => {
    const year = monthAnchorDate.getFullYear();
    const month = monthAnchorDate.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const leadBlanks = firstDow === 0 ? 6 : firstDow - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: { dateStr: string; num: number; inMonth: boolean }[] = [];

    for (let i = 0; i < leadBlanks; i++) {
      cells.push({ dateStr: '', num: 0, inMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      cells.push({ dateStr: toLocalDateStr(date), num: d, inMonth: true });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ dateStr: '', num: 0, inMonth: false });
    }

    return cells;
  }, [monthAnchorDate]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Accept a tap from the week strip OR the currently displayed month grid,
  // so month-view days outside this week keep their selection and details.
  const activeDate =
    selectedDate &&
    (weekDays.some(d => d.dateStr === selectedDate) ||
      monthDays.some(c => c.dateStr === selectedDate))
      ? selectedDate
      : todayStr;

  // Team sessions (practices, games, events, tournaments) keyed by date.
  const sessionsByDate = useMemo(() => {
    const map: Record<string, TeamSchedule[]> = {};

    teamSchedules
      .filter(s => matchKeys(s.teamId, teamId))
      .forEach(s => {
        const key = String(s.sessionDate).substring(0, 10);
        if (!map[key]) map[key] = [];
        map[key].push(s);
      });

    Object.values(map).forEach(list =>
      list.sort((a, b) => String(a.sessionTime).localeCompare(String(b.sessionTime)))
    );

    return map;
  }, [teamSchedules, teamId, matchKeys]);

  const assignsByDate = useMemo(() => {
    const map: Record<string, Assignment[]> = {};

    assignments.forEach(a => {
      const key = String(a.dueDate).substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });

    return map;
  }, [assignments]);

  const runsByDate = useMemo(() => {
    const map: Record<string, RunLog[]> = {};

    runLogs.forEach(r => {
      const key = String(r.date).substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });

    return map;
  }, [runLogs]);

  const getDayEvents = (dateStr: string) => ({
    sessions: sessionsByDate[dateStr] || [],
    assignments: assignsByDate[dateStr] || [],
    runs: runsByDate[dateStr] || []
  });

  const activeDayEvents = getDayEvents(activeDate);

  const hasAnything =
    activeDayEvents.sessions.length +
    activeDayEvents.assignments.length +
    activeDayEvents.runs.length > 0;

  const formatTime = (time: string) => {
    const [h, m] = String(time).split(':').map(Number);
    if (Number.isNaN(h)) return '';

    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;

    return `${hour12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400" />
          Week Schedule
        </h3>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400">
            {new Date(`${weekDays[0].dateStr}T00:00`).toLocaleDateString([], {
              day: 'numeric',
              month: 'short'
            })}
            {' – '}
            {new Date(`${weekDays[6].dateStr}T00:00`).toLocaleDateString([], {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
          </span>

          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
            <button
              type="button"
              onClick={() => {
                setViewMode('week');
                setMonthOffset(0);
              }}
              className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wider transition ${
                viewMode === 'week'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Week
            </button>

            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-wider transition ${
                viewMode === 'month'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* Week view */}
      {viewMode === 'week' && (
        <>
          {/* Week strip: Monday 00:01 to Sunday 23:59 */}
          <div className="grid grid-cols-7 gap-1 bg-slate-950 p-2 rounded-xl border border-slate-850">
            {weekDays.map(day => {
              const events = getDayEvents(day.dateStr);
              const hasAssign = events.assignments.length > 0;
              const hasRun = events.runs.length > 0;
              const dateMatches = activeDate === day.dateStr;
              const isToday = todayStr === day.dateStr;

              return (
                <div
                  key={day.dateStr}
                  onClick={() => setSelectedDate(day.dateStr)}
                  className={`py-2 rounded-lg text-center cursor-pointer flex flex-col justify-between items-center h-16 relative transition ${
                    dateMatches
                      ? 'bg-emerald-500/15 border border-emerald-500/40'
                      : 'hover:bg-slate-900 border border-transparent'
                  }`}
                >
                  <div
                    className={`text-[9px] uppercase font-mono ${
                      isToday ? 'text-emerald-400 font-bold' : 'text-slate-500'
                    }`}
                  >
                    {day.day}
                  </div>

                  <div className={`text-xs font-mono font-bold ${
                    dateMatches ? 'text-emerald-300' : 'text-slate-200'
                  }`}>
                    {day.num}
                  </div>

                  <div className="flex gap-1 mt-1 justify-center">
                    {events.sessions.map(session => (
                      <span
                        key={session.id}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          backgroundColor: getSessionIndicatorColor(session)
                        }}
                        title={getScheduleEventType(session)}
                      />
                    ))}

                    {hasAssign && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-amber-400"
                        title="Assignment due"
                      />
                    )}

                    {hasRun && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                        title="Run logged"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Month view */}
      {viewMode === 'month' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMonthOffset(o => o - 1)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 transition"
              title="Previous month"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="text-xs font-mono font-bold text-slate-200">
              {monthLabel}
            </span>

            <button
              type="button"
              onClick={() => setMonthOffset(o => o + 1)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 transition"
              title="Next month"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-slate-950 p-2 rounded-xl border border-slate-850">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(dayName => (
                <div
                  key={dayName}
                  className="text-[9px] uppercase font-mono text-slate-500 text-center py-1"
                >
                  {dayName}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((cell, idx) => {
                if (!cell.inMonth) return <div key={`blank-${idx}`} />;

                const events = getDayEvents(cell.dateStr);
                const hasAssign = events.assignments.length > 0;
                const hasRun = events.runs.length > 0;
                const isToday = todayStr === cell.dateStr;

                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => setSelectedDate(cell.dateStr)}
                    title={events.sessions.map(s => getScheduleEventType(s)).join(', ')}
                    className={`min-h-[44px] sm:min-h-[56px] p-1 rounded-lg text-center cursor-pointer flex flex-col items-center relative transition ${
                      activeDate === cell.dateStr
                        ? 'bg-emerald-500/15 border border-emerald-500/40'
                        : 'hover:bg-slate-900 border border-transparent'
                    }`}
                  >
                    <span className={`text-[10px] font-mono font-bold ${
                      isToday ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      {cell.num}
                    </span>

                    <div className="flex gap-1 mt-auto mb-0.5 justify-center flex-wrap">
                      {events.sessions.map(session => (
                        <span
                          key={session.id}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor: getSessionIndicatorColor(session)
                          }}
                          title={getScheduleEventType(session)}
                        />
                      ))}

                      {hasAssign && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-amber-400"
                          title="Assignment due"
                        />
                      )}

                      {hasRun && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                          title="Run logged"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Selected date and daily schedule */}
      <div className="space-y-2.5">
        <span className="text-[11.5px] uppercase font-mono font-semibold text-slate-400 tracking-wider block">
          <span className="block sm:inline font-normal normal-case">
            Schedule for
          </span>
          <span className="block sm:inline font-bold normal-case">
            {new Date(`${activeDate}T00:00`).toLocaleDateString([], {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })}
          </span>
        </span>

        {!hasAnything && (
          <p className="text-xs text-slate-500 font-mono italic">
            No sessions, games, or assignments on this day.
          </p>
        )}

        {activeDayEvents.sessions.map(session => {
          const meta = EVENT_META[getScheduleEventType(session)];

          return (
            <div
              key={session.id}
              className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-2"
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase ${meta.badge}`}>
                    {meta.icon}
                    {meta.label}
                  </span>
                </div>

                <span className="text-[11px] font-mono text-slate-300 shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  {formatTime(String(session.sessionTime))}
                </span>
              </div>

              {session.location && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                  <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{session.location}</span>
                </div>
              )}

              {session.notes && (
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {session.notes}
                </p>
              )}
            </div>
          );
        })}

        {activeDayEvents.assignments.map(assign => {
          const completed =
            assign.completedByPlayerIds.length > 0 ||
            runLogs.some(r => r.fromAssignmentId === assign.id);

          return (
            <div
              key={assign.id}
              className="p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-2 text-xs"
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5 min-w-0">
                  <BookOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">{assign.title}</span>
                </span>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase shrink-0 ${
                  completed
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-amber-500/10 text-amber-300'
                }`}>
                  {completed ? 'COMPLETED' : 'PENDING'}
                </span>
              </div>

              {assign.type === 'run' && assign.runDistanceKm && (
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-900 text-[11px] text-slate-400 font-mono">
                  <span>Distance: {assign.runDistanceKm.toFixed(1)} km</span>

                  {!completed && onStartRun && (
                    <button
                      onClick={() => onStartRun(assign)}
                      className="text-emerald-400 hover:text-emerald-300 font-bold underline flex items-center gap-1 leading-none"
                    >
                      <Play className="w-3.5 h-3.5 fill-emerald-400 inline" />
                      Launch Tracker
                    </button>
                  )}
                </div>
              )}

              {assign.type === 'module' && onOpenClassroom && assign.moduleId && (
                <div className="flex justify-between pt-1 text-[11px] text-slate-400">
                  <span>Classroom Task</span>

                  {!completed && (
                    <button
                      onClick={() => onOpenClassroom(assign.moduleId as string)}
                      className="text-indigo-400 font-bold underline"
                    >
                      Study Module
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {activeDayEvents.runs.map(run => (
          <div
            key={run.id}
            className="p-3 bg-slate-950/40 border border-slate-850/50 rounded-xl text-xs font-mono text-emerald-400"
          >
            ⚡ GPS Workout Logged: {run.distanceKm.toFixed(2)} km in {Math.floor(run.durationSeconds / 60)}m {run.durationSeconds % 60}s
          </div>
        ))}
      </div>
    </div>
  );
}
