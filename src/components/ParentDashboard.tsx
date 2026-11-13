/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Users, Save, MessageSquareHeart, CircleCheck as CheckCircle2, Calendar, MapPin, Plus, Pencil } from 'lucide-react';
import { UserProfile, RunLog, DailyMetrics, Assignment, ClassroomSession, ModuleCompletion, Coach, Team, TeamFormation, TeamSchedule, HydrationLog } from '../types';
import PlayerDashboard from './PlayerDashboard';
import ChildAvatarEditor from './ChildAvatarEditor';
import ChildSwitcher from './ChildSwitcher';
import { useChildAvatar } from './useChildAvatar';
import { sanitizeUUID } from '../supabase';

interface ParentDashboardProps {
  parentProfile: UserProfile;
  allPlayers: UserProfile[];
  allRunLogs: RunLog[];
  allMetrics: Record<string, DailyMetrics[]>;
  allCompletions: ModuleCompletion[];
  modules: ClassroomSession[];
  assignments: Assignment[];
  coaches: Coach[];
  teams: Team[];
  formations: TeamFormation[];
  onUpdatePlayerMetrics: (playerId: string, metrics: Partial<DailyMetrics>) => void;
  teamSchedules?: TeamSchedule[];
  onSaveRun: (newRun: Omit<RunLog, 'id' | 'playerId' | 'date'> & { playerId?: string }) => void;
  onSelectTab: (tab: 'classroom' | 'formation', formationId?: string, classroomId?: string) => void;
  hydrationLogs?: HydrationLog[];
  onLogHydration?: (amountMl: number, playerId?: string) => void;
  handleUpdateDailyMetricsForChild?: (playerId: string, fields: Partial<DailyMetrics>) => void;
  onGoToProfile?: () => void;
  /** The athlete every parent-facing page follows. Owned by the app so pages stay in sync. */
  selectedChildId?: string | null;
  onSelectChild?: (childId: string) => void;
}

// Two ids refer to the same record if they match directly or after UUID normalisation
// (raw ids like "user-player-123" are stored in the database as a deterministic UUID).
const sameId = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    return sanitizeUUID(a) === sanitizeUUID(b);
  } catch (_) {
    return false;
  }
};

