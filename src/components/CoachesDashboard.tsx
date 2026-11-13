/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Award, Calendar, ChevronRight, ChevronDown, ChevronUp, Activity, Plus, Check, Clock, User, Sparkles, ListFilter as Filter, Database, Droplet, Star, ShieldAlert, FileText, X, MapPin, SquarePen } from 'lucide-react';
import { UserProfile, RunLog, DailyMetrics, Assignment, ClassroomSession, Team, HydrationLog, TeamSchedule, SessionAttendance } from '../types';
import { sanitizeUUID } from '../supabase';

// Thumbnail crop for session drill images.
// X/Y are fractions of the image: 0 = left/top edge, 1 = right/bottom edge.
const DRILL_THUMB_ZOOM = 1.1;     // how far to zoom in (1 = no zoom)
const DRILL_THUMB_FOCUS_X = 0.5;  // horizontal position of the green drill
const DRILL_THUMB_FOCUS_Y = 0.28; // vertical position of the green drill

// Empty space above the image, as a fraction of the thumbnail height.
// Increase this to push the image further down.
const DRILL_THUMB_TOP_PAD = 0.1;

const drillThumbImgStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: `${DRILL_THUMB_FOCUS_X * 100}% ${DRILL_THUMB_FOCUS_Y * 100}%`,
  transformOrigin: `${DRILL_THUMB_FOCUS_X * 100}% ${DRILL_THUMB_FOCUS_Y * 100}%`,
  transform: `scale(${DRILL_THUMB_ZOOM})`,
};

interface CoachDrillRecord {
  id: string;
  coachId: string;
  teamId: string;
  scheduleId: string;
  url: string;
}

type ScheduleEventType = 'practice' | 'game' | 'activity' | 'tournament';

const SCHEDULE_EVENT_OPTIONS: { value: ScheduleEventType; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'game', label: 'Game' },
  { value: 'activity', label: 'Event' },
  { value: 'tournament', label: 'Tournament' },
];

const getScheduleEventType = (schedule: TeamSchedule): ScheduleEventType => {
  const value = (schedule as TeamSchedule & { eventType?: string }).eventType;
  return value === 'game' || value === 'activity' || value === 'tournament'
    ? value
    : 'practice';
};

interface CoachesDashboardProps {
  currentProfile: UserProfile;
  players: UserProfile[];
  runLogs: RunLog[];
  metrics: Record<string, DailyMetrics[]>;
  assignments: Assignment[];
  modules: ClassroomSession[];
  onAddAssignment: (assignment: Omit<Assignment, 'id' | 'completedByPlayerIds'>) => void;
  onUpdatePlayerGoal?: (playerId: string, updatedGoals: Partial<DailyMetrics>) => void;
  teams?: Team[];
  onChangeActiveTeam?: (newTeamId: string) => void;
  hydrationLogs?: HydrationLog[];
  teamSchedules?: TeamSchedule[];
  sessionAttendance?: SessionAttendance[];
  coachDrills?: CoachDrillRecord[];
  onAddSchedule?: (schedule: Omit<TeamSchedule, 'id' | 'createdAt'>) => void;
  onUpdateSchedule?: (scheduleId: string, fields: Partial<TeamSchedule>) => void;
  onDeleteSchedule?: (scheduleId: string) => void;
  onSaveAttendance?: (
    scheduleId: string,
    playerId: string,
    present: boolean,
    recordedBy?: string,
    meta?: { teamId?: string; sessionDate?: string; sessionTime?: string }
  ) => void;
}

interface PlayerAccordionProps {
  player: UserProfile;
  isExpanded: boolean;
  onToggle: () => void;
  runLogs: RunLog[];
  playerMetrics: DailyMetrics[];
  onUpdatePlayerGoal?: (playerId: string, updatedGoals: Partial<DailyMetrics>) => void;
  playerHydrationLogs?: HydrationLog[];
  sessionAttendance?: SessionAttendance[];
  teamSchedules?: TeamSchedule[];
  key?: string;
}

