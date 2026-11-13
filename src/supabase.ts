/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from '@supabase/supabase-js';
import supabaseConfig from '../supabase-config.json';

// Initialize Supabase Client
export const supabase = createClient(supabaseConfig.supabaseUrl, supabaseConfig.apiKey);

export enum DBMode {
  OFFLINE = 'offline',
  FIRESTORE = 'firestore',
  SUPABASE = 'supabase'
}

/**
 * Mapping of client-side react collections to database tables
 */
const COLLECTION_TO_TABLE: Record<string, string> = {
  users: 'users',
  associations: 'associations',
  clubs: 'clubs',
  teams: 'teams',
  coaches: 'coaches',
  players: 'players',
  teamFormations: 'team_formations',
  tactical_playbooks: 'tactical_playbooks',
  hydrationLogs: 'hydration_logs',
  runLogs: 'run_logs',
  assignments: 'assignments',
  moduleCompletions: 'module_completions',
  classroomSessions: 'classroom_sessions',
  requests: 'requests',
  dailyMetrics: 'daily_metrics',
  teamSchedules: 'team_schedules',
  sessionAttendance: 'session_attendance',
  // Coach drill images attached to sessions (shared across all devices/users)
  coach_drills: 'coach_drills',
};

/**
 * Valid schema columns discovered in real tables to guide precise SQL writes
 */
const SCHEMA_COLUMNS: Record<string, string[]> = {
  users: [
    'id', 'name', 'email', 'role', 'approved', 'avatar_url',
    'association_id', 'club_id', 'team_id', 'team_ids', 'coach_id', 'coach_ids',
    'child_player_id', 'child_player_ids', 'parent_user_id',
    'manual_coach_name', 'manual_coach_email', 'coach_role',
    'created_at'
  ],
  associations: [
    'id', 'name', 'contact_email', 'contact_phone', 'approved',
    'association_name', 'association_email',
    'club_name', 'club_email', 'created_at'
  ],
  clubs: [
    'id', 'name', 'association_id', 'contact_email', 'approved',
    'club_name', 'club_email', 'created_at'
  ],
  teams: ['id', 'name', 'club_id', 'contact_email', 'approved', 'created_at'],
  coaches: [
    'id', 'name', 'email', 'team_id', 'team_ids', 'coach_role', 'approved',
    'coach_name', 'coach_email', 'team_name', 'created_at'
  ],
  players: [
    'id', 'name', 'email', 'coach_id', 'team_id', 'approved', 'avatar_url',
    'player_name', 'player_email', 'created_at'
  ],
  team_formations: [
    'id', 'coach_id', 'team_id', 'name', 'system', 'lineup_name',
    'assignments', 'bench_assignments', 'captains', 'notes', 'updated_at'
  ],
  tactical_playbooks: [
    'id', 'title', 'description', 'difficulty', 'field_ratio', 'frames',
    'playback_speed', 'is_assigned', 'coach_id', 'coach_name', 'team_id',
    'updated_at', 'created_at'
  ],
  hydration_logs: [
    'id', 'player_id', 'team_id', 'coach_id', 'hydration_ml',
    'log_date', 'week_start_date', 'notes', 'created_at', 'updated_at'
  ],
  run_logs: [
    'id', 'player_id', 'date', 'duration_seconds', 'distance_km',
    'avg_speed_kmh', 'max_speed_kmh', 'min_speed_kmh',
    'gps_track_points', 'from_assignment_id', 'created_at'
  ],
  assignments: [
    'id', 'coach_id', 'team_id', 'type', 'title', 'due_date',
    'run_distance_km', 'module_id', 'completed_by_player_ids',
    'player_id', 'created_at'
  ],
  module_completions: [
    'id', 'player_id', 'module_id', 'date_completed', 'quiz_score',
    'created_at'
  ],
  classroom_sessions: [
    'id', 'category', 'title', 'description', 'image_url', 'video_url',
    'created_at'
  ],
  requests: [
    'id', 'name', 'type', 'contact_email', 'parent_org_id',
    'created_at', 'status'
  ],
  daily_metrics: [
    'id', 'player_id', 'date', 'hydration_mls', 'hydration_goal_mls',
    'sleep_hours', 'sleep_quality', 'nutrition_calories',
    'nutrition_protein_g', 'nutrition_carbs_g', 'nutrition_fat_g',
    'run_distance_goal_km', 'created_at'
  ],
  team_schedules: [
    'id', 'coach_id', 'team_id', 'session_date', 'session_time',
    'location', 'notes', 'event_type', 'created_at'
  ],
  session_attendance: [
    'id', 'schedule_id', 'player_id', 'present', 'recorded_by',
    'team_id', 'session_date', 'session_time', 'created_at'
  ],
  coach_drills: [
    'id', 'coach_id', 'team_id', 'schedule_id', 'title', 'image_url', 'created_at'
  ]
};

