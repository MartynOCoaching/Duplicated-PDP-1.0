/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Landmark,
  Users,
  User,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Mail,
  Calendar,
  Award,
  Clock,
  MapPin,
  FileText,
  Check,
  X
} from 'lucide-react';
import { UserProfile, Club, Team, Coach, TeamSchedule, SessionAttendance } from '../types';
import { sanitizeUUID } from '../supabase';

// Ball icons for attendance, matching the coach's attendance log:
// check ball = attended, X ball = absent.
const CHECK_BALL_ICON = '/attendance-check-ball.webp';
const X_BALL_ICON = '/attendance-x-ball.webp';

// Drill thumbnail layout. Keep these in sync with the coaches dashboard.
const DRILL_THUMB_ZOOM = 1.1;   // image width as a multiple of the thumbnail width
const DRILL_THUMB_OFFSET_X = 0; // % of thumbnail width; positive moves image right
const DRILL_THUMB_OFFSET_Y = 0; // % of thumbnail height; positive moves image down

// Per-image vertical nudges, matched by part of the image URL.
const DRILL_THUMB_Y_OVERRIDES: { match: string; offsetY: number }[] = [
  { match: 'warm', offsetY: 0 }, // adjust until the warm-up drill lines up with the others
];

const getDrillThumbStyle = (url: string): CSSProperties => {
  const override = DRILL_THUMB_Y_OVERRIDES.find(o => url.toLowerCase().includes(o.match));
  return {
    position: 'absolute',
    width: `${DRILL_THUMB_ZOOM * 100}%`,
    height: 'auto',
    maxWidth: 'none',
    left: `${(1 - DRILL_THUMB_ZOOM) * 50 + DRILL_THUMB_OFFSET_X}%`,
    top: `${DRILL_THUMB_OFFSET_Y + (override?.offsetY ?? 0)}%`,
  };
};

export interface CoachDrillRecord {
  id: string;
  coachId: string;
  teamId: string;
  scheduleId: string;
  url: string;
}

// Matches loosely-typed keys (names, ids, legacy text ids) the same way the
// rest of the dashboards do, so club/team/player links resolve consistently.
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

const initials = (name: string) => (name || '?').substring(0, 2).toUpperCase();

const formatAxisDate = (date: string) => {
  if (!date) return '--';
  const parsed = new Date(`${date}T00:00`);
  if (isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  });
};

