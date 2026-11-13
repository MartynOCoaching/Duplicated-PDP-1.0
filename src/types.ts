/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// Shared domain types for the PDP Sports Network app.
// camelCase here; supabase.ts maps to snake_case database columns.
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'association' | 'club' | 'team' | 'coach' | 'player' | 'parent';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  approved: boolean;
  associationId?: string;
  clubId?: string;
  teamId?: string;
  /** Coaches: all teams they manage. */
  teamIds?: string[];
  coachId?: string;
  /** Players: all coaches they train under. */
  coachIds?: string[];
  /** Parent/child linking. */
  childPlayerId?: string;
  childPlayerIds?: string[];
  parentUserId?: string;
  /** Player: coach entered manually when not on the platform. */
  manualCoachName?: string;
  manualCoachEmail?: string;
  /** Coach role within the team. */
  coachRole?: 'head' | 'assistant' | string;
  avatarUrl?: string | null;
  create_at?: string;
}

export interface Association {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone?: string;
  approved: boolean;
  UUID?: string;
  association_name?: string;
  association_email?: string;
  associationName?: string;
  associationEmail?: string;
  /** Legacy convenience columns kept in sync with a linked club. */
  club?: string;
  club_name?: string;
  club_email?: string;
  club_contact?: string;
  association_id?: string;
  create_at?: string;
}

export interface Club {
  id: string;
  name: string;
  associationId: string;
  contactEmail: string;
  approved: boolean;
  UUID?: string;
  club?: string;
  club_name?: string;
  club_email?: string;
  club_contact?: string;
  association_id?: string;
  clubName?: string;
  clubEmail?: string;
  create_at?: string;
}

export interface Team {
  id: string;
  name: string;
  clubId: string;
  contactEmail: string;
  approved: boolean;
  create_at?: string;
}

export interface Coach {
  id: string;
  name: string;
  email: string;
  teamId: string;
  teamIds?: string[];
  coachRole?: string;
  approved: boolean;
  UUID?: string;
  coach?: string;
  coach_name?: string;
  coach_email?: string;
  team?: string;
  coachName?: string;
  coachEmail?: string;
  teamName?: string;
  avatarUrl?: string | null;
  create_at?: string;
}

export interface Player {
  id: string;
  name: string;
  email: string;
  coachId?: string;
  teamId?: string;
  teamIds?: string[];
  clubId?: string;
  associationId?: string;
  approved: boolean;
  UUID?: string;
  player_name?: string;
  player_email?: string;
  playerName?: string;
  playerEmail?: string;
  avatarUrl?: string | null;
  create_at?: string;
}

/** Registration request from an organisation (association / club / team / coach). */
export interface OrgProfileRequest {
  id: string;
  name: string;
  type: 'association' | 'club' | 'team' | 'coach' | string;
  contactEmail: string;
  parentOrgId?: string;
  status?: 'pending' | 'approved' | 'rejected' | string;
  createdAt?: string;
  create_at?: string;
}

// ---------------------------------------------------------------------------
// GPS runs
// ---------------------------------------------------------------------------

export interface GPSTrackPoint {
  latitude: number;
  longitude: number;
  /** Epoch milliseconds. */
  timestamp: number;
  /** Speed in m/s. */
  speed?: number;
}

export interface RunLog {
  id: string;
  playerId: string;
  /** YYYY-MM-DD. */
  date: string;
  durationSeconds: number;
  distanceKm: number;
  avgSpeedKmH: number;
  maxSpeedKmH: number;
  minSpeedKmH: number;
  gpsTrackPoints: GPSTrackPoint[];
  fromAssignmentId?: string | null;
}

// ---------------------------------------------------------------------------
// Daily wellness metrics
// ---------------------------------------------------------------------------

export type SleepQuality = 'Poor' | 'Fair' | 'Good' | 'Excellent';

export interface DailyMetrics {
  id?: string;
  playerId: string;
  /** YYYY-MM-DD. */
  date: string;
  hydrationMls: number;
  hydrationGoalMls: number;
  sleepHours: number;
  sleepQuality?: SleepQuality | string;
  nutritionCalories?: number;
  nutritionProteinG?: number;
  nutritionCarbsG?: number;
  nutritionFatG?: number;
  runDistanceGoalKm?: number;
}

// ---------------------------------------------------------------------------
// Classroom / education
// ---------------------------------------------------------------------------

export interface ClassroomSession {
  id: string;
  category: string;
  title: string;
  description?: string;
  imageUrl?: string;
  videoUrl?: string;
  /** Row creation timestamp from the database (mapped from created_at). */
  create_at?: string;
}

export interface QuizScore {
  score: number;
  total: number;
}

export interface ModuleCompletion {
  id: string;
  playerId: string;
  moduleId: string;
  /** YYYY-MM-DD. */
  dateCompleted: string;
  quizScore?: QuizScore | null;
}

export type AssignmentType = 'run' | 'module';

export interface Assignment {
  id: string;
  coachId: string;
  teamId: string;
  type: AssignmentType;
  title: string;
  /** YYYY-MM-DD. */
  dueDate: string;
  runDistanceKm?: number;
  moduleId?: string;
  completedByPlayerIds: string[];
  /** Single-player assignment target (optional). */
  playerId?: string;
}

// ---------------------------------------------------------------------------
// Formations
// ---------------------------------------------------------------------------

export type FormationSystem = '5v5' | '6v6' | '7v7' | '9v9' | '11v11' | (string & {});

export interface FormationAssignment {
  positionId: string;
  positionName: string;
  /** 0-100 grid coordinates. */
  x: number;
  y: number;
  playerId?: string | null;
}

export interface BenchAssignment {
  playerId?: string | null;
  playerName?: string;
  positionId?: string;
  positionName?: string;
}

export interface TeamFormation {
  id: string;
  coachId: string;
  teamId: string;
  name: string;
  system: FormationSystem | string;
  lineupName: string;
  assignments: FormationAssignment[];
  benchAssignments?: BenchAssignment[];
  /** Player ids wearing the captain badge for this lineup. */
  captains?: string[];
  notes?: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Hydration logs
// ---------------------------------------------------------------------------

export interface HydrationLog {
  id: string;
  playerId: string;
  teamId?: string;
  coachId?: string;
  /** Millilitres logged in one serving. */
  hydrationMl: number;
  /** YYYY-MM-DD. */
  logDate: string;
  /** Monday of the log's week, YYYY-MM-DD. */
  weekStartDate?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Team schedules and attendance
// ---------------------------------------------------------------------------

export interface TeamSchedule {
  id: string;
  coachId: string;
  teamId: string;
  /** YYYY-MM-DD. */
  sessionDate: string;
  /** HH:MM. */
  sessionTime: string;
  location?: string;
  notes?: string;
  /** 'practice' | 'game' | 'activity' | 'tournament'. Defaults to 'practice'. */
  eventType?: string;
}

export interface SessionAttendance {
  id: string;
  scheduleId: string;
  playerId: string;
  present: boolean;
  recordedBy?: string;
  teamId?: string;
  sessionDate?: string;
  sessionTime?: string;
}
