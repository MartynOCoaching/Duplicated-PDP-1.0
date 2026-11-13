/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, 
  Save, 
  Trash2, 
  Plus, 
  Calendar, 
  Tag, 
  FileText, 
  Info, 
  Star, 
  Sparkles, 
  Check, 
  UserPlus, 
  X,
  MapPin,
  SquarePen,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  Shield,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, TeamFormation, FormationAssignment, BenchAssignment, TeamSchedule, Assignment, RunLog } from '../types';
import TacticalAnimator from './TacticalAnimator';
import WeekScheduleCalendar from './WeekScheduleCalendar';
import ChildSwitcher from './ChildSwitcher';
import { sanitizeUUID, generateUUID } from '../supabase';

import { HomeVsAway } from './FormationsTab/HomeVsAway';
import { LineupCreator } from './FormationsTab/LineupCreator';
import { PlayOfTheGame } from './FormationsTab/PlayOfTheGame';
import { TeamRoster } from './FormationsTab/TeamRoster';

interface CoachDrillRecord {
  id: string;
  coachId: string;
  teamId: string;
  scheduleId: string;
  url: string;
}

export interface LibraryDrillRecord {
  id: string;
  teamId?: string | null;
  title: string;
  imageUrl: string;
  category?: string | null;
  focus?: string | null;
  ageGroup?: string | null;
  tags?: string[];
  difficulty?: string | null;
  durationMinutes?: number | null;
  status?: string | null;
  isLibrary: boolean;
}

// Age-group tags look like U9, U10, U12+ and so on
const AGE_TAG = /^u\d{1,2}\+?$/i;

const splitTerms = (value?: string | null) =>
  (value || '').split(/[,;|]/).map(s => s.trim()).filter(Boolean);

// A drill's age group: the age_group column, or an age tag if there isn't one
const drillAgeGroup = (d: LibraryDrillRecord): string => {
  if (d.ageGroup && d.ageGroup.trim()) return d.ageGroup.trim();
  const tag = (d.tags || []).map(t => t.trim()).find(t => AGE_TAG.test(t));
  return tag || '';
};

// A drill's themes: its tags (minus age tags), focus and category
const drillThemes = (d: LibraryDrillRecord): string[] => {
  const raw = [
    ...(d.tags || []).filter(t => !AGE_TAG.test(t.trim())),
    ...splitTerms(d.focus),
    ...splitTerms(d.category),
  ].map(s => s.trim()).filter(Boolean);
  return Array.from(new Set(raw));
};

// Sorts U9 before U10 before U17
const ageSortValue = (age: string) => parseInt(age.replace(/\D/g, ''), 10) || 999;

interface FormationsTabProps {
  currentProfile: UserProfile;
  selectedTeamId?: string | null;
  players: UserProfile[];
  formations: TeamFormation[];
  onSaveFormation: (formation: Omit<TeamFormation, 'updatedAt'>) => Promise<void>;
  onDeleteFormation: (formationId: string) => Promise<void>;
  initialSelectedFormationId?: string | null;
  teamSchedules?: TeamSchedule[];
  onAddSchedule?: (schedule: Omit<TeamSchedule, 'id' | 'createdAt'>) => void;
  onUpdateSchedule?: (scheduleId: string, fields: Partial<TeamSchedule>) => void;
  onDeleteSchedule?: (scheduleId: string) => void;
  coachDrills?: CoachDrillRecord[];
  onAddCoachDrill?: (drill: Omit<CoachDrillRecord, 'id'>) => Promise<void> | void;
  libraryDrills?: LibraryDrillRecord[];
  onAddLibraryDrill?: (drill: LibraryDrillRecord, scheduleId: string, teamId: string) => Promise<void> | void;
  onDeleteCoachDrill?: (drillId: string) => Promise<void> | void;
  // Parent only: the athletes this parent can view, so they can pick one (and see their team)
  viewableChildren?: { id: string; name: string; teamId?: string; teamName?: string }[];
  selectedViewableChildId?: string | null;
  onSelectViewableChild?: (childId: string) => void;
  // Player/parent week-schedule feed (assignments and GPS runs for the athlete)
  assignments?: Assignment[];
  runLogs?: RunLog[];
  onStartRun?: (assign: Assignment) => void;
  onOpenClassroom?: (moduleId: string) => void;
}

// Preset systems and formations configurations with static field coordinates (0-100 grid scale)
// X: Left-to-right (0 to 100), Y: Bottom-to-top (0 to 100).
// In soccer field perspective: 10 is near Goalkeeper, 90 is near Forward/Opponent Goal.
export const PRESET_FORMATIONS: Record<string, { name: string; assignments: Omit<FormationAssignment, 'playerId'>[] }[]> = {
  '5v5': [
    {
      name: '1-2-1 (Diamond)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'DEF', positionName: 'Central Defender', x: 50, y: 35 },
        { positionId: 'LM', positionName: 'Left Midfielder', x: 20, y: 60 },
        { positionId: 'RM', positionName: 'Right Midfielder', x: 80, y: 60 },
        { positionId: 'FWD', positionName: 'Forward/Striker', x: 50, y: 82 }
      ]
    },
    {
      name: '2-1-1 (Narrow)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LD', positionName: 'Left Defender', x: 30, y: 35 },
        { positionId: 'RD', positionName: 'Right Defender', x: 70, y: 35 },
        { positionId: 'MID', positionName: 'Central Midfielder', x: 50, y: 60 },
        { positionId: 'FWD', positionName: 'Forward/Striker', x: 50, y: 82 }
      ]
    },
    {
      name: '1-1-2 (Y-Formation)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'DEF', positionName: 'Defender', x: 50, y: 34 },
        { positionId: 'MID', positionName: 'Central Midfielder', x: 50, y: 58 },
        { positionId: 'LF', positionName: 'Left Forward', x: 30, y: 82 },
        { positionId: 'RF', positionName: 'Right Forward', x: 70, y: 82 }
      ]
    }
  ],
  '6v6': [
    {
      name: '2-1-2 (Balanced)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LD', positionName: 'Left Defender', x: 30, y: 32 },
        { positionId: 'RD', positionName: 'Right Defender', x: 70, y: 32 },
        { positionId: 'MID', positionName: 'Central Midfielder', x: 50, y: 56 },
        { positionId: 'LF', positionName: 'Left Forward', x: 28, y: 80 },
        { positionId: 'RF', positionName: 'Right Forward', x: 72, y: 80 }
      ]
    },
    {
      name: '2-2-1 (Central)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LD', positionName: 'Left Defender', x: 30, y: 32 },
        { positionId: 'RD', positionName: 'Right Defender', x: 70, y: 32 },
        { positionId: 'LM', positionName: 'Left midfielder', x: 25, y: 56 },
        { positionId: 'RM', positionName: 'Right midfielder', x: 75, y: 56 },
        { positionId: 'ST', positionName: 'Striker', x: 50, y: 82 }
      ]
    },
    {
      name: '1-3-1 (Central)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'DEF', positionName: 'Defender', x: 50, y: 32 },
        { positionId: 'LM', positionName: 'Left Mid', x: 20, y: 56 },
        { positionId: 'CM', positionName: 'Center Mid', x: 50, y: 56 },
        { positionId: 'RM', positionName: 'Right Mid', x: 80, y: 56 },
        { positionId: 'ST', positionName: 'Forward', x: 50, y: 82 }
      ]
    }
  ],
  '7v7': [
    {
      name: '2-3-1 (Blanced)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LD', positionName: 'Left Defender', x: 30, y: 30 },
        { positionId: 'RD', positionName: 'Right Defender', x: 70, y: 30 },
        { positionId: 'LM', positionName: 'Left midfielder', x: 18, y: 55 },
        { positionId: 'CM', positionName: 'Central midfielder', x: 50, y: 55 },
        { positionId: 'RM', positionName: 'Right midfielder', x: 82, y: 55 },
        { positionId: 'ST', positionName: 'Striker', x: 50, y: 82 }
      ]
    },
    {
      name: '3-2-1 (Defending)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LD', positionName: 'Left Back', x: 24, y: 30 },
        { positionId: 'CD', positionName: 'Center Back', x: 50, y: 30 },
        { positionId: 'RD', positionName: 'Right Back', x: 76, y: 30 },
        { positionId: 'LCM', positionName: 'Left Mid', x: 34, y: 55 },
        { positionId: 'RCM', positionName: 'Right Mid', x: 66, y: 55 },
        { positionId: 'ST', positionName: 'Striker', x: 50, y: 82 }
      ]
    },
    {
      name: '3-2-1 (Attacking)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LD', positionName: 'Left Back', x: 15, y: 42 },
        { positionId: 'CD', positionName: 'Center Back', x: 50, y: 30 },
        { positionId: 'RD', positionName: 'Right Back', x: 85, y: 42 },
        { positionId: 'LCM', positionName: 'Left Mid', x: 36, y: 55 },
        { positionId: 'RCM', positionName: 'Right Mid', x: 64, y: 55 },
        { positionId: 'ST', positionName: 'Striker', x: 50, y: 82 }
      ]
    },
    {
      name: '2-2-2 (Central)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LD', positionName: 'Left Defender', x: 30, y: 30 },
        { positionId: 'RD', positionName: 'Right Defender', x: 70, y: 30 },
        { positionId: 'LCM', positionName: 'Left Midfielder', x: 33, y: 55 },
        { positionId: 'RCM', positionName: 'Right Midfielder', x: 67, y: 55 },
        { positionId: 'LF', positionName: 'Left Forward', x: 30, y: 80 },
        { positionId: 'RF', positionName: 'Right Forward', x: 70, y: 80 }
      ]
    }
  ],
  '9v9': [
    {
      name: '3-3-2 (Classic Wide)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LD', positionName: 'Left Back', x: 25, y: 28 },
        { positionId: 'CD', positionName: 'Center Back', x: 50, y: 28 },
        { positionId: 'RD', positionName: 'Right Back', x: 75, y: 28 },
        { positionId: 'LM', positionName: 'Left Midfielder', x: 18, y: 52 },
        { positionId: 'CM', positionName: 'Central Midfielder', x: 50, y: 52 },
        { positionId: 'RM', positionName: 'Right Midfielder', x: 82, y: 52 },
        { positionId: 'LF', positionName: 'Left Forward', x: 33, y: 80 },
        { positionId: 'RF', positionName: 'Right Forward', x: 67, y: 80 }
      ]
    },
    {
      name: '4-3-1 (Defending)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LB', positionName: 'Left Back', x: 16, y: 32 },
        { positionId: 'LCB', positionName: 'Left Center Back', x: 38, y: 28 },
        { positionId: 'RCB', positionName: 'Right Center Back', x: 62, y: 28 },
        { positionId: 'RB', positionName: 'Right Back', x: 84, y: 32 },
        { positionId: 'LM', positionName: 'Left midfielder', x: 30, y: 48 },
        { positionId: 'CM', positionName: 'Center midfielder', x: 50, y: 60 },
        { positionId: 'RM', positionName: 'Right midfielder', x: 70, y: 48 },
        { positionId: 'ST', positionName: 'Striker', x: 50, y: 82 }
      ]
    },
     {
      name: '4-3-1 (Attacking)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LB', positionName: 'Left Back', x: 16, y: 40 },
        { positionId: 'LCB', positionName: 'Left Center Back', x: 38, y: 28 },
        { positionId: 'RCB', positionName: 'Right Center Back', x: 62, y: 28 },
        { positionId: 'RB', positionName: 'Right Back', x: 84, y: 40 },
        { positionId: 'LM', positionName: 'Left midfielder', x: 30, y: 60 },
        { positionId: 'CM', positionName: 'Center midfielder', x: 50, y: 48 },
        { positionId: 'RM', positionName: 'Right midfielder', x: 70, y: 60 },
        { positionId: 'ST', positionName: 'Striker', x: 50, y: 82 }
      ]
    },
    {
      name: '3-4-1 (Attacking Wingers)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LD', positionName: 'Left Def', x: 25, y: 28 },
        { positionId: 'CD', positionName: 'Center Def', x: 50, y: 28 },
        { positionId: 'RD', positionName: 'Right Def', x: 75, y: 28 },
        { positionId: 'LM', positionName: 'Left Wing Mid', x: 15, y: 52 },
        { positionId: 'LCM', positionName: 'Center Mid L', x: 38, y: 52 },
        { positionId: 'RCM', positionName: 'Center Mid R', x: 62, y: 52 },
        { positionId: 'RM', positionName: 'Right Wing Mid', x: 85, y: 52 },
        { positionId: 'ST', positionName: 'Striker', x: 50, y: 82 }
      ]
    }
  ],
  '11v11': [
    {
      name: '4-4-2 (Classic Flat)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LB', positionName: 'Left Back', x: 15, y: 25 },
        { positionId: 'LCB', positionName: 'Left Center Back', x: 38, y: 25 },
        { positionId: 'RCB', positionName: 'Right Center Back', x: 62, y: 25 },
        { positionId: 'RB', positionName: 'Right Back', x: 85, y: 25 },
        { positionId: 'LM', positionName: 'Left Midfielder', x: 15, y: 54 },
        { positionId: 'LCM', positionName: 'Left Center Mid', x: 38, y: 54 },
        { positionId: 'RCM', positionName: 'Right Center Mid', x: 62, y: 54 },
        { positionId: 'RM', positionName: 'Right Midfielder', x: 85, y: 54 },
        { positionId: 'LF', positionName: 'Left Forward', x: 33, y: 80 },
        { positionId: 'RF', positionName: 'Right Forward', x: 67, y: 80 }
      ]
    },
    {
      name: '4-3-3 (Modern Pivot)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LB', positionName: 'Left Back', x: 15, y: 32 },
        { positionId: 'LCB', positionName: 'Left Center Back', x: 38, y: 25 },
        { positionId: 'RCB', positionName: 'Right Center Back', x: 62, y: 25 },
        { positionId: 'RB', positionName: 'Right Back', x: 85, y: 32 },
        { positionId: 'LCM', positionName: 'Left Midfielder', x: 30, y: 52 },
        { positionId: 'CM', positionName: 'Holding Midfielder', x: 50, y: 48 },
        { positionId: 'RCM', positionName: 'Right Midfielder', x: 70, y: 52 },
        { positionId: 'LW', positionName: 'Left Winger', x: 18, y: 78 },
        { positionId: 'ST', positionName: 'Striker', x: 50, y: 82 },
        { positionId: 'RW', positionName: 'Right Winger', x: 82, y: 78 }
      ]
    },
    {
      name: '4-2-3-1 (Strategic Depth)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LB', positionName: 'Left Back', x: 15, y: 25 },
        { positionId: 'LCB', positionName: 'Left Center Back', x: 38, y: 25 },
        { positionId: 'RCB', positionName: 'Right Center Back', x: 62, y: 25 },
        { positionId: 'RB', positionName: 'Right Back', x: 85, y: 25 },
        { positionId: 'LDM', positionName: 'Left Defensive Mid', x: 34, y: 44 },
        { positionId: 'RDM', positionName: 'Right Defensive Mid', x: 66, y: 44 },
        { positionId: 'LAM', positionName: 'Left Attacking Mid', x: 24, y: 66 },
        { positionId: 'CAM', positionName: 'Central Attacking Mid', x: 50, y: 66 },
        { positionId: 'RAM', positionName: 'Right Attacking Mid', x: 76, y: 66 },
        { positionId: 'ST', positionName: 'Striker', x: 50, y: 82 }
      ]
    },
    {
      name: '3-5-2 (Wingbacks)',
      assignments: [
        { positionId: 'GK', positionName: 'Goalkeeper', x: 50, y: 12 },
        { positionId: 'LCB', positionName: 'Left Defender', x: 26, y: 25 },
        { positionId: 'CB', positionName: 'Central Defender', x: 50, y: 25 },
        { positionId: 'RCB', positionName: 'Right Defender', x: 74, y: 25 },
        { positionId: 'LWB', positionName: 'Left Wingback', x: 14, y: 48 },
        { positionId: 'LCM', positionName: 'Left Center Mid', x: 34, y: 54 },
        { positionId: 'CM', positionName: 'Holding Mid', x: 50, y: 48 },
        { positionId: 'RCM', positionName: 'Right Center Mid', x: 66, y: 54 },
        { positionId: 'RWB', positionName: 'Right Wingback', x: 86, y: 48 },
        { positionId: 'LF', positionName: 'Left Forward', x: 33, y: 80 },
        { positionId: 'RF', positionName: 'Right Forward', x: 67, y: 80 }
      ]
    }
  ]
};

