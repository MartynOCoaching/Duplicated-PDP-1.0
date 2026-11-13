/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, BookOpen, User, Users, Landmark, Award, Database, Settings, Circle as HelpCircle, Flame, Droplet, Star, Calendar, RefreshCw, CloudLightning, Wifi, DatabaseZap, LogOut, LayoutDashboard, GraduationCap, Trophy, Shirt } from 'lucide-react';
import {
  UserProfile,
  Association,
  Club,
  Team,
  Coach,
  Player,
  RunLog,
  DailyMetrics,
  ClassroomSession,
  ModuleCompletion,
  Assignment,
  OrgProfileRequest,
  UserRole,
  TeamFormation,
  HydrationLog,
  TeamSchedule,
  SessionAttendance
} from './types';
import {
  INITIAL_ASSOCIATIONS,
  INITIAL_CLUBS,
  INITIAL_TEAMS,
  INITIAL_COACHES,
  CLIENT_DEMO_USERS,
  INITIAL_REQUESTS,
  INITIAL_ASSIGNMENTS
} from './data';

import PlayerDashboard from './components/PlayerDashboard';
import ClassroomTab from './components/ClassroomTab';
import CoachesDashboard from './components/CoachesDashboard';
import AdminDashboard from './components/AdminDashboard';
import AssociationDashboard from './components/AssociationDashboard';
import AuthScreen from './components/AuthScreen';
import CoachOnboarding from './components/CoachOnboarding';
import LeaderboardTab from './components/LeaderboardTab';
import FormationsTab from './components/FormationsTab';
import ParentDashboard from './components/ParentDashboard';
import ProfileTab from './components/ProfileTab';
import { useProfileAvatar } from './components/Useprofileavata';

import type { PlayerEvaluationRecord, PlayerEvaluationInput } from './components/PlayerEvaluationModal';
import firebaseConfig from '../firebase-applet-config.json';
import { supabaseService, testSupabaseConnection, SUPABASE_SQL_SETUP, supabase, generateUUID, sanitizeUUID } from './supabase';

interface CoachDrillRecord {
  id: string;
  coachId: string;
  teamId: string;
  scheduleId: string;
  url: string;
  drillId?: string; // set when the session drill was picked from the library
}

interface LibraryDrillRecord {
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

const isMockFirebase = !firebaseConfig.projectId || firebaseConfig.projectId === 'remixed-project-id' || firebaseConfig.apiKey.includes('remixed');

// Firebase Client Imports
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { 
  signInAnonymously, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc,
  getDocs, 
  writeBatch, 
  getDocFromServer,
  deleteDoc
} from 'firebase/firestore';

// Helper for initial player metrics seed
const INITIAL_PLAYER_METRICS: Record<string, DailyMetrics> = {};

const INITIAL_RUN_LOGS: RunLog[] = [];

export default function App() {
  // Auto-wipe old mock data caches if they exist to prevent state pollution
  useState(() => {
    const isWiped = localStorage.getItem('echelon_fresh_v8_clean') === 'true';
    if (!isWiped) {
      localStorage.clear();
      localStorage.setItem('echelon_db_mode', 'supabase');
      localStorage.setItem('echelon_use_firestore', 'false');
      localStorage.setItem('echelon_fresh_v8_clean', 'true');
    }
  });

  // Load persistent configurations or defaults
  const [activeTab, setActiveTab ] = useState<'dashboard' | 'classroom' | 'coaches' | 'admin' | 'leaderboard' | 'Locker Room' | 'formation' | 'profile'>('dashboard');
  const [classroomModuleId, setClassroomModuleId] = useState<string | null>(null);
  const [selectedFormationId, setSelectedFormationId] = useState<string | null>(null);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);

  // Cloud Sync Connection Configuration States
  const [dbMode, setDbMode] = useState<'offline' | 'firestore' | 'supabase'>(() => {
    return (localStorage.getItem('echelon_db_mode') as 'offline' | 'firestore' | 'supabase') || 'supabase';
  });

  const useFirestore = dbMode === 'firestore';
  const useSupabase = dbMode === 'supabase';

  const [fireConnection, setFireConnection] = useState<'connected' | 'error' | 'testing'>('testing');
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>('');
  const [seeding, setSeeding] = useState<boolean>(false);
  const [seedError, setSeedError] = useState<string>('');
  const [confirmWipeInput, setConfirmWipeInput] = useState<string>('');

  const adjustAndHealProfile = (u: UserProfile): UserProfile => {
    if (!u || !u.email) return u;
    const emailKey = u.email.toLowerCase().trim();
    const intendedRole = localStorage.getItem(`echelon_intended_role_${emailKey}`);
    let item = { ...u, approved: true };
    if (intendedRole) {
      item.role = intendedRole as any;
      if (intendedRole === 'association') {
        item.associationId = u.associationId || `assoc-${u.id}`;
      }
    }
    return item;
  };