/**
 * Property field mapping dictionaries to transition seamlessly between React (camelCase) and Postgres (snake_case)
 */
const FIELD_MAPPING_LOCAL_TO_DB: Record<string, string> = {
  associationId: 'association_id',
  clubId: 'club_id',
  teamId: 'team_id',
  teamIds: 'team_ids',
  coachId: 'coach_id',
  coachIds: 'coach_ids',
  contactEmail: 'contact_email',
  contactPhone: 'contact_phone',
  coachRole: 'coach_role',
  childPlayerId: 'child_player_id',
  childPlayerIds: 'child_player_ids',
  parentUserId: 'parent_user_id',
  manualCoachName: 'manual_coach_name',
  avatarUrl: 'avatar_url',
  manualCoachEmail: 'manual_coach_email',
  lineupName: 'lineup_name',
  benchAssignments: 'bench_assignments',
  captains: 'captains',
  updatedAt: 'updated_at',
  createdAt: 'created_at',
  create_at: 'created_at',
  fieldRatio: 'field_ratio',
  playbackSpeed: 'playback_speed',
  isAssigned: 'is_assigned',
  coachName: 'coach_name',
  playerId: 'player_id',
  hydrationMl: 'hydration_ml',
  logDate: 'log_date',
  weekStartDate: 'week_start_date',
  durationSeconds: 'duration_seconds',
  distanceKm: 'distance_km',
  avgSpeedKmH: 'avg_speed_kmh',
  maxSpeedKmH: 'max_speed_kmh',
  minSpeedKmH: 'min_speed_kmh',
  gpsTrackPoints: 'gps_track_points',
  fromAssignmentId: 'from_assignment_id',
  dueDate: 'due_date',
  runDistanceKm: 'run_distance_km',
  moduleId: 'module_id',
  completedByPlayerIds: 'completed_by_player_ids',
  dateCompleted: 'date_completed',
  quizScore: 'quiz_score',
  imageUrl: 'image_url',
  videoUrl: 'video_url',
  parentOrgId: 'parent_org_id',
  hydrationMls: 'hydration_mls',
  hydrationGoalMls: 'hydration_goal_mls',
  sleepHours: 'sleep_hours',
  sleepQuality: 'sleep_quality',
  nutritionCalories: 'nutrition_calories',
  nutritionProteinG: 'nutrition_protein_g',
  nutritionCarbsG: 'nutrition_carbs_g',
  nutritionFatG: 'nutrition_fat_g',
  runDistanceGoalKm: 'run_distance_goal_km',
  clubName: 'club_name',
  clubEmail: 'club_email',
  associationName: 'association_name',
  associationEmail: 'association_email',
  playerName: 'player_name',
  playerEmail: 'player_email',
  teamName: 'team_name',
  sessionDate: 'session_date',
  sessionTime: 'session_time',
  scheduleId: 'schedule_id',
  recordedBy: 'recorded_by',
  eventType: 'event_type',
};