const formatSessionDisplay = (date: string, time: string) => {
  const d = new Date(`${date}T${time || '00:00'}`);
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

interface AssociationTeamBrowserProps {
  currentProfile: UserProfile;
  clubs: Club[];
  teams: Team[];
  coaches: Coach[];
  players: UserProfile[];
  teamSchedules: TeamSchedule[];
  sessionAttendance: SessionAttendance[];
  coachDrills?: CoachDrillRecord[];
}

export default function AssociationTeamBrowser({
  currentProfile,
  clubs,
  teams,
  coaches,
  players,
  teamSchedules,
  sessionAttendance,
  coachDrills = []
}: AssociationTeamBrowserProps) {
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [openSessionIds, setOpenSessionIds] = useState<Record<string, boolean>>({});

  const toggleSession = (sessionId: string) =>
    setOpenSessionIds(prev => ({ ...prev, [sessionId]: !prev[sessionId] }));

  const assocId = currentProfile.associationId || 'assoc-1';

  // Escape closes the full-size drill preview and locks background scroll
  useEffect(() => {
    if (!previewUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewUrl(null);
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewUrl]);

  // Clubs belonging to this association, matching the scope used by the
  // association dashboard so both screens list the same organizations.
  const scopedClubs = useMemo(
    () => clubs.filter(c => matchKeys(c.associationId, assocId) && c.approved),
    [clubs, assocId]
  );

  const teamsForClub = (clubId: string) =>
    teams.filter(t => matchKeys(t.clubId, clubId) && t.approved);

  const playersForTeam = (teamId: string) =>
    players.filter(
      p =>
        p.role === 'player' &&
        (matchKeys(p.teamId, teamId) ||
          (p.teamIds || []).some(id => matchKeys(id, teamId)))
    );

  const coachesForTeam = (teamId: string) =>
    coaches.filter(
      c =>
        c.approved &&
        (matchKeys(c.teamId, teamId) || (c.teamIds || []).some(id => matchKeys(id, teamId)))
    );

  const selectedClub = scopedClubs.find(c => c.id === selectedClubId) || null;
  const selectedTeam = selectedClub
    ? teamsForClub(selectedClub.id).find(t => t.id === selectedTeamId) || null
    : null;
  const teamRoster = selectedTeam ? playersForTeam(selectedTeam.id) : [];
  const selectedPlayer = selectedTeam
    ? teamRoster.find(p => p.id === selectedPlayerId) || null
    : null;

  const totalTeams = scopedClubs.reduce((acc, c) => acc + teamsForClub(c.id).length, 0);
  const totalPlayers = scopedClubs.reduce(
    (acc, c) => acc + teamsForClub(c.id).reduce((sum, t) => sum + playersForTeam(t.id).length, 0),
    0
  );

  const goToClubs = () => {
    setSelectedClubId(null);
    setSelectedTeamId(null);
    setSelectedPlayerId(null);
  };

  const goToTeams = () => {
    setSelectedTeamId(null);
    setSelectedPlayerId(null);
  };

  const goToPlayers = () => setSelectedPlayerId(null);

  // Team sessions in date order, shared by the team schedule and athlete attendance.
  const teamSessions = useMemo(() => {
    if (!selectedTeam) return [];
    return teamSchedules
      .filter(s => matchKeys(s.teamId, selectedTeam.id))
      .sort(
        (a, b) =>
          new Date(`${a.sessionDate}T${a.sessionTime || '00:00'}`).getTime() -
          new Date(`${b.sessionDate}T${b.sessionTime || '00:00'}`).getTime()
      );
  }, [teamSchedules, selectedTeam]);

  const now = Date.now();

  const drillsForSession = (sessionId: string) =>
    selectedTeam
      ? coachDrills.filter(
          d => matchKeys(d.teamId, selectedTeam.id) && matchKeys(d.scheduleId, sessionId)
        )
      : [];

  const presentForSession = (sessionId: string) =>
    teamRoster.filter(p =>
      sessionAttendance.some(
        a => a.present && matchKeys(a.scheduleId, sessionId) && matchKeys(a.playerId, p.id)
      )
    );

  // ---- Player attendance (same rule as the coach's attendance log) ----
  const playerAttendance = useMemo(() => {
    if (!selectedPlayer) return [];
    return teamSessions.map(session => ({
      session,
      present: sessionAttendance.some(
        a =>
          a.playerId === selectedPlayer.id &&
          a.present &&
          (a.scheduleId
            ? a.scheduleId === session.id
            : a.sessionDate === session.sessionDate &&
              matchKeys(a.teamId, session.teamId))
      )
    }));
  }, [teamSessions, selectedPlayer, sessionAttendance]);

  const attendedCount = playerAttendance.filter(b => b.present).length;

  const statTile = (
    icon: ReactNode,
    label: string,
    value: string,
    unit: string
  ) => (
    <div className="bg-slate-950 border border-slate-850 rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 text-slate-500 mb-1.5">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-base font-bold font-mono text-[#00bbff]">{value}</div>
      <div className="text-[10px] font-mono uppercase text-slate-500">{unit}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb trail */}
      <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
        <button
          type="button"
          onClick={goToClubs}
          className={`transition ${
            selectedClubId ? 'text-slate-400 hover:text-[#00bbff]' : 'text-[#00bbff] font-bold'
          }`}
        >
          Clubs
        </button>
        {selectedClub && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <button
              type="button"
              onClick={goToTeams}
              className={`transition ${
                selectedTeamId ? 'text-slate-400 hover:text-[#00bbff]' : 'text-[#00bbff] font-bold'
              }`}
            >
              {selectedClub.name}
            </button>
          </>
        )}
        {selectedTeam && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <button
              type="button"
              onClick={goToPlayers}
              className={`transition ${
                selectedPlayerId ? 'text-slate-400 hover:text-[#00bbff]' : 'text-[#00bbff] font-bold'
              }`}
            >
              {selectedTeam.name}
            </button>
          </>
        )}
        {selectedPlayer && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-[#00bbff] font-bold">{selectedPlayer.name}</span>
          </>
        )}
      </div>

      {/* Association-wide summary header (visible at every drill-down level) */}
      <div className="grid grid-cols-3 gap-4">
        {statTile(<Landmark className="w-3.5 h-3.5" />, 'Clubs', String(scopedClubs.length), 'registered')}
        {statTile(<Users className="w-3.5 h-3.5" />, 'Teams', String(totalTeams), 'active')}
        {statTile(<User className="w-3.5 h-3.5" />, 'Athletes', String(totalPlayers), 'enrolled')}
      </div>

      {/* Level 1: clubs in this association */}
      {!selectedClub && (
        <>
          {scopedClubs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40">
              <Award className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-xs text-slate-400 font-mono">No clubs registered under this association yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {scopedClubs.map(club => {
                const clubTeams = teamsForClub(club.id);
                const clubPlayers = clubTeams.reduce(
                  (acc, t) => acc + playersForTeam(t.id).length,
                  0
                );
                return (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => setSelectedClubId(club.id)}
                    className="text-left bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg transition hover:border-[#00bbff]/40 hover:bg-slate-850 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="p-2 bg-[#00bbff]/10 border border-[#00bbff]/20 rounded-xl shrink-0">
                        <Landmark className="w-4 h-4 text-[#00bbff]" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-[#00bbff] transition shrink-0" />
                    </div>
                    <h3 className="text-sm font-bold font-sans text-slate-100 mt-3 truncate">
                      {club.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-1 truncate">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{club.contactEmail || 'No contact email'}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-800 text-[11px] font-mono">
                      <span className="text-slate-400">
                        <b className="text-slate-200">{clubTeams.length}</b> teams
                      </span>
                      <span className="text-slate-400">
                        <b className="text-slate-200">{clubPlayers}</b> athletes
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Level 2: teams inside the selected club */}
      {selectedClub && !selectedTeam && (
        <>
          <button
            type="button"
            onClick={goToClubs}
            className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-[#00bbff] transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All clubs
          </button>

          {teamsForClub(selectedClub.id).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40">
              <Award className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-xs text-slate-400 font-mono">
                No teams registered under {selectedClub.name} yet
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {teamsForClub(selectedClub.id).map(team => {
                const teamPlayers = playersForTeam(team.id);
                const teamCoaches = coachesForTeam(team.id);
                return (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setSelectedTeamId(team.id)}
                    className="text-left bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg transition hover:border-[#00bbff]/40 hover:bg-slate-850 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="p-2 bg-[#00bbff]/10 border border-[#00bbff]/20 rounded-xl shrink-0">
                        <Users className="w-4 h-4 text-[#00bbff]" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-[#00bbff] transition shrink-0" />
                    </div>
                    <h3 className="text-sm font-bold font-sans text-slate-100 mt-3 truncate">
                      {team.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-1 truncate">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{team.contactEmail || 'No contact email'}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-800 space-y-1">
                      <div className="text-[11px] font-mono text-slate-400">
                        <b className="text-slate-200">{teamPlayers.length}</b> athletes
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        Coach:{' '}
                        <b className="text-slate-200">
                          {teamCoaches.length > 0
                            ? teamCoaches.map(c => c.name).join(', ')
                            : 'Unassigned'}
                        </b>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Level 3: roster and collapsible sessions for the selected team */}
      {selectedClub && selectedTeam && !selectedPlayer && (
        <>
          <button
            type="button"
            onClick={goToTeams}
            className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-[#00bbff] transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {selectedClub.name} teams
          </button>

          {/* Roster */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                Roster ({teamRoster.length})
              </span>
            </div>

            {teamRoster.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-4 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <Award className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400 font-mono">
                  No athletes enrolled in {selectedTeam.name} yet
                </p>
              </div>
            ) : (
              <div className="space-y-2 bg-white border border-slate-200 p-3.5 rounded-2xl shadow-sm">
                {teamRoster.map(player => {
                  const playerCoaches = coachesForTeam(selectedTeam.id).filter(
                    c => matchKeys(c.id, player.coachId)
                  );
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setSelectedPlayerId(player.id)}
                      className="w-full flex items-center justify-between p-3 rounded-xl transition bg-white border border-slate-200 hover:bg-sky-50 hover:border-sky-200 group text-left shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-sky-100 border border-sky-200 flex items-center justify-center font-bold text-xs shrink-0 select-none text-sky-600">
                          {initials(player.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-sans font-bold text-slate-800 text-xs truncate">
                            {player.name}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            {player.email}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 pl-3">
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] font-mono uppercase text-slate-400">Coach</div>
                          <div className="text-[11px] font-mono text-slate-700">
                            {playerCoaches[0]?.name || player.manualCoachName || 'Unassigned'}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-[#00bbff] transition" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sessions with attendance and drills (collapsible) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#00bbff]" />
              <span className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                Sessions ({teamSessions.length})
              </span>
            </div>

            {teamSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <Calendar className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400 font-mono">
                  No sessions have been scheduled for this team yet
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {teamSessions.map(session => {
                  const isOpen = !!openSessionIds[session.id];
                  const isUpcoming =
                    new Date(`${session.sessionDate}T${session.sessionTime || '00:00'}`).getTime() >= now;
                  const drills = drillsForSession(session.id);
                  const present = presentForSession(session.id);

                  return (
                    <div
                      key={session.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden"
                    >
                      {/* Collapsed header: always visible */}
                      <button
                        type="button"
                        onClick={() => toggleSession(session.id)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-850/40 transition"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Clock className="w-3.5 h-3.5 text-[#00bbff] shrink-0" />
                            <p className="text-sm font-semibold text-slate-100">
                              {formatSessionDisplay(session.sessionDate, session.sessionTime)}
                            </p>
                            <span
                              className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                isUpcoming
                                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                  : 'text-slate-400 bg-slate-950 border-slate-800'
                              }`}
                            >
                              {isUpcoming ? 'Upcoming' : 'Past'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {session.location && (
                              <span className="text-[10px] font-mono text-emerald-300/90 flex items-center gap-1">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{session.location}</span>
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-slate-400">
                              {present.length} of {teamRoster.length} present
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {drills.length} drill{drills.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {/* Expanded body: attendance and drills */}
                      {isOpen && (
                        <div className="px-4 pb-4 pt-3 space-y-4 border-t border-slate-800">
                          {present.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {present.map(p => (
                                <span
                                  key={p.id}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"
                                >
                                  <Check className="w-2.5 h-2.5" />
                                  {p.name}
                                </span>
                              ))}
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-2 mb-3">
                              <FileText className="w-3.5 h-3.5 text-[#00bbff]" />
                              <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                                Session Drill Images
                              </span>
                              <span className="text-[9px] font-mono text-slate-500">({drills.length})</span>
                            </div>

                            {drills.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {drills.map(drill => (
                                  <div
                                    key={drill.id}
                                    className="overflow-hidden rounded-xl bg-slate-950 border border-slate-800"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setPreviewUrl(drill.url)}
                                      title="View full drill image"
                                      className="relative w-full aspect-video bg-slate-900 overflow-hidden cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-[#00bbff]/50"
                                    >
                                      <img
                                        src={drill.url}
                                        alt="Session drill"
                                        style={getDrillThumbStyle(drill.url)}
                                        onError={e => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    </button>
                                    <div className="px-2.5 py-2 border-t border-slate-800">
                                      <p className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">
                                        Drill Image
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-3 py-4 text-center">
                                <p className="text-[9px] font-mono text-slate-600 uppercase">
                                  No drill images attached
                                </p>
                              </div>
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
        </>
      )}

      {/* Level 4: the selected athlete's data */}
      {selectedClub && selectedTeam && selectedPlayer && (
        <>
          <button
            type="button"
            onClick={goToPlayers}
            className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-[#00bbff] transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {selectedTeam.name} athletes
          </button>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-lg shrink-0 select-none text-slate-200">
                {initials(selectedPlayer.name)}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold font-sans text-slate-100 truncate">
                  {selectedPlayer.name}
                </h3>
                <div className="text-[11px] text-slate-500 font-mono truncate">
                  {selectedPlayer.email}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-mono uppercase">
                  <span className="px-2 py-0.5 rounded-full bg-[#00bbff]/10 text-[#00bbff] border border-[#00bbff]/20">
                    {selectedClub.name}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800">
                    {selectedTeam.name}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800">
                    {selectedPlayer.approved ? 'Approved' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {statTile(
              <Calendar className="w-3.5 h-3.5" />,
              'Sessions attended',
              `${attendedCount}/${playerAttendance.length}`,
              'check-ins'
            )}
            {statTile(
              <Users className="w-3.5 h-3.5" />,
              'Sessions scheduled',
              String(playerAttendance.length),
              'for this team'
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div>
              <h4 className="text-xs font-bold font-sans text-slate-200 uppercase tracking-wider">
                Attendance log
              </h4>
            </div>

            {playerAttendance.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <Calendar className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400 font-mono">
                  No sessions have been scheduled for this team yet
                </p>
              </div>
            ) : (
              <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 overflow-x-auto">
                <div className="flex items-start gap-4 min-w-max">
                  {playerAttendance.map(({ session, present }) => (
                    <div key={session.id} className="flex flex-col items-center shrink-0">
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
            )}
          </div>
        </>
      )}

      {/* Full-size drill preview (portaled to <body> so it sits above everything) */}
      {typeof document !== 'undefined' &&
        createPortal(
          previewUrl ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Session drill image preview"
              className="fixed inset-0 overflow-auto bg-black/85 backdrop-blur-sm"
              style={{ zIndex: 2147483647 }}
              onClick={() => setPreviewUrl(null)}
            >
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setPreviewUrl(null);
                }}
                className="fixed top-3 right-3 sm:top-5 sm:right-5 z-20 w-9 h-9 rounded-lg bg-slate-950/90 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 flex items-center justify-center transition cursor-pointer"
                title="Close (Esc)"
                aria-label="Close image preview"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="min-h-full min-w-full w-max flex p-3 sm:p-6">
                <div
                  onClick={e => e.stopPropagation()}
                  className="m-auto bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl"
                >
                  <img
                    src={previewUrl}
                    alt="Session drill full view"
                    className="block max-w-[calc(100vw-2.5rem)] sm:max-w-[calc(100vw-4rem)] max-h-[calc(100vh-4rem)] w-auto h-auto object-contain rounded-xl"
                  />
                </div>
              </div>
            </div>
          ) : null,
          document.body
        )}
    </div>
  );
}