  const [users, setUsers] = useState<UserProfile[]>(() => {
    const cached = localStorage.getItem('echelon_users');
    const rawList: UserProfile[] = cached ? JSON.parse(cached) : CLIENT_DEMO_USERS;
    return rawList.map(u => adjustAndHealProfile({ ...u, approved: true }));
  });

  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem('echelon_current_profile');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed) return adjustAndHealProfile({ ...parsed, approved: true });
      } catch (err) {
        console.error("Failed to parse cached profile session", err);
      }
    }
    return null;
  });

  const [associations, setAssociations] = useState<Association[]>(() => {
    const cached = localStorage.getItem('echelon_associations');
    const rawList: Association[] = cached ? JSON.parse(cached) : INITIAL_ASSOCIATIONS;
    return rawList.map(a => ({ ...a, approved: true }));
  });

  const [clubs, setClubs] = useState<Club[]>(() => {
    const cached = localStorage.getItem('echelon_clubs');
    const rawList: Club[] = cached ? JSON.parse(cached) : INITIAL_CLUBS;
    return rawList.map(c => ({ ...c, approved: true }));
  });

  const [teams, setTeams] = useState<Team[]>(() => {
    const cached = localStorage.getItem('echelon_teams');
    const rawList: Team[] = cached ? JSON.parse(cached) : INITIAL_TEAMS;
    return rawList.map(t => ({ ...t, approved: true }));
  });

  const [coaches, setCoaches] = useState<Coach[]>(() => {
    const cached = localStorage.getItem('echelon_coaches');
    const rawList: Coach[] = cached ? JSON.parse(cached) : INITIAL_COACHES;
    return rawList.map(c => ({ ...c, approved: true }));
  });

  const [players, setPlayers] = useState<Player[]>(() => {
    const cached = localStorage.getItem('echelon_players');
    return cached ? JSON.parse(cached) : [];
  });

  const [runLogs, setRunLogs] = useState<RunLog[]>(() => {
    const cached = localStorage.getItem('echelon_run_logs');
    return cached ? JSON.parse(cached) : INITIAL_RUN_LOGS;
  });

  const [allMetrics, setAllMetrics] = useState<Record<string, DailyMetrics[]>>(() => {
    const cached = localStorage.getItem('echelon_all_metrics');
    if (cached) return JSON.parse(cached);
    return {};
  });

  const [modules, setModules] = useState<ClassroomSession[]>([]);

  const [completions, setCompletions] = useState<ModuleCompletion[]>(() => {
    const cached = localStorage.getItem('echelon_completions');
    return cached ? JSON.parse(cached) : [];
  });

  const [assignments, setAssignments] = useState<Assignment[]>(() => {
    const cached = localStorage.getItem('echelon_assignments');
    return cached ? JSON.parse(cached) : INITIAL_ASSIGNMENTS;
  });

  const [requests, setRequests] = useState<OrgProfileRequest[]>(() => {
    const cached = localStorage.getItem('echelon_requests');
    return cached ? JSON.parse(cached) : INITIAL_REQUESTS;
  });

  const [formations, setFormations] = useState<TeamFormation[]>(() => {
    const cached = localStorage.getItem('echelon_formations');
    return cached ? JSON.parse(cached) : [];
  });

  const [hydrationLogs, setHydrationLogs] = useState<HydrationLog[]>(() => {
    const cached = localStorage.getItem('echelon_hydration_logs');
    return cached ? JSON.parse(cached) : [];
  });

  const [teamSchedules, setTeamSchedules] = useState<TeamSchedule[]>(() => {
    const cached = localStorage.getItem('echelon_team_schedules');
    return cached ? JSON.parse(cached) : [];
  });

  const [sessionAttendance, setSessionAttendance] = useState<SessionAttendance[]>(() => {
    const cached = localStorage.getItem('echelon_session_attendance');
    return cached ? JSON.parse(cached) : [];
  });

  const [coachDrills, setCoachDrills] = useState<CoachDrillRecord[]>(() => {
    const cached = localStorage.getItem('echelon_coach_drills');
    return cached ? JSON.parse(cached) : [];
  });

  // Coach evaluations of players (ratings + private notes). Kept in memory only, never in localStorage.
  const [playerEvaluations, setPlayerEvaluations] = useState<PlayerEvaluationRecord[]>([]);

  const { avatarUrl, uploadAvatar, removeAvatar } = useProfileAvatar(currentProfile);

  // Parent only: which linked athlete the Locker Room is showing (null = first linked child)
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  // Placeholder profiles (added by a parent) whose name matches this player's login
  const [mergeCandidates, setMergeCandidates] = useState<{ id: string; name: string; teamName?: string | null; coachName?: string | null }[]>([]);
  const [mergeBusy, setMergeBusy] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState('');

  useEffect(() => {
    if (dbMode !== 'supabase' || currentProfile?.role !== 'player') {
      setMergeCandidates([]);
      return;
    }
    const dismissed: string[] = JSON.parse(localStorage.getItem('echelon_merge_dismissed') || '[]');
    supabase.rpc('find_placeholder_matches').then(({ data, error }) => {
      if (error) {
        console.warn('[merge] match lookup failed:', error);
        return;
      }
      setMergeCandidates((data || [])
        .filter((r: any) => !dismissed.includes(r.placeholder_id))
        .map((r: any) => ({
          id: r.placeholder_id,
          name: r.placeholder_name,
          teamName: r.team_name,
          coachName: r.coach_name
        })));
    });
  }, [currentProfile?.id, currentProfile?.role, dbMode]);

  // --- Coach Drills: read straight from the coach_drills table ---
  // Database columns: id, coach_id, team_id, schedule_id, title, image_url, created_at
  const loadCoachDrills = async () => {
    const { data, error } = await supabase.from('coach_drills').select('*');
    if (error) {
      console.warn('[coach_drills] fetch failed:', error);
      return;
    }
    const list: CoachDrillRecord[] = (data || []).map((r: any) => ({
      id: r.id,
      coachId: r.coach_id,
      teamId: r.team_id,
      scheduleId: r.schedule_id,
      url: r.image_url,
      drillId: r.drill_id || undefined
    }));
    console.log(`[coach_drills] loaded ${list.length} drill(s) from database`);
    setCoachDrills(list);
    localStorage.setItem('echelon_coach_drills', JSON.stringify(list));
  };

  // --- Drill library: read from the drills table (library drills + each team's uploads) ---
  const [libraryDrills, setLibraryDrills] = useState<LibraryDrillRecord[]>([]);

  const loadLibraryDrills = async () => {
    // Fetch in pages so the whole library loads, not just the first batch
    const PAGE = 1000;
    const all: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('drills')
        .select('id, team_id, title, image_url, category, focus, age_group, tags, difficulty, duration_minutes, is_library_content, status')
        .not('image_url', 'is', null)
        .order('title', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.warn('[drills] fetch failed:', error);
        return;
      }
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    console.log(`[drills] loaded ${all.length} drill(s)`);
    setLibraryDrills(all.map((r: any) => ({
      id: r.id,
      teamId: r.team_id,
      title: r.title || 'Untitled drill',
      imageUrl: r.image_url,
      category: r.category,
      focus: r.focus,
      ageGroup: r.age_group,
      tags: Array.isArray(r.tags) ? r.tags : [],
      difficulty: r.difficulty,
      durationMinutes: r.duration_minutes,
      status: r.status,
      isLibrary: !!r.is_library_content
    })));
  };

  // Re-fetch drills whenever someone signs in (a fresh phone loads before login)
  useEffect(() => {
    if (currentProfile?.id && dbMode === 'supabase') {
      loadCoachDrills();
      loadLibraryDrills();
    }
  }, [currentProfile?.id, dbMode]);

  // --- Player Evaluations: read straight from the player_evaluations table (coaches only) ---
  // Database columns: id, team_id, player_id, coach_id, schedule_id, session_date,
  // attitude, effort, performance, leadership, notes, total_score, created_at, updated_at
  const mapEvaluationRow = (r: any): PlayerEvaluationRecord => ({
    id: r.id,
    teamId: r.team_id,
    playerId: r.player_id,
    coachId: r.coach_id,
    scheduleId: r.schedule_id,
    sessionDate: r.session_date,
    attitude: r.attitude ?? null,
    effort: r.effort ?? null,
    performance: r.performance ?? null,
    leadership: r.leadership ?? null,
    notes: r.notes || '',
    totalScore: r.total_score ?? 0
  });

  const loadPlayerEvaluations = async () => {
    const { data, error } = await supabase
      .from('player_evaluations')
      .select('*')
      .order('session_date', { ascending: false });
    if (error) {
      console.warn('[player_evaluations] fetch failed:', error);
      return;
    }
    console.log(`[player_evaluations] loaded ${(data || []).length} evaluation(s)`);
    setPlayerEvaluations((data || []).map(mapEvaluationRow));
  };

  // Only coaches can read evaluations (database policy); everyone else keeps an empty list.
  useEffect(() => {
    if (currentProfile?.role === 'coach' && dbMode === 'supabase') {
      loadPlayerEvaluations();
    } else {
      setPlayerEvaluations([]);
    }
  }, [currentProfile?.id, currentProfile?.role, dbMode]);

  // --- Supabase Synchronization Handlers ---
  const loadAllSupabaseData = async () => {
    setFireConnection('testing');
    setSyncStatusMsg('Loading database metrics and tables from Supabase...');
    try {
      const dbTest = await testSupabaseConnection();
      if (!dbTest.success) {
        setFireConnection('error');
        setSyncStatusMsg(dbTest.error || 'Database connection error.');
        return;
      }

      await Promise.all([
        supabaseService.fetchCollection<UserProfile>('users').then(data => {
          const healed = data.map(u => adjustAndHealProfile(u));
          setUsers(healed);
        }).catch(err => console.warn("Fetch users table non-blocking error:", err)),
        supabaseService.fetchCollection<Association>('associations').then(data => setAssociations(data)).catch(err => console.warn("Fetch associations table non-blocking error:", err)),
        supabaseService.fetchCollection<Club>('clubs').then(data => setClubs(data)).catch(err => console.warn("Fetch clubs table non-blocking error:", err)),
        supabaseService.fetchCollection<Team>('teams').then(data => setTeams(data)).catch(err => console.warn("Fetch teams table non-blocking error:", err)),
        supabaseService.fetchCollection<Coach>('coaches').then(data => setCoaches(data)).catch(err => console.warn("Fetch coaches table non-blocking error:", err)),
        supabaseService.fetchCollection<Player>('players').then(data => setPlayers(data)).catch(err => console.warn("Fetch players table non-blocking error:", err)),
        supabaseService.fetchCollection<RunLog>('runLogs').then(data => setRunLogs(data)).catch(err => console.warn("Fetch runLogs table non-blocking error:", err)),
        supabaseService.fetchCollection<Assignment>('assignments').then(data => setAssignments(data)).catch(err => console.warn("Fetch assignments table non-blocking error:", err)),
        supabaseService.fetchCollection<ModuleCompletion>('moduleCompletions').then(data => setCompletions(data)).catch(err => console.warn("Fetch completions table non-blocking error:", err)),
        supabaseService.fetchCollection<ClassroomSession>('classroomSessions').then(data => setModules(data)).catch(err => console.warn("Fetch classroomSessions table non-blocking error:", err)),
        supabaseService.fetchCollection<TeamFormation>('teamFormations').then(data => setFormations(data)).catch(err => console.warn("Fetch formations table non-blocking error:", err)),
        supabaseService.fetchCollection<HydrationLog>('hydrationLogs').then(data => {
          setHydrationLogs(data);
          localStorage.setItem('echelon_hydration_logs', JSON.stringify(data));
        }).catch(err => console.warn("Fetch hydrationLogs table non-blocking error:", err)),
        supabaseService.fetchCollection<OrgProfileRequest>('requests').then(data => setRequests(data)).catch(err => console.warn("Fetch requests table non-blocking error:", err)),
        supabaseService.fetchCollection<DailyMetrics>('dailyMetrics').then(savedAllMetrics => {
          const metricsMap: Record<string, DailyMetrics[]> = {};
          for (const m of savedAllMetrics) {
            if (!m.playerId) continue;
            if (!metricsMap[m.playerId]) {
              metricsMap[m.playerId] = [];
            }
            metricsMap[m.playerId].push(m);
          }
          setAllMetrics(metricsMap);
        }).catch(err => console.warn("Fetch dailyMetrics table non-blocking error:", err)),
        supabaseService.fetchCollection<TeamSchedule>('teamSchedules').then(data => {
          setTeamSchedules(data);
          localStorage.setItem('echelon_team_schedules', JSON.stringify(data));
        }).catch(err => console.warn("Fetch teamSchedules table non-blocking error:", err)),
        supabaseService.fetchCollection<SessionAttendance>('sessionAttendance').then(data => {
          setSessionAttendance(data);
          localStorage.setItem('echelon_session_attendance', JSON.stringify(data));
        }).catch(err => console.warn("Fetch sessionAttendance table non-blocking error:", err)),
        loadCoachDrills()
      ]);

      setFireConnection('connected');
      setSyncStatusMsg('Connected to Supabase database. Data synchronized.');
    } catch (err: any) {
      console.warn("Supabase fetch warning:", err);
      setFireConnection('error');
      setSyncStatusMsg(`Failed to sync data: ${err.message || String(err)}`);
    }
  };

  const pushLocalDataToSupabase = async () => {
    setSeeding(true);
    setSeedError('');
    setSyncStatusMsg('Copying all local state values into Supabase DB...');
    try {
      const dbTest = await testSupabaseConnection();
      if (!dbTest.success) {
        setSeeding(false);
        setSeedError(dbTest.error || 'Your Supabase tables do not exist or are not configured correctly.');
        return;
      }

      const writes: Promise<void>[] = [];
      const addWrites = (list: any[], collName: string) => {
        list.forEach(item => {
          if (item && item.id) {
            writes.push(supabaseService.saveDocument(item.id, collName, item));
          }
        });
      };

      addWrites(users, 'users');
      addWrites(associations, 'associations');
      addWrites(clubs, 'clubs');
      addWrites(teams, 'teams');
      addWrites(coaches, 'coaches');
      addWrites(players, 'players');
      addWrites(runLogs, 'runLogs');
      addWrites(assignments, 'assignments');
      addWrites(completions, 'moduleCompletions');
      addWrites(formations, 'teamFormations');
      addWrites(coachDrills, 'coach_drills');
      addWrites(requests, 'requests');

      Object.keys(allMetrics).forEach(playerId => {
        const list = allMetrics[playerId] || [];
        list.forEach(m => {
          const docId = `${playerId}_${m.date}`;
          writes.push(supabaseService.saveDocument(docId, 'dailyMetrics', m));
        });
      });

      await Promise.all(writes);
      setSeeding(false);
      setSyncStatusMsg('Local database successfully pushed and cloned to Supabase!');
      await loadAllSupabaseData();
    } catch (err: any) {
      console.error(err);
      setSeeding(false);
      setSeedError(`Supabase push failed: ${err.message || String(err)}`);
    }
  };

  // When coaches finish loading, enrich a coach's profile with teamId if the users table didn't carry it
  useEffect(() => {
    if (!currentProfile || currentProfile.role !== 'coach' || currentProfile.teamId) return;
    const coachRecord = coaches.find(c =>
      c.email?.toLowerCase() === currentProfile.email?.toLowerCase() || c.id === currentProfile.id
    );
    if (coachRecord?.teamId) {
      setCurrentProfile(prev => {
        if (!prev || prev.teamId) return prev;
        const enriched: UserProfile = {
          ...prev,
          teamId: coachRecord.teamId,
          teamIds: coachRecord.teamIds?.length ? coachRecord.teamIds : [coachRecord.teamId]
        };
        localStorage.setItem('echelon_current_profile', JSON.stringify(enriched));
        return enriched;
      });
    }
  }, [coaches, currentProfile?.id, currentProfile?.teamId]);

  // When players/coaches finish loading, enrich a player's profile with coachId and teamId
  // The users table has neither — coachId lives in the players table, teamId in the coaches table
  useEffect(() => {
    if (!currentProfile || currentProfile.role !== 'player') return;
    if (currentProfile.teamId && currentProfile.coachId) return;
    const playerRecord = players.find(p =>
      p.email?.toLowerCase() === currentProfile.email?.toLowerCase() || p.id === currentProfile.id
    );
    if (!playerRecord?.coachId) return;
    const coachRecord = coaches.find(c => c.id === playerRecord.coachId);
    if (!coachRecord) return;
    const resolvedTeamId = coachRecord.teamId || coachRecord.teamIds?.[0];
    if (!resolvedTeamId && currentProfile.coachId === playerRecord.coachId) return;
    setCurrentProfile(prev => {
      if (!prev) return prev;
      const enriched: UserProfile = {
        ...prev,
        coachId: prev.coachId || playerRecord.coachId,
        teamId: prev.teamId || resolvedTeamId,
        teamIds: prev.teamIds?.length ? prev.teamIds : (resolvedTeamId ? [resolvedTeamId] : [])
      };
      localStorage.setItem('echelon_current_profile', JSON.stringify(enriched));
      return enriched;
    });
  }, [players, coaches, currentProfile?.id, currentProfile?.teamId, currentProfile?.coachId]);

  // Enrich players with teamId from the users table when missing.
  // The players table now has team_id, but older records may lack it.
  // The users table stores teamId per role='player' records.
  useEffect(() => {
    if (users.length === 0 || players.length === 0) return;
    const userTeamMap = new Map<string, string>();
    for (const u of users) {
      if (u.role === 'player' && u.teamId) {
        userTeamMap.set(u.id, u.teamId);
      }
    }
    if (userTeamMap.size === 0) return;
    setPlayers(prev => {
      let changed = false;
      const updated = prev.map(p => {
        if (!p.teamId && userTeamMap.has(p.id)) {
          changed = true;
          return { ...p, teamId: userTeamMap.get(p.id)! };
        }
        return p;
      });
      return changed ? updated : prev;
    });
  }, [users]);

  // --- Supabase Real-Time & Session Handling Effect ---
  useEffect(() => {
    if (dbMode !== 'supabase') return;

    loadAllSupabaseData();

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session?.user) {
          const sUser = session.user;
          const emailKey = sUser.email?.toLowerCase().trim() || '';

          // Check if we have registered google signup details in localStorage
          const signupRole = localStorage.getItem('echelon_google_signup_role') as UserRole;
          const signupName = localStorage.getItem('echelon_google_signup_name') || sUser.user_metadata?.full_name || sUser.email?.split('@')[0] || 'Athlete';
          const signupAssocName = localStorage.getItem('echelon_google_signup_assoc_name') || "League Governing Body";

          if (signupRole) {
            // Pre-seed persistent intentions
            localStorage.setItem(`echelon_intended_role_${emailKey}`, signupRole);
            if (signupRole === 'association') {
              localStorage.setItem(`echelon_intended_assoc_name_${emailKey}`, signupAssocName);
            }

            // Clear those signup keys now so we don't repeat this infinitely
            localStorage.removeItem('echelon_google_signup_role');
            localStorage.removeItem('echelon_google_signup_name');
            localStorage.removeItem('echelon_google_signup_assoc_name');

            const assocId = signupRole === 'association' ? `assoc-${sUser.id}` : undefined;
            const newProfile: UserProfile = {
              id: sUser.id,
              name: signupName,
              email: sUser.email || '',
              role: signupRole,
              associationId: assocId,
              approved: true
            };

            // Non-blocking writes
            try {
              await supabaseService.saveDocument(sUser.id, 'users', newProfile);
            } catch (err) {
              console.warn("Non-blocking google save user warning:", err);
            }

            if (signupRole === 'association' && assocId) {
              const newAssociation: Association = {
                id: assocId,
                name: signupAssocName,
                contactEmail: sUser.email || '',
                approved: true,
                UUID: assocId,
                association_name: signupAssocName,
                association_email: sUser.email || '',
                create_at: new Date().toISOString()
              };
              try {
                await supabaseService.saveDocument(assocId, 'associations', newAssociation);
              } catch (err) {
                console.warn("Non-blocking google save association warning:", err);
              }
              setAssociations(prev => {
                if (prev.some(a => a.id === assocId)) return prev;
                return [...prev, newAssociation];
              });
            }

            const healed = adjustAndHealProfile(newProfile);
            setCurrentProfile(healed);
            localStorage.setItem('echelon_current_profile', JSON.stringify(healed));
            setUsers(prev => {
              if (prev.some(u => u.id === sUser.id)) return prev.map(u => u.id === sUser.id ? healed : u);
              return [...prev, healed];
            });
            await loadAllSupabaseData();
            return;
          }

          // No pending signup, load existing one from 'users' table
          const { data: dbUser, error: dbUserError } = await supabase
            .from('users')
            .select('*')
            .eq('id', sUser.id)
            .maybeSingle();

          let fetchedProfile: UserProfile;
          if (dbUser) {
            fetchedProfile = {
              id: sUser.id,
              name: dbUser.name || sUser.user_metadata?.full_name || sUser.email?.split('@')[0] || 'Athlete',
              email: sUser.email || dbUser.email,
              role: (dbUser.role || 'player').toLowerCase() as UserRole,
              associationId: dbUser.association_id,
              coachId: dbUser.coach_id,
              coachIds: dbUser.coach_ids,
              teamId: dbUser.team_id,
              teamIds: dbUser.team_ids,
              childPlayerId: dbUser.child_player_id,
              childPlayerIds: dbUser.child_player_ids,
              parentUserId: dbUser.parent_user_id,
              approved: true
            };

            // Cross-reference coaches table: if this user exists as a coach,
            // correct the role regardless of what the users table or localStorage says.
            const coachEmail = (sUser.email || dbUser.email || '').toLowerCase().trim();
            const { data: coachRow } = await supabase
              .from('coaches')
              .select('id, team_id, team_ids')
              .ilike('coach_email', coachEmail)
              .maybeSingle();
            if (coachRow) {
              fetchedProfile.role = 'coach';
              fetchedProfile.coachId = fetchedProfile.coachId || coachRow.id;
              if (!fetchedProfile.teamId && coachRow.team_id) {
                fetchedProfile.teamId = coachRow.team_id;
              }
              if ((!fetchedProfile.teamIds || fetchedProfile.teamIds.length === 0) && coachRow.team_ids) {
                fetchedProfile.teamIds = coachRow.team_ids;
              }
              // Clear any stale intendedRole that would re-override to player
              localStorage.removeItem(`echelon_intended_role_${emailKey}`);
            }
          } else {
            // New fallback user profile if not in DB yet — use intended role from localStorage if available
            const emailKeyFallback = sUser.email?.toLowerCase().trim() || '';
            const intendedRoleFallback = (localStorage.getItem(`echelon_intended_role_${emailKeyFallback}`) || 'player').toLowerCase() as UserRole;
            fetchedProfile = {
              id: sUser.id,
              name: sUser.user_metadata?.full_name || sUser.email?.split('@')[0] || 'Athlete',
              email: sUser.email || '',
              role: intendedRoleFallback,
              approved: true
            };
            try {
              await supabaseService.saveDocument(sUser.id, 'users', fetchedProfile);
            } catch (err) {
              console.warn("Non-blocking new user save warning:", err);
            }
          }

          const healedProfile = adjustAndHealProfile(fetchedProfile);
          setCurrentProfile(healedProfile);
          localStorage.setItem('echelon_current_profile', JSON.stringify(healedProfile));
        }
      } catch (err) {
        console.error("Error checking Supabase session:", err);
      }
    };

    checkSession();

    // Listen to Auth stage changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Supabase Auth event:", event);
      if (session?.user) {
        checkSession();
      } else if (event === 'SIGNED_OUT') {
        setCurrentProfile(null);
        localStorage.removeItem('echelon_current_profile');
      }
    });

    const channel = supabase
      .channel('public:any_table_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: '*' }, (_payload) => {
        // intentionally no-op: auth state changes handled by onAuthStateChange,
        // and bulk re-fetching here caused an infinite loop via write -> notify -> fetch -> write
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      subscription.unsubscribe();
    };
  }, [dbMode]);

  // --- Firestore Real-Time Subscriptions & Connection Logic ---
  useEffect(() => {
    localStorage.setItem('echelon_db_mode', dbMode);
    localStorage.setItem('echelon_use_firestore', String(useFirestore));
    
    if (!useFirestore) {
      if (dbMode !== 'supabase') {
        setFireConnection('testing');
      }
      return;
    }

    setFireConnection('testing');

    let isSubscribed = false;
    const unsubscribers: (() => void)[] = [];

    const handleSubError = (err: any, path: string) => {
      console.error(`Subscription error on ${path}:`, err);
      setFireConnection('error');
    };

    const setupSubscriptions = () => {
      if (isSubscribed) return;
      isSubscribed = true;

      unsubscribers.push(
        onSnapshot(collection(db, 'users'), (snap) => {
          const list: UserProfile[] = [];
          snap.forEach(d => list.push(d.data() as UserProfile));
          setUsers(list);
        }, (err) => handleSubError(err, 'users'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'associations'), (snap) => {
          const list: Association[] = [];
          snap.forEach(d => list.push(d.data() as Association));
          setAssociations(list);
        }, (err) => handleSubError(err, 'associations'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'clubs'), (snap) => {
          const list: Club[] = [];
          snap.forEach(d => list.push(d.data() as Club));
          setClubs(list);
        }, (err) => handleSubError(err, 'clubs'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'teams'), (snap) => {
          const list: Team[] = [];
          snap.forEach(d => list.push(d.data() as Team));
          setTeams(list);
        }, (err) => handleSubError(err, 'teams'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'coaches'), (snap) => {
          const list: Coach[] = [];
          snap.forEach(d => list.push(d.data() as Coach));
          setCoaches(list);
        }, (err) => handleSubError(err, 'coaches'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'players'), (snap) => {
          const list: Player[] = [];
          snap.forEach(d => list.push(d.data() as Player));
          setPlayers(list);
        }, (err) => handleSubError(err, 'players'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'runLogs'), (snap) => {
          const list: RunLog[] = [];
          snap.forEach(d => list.push(d.data() as RunLog));
          setRunLogs(list);
        }, (err) => handleSubError(err, 'runLogs'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'dailyMetrics'), (snap) => {
          const metricsMap: Record<string, DailyMetrics[]> = {};
          snap.forEach(d => {
            const m = d.data() as DailyMetrics;
            if (!metricsMap[m.playerId]) {
              metricsMap[m.playerId] = [];
            }
            metricsMap[m.playerId].push(m);
          });
          setAllMetrics(metricsMap);
        }, (err) => handleSubError(err, 'dailyMetrics'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'assignments'), (snap) => {
          const list: Assignment[] = [];
          snap.forEach(d => list.push(d.data() as Assignment));
          setAssignments(list);
        }, (err) => handleSubError(err, 'assignments'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'moduleCompletions'), (snap) => {
          const list: ModuleCompletion[] = [];
          snap.forEach(d => list.push(d.data() as ModuleCompletion));
          setCompletions(list);
        }, (err) => handleSubError(err, 'moduleCompletions'))
      );

      unsubscribers.push(
        onSnapshot(collection(db, 'teamFormations'), (snap) => {
          const list: TeamFormation[] = [];
          snap.forEach(d => list.push(d.data() as TeamFormation));
          setFormations(list);
        }, (err) => handleSubError(err, 'teamFormations'))
      );
    };

    // Listen to Auth State Changes
    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Authenticated! Update connection health & subscribe on snap
        getDocFromServer(doc(db, 'test', 'connection'))
          .then(() => setFireConnection('connected'))
          .catch(() => setFireConnection('connected'));

        setupSubscriptions();

        if (!firebaseUser.isAnonymous) {
          try {
            const uDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (uDoc.exists()) {
              const loadedProf = uDoc.data() as UserProfile;
              setCurrentProfile(loadedProf);
              localStorage.setItem('echelon_current_profile', JSON.stringify(loadedProf));
            }
          } catch (err) {
            console.error("Auth sync profile load failed:", err);
          }
        }
      } else {
        // Automatically request active anonymous session if no active session is loaded
        signInAnonymously(auth)
          .catch((err) => {
            console.warn("Could not activate anonymous session fallback:", err);
            setFireConnection('error');
          });
      }
    });

    return () => {
      authUnsub();
      unsubscribers.forEach(unsub => unsub());
    };
  }, [useFirestore]);

  // Background Scanner: Scan 'users' list to auto-populate the 'associations' collection
  useEffect(() => {
    if (users.length === 0) return;

    const scanAndSelfHealAssociations = async () => {
      const associationUsers = users.filter(u => u.role === 'association');
      if (associationUsers.length === 0) return;

      for (const u of associationUsers) {
        // Force User Approved to true if role is Association
        if (u.approved !== true) {
          console.log(`Auto-setting approved=true on users table for association: ${u.email}`);
          const updatedUser = { ...u, approved: true };
          if (dbMode === 'supabase') {
            try {
              await supabaseService.saveDocument(u.id, 'users', updatedUser);
              setUsers(prev => prev.map(usr => usr.id === u.id ? updatedUser : usr));
            } catch (err) {
              console.warn("Background auto-approve user (Supabase) warning:", err);
            }
          } else if (useFirestore) {
            try {
              await setDoc(doc(db, 'users', u.id), updatedUser);
              setUsers(prev => prev.map(usr => usr.id === u.id ? updatedUser : usr));
            } catch (err) {
              console.warn("Background auto-approve user (Firestore) warning:", err);
            }
          } else {
            setUsers(prev => prev.map(usr => usr.id === u.id ? updatedUser : usr));
          }
        }

        // Find or derive the correct association ID
        const assocId = u.associationId || `assoc-${u.id}`;
        
        // Check if we already have it tracked in local associations state
        const existsLocally = associations.some(a => a.id === assocId || (a.contactEmail?.toLowerCase() === u.email.toLowerCase()));
        
        if (!existsLocally) {
          const newAssociation: Association = {
            id: assocId,
            name: u.name || 'Governing Body Association',
            contactEmail: u.email,
            approved: true,
            UUID: assocId,
            association_name: u.name || 'Governing Body Association',
            association_email: u.email,
            create_at: new Date().toISOString()
          };

          if (dbMode === 'supabase') {
            try {
              console.log(`Auto-healing and populating association row in Supabase for user: ${u.email}`);
              await supabaseService.saveDocument(assocId, 'associations', newAssociation);
              setAssociations(prev => {
                if (prev.some(a => a.id === assocId)) return prev;
                return [...prev, newAssociation];
              });
            } catch (err) {
              console.warn("Background association auto-healing scanner (Supabase) warning:", err);
            }
          } else if (useFirestore) {
            try {
              const assocDocRef = doc(db, 'associations', assocId);
              const assocDocSnap = await getDoc(assocDocRef);
              
              if (!assocDocSnap.exists()) {
                console.log(`Auto-healing scanner: Missing association document for role 'association' user [${u.name}]`);
                await setDoc(assocDocRef, newAssociation);
                
                if (!u.associationId) {
                  const userDocRef = doc(db, 'users', u.id);
                  await setDoc(userDocRef, {
                    ...u,
                    associationId: assocId
                  });
                }
              }
            } catch (err) {
              console.warn("Background auto-healing scanner (Firestore) warning:", err);
            }
          } else {
            // Offline fallback
            setAssociations(prev => {
              if (prev.some(a => a.id === assocId)) return prev;
              return [...prev, newAssociation];
            });
          }
        } else {
          // Verify approved is true
          const matched = associations.find(a => a.id === assocId || (a.contactEmail?.toLowerCase() === u.email.toLowerCase()));
          if (matched && !matched.approved) {
            console.log(`Auto-setting approved=true for association ${matched.id}`);
            const updated = { ...matched, approved: true };
            if (dbMode === 'supabase') {
              try {
                await supabaseService.saveDocument(matched.id, 'associations', updated);
                setAssociations(prev => prev.map(a => a.id === matched.id ? updated : a));
              } catch (err) {
                console.warn("Background association auto-approve (Supabase) warning:", err);
              }
            } else if (useFirestore) {
              try {
                const assocDocRef = doc(db, 'associations', matched.id);
                await setDoc(assocDocRef, updated);
              } catch (err) {
                console.warn("Background association auto-approve (Firestore) warning:", err);
              }
            } else {
              setAssociations(prev => prev.map(a => a.id === matched.id ? updated : a));
            }
          }
        }
      }
    };

    const timer = setTimeout(() => {
      scanAndSelfHealAssociations();
    }, 1200);

    return () => clearTimeout(timer);
  }, [users, associations, useFirestore, dbMode]);

  // Background Scanner: Monitor 'associations' table/state and populate the 'clubs' table when populated with club details
  useEffect(() => {
    if (associations.length === 0) return;

    const scanAndPopulateClubsFromAssociations = async () => {
      for (const assoc of associations) {
        const cName = assoc.club_name || assoc.club;
        const cEmail = assoc.club_email;

        if (cName && cEmail) {
          // Check if a club for this association with matching name or email already exists
          const existsLocally = clubs.some(c => 
            c.associationId === assoc.id && 
            (c.name?.toLowerCase().trim() === cName.toLowerCase().trim() || 
             c.contactEmail?.toLowerCase().trim() === cEmail.toLowerCase().trim())
          );

          if (!existsLocally) {
            const sanitizeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/gi, '');
            const clubId = `club-${sanitizeName(cName)}-${assoc.id}`;
            const timestamp = new Date().toISOString();
            const newClub: Club = {
              id: clubId,
              name: cName,
              associationId: assoc.id,
              contactEmail: cEmail,
              approved: true,
              UUID: clubId,
              club: cName,
              club_name: cName,
              club_email: cEmail,
              association_id: assoc.id,
              create_at: timestamp
            };

            if (dbMode === 'supabase') {
              try {
                console.log(`Auto-healing/populating club entry from association in Supabase: ${cName}`);
                await supabaseService.saveDocument(clubId, 'clubs', newClub);
                setClubs(prev => {
                  if (prev.some(c => c.id === clubId)) return prev;
                  return [...prev, newClub];
                });
              } catch (err) {
                console.warn("Background scanner autopopulating club (Supabase) warning:", err);
              }
            } else if (useFirestore) {
              try {
                const clubDocRef = doc(db, 'clubs', clubId);
                const clubDocSnap = await getDoc(clubDocRef);
                if (!clubDocSnap.exists()) {
                  console.log(`Auto-healing/populating club entry from association in Firestore: ${cName}`);
                  await setDoc(clubDocRef, newClub);
                  setClubs(prev => {
                    if (prev.some(c => c.id === clubId)) return prev;
                    return [...prev, newClub];
                  });
                }
              } catch (err) {
                console.warn("Background scanner autopopulating club (Firestore) warning:", err);
              }
            } else {
              // Local memory / storage mode
              setClubs(prev => {
                if (prev.some(c => c.id === clubId)) return prev;
                return [...prev, newClub];
              });
            }
          }
        }
      }
    };

    const timer = setTimeout(() => {
      scanAndPopulateClubsFromAssociations();
    }, 1500);

    return () => clearTimeout(timer);
  }, [associations, clubs, useFirestore, dbMode]);

  // Background Sync: Auto-heal the current session profile to the database table once authenticated
  useEffect(() => {
    if (!currentProfile) return;
    
    const syncCurrentProfileWithDatabase = async () => {
      const emailKey = currentProfile.email.toLowerCase().trim();
      const intendedRole = localStorage.getItem(`echelon_intended_role_${emailKey}`);
      
      const dbMatch = users.find(u => u.id === currentProfile.id || u.email.toLowerCase().trim() === emailKey);
      // If this user is registered as a coach in the coaches table, never let
      // a stale intendedRole override them back to player.
      const isCoachInCoachesTable = coaches.some(c =>
        c.email?.toLowerCase().trim() === emailKey || c.id === currentProfile.coachId
      );
      const safeIntendedRole = isCoachInCoachesTable && intendedRole === 'player' ? undefined : intendedRole;
      
      const shouldSyncToDb = 
        (safeIntendedRole && currentProfile.role !== safeIntendedRole) ||
        (dbMatch && dbMatch.role !== currentProfile.role) ||
        (dbMatch && !dbMatch.approved) ||
        !dbMatch;
        
      if (shouldSyncToDb) {
        console.log("Detecting role desync or missing profile. Back-syncing user details to database...");
        try {
          const updated = {
            ...currentProfile,
            approved: true
          };
          if (safeIntendedRole) {
            updated.role = safeIntendedRole as any;
          }
          if (updated.role === 'association') {
            updated.associationId = currentProfile.associationId || `assoc-${currentProfile.id}`;
          }
          
          await supabaseService.saveDocument(currentProfile.id, 'users', updated);
          
          // If role is association, make sure association row is populated too!
          if (updated.role === 'association') {
            const assocId = updated.associationId || `assoc-${updated.id}`;
            const assocName = localStorage.getItem(`echelon_intended_assoc_name_${emailKey}`) || "League Governing Body";
            const newAssociation: Association = {
              id: assocId,
              name: assocName,
              contactEmail: updated.email,
              approved: true,
              UUID: assocId,
              association_name: assocName,
              association_email: updated.email,
              create_at: new Date().toISOString()
            };
            await supabaseService.saveDocument(assocId, 'associations', newAssociation);
            
            setAssociations(prev => {
              if (prev.some(a => a.id === assocId)) return prev.map(a => a.id === assocId ? { ...a, approved: true } : a);
              return [...prev, newAssociation];
            });
          }
          
          setUsers(prev => {
            if (prev.some(u => u.id === currentProfile.id || u.email.toLowerCase().trim() === emailKey)) {
              return prev.map(u => (u.id === currentProfile.id || u.email.toLowerCase().trim() === emailKey) ? updated : u);
            }
            return [...prev, updated];
          });
          
          // Secure layout in currentProfile state and local storage
          setCurrentProfile(updated);
          localStorage.setItem('echelon_current_profile', JSON.stringify(updated));
        } catch (err) {
          console.warn("Back-sync profile warning (ignored as RLS may block before active auth session has fully loaded):", err);
        }
      }
    };
    
    const t = setTimeout(() => {
      syncCurrentProfileWithDatabase();
    }, 1500);
    
    return () => clearTimeout(t);
  }, [currentProfile, users, coaches]);

  // Background Scanner: Scan 'users' list to auto-populate the 'coaches' collection
  useEffect(() => {
    if (users.length === 0) return;

    const scanAndSelfHealCoaches = async () => {
      const coachUsers = users.filter(u => u.role === 'coach');
      if (coachUsers.length === 0) return;

      for (const u of coachUsers) {
        // Find or derive the correct coach ID
        const coachId = u.coachId || `coach-${u.id}`;
        
        // Check if we already have it tracked in local coaches state
        const existsLocally = coaches.some(c => c.id === coachId || (c.email?.toLowerCase() === u.email.toLowerCase()));
        
        if (!existsLocally) {
          const matchingTeam = teams.find(t => t.id === (u.teamId || ''));
          const teamName = matchingTeam ? matchingTeam.name : (u.teamId || '');

          const newCoach: Coach = {
            id: coachId,
            name: u.name || 'Head Coach',
            email: u.email,
            teamId: u.teamId || '',
            approved: true,
            UUID: coachId,
            coach: u.name || 'Head Coach',
            coach_email: u.email,
            team: teamName,
            create_at: new Date().toISOString()
          };

          if (dbMode === 'supabase') {
            try {
              console.log(`Auto-healing and populating coach row in Supabase for user: ${u.email}`);
              await supabaseService.saveDocument(coachId, 'coaches', newCoach);
              setCoaches(prev => {
                if (prev.some(c => c.id === coachId)) return prev;
                return [...prev, newCoach];
              });
            } catch (err) {
              console.warn("Background coach auto-healing scanner (Supabase) warning:", err);
            }
          } else if (useFirestore) {
            try {
              const coachDocRef = doc(db, 'coaches', coachId);
              const coachDocSnap = await getDoc(coachDocRef);
              
              if (!coachDocSnap.exists()) {
                console.log(`Auto-healing coach scanner: Missing coach document for role 'coach' user [${u.name}]`);
                await setDoc(coachDocRef, newCoach);
                
                if (!u.coachId) {
                  const userDocRef = doc(db, 'users', u.id);
                  await setDoc(userDocRef, {
                    ...u,
                    coachId: coachId
                  });
                }
              }
            } catch (err) {
              console.warn("Background coach auto-healing scanner (Firestore) warning:", err);
            }
          } else {
            // Offline fallback
            setCoaches(prev => {
              if (prev.some(c => c.id === coachId)) return prev;
              return [...prev, newCoach];
            });
          }
        }
      }
    };

    const timer = setTimeout(() => {
      scanAndSelfHealCoaches();
    }, 1500);

    return () => clearTimeout(timer);
  }, [users, coaches, teams, useFirestore, dbMode]);

  // Background Scanner: Scan 'users' list to auto-populate the 'players' collection
  useEffect(() => {
    if (users.length === 0) return;

    const scanAndSelfHealPlayers = async () => {
      // Never create a player row for anyone registered as a coach.
      const coachEmails = new Set(coaches.map(c => c.email?.toLowerCase().trim()).filter(Boolean));
      const playerUsers = users.filter(u =>
        u.role === 'player' && !coachEmails.has(u.email?.toLowerCase().trim())
      );
      if (playerUsers.length === 0) return;

      for (const u of playerUsers) {
        const playerId = u.id;
        
        // Check if we already have it tracked in local players state
        const existsLocally = players.some(p => p.id === playerId || (p.email?.toLowerCase() === u.email.toLowerCase()));
        
        if (!existsLocally) {
          const newPlayer: Player = {
            id: playerId,
            name: u.name || 'Student Player',
            email: u.email,
            coachId: u.coachId || '',
            teamId: u.teamId || '',
            approved: true,
            UUID: playerId,
            player_name: u.name || 'Student Player',
            player_email: u.email,
            create_at: new Date().toISOString()
          };

          if (dbMode === 'supabase') {
            try {
              console.log(`Auto-healing and populating player row in Supabase for user: ${u.email}`);
              await supabaseService.saveDocument(playerId, 'players', newPlayer);
              setPlayers(prev => {
                if (prev.some(p => p.id === playerId)) return prev;
                return [...prev, newPlayer];
              });
            } catch (err) {
              console.warn("Background player auto-healing scanner (Supabase) warning:", err);
            }
          } else if (useFirestore) {
            try {
              const playerDocRef = doc(db, 'players', playerId);
              const playerDocSnap = await getDoc(playerDocRef);
              
              if (!playerDocSnap.exists()) {
                console.log(`Auto-healing player scanner: Missing player document for role 'player' user [${u.name}]`);
                await setDoc(playerDocRef, newPlayer);
              }
            } catch (err) {
              console.warn("Background player auto-healing scanner (Firestore) warning:", err);
            }
          } else {
            // Offline fallback
            setPlayers(prev => {
              if (prev.some(p => p.id === playerId)) return prev;
              return [...prev, newPlayer];
            });
          }
        }
      }
    };

    const timer = setTimeout(() => {
      scanAndSelfHealPlayers();
    }, 1800);

    return () => clearTimeout(timer);
  }, [users, players, coaches, useFirestore, dbMode]);



  // Seeding local states directly down to Firestore
  const handleSeedFirestoreData = async () => {
    if (!useFirestore) return;
    setSeeding(true);
    setSeedError('');
    try {
      const batch = writeBatch(db);

      // Write users
      users.forEach(u => {
        batch.set(doc(db, 'users', u.id), u);
      });
      // Write associations
      associations.forEach(a => {
        batch.set(doc(db, 'associations', a.id), a);
      });
      // Write clubs
      clubs.forEach(c => {
        batch.set(doc(db, 'clubs', c.id), c);
      });
      // Write teams
      teams.forEach(t => {
        batch.set(doc(db, 'teams', t.id), t);
      });
      // Write coaches
      coaches.forEach(co => {
        batch.set(doc(db, 'coaches', co.id), co);
      });
      // Write players
      players.forEach(pl => {
        batch.set(doc(db, 'players', pl.id), pl);
      });
      // Write run logs
      runLogs.forEach(r => {
        batch.set(doc(db, 'runLogs', r.id), r);
      });
      // Write assignments
      assignments.forEach(a => {
        batch.set(doc(db, 'assignments', a.id), a);
      });
      // Write daily metrics
      Object.keys(allMetrics).forEach(playerId => {
        allMetrics[playerId].forEach(metric => {
          const metricId = `${playerId}_${metric.date}`;
          batch.set(doc(db, 'dailyMetrics', metricId), metric);
        });
      });
      // Write completions
      completions.forEach(c => {
        batch.set(doc(db, 'moduleCompletions', c.id), c);
      });

      await batch.commit();
      setSyncStatusMsg("Successfully uploaded local seed data to Cloud Firestore instances!");
      setTimeout(() => setSyncStatusMsg(''), 5000);
    } catch (err) {
      console.error(err);
      setSeedError(err instanceof Error ? err.message : String(err));
    } finally {
      setSeeding(false);
    }
  };

  // Masters System Reset / Nuke Data State
  const [resetting, setResetting] = useState<boolean>(false);
  const [resetError, setResetError] = useState<string>('');
  const [resetSuccess, setResetSuccess] = useState<string>('');
  const [resetProgress, setResetProgress] = useState<string>('');

  const handleCompleteSystemReset = async () => {
    setResetting(true);
    setResetError('');
    setResetSuccess('');
    setResetProgress('Starting system-wide wipe operation...');

    try {
      // 1. Wipe local storage and local variables
      setResetProgress('Wiping local browsers cache storage blocks...');
      localStorage.clear();
      
      localStorage.setItem('echelon_use_firestore', 'true');
      localStorage.setItem('echelon_fresh_v6', 'true');

      // Reset all state collections in-memory instantly
      setUsers([]);
      setAssociations([]);
      setClubs([]);
      setTeams([]);
      setCoaches([]);
      setPlayers([]);
      setRunLogs([]);
      setAllMetrics({});
      setCompletions([]);
      setAssignments([]);
      setRequests([]);

      // 2. Clear collections in Google Cloud Firestore database
      if (useFirestore) {
        const collectionsToWipe = [
          'associations',
          'clubs',
          'teams',
          'coaches',
          'players',
          'runLogs',
          'assignments',
          'moduleCompletions',
          'dailyMetrics',
          'requests',
          'users'
        ];

        for (const colName of collectionsToWipe) {
          setResetProgress(`Purging remote Cloud Firestore collection: '${colName}'...`);
          try {
            const colRef = collection(db, colName);
            const snap = await getDocs(colRef);
            if (!snap.empty) {
              const batch = writeBatch(db);
              snap.forEach(docSnap => {
                batch.delete(doc(db, colName, docSnap.id));
              });
              await batch.commit();
            }
          } catch (err) {
            console.warn(`Could not clear collection '${colName}':`, err);
          }
        }
      }

    // 3. Log out Auth state
      setResetProgress('De-authenticating session credential scopes...');
      try {
        if (useSupabase) {
          await supabase.auth.signOut();
        } else if (useFirestore) {
          await signOut(auth);
        }
      } catch (e) {
        console.warn("Signout during system purge failed:", e);
      }
      
      setCurrentProfile(null);
      localStorage.removeItem('echelon_current_profile');

      setResetProgress('Finalizing clean state structures...');
      setResetSuccess('All local storage and Firestore database tables successfully cleared. Starting afresh!');
    } catch (err) {
      console.error(err);
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
      setResetProgress('');
    }
  };

  // Persist storage whenever collections change
  useEffect(() => {
    localStorage.setItem('echelon_users', JSON.stringify(users));
  }, [users]);


  useEffect(() => {
    localStorage.setItem('echelon_associations', JSON.stringify(associations));
  }, [associations]);

  useEffect(() => {
    localStorage.setItem('echelon_clubs', JSON.stringify(clubs));
  }, [clubs]);

  useEffect(() => {
    localStorage.setItem('echelon_teams', JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem('echelon_coaches', JSON.stringify(coaches));
  }, [coaches]);

  useEffect(() => {
    localStorage.setItem('echelon_players', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    localStorage.setItem('echelon_run_logs', JSON.stringify(runLogs));
  }, [runLogs]);

  useEffect(() => {
    localStorage.setItem('echelon_all_metrics', JSON.stringify(allMetrics));
  }, [allMetrics]);

  useEffect(() => {
    localStorage.setItem('echelon_completions', JSON.stringify(completions));
  }, [completions]);

  useEffect(() => {
    localStorage.setItem('echelon_assignments', JSON.stringify(assignments));
  }, [assignments]);

  useEffect(() => {
    localStorage.setItem('echelon_requests', JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem('echelon_formations', JSON.stringify(formations));
  }, [formations]);

  useEffect(() => {
    localStorage.setItem('echelon_coach_drills', JSON.stringify(coachDrills));
  }, [coachDrills]);

  // Helper to double-write to Supabase when active
  const syncSupabase = (id: string, collectionName: string, data: any) => {
    if (useSupabase) {
      supabaseService.saveDocument(id, collectionName, data).catch(err => {
        console.error(`Supabase sync failed [${collectionName}/${id}]:`, err);
      });
    }
  };

  const deleteSupabase = (id: string, collectionName: string) => {
    if (useSupabase) {
      supabaseService.deleteDocument(id, collectionName).catch(err => {
        console.error(`Supabase delete failed [${collectionName}/${id}]:`, err);
      });
    }
  };

  const handleSaveFormation = async (formPayload: Omit<TeamFormation, 'updatedAt'>) => {
    const updatedAt = new Date().toISOString();
    const saved: TeamFormation = {
      ...formPayload,
      updatedAt
    };

    if (useFirestore) {
      try {
        await setDoc(doc(db, 'teamFormations', saved.id), saved);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `teamFormations/${saved.id}`);
      }
    } else {
      if (useSupabase) {
        await supabaseService.saveDocument(saved.id, 'teamFormations', saved);
      }
      setFormations((prev) => {
        const filtered = prev.filter((f) => f.id !== saved.id);
        return [saved, ...filtered];
      });
    }
  };

  const handleDeleteFormation = async (formationId: string) => {
    if (useFirestore) {
      try {
        await deleteDoc(doc(db, 'teamFormations', formationId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `teamFormations/${formationId}`);
      }
    } else {
      setFormations((prev) => prev.filter((f) => f.id !== formationId));
      deleteSupabase(formationId, 'teamFormations');
    }
  };

  // Add a drill image URL. If a drill with the same URL already exists
  // (any coach/team/session), reuse that established drill instead of
  // creating a duplicate row. The database also enforces this with a
  // BEFORE INSERT trigger that cancels duplicate inserts.
  const handleAddCoachDrill = async (drill: Omit<CoachDrillRecord, 'id'>) => {
    const { data: existing, error: lookupError } = await supabase
      .from('coach_drills')
      .select('id, coach_id, team_id, schedule_id, drill_id')
      .eq('image_url', drill.url)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error('[coach_drills] duplicate lookup failed:', lookupError);
      throw new Error(lookupError.message);
    }

    if (existing) {
      console.log('[coach_drills] URL already exists, reusing drill', existing.id);
      setCoachDrills((prev) => [
        ...prev,
        {
          id: existing.id,
          coachId: existing.coach_id,
          teamId: existing.team_id,
          scheduleId: existing.schedule_id,
          url: drill.url,
          drillId: existing.drill_id ?? undefined
        }
      ]);
      return;
    }

    const drillId = generateUUID();
    const row = {
      id: drillId,
      coach_id: sanitizeUUID(drill.coachId),
      team_id: sanitizeUUID(drill.teamId),
      schedule_id: sanitizeUUID(drill.scheduleId),
      image_url: drill.url
    };

    console.log('[coach_drills] inserting', row);
    const { error } = await supabase.from('coach_drills').insert(row);
    if (error) {
      console.error('[coach_drills] insert failed:', error);
      throw new Error(error.message);
    }
    console.log('[coach_drills] saved to database');

    setCoachDrills((prev) => [
      ...prev,
      {
        id: drillId,
        coachId: row.coach_id,
        teamId: row.team_id,
        scheduleId: row.schedule_id,
        url: drill.url
      }
    ]);
  };

  const handleDeleteCoachDrill = async (drillId: string) => {
    const { error } = await supabase.from('coach_drills').delete().eq('id', drillId);
    if (error) {
      console.error('[coach_drills] delete failed:', error);
      throw new Error(error.message);
    }

    setCoachDrills((prev) => prev.filter((drill) => drill.id !== drillId));
  };

  // Attach an existing library drill to a session. The coach_drills row points at the
  // library entry (drill_id), so the trigger does not create a second copy.
  const handleAddLibraryDrillToSession = async (
    drill: LibraryDrillRecord,
    scheduleId: string,
    teamId: string
  ) => {
    const drillId = generateUUID();
    const row = {
      id: drillId,
      coach_id: sanitizeUUID(currentProfile.id),
      team_id: sanitizeUUID(teamId),
      schedule_id: sanitizeUUID(scheduleId),
      title: drill.title,
      image_url: drill.imageUrl,
      drill_id: drill.id
    };

    const { error } = await supabase.from('coach_drills').insert(row);
    if (error) {
      console.error('[coach_drills] library insert failed:', error);
      throw new Error(error.message);
    }

    setCoachDrills((prev) => [
      ...prev,
      {
        id: drillId,
        coachId: row.coach_id,
        teamId: row.team_id,
        scheduleId: row.schedule_id,
        url: drill.imageUrl,
        drillId: drill.id
      }
    ]);
  };

  // Save (insert or update) one coach evaluation for one player at one session.
  // The table allows a single row per player + session date + schedule, so saving again edits that row.
  const handleSavePlayerEvaluation = async (input: PlayerEvaluationInput) => {
    if (!currentProfile) throw new Error('You need to be signed in to save an evaluation.');

    const row = {
      team_id: sanitizeUUID(input.teamId),
      player_id: sanitizeUUID(input.playerId),
      coach_id: sanitizeUUID(currentProfile.id),
      schedule_id: sanitizeUUID(input.scheduleId || ''),
      session_date: input.sessionDate,
      attitude: input.attitude,
      effort: input.effort,
      performance: input.performance,
      leadership: input.leadership,
      notes: input.notes.trim() || null,
      updated_at: new Date().toISOString()
    };

    console.log('[player_evaluations] saving', { ...row, notes: row.notes ? '(notes)' : null });
    const { data, error } = await supabase
      .from('player_evaluations')
      .upsert(row, { onConflict: 'player_id,session_date,schedule_id' })
      .select()
      .single();

    if (error) {
      console.error('[player_evaluations] save failed:', error);
      throw new Error(error.message);
    }

    const saved = mapEvaluationRow(data);
    setPlayerEvaluations((prev) => [
      saved,
      ...prev.filter(
        (e) =>
          !(
            e.playerId === saved.playerId &&
            e.sessionDate === saved.sessionDate &&
            e.scheduleId === saved.scheduleId
          )
      )
    ]);
  };

  const handleDeletePlayerEvaluation = async (evaluationId: string) => {
    const { error } = await supabase.from('player_evaluations').delete().eq('id', evaluationId);
    if (error) {
      console.error('[player_evaluations] delete failed:', error);
      throw new Error(error.message);
    }
    setPlayerEvaluations((prev) => prev.filter((e) => e.id !== evaluationId));
  };

  const handleAddSchedule = async (schedule: Omit<TeamSchedule, 'id' | 'createdAt'>) => {
    const scheduleId = `sched-${Date.now()}`;
    const newSchedule: TeamSchedule = {
      ...schedule,
      id: scheduleId,
    };
    setTeamSchedules(prev => [...prev, newSchedule]);
    syncSupabase(scheduleId, 'teamSchedules', newSchedule);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    setTeamSchedules(prev => prev.filter(s => s.id !== scheduleId));
    setSessionAttendance(prev => prev.filter(a => a.scheduleId !== scheduleId));
    deleteSupabase(scheduleId, 'teamSchedules');
  };

  const handleUpdateSchedule = async (scheduleId: string, fields: Partial<TeamSchedule>) => {
    let updated: TeamSchedule | null = null;
    setTeamSchedules(prev =>
      prev.map(s => {
        if (s.id !== scheduleId) return s;
        updated = { ...s, ...fields };
        return updated;
      })
    );
    if (updated) {
      syncSupabase(scheduleId, 'teamSchedules', updated);
    }
  };

  const handleSaveAttendance = async (
    scheduleId: string,
    playerId: string,
    present: boolean,
    recordedBy?: string,
    meta?: { teamId?: string; sessionDate?: string; sessionTime?: string }
  ) => {
    const existing = sessionAttendance.find(a => {
      if (a.playerId !== playerId) return false;
      if (scheduleId) return a.scheduleId === scheduleId;
      return (
        a.teamId === meta?.teamId &&
        a.sessionDate === meta?.sessionDate
      );
    });

    if (existing) {
      const updated = {
        ...existing,
        present,
        recordedBy,
        teamId: meta?.teamId || existing.teamId,
        sessionDate: meta?.sessionDate || existing.sessionDate,
        sessionTime: meta?.sessionTime || existing.sessionTime,
      };
      setSessionAttendance(prev => prev.map(a =>
        a.id === existing.id ? updated : a
      ));
      syncSupabase(existing.id, 'sessionAttendance', updated);
    } else {
      const attId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newAtt: SessionAttendance = {
        id: attId,
        scheduleId: scheduleId || undefined,
        playerId,
        present,
        recordedBy,
        teamId: meta?.teamId,
        sessionDate: meta?.sessionDate,
        sessionTime: meta?.sessionTime,
      };
      setSessionAttendance(prev => [...prev, newAtt]);
      syncSupabase(attId, 'sessionAttendance', newAtt);
    }
  };

  // Handler helpers
  const handleSaveRun = async (newRunFields: Omit<RunLog, 'id' | 'playerId' | 'date'>) => {
    const runId = `run-${Date.now()}`;
    const today = new Date().toISOString().split('T')[0];
    const saved: RunLog = {
      ...newRunFields,
      id: runId,
      playerId: currentProfile.id,
      date: today
    };

    if (useFirestore) {
      try {
        await setDoc(doc(db, 'runLogs', runId), saved);
        // Check if run completed an assignment
        if (newRunFields.fromAssignmentId) {
          const matchedAssign = assignments.find(a => a.id === newRunFields.fromAssignmentId);
          if (matchedAssign) {
            const updatedAssign: Assignment = {
              ...matchedAssign,
              completedByPlayerIds: [...(matchedAssign.completedByPlayerIds || []), currentProfile.id]
            };
            await setDoc(doc(db, 'assignments', newRunFields.fromAssignmentId), updatedAssign);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `runLogs/${runId}`);
      }
    } else {
      setRunLogs((prev) => [saved, ...prev]);
      syncSupabase(runId, 'runLogs', saved);
      if (newRunFields.fromAssignmentId) {
        setAssignments((prev) =>
          prev.map((assign) => {
            if (assign.id === newRunFields.fromAssignmentId) {
              const updated = {
                ...assign,
                completedByPlayerIds: [...assign.completedByPlayerIds, currentProfile.id]
              };
              syncSupabase(assign.id, 'assignments', updated);
              return updated;
            }
            return assign;
          })
        );
      }
    }
  };

  // Profile switches
  const handleChangeProfile = (profile: UserProfile) => {
    setCurrentProfile(profile);
    setActiveTab('dashboard'); // Default
  };

  // Log active nutrition details and hydration
  const handleUpdateDailyMetrics = async (fields: Partial<DailyMetrics>) => {
    const studentIdx = currentProfile.id;
    const today = '2026-05-21'; // Sim local timeline
    
    // Compute updated state
    const records = allMetrics[studentIdx] || [];
    const matchIdx = records.findIndex(r => r.date === today);
    let targetRecord: DailyMetrics;

    if (matchIdx >= 0) {
      targetRecord = {
        ...records[matchIdx],
        ...fields
      };
    } else {
      const defaultRecord: DailyMetrics = {
        playerId: studentIdx,
        date: today,
        hydrationMls: 1500,
        hydrationGoalMls: 3000,
        sleepHours: 8,
        sleepQuality: 'Good',
        nutritionCalories: 1000,
        nutritionProteinG: 60,
        nutritionCarbsG: 120,
        nutritionFatG: 35
      };
      targetRecord = {
        ...defaultRecord,
        ...fields
      };
    }

    if (useFirestore) {
      const docId = `${studentIdx}_${today}`;
      try {
        await setDoc(doc(db, 'dailyMetrics', docId), targetRecord);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `dailyMetrics/${docId}`);
      }
    } else {
      setAllMetrics((prev) => {
        const localRecords = prev[studentIdx] || [];
        const idx = localRecords.findIndex(r => r.date === today);
        if (idx >= 0) {
          const updated = [...localRecords];
          updated[idx] = targetRecord;
          return { ...prev, [studentIdx]: updated };
        } else {
          return { ...prev, [studentIdx]: [...localRecords, targetRecord] };
        }
      });
      syncSupabase(`${studentIdx}_${today}`, 'dailyMetrics', targetRecord);
    }
  };

  const getWeekStart = (dateStr: string): string => {
    const d = new Date(dateStr);
    const day = d.getDay(); // 0=Sun,1=Mon,...
    const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  };

  const handleLogHydration = async (amountMl: number) => {
    if (!currentProfile) return;
    const today = '2026-05-21';
    const weekStart = getWeekStart(today);
    const existing = hydrationLogs.find(
      l => l.playerId === currentProfile.id && l.logDate === today
    );
    const newTotal = (existing?.hydrationMl ?? 0) + amountMl;

    // Resolve teamId/coachId with fallbacks so NOT NULL columns are never blank
    const resolvedTeamId = currentProfile.teamId
      || users.find(u => u.id === currentProfile.id)?.teamId
      || '';
    const resolvedCoachId = currentProfile.coachId
      || users.find(u => u.id === currentProfile.id)?.coachId
      || '';

    const logEntry: HydrationLog = {
      id: existing?.id ?? generateUUID(),
      playerId: currentProfile.id,
      teamId: resolvedTeamId,
      coachId: resolvedCoachId,
      hydrationMl: newTotal,
      logDate: today,
      weekStartDate: weekStart,
    };

    const updated = existing
      ? hydrationLogs.map(l => (l.id === existing.id ? logEntry : l))
      : [...hydrationLogs, logEntry];

    setHydrationLogs(updated);
    localStorage.setItem('echelon_hydration_logs', JSON.stringify(updated));

    // Persist to Supabase — upsert on player_id + log_date unique index
    const { error } = await supabase.from('hydration_logs').upsert(
      {
        id: logEntry.id,
        player_id: logEntry.playerId,
        team_id: logEntry.teamId,
        coach_id: logEntry.coachId,
        hydration_ml: logEntry.hydrationMl,
        log_date: logEntry.logDate,
        week_start_date: logEntry.weekStartDate,
      },
      { onConflict: 'player_id,log_date' }
    );
    if (error) {
      console.error('hydration_logs upsert failed:', error);
    }

    // Keep DailyMetrics hydrationMls in sync for coach goal display
    handleUpdateDailyMetrics({ hydrationMls: newTotal });
  };

  // Quizzes completed
  const handleCompleteModule = async (moduleId: string, quizScore?: { score: number; total: number }) => {
    const compId = `comp-${Date.now()}`;
    const completion: ModuleCompletion = {
      id: compId,
      playerId: currentProfile.id,
      moduleId,
      dateCompleted: new Date().toLocaleDateString(),
      quizScore
    };

    if (useFirestore) {
      try {
        await setDoc(doc(db, 'moduleCompletions', compId), completion);
        // Scan for matching course assignments
        const matches = assignments.filter(a => a.type === 'module' && a.moduleId === moduleId);
        for (const a of matches) {
          if (!a.completedByPlayerIds.includes(currentProfile.id)) {
            const updated: Assignment = {
              ...a,
              completedByPlayerIds: [...a.completedByPlayerIds, currentProfile.id]
            };
            await setDoc(doc(db, 'assignments', a.id), updated);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `moduleCompletions/${compId}`);
      }
    } else {
      setCompletions(prev => {
        const filtered = prev.filter(c => !(c.playerId === currentProfile.id && c.moduleId === moduleId));
        return [...filtered, completion];
      });
      syncSupabase(compId, 'moduleCompletions', completion);

      setAssignments((prev) =>
        prev.map((a) => {
          if (a.type === 'module' && a.moduleId === moduleId) {
            if (!a.completedByPlayerIds.includes(currentProfile.id)) {
              const updated = {
                ...a,
                completedByPlayerIds: [...a.completedByPlayerIds, currentProfile.id]
              };
              syncSupabase(a.id, 'assignments', updated);
              return updated;
            }
          }
          return a;
        })
      );
    }
  };

  // Assign dispatcher
  const handleAddAssignment = async (newAssign: Omit<Assignment, 'id' | 'completedByPlayerIds'>) => {
    const id = `assign-${Date.now()}`;
    const item: Assignment = {
      ...newAssign,
      id,
      completedByPlayerIds: []
    };

    if (useFirestore) {
      try {
        await setDoc(doc(db, 'assignments', id), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `assignments/${id}`);
      }
    } else {
      setAssignments(prev => [...prev, item]);
      syncSupabase(id, 'assignments', item);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (useFirestore) {
      try {
        await deleteDoc(doc(db, 'assignments', assignmentId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `assignments/${assignmentId}`);
        return;
      }
    } else {
      deleteSupabase(assignmentId, 'assignments');
    }
    setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
  };

  const handleUpdateProfile = async (updates: Partial<UserProfile>) => {
    if (!currentProfile) return;
    const updated: UserProfile = { ...currentProfile, ...updates };
    if (dbMode === 'supabase') {
      await supabaseService.saveDocument(updated.id, 'users', updated);
    } else if (useFirestore) {
      await setDoc(doc(db, 'users', updated.id), updated);
    }
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setCurrentProfile(updated);
    localStorage.setItem('echelon_current_profile', JSON.stringify(updated));
  };

  // Coaching goal update
  const handleUpdatePlayerGoal = async (playerId: string, updatedGoals: Partial<DailyMetrics>) => {
    const today = '2026-05-21';
    const records = allMetrics[playerId] || [];
    const matchIdx = records.findIndex(r => r.date === today);
    let target: DailyMetrics;

    if (matchIdx >= 0) {
      target = { ...records[matchIdx], ...updatedGoals };
    } else {
      target = {
        playerId,
        date: today,
        hydrationMls: 1500,
        hydrationGoalMls: 3000,
        sleepHours: 8,
        sleepQuality: 'Good',
        nutritionCalories: 1000,
        nutritionProteinG: 60,
        nutritionCarbsG: 120,
        nutritionFatG: 35,
        ...updatedGoals
      };
    }

    if (useFirestore) {
      const docId = `${playerId}_${today}`;
      try {
        await setDoc(doc(db, 'dailyMetrics', docId), target);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `dailyMetrics/${docId}`);
      }
    } else {
      setAllMetrics((prev) => {
        const localRecords = prev[playerId] || [];
        const idx = localRecords.findIndex(r => r.date === today);
        if (idx >= 0) {
          const updated = [...localRecords];
          updated[idx] = target;
          return { ...prev, [playerId]: updated };
        } else {
          return { ...prev, [playerId]: [...localRecords, target] };
        }
      });
      syncSupabase(`${playerId}_${today}`, 'dailyMetrics', target);
    }
  };

  // Admin Request Approvals workflow
  const handleApproveRequest = async (reqId: string, type: 'association' | 'club' | 'team' | 'coach') => {
    const matchedReq = requests.find(r => r.id === reqId);
    if (!matchedReq) return;

    const targetId = `sim-${type}-${Date.now().toString().slice(-4)}`;

    if (useFirestore) {
      try {
        const batch = writeBatch(db);

        // Update request status
        batch.set(doc(db, 'requests', reqId), {
          ...matchedReq,
          status: 'approved'
        });

        if (type === 'association') {
          const instance: Association = { 
            id: targetId, 
            name: matchedReq.name, 
            contactEmail: matchedReq.contactEmail, 
            approved: true,
            UUID: targetId,
            association_name: matchedReq.name,
            association_email: matchedReq.contactEmail,
            create_at: new Date().toISOString()
          };
          batch.set(doc(db, 'associations', targetId), instance);
        } else if (type === 'club') {
          const timestamp = new Date().toISOString();
          const instance: Club = { 
            id: targetId, 
            name: matchedReq.name, 
            associationId: matchedReq.parentOrgId || 'assoc-1', 
            contactEmail: matchedReq.contactEmail, 
            approved: true,
            UUID: targetId,
            club_name: matchedReq.name,
            club_email: matchedReq.contactEmail,
            association_id: matchedReq.parentOrgId || 'assoc-1',
            create_at: timestamp
          };
          batch.set(doc(db, 'clubs', targetId), instance);
        } else if (type === 'team') {
          const instance: Team = { id: targetId, name: matchedReq.name, clubId: matchedReq.parentOrgId || 'club-1', contactEmail: matchedReq.contactEmail, approved: true };
          batch.set(doc(db, 'teams', targetId), instance);
        } else if (type === 'coach') {
          const instance: Coach = { id: targetId, name: matchedReq.name, email: matchedReq.contactEmail, teamId: matchedReq.parentOrgId || 'team-1', approved: true };
          batch.set(doc(db, 'coaches', targetId), instance);
          
          const userProf: UserProfile = {
            id: `user-coach-${targetId}`,
            name: matchedReq.name,
            email: matchedReq.contactEmail,
            role: 'coach',
            associationId: 'assoc-1',
            clubId: 'club-1',
            teamId: matchedReq.parentOrgId || 'team-1',
            coachId: targetId,
            approved: true
          };
          batch.set(doc(db, 'users', `user-coach-${targetId}`), userProf);
        }

        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `requests/${reqId}`);
      }
    } else {
      // 1. Move statuses in approvals state
      setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'approved' } : r));

      // 2. Synthesize to matching database taxonomic lists
      if (type === 'association') {
        const instance: Association = { id: targetId, name: matchedReq.name, contactEmail: matchedReq.contactEmail, approved: true };
        setAssociations(prev => [...prev, instance]);
      } else if (type === 'club') {
        const timestamp = new Date().toISOString();
        const instance: Club = { 
          id: targetId, 
          name: matchedReq.name, 
          associationId: matchedReq.parentOrgId || 'assoc-1', 
          contactEmail: matchedReq.contactEmail, 
          approved: true,
          UUID: targetId,
          club_name: matchedReq.name,
          club_email: matchedReq.contactEmail,
          association_id: matchedReq.parentOrgId || 'assoc-1',
          create_at: timestamp
        };
        setClubs(prev => [...prev, instance]);
      } else if (type === 'team') {
        const instance: Team = { id: targetId, name: matchedReq.name, clubId: matchedReq.parentOrgId || 'club-1', contactEmail: matchedReq.contactEmail, approved: true };
        setTeams(prev => [...prev, instance]);
      } else if (type === 'coach') {
        const instance: Coach = { id: targetId, name: matchedReq.name, email: matchedReq.contactEmail, teamId: matchedReq.parentOrgId || 'team-1', approved: true };
        setCoaches(prev => [...prev, instance]);
        
        const userProf: UserProfile = {
          id: `user-coach-${targetId}`,
          name: matchedReq.name,
          email: matchedReq.contactEmail,
          role: 'coach',
          associationId: 'assoc-1',
          clubId: 'club-1',
          teamId: matchedReq.parentOrgId || 'team-1',
          coachId: targetId,
          approved: true
        };
        setUsers(prev => [...prev, userProf]);
      }
    }
  };

  const handleRejectRequest = async (reqId: string) => {
    const matchedReq = requests.find(r => r.id === reqId);
    if (useFirestore && matchedReq) {
      try {
        await setDoc(doc(db, 'requests', reqId), {
          ...matchedReq,
          status: 'rejected'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `requests/${reqId}`);
      }
    } else {
      setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'rejected' } : r));
    }
  };

  const handleRequestJoin = async (newReq: Omit<OrgProfileRequest, 'id' | 'createdAt' | 'status'>) => {
    const reqId = `req-${Date.now()}`;
    const item: OrgProfileRequest = {
      ...newReq,
      id: reqId,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    if (useFirestore) {
      try {
        await setDoc(doc(db, 'requests', reqId), item);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `requests/${reqId}`);
      }
    } else {
      setRequests(prev => [...prev, item]);
    }
  };

  const handleQuickRegisterPlayer = async (newPl: Omit<UserProfile, 'id' | 'approved'>) => {
    const plId = `user-player-${Date.now()}`;
    const user: UserProfile = {
      ...newPl,
      id: plId,
      approved: true
    };

    const newPlayer: Player = {
      id: plId,
      name: user.name,
      email: user.email,
      coachId: user.coachId || '',
      teamId: user.teamId || '',
      approved: true,
      UUID: plId,
      player_name: user.name,
      player_email: user.email,
      create_at: new Date().toISOString()
    };

    if (useFirestore) {
      try {
        await setDoc(doc(db, 'users', plId), user);
        await setDoc(doc(db, 'players', plId), newPlayer);
        setCurrentProfile(user); // Sign in immediately
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${plId}`);
      }
    } else {
      setUsers(prev => [...prev, user]);
      setPlayers(prev => [...prev, newPlayer]);
      setCurrentProfile(user); // Sign in immediately
    }
  };

  const handleAddAssociationDirect = async (newAssoc: Omit<Association, 'id' | 'approved'>) => {
    const id = `assoc-${Date.now()}`;
    const assoc: Association = {
      ...newAssoc,
      id,
      approved: true,
      UUID: id,
      association_name: newAssoc.name,
      association_email: newAssoc.contactEmail,
      create_at: new Date().toISOString()
    };

    if (useFirestore) {
      try {
        await setDoc(doc(db, 'associations', id), assoc);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `associations/${id}`);
      }
    }
    
    setAssociations(prev => {
      if (prev.some(a => a.id === id)) return prev;
      return [...prev, assoc];
    });
  };

  const handleAddClubDirect = async (newClub: Omit<Club, 'id' | 'approved'>) => {
    const rawAssocId = newClub.associationId;
    if (!rawAssocId) return;

    // Resolve association ID correctly based on Supabase UUID schema requirements
    const assocId = dbMode === 'supabase' ? sanitizeUUID(rawAssocId) : rawAssocId;

    // 1. Generate unique identifiers and Timestamp
    const clubDocRef = doc(collection(db, 'clubs'));
    const id = dbMode === 'supabase' ? generateUUID() : (useFirestore ? clubDocRef.id : `club-${Date.now()}`);
    const timestamp = new Date().toISOString();

    // 2. Build the new Club object with all requested attributes
    const club: Club = {
      id,
      name: newClub.name,
      associationId: assocId,
      contactEmail: newClub.contactEmail,
      approved: true,
      UUID: id,
      club: newClub.name,
      club_name: newClub.name,
      club_email: newClub.contactEmail,
      club_contact: newClub.contactEmail,
      association_id: assocId,
      create_at: timestamp
    };

    // 3. Find existing association and enrich/update columns
    const existingAssoc = associations.find(a => a.id === assocId || a.id === rawAssocId);
    const mergedAssoc: Association = {
      id: assocId,
      name: existingAssoc?.name || "League Governing Body",
      contactEmail: existingAssoc?.contactEmail || "",
      approved: true,
      ...existingAssoc,
      club: newClub.name,
      club_name: newClub.name,
      club_email: newClub.contactEmail
    };

    // 4. Persist to DB store (Supabase or Firestore)
    if (dbMode === 'supabase') {
      try {
        console.log(`Directly provisioning new Club: ${newClub.name} in Supabase`);
        await supabaseService.saveDocument(id, 'clubs', club);
        await supabaseService.saveDocument(assocId, 'associations', mergedAssoc);
      } catch (err: any) {
        console.error("Supabase Direct Club Save Error:", err);
        throw new Error(`Supabase write failed: ${err.message || String(err)}`);
      }
    } else {
      if (useFirestore) {
        try {
          console.log(`Directly provisioning new Club: ${newClub.name} in Firestore`);
          await setDoc(doc(db, 'clubs', id), club);
          await setDoc(doc(db, 'associations', assocId), mergedAssoc);
        } catch (err: any) {
          console.error("Firestore Direct Club Save Error:", err);
          throw new Error(`Firestore write failed: ${err.message || String(err)}`);
        }
      }
    }

    // 5. Update local screen states immediately for instant user UI reactivity
    setClubs(prev => {
      if (prev.some(c => c.id === id)) {
        return prev.map(c => c.id === id ? club : c);
      }
      return [...prev, club];
    });

    setAssociations(prev => {
      if (prev.some(a => a.id === assocId)) {
        return prev.map(a => a.id === assocId ? mergedAssoc : a);
      }
      return [...prev, mergedAssoc];
    });
  };

  const handleAddTeamDirect = async (newTeam: Omit<Team, 'id' | 'approved'>) => {
    const rawClubId = newTeam.clubId;
    const clubId = dbMode === 'supabase' ? sanitizeUUID(rawClubId) : rawClubId;
    
    const id = dbMode === 'supabase' ? generateUUID() : (useFirestore ? doc(collection(db, 'teams')).id : `team-${Date.now()}`);
    const timestamp = new Date().toISOString();
    const team: Team = {
      ...newTeam,
      id,
      clubId,
      approved: true,
      create_at: timestamp
    };

    if (dbMode === 'supabase') {
      try {
        console.log(`Directly provisioning new Team: ${newTeam.name} in Supabase`);
        await supabaseService.saveDocument(id, 'teams', team);
      } catch (err: any) {
        console.error("Supabase Direct Team Save Error:", err);
        throw new Error(`Supabase write failed: ${err.message || String(err)}`);
      }
    } else {
      if (useFirestore) {
        try {
          await setDoc(doc(db, 'teams', id), team);
        } catch (err: any) {
          console.error("Firestore Direct Team Save Error:", err);
          throw new Error(`Firestore write failed: ${err.message || String(err)}`);
        }
      }
    }
    
    setTeams(prev => {
      if (prev.some(t => t.id === id)) return prev;
      return [...prev, team];
    });
  };

  const handleAddCoachDirect = async (coachData: { name: string; email: string; teamId: string }) => {
    const rawTeamId = coachData.teamId;
    const teamId = dbMode === 'supabase' ? sanitizeUUID(rawTeamId) : rawTeamId;

    const coachId = dbMode === 'supabase' ? generateUUID() : (useFirestore ? doc(collection(db, 'coaches')).id : `coach-${Date.now()}`);
    const timestamp = new Date().toISOString();

    const matchingTeam = teams.find(t => t.id === teamId || t.id === rawTeamId);
    const teamName = matchingTeam ? matchingTeam.name : coachData.teamId;

    const coach: Coach = {
      id: coachId,
      name: coachData.name,
      email: coachData.email,
      teamId,
      teamIds: [teamId],
      approved: true,
      UUID: coachId,
      coach: coachData.name,
      coach_email: coachData.email,
      team: teamName,
      create_at: timestamp
    };

    if (dbMode === 'supabase') {
      try {
        console.log(`Directly provisioning new Coach: ${coachData.name} in Supabase`);
        await supabaseService.saveDocument(coachId, 'coaches', coach);
      } catch (err: any) {
        console.error("Supabase Direct Coach Save Error:", err);
        throw new Error(`Supabase write failed: ${err.message || String(err)}`);
      }
    } else {
      if (useFirestore) {
        try {
          await setDoc(doc(db, 'coaches', coachId), coach);
        } catch (err: any) {
          console.error("Firestore Direct Coach Save Error:", err);
          throw new Error(`Firestore write failed: ${err.message || String(err)}`);
        }
      }
    }
    
    setCoaches(prev => {
      if (prev.some(c => c.id === coachId)) return prev;
      return [...prev, coach];
    });
  };

  const handleCompleteCoachOnboarding = async (data: {
    teamName: string;
    clubId?: string;
    newClubName?: string;
    newClubEmail?: string;
    associationId?: string;
    newAssociationName?: string;
    newAssociationEmail?: string;
  }) => {
    if (!currentProfile) return;

    let targetAssocId = data.associationId;
    let targetClubId = data.clubId;
    const targetTeamId = `team-${Date.now()}`;

    const batch = useFirestore ? writeBatch(db) : null;

    // 1. Resolve Association
    let newAssoc: Association | null = null;
    if (!targetAssocId && data.newAssociationName) {
      targetAssocId = `assoc-${Date.now()}`;
      newAssoc = {
        id: targetAssocId,
        name: data.newAssociationName,
        contactEmail: data.newAssociationEmail || '',
        approved: true,
        UUID: targetAssocId,
        association_name: data.newAssociationName,
        association_email: data.newAssociationEmail || '',
        create_at: new Date().toISOString()
      };
      if (batch) {
        batch.set(doc(db, 'associations', targetAssocId), newAssoc);
      }
      setAssociations(prev => [...prev, newAssoc!]);
    }

    // 2. Resolve Club
    let newClub: Club | null = null;
    if (!targetClubId && data.newClubName && targetAssocId) {
      targetClubId = `club-${Date.now()}`;
      const timestamp = new Date().toISOString();
      newClub = {
        id: targetClubId,
        name: data.newClubName,
        contactEmail: data.newClubEmail || '',
        associationId: targetAssocId,
        approved: true,
        UUID: targetClubId,
        club_name: data.newClubName,
        club_email: data.newClubEmail || '',
        association_id: targetAssocId,
        create_at: timestamp
      };
      if (batch) {
        batch.set(doc(db, 'clubs', targetClubId), newClub);
      }
      setClubs(prev => [...prev, newClub!]);
    }

    // 3. Create Team
    let newTeam: Team | null = null;
    if (targetClubId) {
      newTeam = {
        id: targetTeamId,
        name: data.teamName,
        contactEmail: currentProfile.email,
        clubId: targetClubId,
        approved: true
      };
      if (batch) {
        batch.set(doc(db, 'teams', targetTeamId), newTeam);
      }
      setTeams(prev => [...prev, newTeam!]);
    }

    // 4. Update Coach entity
    const existingCoachId = currentProfile.coachId || `coach-${Date.now()}`;
    const updatedCoachEntity: Coach = {
      id: existingCoachId,
      name: currentProfile.name,
      email: currentProfile.email,
      teamId: targetTeamId,
      teamIds: [targetTeamId],
      approved: true,
      UUID: existingCoachId,
      coach: currentProfile.name,
      coach_email: currentProfile.email,
      team: data.teamName,
      create_at: new Date().toISOString()
    };

    if (batch) {
      batch.set(doc(db, 'coaches', existingCoachId), updatedCoachEntity);
    }
    setCoaches(prev => {
      const filtered = prev.filter(c => c.id !== existingCoachId);
      return [...filtered, updatedCoachEntity];
    });

    // 5. Update user profile
    const updatedProfile: UserProfile = {
      ...currentProfile,
      coachId: existingCoachId,
      teamId: targetTeamId,
      teamIds: [targetTeamId],
      clubId: targetClubId,
      associationId: targetAssocId
    };

    if (batch) {
      batch.set(doc(db, 'users', currentProfile.id), updatedProfile);
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `onboarding/${currentProfile.id}`);
      }
    }
    
    setUsers(prev => prev.map(u => u.id === currentProfile.id ? updatedProfile : u));

    setCurrentProfile(updatedProfile);
    // Keep cached if session says so
    if (localStorage.getItem('echelon_current_profile')) {
      localStorage.setItem('echelon_current_profile', JSON.stringify(updatedProfile));
    }
  };

  const handleSwitchActiveTeam = async (newTeamId: string) => {
    if (!currentProfile || currentProfile.role !== 'coach') return;
    
    const updatedProfile: UserProfile = {
      ...currentProfile,
      teamId: newTeamId
    };

    if (useFirestore) {
      try {
        await setDoc(doc(db, 'users', currentProfile.id), updatedProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentProfile.id}`);
      }
    } else {
      setUsers(prev => prev.map(u => u.id === currentProfile.id ? updatedProfile : u));
    }

    setCurrentProfile(updatedProfile);
    if (localStorage.getItem('echelon_current_profile')) {
      localStorage.setItem('echelon_current_profile', JSON.stringify(updatedProfile));
    }
  };

  const handlePlayerSignup = async (fields: { 
    name: string; 
    email: string; 
    password?: string;
    coachId?: string; 
    teamId?: string;
    staySignedIn: boolean; 
  }) => {
    let plId = `user-player-${Date.now()}`;
    const emailKey = fields.email.toLowerCase().trim();
    localStorage.setItem(`echelon_intended_role_${emailKey}`, 'player');
    
    if (useSupabase && fields.password) {
      try {
        const { data: suData, error: suError } = await supabase.auth.signUp({
          email: fields.email,
          password: fields.password
        });
        if (suError) throw suError;
        if (suData.user?.id) {
          plId = suData.user.id;
        }
      } catch (err: any) {
        console.error("Supabase Auth signup error:", err);
        throw err;
      }
    } else if (useFirestore && fields.password) {
      try {
        const userCred = await createUserWithEmailAndPassword(auth, fields.email, fields.password);
        plId = userCred.user.uid;
      } catch (err: any) {
        console.error("Firebase Auth signup error:", err);
        if (err.code === 'auth/email-already-in-use') {
          throw new Error("This email is already registered on Echelon's security firewall.");
        }
        if (err.code === 'auth/operation-not-allowed') {
          throw new Error("Email/Password Authentication is not enabled in your Firebase Console. Please go to the Firebase Console -> Authentication -> Sign-in Method, enable the 'Email/Password' provider, and then try signing up again!");
        }
        throw err;
      }
    }

    let matchCoach = undefined;
    if (fields.coachId) {
      matchCoach = coaches.find(c => c.id === fields.coachId);
    }

    let resolvedTeamId = fields.teamId;
    let resolvedClubId = undefined;
    let resolvedAssocId = undefined;

    if (!resolvedTeamId && matchCoach) {
      resolvedTeamId = matchCoach.teamId;
    }

    if (resolvedTeamId) {
      const matchTeam = teams.find(t => t.id === resolvedTeamId);
      if (matchTeam) {
        resolvedClubId = matchTeam.clubId;
        const matchClub = clubs.find(c => c.id === matchTeam.clubId);
        if (matchClub) {
          resolvedAssocId = matchClub.associationId;
        }
      }
    }

    const newProfile: UserProfile = {
      id: plId,
      name: fields.name,
      email: fields.email,
      role: 'player',
      coachId: fields.coachId || undefined,
      teamId: resolvedTeamId,
      clubId: resolvedClubId,
      associationId: resolvedAssocId,
      approved: true
    };

    const newPlayer: Player = {
      id: plId,
      name: fields.name,
      email: fields.email,
      coachId: fields.coachId || '',
      teamId: resolvedTeamId || '',
      approved: true,
      UUID: plId,
      player_name: fields.name,
      player_email: fields.email,
      create_at: new Date().toISOString()
    };

    if (useSupabase) {
      try {
        await supabaseService.saveDocument(plId, 'users', newProfile);
      } catch (err: any) {
        console.warn("Supabase Save Player user profile Error (handled/non-blocking):", err);
      }
      try {
        await supabaseService.saveDocument(plId, 'players', newPlayer);
      } catch (err: any) {
        console.warn("Supabase Save Player Entity Error (handled/non-blocking):", err);
      }
      setUsers(prev => prev.some(u => u.id === plId) ? prev : [...prev, newProfile]);
      setPlayers(prev => prev.some(p => p.id === plId) ? prev : [...prev, newPlayer]);
    } else if (useFirestore) {
      try {
        await setDoc(doc(db, 'users', plId), newProfile);
        await setDoc(doc(db, 'players', plId), newPlayer);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${plId}`);
      }
    } else {
      setUsers(prev => [...prev, newProfile]);
      setPlayers(prev => [...prev, newPlayer]);
    }

    setCurrentProfile(newProfile);
    if (fields.staySignedIn) {
      localStorage.setItem('echelon_current_profile', JSON.stringify(newProfile));
    }
  };

  const handleParentSignup = async (fields: {
    parentName: string;
    parentEmail: string;
    parentPassword?: string;
    coachId?: string;
    coachIds?: string[];
    teamIds?: string[];
    staySignedIn: boolean;
  }) => {
    let parentId = `user-parent-${Date.now()}`;
    const emailKey = fields.parentEmail.toLowerCase().trim();
    localStorage.setItem(`echelon_intended_role_${emailKey}`, 'parent');
    
    if (useSupabase && fields.parentPassword) {
      try {
        const { data: suData, error: suError } = await supabase.auth.signUp({
          email: fields.parentEmail,
          password: fields.parentPassword
        });
        if (suError) throw suError;
        if (suData.user?.id) {
          parentId = suData.user.id;
        }
      } catch (err: any) {
        console.error("Supabase Auth parent signup error:", err);
        throw err;
      }
    } else if (useFirestore && fields.parentPassword) {
      try {
        const userCred = await createUserWithEmailAndPassword(auth, fields.parentEmail, fields.parentPassword);
        parentId = userCred.user.uid;
      } catch (err: any) {
        console.error("Firebase Auth parent signup error:", err);
        if (err.code === 'auth/email-already-in-use') {
          throw new Error("This email is already registered on Echelon's security firewall.");
        }
        if (err.code === 'auth/operation-not-allowed') {
          throw new Error("Email/Password Authentication is not enabled in your Firebase Console. Please go to the Firebase Console -> Authentication -> Sign-in Method, enable the 'Email/Password' provider, and then try signing up again!");
        }
        throw err;
      }
    }

    let resolvedTeamId = undefined;
    let resolvedClubId = undefined;
    let resolvedAssocId = undefined;
    const parentTeamIds = fields.teamIds && fields.teamIds.length > 0 ? fields.teamIds : undefined;

    if (parentTeamIds) {
      resolvedTeamId = parentTeamIds[0];
    } else if (fields.coachId) {
      const matchCoach = coaches.find(c => c.id === fields.coachId);
      if (matchCoach) {
        resolvedTeamId = matchCoach.teamId || (matchCoach.teamIds && matchCoach.teamIds[0]) || undefined;
      }
    }

    if (resolvedTeamId) {
      const matchTeam = teams.find(t => t.id === resolvedTeamId);
      if (matchTeam) {
        resolvedClubId = matchTeam.clubId;
        const matchClub = clubs.find(c => c.id === matchTeam.clubId);
        if (matchClub) {
          resolvedAssocId = matchClub.associationId;
        }
      }
    }

    const parentProfile: UserProfile = {
      id: parentId,
      name: fields.parentName,
      email: fields.parentEmail,
      role: 'parent',
      coachId: fields.coachId || undefined,
      coachIds: fields.coachIds && fields.coachIds.length > 0 ? fields.coachIds : undefined,
      teamId: resolvedTeamId,
      teamIds: parentTeamIds,
      clubId: resolvedClubId,
      associationId: resolvedAssocId,
      approved: true
    };

    if (useSupabase) {
      try {
        await supabaseService.saveDocument(parentId, 'users', parentProfile);
      } catch (err: any) {
        console.warn("Supabase Save Parent profile Error (handled/non-blocking):", err);
      }
      setUsers(prev => {
        const existing = prev.some(u => u.id === parentProfile.id);
        return existing ? prev : [...prev, parentProfile];
      });
    } else if (useFirestore) {
      try {
        await setDoc(doc(db, 'users', parentId), parentProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${parentId}`);
      }
    } else {
      setUsers(prev => [...prev, parentProfile]);
    }

    setCurrentProfile(parentProfile);
    if (fields.staySignedIn) {
      localStorage.setItem('echelon_current_profile', JSON.stringify(parentProfile));
    }
  };

  const handleParentAddPlayer = async (fields: { firstName: string; surname: string; coachId?: string; teamId?: string }) => {
    if (!currentProfile) return;
    const plId = generateUUID();
    const fullName = `${fields.firstName} ${fields.surname}`.trim();
    const playerEmail = `${fields.firstName.trim().toLowerCase()}.${fields.surname.trim().toLowerCase().replace(/\s+/g, '-')}@pdp.com`;

    let resolvedTeamId: string | undefined = fields.teamId;
    let resolvedClubId: string | undefined;
    let resolvedAssocId: string | undefined;

    // Resolve coach from the selected team when no explicit coachId is passed.
    let resolvedCoachId: string | undefined = fields.coachId;
    if (!resolvedCoachId && resolvedTeamId) {
      const teamCoach = coaches.find(c =>
        c.teamId === resolvedTeamId || (c.teamIds || []).includes(resolvedTeamId)
      );
      if (teamCoach) resolvedCoachId = teamCoach.id;
    }
    if (!resolvedCoachId) resolvedCoachId = currentProfile.coachId || undefined;

    if (!resolvedTeamId) {
      const matchCoach = resolvedCoachId ? coaches.find(c => c.id === resolvedCoachId) : undefined;
      if (matchCoach) {
        resolvedTeamId = matchCoach.teamId || (matchCoach.teamIds && matchCoach.teamIds[0]) || undefined;
      }
    }

    if (resolvedTeamId) {
      const matchTeam = teams.find(t => t.id === resolvedTeamId);
      if (matchTeam) {
        resolvedClubId = matchTeam.clubId;
        const matchClub = clubs.find(c => c.id === matchTeam.clubId);
        if (matchClub) {
          resolvedAssocId = matchClub.associationId;
        }
      }
    }

    // Duplicate guard: the same athlete must not be added twice to one team (or under the same coach).
    // Checks the users and players tables together, so a spouse's earlier entry is caught even on another device.
    const normName = (s: string) =>
      (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const wantedName = normName(fullName);
    const existingDupe = [...users.filter(u => u.role === 'player'), ...players].find(p => {
      if (!p || p.id === plId) return false;
      const sameTeam = !!resolvedTeamId && (p.teamId || '').trim().toLowerCase() === resolvedTeamId.trim().toLowerCase();
      const sameCoach = !!resolvedCoachId && (p.coachId || '').trim().toLowerCase() === resolvedCoachId.trim().toLowerCase();
      return normName(p.name || '') === wantedName && (sameTeam || sameCoach);
    });
    if (existingDupe) {
      throw new Error(
        `${existingDupe.name} is already on this team. Choose them from the list instead of adding a new athlete.`
      );
    }

    const newProfile: UserProfile = {
      id: plId,
      name: fullName,
      email: playerEmail,
      role: 'player',
      coachId: resolvedCoachId,
      teamId: resolvedTeamId,
      clubId: resolvedClubId,
      associationId: resolvedAssocId,
      approved: true,
      parentUserId: currentProfile.id
    };

    const newPlayer: Player = {
      id: plId,
      name: fullName,
      email: playerEmail,
      coachId: resolvedCoachId || '',
      teamId: resolvedTeamId || '',
      approved: true,
      UUID: plId,
      player_name: fullName,
      player_email: playerEmail,
      create_at: new Date().toISOString()
    };

    if (useSupabase) {
      try {
        await supabaseService.saveDocument(plId, 'users', newProfile);
      } catch (err: any) {
        console.warn("Supabase Save Player user profile Error (handled/non-blocking):", err);
      }
      try {
        await supabaseService.saveDocument(plId, 'players', newPlayer);
      } catch (err: any) {
        console.warn("Supabase Save Player Entity Error (handled/non-blocking):", err);
      }
    } else if (useFirestore) {
      try {
        await setDoc(doc(db, 'users', plId), newProfile);
        await setDoc(doc(db, 'players', plId), newPlayer);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${plId}`);
      }
    }

    setUsers(prev => prev.some(u => u.id === plId) ? prev : [...prev, newProfile]);
    setPlayers(prev => prev.some(p => p.id === plId) ? prev : [...prev, newPlayer]);

    const existingChildIds = currentProfile.childPlayerIds
      ? [...currentProfile.childPlayerIds]
      : (currentProfile.childPlayerId ? [currentProfile.childPlayerId] : []);
    const updatedParent: UserProfile = {
      ...currentProfile,
      childPlayerId: currentProfile.childPlayerId || plId,
      childPlayerIds: Array.from(new Set([...existingChildIds, plId]))
    };

    if (useSupabase) {
      try {
        await supabaseService.saveDocument(updatedParent.id, 'users', updatedParent);
      } catch (err: any) {
        console.warn("Supabase Save Parent profile Error (handled/non-blocking):", err);
      }
    } else if (useFirestore) {
      try {
        await setDoc(doc(db, 'users', updatedParent.id), updatedParent);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${updatedParent.id}`);
      }
    }

    setUsers(prev => prev.map(u => u.id === updatedParent.id ? updatedParent : u));
    setCurrentProfile(updatedParent);
    localStorage.setItem('echelon_current_profile', JSON.stringify(updatedParent));
  };

  const handleLinkExistingChild = async (playerId: string) => {
    if (!currentProfile) return;
    const existingChildIds = currentProfile.childPlayerIds
      ? [...currentProfile.childPlayerIds]
      : (currentProfile.childPlayerId ? [currentProfile.childPlayerId] : []);
    if (existingChildIds.includes(playerId)) return;

    const updatedProfile: UserProfile = {
      ...currentProfile,
      childPlayerId: currentProfile.childPlayerId || playerId,
      childPlayerIds: Array.from(new Set([...existingChildIds, playerId]))
    };

    if (useSupabase) {
      try {
        await supabaseService.saveDocument(updatedProfile.id, 'users', updatedProfile);
      } catch (err: any) {
        console.warn("Supabase Save profile link child Error (handled/non-blocking):", err);
      }
    } else if (useFirestore) {
      try {
        await setDoc(doc(db, 'users', updatedProfile.id), updatedProfile);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${updatedProfile.id}`);
      }
    }

    const updatedPlayer = users.find(u => u.id === playerId);
    if (updatedPlayer) {
      const patchedPlayer: UserProfile = { ...updatedPlayer, parentUserId: currentProfile.id };
      if (useSupabase) {
        try {
          await supabaseService.saveDocument(patchedPlayer.id, 'users', patchedPlayer);
        } catch (err: any) {
          console.warn("Supabase Save player parent link Error (handled/non-blocking):", err);
        }
      } else if (useFirestore) {
        try {
          await setDoc(doc(db, 'users', patchedPlayer.id), patchedPlayer);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${patchedPlayer.id}`);
        }
      }
      setUsers(prev => prev.map(u => u.id === patchedPlayer.id ? patchedPlayer : u));
    }

    setUsers(prev => prev.map(u => u.id === updatedProfile.id ? updatedProfile : u));
    setCurrentProfile(updatedProfile);
    localStorage.setItem('echelon_current_profile', JSON.stringify(updatedProfile));
  };

  const handleSaveRunForChild = async (newRunFields: Omit<RunLog, 'id' | 'playerId' | 'date'> & { playerId?: string }) => {
    const playerId = newRunFields.playerId || currentProfile.id;
    const runId = `run-${Date.now()}`;
    const today = new Date().toISOString().split('T')[0];
    const { playerId: _, ...restFields } = newRunFields;
    const saved: RunLog = {
      ...restFields,
      id: runId,
      playerId,
      date: today,
    };

    if (useFirestore) {
      try {
        await setDoc(doc(db, 'runLogs', runId), saved);
        if (saved.fromAssignmentId) {
          const matchedAssign = assignments.find(a => a.id === saved.fromAssignmentId);
          if (matchedAssign) {
            const updatedAssign: Assignment = {
              ...matchedAssign,
              completedByPlayerIds: [...(matchedAssign.completedByPlayerIds || []), playerId]
            };
            await setDoc(doc(db, 'assignments', saved.fromAssignmentId), updatedAssign);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `runLogs/${runId}`);
      }
    } else {
      setRunLogs((prev) => [saved, ...prev]);
      syncSupabase(runId, 'runLogs', saved);
      if (saved.fromAssignmentId) {
        setAssignments((prev) =>
          prev.map((assign) => {
            if (assign.id === saved.fromAssignmentId) {
              const updated = {
                ...assign,
                completedByPlayerIds: [...assign.completedByPlayerIds, playerId]
              };
              syncSupabase(assign.id, 'assignments', updated);
              return updated;
            }
            return assign;
          })
        );
      }
    }
  };

  const handleLogHydrationForChild = async (amountMl: number, playerId?: string) => {
    const targetPlayerId = playerId || currentProfile.id;
    const today = '2026-05-21';
    const weekStart = getWeekStart(today);
    const existing = hydrationLogs.find(
      l => l.playerId === targetPlayerId && l.logDate === today
    );
    const newTotal = (existing?.hydrationMl ?? 0) + amountMl;

    const resolvedTeamId = users.find(u => u.id === targetPlayerId)?.teamId || '';
    const resolvedCoachId = users.find(u => u.id === targetPlayerId)?.coachId || '';

    const logEntry: HydrationLog = {
      id: existing?.id ?? generateUUID(),
      playerId: targetPlayerId,
      teamId: resolvedTeamId,
      coachId: resolvedCoachId,
      hydrationMl: newTotal,
      logDate: today,
      weekStartDate: weekStart,
    };

    const updated = existing
      ? hydrationLogs.map(l => (l.id === existing.id ? logEntry : l))
      : [...hydrationLogs, logEntry];

    setHydrationLogs(updated);
    localStorage.setItem('echelon_hydration_logs', JSON.stringify(updated));

    const { error } = await supabase.from('hydration_logs').upsert(
      {
        id: logEntry.id,
        player_id: logEntry.playerId,
        team_id: logEntry.teamId,
        coach_id: logEntry.coachId,
        hydration_ml: logEntry.hydrationMl,
        log_date: logEntry.logDate,
        week_start_date: logEntry.weekStartDate,
      },
      { onConflict: 'player_id,log_date' }
    );
    if (error) {
      console.error('hydration_logs upsert failed:', error);
    }

    handleParentUpdatePlayerMetrics(targetPlayerId, { hydrationMls: newTotal });
  };

  const handleParentUpdatePlayerMetrics = async (playerId: string, fields: Partial<DailyMetrics>) => {
    const today = '2026-05-21'; // Sim local timeline
    
    const records = allMetrics[playerId] || [];
    const matchIdx = records.findIndex(r => r.date === today);
    let targetRecord: DailyMetrics;

    if (matchIdx >= 0) {
      targetRecord = {
        ...records[matchIdx],
        ...fields
      };
    } else {
      const defaultRecord: DailyMetrics = {
        playerId: playerId,
        date: today,
        hydrationMls: 1500,
        hydrationGoalMls: 3000,
        sleepHours: 8,
        sleepQuality: 'Good',
        nutritionCalories: 1000,
        nutritionProteinG: 60,
        nutritionCarbsG: 120,
        nutritionFatG: 35
      };
      targetRecord = {
        ...defaultRecord,
        ...fields
      };
    }

    if (useFirestore) {
      const docId = `${playerId}_${today}`;
      try {
        await setDoc(doc(db, 'dailyMetrics', docId), targetRecord);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `dailyMetrics/${docId}`);
      }
    }

    setAllMetrics(prev => {
      const existing = prev[playerId] || [];
      const index = existing.findIndex(m => m.date === today);
      const updatedList = [...existing];
      if (index >= 0) {
        updatedList[index] = targetRecord;
      } else {
        updatedList.push(targetRecord);
      }
      return {
        ...prev,
        [playerId]: updatedList
      };
    });
  };

  const handleCoachSignup = async (fields: { 
    name: string; 
    email: string; 
    password?: string;
    teamId?: string; 
    teamIds?: string[];
    coachRole: 'head' | 'assistant';
    staySignedIn: boolean; 
  }) => {
    let clId = `user-coach-${Date.now()}`;
    const emailKey = fields.email.toLowerCase().trim();
    localStorage.setItem(`echelon_intended_role_${emailKey}`, 'coach');
    
    if (useSupabase && fields.password) {
      try {
        const { data: suData, error: suError } = await supabase.auth.signUp({
          email: fields.email,
          password: fields.password
        });
        if (suError) throw suError;
        if (suData.user?.id) {
          clId = suData.user.id;
        }
      } catch (err: any) {
        console.error("Supabase Auth coach signup error:", err);
        throw err;
      }
    } else if (useFirestore && fields.password) {
      try {
        const userCred = await createUserWithEmailAndPassword(auth, fields.email, fields.password);
        clId = userCred.user.uid;
      } catch (err: any) {
        console.error("Firebase Auth coach signup error:", err);
        if (err.code === 'auth/email-already-in-use') {
          throw new Error("This email has already been validated on our network.");
        }
        if (err.code === 'auth/operation-not-allowed') {
          throw new Error("Email/Password Authentication is not enabled in your Firebase Console. Please go to the Firebase Console -> Authentication -> Sign-in Method, enable the 'Email/Password' provider, and then try signing up again!");
        }
        throw err;
      }
    }

    const normalizedEmail = fields.email.toLowerCase().trim();
    const existingCoach = coaches.find(c => c.email.toLowerCase().trim() === normalizedEmail);

    const coachId = useSupabase ? clId : (existingCoach ? existingCoach.id : `coach-${Date.now()}`);
    const coachTeamIdsSaved = fields.teamIds || (fields.teamId ? [fields.teamId] : []);
    const finalTeamIds = existingCoach 
      ? (existingCoach.teamIds || (existingCoach.teamId ? [existingCoach.teamId] : [])) 
      : coachTeamIdsSaved;

    const firstTeamId = finalTeamIds[0] || '';

    let resolvedClubId = undefined;
    let resolvedAssocId = undefined;

    if (firstTeamId) {
      const matchTeam = teams.find(t => t.id === firstTeamId);
      if (matchTeam) {
        resolvedClubId = matchTeam.clubId;
        const matchClub = clubs.find(c => c.id === matchTeam.clubId);
        if (matchClub) {
          resolvedAssocId = matchClub.associationId;
        }
      }
    }

    const newProfile: UserProfile = {
      id: clId,
      name: fields.name,
      email: fields.email,
      role: 'coach',
      coachId: coachId,
      teamId: firstTeamId || undefined,
      teamIds: finalTeamIds,
      coachRole: fields.coachRole,
      clubId: resolvedClubId,
      associationId: resolvedAssocId,
      approved: true
    };

    const matchingTeam = teams.find(t => t.id === firstTeamId);
    const teamName = matchingTeam ? matchingTeam.name : firstTeamId;

    const coachEntity: Coach = {
      id: coachId,
      name: fields.name,
      email: fields.email,
      teamId: firstTeamId,
      teamIds: finalTeamIds,
      coachRole: fields.coachRole,
      approved: true,
      UUID: coachId,
      coach: fields.name,
      coach_email: fields.email,
      team: teamName,
      create_at: new Date().toISOString()
    };

    if (useSupabase) {
      try {
        await supabaseService.saveDocument(clId, 'users', newProfile);
      } catch (err: any) {
        console.warn("Supabase Save Coach user profile Error (handled/non-blocking):", err);
      }
      try {
        await supabaseService.saveDocument(coachId, 'coaches', coachEntity);
      } catch (err: any) {
        console.warn("Supabase Save Coach Entity Error (handled/non-blocking):", err);
      }
    } else if (useFirestore) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', clId), newProfile);
        batch.set(doc(db, 'coaches', coachId), coachEntity);
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${clId}`);
      }
    } else {
      setUsers(prev => [...prev, newProfile]);
      if (existingCoach) {
        setCoaches(prev => prev.map(c => c.id === coachId ? coachEntity : c));
      } else {
        setCoaches(prev => [...prev, coachEntity]);
      }
    }

    setCurrentProfile(newProfile);
    if (fields.staySignedIn) {
      localStorage.setItem('echelon_current_profile', JSON.stringify(newProfile));
    }
  };

  const handleAssociationSignup = async (fields: { 
    name: string; 
    email: string; 
    password?: string;
    associationName: string; 
    staySignedIn: boolean; 
  }) => {
    let userProfileId = `user-assoc-${Date.now()}`;
    const emailKey = fields.email.toLowerCase().trim();
    localStorage.setItem(`echelon_intended_role_${emailKey}`, 'association');
    localStorage.setItem(`echelon_intended_assoc_name_${emailKey}`, fields.associationName);
    
    if (useSupabase && fields.password) {
      try {
        const { data: suData, error: suError } = await supabase.auth.signUp({
          email: fields.email,
          password: fields.password
        });
        if (suError) throw suError;
        if (suData.user?.id) {
          userProfileId = suData.user.id;
        }
      } catch (err: any) {
        console.error("Supabase Auth assoc signup error:", err);
        throw err;
      }
    } else if (useFirestore && fields.password) {
      try {
        const userCred = await createUserWithEmailAndPassword(auth, fields.email, fields.password);
        userProfileId = userCred.user.uid;
      } catch (err: any) {
        console.error("Firebase Auth assoc signup error:", err);
        if (err.code === 'auth/email-already-in-use') {
          throw new Error("Association email is already registered on Echelon.");
        }
        if (err.code === 'auth/operation-not-allowed') {
          throw new Error("Email/Password Authentication is not enabled in your Firebase Console. Please go to the Firebase Console -> Authentication -> Sign-in Method, enable the 'Email/Password' provider, and then try signing up again!");
        }
        throw err;
      }
    }

    const assocId = useSupabase ? userProfileId : `assoc-${Date.now()}`;
    const newAssociation: Association = {
      id: assocId,
      name: fields.associationName,
      contactEmail: fields.email,
      approved: true,
      UUID: assocId,
      association_name: fields.associationName,
      association_email: fields.email,
      create_at: new Date().toISOString()
    };

    const newProfile: UserProfile = {
      id: userProfileId,
      name: fields.name,
      email: fields.email,
      role: 'association',
      associationId: assocId,
      approved: true
    };

    if (useSupabase) {
      try {
        await supabaseService.saveDocument(userProfileId, 'users', newProfile);
      } catch (err: any) {
        console.warn("Supabase Save User profile Error (handled/non-blocking):", err);
      }
      try {
        await supabaseService.saveDocument(assocId, 'associations', newAssociation);
      } catch (err: any) {
        console.warn("Supabase Save Association Entity Error (handled/non-blocking):", err);
      }
      
      // Add to local state immediately so scanner and dashboard are populated
      setUsers(prev => {
        if (prev.some(u => u.id === userProfileId)) return prev;
        return [...prev, newProfile];
      });
      setAssociations(prev => {
        if (prev.some(a => a.id === assocId)) return prev;
        return [...prev, newAssociation];
      });
    } else if (useFirestore) {
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', userProfileId), newProfile);
        batch.set(doc(db, 'associations', assocId), newAssociation);
        await batch.commit();
        // Add to local state immediately so scanner and dashboard are populated
        setUsers(prev => {
          if (prev.some(u => u.id === userProfileId)) return prev;
          return [...prev, newProfile];
        });
        setAssociations(prev => {
          if (prev.some(a => a.id === assocId)) return prev;
          return [...prev, newAssociation];
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${userProfileId}`);
      }
    } else {
      setUsers(prev => [...prev, newProfile]);
      setAssociations(prev => [...prev, newAssociation]);
    }

    setCurrentProfile(newProfile);
    if (fields.staySignedIn) {
      localStorage.setItem('echelon_current_profile', JSON.stringify(newProfile));
    }
  };

  const handleLoginCredentials = async (email: string, password: string, staySignedIn: boolean) => {
    const normalizedEmail = email.toLowerCase().trim();
    
    if (useSupabase) {
      try {
        // 1. Authenticate with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });
        
        if (authError) {
          if (authError.message.includes('Invalid login credentials') || authError.message.includes('Email not confirmed')) {
            const preRegistered = users.find(u => u.email.toLowerCase() === normalizedEmail);
            if (preRegistered) {
              try {
                // SignUp the user
                const { data: suData, error: suError } = await supabase.auth.signUp({
                  email: normalizedEmail,
                  password
                });
                if (suError) throw suError;
                
                const uid = suData.user?.id || `user-custom-${Date.now()}`;
                const activatedProfile: UserProfile = {
                  ...preRegistered,
                  id: uid
                };
                
                await supabaseService.saveDocument(uid, 'users', activatedProfile);
                setCurrentProfile(activatedProfile);
                if (staySignedIn) {
                  localStorage.setItem('echelon_current_profile', JSON.stringify(activatedProfile));
                }
                return;
              } catch (createErr: any) {
                console.error("Supabase diagnostic account auto-activation failed:", createErr);
              }
            }
          }
          throw authError;
        }

        const uid = authData.user?.id;
        if (!uid) throw new Error("Could not retrieve user ID from Supabase Auth.");

        // 2. Load the authenticated UserProfile document from the actual 'users' table
        const { data: profileRow, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        if (profileError) {
          console.error("Failed to load profile from Supabase:", profileError);
        }

        if (profileRow) {
          const profile: any = {};
          const fieldMapDbToLocal: Record<string, string> = {
            association_id: 'associationId',
            club_id: 'clubId',
            team_id: 'teamId',
            team_ids: 'teamIds',
            coach_id: 'coachId',
            coach_ids: 'coachIds',
            contact_email: 'contactEmail',
            contact_phone: 'contactPhone',
            coach_role: 'coachRole',
            child_player_id: 'childPlayerId',
            child_player_ids: 'childPlayerIds',
            parent_user_id: 'parentUserId',
            manual_coach_name: 'manualCoachName',
            manual_coach_email: 'manualCoachEmail',
            lineup_name: 'lineupName',
            updated_at: 'updatedAt',
            created_at: 'create_at',
          };
          for (const [key, val] of Object.entries(profileRow)) {
            const localKey = fieldMapDbToLocal[key] || key;
            profile[localKey] = (key === 'role' && typeof val === 'string') ? val.toLowerCase() : val;
          }
          profile.approved = true;
          const healedProfile = adjustAndHealProfile(profile as UserProfile);
          setCurrentProfile(healedProfile);
          if (staySignedIn) {
            localStorage.setItem('echelon_current_profile', JSON.stringify(healedProfile));
          }
        } else {
          const fallbackProfile: UserProfile = {
            id: uid,
            name: email.split('@')[0],
            email: normalizedEmail,
            role: 'player', // default safe role
            approved: true
          };
          const healedFallback = adjustAndHealProfile(fallbackProfile);
          await supabaseService.saveDocument(uid, 'users', healedFallback);
          setCurrentProfile(healedFallback);
          if (staySignedIn) {
            localStorage.setItem('echelon_current_profile', JSON.stringify(healedFallback));
          }
        }
      } catch (err: any) {
        console.warn("Supabase Auth login failed:", err);
        throw new Error(err.message || String(err));
      }
    } else if (useFirestore) {
      try {
        // 1. Authenticate with real Firebase Auth credentials
        const userCred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        const uid = userCred.user.uid;
        
        // 2. Load the authenticated UserProfile document
        const userDocRef = doc(db, 'users', uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const profile = userDocSnap.data() as UserProfile;
          setCurrentProfile(profile);
          if (staySignedIn) {
            localStorage.setItem('echelon_current_profile', JSON.stringify(profile));
          }
        } else {
          // If the Auth user exists but Firestore metadata document is missing,
          // automatically construct a safe matching profile document.
          const fallbackProfile: UserProfile = {
            id: uid,
            name: email.split('@')[0],
            email: normalizedEmail,
            role: 'player', // default safe role
            approved: true
          };
          await setDoc(userDocRef, fallbackProfile);
          setCurrentProfile(fallbackProfile);
          if (staySignedIn) {
            localStorage.setItem('echelon_current_profile', JSON.stringify(fallbackProfile));
          }
        }
      } catch (err: any) {
        console.warn("Auth credentials login failed. Running pre-registered account diagnostics:", err);
        
        // If account credentials do not exist in Firebase Auth but they are pre-registered on Echelon (virtual list)
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
          const preRegistered = users.find(u => u.email.toLowerCase() === normalizedEmail);
          if (preRegistered) {
            // Activate account! Create their actual Firebase Auth credentials so they can login safely.
            try {
              const userCred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
              const uid = userCred.user.uid;
              
              const activatedProfile: UserProfile = {
                ...preRegistered,
                id: uid // link with new valid Firebase Auth uid
              };
              
              await setDoc(doc(db, 'users', uid), activatedProfile);
              setCurrentProfile(activatedProfile);
              if (staySignedIn) {
                localStorage.setItem('echelon_current_profile', JSON.stringify(activatedProfile));
              }
              return;
            } catch (createErr: any) {
              console.error("Diagnostic account auto-activation failed:", createErr);
            }
          }
        }
        
        // Present correct readable feedback messages to the UI
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
          throw new Error("Invalid password credentials. Please verify your entries.");
        } else if (err.code === 'auth/invalid-email') {
          throw new Error("Email format is invalid. Ensure name@domain.com syntax.");
        } else if (err.code === 'auth/user-disabled') {
          throw new Error("This registered profile has been disabled by security administrators.");
        }
        throw err;
      }
    } else {
      // Local offline emulation
      const match = users.find(u => u.email.toLowerCase() === normalizedEmail);
      if (match) {
        setCurrentProfile(match);
        if (staySignedIn) {
          localStorage.setItem('echelon_current_profile', JSON.stringify(match));
        }
      } else {
        throw new Error(`Local offline mode: No account listed or matched for email "${email}"`);
      }
    }
  };

  const handleGoogleSignIn = async (
    role?: UserRole, 
    customName?: string, 
    payload?: { coachId?: string; teamId?: string; teamIds?: string[]; associationName?: string }
  ) => {
    if (useSupabase) {
      try {
        if (role) {
          localStorage.setItem('echelon_google_signup_role', role);
        }
        if (customName) {
          localStorage.setItem('echelon_google_signup_name', customName);
        }
        if (payload?.associationName) {
          localStorage.setItem('echelon_google_signup_assoc_name', payload.associationName);
        }
        if (payload?.coachId) {
          localStorage.setItem('echelon_google_signup_coach_id', payload.coachId);
        }
        if (payload?.teamId) {
          localStorage.setItem('echelon_google_signup_team_id', payload.teamId);
        }
        if (payload?.teamIds) {
          localStorage.setItem('echelon_google_signup_team_ids', JSON.stringify(payload.teamIds));
        }

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin
          }
        });
        if (error) throw error;
        return;
      } catch (err: any) {
        console.error("Supabase Google Auth Error:", err);
        throw err;
      }
    }

    if (!useFirestore) {
      throw new Error("Unable to run Google Auth on offline storage emulation mode.");
    }
    
    try {
      const provider = new GoogleAuthProvider();
      const userCred = await signInWithPopup(auth, provider);
      const uid = userCred.user.uid;
      const normalizedEmail = userCred.user.email?.toLowerCase().trim() || '';

      const userDocRef = doc(db, 'users', uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const profile = userDocSnap.data() as UserProfile;
        setCurrentProfile(profile);
        localStorage.setItem('echelon_current_profile', JSON.stringify(profile));
      } else {
        // Formulate a new profile if they are registering or need fallback
        const finalRole = role || 'player';
        const finalName = customName || userCred.user.displayName || normalizedEmail.split('@')[0] || 'Athlete';

        let newProfile: UserProfile = {
          id: uid,
          name: finalName,
          email: normalizedEmail,
          role: finalRole,
          approved: true
        };

        if (finalRole === 'player') {
          let resolvedTeamId = payload?.teamId;
          let resolvedClubId = undefined;
          let resolvedAssocId = undefined;

          if (!resolvedTeamId && payload?.coachId) {
            const matchCoach = coaches.find(c => c.id === payload.coachId);
            if (matchCoach) {
              resolvedTeamId = matchCoach.teamId;
            }
          }

          if (resolvedTeamId) {
            const matchTeam = teams.find(t => t.id === resolvedTeamId);
            if (matchTeam) {
              resolvedClubId = matchTeam.clubId;
              const matchClub = clubs.find(c => c.id === matchTeam.clubId);
              if (matchClub) {
                resolvedAssocId = matchClub.associationId;
              }
            }
          }

          newProfile = {
            ...newProfile,
            coachId: payload?.coachId || undefined,
            teamId: resolvedTeamId,
            clubId: resolvedClubId,
            associationId: resolvedAssocId
          };

          await setDoc(userDocRef, newProfile);
        } else if (finalRole === 'coach') {
          const coachId = `coach-${Date.now()}`;
          let resolvedClubId = undefined;
          let resolvedAssocId = undefined;

          const coachTeamIdsSaved = payload?.teamIds || (payload?.teamId ? [payload.teamId] : []);
          const firstTeamId = coachTeamIdsSaved[0] || '';

          if (firstTeamId) {
            const matchTeam = teams.find(t => t.id === firstTeamId);
            if (matchTeam) {
              resolvedClubId = matchTeam.clubId;
              const matchClub = clubs.find(c => c.id === matchTeam.clubId);
              if (matchClub) {
                resolvedAssocId = matchClub.associationId;
              }
            }
          }

          newProfile = {
            ...newProfile,
            coachId: coachId,
            teamId: firstTeamId || undefined,
            teamIds: coachTeamIdsSaved,
            clubId: resolvedClubId,
            associationId: resolvedAssocId
          };

          const coachEntity: Coach = {
            id: coachId,
            name: finalName,
            email: normalizedEmail,
            teamId: firstTeamId,
            teamIds: coachTeamIdsSaved,
            approved: true,
            UUID: coachId,
            coach: finalName,
            coach_email: normalizedEmail,
            team: firstTeamId ? (teams.find(t => t.id === firstTeamId)?.name || firstTeamId) : '',
            create_at: new Date().toISOString()
          };

          const batch = writeBatch(db);
          batch.set(userDocRef, newProfile);
          batch.set(doc(db, 'coaches', coachId), coachEntity);
          await batch.commit();
        } else if (finalRole === 'association') {
          const assocId = `assoc-${Date.now()}`;
          const newAssociation: Association = {
            id: assocId,
            name: payload?.associationName || 'Athletic Association',
            contactEmail: normalizedEmail,
            approved: true,
            UUID: assocId,
            association_name: payload?.associationName || 'Athletic Association',
            association_email: normalizedEmail,
            create_at: new Date().toISOString()
          };

          newProfile = {
            ...newProfile,
            associationId: assocId
          };

          const batch = writeBatch(db);
          batch.set(userDocRef, newProfile);
          batch.set(doc(db, 'associations', assocId), newAssociation);
          await batch.commit();
        } else {
          await setDoc(userDocRef, newProfile);
        }

        setCurrentProfile(newProfile);
        localStorage.setItem('echelon_current_profile', JSON.stringify(newProfile));
      }
    } catch (err: any) {
      console.error("Firebase Google Auth exception:", err);
      if (err.code === 'auth/popup-blocked') {
        throw new Error("Login helper popup was blocked. Please permit popups for AI Studio and try again!");
      }
      throw err;
    }
  };

  // Parent: get (or create) the claim code for a child who doesn't have a login yet
  const handleGetChildClaimCode = async (childId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('get_child_claim_code', { p_child: sanitizeUUID(childId) });
    if (error) throw new Error(error.message);
    return data as string;
  };

  // Player: link their new account to the child profile a parent created
  const handleClaimWithCode = async (code: string) => {
    const { error } = await supabase.rpc('claim_player_with_code', {
      p_code: code.trim().toUpperCase()
    });
    if (error) throw new Error(error.message);

    await loadAllSupabaseData();

    // Reload this account's row so the team, coach and parent link show straight away
    const { data: row } = await supabase
      .from('users')
      .select('*')
      .eq('id', currentProfile.id)
      .maybeSingle();
    if (row) {
      setCurrentProfile(prev => {
        if (!prev) return prev;
        const updated: UserProfile = {
          ...prev,
          teamId: row.team_id || prev.teamId,
          teamIds: row.team_ids?.length ? row.team_ids : prev.teamIds,
          coachId: row.coach_id || prev.coachId,
          parentUserId: row.parent_user_id || prev.parentUserId
        };
        localStorage.setItem('echelon_current_profile', JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Player: merge this login into a placeholder profile a parent created with the same name
  const handleMergeClick = async (placeholderId: string) => {
    setMergeBusy(placeholderId);
    setMergeError('');
    try {
      const { error } = await supabase.rpc('claim_placeholder_match', { p_placeholder: placeholderId });
      if (error) throw new Error(error.message);

      await loadAllSupabaseData();

      // Reload this account's row so the team, coach and parent link show straight away
      const { data: row } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentProfile.id)
        .maybeSingle();
      if (row) {
        setCurrentProfile(prev => {
          if (!prev) return prev;
          const updated: UserProfile = {
            ...prev,
            teamId: row.team_id || prev.teamId,
            teamIds: row.team_ids?.length ? row.team_ids : prev.teamIds,
            coachId: row.coach_id || prev.coachId,
            parentUserId: row.parent_user_id || prev.parentUserId
          };
          localStorage.setItem('echelon_current_profile', JSON.stringify(updated));
          return updated;
        });
      }
      setMergeCandidates(prev => prev.filter(c => c.id !== placeholderId));
    } catch (err: any) {
      setMergeError(err?.message || 'Could not merge the profile.');
    } finally {
      setMergeBusy(null);
    }
  };

  // "Not me": remember the choice so the suggestion doesn't come back
  const handleDismissMergeCandidate = (placeholderId: string) => {
    const dismissed: string[] = JSON.parse(localStorage.getItem('echelon_merge_dismissed') || '[]');
    localStorage.setItem('echelon_merge_dismissed', JSON.stringify([...dismissed, placeholderId]));
    setMergeCandidates(prev => prev.filter(c => c.id !== placeholderId));
  };

  // Helper selectors
  const activeMetricsList = currentProfile ? (allMetrics[currentProfile.id] || []) : [];
  const currentDailyMetric: DailyMetrics = activeMetricsList.find(r => r.date === '2026-05-21') || {
    playerId: currentProfile?.id || '',
    date: '2026-05-21',
    hydrationMls: 1500,
    hydrationGoalMls: 3000,
    sleepHours: 8,
    sleepQuality: 'Good',
    nutritionCalories: 1000,
    nutritionProteinG: 60,
    nutritionCarbsG: 120,
    nutritionFatG: 35
  };

  const isCoachingEchelon = currentProfile ? ['admin', 'association', 'club', 'team', 'coach'].includes(currentProfile.role) : false;

  // Loose id comparison: ids may arrive as different uuid spellings from different tables.
  const sameId = (a?: string | null, b?: string | null): boolean => {
    if (!a || !b) return false;
    if (a === b) return true;
    try {
      return sanitizeUUID(a) === sanitizeUUID(b);
    } catch (_) {
      return false;
    }
  };

  // Players visible to the Parent Dashboard.
  // Combines the users table (keeps parentUserId) with the players table, so a child that
  // exists only in `players` (linked through the parent's child_player_id / child_player_ids)
  // is still found and carries its team and coach.
  const playersForParentDashboard = useMemo((): UserProfile[] => {
    const list: UserProfile[] = users
      .filter(u => u.role === 'player')
      .map(u => {
        const dbPl = players.find(p =>
          sameId(p.id, u.id) || (!!p.email && p.email.toLowerCase() === u.email?.toLowerCase())
        );
        const teamId = u.teamId || dbPl?.teamId || '';
        return {
          ...u,
          coachId: u.coachId || dbPl?.coachId || '',
          teamId,
          teamIds: u.teamIds && u.teamIds.length > 0 ? u.teamIds : (teamId ? [teamId] : [])
        };
      });

    players.forEach(pl => {
      const alreadyListed = list.some(r =>
        sameId(r.id, pl.id) || (!!pl.email && r.email?.toLowerCase() === pl.email.toLowerCase())
      );
      if (!alreadyListed) {
        list.push({
          id: pl.id,
          name: pl.name || 'Athlete Player',
          email: pl.email || '',
          role: 'player',
          coachId: pl.coachId || '',
          teamId: pl.teamId || '',
          teamIds: pl.teamIds || (pl.teamId ? [pl.teamId] : []),
          clubId: pl.clubId || '',
          associationId: pl.associationId || '',
          approved: pl.approved !== false
        });
      }
    });

    return list;
  }, [users, players]);

  // Parent's athletes, from the merged users + players list so a child with no login yet is found too.
  const parentChildProfiles: UserProfile[] = useMemo(
    () =>
      currentProfile?.role === 'parent'
        ? playersForParentDashboard.filter(p =>
            p.role === 'player' &&
            (p.parentUserId === currentProfile.id ||
              sameId(currentProfile.childPlayerId, p.id) ||
              (currentProfile.childPlayerIds || []).some(id => sameId(id, p.id))))
        : [],
    [currentProfile, playersForParentDashboard]
  );

  const effectivePlayerId = useMemo(() => {
    if (!currentProfile) return '';
    if (currentProfile.role === 'parent') {
      const chosen = selectedChildId
        ? parentChildProfiles.find(c => sameId(c.id, selectedChildId))
        : undefined;
      const child = chosen || parentChildProfiles[0];
      if (child) return child.id;
      return currentProfile.id;
    }
    return currentProfile.id;
  }, [currentProfile, parentChildProfiles, selectedChildId]);

  const effectivePlayerProfile = useMemo(() => {
    if (!currentProfile) return null;
    if (currentProfile.role === 'parent') {
      const child = parentChildProfiles.find(p => sameId(p.id, effectivePlayerId));
      if (child) return child;
      return currentProfile;
    }
    return currentProfile;
  }, [currentProfile, parentChildProfiles, effectivePlayerId]);

  const getCoachRosterPlayers = (): UserProfile[] => {
    if (!currentProfile) return [];
    
    // Resolve the coach identifiers
    const coachId = currentProfile.coachId || currentProfile.id;
    const coachEmail = currentProfile.email || '';

    // Find reference coach entry in coaches table to cover possible cross-ID mapping differences
    const coachReg = coaches.find(c => {
      if (c.id === currentProfile.id) return true;
      if (currentProfile.coachId && c.id === currentProfile.coachId) return true;
      try {
        if (sanitizeUUID(c.id) === sanitizeUUID(currentProfile.id)) return true;
        if (currentProfile.coachId && sanitizeUUID(c.id) === sanitizeUUID(currentProfile.coachId)) return true;
      } catch (_) {}
      return c.email?.toLowerCase() === coachEmail.toLowerCase();
    });

    const coachRegId = coachReg?.id || '';

    // Anyone registered as a coach must never appear in the roster as a player.
    const coachIdentityKeys = new Set<string>();
    coaches.forEach(c => {
      if (c.email) coachIdentityKeys.add(c.email.toLowerCase().trim());
      if (c.id) coachIdentityKeys.add(String(c.id).trim());
    });
    if (currentProfile.email) coachIdentityKeys.add(currentProfile.email.toLowerCase().trim());
    if (currentProfile.id) coachIdentityKeys.add(String(currentProfile.id).trim());

    // A player-table record belongs to this coach's roster when it is either:
    // 1. directly assigned to this coach, OR
    // 2. assigned to one of this coach's teams.
    // Team assignment is intentionally sufficient even when coachId is missing.
    const linkedPlayers = players.filter(pl => {
      // Exclude the coach themselves or any other registered coach.
      if (pl.email && coachIdentityKeys.has(pl.email.toLowerCase().trim())) return false;
      if (pl.id && coachIdentityKeys.has(String(pl.id).trim())) return false;

      // Match by direct coach assignment.
      const coachMatches = (() => {
        const plCoachId = pl.coachId;
        if (!plCoachId) return false;

        const cleanPlCoachId = plCoachId.trim();
        if (
          cleanPlCoachId === coachId ||
          cleanPlCoachId === currentProfile.id ||
          (coachRegId && cleanPlCoachId === coachRegId)
        ) {
          return true;
        }

        try {
          const sanitizedPlCoachId = sanitizeUUID(cleanPlCoachId);
          if (sanitizedPlCoachId === sanitizeUUID(coachId)) return true;
          if (sanitizedPlCoachId === sanitizeUUID(currentProfile.id)) return true;
          if (coachRegId && sanitizedPlCoachId === sanitizeUUID(coachRegId)) return true;
        } catch (_) {}

        return false;
      })();

      // Match by team assignment. This is the important path for parent-created
      // player records that exist in the players table without a users row or coachId.
      const coachTeamIds =
        currentProfile.teamIds?.length
          ? currentProfile.teamIds
          : currentProfile.teamId
            ? [currentProfile.teamId]
            : coachReg?.teamIds?.length
              ? coachReg.teamIds
              : coachReg?.teamId
                ? [coachReg.teamId]
                : [];

      const teamMatches =
        !!pl.teamId &&
        coachTeamIds.some(teamId => {
          if (!teamId) return false;

          const playerTeamId = String(pl.teamId).trim().toLowerCase();
          const coachTeamId = String(teamId).trim().toLowerCase();

          if (playerTeamId === coachTeamId) {
            return true;
          }

          try {
            return sanitizeUUID(playerTeamId) === sanitizeUUID(coachTeamId);
          } catch (_) {
            return false;
          }
        });

      // A player belongs to the coach roster if they are assigned
      // either directly to the coach OR to one of the coach's teams.
      return coachMatches || teamMatches;
    });

    return linkedPlayers.map(pl => {
      const u = users.find(user => {
        if (user.id === pl.id) return true;
        try {
          if (sanitizeUUID(user.id) === sanitizeUUID(pl.id)) return true;
        } catch (_) {}
        return user.email?.toLowerCase() === pl.email?.toLowerCase();
      });

      return {
        id: pl.id,
        name: pl.name || u?.name || 'Athlete Player',
        email: pl.email || u?.email || '',
        role: 'player' as const,
        coachId: pl.coachId,
        avatarUrl: pl.avatarUrl || u?.avatarUrl || null,
        // The players table is authoritative for player-team assignment.
        // Fall back to the users table only when the player record has no team data.
        teamId: pl.teamId || u?.teamId || currentProfile?.teamId || '',
        teamIds:
          pl.teamIds ||
          (pl.teamId
            ? [pl.teamId]
            : u?.teamIds || (u?.teamId ? [u.teamId] : [])),
        clubId: pl.clubId || u?.clubId || currentProfile?.clubId || '',
        associationId: pl.associationId || u?.associationId || currentProfile?.associationId || '',
        approved: pl.approved !== false
      };
    });
  };

  const getReconciledPlayersForDashboard = (): UserProfile[] => {
    if (currentProfile?.role === 'coach') {
      return getCoachRosterPlayers();
    }

    const reconciled: UserProfile[] = [];
    users.filter(u => u.role === 'player').forEach(u => {
      const dbPl = players.find(p => {
        if (p.id === u.id) return true;
        try {
          if (sanitizeUUID(p.id) === sanitizeUUID(u.id)) return true;
        } catch (_) {}
        return p.email?.toLowerCase() === u.email?.toLowerCase();
      });

      reconciled.push({
        id: u.id,
        name: u.name || dbPl?.name || 'Athlete Player',
        email: u.email || dbPl?.email || '',
        role: 'player',
        avatarUrl: u.avatarUrl || dbPl?.avatarUrl || null,
        coachId: dbPl?.coachId || u.coachId || '',
        teamId: u.teamId || '',
        teamIds: u.teamIds || (u.teamId ? [u.teamId] : []),
        clubId: u.clubId || '',
        associationId: u.associationId || '',
        approved: u.approved !== false
      });
    });

    players.forEach(pl => {
      const alreadyChecked = reconciled.some(r => {
        if (r.id === pl.id) return true;
        try {
          if (sanitizeUUID(r.id) === sanitizeUUID(pl.id)) return true;
        } catch (_) {}
        return r.email?.toLowerCase() === pl.email?.toLowerCase();
      });

      if (!alreadyChecked) {
        reconciled.push({
          id: pl.id,
          name: pl.name || 'Athlete Player',
          email: pl.email || '',
          role: 'player',
          avatarUrl: pl.avatarUrl || null,
          coachId: pl.coachId || '',
          teamId: pl.teamId || '',
          teamIds: pl.teamIds || (pl.teamId ? [pl.teamId] : []),
          clubId: pl.clubId || '',
          associationId: pl.associationId || '',
          approved: pl.approved !== false
        });
      }
    });

    return reconciled;
  };

  // The athlete every parent-facing page shows: the one picked on any of those pages.
  const lockerRoomProfile: UserProfile | null = effectivePlayerProfile || currentProfile;

  const lockerViewableChildren = parentChildProfiles.map(c => ({
    id: c.id,
    name: c.name,
    teamId: c.teamId,
    teamName: teams.find(t => t.id === c.teamId)?.name
  }));

  if (!currentProfile) {
    return (
      <AuthScreen
        users={users}
        coaches={coaches}
        teams={teams}
        useFirestore={false}
        onToggleFirestore={() => {}}
        onLogin={(profile, stay) => {
          setCurrentProfile(profile);
          if (stay) {
            localStorage.setItem('echelon_current_profile', JSON.stringify(profile));
          }
        }}
        onLoginCredentials={handleLoginCredentials}
        onGoogleSignIn={handleGoogleSignIn}
        onPlayerSignup={handlePlayerSignup}
        onCoachSignup={handleCoachSignup}
        onAssociationSignup={handleAssociationSignup}
        onParentSignup={handleParentSignup}
      />
    );
  }

  // Coach onboarding wizard bypassed. Re-routed directly to the coaching dashboard interface.

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans selection:bg-sky-500/20">

      {/* Brand Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 transition-all shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center gap-4">
          
          {/* Logo and Brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img 
              src="favicon.png" 
              alt="Echelon Logo" 
              className="h-8 w-8 sm:h-12 sm:w-12 object-contain rounded-xl shadow-md shadow-sky-500/10 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col text-left min-w-0">
              <h1 className="text-base sm:text-[18px] md:text-lg font-bold font-sans tracking-tight text-slate-800 truncate sm:overflow-visible">
                Player Development Portal
              </h1>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden sm:flex items-center gap-1.5 sm:gap-2">
            {currentProfile.role === 'association' ? (
              <>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  id="nav-dashboard"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition ${
                    activeTab === 'dashboard'
                      ? 'bg-sky-50 text-sky-600 font-bold border border-sky-200'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Association Dashboard
                </button>

                <button
                  onClick={() => setActiveTab('leaderboard')}
                  id="nav-leaderboard"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition ${
                    activeTab === 'leaderboard'
                      ? 'bg-sky-50 text-sky-600 font-bold border border-sky-200'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Leaderboards
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  id="nav-dashboard"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition ${
                    activeTab === 'dashboard'
                      ? 'bg-sky-50 text-sky-600 font-bold border border-sky-200'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Dashboard
                </button>

                {(currentProfile.role === 'player' || currentProfile.role === 'coach' || currentProfile.role === 'parent') && (
                  <button
                    onClick={() => setActiveTab('classroom')}
                    id="nav-classroom"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition ${
                      activeTab === 'classroom'
                        ? 'bg-sky-50 text-sky-600 font-bold border border-sky-200'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    Classroom
                  </button>
                )}

                <button
                  onClick={() => setActiveTab('leaderboard')}
                  id="nav-leaderboard"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition ${
                    activeTab === 'leaderboard'
                      ? 'bg-sky-50 text-sky-600 font-bold border border-sky-200'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                {currentProfile.role === 'coach' ? 'Admin' : (currentProfile.role === 'player' || currentProfile.role === 'parent') ? 'Season' : 'Leaderboard'}
                </button>

                {(currentProfile.role === 'player' || currentProfile.role === 'coach' || currentProfile.role === 'parent') && (
                  <button
                    onClick={() => setActiveTab('formation')}
                    id="nav-formation"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition ${
                      activeTab === 'formation'
                        ? 'bg-sky-50 text-sky-600 font-bold border border-sky-200'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    Locker Room
                  </button>
                )}
              </>
            )}

            {currentProfile.role === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                id="nav-admin"
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition flex items-center gap-1 ${
                  activeTab === 'admin'
                    ? 'bg-rose-50 text-rose-600 font-bold border border-rose-200'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                Verification approvals
                {requests.filter(r => r.status === 'pending').length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab('profile')}
              id="nav-profile"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition flex items-center gap-1.5 ${
                activeTab === 'profile'
                  ? 'bg-sky-50 text-sky-600 font-bold border border-sky-200'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              
              Profile
            </button>

            <button
              onClick={async () => {
                if (useSupabase) {
                  try {
                    await supabase.auth.signOut();
                  } catch (err) {
                    console.error("Supabase Auth signOut failed:", err);
                  }
                } else if (useFirestore) {
                  try {
                    await signOut(auth);
                  } catch (err) {
                    console.error("Firebase Auth signOut failed:", err);
                  }
                }
                localStorage.removeItem('echelon_current_profile');
                setCurrentProfile(null);
              }}
              id="nav-logout"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold font-sans transition text-slate-500 hover:bg-rose-50 hover:text-rose-500 flex items-center gap-1.5"
            >
             
              Log Out
            </button>
          </div>

          {/* Mobile profile avatar (top-right) */}
          <div className="sm:hidden relative">
            <button
              onClick={() => setIsAvatarMenuOpen(!isAvatarMenuOpen)}
              className="w-10 h-10 rounded-full overflow-hidden border-2 border-sky-200 bg-sky-50 flex items-center justify-center shadow-sm active:scale-95 transition"
              aria-label="Open profile menu"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-sky-500" />
              )}
            </button>

            <AnimatePresence>
              {isAvatarMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsAvatarMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute right-0 top-12 z-50 w-44 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden origin-top-right"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIsAvatarMenuOpen(false);
                        setActiveTab('profile');
                      }}
                      className="w-full px-4 py-3 text-left text-xs font-semibold font-sans text-slate-700 hover:bg-sky-50 hover:text-sky-600 flex items-center gap-2.5 transition"
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </button>
                    <div className="h-px bg-slate-100" />
                    <button
                      type="button"
                      onClick={async () => {
                        setIsAvatarMenuOpen(false);
                        if (useSupabase) {
                          try {
                            await supabase.auth.signOut();
                          } catch (err) {
                            console.error("Supabase Auth signOut failed:", err);
                          }
                        } else if (useFirestore) {
                          try {
                            await signOut(auth);
                          } catch (err) {
                            console.error("Firebase Auth signOut failed:", err);
                          }
                        }
                        localStorage.removeItem('echelon_current_profile');
                        setCurrentProfile(null);
                      }}
                      className="w-full px-4 py-3 text-left text-xs font-semibold font-sans text-slate-700 hover:bg-rose-50 hover:text-rose-500 flex items-center gap-2.5 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      Log Out
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar (native-app style) */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 h-16">
          {[
            { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
            { key: 'classroom', label: 'Classroom', icon: GraduationCap, show: ['player', 'coach', 'parent'].includes(currentProfile.role) },
            { key: 'leaderboard', label: currentProfile.role === 'coach' ? 'Admin' : (currentProfile.role === 'player' || currentProfile.role === 'parent') ? 'Season' : 'Leaderboard', icon: Trophy, show: true },
            { key: 'formation', label: 'Locker Room', icon: Shirt, show: ['player', 'coach', 'parent'].includes(currentProfile.role) },
          ]
            .filter(item => item.show)
            .map(({ key, label, icon: Icon }) => {
              const isActive =
                (key === 'dashboard' && activeTab === 'dashboard') ||
                (key === 'classroom' && activeTab === 'classroom') ||
                (key === 'leaderboard' && activeTab === 'leaderboard') ||
                (key === 'formation' && activeTab === 'formation');
              return (
                <button
                  key={key}
                  onClick={() => {
                    setActiveTab(key as any);
                    window.scrollTo({ top: 0 });
                  }}
                  className={`bottom-nav-btn flex flex-col items-center justify-center gap-1 transition ${
                    isActive ? 'text-sky-700' : 'text-slate-400 active:text-slate-600'
                  }`}
                >
                  <Icon className="w-6 h-6" strokeWidth={isActive ? 2.4 : 2} />
                  <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-semibold'}`}>{label}</span>
                </button>
              );
            })}
        </div>
      </nav>

      {/* Switching context banner indicator */}
      <div className="bg-white border-b border-slate-200 py-2.5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 text-xs font-mono w-full">
          <div className="hidden sm:flex flex-wrap items-center gap-2 text-slate-500">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Logged profile: <b className="text-slate-700">{currentProfile.name}</b></span>
            <span className="text-slate-300">|</span>
            <span>Role: <b className="text-slate-700 uppercase">{currentProfile.role}</b></span>
            {currentProfile.role === 'coach' && currentProfile.teamIds && currentProfile.teamIds.length > 0 && (
              <>
                <span className="text-slate-300">|</span>
                <span>Active Squad: <b className="text-slate-700 font-sans">{teams.find(t => t.id === currentProfile.teamId)?.name || currentProfile.teamId || 'None'}</b></span>
              </>
            )}
          </div>
          {currentProfile.role === 'coach' && currentProfile.teamIds && currentProfile.teamIds.length >= 2 && (
            <div className="flex items-center gap-2 mt-1 md:mt-0">
              <span className="text-slate-500 uppercase tracking-widest text-[9px] font-mono">Focus Team:</span>
              <select
                value={currentProfile.teamId || ''}
                onChange={(e) => handleSwitchActiveTeam(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded px-2.5 py-1 font-sans outline-none focus:border-sky-400 transition"
              >
                {currentProfile.teamIds.map(tid => {
                  const matchingT = teams.find(t => t.id === tid);
                  return (
                    <option key={tid} value={tid}>
                      {matchingT ? matchingT.name : tid}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-5 pb-24 sm:pb-8 space-y-6 sm:space-y-8">
        

        
        {/* A profile a parent created may be this player: offer to merge */}
        {mergeCandidates.length > 0 && (
          <div className="space-y-3">
            {mergeCandidates.map(c => (
              <div
                key={c.id}
                className="rounded-2xl border border-sky-300 bg-sky-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">Is this you?</p>
                  <p className="text-xs text-slate-600 mt-1">
                    A parent added <span className="font-bold">{c.name}</span>
                    {c.teamName ? ` to ${c.teamName}` : ''}
                    {c.coachName ? ` (coach ${c.coachName})` : ''}.
                    Merging links your account to that profile, including its team and parent link.
                  </p>
                  {mergeError && (
                    <p className="text-xs text-rose-600 mt-2">{mergeError}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={mergeBusy !== null}
                    onClick={() => handleMergeClick(c.id)}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs transition disabled:opacity-50"
                  >
                    {mergeBusy === c.id ? 'Merging...' : 'Yes, merge'}
                  </button>
                  <button
                    type="button"
                    disabled={mergeBusy !== null}
                    onClick={() => handleDismissMergeCandidate(c.id)}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-600 font-bold text-xs transition disabled:opacity-50"
                  >
                    Not me
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab view controllers */}
        {activeTab === 'dashboard' && (
          currentProfile.role === 'association' ? (
            <AssociationDashboard
              currentProfile={currentProfile}
              clubs={clubs}
              teams={teams}
              coaches={coaches}
              players={users}
              onAddClub={handleAddClubDirect}
              onAddTeam={handleAddTeamDirect}
              onAddCoach={handleAddCoachDirect}
            />
          ) : currentProfile.role === 'parent' ? (
            <ParentDashboard
              parentProfile={currentProfile}
              allPlayers={playersForParentDashboard}
              allRunLogs={runLogs}
              allMetrics={allMetrics}
              allCompletions={completions}
              modules={modules}
              assignments={assignments}
              coaches={coaches}
              teams={teams}
              formations={formations}
              onUpdatePlayerMetrics={handleParentUpdatePlayerMetrics}
              teamSchedules={teamSchedules}
              onSaveRun={handleSaveRunForChild}
              onSelectTab={(tab, formationId, classroomId) => {
                if (tab === 'classroom') {
                  setClassroomModuleId(classroomId ?? null);
                  setActiveTab('classroom');
                } else if (tab === 'formation') {
                  if (formationId) {
                    setSelectedFormationId(formationId);
                  }
                  setActiveTab('formation');
                }
              }}
              hydrationLogs={hydrationLogs}
              onLogHydration={handleLogHydrationForChild}
              handleUpdateDailyMetricsForChild={handleParentUpdatePlayerMetrics}
              onGoToProfile={() => setActiveTab('profile')}
              selectedChildId={selectedChildId}
              onSelectChild={setSelectedChildId}
            />
          ) : isCoachingEchelon ? (
            <CoachesDashboard
              currentProfile={currentProfile}
              players={getReconciledPlayersForDashboard()}
              runLogs={runLogs}
              metrics={allMetrics}
              assignments={assignments}
              modules={modules}
              teams={teams}
              onChangeActiveTeam={handleSwitchActiveTeam}
              onAddAssignment={handleAddAssignment}
              onUpdatePlayerGoal={handleUpdatePlayerGoal}
              hydrationLogs={hydrationLogs}
              teamSchedules={teamSchedules}
              sessionAttendance={sessionAttendance}
              coachDrills={coachDrills}
              onAddSchedule={handleAddSchedule}
              onUpdateSchedule={handleUpdateSchedule}
              onDeleteSchedule={handleDeleteSchedule}
              onSaveAttendance={handleSaveAttendance}
            />
          ) : (
            <PlayerDashboard
              playerProfile={currentProfile}
              runLogs={runLogs.filter(r => r.playerId === currentProfile.id)}
              metrics={currentDailyMetric}
              assignments={assignments.filter(a => a.teamId === currentProfile.teamId || a.teamId === '' || a.playerId === currentProfile.id)}
              modules={modules}
              completions={completions.filter(c => c.playerId === currentProfile.id)}
              onSaveRun={handleSaveRun}
              onUpdateDailyMetrics={handleUpdateDailyMetrics}
              onSelectTab={(tab, formationId, classroomId) => {
                if (tab === 'classroom') {
                  setClassroomModuleId(classroomId ?? null);
                  setActiveTab('classroom');
                } else if (tab === 'formation') {
                  if (formationId) {
                    setSelectedFormationId(formationId);
                  }
                  setActiveTab('formation');
                }
              }}
              allPlayers={getReconciledPlayersForDashboard()}
              allRunLogs={runLogs}
              allMetrics={allMetrics}
              allCompletions={completions}
              formations={formations}
              hydrationLogs={hydrationLogs.filter(l => l.playerId === currentProfile.id)}
              onLogHydration={handleLogHydration}
              teamSchedules={teamSchedules}
            />
          )
        )}

        {activeTab === 'classroom' && (
          <ClassroomTab
            modules={modules}
            completions={completions.filter(c => c.playerId === effectivePlayerId)}
            onCompleteModule={handleCompleteModule}
            currentProfile={effectivePlayerProfile || currentProfile}
            onAddAssignment={handleAddAssignment}
            onDeleteAssignment={handleDeleteAssignment}
            assignments={assignments.filter(a => a.teamId === (effectivePlayerProfile?.teamId || currentProfile.teamId) || a.teamId === '' || a.playerId === (effectivePlayerProfile?.id || currentProfile.id))}
            initialModuleId={classroomModuleId ?? undefined}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardTab
            currentProfile={effectivePlayerProfile || currentProfile}
            players={getReconciledPlayersForDashboard()}
            runLogs={runLogs}
            allMetrics={allMetrics}
            completions={completions}
            teamSchedules={teamSchedules}
            sessionAttendance={sessionAttendance}
            currentAthlete={lockerRoomProfile}
            viewableChildren={lockerViewableChildren}
            selectedViewableChildId={lockerRoomProfile?.id ?? null}
            onSelectViewableChild={(id) => setSelectedChildId(id)}
            viewerIsParent={currentProfile.role === 'parent'}
            playerEvaluations={playerEvaluations}
            onSavePlayerEvaluation={handleSavePlayerEvaluation}
            onDeletePlayerEvaluation={handleDeletePlayerEvaluation}
            clubs={clubs}
            teams={teams}
            coaches={coaches}
            modules={modules}
            assignments={assignments.filter(a => a.teamId === (effectivePlayerProfile?.teamId || currentProfile.teamId) || a.teamId === '' || a.playerId === (effectivePlayerProfile?.id || currentProfile.id))}
          />
        )}

        {activeTab === 'admin' && currentProfile.role === 'admin' && (
          <AdminDashboard
            associations={associations}
            clubs={clubs}
            teams={teams}
            coaches={coaches}
            players={users}
            onAddAssociation={handleAddAssociationDirect}
            onAddClub={handleAddClubDirect}
            onAddTeam={handleAddTeamDirect}
          />
        )}

        {activeTab === 'formation' && (
          <FormationsTab
            currentProfile={lockerRoomProfile || currentProfile}
            players={getReconciledPlayersForDashboard()}
            formations={formations}
            onSaveFormation={handleSaveFormation}
            onDeleteFormation={handleDeleteFormation}
            initialSelectedFormationId={selectedFormationId}
            teamSchedules={teamSchedules}
            onAddSchedule={handleAddSchedule}
            onUpdateSchedule={handleUpdateSchedule}
            onDeleteSchedule={handleDeleteSchedule}
            coachDrills={coachDrills}
            onAddCoachDrill={handleAddCoachDrill}
            onDeleteCoachDrill={handleDeleteCoachDrill}
            libraryDrills={libraryDrills}
            onAddLibraryDrill={handleAddLibraryDrillToSession}
            viewableChildren={lockerViewableChildren}
            selectedViewableChildId={lockerRoomProfile?.id ?? null}
            onSelectViewableChild={(id) => setSelectedChildId(id)}
            assignments={assignments.filter(a => a.teamId === (lockerRoomProfile?.teamId || effectivePlayerProfile?.teamId || currentProfile.teamId) || a.teamId === '' || a.playerId === (lockerRoomProfile?.id || effectivePlayerProfile?.id || currentProfile.id))}
            runLogs={runLogs.filter(r => r.playerId === (lockerRoomProfile?.id || effectivePlayerProfile?.id || currentProfile.id))}
            onStartRun={(assign) => {
              sessionStorage.setItem('start_run_assignment_id', assign.id);
              setActiveTab('dashboard');
            }}
            onOpenClassroom={(moduleId) => {
              setClassroomModuleId(moduleId);
              setActiveTab('classroom');
            }}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            profile={currentProfile}
            teams={teams}
            coaches={coaches}
            allPlayers={playersForParentDashboard}
            onGetChildClaimCode={handleGetChildClaimCode}
            onClaimWithCode={handleClaimWithCode}
            onUpdateProfile={handleUpdateProfile}
            onAddPlayer={handleParentAddPlayer}
            onLinkChild={handleLinkExistingChild}
            avatarUrl={avatarUrl}
            onUploadAvatar={uploadAvatar}
            onRemoveAvatar={removeAvatar}
            linkedChildren={
              currentProfile.role === 'parent' || currentProfile.role === 'coach'
                ? users.filter(u => {
                    const ids = new Set<string>();
                    if (currentProfile.childPlayerId) ids.add(currentProfile.childPlayerId);
                    if (currentProfile.childPlayerIds) currentProfile.childPlayerIds.forEach(id => ids.add(id));
                    if (u.parentUserId === currentProfile.id) ids.add(u.id);
                    return ids.has(u.id);
                  })
                : []
            }
          />
        )}

      </main>

      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs font-mono text-slate-400 mt-12">
        <p>© 2026 PDP Sports Network. All rights reserved.</p>
      </footer>

    </div>
  );
}