const FIELD_MAPPING_DB_TO_LOCAL: Record<string, string> = {
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
  avatar_url: 'avatarUrl',
  manual_coach_email: 'manualCoachEmail',
  lineup_name: 'lineupName',
  bench_assignments: 'benchAssignments',
  captains: 'captains',
  updated_at: 'updatedAt',
  created_at: 'create_at',
  field_ratio: 'fieldRatio',
  playback_speed: 'playbackSpeed',
  is_assigned: 'isAssigned',
  coach_name: 'coachName',
  player_id: 'playerId',
  hydration_ml: 'hydrationMl',
  log_date: 'logDate',
  week_start_date: 'weekStartDate',
  duration_seconds: 'durationSeconds',
  distance_km: 'distanceKm',
  avg_speed_kmh: 'avgSpeedKmH',
  max_speed_kmh: 'maxSpeedKmH',
  min_speed_kmh: 'minSpeedKmH',
  gps_track_points: 'gpsTrackPoints',
  from_assignment_id: 'fromAssignmentId',
  due_date: 'dueDate',
  run_distance_km: 'runDistanceKm',
  module_id: 'moduleId',
  completed_by_player_ids: 'completedByPlayerIds',
  date_completed: 'dateCompleted',
  quiz_score: 'quizScore',
  image_url: 'imageUrl',
  video_url: 'videoUrl',
  parent_org_id: 'parentOrgId',
  hydration_mls: 'hydrationMls',
  hydration_goal_mls: 'hydrationGoalMls',
  sleep_hours: 'sleepHours',
  sleep_quality: 'sleepQuality',
  nutrition_calories: 'nutritionCalories',
  nutrition_protein_g: 'nutritionProteinG',
  nutrition_carbs_g: 'nutritionCarbsG',
  nutrition_fat_g: 'nutritionFatG',
  run_distance_goal_km: 'runDistanceGoalKm',
  club_name: 'clubName',
  club_email: 'clubEmail',
  association_name: 'associationName',
  association_email: 'associationEmail',
  player_name: 'playerName',
  player_email: 'playerEmail',
  team_name: 'teamName',
  session_date: 'sessionDate',
  session_time: 'sessionTime',
  schedule_id: 'scheduleId',
  recorded_by: 'recordedBy',
  event_type: 'eventType',
};

/**
 * Helper to test the connection against the 'users' table
 */