function PlayerPerformanceAccordion({
  player,
  isExpanded,
  onToggle,
  runLogs,
  playerMetrics,
  onUpdatePlayerGoal,
  playerHydrationLogs = [],
  sessionAttendance = [],
  teamSchedules = []
}: PlayerAccordionProps) {
  const logs = runLogs.filter(r => r.playerId === player.id);
  const totalDistance = logs.reduce((sum, r) => sum + r.distanceKm, 0);
  const totalSeconds = logs.reduce((sum, r) => sum + r.durationSeconds, 0);
  const avgSpeed = logs.length > 0 ? logs.reduce((sum, r) => sum + r.avgSpeedKmH, 0) / logs.length : 0;

  const currentStats = {
    count: logs.length,
    distance: totalDistance,
    duration: totalSeconds,
    avgSpeed: avgSpeed
  };

  const latestMetric = playerMetrics.length > 0 ? playerMetrics[playerMetrics.length - 1] : null;

  const today = '2026-05-21';
  const todayLog = playerHydrationLogs.find(l => l.logDate === today);
  const todayHydrationMl = todayLog?.hydrationMl ?? latestMetric?.hydrationMls ?? 0;
  const dailyGoalMl = latestMetric?.hydrationGoalMls || 3000;

  const getWeekStart = (dateStr: string) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  };

  const weekStart = getWeekStart(today);
  const weeklyGoalMl = 21000;

  const weeklyHydrationMl = playerHydrationLogs
    .filter(l => l.logDate >= weekStart && l.logDate <= today)
    .reduce((sum, l) => sum + l.hydrationMl, 0);

  // ---- Attendance for this player ----
  // Attendance can be saved against a schedule (scheduleId) or against a date
  // (Practice Session Log), so resolve the date either way and keep one entry per day.
  const scheduleById = new Map(teamSchedules.map(s => [s.id, s]));

  const playerAttendance = (() => {
    const byDate = new Map<string, { date: string; present: boolean }>();

    sessionAttendance
      .filter(a => a.playerId === player.id)
      .forEach(a => {
        const date = a.sessionDate || scheduleById.get(a.scheduleId)?.sessionDate;
        if (!date) return;
        const existing = byDate.get(date);
        // A present mark on a day wins over an unmarked/absent record for the same day
        byDate.set(date, { date, present: (existing?.present ?? false) || a.present });
      });

    return Array.from(byDate.values()).sort((x, y) => y.date.localeCompare(x.date));
  })();

  const sessionsTotal = playerAttendance.length;
  const sessionsPresent = playerAttendance.filter(e => e.present).length;
  const attendanceRate = sessionsTotal ? Math.round((sessionsPresent / sessionsTotal) * 100) : 0;
  const recentAttendance = playerAttendance.slice(0, 5);

  const formatAttendanceDate = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

  const [customHydration, setCustomHydration] = useState(latestMetric?.hydrationGoalMls || 3000);
  const [customSleep, setCustomSleep] = useState(latestMetric?.sleepQuality || 'Good');
  const [customRunGoal, setCustomRunGoal] = useState(latestMetric?.runDistanceGoalKm || 15.0);
  const [goalFeedback, setGoalFeedback] = useState(false);

  useEffect(() => {
    if (latestMetric) {
      setCustomHydration(latestMetric.hydrationGoalMls || 3000);
      setCustomSleep(latestMetric.sleepQuality || 'Good');
      setCustomRunGoal(latestMetric.runDistanceGoalKm || 15.0);
    }
  }, [latestMetric]);

  const handleApplyPersonalGoals = () => {
    if (!onUpdatePlayerGoal) return;

    onUpdatePlayerGoal(player.id, {
      hydrationGoalMls: customHydration,
      sleepQuality: customSleep as 'Poor' | 'Fair' | 'Good' | 'Excellent',
      runDistanceGoalKm: customRunGoal,
    });

    setGoalFeedback(true);
    setTimeout(() => setGoalFeedback(false), 2500);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden transition-all">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left flex flex-col sm:flex-row justify-between sm:items-center gap-3 p-5 outline-none transition-colors hover:bg-slate-850/30"
      >
        <div className="flex items-center gap-3 select-none">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
            <User className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-sans font-bold text-slate-100">
                {player.name}
              </h2>

              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-slate-800 bg-slate-950/60 text-slate-400">
                Performance Overview
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 select-none self-end sm:self-auto">
          <span className="px-3 py-1 bg-emerald-500/15 border border-emerald-500/20 text-emerald-300 text-xs rounded-lg font-mono">
            🔥 Active Streak: 5 Days
          </span>

          <div
            className={`p-1.5 rounded-lg bg-slate-950 border border-slate-850 text-slate-400 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          >
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="p-6 pt-2 border-t border-slate-850 space-y-6">
          {/* Stats Widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

            {/* Aerobic Load */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                Weekly Aerobic Load
              </div>

              <div className="text-2xl font-mono font-bold text-slate-100 mt-1">
                {currentStats.distance.toFixed(2)}
                <span className="text-xs text-slate-400 font-normal ml-1">
                  km
                </span>
              </div>

              <div className="mt-2 text-[10px] font-mono text-slate-450 flex items-center justify-between">
                <span>
                  Target: {(latestMetric?.runDistanceGoalKm || 15.0).toFixed(1)}k
                </span>

                <span className="text-emerald-400">
                  {currentStats.distance
                    ? Math.min(
                        100,
                        Math.floor(
                          (currentStats.distance /
                            (latestMetric?.runDistanceGoalKm || 15.0)) *
                            105
                        )
                      )
                    : 0}
                  %
                </span>
              </div>

              <div className="w-full bg-slate-850 h-1 rounded-full overflow-hidden mt-1.5">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      (currentStats.distance /
                        (latestMetric?.runDistanceGoalKm || 15.0)) *
                        100
                    )}%`
                  }}
                />
              </div>
            </div>

            {/* Hydration Log Status */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/30">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                <Droplet className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                Hydration Log Status
              </div>

              <div className="text-2xl font-mono font-bold text-slate-100 mt-1">
                {todayHydrationMl}
                <span className="text-xs text-slate-400 font-normal ml-1">
                  ml today
                </span>
              </div>

              <div className="mt-2 text-[10px] font-mono text-slate-450 w-full flex items-center justify-between">
                <span>Daily goal: {dailyGoalMl} ml</span>

                <span className="text-sky-400">
                  {Math.min(
                    100,
                    Math.round((todayHydrationMl / dailyGoalMl) * 100)
                  )}
                  %
                </span>
              </div>

              <div className="w-full bg-slate-850 h-1 rounded-full overflow-hidden mt-1.5">
                <div
                  className="bg-sky-400 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      (todayHydrationMl / dailyGoalMl) * 100
                    )}%`
                  }}
                />
              </div>

              <div className="mt-3 text-[10px] font-mono text-slate-450 w-full flex items-center justify-between">
                <span>
                  Weekly: {weeklyHydrationMl} / {weeklyGoalMl} ml
                </span>

                <span className="text-sky-300">
                  {Math.min(
                    100,
                    Math.round((weeklyHydrationMl / weeklyGoalMl) * 100)
                  )}
                  %
                </span>
              </div>

              <div className="w-full bg-slate-850 h-1 rounded-full overflow-hidden mt-1.5">
                <div
                  className="bg-sky-300 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      (weeklyHydrationMl / weeklyGoalMl) * 100
                    )}%`
                  }}
                />
              </div>
            </div>

            {/* Sleep Quality Rating */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                Sleep Quality Rating
              </div>

              <div className="text-xl font-sans font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                {latestMetric?.sleepQuality || 'Good'}
              </div>

              <p className="mt-2.5 text-[10px] font-mono text-slate-400">
                Rest hours logged:{' '}
                <b className="text-slate-150">
                  {latestMetric?.sleepHours || 8}h
                </b>
              </p>
            </div>

            {/* Attendance */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Attendance
              </div>

              <div className="text-2xl font-mono font-bold text-slate-100 mt-1">
                {attendanceRate}
                <span className="text-xs text-slate-400 font-normal ml-1">% present</span>
              </div>

              <div className="mt-2 text-[10px] font-mono text-slate-450 flex items-center justify-between">
                <span>{sessionsPresent} / {sessionsTotal} sessions</span>
                <span className="text-emerald-400">{attendanceRate}%</span>
              </div>

              <div className="w-full bg-slate-850 h-1 rounded-full overflow-hidden mt-1.5">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${attendanceRate}%` }}
                />
              </div>

              <div className="mt-3 pt-3 border-t border-slate-850 space-y-1.5">
                {recentAttendance.length === 0 ? (
                  <p className="text-[10px] font-mono text-slate-500 italic">No attendance recorded yet</p>
                ) : (
                  recentAttendance.map(entry => (
                    <div key={entry.date} className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400">{formatAttendanceDate(entry.date)}</span>
                      <span className={entry.present ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                        {entry.present ? 'PRESENT' : 'ABSENT'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Personalize Goals Panel */}
          {onUpdatePlayerGoal && (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-850/80 space-y-3.5">
              <h3 className="text-xs font-bold font-mono text-slate-200 uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Player Performance Target
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-slate-450 mb-1">
                    SET HYDRATION TARGET (ML)
                  </label>

                  <input
                    type="number"
                    step={250}
                    value={customHydration}
                    onChange={(e) =>
                      setCustomHydration(parseInt(e.target.value) || 3000)
                    }
                    className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-350 rounded-lg p-2 font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-450 mb-1">
                    SET RUN DISTANCE GOAL (KM)
                  </label>

                  <input
                    type="number"
                    step={0.5}
                    min={1}
                    max={100}
                    value={customRunGoal}
                    onChange={(e) =>
                      setCustomRunGoal(parseFloat(e.target.value) || 15.0)
                    }
                    className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-350 rounded-lg p-2 font-mono outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-450 mb-1">
                    REQUIRED MIN SLEEP RATING
                  </label>

                  <select
                    value={customSleep}
                    onChange={(e) => setCustomSleep(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-350 rounded-lg p-2 font-mono outline-none"
                  >
                    <option value="Poor">Poor</option>
                    <option value="Fair">Fair</option>
                    <option value="Good">Good</option>
                    <option value="Excellent">Excellent</option>
                  </select>
                </div>
              </div>

              {goalFeedback && (
                <div className="text-xs font-semibold text-emerald-400 font-mono text-center pt-1">
                  ✓ Goals updated and synced successfully inside the player dashboard!
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleApplyPersonalGoals}
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold px-4 py-2 rounded-lg transition"
                >
                  Update Player Personal Goals
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CoachesDashboard({
  currentProfile,
  players,
  runLogs,
  metrics,
  assignments,
  modules,
  teams,
  onChangeActiveTeam,
  onAddAssignment,
  onUpdatePlayerGoal,
  hydrationLogs = [],
  teamSchedules = [],
  sessionAttendance = [],
  coachDrills = [],
  onAddSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  onSaveAttendance
}: CoachesDashboardProps) {
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
    } catch (_) {}

    return false;
  };

  // Navigation drilldown for hierarchy
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const coachTeamIdsObj =
    currentProfile.teamIds ||
    (currentProfile.teamId ? [currentProfile.teamId] : []);

  const myCoachedTeams = (teams || []).filter(t =>
    coachTeamIdsObj.some(teamId => matchKeys(teamId, t.id))
  );

  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    currentProfile.teamId || coachTeamIdsObj[0] || ''
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');

  // Keep the selected team when the coach has multiple teams.
  // Only fall back if the currently selected team is no longer one
  // of the coach's assigned teams.
  useEffect(() => {
    const profileTeamId = currentProfile.teamId || '';

    const selectedStillValid = coachTeamIdsObj.some(teamId =>
      matchKeys(teamId, selectedTeamId)
    );

    // The header "Focus Team" selector updates the profile's active team.
    // Sync the dashboard to it so switching teams re-populates immediately
    // instead of waiting for a manual page refresh.
    const profileTeamValid =
      !!profileTeamId &&
      coachTeamIdsObj.some(teamId => matchKeys(teamId, profileTeamId));

    const needsSync =
      profileTeamValid && !matchKeys(profileTeamId, selectedTeamId);

    if (needsSync || !selectedStillValid) {
      const nextTeamId = needsSync
        ? profileTeamId
        : (currentProfile.teamId || coachTeamIdsObj[0] || '');

      setSelectedTeamId(nextTeamId);
      setSelectedPlayerId('');
      setExpandedPlayerIds({});
    }
  }, [
    currentProfile.teamId,
    currentProfile.teamIds,
    selectedTeamId
  ]);

  // Accordion open/close states
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (selectedPlayerId) {
      setExpandedPlayerIds(prev => ({
        ...prev,
        [selectedPlayerId]: true
      }));
    }
  }, [selectedPlayerId]);

  // Assignment dispatcher
  const [assignType, setAssignType] = useState<'run' | 'module'>('run');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDistance, setAssignDistance] = useState(5.0);
  const [assignModuleId, setAssignModuleId] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('2026-05-30');
  const [successMsg, setSuccessMsg] = useState(false);

  // Personalized training target states
  const [customHydration, setCustomHydration] = useState(3000);
  const [customSleep, setCustomSleep] = useState('Good');
  const [customRunGoal, setCustomRunGoal] = useState(15.0);
  const [goalFeedback, setGoalFeedback] = useState(false);

  // Practice Session Log state
  const [attendanceDate, setAttendanceDate] = useState(
    () => new Date().toISOString().split('T')[0]
  );
  const [isRosterExpanded, setIsRosterExpanded] = useState(false);
  const [isPerformanceOverviewExpanded, setIsPerformanceOverviewExpanded] =
    useState(false);
  const [isNextSessionExpanded, setIsNextSessionExpanded] = useState(false);

  // Drill image popup state (Next Session panel)
  const [selectedNextSessionDrillUrl, setSelectedNextSessionDrillUrl] = useState<string | null>(null);
  const [previewZoomed, setPreviewZoomed] = useState(false);

  // Escape key closes the drill popup and the page behind it stops scrolling
  useEffect(() => {
    if (!selectedNextSessionDrillUrl) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedNextSessionDrillUrl(null);
    };
    window.addEventListener('keydown', onKeyDown);

    // Lock background scrolling while the popup is open
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [selectedNextSessionDrillUrl]);

  // ---------------------------------------------------------
  // TEAM SCHEDULE WIDGET STATE
  // ---------------------------------------------------------
  const [newSessionDate, setNewSessionDate] = useState('');
  const [newSessionTime, setNewSessionTime] = useState('');
  const [newSessionLocation, setNewSessionLocation] = useState('');
  const [newSessionEventType, setNewSessionEventType] = useState<ScheduleEventType>('practice');
  const [isAddingSession, setIsAddingSession] = useState(false);

  // Inline editing of an existing session
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionDate, setEditSessionDate] = useState('');
  const [editSessionTime, setEditSessionTime] = useState('');
  const [editSessionLocation, setEditSessionLocation] = useState('');
  const [editSessionEventType, setEditSessionEventType] = useState<ScheduleEventType>('practice');

  const startEditSession = (session: TeamSchedule) => {
    setEditingSessionId(session.id);
    setEditSessionDate(session.sessionDate);
    setEditSessionTime(session.sessionTime);
    setEditSessionLocation(session.location || '');
    setEditSessionEventType(getScheduleEventType(session));
    setIsAddingSession(false);
  };

  const cancelEditSession = () => {
    setEditingSessionId(null);
    setEditSessionDate('');
    setEditSessionTime('');
    setEditSessionLocation('');
    setEditSessionEventType('practice');
  };

  const saveEditedSession = () => {
    if (!editingSessionId || !editSessionDate || !editSessionTime) return;
    if (onUpdateSchedule) {
      onUpdateSchedule(editingSessionId, {
        sessionDate: editSessionDate,
        sessionTime: editSessionTime,
        location: editSessionLocation.trim() || undefined,
        eventType: editSessionEventType,
      } as Partial<TeamSchedule> & { eventType: ScheduleEventType });
    }
    cancelEditSession();
  };

  // Currently open attendance popup (session id, or null when closed)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // Schedule row currently expanded in the Team Schedule widget
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  // Schedule row awaiting delete confirmation
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  // Practice Session Log accordion (collapsed by default)
  const [isPracticeLogOpen, setIsPracticeLogOpen] = useState(false);

  const handleAddSession = () => {
    if (!newSessionDate || !newSessionTime || !activeTeamId) return;
    if (onAddSchedule) {
      const newSchedule = {
        coachId: currentProfile.id,
        teamId: activeTeamId,
        sessionDate: newSessionDate,
        sessionTime: newSessionTime,
        location: newSessionLocation.trim() || undefined,
        eventType: newSessionEventType,
      } as Omit<TeamSchedule, 'id' | 'createdAt'> & { eventType: ScheduleEventType };

      onAddSchedule(newSchedule);
    }
    setNewSessionDate('');
    setNewSessionTime('');
    setNewSessionLocation('');
    setNewSessionEventType('practice');
    setIsAddingSession(false);
  };

  const handleToggleSessionAttendance = (
    sessionId: string,
    playerId: string,
    meta?: { teamId?: string; sessionDate?: string; sessionTime?: string }
  ) => {
    const existing = sessionAttendance.find(
      a => a.scheduleId === sessionId && a.playerId === playerId
    );
    const newPresent = existing ? !existing.present : true;
    if (onSaveAttendance) {
      onSaveAttendance(
        sessionId,
        playerId,
        newPresent,
        currentProfile.coachId || currentProfile.id,
        meta
      );
    }
  };

  const formatSessionDisplay = (date: string, time: string) => {
    const d = new Date(`${date}T${time}`);
    return d.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 1. Role boundaries for data access filtering
  // Admins see everything. Associations see clubs within their ID.
  // Clubs see teams within their ID. Teams see Coaches/Players.
  const associationFilteredPlayers = players.filter(player => {
    if (currentProfile.role === 'association') {
      return matchKeys(
        player.associationId,
        currentProfile.associationId
      );
    }

    if (currentProfile.role === 'club') {
      return matchKeys(
        player.clubId,
        currentProfile.clubId
      );
    }

    if (currentProfile.role === 'team') {
      return matchKeys(
        player.teamId,
        currentProfile.teamId
      );
    }

    if (currentProfile.role === 'coach') {
      const coachId = currentProfile.coachId || currentProfile.id;

      const isLinkedCoach =
        matchKeys(player.coachId, coachId) ||
        matchKeys(player.coachId, currentProfile.id) ||
        matchKeys(player.coachId, currentProfile.coachId);

      const isMyTeam =
        (currentProfile.teamIds && player.teamId
          ? currentProfile.teamIds.includes(player.teamId)
          : false) ||
        matchKeys(player.teamId, currentProfile.teamId);

      return isLinkedCoach || isMyTeam;
    }

    // Admin has total access
    return true;
  });

  // ---------------------------------------------------------
  // ACTIVE TEAM / PLAYER FILTER
  // ---------------------------------------------------------
  //
  // IMPORTANT:
  // The selected team now controls the roster for coaches.
  //
  // Previously, a player linked to the coach through coachId
  // could bypass the selected team because of:
  //
  //   if (isDirect) return true;
  //
  // That caused players from Team A to remain visible when
  // switching to Team B.
  //
  // Now the selected activeTeamId is the controlling filter.
  // ---------------------------------------------------------

  const activeTeamId = selectedTeamId;

  // Filter schedules for the active team and sort chronologically.
  const teamSessions = teamSchedules.filter(s => matchKeys(s.teamId, activeTeamId));
  const sortedSessions = [...teamSessions].sort(
    (a, b) =>
      new Date(`${a.sessionDate}T${a.sessionTime}`).getTime() -
      new Date(`${b.sessionDate}T${b.sessionTime}`).getTime()
  );

  const now = new Date();
  const upcomingSessions = sortedSessions.filter(
    s => new Date(`${s.sessionDate}T${s.sessionTime}`).getTime() >= now.getTime()
  );

  const nextFiveSessions = (
    upcomingSessions.length > 0
      ? upcomingSessions
      : [...sortedSessions].reverse()
  ).slice(0, 5);

  const nextSession = upcomingSessions[0] || null;
  const nextSessionCoachDrills = nextSession
    ? coachDrills.filter(
        drill =>
          matchKeys(drill.teamId, activeTeamId) &&
          matchKeys(drill.scheduleId, nextSession.id)
      )
    : [];

  const activeSession = teamSessions.find(s => s.id === activeSessionId) || null;

  const teamMatchesPlayers =
    currentProfile.role === 'coach'
      ? associationFilteredPlayers.filter(player =>
          !!activeTeamId &&
          matchKeys(player.teamId, activeTeamId)
        )
      : associationFilteredPlayers.filter(player =>
          !activeTeamId ||
          matchKeys(player.teamId, activeTeamId)
        );

  // Selected active player focus
  const focusedPlayer =
    teamMatchesPlayers.find(p => p.id === selectedPlayerId) ||
    teamMatchesPlayers[0];

  // Helper stats gatherer
  const getPlayerRunSummaries = (playerId: string) => {
    const logs = runLogs.filter(r => r.playerId === playerId);

    const totalDistance = logs.reduce(
      (sum, r) => sum + r.distanceKm,
      0
    );

    const totalSeconds = logs.reduce(
      (sum, r) => sum + r.durationSeconds,
      0
    );

    const avgSpeed =
      logs.length > 0
        ? logs.reduce(
            (sum, r) => sum + r.avgSpeedKmH,
            0
          ) / logs.length
        : 0;

    return {
      count: logs.length,
      distance: totalDistance,
      duration: totalSeconds,
      avgSpeed: avgSpeed
    };
  };

  const currentFocusedStats = focusedPlayer
    ? getPlayerRunSummaries(focusedPlayer.id)
    : null;

  const currentFocusedMetrics = focusedPlayer
    ? metrics[focusedPlayer.id] || []
    : [];

  const latestMetric =
    currentFocusedMetrics.length > 0
      ? currentFocusedMetrics[
          currentFocusedMetrics.length - 1
        ]
      : null;

  useEffect(() => {
    if (latestMetric) {
      setCustomHydration(
        latestMetric.hydrationGoalMls || 3000
      );

      setCustomSleep(
        latestMetric.sleepQuality || 'Good'
      );

      setCustomRunGoal(
        latestMetric.runDistanceGoalKm || 15.0
      );
    } else {
      setCustomHydration(3000);
      setCustomSleep('Good');
      setCustomRunGoal(15.0);
    }
  }, [focusedPlayer?.id, latestMetric?.date]);

  const handlePostAssignment = (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!activeTeamId) return;

    const matchedModule = modules.find(
      m => m.id === assignModuleId
    );

    const titleVal =
      assignType === 'module'
        ? `Required Session: ${
            matchedModule?.title || 'Learning Module'
          }`
        : assignTitle ||
          `Required ${assignDistance}K Fitness Log`;

    onAddAssignment({
      coachId:
        currentProfile.coachId || 'coach-system',
      teamId: activeTeamId,
      type: assignType,
      title: titleVal,
      dueDate: assignDueDate,
      runDistanceKm:
        assignType === 'run'
          ? assignDistance
          : undefined,
      moduleId:
        assignType === 'module'
          ? assignModuleId
          : undefined,
    });

    setSuccessMsg(true);
    setAssignTitle('');

    setTimeout(
      () => setSuccessMsg(false),
      3000
    );
  };

  const handleApplyPersonalGoals = () => {
    if (
      !focusedPlayer ||
      !onUpdatePlayerGoal
    ) {
      return;
    }

    onUpdatePlayerGoal(focusedPlayer.id, {
      hydrationGoalMls: customHydration,
      sleepQuality:
        customSleep as
          | 'Poor'
          | 'Fair'
          | 'Good'
          | 'Excellent',
      runDistanceGoalKm: customRunGoal,
    });

    setGoalFeedback(true);

    setTimeout(
      () => setGoalFeedback(false),
      2500
    );
  };

  // Practice Session Log attendance. Selecting a player records them as
  // PRESENT for the chosen date on the active team; selecting again undoes it.
  const handleToggleAttendance = (playerId: string) => {
    const existing = sessionAttendance.find(
      a =>
        a.playerId === playerId &&
        a.sessionDate === attendanceDate &&
        (activeTeamId ? matchKeys(a.teamId, activeTeamId) : true)
    );
    const newPresent = existing ? !existing.present : true;

    if (onSaveAttendance) {
      onSaveAttendance(
        existing?.scheduleId || '',
        playerId,
        newPresent,
        currentProfile.coachId || currentProfile.id,
        {
          teamId: activeTeamId,
          sessionDate: attendanceDate,
          sessionTime: new Date().toTimeString().slice(0, 8),
        }
      );
    }
  };

  const isPlayerPresentOnDate = (playerId: string) =>
    !!sessionAttendance.find(
      a =>
        a.playerId === playerId &&
        a.present &&
        a.sessionDate === attendanceDate &&
        (activeTeamId ? matchKeys(a.teamId, activeTeamId) : true)
    );

  // ---------------------------------------------------------
  // TEAM SWITCH HANDLER
  // ---------------------------------------------------------
  //
  // When switching teams:
  // 1. Change active team.
  // 2. Clear selected player from previous team.
  // 3. Clear expanded player panels from previous team.
  //
  // This guarantees the previous team's player state doesn't
  // carry over visually into the newly selected team.
  // ---------------------------------------------------------

  const handleTeamChange = (
    newTeamId: string
  ) => {
    setSelectedTeamId(newTeamId);

    // Clear all player-specific state from the previous team.
    // This prevents the previous team's player data from
    // remaining visually selected after a team switch.
    setSelectedPlayerId('');
    setExpandedPlayerIds({});

    // Notify parent if supplied
    if (onChangeActiveTeam) {
      onChangeActiveTeam(newTeamId);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header and Organizational Context */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 relative overflow-hidden">

        <div>
          <div className="flex items-center gap-2 flex-wrap">

            <h1 className="text-2xl font-sans font-bold text-slate-100">
              Team Performance Hub
            </h1>

            <span
  className={`hidden sm:inline-flex px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider ${
    currentProfile?.coachRole === 'assistant'
      ? 'bg-[#00BBFF]/15 text-[#00BBFF] border border-[#00BBFF]/30'
      : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
  }`}
>
  {currentProfile?.coachRole === 'assistant'
    ? 'Assistant Coach'
    : 'Head Coach'}
</span>
          </div>

          {myCoachedTeams.length > 0 && (
  <p className="text-xs font-mono text-slate-400 mt-1 uppercase tracking-wider">
    Viewing Roster for:
    <br className="sm:hidden" />{' '}
    <span className="text-emerald-400 font-bold font-sans">
      {(teams || []).find(
        t => t.id === activeTeamId
      )?.name ||
        activeTeamId ||
        'None'}
    </span>
  </p>
)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left Side: Schedule + Roster */}
        <div className="lg:col-span-4 min-w-0 space-y-6">

          {/* Team Schedule Widget: Next 5 Sessions */}
          <div className="w-full min-w-0 overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="min-w-0 text-xs font-bold text-slate-350 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="break-words">Team Schedule</span>
              </h2>

              <button
                type="button"
                onClick={() => setIsAddingSession(!isAddingSession)}
                className="shrink-0 text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1 hover:text-emerald-300 transition"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                {isAddingSession ? 'Cancel' : 'Add Event'}
              </button>
            </div>

            {isAddingSession && (
              <div className="w-full min-w-0 bg-slate-950/60 border border-slate-850 rounded-xl p-4 mb-4 space-y-3">
                <div className="grid grid-cols-1 gap-3">
                  <div className="min-w-0">
                    <label className="block text-[10px] font-mono text-emerald-400 uppercase mb-1.5">
                      Event Type
                    </label>
                    <select
  value={newSessionEventType}
  onChange={(e) => setNewSessionEventType(e.target.value as ScheduleEventType)}
  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-50 text-sm text-slate-700"
>
                      {SCHEDULE_EVENT_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <label className="block text-[10px] font-mono text-emerald-400 uppercase mb-1.5">
                      Event Date
                    </label>
                    <input
                      type="date"
                      value={newSessionDate}
                      onChange={(e) => setNewSessionDate(e.target.value)}
                      className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500/50 transition"
                    />
                  </div>

                  <div className="min-w-0">
                    <label className="block text-[10px] font-mono text-emerald-400 uppercase mb-1.5">
                      Event Time
                    </label>
                    <input
                      type="time"
                      value={newSessionTime}
                      onChange={(e) => setNewSessionTime(e.target.value)}
                      className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500/50 transition"
                    />
                  </div>

                  <div className="min-w-0">
                    <label className="block text-[10px] font-mono text-emerald-400 uppercase mb-1.5">
                      Location
                    </label>
                    <input
                      type="text"
                      value={newSessionLocation}
                      onChange={(e) => setNewSessionLocation(e.target.value)}
                      placeholder="e.g. Riverside Pitch"
                      className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!newSessionDate || !newSessionTime}
                  onClick={handleAddSession}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  Add to Schedule
                </button>
              </div>
            )}

            {nextFiveSessions.length === 0 ? (
              <div className="w-full min-w-0 bg-slate-950/40 border border-slate-850 rounded-xl p-6 text-center">
                <p className="text-slate-450 text-xs italic break-words">
                  No upcoming sessions have been scheduled yet.
                </p>
              </div>
            ) : (
              <div className="w-full min-w-0 grid grid-cols-1 gap-2">
                {nextFiveSessions.map(session => {
                  const sessionPresentCount = sessionAttendance
                    .filter(a => a.scheduleId === session.id && a.present)
                    .length;

                  if (editingSessionId === session.id) {
                    return (
                      <div
                        key={session.id}
                        className="w-full min-w-0 bg-slate-950 border border-emerald-500/40 rounded-xl p-4 space-y-3"
                      >
                        <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <SquarePen className="w-3.5 h-3.5 shrink-0" />
                          Edit Session
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <div className="min-w-0">
                            <label className="block text-[10px] font-mono text-emerald-400 uppercase mb-1.5">
                              Event Type
                            </label>
                            <select
                              value={editSessionEventType}
                              onChange={(e) => setEditSessionEventType(e.target.value as ScheduleEventType)}
                              className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500/50 transition"
                            >
                              {SCHEDULE_EVENT_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="min-w-0">
                            <label className="block text-[10px] font-mono text-emerald-400 uppercase mb-1.5">
                              Session Date
                            </label>
                            <input
                              type="date"
                              value={editSessionDate}
                              onChange={(e) => setEditSessionDate(e.target.value)}
                              className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500/50 transition"
                            />
                          </div>

                          <div className="min-w-0">
                            <label className="block text-[10px] font-mono text-emerald-400 uppercase mb-1.5">
                              Session Time
                            </label>
                            <input
                              type="time"
                              value={editSessionTime}
                              onChange={(e) => setEditSessionTime(e.target.value)}
                              className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-emerald-500/50 transition"
                            />
                          </div>

                          <div className="min-w-0">
                            <label className="block text-[10px] font-mono text-emerald-400 uppercase mb-1.5">
                              Location
                            </label>
                            <input
                              type="text"
                              value={editSessionLocation}
                              onChange={(e) => setEditSessionLocation(e.target.value)}
                              placeholder="e.g. Riverside Pitch"
                              className="w-full min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!editSessionDate || !editSessionTime || !onUpdateSchedule}
                            onClick={saveEditedSession}
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Save Changes
                          </button>

                          <button
                            type="button"
                            onClick={cancelEditSession}
                            className="bg-emerald-500 hover:bg-slate-800 text-slate-300 font-bold py-2.5 px-4 rounded-xl transition text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const isExpandedRow = expandedSessionId === session.id;
                  const sessionStart = new Date(`${session.sessionDate}T${session.sessionTime}`);

                  return (
                    <div
                      key={session.id}
                      className={`w-full min-w-0 bg-slate-950/60 border rounded-xl transition overflow-hidden ${
                        isExpandedRow
                          ? 'border-emerald-500/40 bg-slate-950'
                          : 'border-slate-850 hover:border-emerald-500/30'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setPendingDeleteSessionId(null);
                          setExpandedSessionId(isExpandedRow ? null : session.id);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-slate-900/60"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                          <span className="text-[11px] font-bold text-slate-100 whitespace-nowrap">
                            {sessionStart.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                            {sessionStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {session.location && (
                            <span className="text-[10px] font-mono text-slate-500 truncate hidden sm:inline">
                              {session.location}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                            {SCHEDULE_EVENT_OPTIONS.find(option => option.value === getScheduleEventType(session))?.label || 'Practice'}
                          </span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 shrink-0 ${
                              isExpandedRow ? 'rotate-180 text-emerald-400' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {isExpandedRow && (
                        <div className="px-3 pb-3 pt-2 border-t border-slate-850 space-y-2.5">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              {formatSessionDisplay(session.sessionDate, session.sessionTime)}
                            </p>

                            {session.location && (
                              <p className="text-[10px] font-mono text-emerald-300/90 leading-snug break-words flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {session.location}
                              </p>
                            )}

                            <p className="text-[10px] font-mono text-slate-450 leading-snug break-words">
                              {sessionPresentCount > 0
                                ? `${sessionPresentCount} marked present`
                                : 'No attendance recorded yet'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => setActiveSessionId(session.id)}
                              className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 font-bold py-2 px-3 rounded-lg text-[10px] font-mono uppercase tracking-wider transition"
                            >
                              Take Attendance
                            </button>

                            {onUpdateSchedule && (
                              <button
                                type="button"
                                onClick={() => startEditSession(session)}
                                className="inline-icon-btn text-slate-400 hover:text-emerald-400 p-2 border border-slate-800 rounded-lg transition shrink-0"
                                title="Edit session"
                              >
                                <SquarePen className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {onDeleteSchedule && (
                              pendingDeleteSessionId === session.id ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[9px] font-mono text-rose-300 uppercase tracking-wider whitespace-nowrap">
                                    Delete?
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteSchedule(session.id);
                                      setPendingDeleteSessionId(null);
                                    }}
                                    className="bg-rose-500 hover:bg-rose-600 text-white font-bold py-1.5 px-2.5 rounded-lg text-[9px] font-mono uppercase tracking-wider transition"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteSessionId(null)}
                                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1.5 px-2.5 rounded-lg text-[9px] font-mono uppercase tracking-wider transition"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteSessionId(session.id)}
                                className="inline-icon-btn inline-delete-btn text-slate-400 hover:text-rose-400 p-2 border border-slate-800 rounded-lg transition shrink-0"
                                title="Delete session"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        {/* Left Side: Roster Listing */}
        <div className="w-full min-w-0 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl transition-all duration-300">

          <button
            onClick={() =>
              setIsRosterExpanded(
                !isRosterExpanded
              )
            }
            className="w-full flex items-center justify-between focus:outline-none select-none group focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-lg p-0.5 text-left"
          >
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400 shrink-0" />

              <span>
                Team Roster ({teamMatchesPlayers.length})
              </span>
            </h2>

            <div className="flex items-center gap-1.5">

              <span className="text-[9px] font-mono text-slate-450 uppercase transition group-hover:text-slate-300 hidden sm:inline-block">
                {isRosterExpanded
                  ? 'Collapse'
                  : 'Expand'}
              </span>

              <ChevronDown
                className={`w-4 h-4 text-slate-450 transition-all duration-300 ease-out shrink-0 group-hover:text-slate-300 ${
                  isRosterExpanded
                    ? 'transform rotate-180'
                    : ''
                }`}
              />
            </div>
          </button>

          {isRosterExpanded && (
            <div className="pt-4 border-t border-slate-800/80 mt-3 animate-fadeIn space-y-4">

              <div className="text-[10px] font-mono text-slate-400 uppercase block tracking-wider">
                Click to Select Player
              </div>

              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">

                {teamMatchesPlayers.length === 0 ? (

                  <div className="p-6 text-center text-slate-500 text-xs font-mono">
                    No players linked to this specific level.
                  </div>

                ) : (

                  teamMatchesPlayers.map(player => {

                    const isActive =
                      focusedPlayer?.id ===
                      player.id;

                    const speedStats =
                      getPlayerRunSummaries(
                        player.id
                      );

                    return (
                      <div
                        key={player.id}
                        onClick={() => {
                          setSelectedPlayerId(
                            player.id
                          );

                          setCustomHydration(
                            latestMetric?.hydrationGoalMls ||
                              3000
                          );
                        }}
                        className={`p-3.5 rounded-xl border transition cursor-pointer text-left relative overflow-hidden flex justify-between items-center ${
                          isActive
                            ? 'bg-emerald-500/10 border-emerald-500/40'
                            : 'bg-slate-950/60 hover:bg-slate-950 border-slate-850'
                        }`}
                      >

                        <div className="space-y-1">

                          <div className="flex items-center gap-2">

                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 shrink-0" />

                            <span className="text-sm font-sans font-semibold text-slate-100">
                              {player.name}
                            </span>
                          </div>

                          <div className="text-[11px] font-mono text-slate-450">
                            {player.email}
                          </div>
                        </div>

                        <div className="text-right">

                          <div className="text-xs font-mono font-bold text-slate-200">
                            {speedStats.distance.toFixed(
                              1
                            )}{' '}
                            km
                          </div>

                          <div className="text-[10px] font-mono text-emerald-400">
                            {speedStats.count}{' '}
                            runs logged
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        </div>

        {/* Right Side: Player Metric Insights & Assignment Control */}
        {teamMatchesPlayers.length > 0 ? (

          <div className="lg:col-span-8 min-w-0 space-y-6">

            {/* Player's Performance Metrics Cards */}
            {false && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl transition-all duration-300">

              <button
                type="button"
                onClick={() =>
                  setIsPerformanceOverviewExpanded(
                    !isPerformanceOverviewExpanded
                  )
                }
                className="w-full flex items-center justify-between focus:outline-none select-none group focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-lg p-0.5 text-left"
              >

                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-400 shrink-0" />

                  <span className="text-sm font-semibold text-slate-200">
                    Performance Overview
                  </span>
                </div>

                <div className="flex items-center gap-1.5">

                  <span className="text-[9px] font-mono text-slate-400 uppercase transition group-hover:text-slate-300 hidden sm:inline-block">
                    {isPerformanceOverviewExpanded
                      ? 'Collapse'
                      : 'Expand'}
                  </span>

                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-all duration-300 ease-out shrink-0 group-hover:text-slate-300 ${
                      isPerformanceOverviewExpanded
                        ? 'transform rotate-180'
                        : ''
                    }`}
                  />
                </div>
              </button>

              {isPerformanceOverviewExpanded && (
                <div className="space-y-4 pt-4 border-t border-slate-800/80 mt-3 animate-fadeIn">

                  {teamMatchesPlayers.map(player => (

                    <PlayerPerformanceAccordion
                      key={player.id}
                      player={player}
                      isExpanded={
                        !!expandedPlayerIds[
                          player.id
                        ]
                      }
                      onToggle={() => {
                        setExpandedPlayerIds(
                          prev => ({
                            ...prev,
                            [player.id]:
                              !prev[player.id]
                          })
                        );
                      }}
                      runLogs={runLogs}
                      playerMetrics={
                        metrics[player.id] || []
                      }
                      onUpdatePlayerGoal={
                        onUpdatePlayerGoal
                      }
                      playerHydrationLogs={hydrationLogs.filter(
                        l =>
                          l.playerId ===
                          player.id
                      )}
                      sessionAttendance={sessionAttendance}
                      teamSchedules={teamSchedules}
                    />
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Next Session */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden transition-all duration-300">
              <button
                type="button"
                onClick={() => setIsNextSessionExpanded(!isNextSessionExpanded)}
                className="w-full flex items-center justify-between p-5 hover:bg-slate-850/40 transition text-left focus:outline-none select-none group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-[#00bbff]/20 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-[#00bbff]" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Next Session</h2>
                    <p className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mt-0.5 truncate">
                      {nextSession ? formatSessionDisplay(nextSession.sessionDate, nextSession.sessionTime) : 'No upcoming session scheduled'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {nextSession && (
                    <span className="hidden sm:inline-flex text-[9px] font-mono text-slate-450 uppercase tracking-wider bg-slate-950 border border-slate-850 px-2 py-0.5 rounded-full">
                      {nextSessionCoachDrills.length} drill{nextSessionCoachDrills.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {isNextSessionExpanded ? <ChevronUp className="w-4 h-4 text-[#00bbff]" /> : <ChevronDown className="w-4 h-4 text-[#00bbff]" />}
                </div>
              </button>

              {isNextSessionExpanded && (
                <div className="px-5 pb-5 pt-1 space-y-4 border-t border-slate-800/80">
                  {nextSession ? (
                    <>
                      <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-[#00bbff]/20 flex items-center justify-center shrink-0">
                            <Clock className="w-4 h-4 text-[#00bbff]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-slate-100 font-semibold">{formatSessionDisplay(nextSession.sessionDate, nextSession.sessionTime)}</p>
                            {nextSession.location && (
                              <p className="text-[10px] font-mono text-emerald-300/90 mt-1 flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{nextSession.location}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="self-start sm:self-auto text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                          {SCHEDULE_EVENT_OPTIONS.find(option => option.value === getScheduleEventType(nextSession))?.label || 'Practice'}
                        </span>
                      </div>

                      <div className="border-t border-slate-800 pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <FileText className="w-3.5 h-3.5 text-[#00bbff]" />
                          <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">Session Drill Images</span>
                          <span className="text-[9px] font-mono text-slate-500">({nextSessionCoachDrills.length})</span>
                        </div>

                        {nextSessionCoachDrills.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {nextSessionCoachDrills.map(drill => (
                              <div key={drill.id} className="relative overflow-hidden rounded-xl bg-slate-950 border border-slate-800">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewZoomed(false);
                                    setSelectedNextSessionDrillUrl(drill.url);
                                  }}
                                  className="w-full aspect-video bg-slate-900 overflow-hidden cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-[#00bbff]/50"
                                  title="View full drill image"
                                >
                                  <img
                                    src={drill.url}
                                    alt="Session drill"
                                    style={drillThumbImgStyle}
                                    onError={e => { e.currentTarget.style.display = 'none'; }}
                                  />
                                </button>
                                <div className="px-2.5 py-2 border-t border-slate-800">
                                  <p className="text-[8px] font-mono text-slate-500 uppercase tracking-wider truncate">Drill Image</p>
                                  <p className="text-[9px] text-slate-400 truncate mt-0.5" title={drill.url}>{drill.url}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-3 py-5 text-center">
                            <FileText className="w-5 h-5 text-slate-700 mx-auto mb-2" />
                            <p className="text-[9px] font-mono text-slate-600 uppercase">No drill images attached</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="pt-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-6 text-center">
                      <Calendar className="w-5 h-5 text-slate-700 mx-auto mb-2" />
                      <p className="text-[9px] font-mono text-slate-500 uppercase">No upcoming sessions have been scheduled for this team.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Practice Session Log */}
            {teamMatchesPlayers.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setIsPracticeLogOpen(open => !open)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setIsPracticeLogOpen(open => !open); }}
                  className="flex justify-between items-center border-b border-slate-800/80 pb-3 cursor-pointer select-none outline-none transition-colors hover:bg-slate-850/20 rounded-lg -mx-2 px-2"
                >

                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                      Session Log
                    </h2>
                    <p className="text-[10px] font-mono text-slate-450 mt-1">
                      {teamMatchesPlayers.filter(p => isPlayerPresentOnDate(p.id)).length} of {teamMatchesPlayers.length} marked present
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="date"
                      value={attendanceDate}
                      onChange={e =>
                        setAttendanceDate(
                          e.target.value
                        )
                      }
                      onClick={e => e.stopPropagation()}
                      className="bg-slate-950 text-xs text-slate-300 border border-slate-800 rounded-lg px-2.5 py-1 font-mono outline-none"
                    />
                    <div
                      className={`p-1.5 rounded-lg bg-slate-950 border border-slate-850 text-slate-400 transition-transform duration-200 ${
                        isPracticeLogOpen ? 'rotate-180' : ''
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {isPracticeLogOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">

                  {teamMatchesPlayers.map(
                    player => {
                      const isPresent = isPlayerPresentOnDate(player.id);

                      return (
                        <div
                          key={player.id}
                          className={`flex justify-between items-center text-xs p-3.5 rounded-xl border transition ${
                            isPresent
                              ? 'bg-emerald-500/5 border-emerald-500/30'
                              : 'bg-slate-950/60 border-slate-850'
                          }`}
                        >

                          <span className={`font-medium ${isPresent ? 'text-emerald-300' : 'text-slate-300'}`}>
                            {player.name}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleToggleAttendance(
                                player.id
                              )
                            }
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition font-semibold border flex items-center gap-1.5 ${
                              isPresent
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200'
                            }`}
                          >
                            {isPresent ? (
                              <>
                                <Check className="w-3 h-3 shrink-0" />
                                PRESENT
                              </>
                            ) : (
                              'MARK PRESENT'
                            )}
                          </button>
                        </div>
                      );
                    }
                  )}
                  </div>
                )}
              </div>
            )}

            {/* Assignment Deployment Dispatcher */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">

              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                Dispatch Calendar Assignment to Team
              </h3>

              <form
                onSubmit={handlePostAssignment}
                className="space-y-4"
              >

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  <div>

                    <label className="block text-[10px] font-mono text-slate-400 mb-1.5 uppercase">
                      Assignment Type
                    </label>

                    <div className="flex gap-2">

                      <button
                        type="button"
                        onClick={() =>
                          setAssignType('run')
                        }
                        className={`assignment-type-btn flex-1 py-2 text-xs font-semibold rounded border transition ${
                          assignType === 'run'
                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-950 border-slate-850 text-slate-450 hover:bg-slate-900'
                        }`}
                      >
                        GPS Running dist
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setAssignType(
                            'module'
                          )
                        }
                        className={`assignment-type-btn flex-1 py-2 text-xs font-semibold rounded border transition ${
                          assignType === 'module'
                            ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-950 border-slate-850 text-slate-450 hover:bg-slate-900'
                        }`}
                      >
                        Classroom Academy
                      </button>
                    </div>
                  </div>

                  <div>

                    <label className="block text-[10px] font-mono text-slate-400 mb-1.5 uppercase">
                      Due Date
                    </label>

                    <input
                      type="date"
                      required
                      value={assignDueDate}
                      onChange={e =>
                        setAssignDueDate(
                          e.target.value
                        )
                      }
                      className="w-full bg-slate-950 border border-slate-850 text-slate-350 text-xs rounded-lg p-2.5 font-mono pointer-events-auto"
                    />
                  </div>
                </div>

                {assignType === 'run' ? (

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    <div>

                      <label className="block text-[10px] font-mono text-slate-400 mb-1.5">
                        ASSIGNMENT TITLE
                      </label>

                      <input
                        type="text"
                        placeholder="e.g. Mandatory 5K Aerobic Endurance"
                        value={assignTitle}
                        onChange={e =>
                          setAssignTitle(
                            e.target.value
                          )
                        }
                        className="w-full bg-slate-950 border border-slate-850 text-xs text-slate-300 rounded-lg p-2.5"
                      />
                    </div>

                    <div>

                      <label className="block text-[10px] font-mono text-slate-400 mb-1.5">
                        REQUIRED RUN DISTANCE (KM)
                      </label>

                      <input
                        type="number"
                        step={0.5}
                        min={1}
                        max={42}
                        value={assignDistance}
                        onChange={e =>
                          setAssignDistance(
                            parseFloat(
                              e.target.value
                            ) || 5.0
                          )
                        }
                        className="w-full bg-slate-950 border border-slate-850 text-xs text-slate-300 rounded-lg p-2.5 font-mono"
                      />
                    </div>
                  </div>

                ) : (

                  <div>

                    <label className="block text-[10px] font-mono text-slate-400 mb-1.5">
                      SELECT ACADEMY MODULE TO ASSIGN
                    </label>

                    <select
                      value={assignModuleId}
                      required
                      onChange={e =>
                        setAssignModuleId(
                          e.target.value
                        )
                      }
                      className="w-full bg-slate-950 border border-slate-850 text-xs text-slate-300 rounded-lg p-2.5 font-mono"
                    >

                      <option value="">
                        -- Choose Module --
                      </option>

                      {modules.map(module => (
                        <option
                          key={module.id}
                          value={module.id}
                        >
                          [{module.category}] {module.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {successMsg && (
                  <div className="text-xs font-mono text-emerald-400 text-center font-bold bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                    Assignment queued and synchronized automatically with players training schedules!
                  </div>
                )}

                <button
                  type="submit"
                  id="btn-assign-workout"
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold p-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Dispatch Required Training Assignment
                </button>
              </form>
            </div>
          </div>

        ) : (

          <div className="lg:col-span-8 min-w-0 bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 flex flex-col items-center justify-center min-h-[300px]">

            <p className="text-sm font-medium">
              {myCoachedTeams.length >= 2
                ? `No players are assigned to ${
                    (teams || []).find(
                      t =>
                        t.id ===
                        activeTeamId
                    )?.name ||
                    'this team'
                  }.`
                : 'Select a player from the roster to inspect individual metrics and dispatch localized assignments.'}
            </p>
          </div>
        )}
      </div>

      {/* Session Attendance Popup Modal */}
      {activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            onClick={() => setActiveSessionId(null)}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
          />

          {/* Modal Box */}
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl z-10 max-h-[85vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-850/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm tracking-wide">
                    Session Attendance
                  </h3>
                  <p className="text-[10px] font-mono text-slate-450 uppercase">
                    {formatSessionDisplay(activeSession.sessionDate, activeSession.sessionTime)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                className="text-slate-400 hover:text-slate-250 p-2 hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Session drills */}
            {(() => {
              const sessionDrills = coachDrills.filter(
                drill =>
                  matchKeys(drill.teamId, activeTeamId) &&
                  matchKeys(drill.scheduleId, activeSession.id)
              );
              if (sessionDrills.length === 0) return null;
              return (
                <div className="px-5 pt-4 border-b border-slate-850/60 shrink-0">
                  <div className="flex items-center gap-2 mb-2.5">
                    <FileText className="w-3.5 h-3.5 text-[#00bbff] shrink-0" />
                    <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                      Session Drills ({sessionDrills.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pb-4">
                    {sessionDrills.map(drill => (
                      <button
                        key={drill.id}
                        type="button"
                        onClick={() => {
                          setPreviewZoomed(false);
                          setSelectedNextSessionDrillUrl(drill.url);
                        }}
                        className="relative aspect-video overflow-hidden rounded-lg bg-slate-950 border border-slate-800 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00bbff]/60"
                        title="Tap to view full drill image"
                      >
                        <img
                          src={drill.url}
                          alt="Session drill"
                          style={drillThumbImgStyle}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Player attendance list */}
            <div className="p-5 space-y-2.5 overflow-y-auto">
              {teamMatchesPlayers.length === 0 ? (
                <p className="text-slate-450 text-xs italic text-center py-6">
                  No players are linked to this team roster yet.
                </p>
              ) : (
                teamMatchesPlayers.map(player => {
                  const isPresent = !!sessionAttendance.find(
                    a =>
                      a.scheduleId === activeSession.id &&
                      a.playerId === player.id &&
                      a.present
                  );
                  return (
                    <div
                      key={player.id}
                      className={`flex justify-between items-center text-xs p-3.5 rounded-xl border transition ${
                        isPresent
                          ? 'bg-emerald-500/5 border-emerald-500/30'
                          : 'bg-slate-950/60 border-slate-850'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isPresent ? 'bg-emerald-500/80' : 'bg-slate-600'}`} />
                        <span className={`font-semibold ${isPresent ? 'text-emerald-300' : 'text-slate-200'}`}>
                          {player.name}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleToggleSessionAttendance(
                            activeSession.id,
                            player.id,
                            {
                              teamId: activeSession.teamId,
                              sessionDate: activeSession.sessionDate,
                              sessionTime: activeSession.sessionTime,
                            }
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition font-semibold border flex items-center gap-1.5 ${
                          isPresent
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200'
                        }`}
                      >
                        {isPresent ? (
                          <>
                            <Check className="w-3 h-3 shrink-0" />
                            PRESENT
                          </>
                        ) : (
                          'MARK PRESENT'
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-850/60 shrink-0">
              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                className="w-full bg-slate-950 hover:bg-slate-850 text-slate-300 font-bold py-2.5 px-5 rounded-xl text-xs border border-slate-800 transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Next Session Drill Image Preview (portaled to <body> so it sits above every widget) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {selectedNextSessionDrillUrl && (
              <motion.div
                key="drill-preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                role="dialog"
                aria-modal="true"
                aria-label="Session drill image preview"
                className="fixed inset-0 overflow-auto overscroll-contain bg-black/85 backdrop-blur-sm"
                style={{ zIndex: 2147483647, WebkitOverflowScrolling: 'touch' }}
                onClick={() => setSelectedNextSessionDrillUrl(null)}
              >
                {/* Exit button: always reachable at top-right */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNextSessionDrillUrl(null);
                  }}
                  className="fixed top-3 right-3 sm:top-5 sm:right-5 z-20 w-9 h-9 rounded-lg bg-slate-950/90 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 flex items-center justify-center transition cursor-pointer"
                  title="Close (Esc)"
                  aria-label="Close image preview"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Scrollable content area; clicking empty space closes */}
                <div className="min-h-full min-w-full w-max flex p-3 sm:p-6">
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ type: 'spring', duration: 0.35 }}
                    onClick={(e) => e.stopPropagation()}
                    className="m-auto bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl"
                  >
                    <img
                      src={selectedNextSessionDrillUrl}
                      alt="Session drill full view"
                      onClick={() => setPreviewZoomed((z) => !z)}
                      title={previewZoomed ? 'Click to fit to screen' : 'Click to view full size'}
                      className={
                        previewZoomed
                          ? 'block max-w-none max-h-none w-auto h-auto rounded-xl cursor-zoom-out'
                          : 'block max-w-[calc(100vw-2.5rem)] sm:max-w-[calc(100vw-4rem)] max-h-[calc(100vh-4rem)] w-auto h-auto object-contain rounded-xl cursor-zoom-in'
                      }
                    />
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}