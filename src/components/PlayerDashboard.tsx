/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Play, Flame, Droplet, Coffee, Star, SquareCheck as CheckSquare, Calendar, ChevronRight, ChevronDown, Moon, Utensils, Award, BookOpen, CircleAlert as AlertCircle, Eye, Compass, Clock3, MapPin, Users, FileText, Layers, Heart, Clock } from 'lucide-react';
import { UserProfile, RunLog, DailyMetrics, Assignment, ClassroomSession, ModuleCompletion, TeamFormation, HydrationLog, TeamSchedule } from '../types';
import GPSRunTracker from './GPSRunTracker';
import { sanitizeUUID } from '../supabase';

// ---------- Date helpers (local time, no UTC shifting) ----------

// Format a Date as YYYY-MM-DD using local time
const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Parse YYYY-MM-DD as a local date (new Date('YYYY-MM-DD') is parsed as UTC)
const parseLocalDate = (dateStr: string) => {
  const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Monday-to-Sunday week that rolls over at Monday 00:01.
// Shifting "now" back one minute keeps Monday 00:00 in the previous week.
const getCalendarWeek = (now: Date) => {
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

// ---------- Shared "Coming Soon" overlay ----------
function ComingSoonOverlay({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 z-50 rounded-2xl flex items-center justify-center cursor-not-allowed"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.68)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
      aria-label={`${label} coming soon`}
      role="status"
    >
      {/* Static modern Coming Soon button */}
      <div
        className="relative pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* Gradient glow behind button */}
        <div
          className="absolute -inset-[3px] rounded-full opacity-80 blur-md"
          style={{
            background:
              'linear-gradient(90deg, #38bdf8, #6366f1, #a855f7, #38bdf8)',
          }}
        />

        {/* Gradient border */}
        <div
          className="relative rounded-full p-[2px] shadow-2xl"
          style={{
            background:
              'linear-gradient(90deg, #38bdf8, #6366f1, #a855f7, #38bdf8)',
          }}
        >
          {/* Inner button */}
          <div
            className="relative min-w-[190px] sm:min-w-[215px] px-6 py-3.5 rounded-full flex items-center justify-center gap-3"
            style={{
              background:
                'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.96))',
            }}
          >
            {/* Clock icon */}
            <div className="flex items-center justify-center w-7 h-7 rounded-full border border-sky-300/50 bg-sky-400/10 shadow-[0_0_14px_rgba(56,189,248,0.25)]">
              <Clock3 className="w-4 h-4 text-sky-300" />
            </div>

            {/* Label */}
            <span className="text-xs sm:text-sm font-bold uppercase tracking-[0.18em] text-white whitespace-nowrap">
              Coming Soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PlayerDashboardProps {
  playerProfile: UserProfile;
  runLogs: RunLog[];
  metrics: DailyMetrics; // player's current metrics
  assignments: Assignment[];
  modules: ClassroomSession[];
  completions: ModuleCompletion[];
  onSaveRun: (newRun: Omit<RunLog, 'id' | 'playerId' | 'date'>) => void;
  onUpdateDailyMetrics: (metrics: Partial<DailyMetrics>) => void;
  onSelectTab: (tab: 'classroom' | 'formation', formationId?: string, classroomId?: string) => void;
  allPlayers?: UserProfile[];
  allRunLogs?: RunLog[];
  allMetrics?: Record<string, DailyMetrics[]>;
  allCompletions?: ModuleCompletion[];
  formations?: TeamFormation[];
  hydrationLogs?: HydrationLog[];
  onLogHydration?: (amountMl: number) => void;
  teamSchedules?: TeamSchedule[];
}

export default function PlayerDashboard({
  playerProfile,
  runLogs,
  metrics,
  assignments,
  modules,
  completions,
  onSaveRun,
  onUpdateDailyMetrics,
  onSelectTab,
  allPlayers = [],
  allRunLogs = [],
  allMetrics = {},
  allCompletions = [],
  formations = [],
  hydrationLogs = [],
  onLogHydration,
  teamSchedules = [],
}: PlayerDashboardProps) {
  const matchKeys = (k1: string | null | undefined, k2: string | null | undefined) => {
    if (!k1 || !k2) return false;
    const clean1 = k1.trim().toLowerCase();
    const clean2 = k2.trim().toLowerCase();
    if (clean1 === clean2) return true;
    try {
      return sanitizeUUID(clean1) === sanitizeUUID(clean2);
    } catch (_) {}
    return false;
  };

  // ---------- Current date / week (rolls over at Monday 00:01) ----------
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = toLocalDateStr(now);
  const calendarWeekDays = useMemo(() => getCalendarWeek(now), [now]);

  // Nutritional logging state helper
  const [mealCalories, setMealCalories] = useState(600);
  const [mealProtein, setMealProtein] = useState(30);
  const [mealCarbs, setMealCarbs] = useState(70);
  const [mealFat, setMealFat] = useState(15);
  const [showMealLogger, setShowMealLogger] = useState(false);
  const [hydrationScoop, setHydrationScoop] = useState<250 | 500 | 750>(250);

  // Active run log assignment target selectors
  const [trackAssignmentId, setTrackAssignmentId] = useState<string>('');
  const [trackAssignedDistance, setTrackAssignedDistance] = useState<number | undefined>(undefined);
  const [isTacticalOpen, setIsTacticalOpen] = useState(true);
  const [isLineupAccordionExpanded, setIsLineupAccordionExpanded] = useState<string | null>(null);

  // Stats gathers
  const totalKmRunThisWeek = runLogs.reduce((sum, r) => sum + r.distanceKm, 0);
  const weeklyRunningGoal = metrics.runDistanceGoalKm || 15.0; // Dynamic goal updated by Coach, default 15 KM

  const hydrationPct = Math.min(100, Math.round((metrics.hydrationMls / metrics.hydrationGoalMls) * 100));
  const caloriePct = Math.min(100, Math.round((metrics.nutritionCalories / 2800) * 100)); // Daily average cap target 2800 kcal

  // Educational stats linked to assigned classroom education sessions
  const assignedModules = assignments.filter(a => a.type === 'module');
  const assignedModulesCount = assignedModules.length;
  const completedAssignedModulesCount = assignedModules.filter(a => {
    return a.completedByPlayerIds.includes(playerProfile.id) || completions.some(comp => comp.moduleId === a.moduleId);
  }).length;

  // Formations for this player's own team only. Sharing a coach with another
  // squad must not surface that squad's lineup.
  const teamFormations = useMemo(() => {
    if (!formations) return [];
    return formations.filter(f => {
      if (playerProfile.teamId && matchKeys(f.teamId, playerProfile.teamId)) return true;
      return false;
    });
  }, [formations, playerProfile.teamId]);

  const lastFormation = useMemo(() => {
    if (teamFormations.length === 0) return null;
    return [...teamFormations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }, [teamFormations]);

  const myAssignment = useMemo(() => {
    if (!lastFormation) return null;
    return lastFormation.assignments.find(as => matchKeys(as.playerId, playerProfile.id));
  }, [lastFormation, playerProfile.id]);

  // A substitute holds a position but is not in the starting formation
  const myBenchAssignment = useMemo(() => {
    if (!lastFormation) return null;
    return (lastFormation.benchAssignments || []).find(b => matchKeys(b.playerId, playerProfile.id)) || null;
  }, [lastFormation, playerProfile.id]);

  const formationAssignmentsWithNames = useMemo(() => {
    if (!lastFormation) return [];
    return lastFormation.assignments.map(as => {
      const pObj = allPlayers.find(p => matchKeys(p.id, as.playerId));
      return {
        ...as,
        playerName: pObj ? pObj.name : 'Unassigned Position',
        isMe: matchKeys(as.playerId, playerProfile.id)
      };
    }).sort((a,b) => (a.playerId ? 0 : 1) - (b.playerId ? 0 : 1)); // Show active assignments first
  }, [lastFormation, allPlayers, playerProfile.id]);

  const handleIncrementHydration = () => {
    if (onLogHydration) {
      onLogHydration(hydrationScoop);
    } else {
      onUpdateDailyMetrics({ hydrationMls: metrics.hydrationMls + hydrationScoop });
    }
  };

  // Today's hydration (live date)
  const today = todayStr;
  const todayLog = hydrationLogs.find(l => l.logDate === today);
  const todayHydrationMl = todayLog?.hydrationMl ?? metrics.hydrationMls;
  const dailyGoalMl = metrics.hydrationGoalMls || 3000;
  const dailyHydrationPct = Math.min(100, Math.round((todayHydrationMl / dailyGoalMl) * 100));

  // Weekly hydration total: Monday through today, using the same week as the calendar
  const weeklyGoalMl = 21000; // 3L/day x 7
  const weeklyHydrationMl = useMemo(() => {
    const weekStart = calendarWeekDays[0].dateStr;
    return hydrationLogs
      .filter(l => l.logDate >= weekStart && l.logDate <= today)
      .reduce((sum, l) => sum + l.hydrationMl, 0);
  }, [hydrationLogs, calendarWeekDays, today]);

  const handleLogMealSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateDailyMetrics({
      nutritionCalories: metrics.nutritionCalories + mealCalories,
      nutritionProteinG: metrics.nutritionProteinG + mealProtein,
      nutritionCarbsG: metrics.nutritionCarbsG + mealCarbs,
      nutritionFatG: metrics.nutritionFatG + mealFat
    });
    setShowMealLogger(false);
  };

  const startTrackingAssignment = (assign: Assignment) => {
    setTrackAssignmentId(assign.id);
    setTrackAssignedDistance(assign.runDistanceKm);

    const trackerEl = document.getElementById('gps-run-tracker-widget-section');
    if (trackerEl) {
      trackerEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // "Launch Tracker" on the leaderboard week schedule lands here: activate the
  // assignment's run target and scroll to the tracker once the dashboard mounts.
  useEffect(() => {
    const pendingId = sessionStorage.getItem('start_run_assignment_id');
    if (!pendingId) return;
    sessionStorage.removeItem('start_run_assignment_id');
    sessionStorage.removeItem('scroll_to_gps_run_tracker');
    const target = assignments.find(a => a.id === pendingId);
    if (target) {
      startTrackingAssignment(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT COLUMN: Main Widgets, Logs, Nutrition Goals */}
        <div className="lg:col-span-8 space-y-6">

          {/* Main welcome & Coach feedback snippet */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-emerald-400 font-mono text-xs font-bold px-2.5 py-1 bg-emerald-500/10 rounded-full">
                👑 ATHLETE REPORT READY
              </span>
              <h2 className="text-xl font-sans font-bold text-slate-100 mt-2.5">
                Welcome, {playerProfile.name}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Your profile is synced with Coach <b className="text-slate-300">{playerProfile.manualCoachName || 'Martyn ODonnell'}</b>.
              </p>
            </div>
          </div>

          {/* Mobile Team Schedule Widget - second widget on mobile */}
          <div className="md:hidden">
            <MobileTeamScheduleWidget schedules={teamSchedules} teamId={playerProfile.teamId} matchKeys={matchKeys} />
          </div>

          {/* Parent Gameday Encouraging Note if Present */}
          {(() => {
            const parentNoteVal = localStorage.getItem(`parent_gameday_note_${playerProfile.id}`);
            if (!parentNoteVal) return null;
            return (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-indigo-950/40 border border-indigo-500/20 rounded-2xl p-4 sm:p-5 flex items-start gap-4 shadow-md relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 shrink-0">
                  <Heart className="w-5 h-5 text-indigo-450 fill-indigo-400/20" />
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-indigo-400 uppercase tracking-wider font-bold">
                    Message from Parent (Support Bulletin)
                  </div>
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed italic font-medium">
                    "{parentNoteVal}"
                  </p>
                  <div className="text-[9px] font-mono text-slate-500">
                    Received via Parent Registry
                  </div>
                </div>
              </motion.div>
            );
          })()}

          {/* Team Lineup & Player Position - mobile accordion */}
          <div className="md:hidden bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                <Compass className="w-5 h-5 text-[#00bbff] shrink-0" />
                <h3 className="text-sm font-bold text-slate-100 tracking-tight font-sans truncate">
                  Team Lineup & Player Position
                </h3>
              </div>
              <span className="bg-[#00bbff]/10 text-[#00bbff] border border-[#00bbff]/20 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider font-bold shrink-0">
                Gameday Prep
              </span>
            </div>

            {!lastFormation ? (
              <div className="mt-4 p-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-center space-y-1">
                <p className="text-xs text-slate-350 font-medium">No published lineups yet</p>
                <p className="text-[10px] text-slate-500 font-mono">
                  Your coach has not set up game day layouts for your team yet.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {/* 1. Active Scheme Configuration */}
                <div className="bg-slate-950 rounded-xl border border-slate-850 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsLineupAccordionExpanded(prev => prev === 'scheme' ? null : 'scheme')}
                    aria-expanded={isLineupAccordionExpanded === 'scheme'}
                    className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-900/60 transition"
                  >
                    <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider font-bold">
                      1. Team Formation
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isLineupAccordionExpanded === 'scheme' ? 'rotate-180 text-[#00bbff]' : ''}`} />
                  </button>

                  {isLineupAccordionExpanded === 'scheme' && (
                    <div className="px-3.5 pb-3.5 pt-0 border-t border-slate-800">
                      <div className="pt-3 space-y-1 text-center">
                        <div className="text-xs font-bold text-slate-200 truncate">{lastFormation.name}</div>
                        <div className="text-[10.5px] font-mono text-[#00bbff]">{lastFormation.system} · {lastFormation.lineupName}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Your Field Assignment */}
                <div className="bg-slate-950 rounded-xl border border-slate-850 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsLineupAccordionExpanded(prev => prev === 'assignment' ? null : 'assignment')}
                    aria-expanded={isLineupAccordionExpanded === 'assignment'}
                    className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-900/60 transition"
                  >
                    <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider font-bold">
                      2. Your Position
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isLineupAccordionExpanded === 'assignment' ? 'rotate-180 text-[#00bbff]' : ''}`} />
                  </button>

                  {isLineupAccordionExpanded === 'assignment' && (
                    <div className="px-3.5 pb-3.5 pt-0 border-t border-slate-800">
                      <div className="pt-3 text-center">
                        {myAssignment ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-bounce" />
                            {myAssignment.positionId} ({myAssignment.positionName})
                          </span>
                        ) : myBenchAssignment ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                              <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                              {myBenchAssignment.positionName}
                            </span>
                            <span className="block text-[10px] font-mono text-slate-450 uppercase tracking-wider">
                              Substitute · Not in starting formation
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Reserves / Squad Pool</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Team Formation */}
                <div className="bg-slate-950 rounded-xl border border-slate-850 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsLineupAccordionExpanded(prev => prev === 'formation' ? null : 'formation')}
                    aria-expanded={isLineupAccordionExpanded === 'formation'}
                    className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-900/60 transition"
                  >
                    <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider font-bold">
                      3. Team Whiteboard
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isLineupAccordionExpanded === 'formation' ? 'rotate-180 text-[#00bbff]' : ''}`} />
                  </button>

                  {isLineupAccordionExpanded === 'formation' && (
                    <div className="px-3.5 pb-3.5 pt-0 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => onSelectTab('formation', lastFormation.id)}
                        className="w-full mt-3 bg-slate-900 hover:bg-slate-800 border border-slate-850 p-3 rounded-xl flex items-center justify-between text-left transition group cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                      >
                        <div>
                          <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Team Formation</div>
                          <div className="text-[9px] text-slate-400 group-hover:text-emerald-400 transition font-medium flex items-center gap-1 font-mono tracking-tight mt-1">
                            <span>View whiteboard</span>
                            <ChevronRight className="w-3 h-3 text-slate-500 group-hover:translate-x-0.5 transition" />
                          </div>
                        </div>
                        <div className="relative w-12 h-12 rounded-lg border border-slate-800 bg-slate-900 overflow-hidden flex items-center justify-center shadow-inner shrink-0">
                          <img
                            src="https://i.ibb.co/677t1dGJ/Untitled-design-7.png"
                            alt="Tactical whiteboard blueprint play"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* 4. Team Tactics and Animations */}
                <div className="bg-slate-950 rounded-xl border border-slate-850 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsLineupAccordionExpanded(prev => prev === 'tactics' ? null : 'tactics')}
                    aria-expanded={isLineupAccordionExpanded === 'tactics'}
                    className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-900/60 transition"
                  >
                    <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider font-bold flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      4. Tactics and Animations
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isLineupAccordionExpanded === 'tactics' ? 'rotate-180 text-[#00bbff]' : ''}`} />
                  </button>

                  {isLineupAccordionExpanded === 'tactics' && (
                    <div className="px-3.5 pb-3.5 pt-0 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          sessionStorage.setItem('scroll_to_tactical_playbook', 'true');
                          onSelectTab('formation', lastFormation.id);
                        }}
                        className="w-full mt-3 text-left p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-850 transition cursor-pointer select-none flex items-center justify-between"
                      >
                        <span className="text-[10px] text-slate-300 font-mono">
                          Open tactical playbook and animations
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Coach-Created Team Formation Widget - desktop */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-[#00bbff]" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100 tracking-tight font-sans">Team Lineup & Player Position</h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="bg-[#00bbff]/10 text-[#00bbff] border border-[#00bbff]/20 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider font-bold animate-pulse">
                  Gameday Prep
                </span>
              </div>
            </div>

            {!lastFormation ? (
              <div className="p-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-center space-y-1">
                <p className="text-xs text-slate-350 font-medium">No published lineups yet</p>
                <p className="text-[10px] text-slate-500 font-mono">Your coach has not set up game day layouts for your team yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Meta details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 space-y-1 text-center sm:text-left flex flex-col justify-center">
                    <div className="text-[9px] font-mono text-slate-500 uppercase">Active Scheme Configuration</div>
                    <div className="text-xs font-bold text-slate-200 truncate">{lastFormation.name}</div>
                    <div className="text-[10.5px] font-mono text-[#00bbff]">{lastFormation.system} · {lastFormation.lineupName}</div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex flex-col justify-center text-center sm:text-left">
                    <div className="text-[9px] font-mono text-slate-500 uppercase">Your Field Assignment</div>
                    {myAssignment ? (
                      <div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-bounce" />
                          {myAssignment.positionId} ({myAssignment.positionName})
                        </span>
                      </div>
                    ) : myBenchAssignment ? (
                      <div className="mt-0.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                          <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          {myBenchAssignment.positionName}
                        </span>
                        <div className="text-[9.5px] font-mono text-slate-450 uppercase tracking-wider mt-0.5">
                          Substitute role
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Reserves / Squad Pool</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectTab('formation', lastFormation.id)}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-850 p-3 rounded-xl flex flex-col items-center justify-between text-center transition group cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/30 min-h-[72px]"
                  >
                    <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Team Formation</div>

                    {/* Tactical chalkboard play custom image */}
                    <div className="relative w-12 h-12 rounded-lg border border-slate-800 bg-slate-900 overflow-hidden transition group-hover:border-[#00bbff]/40 duration-300 my-1 flex items-center justify-center shadow-inner">
                      <img
                        src="https://i.ibb.co/677t1dGJ/Untitled-design-7.png"
                        alt="Tactical whiteboard blueprint play"
                        className="w-full h-full object-cover transition duration-300 group-hover:scale-110"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div className="text-[9px] text-slate-400 group-hover:text-emerald-400 transition font-medium flex items-center gap-1 font-mono tracking-tight leading-none">
                      <span>View whiteboard</span>
                      <ChevronRight className="w-3 h-3 text-slate-500 group-hover:translate-x-0.5 transition" />
                    </div>
                  </button>
                </div>

                {/* TEAM TACTICS & ANIMATIONS row */}
                <div className="bg-slate-950 rounded-xl border border-slate-850 hover:border-sky-500/30 transition duration-150 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('scroll_to_tactical_playbook', 'true');
                      onSelectTab('formation', lastFormation.id);
                    }}
                    className="w-full text-left p-3.5 flex justify-between items-center bg-slate-950 hover:bg-slate-900/40 transition cursor-pointer select-none"
                  >
                    <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider flex items-center gap-1.5 font-bold">
                      <Layers className="w-3.5 h-3.5 text-sky-400" />
                      Team Tactics & Animations
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider font-bold animate-pulse">
                        <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                        High Importance
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Running Track GPS Widget Embedded Directly */}
          <div id="gps-run-tracker-widget-section" className="relative">
            <GPSRunTracker
              playerId={playerProfile.id}
              onSaveRun={onSaveRun}
              activeAssignmentId={trackAssignmentId || undefined}
              requiredDistanceKm={trackAssignedDistance}
            />
            <ComingSoonOverlay label="GPS Tracker" />
          </div>

          {/* Metrics & Biometric Dashboard Slider Widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Widget 1: Weekly Running Goals */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
              <ComingSoonOverlay label="Weekly Aerobic Goals" />

              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-sans">Weekly Aerobic Goals</span>
                <span className="text-xs font-mono font-bold text-emerald-400">{Math.round((totalKmRunThisWeek / weeklyRunningGoal) * 100)}%</span>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 shrink-0">
                  {/* Circle SVG */}
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-800"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-emerald-500"
                      strokeWidth="3.5"
                      strokeDasharray={`${Math.min(100, Math.round((totalKmRunThisWeek / weeklyRunningGoal) * 100))}, 100`}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-slate-200">
                    {totalKmRunThisWeek.toFixed(1)}k
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-slate-450">Distance completed:</div>
                  <div className="text-sm font-bold text-slate-200">{totalKmRunThisWeek.toFixed(2)} km</div>
                  <div className="text-[10px] text-slate-400 font-mono">Setup Weekly Goal: {weeklyRunningGoal} km</div>
                </div>
              </div>
            </div>

            {/* Widget 2: Hydration intake goals */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative flex flex-col justify-between overflow-hidden">
              <ComingSoonOverlay label="Hydration" />

              {/* Translucent water and bubble vector background (inspired by reference image) */}
              <div className="absolute inset-0 opacity-[0.14] pointer-events-none select-none z-0">
                <svg className="w-full h-full text-sky-400" viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                      <stop offset="50%" stopColor="#0284c7" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.6" />
                    </linearGradient>
                    <radialGradient id="bubbleGrad" cx="30%" cy="30%" r="70%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
                      <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#0369a1" stopOpacity="0.3" />
                    </radialGradient>
                  </defs>

                  {/* Elegant flowing wave paths */}
                  <path d="M-50,150 C50,90 100,220 250,140 L250,250 L-50,250 Z" fill="url(#waveGrad)" />
                  <path d="M-50,190 C60,110 130,240 250,180 L250,250 L-50,250 Z" fill="url(#waveGrad)" opacity="0.8" />
                  <path d="M-50,80 C80,40 120,180 250,100 L250,250 L-50,250 Z" fill="url(#waveGrad)" opacity="0.5" />

                  {/* Composition of overlapping bubbles / liquid elements matching the aesthetics of reference */}
                  <circle cx="35" cy="50" r="28" stroke="#38bdf8" strokeWidth="1.5" fill="url(#bubbleGrad)" />
                  <circle cx="95" cy="110" r="34" stroke="#38bdf8" strokeWidth="1.2" fill="url(#bubbleGrad)" />
                  <circle cx="155" cy="40" r="24" stroke="#38bdf8" strokeWidth="1" fill="url(#bubbleGrad)" />
                  <circle cx="170" cy="140" r="18" stroke="#38bdf8" strokeWidth="1" fill="url(#bubbleGrad)" />
                  <circle cx="25" cy="160" r="20" stroke="#38bdf8" strokeWidth="1.2" fill="url(#bubbleGrad)" />
                  <circle cx="110" cy="195" r="30" stroke="#38bdf8" strokeWidth="1.5" fill="url(#bubbleGrad)" />
                  <circle cx="45" cy="225" r="15" stroke="#38bdf8" strokeWidth="1" fill="url(#bubbleGrad)" />
                  <circle cx="180" cy="220" r="22" stroke="#38bdf8" strokeWidth="1" fill="url(#bubbleGrad)" />
                </svg>
              </div>

              <div className="relative z-10">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1">
                    <Droplet className="w-4 h-4 text-sky-400 shrink-0" />
                    Hydration Level
                  </span>
                  <span className="text-xs font-mono font-bold text-sky-400">{dailyHydrationPct}%</span>
                </div>
                <p className="text-[10px] text-slate-450 font-mono mb-4">Daily goal: {dailyGoalMl} ml</p>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-xs mb-3">
                  <div className="text-[10px] font-mono text-slate-400 uppercase mb-1">TODAY'S LOGGED INTAKE</div>
                  <div className="text-lg font-bold font-mono text-slate-100">{todayHydrationMl} <span className="text-xs text-slate-400 font-normal">ml</span></div>
                  <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-2">
                    <div className="bg-sky-400 h-full rounded-full transition-all duration-500" style={{ width: `${dailyHydrationPct}%` }} />
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-850 text-xs mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">WEEKLY TOTAL</div>
                    <span className="text-[10px] font-mono text-sky-400">{Math.min(100, Math.round((weeklyHydrationMl / weeklyGoalMl) * 100))}%</span>
                  </div>
                  <div className="text-sm font-bold font-mono text-slate-100">{weeklyHydrationMl} <span className="text-xs text-slate-400 font-normal">/ {weeklyGoalMl} ml</span></div>
                  <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-2">
                    <div className="bg-sky-300 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (weeklyHydrationMl / weeklyGoalMl) * 100)}%` }} />
                  </div>
                </div>
              </div>

              {/* Slider for scoop selection */}
              <div className="space-y-3 relative z-10">
                <div>
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wide mb-1.5">Selected Scoop Size:</div>
                  <div className="grid grid-cols-3 bg-slate-950 p-1 rounded-xl border border-slate-850 gap-1 relative overflow-hidden" style={{ minHeight: '36px' }}>
                    {([250, 500, 750] as const).map((size) => {
                      const isSelected = hydrationScoop === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setHydrationScoop(size)}
                          className={`relative z-10 py-1.5 text-center text-[10px] font-sans font-bold transition-all uppercase rounded-lg ${
                            isSelected ? 'text-slate-950' : 'text-slate-450 hover:text-slate-200'
                          }`}
                          style={{ outline: 'none' }}
                        >
                          {isSelected && (
                            <motion.div
                              layoutId="activeHydrationScoopIndicator"
                              className="absolute inset-0 bg-[#00bbff] rounded-lg -z-10"
                              transition={{ type: "spring", stiffness: 350, damping: 25 }}
                            />
                          )}
                          {size} ml
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleIncrementHydration}
                  className="w-full py-2 bg-[#00bbff] hover:bg-[#009be0] active:scale-95 text-slate-950 font-sans font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
                >
                  <Droplet className="w-3.5 h-3.5 text-slate-950" />
                  + Log {hydrationScoop}ml Intake
                </button>
              </div>
            </div>

            {/* Widget 3: Sleep quality tracker */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative flex flex-col justify-between overflow-hidden">
              <ComingSoonOverlay label="Sleep Optimization" />
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-350 uppercase mb-4">
                  <Moon className="w-4 h-4 text-emerald-400 shrink-0" />
                  Sleep Optimization Rating
                </div>

                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-850 text-xs mb-4">
                  <div>
                    <div className="text-[10px] font-mono text-slate-450 uppercase mb-1">Sleep Hours</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onUpdateDailyMetrics({ sleepHours: Math.max(0, metrics.sleepHours - 0.5) })}
                        className="w-6 h-6 rounded-full bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold flex items-center justify-center transition-transform active:scale-90"
                        title="Decrease sleep hours"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-slate-100 text-sm">{metrics.sleepHours}h</span>
                      <button
                        type="button"
                        onClick={() => onUpdateDailyMetrics({ sleepHours: Math.min(24, metrics.sleepHours + 0.5) })}
                        className="w-6 h-6 rounded-full bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold flex items-center justify-center transition-transform active:scale-90"
                        title="Increase sleep hours"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-slate-455 uppercase mb-1">Rating</div>
                    <div className="text-sm font-sans font-bold text-emerald-400 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-emerald-400 border-none shrink-0" />
                      <span className="text-xs uppercase tracking-wider">{metrics.sleepQuality}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Slider Toggles for rating */}
              <div className="space-y-1.5 relative z-10">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wide">Adjust Quality Rating Slider:</div>
                <div className="grid grid-cols-4 bg-slate-950 p-1 rounded-xl border border-slate-850 gap-1 relative overflow-hidden" style={{ minHeight: '36px' }}>
                  {(['Poor', 'Fair', 'Good', 'Excellent'] as const).map((opt) => {
                    const isSelected = metrics.sleepQuality === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => onUpdateDailyMetrics({ sleepQuality: opt })}
                        className={`relative z-10 py-1.5 text-center text-[10px] font-sans font-bold transition-all uppercase rounded-lg ${
                          isSelected ? 'text-slate-950' : 'text-slate-450 hover:text-slate-200'
                        }`}
                        style={{ outline: 'none' }}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="activeSleepQualityIndicator"
                            className="absolute inset-0 bg-[#00bbff] rounded-lg -z-10"
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                          />
                        )}
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Widget 4: Nutrition intake widget */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
              <ComingSoonOverlay label="Nutrition" />
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-bold text-slate-350 uppercase flex items-center gap-1">
                  <Utensils className="w-4 h-4 text-emerald-450 shrink-0" />
                  Nutrition Intake Target
                </span>
                <span className="font-mono text-xs font-bold text-emerald-400">{caloriePct}%</span>
              </div>
              <p className="text-[10px] text-slate-450 font-mono mb-4">Logged: {metrics.nutritionCalories} / 2800 kcal</p>

              <div className="space-y-3">
                {/* Micro Protein/Carbs/Fat indicators */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-1 bg-rose-500/10 border border-rose-500/20 text-[10px] rounded">
                    <label className="block text-slate-450">PROTEIN</label>
                    <b className="font-mono text-slate-100">{metrics.nutritionProteinG}g</b>
                  </div>
                  <div className="p-1 bg-amber-500/10 border border-amber-500/20 text-[10px] rounded">
                    <label className="block text-slate-455">CARBS</label>
                    <b className="font-mono text-slate-100">{metrics.nutritionCarbsG}g</b>
                  </div>
                  <div className="p-1 bg-violet-500/10 border border-violet-500/20 text-[10px] rounded">
                    <label className="block text-slate-450">FAT</label>
                    <b className="font-mono text-slate-100">{metrics.nutritionFatG}g</b>
                  </div>
                </div>

                {!showMealLogger ? (
                  <button
                    type="button"
                    onClick={() => setShowMealLogger(true)}
                    className="w-full py-2 bg-[#00bbff] hover:bg-[#009be0] text-slate-950 text-xs font-bold rounded-xl transition active:scale-95"
                  >
                    Log Active Meal Calories
                  </button>
                ) : (
                  <form onSubmit={handleLogMealSubmit} className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[9px] font-mono text-slate-400">CALORIES (KCAL)</label>
                        <input
                          type="number"
                          value={mealCalories}
                          onChange={(e) => setMealCalories(parseInt(e.target.value) || 0)}
                          className="w-full bg-slate-900 text-slate-100 p-1 rounded font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-slate-400">PROTEIN (G)</label>
                        <input
                          type="number"
                          value={mealProtein}
                          onChange={(e) => setMealProtein(parseInt(e.target.value) || 0)}
                          className="w-full bg-slate-900 text-slate-100 p-1 rounded font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-1.5">
                      <button
                        type="button"
                        onClick={() => setShowMealLogger(false)}
                        className="text-[10px] text-slate-400 hover:text-slate-100 transition-colors"
                      >
                        Dismiss
                      </button>
                      <button
                        type="submit"
                        className="bg-[#00bbff] hover:bg-[#009be0] text-slate-950 text-[10px] font-bold px-3.5 py-1.5 rounded-lg active:scale-95 transition"
                      >
                        Apply Intake Log
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

          </div>

          {/* Historical Running Log Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-semibold font-sans text-slate-200">Historical GPS Run Logs ({runLogs.length})</h3>

            {runLogs.length === 0 ? (
              <div className="p-6 bg-slate-950 rounded-xl border border-slate-850 text-center text-xs font-mono text-slate-500">
                No GPS run history logged in this profile session yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {runLogs.map((run) => (
                  <div key={run.id} className="p-3 bg-slate-950/80 rounded-xl border border-slate-850/80 grid grid-cols-2 sm:grid-cols-4 items-center gap-3 text-xs">
                    <div>
                      <div className="text-[10px] text-slate-450 font-mono">DATE / PERIOD</div>
                      <div className="font-semibold text-slate-200">{new Date(run.date).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-450 font-mono">DISTANCE LOGGED</div>
                      <div className="font-bold text-slate-150 font-mono">{run.distanceKm.toFixed(2)} km</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-450 font-mono">AVG SPEED (FASTEST)</div>
                      <div className="font-mono text-slate-200">
                        {run.avgSpeedKmH} km/h <span className="text-[10px] text-emerald-400">({run.maxSpeedKmH})</span>
                      </div>
                    </div>
                    <div className="text-right">
                      {run.fromAssignmentId ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-505">
                          ASSIGNMENT OK
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-mono">Practice Run</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Calendar View & Educational Completion Status */}
        <div className="lg:col-span-4 space-y-6">

          {/* Team Schedule Widget - desktop only */}
          <div className="hidden md:block">
            <TeamScheduleWidget schedules={teamSchedules} teamId={playerProfile.teamId} matchKeys={matchKeys} />
          </div>

          {/* Completed Modules Widget Track */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative">
            <span className="text-[10px] font-mono text-[#00bbff] tracking-wide font-bold block mb-1">
              EDUCATIONAL STATS
            </span>
            <h3 className="text-sm font-semibold text-slate-200">Academy Modules Verified</h3>

            <div className="mt-4 flex items-center justify-between">
              <div>
                <div className="text-2xl font-mono font-bold text-[#00bbff]">
                  {completedAssignedModulesCount} / {assignedModulesCount}
                </div>
                <div className="text-[11px] text-slate-450 mt-0.5 leading-relaxed">Assigned Modules Logged</div>
              </div>

              <button
                onClick={() => onSelectTab('classroom')}
                className="p-2 rounded-xl bg-slate-950 hover:bg-slate-850 text-[#00bbff] border border-slate-850 flex items-center gap-1.5 transition text-xs font-semibold hover:opacity-90"
              >
                Go to Classroom
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Micro completed listing to reflect all assigned modules and their exact state */}
            <div className="mt-4 space-y-1.5">
              {assignedModules.length === 0 ? (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-850 text-center text-[10px] font-mono text-slate-500">
                  No classroom sessions assigned by coach.
                </div>
              ) : (
                assignedModules.map((assign) => {
                  const mod = modules.find(m => m.id === assign.moduleId);
                  const completionRecord = completions.find(comp => comp.moduleId === assign.moduleId);
                  const isCompleted = assign.completedByPlayerIds.includes(playerProfile.id) || !!completionRecord;

                  return (
                    <div key={assign.id} onClick={() => onSelectTab('classroom', undefined, assign.moduleId)} className="p-2.5 bg-slate-950 rounded-xl border border-slate-850 text-[10px] font-mono flex justify-between items-center cursor-pointer hover:border-[#00bbff]/50 transition">
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate max-w-[150px] text-slate-300 font-semibold">{mod?.title || assign.title || 'Learning Module'}</span>
                        <span className="text-[8px] text-slate-500">Due: {assign.dueDate}</span>
                      </div>
                      <div>
                        {isCompleted ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase text-[8px]">
                            {completionRecord?.quizScore
                              ? `Score: ${completionRecord.quizScore.score}/${completionRecord.quizScore.total}`
                              : 'DONE'}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase text-[8px]">
                            REQUIRED
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}

function MobileTeamScheduleWidget({ schedules, teamId, matchKeys }: { schedules: TeamSchedule[]; teamId?: string; matchKeys: (k1: string | null | undefined, k2: string | null | undefined) => boolean }) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const SCHEDULE_EVENT_OPTIONS: { value: string; label: string }[] = [
    { value: 'practice', label: 'Practice' },
    { value: 'game', label: 'Game' },
    { value: 'activity', label: 'Event' },
    { value: 'tournament', label: 'Tournament' },
  ];

  const getEventType = (schedule: TeamSchedule): string => {
    const value = (schedule as TeamSchedule & { eventType?: string }).eventType;
    return value === 'game' || value === 'activity' || value === 'tournament' ? value : 'practice';
  };

  const formatDisplay = (date: string, time: string) => {
    const d = new Date(`${date}T${time}`);
    return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const teamSessions = schedules
    .filter(s => matchKeys(s.teamId, teamId))
    .sort((a, b) => new Date(`${a.sessionDate}T${a.sessionTime}`).getTime() - new Date(`${b.sessionDate}T${b.sessionTime}`).getTime());

  const now = new Date();
  const upcomingSessions = teamSessions.filter(
    s => new Date(`${s.sessionDate}T${s.sessionTime}`).getTime() >= now.getTime()
  );
  // Next five upcoming events, falling back to the most recent when none are upcoming
  const nextFiveSessions = (upcomingSessions.length > 0 ? upcomingSessions : [...teamSessions].reverse()).slice(0, 5);

  const nextSession = upcomingSessions[0] || null;

  return (
    <div className="w-full min-w-0 overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full flex items-center justify-between mb-4 flex-wrap gap-2 text-left"
        aria-expanded={isExpanded}
      >
        <h2 className="min-w-0 text-xs font-bold text-slate-350 uppercase tracking-widest flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="break-words">Team Schedule</span>
        </h2>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {!isExpanded ? (
        <p className="text-[10px] font-mono text-slate-400">
          {nextSession
            ? `Next: ${formatDisplay(nextSession.sessionDate, nextSession.sessionTime)}${nextSession.location ? ` · ${nextSession.location}` : ''}`
            : 'No upcoming sessions scheduled.'}
        </p>
      ) : nextFiveSessions.length === 0 ? (
        <div className="w-full min-w-0 bg-slate-950/40 border border-slate-850 rounded-xl p-6 text-center">
          <p className="text-slate-450 text-xs italic break-words">
            No upcoming sessions have been scheduled yet.
          </p>
        </div>
      ) : (
        <div className="w-full min-w-0 grid grid-cols-1 gap-2">
          {nextFiveSessions.map(session => {
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
                  onClick={() => setExpandedSessionId(isExpandedRow ? null : session.id)}
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
                      {SCHEDULE_EVENT_OPTIONS.find(option => option.value === getEventType(session))?.label || 'Practice'}
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
                        {formatDisplay(session.sessionDate, session.sessionTime)}
                      </p>

                      {session.location && (
                        <p className="text-[10px] font-mono text-emerald-300/90 leading-snug break-words flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {session.location}
                        </p>
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
  );
}

function TeamScheduleWidget({ schedules, teamId, matchKeys }: { schedules: TeamSchedule[]; teamId?: string; matchKeys: (k1: string | null | undefined, k2: string | null | undefined) => boolean }) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const SCHEDULE_EVENT_OPTIONS: { value: string; label: string }[] = [
    { value: 'practice', label: 'Practice' },
    { value: 'game', label: 'Game' },
    { value: 'activity', label: 'Event' },
    { value: 'tournament', label: 'Tournament' },
  ];

  const getEventType = (schedule: TeamSchedule): string => {
    const value = (schedule as TeamSchedule & { eventType?: string }).eventType;
    return value === 'game' || value === 'activity' || value === 'tournament' ? value : 'practice';
  };

  const formatDisplay = (date: string, time: string) => {
    const d = new Date(`${date}T${time}`);
    return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const teamSessions = schedules
    .filter(s => matchKeys(s.teamId, teamId))
    .sort((a, b) => new Date(`${a.sessionDate}T${a.sessionTime}`).getTime() - new Date(`${b.sessionDate}T${b.sessionTime}`).getTime());

  const now = new Date();
  const upcoming = teamSessions.filter(s => new Date(`${s.sessionDate}T${s.sessionTime}`).getTime() >= now.getTime());
  // Next five upcoming events, falling back to the most recent when none are upcoming
  const nextFiveSessions = (upcoming.length > 0 ? upcoming : [...teamSessions].reverse()).slice(0, 5);

  return (
    <div className="w-full min-w-0 overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl min-h-[300px] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-bold text-slate-350 uppercase tracking-widest flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400" />
          Team Schedule
        </h2>
      </div>

      {nextFiveSessions.length === 0 ? (
        <div className="w-full min-w-0 bg-slate-950/40 border border-slate-850 rounded-xl p-6 text-center">
          <p className="text-slate-450 text-xs italic break-words">
            No upcoming sessions have been scheduled yet.
          </p>
        </div>
      ) : (
        <div className="w-full min-w-0 grid grid-cols-1 gap-2">
          {nextFiveSessions.map(session => {
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
                  onClick={() => setExpandedSessionId(isExpandedRow ? null : session.id)}
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
                      {SCHEDULE_EVENT_OPTIONS.find(option => option.value === getEventType(session))?.label || 'Practice'}
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
                        {formatDisplay(session.sessionDate, session.sessionTime)}
                      </p>

                      {session.location && (
                        <p className="text-[10px] font-mono text-emerald-300/90 leading-snug break-words flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {session.location}
                        </p>
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
  );
}