export async function testSupabaseConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('users')
      .select('*')
      .limit(1);

    if (error && error.code === 'PGRST205') {
      return { success: false, error: 'Table "users" was not found in your Supabase database schema.' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * SQL snippet setup instructions for Multi-Table setup
 */
export const SUPABASE_SQL_SETUP = `-- Execution SQL for database tables is completed!
-- Your Supabase tables are ready and populated.
`;

/**
 * Fully integrated multi-table services with automatic key structure translator
 */
export const supabaseService = {
  async fetchCollection<T>(collectionName: string): Promise<T[]> {
    const tableName = COLLECTION_TO_TABLE[collectionName];
    if (!tableName) {
      // LocalStorage fallback for non-existing schemas (like runLogs, assignments)
      const localData = localStorage.getItem(`echelon_fallback_${collectionName}`);
      return localData ? (JSON.parse(localData) as T[]) : [];
    }

    const { data, error } = await supabase
      .from(tableName)
      .select('*');

    if (error) {
      console.warn(`Supabase fetchCollection error [${tableName}]:`, error);
      throw error;
    }

    return (data || []).map(row => {
      const mappedRecord: any = {};
      for (const [key, val] of Object.entries(row)) {
        const localKey = FIELD_MAPPING_DB_TO_LOCAL[key] || key;
        mappedRecord[localKey] = val;
      }

      // coach_drills: the database column is image_url, but the app uses `url`
      if (tableName === 'coach_drills') {
        mappedRecord.url = (row as any).image_url;
      }

      if ('approved' in mappedRecord || tableName === 'users' || tableName === 'associations' || tableName === 'clubs' || tableName === 'teams' || tableName === 'coaches' || tableName === 'players') {
        mappedRecord.approved = true;
      }
      return mappedRecord as T;
    });
  },

  async saveDocument(id: string, collectionName: string, data: any): Promise<void> {
    const tableName = COLLECTION_TO_TABLE[collectionName];
    if (!tableName) {
      // LocalStorage fallback for non-existing schemas
      const localData = localStorage.getItem(`echelon_fallback_${collectionName}`);
      let currentList = localData ? (JSON.parse(localData) as any[]) : [];
      currentList = currentList.filter(item => item.id !== id);
      currentList.push({ ...data, id, approved: true });
      localStorage.setItem(`echelon_fallback_${collectionName}`, JSON.stringify(currentList));
      return;
    }

    const uuidId = sanitizeUUID(id);
    let payload: any = {};

    {
      // Convert local keys to corresponding database columns
      const rowToUpsert: any = {};
      for (const [key, val] of Object.entries(data)) {
        const dbKey = FIELD_MAPPING_LOCAL_TO_DB[key] || key;

        // Auto-sanitize id/foreign keys to valid UUID formats in Supabase
        const uuidKeys = ['association_id', 'club_id', 'team_id', 'coach_id', 'id', 'player_id', 'parent_org_id', 'from_assignment_id', 'child_player_id', 'parent_user_id', 'schedule_id'];
        if (uuidKeys.includes(dbKey) && typeof val === 'string') {
          rowToUpsert[dbKey] = sanitizeUUID(val);
        } else if (dbKey === 'team_ids' && Array.isArray(val)) {
          rowToUpsert[dbKey] = val.map(v => typeof v === 'string' ? sanitizeUUID(v) : v);
        } else if (dbKey === 'coach_ids' && Array.isArray(val)) {
          rowToUpsert[dbKey] = val.map(v => typeof v === 'string' ? sanitizeUUID(v) : v);
        } else if (dbKey === 'child_player_ids' && Array.isArray(val)) {
          rowToUpsert[dbKey] = val.map(v => typeof v === 'string' ? sanitizeUUID(v) : v);
        } else if (dbKey === 'completed_by_player_ids' && Array.isArray(val)) {
          rowToUpsert[dbKey] = val.map(v => typeof v === 'string' ? sanitizeUUID(v) : v);
        } else {
          rowToUpsert[dbKey] = val;
        }
      }

      // coach_drills: the app uses `url`, the database column is image_url
      if (tableName === 'coach_drills' && typeof (data as any).url === 'string') {
        rowToUpsert.image_url = (data as any).url;
      }

      // Force approved to always be true for non-playbook tables
      if (tableName !== 'tactical_playbooks') {
        rowToUpsert.approved = true;
      }

      // Filter to only allowed schema columns
      const allowedColumns = SCHEMA_COLUMNS[tableName];
      for (const col of allowedColumns) {
        if (rowToUpsert[col] !== undefined) {
          payload[col] = rowToUpsert[col];
        }
      }
    }

    // Always guarantee primary key id exists as valid UUID
    payload.id = uuidId;

    const { error } = await supabase
      .from(tableName)
      .upsert(payload);

    if (error) {
      console.error(`Supabase saveDocument error [${tableName}/${uuidId}]:`, error);
      throw error;
    }
  },

  async deleteDocument(id: string, collectionName: string): Promise<void> {
    const tableName = COLLECTION_TO_TABLE[collectionName];
    if (!tableName) {
      const localData = localStorage.getItem(`echelon_fallback_${collectionName}`);
      if (localData) {
        let currentList = JSON.parse(localData) as any[];
        currentList = currentList.filter(item => item.id !== id);
        localStorage.setItem(`echelon_fallback_${collectionName}`, JSON.stringify(currentList));
      }
      return;
    }

    const uuidId = sanitizeUUID(id);
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', uuidId);

    if (error) {
      console.error(`Supabase deleteDocument error [${tableName}/${uuidId}]:`, error);
      throw error;
    }
  },

  async wipeAll(): Promise<void> {
    for (const coll of ['runLogs', 'assignments', 'moduleCompletions', 'requests', 'dailyMetrics']) {
      localStorage.removeItem(`echelon_fallback_${coll}`);
    }

    for (const tableName of Object.values(COLLECTION_TO_TABLE)) {
      try {
        await supabase
          .from(tableName)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (err) {
        console.warn(`Wipe error on ${tableName}:`, err);
      }
    }
  }
};

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function sanitizeUUID(id: string | null | undefined): string {
  if (!id) return '00000000-0000-0000-0000-000000000000';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  if (id === 'assoc-1') return '00000000-0000-0000-0051-000000000001';
  if (id === 'club-1') return '00000000-0005-0000-0000-000000000001';
  if (id === 'team-1') return '00000000-0000-0004-0000-000000000001';
  if (id === 'coach-1') return '00000000-0000-0000-0003-000000000001';

  // Deterministic mapping for custom text keys to prevent crashes
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0') + 
              Math.abs(hash * 31).toString(16).padStart(8, '0') +
              Math.abs(hash * 37).toString(16).padStart(8, '0') +
              Math.abs(hash * 41).toString(16).padStart(8, '0');
  
  const padded = hex.padEnd(32, '0').slice(0, 32);
  return `${padded.slice(0, 8)}-${padded.slice(8, 12)}-${padded.slice(12, 16)}-${padded.slice(16, 20)}-${padded.slice(20, 32)}`;
}