// Slot tag shows the placed player's surname, falling back to their first name,
// and the position title when the slot is empty.
const getSlotTagLabel = (playerName: string | undefined | null, positionName: string) => {
  const parts = (playerName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return positionName;
  return parts[parts.length - 1];
};

// Drill thumbnails: which part of the image to show.
// Focus is "x y" (e.g. 'center', 'center 30%', 'left 70%').
// Zoom magnifies around that point (1 = no zoom, 1.5 = 50% closer).
const DRILL_THUMB_FOCUS = 'center 25%';
const DRILL_THUMB_ZOOM = 1;

// Labels drill images by the order they were added:
// 1st = Warm Up / Activation, 2nd = Drill 1, 3rd = Drill 2, and so on
const getDrillLabel = (index: number) =>
  index === 0 ? 'Warm Up / Activation' : `Drill ${index}`;

export default function FormationsTab({
  currentProfile,
  selectedTeamId,
  players,
  formations,
  onSaveFormation,
  onDeleteFormation,
  initialSelectedFormationId,
  teamSchedules = [],
  onAddSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  coachDrills = [],
  onAddCoachDrill,
  onDeleteCoachDrill,
  libraryDrills = [],
  onAddLibraryDrill,
  viewableChildren = [],
  selectedViewableChildId = null,
  onSelectViewableChild,
  assignments = [],
  runLogs = [],
  onStartRun,
  onOpenClassroom
}: FormationsTabProps) {
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

  const isCoach = currentProfile.role === 'coach';

  // Week schedule is shown for players and parents (the athlete's own feed).
  const showWeekSchedule = currentProfile.role === 'player' || currentProfile.role === 'parent';

  // The selected team is the controlling roster context for coaches.
  // coachId is used for authorization/linkage, but never to override the selected roster.
  const activeTeamId =
    selectedTeamId ||
    currentProfile.teamId ||
    currentProfile.teamIds?.[0] ||
    '';

  // Only players whose team_id matches the active team belong in this formation.
  const myTeamPlayers = players.filter(p => {
    if (p.role !== 'player') return false;
    return !!activeTeamId && matchKeys(p.teamId, activeTeamId);
  });

  // A player belongs on this pitch only when they are on this team's roster.
  // Sharing a coach must never pull in another squad; a linked player with no
  // team recorded still passes so legacy entries do not silently vanish.
  const isPlayerOnActiveTeam = (plRec: UserProfile | null | undefined): boolean => {
    if (!plRec) return false;
    if (matchKeys(plRec.teamId, activeTeamId)) return true;
    if (plRec.teamId) return false;
    return isCoach
      ? (matchKeys(plRec.coachId, currentProfile.coachId) || matchKeys(plRec.coachId, currentProfile.id))
      : false;
  };

  // Helper dictionary mapping playerId to PlayerProfile object
  const playersLookup = React.useMemo(() => {
    return players.reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, UserProfile>);
  }, [players]);

  // States
  const [selectedSystem, setSelectedSystem] = useState<string>('11v11');
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [formationName, setFormationName] = useState('Tactical Lineup');
  const [notes, setNotes] = useState('');
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  
  // Live editable assignments copy mapping positionId -> playerId | null
  const [liveAssignments, setLiveAssignments] = useState<Record<string, string | null>>({});
  
  // Active selected slot on the football field for player assignment dropdowns
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  // Substitutes: squad players who hold a position but are not in the starting formation
  const [benchAssignments, setBenchAssignments] = useState<BenchAssignment[]>([]);
  const [benchPickerPlayerId, setBenchPickerPlayerId] = useState<string | null>(null);

  // Captain selection: players wearing the captain badge in this lineup
  const [captains, setCaptains] = useState<string[]>([]);
  const [isCaptainMode, setIsCaptainMode] = useState(false);
  
  // Save Feedback state
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ---------------------------------------------------------
  // TEAM SCHEDULE WIDGET STATE
  // ---------------------------------------------------------
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);
  const [scheduleSuccessMsg, setScheduleSuccessMsg] = useState<string | null>(null);
  const [isScheduleFormExpanded, setIsScheduleFormExpanded] = useState(false);
  const [isTeamScheduleExpanded, setIsTeamScheduleExpanded] = useState(false);
  const [isSavedFormationsExpanded, setIsSavedFormationsExpanded] = useState(false);
  const [isAllSessionsExpanded, setIsAllSessionsExpanded] = useState(false);
  const [isSquadExpanded, setIsSquadExpanded] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 64rem)').matches && currentProfile.role === 'coach');

  // ---------------------------------------------------------
  // COACH DRILLS STATE
  // ---------------------------------------------------------
  const [selectedScheduleForDrills, setSelectedScheduleForDrills] = useState<string | null>(null);
  const [drillUrl, setDrillUrl] = useState('');
  const [isAddingDrill, setIsAddingDrill] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  // Full-image preview popup for drill thumbnails
  const [previewDrillUrl, setPreviewDrillUrl] = useState<string | null>(null);
  const [previewZoomed, setPreviewZoomed] = useState(false);

  React.useEffect(() => {
    if (!previewDrillUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewDrillUrl(null);
    };
    window.addEventListener('keydown', onKeyDown);
    // Lock background scrolling (page and root) while the popup is open
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [previewDrillUrl]);

  const activeTeamCoachDrills = React.useMemo(() => {
    return coachDrills.filter(drill => matchKeys(drill.teamId, activeTeamId));
  }, [coachDrills, activeTeamId]);

  const getSessionCoachDrills = (scheduleId: string) => {
    return activeTeamCoachDrills.filter(drill => matchKeys(drill.scheduleId, scheduleId));
  };

  const openDrillSelector = (scheduleId: string) => {
    setSelectedScheduleForDrills(scheduleId);
    setDrillUrl('');
    setDrillError(null);
  };

  const closeDrillSelector = () => {
    setSelectedScheduleForDrills(null);
    setDrillUrl('');
    setDrillError(null);
  };

  const handleAddCoachDrill = async () => {
    if (!selectedScheduleForDrills || !activeTeamId) return;
    if (!onAddCoachDrill) {
      setDrillError('Image URL saving is not connected yet.');
      return;
    }

    const url = drillUrl.trim();
    if (!url) {
      setDrillError('Please enter an image URL.');
      return;
    }

    try {
      new URL(url);
    } catch (_) {
      setDrillError('Please enter a valid image URL.');
      return;
    }

    setIsAddingDrill(true);
    setDrillError(null);

    try {
      await onAddCoachDrill({
        coachId: currentProfile.id,
        teamId: activeTeamId,
        scheduleId: selectedScheduleForDrills,
        url
      });

      closeDrillSelector();
    } catch (err: any) {
      console.error(err);
      setDrillError(err?.message || 'Could not save the drill image.');
    } finally {
      setIsAddingDrill(false);
    }
  };

  const handleDeleteCoachDrill = async (drillId: string) => {
    if (!onDeleteCoachDrill) return;

    try {
      await onDeleteCoachDrill(drillId);
    } catch (err: any) {
      console.error(err);
      setDrillError(err?.message || 'Could not remove the drill image.');
    }
  };

    // ---------------------------------------------------------
  // DRILL LIBRARY PICKER STATE
  // ---------------------------------------------------------
  const [libraryOpenForScheduleId, setLibraryOpenForScheduleId] = useState<string | null>(null);
  const [libraryAge, setLibraryAge] = useState<string>('All');
  const [libraryThemes, setLibraryThemes] = useState<string[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryAddingId, setLibraryAddingId] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!libraryOpenForScheduleId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLibraryOpenForScheduleId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [libraryOpenForScheduleId]);

  // Everything this coach may see: published library drills and this team's uploads
  const libraryBase = React.useMemo(
    () => libraryDrills.filter(d => d.isLibrary || matchKeys(d.teamId, activeTeamId)),
    [libraryDrills, activeTeamId]
  );

  // Age groups and themes are built from the drills, so new tags appear automatically
  const libraryAgeOptions = React.useMemo(() => {
    const set = new Set<string>();
    libraryBase.forEach(d => {
      const age = drillAgeGroup(d);
      if (age) set.add(age);
    });
    return Array.from(set).sort((a, b) => ageSortValue(a) - ageSortValue(b));
  }, [libraryBase]);

  // Themes sorted by how many drills use them
  const libraryThemeOptions = React.useMemo(() => {
    const counts = new Map<string, number>();
    libraryBase.forEach(d =>
      drillThemes(d).forEach(t => counts.set(t, (counts.get(t) || 0) + 1))
    );
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [libraryBase]);

  // Drill must match the chosen age group and every selected theme
  const visibleLibraryDrills = React.useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return libraryBase
      .filter(d => libraryAge === 'All' || drillAgeGroup(d) === libraryAge)
      .filter(d => {
        if (libraryThemes.length === 0) return true;
        const themes = drillThemes(d);
        return libraryThemes.every(t => themes.includes(t));
      })
      .filter(d =>
        !q ||
        d.title.toLowerCase().includes(q) ||
        drillThemes(d).some(t => t.toLowerCase().includes(q))
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [libraryBase, libraryAge, libraryThemes, librarySearch]);

  const toggleLibraryTheme = (name: string) => {
    setLibraryThemes(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
  };

  const clearLibraryFilters = () => {
    setLibraryAge('All');
    setLibraryThemes([]);
    setLibrarySearch('');
  };

  const handlePickLibraryDrill = async (drill: LibraryDrillRecord) => {
    if (!libraryOpenForScheduleId || !onAddLibraryDrill || !activeTeamId) return;
    setLibraryAddingId(drill.id);
    setLibraryError(null);
    try {
      await onAddLibraryDrill(drill, libraryOpenForScheduleId, activeTeamId);
      setLibraryOpenForScheduleId(null);
    } catch (err: any) {
      setLibraryError(err?.message || 'Could not add that drill.');
    } finally {
      setLibraryAddingId(null);
    }
  };
  
  const renderSessionDrillWidget = (schedule: TeamSchedule) => {
    const sessionDrills = getSessionCoachDrills(schedule.id);
    const isOpen = selectedScheduleForDrills === schedule.id;

    return (
      <div className="mt-3 w-full border-t border-slate-800 pt-3">
        <button
          type="button"
          onClick={() => {
            if (isOpen) {
              closeDrillSelector();
            } else {
              openDrillSelector(schedule.id);
            }
          }}
          className="w-full flex items-center justify-between gap-3 rounded-xl bg-sky-100 hover:bg-sky-300 border border-sky-300 px-3 py-2.5 transition cursor-pointer text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-[#00bbff]/20 flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-[#00bbff]" />
            </div>
            <div className="min-w-0">
              <span className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                SESSION PLAN
              </span>
              <span className="block text-[9px] font-mono text-slate-500 uppercase mt-0.5">
                {sessionDrills.length} image{sessionDrills.length === 1 ? '' : 's'} attached
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isCoach && (
              <span className="text-[8px] font-mono font-bold text-[#00bbff] uppercase tracking-wider">
                {isOpen ? 'Close' : 'Add / View'}
              </span>
            )}
            {isOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#00bbff]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#00bbff]" />
            )}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="pt-2 space-y-2.5">
                {sessionDrills.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {sessionDrills.map((drill, index) => (
                      <div
                        key={drill.id}
                        className="relative w-full min-w-0 overflow-hidden rounded-xl bg-slate-950 border border-slate-800"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewZoomed(false);
                            setPreviewDrillUrl(drill.url);
                          }}
                          className="block w-full aspect-video bg-slate-900 cursor-zoom-in group relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00bbff]/60"
                          title="Click to view full image"
                          aria-label="View full drill image"
                        >
                          <img
                            src={drill.url}
                            alt="Session drill"
                            className="w-full h-full object-cover transition group-hover:opacity-90"
                            style={{
                              objectPosition: DRILL_THUMB_FOCUS,
                              transform: `scale(${DRILL_THUMB_ZOOM})`,
                              transformOrigin: DRILL_THUMB_FOCUS
                            }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </button>

                        {isCoach && onDeleteCoachDrill && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCoachDrill(drill.id)}
                            className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-slate-950/90 border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 flex items-center justify-center transition"
                            title="Remove drill image"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <div className="px-2.5 py-2 border-t border-slate-800">
                          <p className="text-xs font-sans font-bold text-slate-100 uppercase tracking-wide truncate">
                            {getDrillLabel(index)}
                          </p>
                          <p className="text-[9px] text-slate-400 truncate mt-0.5" title={drill.url}>
                            {drill.url}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-3 py-4 text-center">
                    <FileText className="w-5 h-5 text-slate-700 mx-auto mb-2" />
                    <p className="text-[9px] font-mono text-slate-600 uppercase">
                      No drill images attached
                    </p>
                    {isCoach && (
                      <p className="text-[8px] text-slate-700 mt-1">
                        Add an image URL below to attach a drill to this session.
                      </p>
                    )}
                  </div>
                )}

                {isCoach && (
                  <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[9px] font-mono text-[#00bbff] uppercase tracking-wider">
                          Add Image URL
                        </p>
                        <p className="text-[8px] text-slate-600 mt-0.5">
                          Paste an image URL to attach a drill image to this session.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        value={drillUrl}
                        onChange={(e) => {
                          setDrillUrl(e.target.value);
                          setDrillError(null);
                        }}
                        placeholder="https://..."
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-[10px] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#00bbff]/40"
                      />

                      <button
                        type="button"
                        disabled={!drillUrl.trim() || isAddingDrill}
                        onClick={handleAddCoachDrill}
                        className="shrink-0 bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold px-3 py-2 rounded-lg text-[9px] uppercase tracking-wider disabled:opacity-50 transition"
                      >
                        {isAddingDrill ? 'Saving...' : 'Add URL'}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setLibraryError(null);
                        setLibraryOpenForScheduleId(schedule.id);
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 border border-[#00bbff]/30 px-3 py-2 text-[9px] font-mono font-bold uppercase tracking-wider text-[#00bbff] hover:bg-slate-850 transition"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Library
                    </button>
                    
                    {drillError && (
                      <div className="rounded-lg bg-rose-950/30 border border-rose-500/20 px-3 py-2 text-[9px] text-rose-300">
                        {drillError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  
  // Inline editing of an existing session (coaches only)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editScheduleDate, setEditScheduleDate] = useState('');
  const [editScheduleTime, setEditScheduleTime] = useState('');
  const [editScheduleLocation, setEditScheduleLocation] = useState('');

  const startEditSchedule = (s: TeamSchedule) => {
    setEditingScheduleId(s.id);
    setEditScheduleDate(s.sessionDate);
    setEditScheduleTime(s.sessionTime);
    setEditScheduleLocation(s.location || '');
  };

  const cancelEditSchedule = () => {
    setEditingScheduleId(null);
    setEditScheduleDate('');
    setEditScheduleTime('');
    setEditScheduleLocation('');
  };

  const saveEditedSchedule = () => {
    if (!editingScheduleId || !editScheduleDate || !editScheduleTime || !onUpdateSchedule) return;
    onUpdateSchedule(editingScheduleId, {
      sessionDate: editScheduleDate,
      sessionTime: editScheduleTime,
      location: editScheduleLocation.trim() || undefined,
    });
    cancelEditSchedule();
  };

  const renderScheduleEditForm = () => (
    <div className="bg-slate-950 border border-[#00bbff]/40 rounded-xl p-3.5 space-y-3">
      <div className="text-[10px] font-mono font-bold text-[#00bbff] uppercase tracking-wider flex items-center gap-1.5">
        <SquarePen className="w-3.5 h-3.5 shrink-0" />
        Edit Session
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">
            Session Date
          </label>
          <input
            type="date"
            value={editScheduleDate}
            onChange={(e) => setEditScheduleDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-[#00bbff]/50 transition"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">
            Session Time
          </label>
          <input
            type="time"
            value={editScheduleTime}
            onChange={(e) => setEditScheduleTime(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-[#00bbff]/50 transition"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">
            Location
          </label>
          <input
            type="text"
            value={editScheduleLocation}
            onChange={(e) => setEditScheduleLocation(e.target.value)}
            placeholder="e.g. Riverside Pitch"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium placeholder:text-slate-600 focus:outline-none focus:border-[#00bbff]/50 transition"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!editScheduleDate || !editScheduleTime}
          onClick={saveEditedSchedule}
          className="flex-1 bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs"
        >
          <Check className="w-3.5 h-3.5" />
          Save Changes
        </button>
        <button
          type="button"
          onClick={cancelEditSchedule}
          className="bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold py-2.5 px-4 rounded-xl transition text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const teamIdToFilterSchedule = activeTeamId;
  const myTeamSchedules = teamSchedules
    .filter(s => matchKeys(s.teamId, teamIdToFilterSchedule))
    .sort((a, b) => new Date(`${a.sessionDate}T${a.sessionTime}`).getTime() - new Date(`${b.sessionDate}T${b.sessionTime}`).getTime());

  // Sessions on the day being viewed remain visible through 11:59 PM,
  // even when the scheduled session time has already passed.
  const now = new Date();
  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');

  const currentAndFutureSchedules = myTeamSchedules.filter(s => s.sessionDate >= todayKey);
  const displayedSchedules = currentAndFutureSchedules.slice(0, 2);
  const remainingSchedules = currentAndFutureSchedules.slice(2);

  const handleSaveSchedule = async () => {
    if (!scheduleDate || !scheduleTime || !onAddSchedule) return;
    setIsScheduleSaving(true);
    try {
      onAddSchedule({
        coachId: currentProfile.id,
        teamId: teamIdToFilterSchedule,
        sessionDate: scheduleDate,
        sessionTime: scheduleTime,
        location: scheduleLocation.trim() || undefined,
      });
      setScheduleDate('');
      setScheduleTime('');
      setScheduleLocation('');
      setScheduleSuccessMsg('Schedule updated for your team.');
      setIsScheduleFormExpanded(false);
      setTimeout(() => setScheduleSuccessMsg(null), 3000);
    } finally {
      setIsScheduleSaving(false);
    }
  };

  const formatScheduleDisplay = (date: string, time: string) => {
    const d = new Date(`${date}T${time}`);
    return d.toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Scrolling effect for tactical/playbook animator scroll requests with interval retries and header offset
  React.useEffect(() => {
    if (sessionStorage.getItem('scroll_to_tactical_playbook') === 'true') {
      let attempts = 0;
      const interval = setInterval(() => {
        const el = document.getElementById('tactical-simulator-workspace');
        if (el) {
          clearInterval(interval);
          sessionStorage.removeItem('scroll_to_tactical_playbook');
          
          const headerOffset = 90;
          const elementPosition = el.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
        attempts++;
        if (attempts >= 40) {
          clearInterval(interval);
          sessionStorage.removeItem('scroll_to_tactical_playbook');
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, []);

  // List search or selected filters
  const [loadedFormationId, setLoadedFormationId] = useState<string | null>(null);
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Sync state with standard preset configurations
  const presetsAvailable = PRESET_FORMATIONS[selectedSystem] || [];
  const currentPreset = presetsAvailable[selectedPresetIndex] || presetsAvailable[0] || { name: '', assignments: [] };

  // Initialize or reset layout to selected preset template
  const applyPresetTemplate = (system: string, idx: number) => {
    setSelectedSystem(system);
    setSelectedPresetIndex(idx);
    const targetPreset = PRESET_FORMATIONS[system]?.[idx];
    if (targetPreset) {
      setFormationName(`Match Setup (${targetPreset.name.split(' ')[0]})`);
      const defaultMap: Record<string, string | null> = {};
      targetPreset.assignments.forEach(as => {
        defaultMap[as.positionId] = null;
      });
      setLiveAssignments(defaultMap);
      setBenchAssignments([]);
      setBenchPickerPlayerId(null);
      setCaptains([]);
      setIsCaptainMode(false);
      setLoadedFormationId(null);
    }
    setActiveSlotId(null);
  };

  // Populate loaded lineup configurations
  const loadSavedFormation = (f: TeamFormation) => {
    setLoadedFormationId(f.id);
    setSelectedSystem(f.system);
    setFormationName(f.name);
    setNotes(f.notes || '');
    
    const presetIndex = (PRESET_FORMATIONS[f.system] || []).findIndex(p => p.name === f.lineupName);
    if (presetIndex !== -1) {
      setSelectedPresetIndex(presetIndex);
    }

    const loadedMap: Record<string, string | null> = {};
    f.assignments.forEach(as => {
      const plRec = as.playerId ? playersLookup[as.playerId] : null;
      // Squad membership is decided by team, never by shared coach
      const isValidPlayer = isPlayerOnActiveTeam(plRec);
      loadedMap[as.positionId] = isValidPlayer ? as.playerId : null;
    });
    setLiveAssignments(loadedMap);
    setBenchAssignments(f.benchAssignments || []);
    setCaptains(f.captains || []);
    setIsCaptainMode(false);
    setBenchPickerPlayerId(null);
    setActiveSlotId(null);
  };

  // Assign player to active slot
  const assignPlayerToPosition = (positionId: string, playerId: string | null) => {
    setLiveAssignments(prev => {
      const next = { ...prev };
      if (playerId) {
        Object.keys(next).forEach(posK => {
          if (next[posK] === playerId) {
            next[posK] = null;
          }
        });
      }
      next[positionId] = playerId;
      return next;
    });
    // A player promoted to the starting lineup gives up their bench position
    if (playerId) {
      setBenchAssignments(prev => prev.filter(b => b.playerId !== playerId));
    }
    setActiveSlotId(null);
  };

  // Save changes to database collection
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formationName.trim()) {
      setErrorMsg('Please specify a title name for your setup.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const finalAssignmentsList: FormationAssignment[] = currentPreset.assignments.map(as => {
        const assignedId = liveAssignments[as.positionId] || null;
        const plRec = assignedId ? playersLookup[assignedId] : null;
        const isValidPlayer = isPlayerOnActiveTeam(plRec);
        return {
          positionId: as.positionId,
          positionName: as.positionName,
          x: as.x,
          y: as.y,
          playerId: isValidPlayer ? assignedId : null
        };
      });

      const effectiveTeamId = activeTeamId;
      if (!effectiveTeamId) {
        setErrorMsg('Your account is not linked to a team. Please contact your admin.');
        setIsSaving(false);
        return;
      }

      const formationPayload: Omit<TeamFormation, 'updatedAt'> = {
        id: loadedFormationId || generateUUID(),
        coachId: currentProfile.id,
        teamId: effectiveTeamId,
        name: formationName,
        system: selectedSystem,
        lineupName: currentPreset.name,
        assignments: finalAssignmentsList,
        benchAssignments,
        captains,
        notes: notes.trim()
      };

      await onSaveFormation(formationPayload);
      
      if (!loadedFormationId) {
        setLoadedFormationId(formationPayload.id);
      }

      setSuccessMsg('Tactical lineup successfully persisted! Ready for game day.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to save formation record to database.');
    } finally {
      setIsSaving(false);
    }
  };

  // A formation belongs to exactly one team; a player seeing another team's
  // lineup because they share a coach is the bug this guards against.
  const activeTeamFormations = React.useMemo(() => {
    return formations.filter(f => matchKeys(f.teamId, activeTeamId));
  }, [formations, activeTeamId]);

  // Whenever the active teamId changes, completely reset the builder state
  React.useEffect(() => {
    setLoadedFormationId(null);
    setHasAutoLoaded(false);
    setHasLoadedInitial(false);
    setConfirmDeleteId(null);
    setNotes('');
    setActiveSlotId(null);
    setBenchAssignments([]);
    setBenchPickerPlayerId(null);
    setCaptains([]);
    setIsCaptainMode(false);

    const teamFormations = formations.filter(f => matchKeys(f.teamId, activeTeamId));

    if (teamFormations.length === 0) {
      setSelectedSystem('11v11');
      setSelectedPresetIndex(0);
      setFormationName('Tactical Lineup');
      const defaultMap: Record<string, string | null> = {};
      const targetPreset = PRESET_FORMATIONS['11v11']?.[0];
      if (targetPreset) {
        targetPreset.assignments.forEach(as => {
          defaultMap[as.positionId] = null;
        });
      }
      setLiveAssignments(defaultMap);
    }
  }, [activeTeamId]);

  // Auto-load last saved team formation on mount or when formations list loads
  React.useEffect(() => {
    if (!hasAutoLoaded && activeTeamFormations.length > 0) {
      const sorted = [...activeTeamFormations].sort((a, b) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      const latest = sorted[0];
      if (latest) {
        loadSavedFormation(latest);
        setHasAutoLoaded(true);
      }
    }
  }, [activeTeamFormations, hasAutoLoaded]);

  // Load specific formation if loaded on request from the dashboard
  React.useEffect(() => {
    if (initialSelectedFormationId && activeTeamFormations.length > 0 && !hasLoadedInitial) {
      const match = activeTeamFormations.find(f => f.id === initialSelectedFormationId);
      if (match) {
        loadSavedFormation(match);
        setHasLoadedInitial(true);
        setHasAutoLoaded(true);
      }
    }
  }, [initialSelectedFormationId, activeTeamFormations, hasLoadedInitial]);

  // Check if player is assigned to any position in the loaded/active lineup
  const playerAssignmentDetails = () => {
    if (currentProfile.role !== 'player' || activeTeamFormations.length === 0) return null;
    
    const activeF = loadedFormationId 
      ? activeTeamFormations.find(f => f.id === loadedFormationId)
      : [...activeTeamFormations].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      
    if (!activeF) return null;

    const matchedPos = activeF.assignments.find(as => matchKeys(as.playerId, currentProfile.id));
    return matchedPos ? { position: matchedPos, formation: activeF } : { position: null, formation: activeF };
  };

  const plDetails = playerAssignmentDetails();

  // List of players currently placement status in the template configuration
  const placedPlayerIds = Object.values(liveAssignments).filter((id): id is string =>
    id !== null && isPlayerOnActiveTeam(playersLookup[id])
  );

  const unplacedPlayers = myTeamPlayers.filter(p => !placedPlayerIds.includes(p.id));

  // Bench records are keyed by playerId; a player can hold at most one bench position
  const benchByPlayerId = React.useMemo(() => {
    const map: Record<string, BenchAssignment> = {};
    benchAssignments.forEach(b => { map[b.playerId] = b; });
    return map;
  }, [benchAssignments]);

  const benchPlayerIds = benchAssignments.map(b => b.playerId);

  const assignPlayerToBench = (playerId: string, positionName: string) => {
    const trimmedName = positionName.trim();
    if (!trimmedName) return;
    setBenchAssignments(prev => [
      ...prev.filter(b => b.playerId !== playerId),
      { playerId, positionId: trimmedName, positionName: trimmedName }
    ]);
    setBenchPickerPlayerId(null);
  };

  const removePlayerFromBench = (playerId: string) => {
    setBenchAssignments(prev => prev.filter(b => b.playerId !== playerId));
  };

  // Players no longer on the active roster cannot keep the captain badge
  React.useEffect(() => {
    setCaptains(prev => {
      const next = prev.filter(id => myTeamPlayers.some(p => p.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [myTeamPlayers]);

  const toggleCaptain = (playerId: string) => {
    setCaptains(prev =>
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    );
  };

  // The slot whose player picker is open. The picker renders inside the field
  // frame instead of being anchored to the slot circle, so slots near the top or
  // side edges can no longer push the window outside the pitch and clip it.
  const activeSlotAssignment = activeSlotId
    ? currentPreset.assignments.find(as => as.positionId === activeSlotId) || null
    : null;
  const activeSlotPlayer = activeSlotId
    ? playersLookup[liveAssignments[activeSlotId] || ''] || null
    : null;

  React.useEffect(() => {
    if (!activeSlotId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveSlotId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSlotId]);

  return (
    <div className="space-y-6">
     {/* Header Banner */}
<div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden shadow-xl">
  <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none select-none">
    <Users className="w-64 h-64 text-sky-400" />
  </div>

  <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div className="w-full">
      <div className="hidden sm:flex items-center gap-2 mb-1.5">
        <span className="bg-sky-500/10 text-[#00bbff] border border-sky-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-bold">
          Tactics & Strategy
        </span>
        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-bold">
          Field Matcher
        </span>
      </div>

      <h1 className="text-2xl font-bold text-slate-100 text-center sm:text-left w-full">
        Locker Room
      </h1>
    </div>
  </div>
</div>

{/* Parent: choose which athlete's team and lineup to view */}
{viewableChildren.length > 1 && (
  <ChildSwitcher
    children={viewableChildren}
    activeId={selectedViewableChildId}
    onSelect={(id) => onSelectViewableChild?.(id)}
  />
)}

      {/* Player/parent: week schedule for the athlete's team plus assignments/runs */}
      {showWeekSchedule && (
        <WeekScheduleCalendar
          teamSchedules={teamSchedules}
          teamId={activeTeamId}
          assignments={assignments}
          runLogs={runLogs}
          matchKeys={matchKeys}
          onStartRun={onStartRun}
          onOpenClassroom={onOpenClassroom}
        />
      )}

      {/* Team Schedule Widget */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setIsTeamScheduleExpanded(!isTeamScheduleExpanded)}
          className="w-full flex items-center justify-between p-5 hover:bg-slate-850/40 transition text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-[#00bbff]/20 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-[#00bbff]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Team Practice Schedule
              </h2>
              <p className="text-[9px] font-mono text-slate-100 uppercase tracking-wider mt-0.5">
                {displayedSchedules.length > 0
                  ? `${displayedSchedules.length} upcoming session${displayedSchedules.length === 1 ? '' : 's'}`
                  : 'No upcoming sessions'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isCoach && (
              <span className="hidden sm:inline-flex text-[9px] font-mono text-slate-450 uppercase tracking-wider bg-slate-950 border border-slate-850 px-2 py-0.5 rounded-full">
                View Only
              </span>
            )}
            {isTeamScheduleExpanded ? (
              <ChevronUp className="w-4 h-4 text-[#00bbff]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#00bbff]" />
            )}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {isTeamScheduleExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 space-y-4">

                {/* Next Two Sessions */}
                <div className="pt-4 border-t border-slate-800 space-y-2">
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Next 2 Sessions
                  </div>

                  {displayedSchedules.length > 0 ? (
                    displayedSchedules.map((s, index) => (
                      editingScheduleId === s.id ? (
                        <div key={s.id}>{renderScheduleEditForm()}</div>
                      ) : (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 border border-slate-850 rounded-xl px-3.5 py-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-[#00bbff]/20 flex items-center justify-center shrink-0">
                            <Calendar className="w-3.5 h-3.5 text-[#00bbff]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                              {index === 0 ? 'Next Session' : 'Following Session'}
                            </p>
                            <p className="text-xs text-slate-100 font-semibold truncate">
                              {formatScheduleDisplay(s.sessionDate, s.sessionTime)}
                            </p>
                            {s.location && (
                              <p className="text-[10px] font-mono text-emerald-300/90 truncate flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {s.location}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.sessionDate === todayKey && (
                            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full shrink-0">
                              Today
                            </span>
                          )}
                          {isCoach && onUpdateSchedule && (
                            <button
                              type="button"
                              onClick={() => startEditSchedule(s)}
                              className="inline-icon-btn text-slate-500 hover:text-[#00bbff] p-1 transition shrink-0"
                              title="Edit session"
                            >
                              <SquarePen className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isCoach && onDeleteSchedule && (
                            <button
                              type="button"
                              onClick={() => onDeleteSchedule(s.id)}
                              className="inline-icon-btn inline-delete-btn text-slate-500 hover:text-rose-400 p-1 transition shrink-0"
                              title="Delete session"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {renderSessionDrillWidget(s)}
                      </div>
                      )
                    ))
                  ) : (
                    <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 text-center">
                      <p className="text-slate-500 text-xs italic">
                        No upcoming sessions have been scheduled yet.
                      </p>
                    </div>
                  )}
                </div>

                {/* Remaining Sessions Accordion */}
                {remainingSchedules.length > 0 && (
                  <div className="border-t border-slate-800 pt-3">
                    <button
                      type="button"
                      onClick={() => setIsAllSessionsExpanded(!isAllSessionsExpanded)}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-850 hover:bg-slate-850/50 transition text-left"
                    >
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" />
                        All Remaining Sessions
                        <span className="text-[9px] font-mono text-slate-500">
                          ({remainingSchedules.length})
                        </span>
                      </span>
                      {isAllSessionsExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#00bbff]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#00bbff]" />
                      )}
                    </button>

                    <AnimatePresence initial={false}>
                      {isAllSessionsExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2 space-y-2">
                            {remainingSchedules.map(s => (
                              editingScheduleId === s.id ? (
                                <div key={s.id}>{renderScheduleEditForm()}</div>
                              ) : (
                              <div
                                key={s.id}
                                className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 border border-slate-850/70 rounded-xl px-3 py-2.5"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                  <div className="min-w-0">
                                    <span className="block text-[11px] font-mono text-slate-400 truncate">
                                      {formatScheduleDisplay(s.sessionDate, s.sessionTime)}
                                    </span>
                                    {s.location && (
                                      <span className="text-[10px] font-mono text-emerald-300/80 truncate flex items-center gap-1">
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        {s.location}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {isCoach && (onUpdateSchedule || onDeleteSchedule) && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    {onUpdateSchedule && (
                                      <button
                                        type="button"
                                        onClick={() => startEditSchedule(s)}
                                        className="inline-icon-btn text-slate-500 hover:text-[#00bbff] p-1 transition shrink-0"
                                        title="Edit session"
                                      >
                                        <SquarePen className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {onDeleteSchedule && (
                                      <button
                                        type="button"
                                        onClick={() => onDeleteSchedule(s.id)}
                                        className="inline-icon-btn inline-delete-btn text-slate-500 hover:text-rose-400 p-1 transition shrink-0"
                                        title="Delete session"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                                {renderSessionDrillWidget(s)}
                              </div>
                              )
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Coach: Add New Session */}
                {isCoach && (
                  <div className="border-t border-slate-800 pt-3">
                    <button
                      type="button"
                      onClick={() => setIsScheduleFormExpanded(!isScheduleFormExpanded)}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-850 hover:bg-slate-850/50 transition text-left"
                    >
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-200">
                        <Plus className="w-3.5 h-3.5 text-[#00bbff]" />
                        Add New Session
                      </span>
                      {isScheduleFormExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#00bbff]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#00bbff]" />
                      )}
                    </button>

                    <AnimatePresence initial={false}>
                      {isScheduleFormExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="overflow-hidden space-y-4 pt-3"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">
                                Session Date
                              </label>
                              <input
                                type="date"
                                value={scheduleDate}
                                onChange={(e) => setScheduleDate(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-[#00bbff]/50 transition"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">
                                Session Time
                              </label>
                              <input
                                type="time"
                                value={scheduleTime}
                                onChange={(e) => setScheduleTime(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-[#00bbff]/50 transition"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">
                                Location
                              </label>
                              <input
                                type="text"
                                value={scheduleLocation}
                                onChange={(e) => setScheduleLocation(e.target.value)}
                                placeholder="e.g. Riverside Pitch"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium placeholder:text-slate-600 focus:outline-none focus:border-[#00bbff]/50 transition"
                              />
                            </div>
                          </div>

                          {scheduleSuccessMsg && (
                            <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl flex items-center gap-2.5 text-xs font-medium">
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              {scheduleSuccessMsg}
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={!scheduleDate || !scheduleTime || isScheduleSaving}
                            onClick={handleSaveSchedule}
                            className="w-full bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs shadow-md shadow-sky-500/10"
                          >
                            <Plus className="w-4 h-4" />
                            {isScheduleSaving ? 'Saving...' : 'Add to Schedule'}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Team Roster Widget */}
      <TeamRoster players={myTeamPlayers} isCoach={isCoach} />

      {/* Messages */}
      <AnimatePresence>
        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl flex items-start gap-3.5 text-xs font-medium"
          >
            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1">{successMsg}</div>
          </motion.div>
        )}

        {errorMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-rose-950/40 border border-rose-500/30 text-rose-400 p-4 rounded-xl flex items-start gap-3.5 text-xs font-medium"
          >
            <X className="w-4 h-4 text-rose-450 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMsg}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player starting alignment focus state card */}
      {!isCoach && plDetails && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-lg relative overflow-hidden">
          <div className="absolute right-0 bottom-0 pointer-events-none opacity-5 translate-x-4 translate-y-4">
            <Sparkles className="w-40 h-40 text-[#00bbff]" />
          </div>
          <div className="flex items-start gap-3.5 relative z-10">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-[#00bbff]/20 flex items-center justify-center shrink-0">
              <Star className="w-5 h-5 text-[#00bbff] fill-[#00bbff]/10" />
            </div>
            <div>
              <p className="text-slate-500 text-[10px] font-mono uppercase tracking-wider font-semibold">Active Lineup Placement</p>
              <h3 className="text-slate-900 font-bold text-sm mt-0.5">
                {plDetails.position 
                  ? `You are placed in the starting line-up as: ${plDetails.position.positionName} (${plDetails.position.positionId})` 
                  : 'You have been added to the game squad but are not placed on the starting sheet today.'}
              </h3>
              <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                Formations: <span className="text-[#00bbff] font-medium">{plDetails.formation.name}</span> ({plDetails.formation.system} - {plDetails.formation.lineupName}). 
                {plDetails.formation.notes && ` Strategy note: "${plDetails.formation.notes.slice(0, 100)}${plDetails.formation.notes.length > 100 ? '...' : ''}"`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Dynamic Layout Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Lineups Selector Sidebar.
            On phones this column is dissolved so its sections become direct
            items of the single-column stack and can be ordered around the
            match-setup column below. */}
          {/* Saved Formations List Box - COACH ONLY */}
          {isCoach && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden lg:col-span-4 lg:col-start-1 lg:row-start-1">
              <button
                type="button"
                onClick={() => setIsSavedFormationsExpanded(!isSavedFormationsExpanded)}
                className="w-full flex items-center justify-between p-5 hover:bg-slate-850/40 transition text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-[#00bbff]/20 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-[#00bbff]" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Saved Team Formations
                    </h2>
                    <p className="text-[9px] font-mono text-slate-100 uppercase tracking-wider mt-0.5">
                      {activeTeamFormations.length > 0
                        ? `${activeTeamFormations.length} saved lineup${activeTeamFormations.length === 1 ? '' : 's'}`
                        : 'No saved lineups'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isSavedFormationsExpanded ? (
                    <ChevronUp className="w-4 h-4 text-[#00bbff]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#00bbff]" />
                  )}
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isSavedFormationsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-5 pt-4 border-t border-slate-800">
              {activeTeamFormations.length === 0 ? (
                <div className="text-center py-8 px-4 bg-slate-950/40 rounded-xl border border-slate-850">
                  <Info className="w-8 h-8 text-slate-600 mx-auto mb-2.5" />
                  <p className="text-slate-400 text-xs font-semibold">No Formations Created</p>
                  <p className="text-slate-450 text-[11px] mt-1">
                    Use the builder on the right to set up and save your team's first lineup.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {activeTeamFormations.map((f) => {
                    const isCurrent = loadedFormationId === f.id;
                    const dateStr = new Date(f.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    return (
                      <div
                        key={f.id}
                        onClick={() => loadSavedFormation(f)}
                        className={`group p-3.5 rounded-xl border text-left cursor-pointer transition flex items-center justify-between gap-3 ${
                          isCurrent 
                            ? 'bg-sky-500/10 border-[#00bbff]/30 shadow-md shadow-sky-500/5' 
                            : 'bg-slate-950/40 border-slate-850 hover:bg-slate-850/50 hover:border-slate-800'
                        }`}
                      >
                        <div className="space-y-1 overflow-hidden">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-100 font-bold text-xs truncate max-w-[150px]">{f.name}</span>
                            <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider shrink-0">
                              {f.system}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-450 flex items-center gap-1">
                            <span>{f.lineupName}</span>
                            <span>•</span>
                            <span>{dateStr}</span>
                          </div>
                          {f.notes && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[180px]">
                              {f.notes}
                            </p>
                          )}
                        </div>
                        
                        {confirmDeleteId === f.id ? (
                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[9px] font-mono text-rose-400 font-bold uppercase tracking-wider">Delete?</span>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await onDeleteFormation(f.id);
                                  if (loadedFormationId === f.id) {
                                    setLoadedFormationId(null);
                                    setNotes('');
                                    applyPresetTemplate('11v11', 0);
                                  }
                                  setSuccessMsg('Tactical lineup deleted successfully.');
                                  setTimeout(() => setSuccessMsg(null), 3000);
                                } catch (err: any) {
                                  setErrorMsg(err.message || 'Could not delete formation.');
                                } finally {
                                  setConfirmDeleteId(null);
                                }
                              }}
                              className="bg-rose-550/90 hover:bg-rose-600 text-slate-100 font-bold px-2 py-1 rounded-lg text-[9px] uppercase tracking-wider transition cursor-pointer"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(null);
                              }}
                              className="bg-slate-800 hover:bg-slate-400 text-slate-350 font-bold px-2 py-1 rounded-lg text-[9px] uppercase tracking-wider transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(f.id);
                              }}
                              className="inline-icon-btn inline-delete-btn text-slate-400 hover:text-rose-400 p-1.5 hover:bg-rose-500/10 rounded-lg transition"
                              title="Delete Formation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className="w-3.5 h-3.5 text-[#00bbff] shrink-0" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          
          {/* Builder Options Form - Only editable for Coach */}
          {isCoach && (
            <div className="bg-slate-900 border border-slate-800 rounded-2.5xl shadow-lg overflow-hidden lg:col-span-4 lg:col-start-1 lg:row-start-2">
              {/* Accordion Toggle Header */}
              <div className="w-full flex items-center justify-between gap-2 p-5 text-xs font-bold text-slate-350 uppercase tracking-widest hover:bg-slate-850/30 transition-all duration-300 group">
                <button
                  type="button"
                  onClick={() => setIsFormExpanded(!isFormExpanded)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left"
                >
                  <Tag className="w-4 h-4 text-[#00bbff]" />
                  <span>Tactical Setup</span>
                  {isFormExpanded ? (
                    <ChevronUp className="w-4 h-4 text-[#00bbff] group-hover:text-sky-300 transition-colors shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#00bbff] group-hover:text-sky-300 transition-colors shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    applyPresetTemplate('11v11', 0);
                    setNotes('');
                    setIsFormExpanded(true);
                  }}
                  className="shrink-0 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider transition shadow-md shadow-emerald-500/10"
                  title="Start a new lineup"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Lineup
                </button>
              </div>

              <AnimatePresence initial={false}>
                {isFormExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <form onSubmit={handleSave} className="p-5 pt-0 border-t border-slate-850/40 space-y-4">
                      <div>
                        <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">Formation Title Name</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 4-3-3 Attacking, Cup Final Group"
                          value={formationName}
                          onChange={(e) => setFormationName(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-[#00bbff]/50 transition"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">Preset Game System</label>
                        <div className="grid grid-cols-5 gap-1.5">
                          {(['5v5', '6v6', '7v7', '9v9', '11v11'] as const).map((sys) => (
                            <button
                              key={sys}
                              type="button"
                              onClick={() => applyPresetTemplate(sys, 0)}
                              className={`text-[10px] font-mono py-2 rounded-lg border text-center transition ${
                                selectedSystem === sys 
                                  ? 'bg-[#00bbff]/10 text-[#00bbff] border-[#00bbff]/30 font-bold' 
                                  : 'bg-slate-950 text-slate-400 border-slate-850 hover:bg-slate-850'
                              }`}
                            >
                              {sys}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">Lineup Shape Configuration</label>
                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                          {presetsAvailable.map((preset, idx) => (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => applyPresetTemplate(selectedSystem, idx)}
                              className={`w-full text-left p-2.5 rounded-lg border text-xs transition flex items-center justify-between ${
                                selectedPresetIndex === idx 
                                  ? 'bg-[#00bbff]/5 text-slate-100 border-[#00bbff]/20 font-bold' 
                                  : 'bg-slate-950/60 text-slate-400 border-slate-850 hover:bg-slate-850'
                              }`}
                            >
                              <span>{preset.name}</span>
                              <span className="text-[10px] text-slate-450 font-normal">
                                {preset.assignments.length} positions
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-mono text-[#00bbff] uppercase mb-1.5">Squad Strategy Notes</label>
                        <textarea
                          rows={3}
                          placeholder="e.g. Build out from back, press high on corners, coordinate striker passes..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="w-full bg-[#020617] border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-[#00bbff]/50 leading-relaxed transition"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs shadow-md shadow-sky-500/10"
                      >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving Lineup...' : loadedFormationId ? 'Update Formation Plan' : 'Save Formation Plan'}
                      </button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

        {/* RIGHT COLUMN: Football Field & Position Assignments */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col items-center lg:col-span-8 lg:col-start-5 lg:row-start-1 lg:row-span-5">
          
          <div className="w-full flex justify-between items-center mb-4.5">
            <div>
              <h2 className="text-sm font-bold text-slate-100 tracking-tight">
                {formationName}
              </h2>
              <p className="text-[10px] font-mono text-slate-450 uppercase mt-0.5">
                Cohort Format: {selectedSystem} • System Config: <span className="text-[#00bbff] font-bold">{currentPreset.name}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {notes && (
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-xl shrink-0 max-w-[200px] sm:max-w-sm">
                  <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[10px] text-slate-400 truncate tracking-wide" title={notes}>
                    {notes}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                className="w-8 h-8 rounded-xl bg-slate-950 hover:bg-slate-850 border border-slate-850 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
                title="Strategic Guide Help"
              >
                <Info className="w-4 h-4 text-white bg-sky-400 rounded-md" />
              </button>
            </div>
          </div>

          {/* DRAG-AND-POSITION FIELD CANVAS CONTAINER */}
          <div className="w-full aspect-[4/5] max-w-[550px] bg-[#143d1a] border-4 border-slate-800/80 rounded-2xl relative overflow-hidden shadow-2xl p-4 flex flex-col justify-between">
            {/* Field Grass Visual Overlay with alternating mowing stripes */}
            <div className="absolute inset-0 flex flex-col opacity-[0.16] pointer-events-none select-none">
              {Array.from({ length: 12 }).map((_, i) => (
                <div 
                  key={i} 
                  className={`flex-1 w-full ${i % 2 === 0 ? 'bg-emerald-900' : 'bg-[#0f2913]'}`} 
                />
              ))}
            </div>

            {/* Soccer Pitch Markings */}
            <div className="absolute inset-x-0 inset-y-0 pointer-events-none select-none z-0 p-3 opacity-60">
              <svg className="w-full h-full text-white/50" viewBox="0 0 100 120" fill="none" stroke="currentColor" strokeWidth="0.5">
                <rect x="1" y="1" width="98" height="118" />
                <line x1="1" y1="60" x2="99" y2="60" />
                <circle cx="50" cy="60" r="14" />
                <circle cx="50" cy="60" r="0.8" fill="currentColor" />

                <rect x="25" y="1" width="50" height="18" />
                <rect x="37" y="1" width="26" height="6" />
                <circle cx="50" cy="13" r="0.8" fill="currentColor" />
                <path d="M 40 19 A 10 10 0 0 0 60 19" />
                <rect x="44" y="-1" width="12" height="2" opacity="0.3" />

                <rect x="25" y="101" width="50" height="18" />
                <rect x="37" y="113" width="26" height="6" />
                <circle cx="50" cy="107" r="0.8" fill="currentColor" />
                <path d="M 40 101 A 10 10 0 0 1 60 101" />
                <rect x="44" y="119" width="12" height="2" opacity="0.3" />

                <path d="M 1 5 A 4 4 0 0 0 5 1" />
                <path d="M 95 1 A 4 4 0 0 0 99 5" />
                <path d="M 1 115 A 4 4 0 0 0 5 119" />
                <path d="M 95 119 A 4 4 0 0 0 99 115" />
              </svg>
            </div>

            {/* DYNAMIC POSITION NODES LAYER */}
            <div className="absolute inset-x-0 inset-y-0 z-10 p-3">
              {currentPreset.assignments.map((as) => {
                const assignedPlayerId = liveAssignments[as.positionId];
                const playerObj = assignedPlayerId ? playersLookup[assignedPlayerId] : null;
                const isSelectedSlot = activeSlotId === as.positionId;
                const isProfilePlayer = assignedPlayerId === currentProfile.id;
                const isCaptain = !!assignedPlayerId && captains.includes(assignedPlayerId);

                return (
                  <div
                    key={as.positionId}
                    style={{
                      left: `${as.x}%`,
                      bottom: `${as.y}%`,
                      transform: 'translate(-50%, 50%)',
                      zIndex: isSelectedSlot ? 50 : 20
                    }}
                    className="absolute"
                  >
                    <div className="relative flex flex-col items-center">
                      
                      <button
                        type="button"
                        disabled={!isCoach}
                        onClick={() => setActiveSlotId(isSelectedSlot ? null : as.positionId)}
                        className={`w-11 h-11 sm:w-13 sm:h-13 rounded-full flex flex-col items-center justify-center transition border-2 shadow-xl ${
                          isProfilePlayer 
                            ? 'bg-[#00bbff] border-white text-slate-950 scale-110 ring-4 ring-sky-400/30' 
                            : playerObj 
                              ? 'bg-white hover:bg-sky-50 text-slate-900 border-[#00bbff]' 
                              : 'bg-emerald-650 hover:bg-emerald-500 text-emerald-100 border-white/60 border-dashed'
                        }`}
                      >
                        <span className="text-[10px] sm:text-xs font-bold leading-none tracking-tight">
                          {as.positionId}
                        </span>
                        
                        <span className="text-[7.5px] font-mono opacity-80 uppercase leading-none mt-0.5">
                          {playerObj ? 'ON' : 'OPEN'}
                        </span>
                      </button>

                      {isCaptain && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold font-mono flex items-center justify-center border-2 border-slate-950 shadow-lg z-10">
                          C
                        </span>
                      )}

                      <div className="absolute top-full left-1/2 -translate-x-1/2 flex justify-center pt-1 pointer-events-none select-none">
                        <span className={`inline-block max-w-[124px] truncate text-center text-[9px] sm:text-[10.5px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold tracking-wide uppercase border shadow-md ${
                          isProfilePlayer
                            ? 'bg-amber-400 text-slate-950 border-amber-500'
                            : playerObj
                              ? 'bg-white text-slate-800 border-slate-300'
                              : 'bg-emerald-900/90 text-emerald-300 border-emerald-800'
                        }`}>
                          {getSlotTagLabel(playerObj?.name, as.positionName)}
                        </span>
                      </div>

                      <AnimatePresence>
                        {isSelectedSlot && isCoach && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="absolute -top-1 -right-1 z-30"
                          >
                            <span className="w-4 h-4 rounded-full bg-[#00bbff] border-2 border-slate-950 shadow-md block" />
                          </motion.div>
                        )}
                      </AnimatePresence>

                    </div>
                  </div>
                );
              })}
            </div>

            {/* Player picker overlay: kept inside the pitch frame so every slot,
                including the ones on the top and side edges, stays reachable */}
            <AnimatePresence>
              {isCoach && activeSlotAssignment && (
                <motion.div
                  key="slot-picker"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-40 flex items-center justify-center p-3"
                >
                  <div
                    className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"
                    onClick={() => setActiveSlotId(null)}
                  />

                  <motion.div
                    initial={{ scale: 0.94, y: 8 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.94, y: 8 }}
                    className="relative w-full max-w-[260px] max-h-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 shadow-2xl flex flex-col"
                  >
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-450 uppercase pb-1.5 border-b border-slate-900 px-1">
                      <span>Place a Player</span>
                      <span className="text-[#00bbff] font-bold">{activeSlotAssignment.positionId}</span>
                    </div>

                    <div className="overflow-y-auto space-y-1 pt-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                      {activeSlotPlayer && (
                        <button
                          type="button"
                          onClick={() => assignPlayerToPosition(activeSlotAssignment.positionId, null)}
                          className="w-full text-left p-1.5 hover:bg-rose-500/10 hover:text-rose-200 text-rose-300 font-bold text-[10.5px] rounded transition flex items-center justify-between group"
                        >
                          <span>Remove {activeSlotPlayer.name}</span>
                          <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        </button>
                      )}

                      {unplacedPlayers.length === 0 ? (
                        <p className="text-[10px] text-slate-450 italic p-2 text-center">
                          All roster players are placed on the pitch grid templates.
                        </p>
                      ) : (
                        unplacedPlayers.map((pl) => (
                          <button
                            key={pl.id}
                            type="button"
                            onClick={() => assignPlayerToPosition(activeSlotAssignment.positionId, pl.id)}
                            className="w-full text-left p-1.5 hover:bg-[#00bbff]/10 hover:text-slate-100 text-[#00bbff] text-[10.5px] rounded transition flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <span className="truncate text-slate-200">{pl.name}</span>
                            </div>
                            <UserPlus className="w-3.5 h-3.5 text-[#00bbff] shrink-0 opacity-0 group-hover:opacity-100" />
                          </button>
                        ))
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSlotId(null)}
                      className="mt-2 w-full bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-bold py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition shrink-0"
                    >
                      Close
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* Squad Selection: starters on the pitch, named substitutes on the bench */}
          <div className="w-full mt-6 bg-slate-950/40 border border-slate-850 rounded-2xl p-4.5">
            <div className="w-full flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsSquadExpanded(!isSquadExpanded)}
                className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
              >
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-450" />
                  Squad Selection ({placedPlayerIds.length} starters · {benchAssignments.length} subs)
                </h3>
                {isSquadExpanded ? (
                  <ChevronUp className="w-4 h-4 text-[#00bbff] shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#00bbff] shrink-0" />
                )}
              </button>

              {isCoach && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSquadExpanded(true);
                    setIsCaptainMode(prev => !prev);
                    setBenchPickerPlayerId(null);
                  }}
                  aria-pressed={isCaptainMode}
                  title="Select your captain"
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-mono font-bold uppercase tracking-wider transition ${
                    isCaptainMode
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900 text-amber-300 border-amber-500/30 hover:bg-amber-500/10'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Captain
                  {captains.length > 0 && (
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[9px] ${
                      isCaptainMode ? 'bg-slate-950/20 text-slate-900' : 'bg-amber-500/15 text-amber-300'
                    }`}>
                      {captains.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            <AnimatePresence initial={false}>
              {isCoach && isCaptainMode && (
                <motion.div
                  key="captain-hint"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5">
                    <Info className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-mono text-amber-200 uppercase tracking-wider leading-relaxed">
                      Select your captain. Tap a player below to add or remove their C badge.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {isSquadExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mt-1 mb-3">
              {isCoach
                ? isCaptainMode
                  ? 'Captain mode · tap a player to add or remove their C badge'
                  : 'Tap a squad member to set their position as a substitute'
                : 'Green circle is on the pitch · amber circle is a named substitute'}
            </p>

            {myTeamPlayers.length === 0 ? (
              <p className="text-slate-450 text-xs italic">
                No verified players are assigned to your team roster yet. Players can link on onboarding screens.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {myTeamPlayers.map(p => {
                  const positionKey = Object.keys(liveAssignments).find(k => liveAssignments[k] === p.id);
                  const isPlaced = !!positionKey;
                  const benchRecord = benchByPlayerId[p.id];
                  const isBench = !!benchRecord;
                  const isCaptain = captains.includes(p.id);
                  const canEdit = isCoach && !isPlaced;
                  const canTap = isCaptainMode ? isCoach : canEdit;

                  return (
                    <div key={p.id} className="relative">
                      <button
                        type="button"
                        disabled={!canTap}
                        onClick={() => {
                          if (isCaptainMode) {
                            toggleCaptain(p.id);
                            return;
                          }
                          setBenchPickerPlayerId(benchPickerPlayerId === p.id ? null : p.id);
                        }}
                        className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-2 transition ${
                          isCaptainMode
                            ? isCaptain
                              ? 'bg-amber-400/15 text-amber-100 border-amber-400/60 cursor-pointer'
                              : 'bg-slate-900 text-slate-400 border-slate-850 cursor-pointer hover:border-amber-400/50'
                            : isPlaced
                              ? 'bg-[#00bbff]/5 text-sky-300 border-sky-500/20 shadow-sm cursor-default'
                              : isBench
                                ? 'bg-amber-500/5 text-amber-200 border-amber-500/25 cursor-pointer hover:border-amber-400/50'
                                : 'bg-slate-900 text-slate-400 border-slate-850 cursor-pointer hover:border-[#00bbff]/40'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${
                          isPlaced ? 'bg-[#00bbff]' : isBench ? 'bg-amber-400' : 'bg-slate-600'
                        }`} />
                        <span className="font-medium text-slate-200">{p.name}</span>
                        {isCaptain && (
                          <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 text-[9px] font-bold font-mono flex items-center justify-center shrink-0">
                            C
                          </span>
                        )}
                        {isPlaced && (
                          <span className="text-[9.5px] bg-[#00bbff]/15 text-[#00bbff] px-1.5 py-0.2 rounded uppercase font-bold font-mono">
                            {positionKey}
                          </span>
                        )}
                        {isBench && (
                          <span className="text-[9.5px] bg-amber-500/15 text-amber-300 px-1.5 py-0.2 rounded uppercase font-bold font-mono">
                            {benchRecord.positionId}
                          </span>
                        )}
                        {canEdit && !isCaptainMode && (
                          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${
                            benchPickerPlayerId === p.id ? 'rotate-180 text-[#00bbff]' : 'text-slate-500'
                          }`} />
                        )}
                      </button>

                      {isCoach && !isCaptainMode && benchPickerPlayerId === p.id && (
                        <div className="absolute bottom-full mb-1.5 left-0 z-40 w-[260px] bg-slate-950 border border-slate-800 rounded-xl p-2.5 shadow-2xl space-y-2">
                          <div className="text-[9px] font-mono text-slate-450 uppercase tracking-wider">
                            Position (substitute, not in starting XI)
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {currentPreset.assignments.map(as => (
                              <button
                                key={as.positionId}
                                type="button"
                                onClick={() => assignPlayerToBench(p.id, as.positionName)}
                                className="text-[10px] bg-slate-900 hover:bg-[#00bbff]/10 hover:text-[#00bbff] text-slate-300 border border-slate-800 px-2 py-1 rounded-lg transition"
                              >
                                {as.positionId}
                              </button>
                            ))}
                          </div>

                          <input
                            type="text"
                            placeholder="Or type a position, then Enter"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                assignPlayerToBench(p.id, e.currentTarget.value);
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#00bbff]/50 transition"
                          />

                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            {isBench ? (
                              <button
                                type="button"
                                onClick={() => {
                                  removePlayerFromBench(p.id);
                                  setBenchPickerPlayerId(null);
                                }}
                                className="text-[10px] text-rose-400 hover:text-rose-300 font-bold transition flex items-center gap-1"
                              >
                                <X className="w-3 h-3" />
                                Remove from bench
                              </button>
                            ) : (
                              <span className="text-[9px] font-mono text-slate-500 uppercase">
                                Bench only
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setBenchPickerPlayerId(null)}
                              className="text-[10px] text-slate-450 hover:text-slate-200 transition"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {benchAssignments.length > 0 && (
              <p className="text-[10px] text-slate-450 mt-3 leading-relaxed">
                <b className="text-amber-300">Substitutes:</b>{' '}
                {benchAssignments
                  .map(b => `${playersLookup[b.playerId]?.name || 'Unknown player'} (${b.positionId})`)
                  .join(', ')}
              </p>
            )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Action Save/Update Button at the bottom of Right Column */}
          {isCoach && (
            <div className="w-full mt-6">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSave()}
                className="w-full bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs shadow-md shadow-sky-500/10 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving Lineup...' : loadedFormationId ? 'Update Formation Plan' : 'Save Formation Plan'}
              </button>
            </div>
          )}

        </div>

      </div>

      {isCoach && <HomeVsAway />}

      {isCoach && (
        <LineupCreator
          system={selectedSystem}
          formationName={formationName}
          starters={currentPreset.assignments.map(as => {
            const pid = liveAssignments[as.positionId];
            const plRec = pid ? playersLookup[pid] : null;
            return plRec ? { id: plRec.id, name: plRec.name, avatarUrl: plRec.avatarUrl } : null;
          })}
        />
      )}

      {isCoach && (
        <PlayOfTheGame
          candidates={myTeamPlayers.map(p => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl }))}
        />
      )}

      {/* Tactical Animation Playbook & Drill Simulator Widget */}
      <TacticalAnimator currentProfile={currentProfile} />

      {/* Strategic Guide Modal */}
      <AnimatePresence>
        {isGuideOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGuideOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl z-10 space-y-4"
            >
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="inline-icon-btn absolute right-4 top-4 text-slate-400 hover:text-slate-250 p-2 hover:bg-slate-800/50 rounded-xl transition-colors cursor-pointer"
                title="Close Modal"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-850/60">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <Info className="w-4 h-4 text-rose-450" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm tracking-wide">
                    Strategic Guide Setup
                  </h3>
                  <p className="text-[10px] font-mono text-slate-450 uppercase">
                    Tactical Help & Directives
                  </p>
                </div>
              </div>

              <div className="text-xs leading-relaxed text-slate-350 space-y-3.5 pt-1">
                <p>
                  By laying out your team on a physical field model, players can view their assigned starting spot and tactical focus in advance of competition.
                </p>
                <ul className="list-disc pl-4 space-y-2 text-[11px] text-slate-400">
                  <li>Choose a cohort format (from <b className="text-slate-200">5v5</b> small-sided to <b className="text-slate-200">11v11</b> full-court).</li>
                  <li>{isCoach ? 'Tap position spots on the grass to pick and lock a player.' : 'Position tags display player name and assigned role details.'}</li>
                  <li>{isCoach ? 'Tap a squad member below the pitch to give them a substitute position without adding them to the starting lineup.' : 'Players on the pitch are the starting lineup; substitutes are listed below it.'}</li>
                  <li>Read strategy annotations listed to match targeted directives.</li>
                </ul>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(false)}
                  className="bg-slate-950 hover:bg-slate-850 text-slate-300 font-bold py-2 px-5 rounded-xl text-xs border border-slate-800 transition cursor-pointer"
                >
                  Got it!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

            {/* Drill library picker: choose an existing drill for this session */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {libraryOpenForScheduleId && (
              <motion.div
                key="drill-library"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                role="dialog"
                aria-modal="true"
                aria-label="Drill library"
                className="fixed inset-0 overflow-y-auto overscroll-contain bg-black/70 backdrop-blur-sm"
                style={{ zIndex: 2147483000 }}
                onClick={() => setLibraryOpenForScheduleId(null)}
              >
                <div className="min-h-full flex items-center justify-center p-3 sm:p-6">
                  <motion.div
                    initial={{ scale: 0.96, y: 12, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.96, y: 12, opacity: 0 }}
                    transition={{ type: 'spring', duration: 0.35 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl"
                  >
                    <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-800">
                      <div>
                        <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Session plan</p>
                        <h3 className="text-lg font-bold text-slate-100">Drill Library</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLibraryOpenForScheduleId(null)}
                        className="p-2 rounded-xl hover:bg-slate-800/50 transition cursor-pointer"
                        aria-label="Close drill library"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-5 space-y-5">
                      {/* Search */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={librarySearch}
                          onChange={(e) => setLibrarySearch(e.target.value)}
                          placeholder="Search drills by name or theme..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#00bbff]/50"
                        />
                      </div>

                      {/* Age group: pick one */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Age group</p>
                        <div className="flex flex-wrap gap-1.5">
                          {['All', ...libraryAgeOptions].map(age => {
                            const selected = libraryAge === age;
                            return (
                              <button
                                key={age}
                                type="button"
                                onClick={() => setLibraryAge(age)}
                                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold font-mono transition cursor-pointer ${
                                  selected
                                    ? 'bg-[#00bbff] border-[#00bbff] text-slate-950'
                                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-[#00bbff]/50'
                                }`}
                              >
                                {age}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Themes: pick several */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                            Themes {libraryThemes.length > 0 && `(${libraryThemes.length} selected, drill must match all)`}
                          </p>
                          {(libraryAge !== 'All' || libraryThemes.length > 0 || librarySearch) && (
                            <button
                              type="button"
                              onClick={clearLibraryFilters}
                              className="text-[10px] font-mono font-bold text-[#00bbff] hover:underline cursor-pointer"
                            >
                              Clear filters
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {libraryThemeOptions.length === 0 ? (
                            <p className="text-[11px] text-slate-500 italic">No themes yet. Add tags, focus or category to your drills.</p>
                          ) : (
                            libraryThemeOptions.map(({ name, count }) => {
                              const selected = libraryThemes.includes(name);
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => toggleLibraryTheme(name)}
                                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                                    selected
                                      ? 'bg-[#00bbff] border-[#00bbff] text-slate-950'
                                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-[#00bbff]/50'
                                  }`}
                                >
                                  {name}
                                  <span className={`ml-1.5 font-mono text-[9px] ${selected ? 'opacity-80' : 'text-slate-500'}`}>
                                    {count}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <p className="text-[10px] font-mono text-slate-500">
                        Showing {visibleLibraryDrills.length} of {libraryBase.length} drills
                      </p>

                      {libraryError && (
                        <div className="rounded-lg bg-rose-950/30 border border-rose-500/20 px-3 py-2 text-[10px] text-rose-300">
                          {libraryError}
                        </div>
                      )}

                      {/* Results */}
                      {visibleLibraryDrills.length === 0 ? (
                        <div className="text-center py-10 border-2 border-dashed border-slate-800 rounded-xl">
                          <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                          <p className="text-xs text-slate-400 font-mono">No drills match these filters</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
                          {visibleLibraryDrills.map(drill => {
                            const age = drillAgeGroup(drill);
                            const themes = drillThemes(drill);
                            return (
                              <div
                                key={drill.id}
                                className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden flex flex-col"
                              >
                                <div className="aspect-video bg-slate-900">
                                  <img
                                    src={drill.imageUrl}
                                    alt={drill.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                </div>
                                <div className="p-3 flex-1 flex flex-col gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-100 truncate">{drill.title}</p>
                                    <p className="text-[9px] font-mono text-slate-500 uppercase truncate">
                                      {[age, drill.isLibrary ? null : 'Team upload'].filter(Boolean).join(' · ') || 'No age group'}
                                    </p>
                                  </div>
                                  {themes.length > 0 && (
                                    <p className="text-[10px] text-slate-400 truncate">{themes.join(' · ')}</p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={libraryAddingId !== null}
                                    onClick={() => handlePickLibraryDrill(drill)}
                                    className="mt-auto w-full bg-[#00bbff] hover:bg-[#009be0] text-slate-950 font-bold py-2 rounded-lg text-[9px] uppercase tracking-wider disabled:opacity-50 transition"
                                  >
                                    {libraryAddingId === drill.id ? 'Adding...' : 'Add to session'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      
      {/* Drill Image Preview Popup (portaled to <body> so it always sits above every widget) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {previewDrillUrl && (
              <motion.div
                key="drill-preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                role="dialog"
                aria-modal="true"
                aria-label="Drill image preview"
                // The overlay itself scrolls; wheel/touch never reaches the page behind it.
                className="fixed inset-0 overflow-auto overscroll-contain bg-black/85 backdrop-blur-sm"
                style={{ zIndex: 2147483647, WebkitOverflowScrolling: 'touch' }}
                onClick={() => setPreviewDrillUrl(null)}
              >
                {/* Close button: always reachable at top-right */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewDrillUrl(null);
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
                      src={previewDrillUrl}
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