export default function ParentDashboard({
  parentProfile,
  allPlayers,
  allRunLogs,
  allMetrics,
  allCompletions,
  modules,
  assignments,
  coaches,
  teams,
  formations,
  onUpdatePlayerMetrics,
  teamSchedules = [],
  onSaveRun,
  onSelectTab,
  hydrationLogs = [],
  onLogHydration,
  handleUpdateDailyMetricsForChild,
  onGoToProfile,
  selectedChildId = null,
  onSelectChild,
}: ParentDashboardProps) {
  const [successMsg, setSuccessMsg] = useState('');

  // The parent's own record lists their children in child_player_id / child_player_ids.
  const linkedChildIds = useMemo(() => {
    const ids = new Set<string>();
    if (parentProfile.childPlayerId) ids.add(parentProfile.childPlayerId);
    (parentProfile.childPlayerIds || []).forEach(id => {
      if (id) ids.add(id);
    });
    return Array.from(ids);
  }, [parentProfile.childPlayerId, parentProfile.childPlayerIds]);

  // Dynamic additional children and switcher resolution.
  // A player is this parent's child when EITHER:
  //  - the parent's child_player_id / child_player_ids contains the player's id, OR
  //  - the player's parentUserId points back to this parent.
  // `allPlayers` is the merged users + players list supplied by App, so a child that only
  // exists in the players table is found too, together with its team and coach.
  const allMyChildren = useMemo(() => {
    return allPlayers.filter(
      player =>
        player.role === 'player' &&
        (
          player.parentUserId === parentProfile.id ||
          linkedChildIds.some(id => sameId(id, player.id))
        )
    );
  }, [allPlayers, parentProfile.id, linkedChildIds]);

  // The selected athlete lives in the app, so the dashboard, season and locker room
  // pages always agree on which child is being viewed.
  // Until the parent picks one, default to their first athlete so the page never flashes empty.
  const activeChildId = selectedChildId || allMyChildren[0]?.id || '';

  useEffect(() => {
    if (allMyChildren.length === 0) return;
    if (!allMyChildren.some(c => sameId(c.id, activeChildId))) {
      onSelectChild?.(allMyChildren[0].id);
    }
  }, [allMyChildren, activeChildId, onSelectChild]);

  // Look up Child profile
  const childPlayer = useMemo(() => {
    if (!activeChildId) return null;
    return allMyChildren.find(p => sameId(p.id, activeChildId)) || allPlayers.find(p => sameId(p.id, activeChildId)) || null;
  }, [allMyChildren, allPlayers, activeChildId]);

  // Find coach and team details for the child player
  const childCoach = useMemo(() => {
    if (!childPlayer || !childPlayer.coachId) return null;
    return coaches.find(c => sameId(c.id, childPlayer.coachId)) || null;
  }, [coaches, childPlayer]);

  const childTeam = useMemo(() => {
    if (!childPlayer || !childPlayer.teamId) return null;
    return teams.find(t => sameId(t.id, childPlayer.teamId)) || null;
  }, [teams, childPlayer]);

  const [formationActiveTab, setFormationActiveTab] = useState<'lineup' | 'drills'>('lineup');

  // Formations data processing
  const teamFormations = useMemo(() => {
    if (!formations || !childPlayer?.teamId) return [];
    return formations.filter(f => sameId(f.teamId, childPlayer.teamId));
  }, [formations, childPlayer?.teamId]);

  const lastFormation = useMemo(() => {
    if (teamFormations.length === 0) return null;
    return [...teamFormations].sort((a, b) => {
      const aTime = (a as any).updatedAt ? new Date((a as any).updatedAt).getTime() : 0;
      const bTime = (b as any).updatedAt ? new Date((b as any).updatedAt).getTime() : 0;
      return bTime - aTime;
    })[0];
  }, [teamFormations]);

  const myAssignment = useMemo(() => {
    if (!lastFormation || !childPlayer) return null;
    return lastFormation.assignments.find(as => as.playerId === childPlayer.id);
  }, [lastFormation, childPlayer]);

  const formationAssignmentsWithNames = useMemo(() => {
    if (!lastFormation || !childPlayer) return [];
    return lastFormation.assignments.map(as => {
      const pObj = allPlayers.find(p => p.id === as.playerId);
      return {
        ...as,
        playerName: pObj ? pObj.name : 'Unassigned Position',
        isMe: as.playerId === childPlayer.id
      };
    }).sort((a, b) => (a.playerId ? 0 : 1) - (b.playerId ? 0 : 1));
  }, [lastFormation, allPlayers, childPlayer]);

  // Find position coordination
  const positionDisplay = useMemo(() => {
    if (myAssignment) {
      return myAssignment.positionId;
    }
    return 'Reserves Pool';
  }, [myAssignment]);

  // Find the child's daily metrics for the timeline date '2026-05-21'
  const targetDate = '2026-05-21';
  const childMetrics = useMemo(() => {
    if (!childPlayer) return null;
    const records = allMetrics[childPlayer.id] || [];
    return records.find(r => r.date === targetDate) || {
      playerId: childPlayer.id,
      date: targetDate,
      hydrationMls: 1500,
      hydrationGoalMls: 3000,
      sleepHours: 8,
      sleepQuality: 'Good' as const,
      nutritionCalories: 2000,
      nutritionProteinG: 60,
      nutritionCarbsG: 120,
      nutritionFatG: 35
    };
  }, [allMetrics, childPlayer]);

  // Encouragement note local state (persisted to localStorage)
  const [encouragementNote, setEncouragementNote] = useState(() => {
    if (!childPlayer) return '';
    return localStorage.getItem(`parent_gameday_note_${childPlayer.id}`) || 'Keep pushing hard, stay focused and remember to hydrate! I am very proud of you!';
  });

  // Metric editor state
  const [isEditingMetrics, setIsEditingMetrics] = useState(false);
  const [editHydration, setEditHydration] = useState(0);
  const [editHydrationGoal, setEditHydrationGoal] = useState(0);
  const [editSleepHours, setEditSleepHours] = useState(0);
  const [editSleepQuality, setEditSleepQuality] = useState<string>('Good');
  const [editCalories, setEditCalories] = useState(0);
  const [editProtein, setEditProtein] = useState(0);
  const [editCarbs, setEditCarbs] = useState(0);
  const [editFat, setEditFat] = useState(0);
  const [editRunGoal, setEditRunGoal] = useState(0);
  const [hydrationScoop, setHydrationScoop] = useState<250 | 500 | 750>(250);

  // Child profile photo management (parent edits the linked athlete's photo)
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const { avatarUrl: childAvatarUrl, uploadAvatar: uploadChildAvatar, removeAvatar: removeChildAvatar } = useChildAvatar(childPlayer);

  const handleSaveEncouragement = () => {
    if (childPlayer) {
      localStorage.setItem(`parent_gameday_note_${childPlayer.id}`, encouragementNote);
      setSuccessMsg('Motivational message saved successfully! Your child will see this on their dashboard.');
      setTimeout(() => setSuccessMsg(''), 3500);
    }
  };

  const handleOpenEdit = () => {
    if (childPlayer && childMetrics) {
      setEditHydration(childMetrics.hydrationMls);
      setEditHydrationGoal(childMetrics.hydrationGoalMls);
      setEditSleepHours(childMetrics.sleepHours);
      setEditSleepQuality(childMetrics.sleepQuality);
      setEditCalories(childMetrics.nutritionCalories);
      setEditProtein(childMetrics.nutritionProteinG ?? 60);
      setEditCarbs(childMetrics.nutritionCarbsG ?? 120);
      setEditFat(childMetrics.nutritionFatG ?? 35);
      setEditRunGoal(childMetrics.runDistanceGoalKm ?? 15.0);
    }
    setIsEditingMetrics(true);
  };

  const handleSaveMetrics = () => {
    if (!childPlayer) return;
    onUpdatePlayerMetrics(childPlayer.id, {
      hydrationMls: editHydration,
      hydrationGoalMls: editHydrationGoal,
      sleepHours: editSleepHours,
      sleepQuality: editSleepQuality,
      nutritionCalories: editCalories,
      nutritionProteinG: editProtein,
      nutritionCarbsG: editCarbs,
      nutritionFatG: editFat,
      runDistanceGoalKm: editRunGoal
    });
    setIsEditingMetrics(false);
    setSuccessMsg('Athlete vitality parameters updated and uploaded successfully!');
    setTimeout(() => setSuccessMsg(''), 3500);
  };

  // Run statistics for the child
  const childRuns = useMemo(() => {
    if (!childPlayer) return [];
    return allRunLogs.filter(log => log.playerId === childPlayer.id);
  }, [allRunLogs, childPlayer]);

  const childCompletions = useMemo(() => {
    if (!childPlayer) return [];
    return allCompletions.filter(comp => comp.playerId === childPlayer.id);
  }, [allCompletions, childPlayer]);

  const totalKmRunThisWeek = useMemo(() => {
    return childRuns.reduce((sum, r) => sum + r.distanceKm, 0);
  }, [childRuns]);

  const runningGoalKm = childMetrics?.runDistanceGoalKm || 15.0;

  const hydrationPct = childMetrics
    ? Math.min(100, Math.round((childMetrics.hydrationMls / childMetrics.hydrationGoalMls) * 100))
    : 0;

  // Meal increment helper values
  const [mealCalories, setMealCalories] = useState(400);

  const handleAddHydration = () => {
    if (!childPlayer || !childMetrics) return;
    const nextVal = childMetrics.hydrationMls + hydrationScoop;
    onUpdatePlayerMetrics(childPlayer.id, {
      hydrationMls: nextVal
    });
  };

  const handleAddCalories = () => {
    if (!childPlayer || !childMetrics) return;
    const nextVal = childMetrics.nutritionCalories + mealCalories;
    onUpdatePlayerMetrics(childPlayer.id, {
      nutritionCalories: nextVal
    });
  };

  const handleSleepChange = (hours: number) => {
    if (!childPlayer) return;
    onUpdatePlayerMetrics(childPlayer.id, {
      sleepHours: hours
    });
  };

  const handleSleepQualityChange = (quality: 'Poor' | 'Fair' | 'Good' | 'Excellent') => {
    if (!childPlayer) return;
    onUpdatePlayerMetrics(childPlayer.id, {
      sleepQuality: quality
    });
  };

  // Build child metrics for PlayerDashboard (must be before early return to satisfy Rules of Hooks)
  const childMetricsData = useMemo(() => {
    if (!childPlayer) return null;
    const records = allMetrics[childPlayer.id] || [];
    return records.find(r => r.date === targetDate) || {
      playerId: childPlayer.id,
      date: targetDate,
      hydrationMls: 1500,
      hydrationGoalMls: 3000,
      sleepHours: 8,
      sleepQuality: 'Good' as const,
      nutritionCalories: 1000,
      nutritionProteinG: 60,
      nutritionCarbsG: 120,
      nutritionFatG: 35,
    };
  }, [allMetrics, childPlayer]);

  if (!childPlayer) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center max-w-lg mx-auto my-12">
        <Users className="w-12 h-12 text-[#00bbff] mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-100">No Athlete Linked Yet</h3>
        <p className="text-slate-400 text-xs mt-2 leading-relaxed">
          You don't have any athletes connected to your account. Add your child to start tracking their performance, hydration, and training progress.
        </p>
        {onGoToProfile && (
          <button
            type="button"
            onClick={onGoToProfile}
            className="mt-5 px-5 py-2.5 rounded-xl bg-[#00bbff] hover:bg-[#00a8e0] text-slate-950 font-bold text-sm transition inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add an Athlete
          </button>
        )}
      </div>
    );
  }

  // Wrapped handlers that forward to the child
  const handleChildSaveRun = (newRun: Omit<RunLog, 'id' | 'playerId' | 'date'>) => {
    if (!childPlayer) return;
    onSaveRun({ ...newRun, playerId: childPlayer.id });
  };

  const handleChildUpdateMetrics = (fields: Partial<DailyMetrics>) => {
    if (!childPlayer) return;
    if (handleUpdateDailyMetricsForChild) {
      handleUpdateDailyMetricsForChild(childPlayer.id, fields);
    } else {
      onUpdatePlayerMetrics(childPlayer.id, fields);
    }
  };

  const handleChildLogHydration = (amountMl: number) => {
    if (!childPlayer || !onLogHydration) return;
    onLogHydration(amountMl, childPlayer.id);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Parent banner with child selector */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 relative overflow-hidden space-y-4">
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="hidden sm:flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[9px] font-mono rounded-full uppercase tracking-wider font-semibold">
                Authorized Guardian Portal
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-slate-500 font-mono">Sync Online</span>
            </div>
            <h1 className="text-2xl font-black font-sans text-slate-100">Welcome, {parentProfile.name}</h1>
            <p className="text-xs text-slate-400 font-medium">
              Viewing full athlete dashboard for <b className="text-[#00bbff]">{childPlayer.name}</b>
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-3 bg-slate-50 border border-slate-200 p-3 rounded-2xl max-w-xs md:w-64">
            <div className="bg-gradient-to-r from-indigo-500 to-sky-500 w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shrink-0 text-xs shadow-md">
              C
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-slate-500 font-mono uppercase leading-none">
                {childCoach?.coachRole === 'assistant' ? 'Assistant Coach' : 'Head Coach'}
              </p>
              <p className="text-xs font-bold text-slate-200 truncate mt-1">
                {childCoach ? childCoach.name : 'Unassigned/Independent'}
              </p>
              <p className="text-[9px] text-[#00bbff] font-medium truncate mt-0.5">
                {childTeam ? childTeam.name : 'PDP Squad Group'}
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <ChildSwitcher
            children={allMyChildren}
            activeId={activeChildId}
            onSelect={(id) => onSelectChild?.(id)}
            action={
              <button
                type="button"
                onClick={() => setShowAvatarEditor(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold font-sans inline-flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-600 transition-all"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Profile
              </button>
            }
          />
        </div>
      </div>

      {showAvatarEditor && childPlayer && (
        <ChildAvatarEditor
          child={childPlayer}
          avatarUrl={childAvatarUrl}
          onUpload={uploadChildAvatar}
          onRemove={removeChildAvatar}
          onClose={() => setShowAvatarEditor(false)}
        />
      )}

      {/* Success Notification Bar */}
      {successMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-xl text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </motion.div>
      )}
     
{/* Encouragement message editor */}
       {/*
<div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
  <h3 className="text-sm font-bold text-slate-100 tracking-tight font-sans flex items-center gap-2">
    <MessageSquareHeart className="w-4 h-4 text-emerald-400" />
    Gameday Motivational Bulletin
  </h3>
  <p className="text-[11px] text-slate-400">
    Send a custom note. This shows as a banner on your athlete's dashboard to spur them forward on practice day!
  </p>

  <div className="space-y-2 pt-1">
    <textarea
      value={encouragementNote}
      onChange={(e) => setEncouragementNote(e.target.value)}
      maxLength={180}
      placeholder="Proud of your effort this week! Keep hydrating and give 100% on gameday."
      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-700 min-h-[80px]"
    />
    <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
      <span>{180 - encouragementNote.length} characters remaining</span>
      <button
        type="button"
        onClick={handleSaveEncouragement}
        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg text-[10px] font-bold font-sans flex items-center gap-1.5 transition cursor-pointer"
      >
        <Save className="w-3.5 h-3.5 shrink-0" />
        <span>Transmit to Dashboard</span>
      </button>
    </div>
  </div>
</div>
*/}
      {/* Full Athlete Dashboard for the child */}
      {childMetricsData && (
        <PlayerDashboard
          playerProfile={{
            ...childPlayer,
            manualCoachName: childCoach?.name || childPlayer.manualCoachName || 'Unassigned',
          }}
          runLogs={allRunLogs.filter(log => log.playerId === childPlayer.id)}
          metrics={childMetricsData}
          assignments={assignments.filter(a => sameId(a.teamId, childPlayer.teamId) || a.teamId === '' || a.playerId === childPlayer.id)}
          modules={modules}
          completions={allCompletions.filter(c => c.playerId === childPlayer.id)}
          onSaveRun={handleChildSaveRun}
          onUpdateDailyMetrics={handleChildUpdateMetrics}
          onSelectTab={onSelectTab}
          allPlayers={allPlayers.filter(p => p.role === 'player')}
          allRunLogs={allRunLogs}
          allMetrics={allMetrics}
          allCompletions={allCompletions}
          formations={formations}
          hydrationLogs={hydrationLogs.filter(l => l.playerId === childPlayer.id)}
          onLogHydration={handleChildLogHydration}
          teamSchedules={teamSchedules}
        />
      )}
    </div>
  );
}
