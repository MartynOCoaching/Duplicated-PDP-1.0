import React, { useMemo, useState } from 'react';
import { User, Mail, Users, Award, Landmark, Shield, Save, CircleCheck as CheckCircle, Briefcase, Plus, X, Star, ChevronDown } from 'lucide-react';
import { UserProfile, Team, Coach, UserRole } from '../types';
import ProfileAvatar from './ProfileAvatar';

interface ProfileTabProps {
  profile: UserProfile;
  teams: Team[];
  coaches: Coach[];
  allPlayers?: UserProfile[];
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  onAddPlayer?: (fields: { firstName: string; surname: string; coachId?: string; teamId?: string }) => Promise<void>;
  onLinkChild?: (playerId: string) => Promise<void>;
  linkedChildren?: UserProfile[];
  // Parent: get the claim code for a child who doesn't have their own login yet
  onGetChildClaimCode?: (childId: string) => Promise<string>;
  // Player: link their own account to a child profile a parent created, using the code
  onClaimWithCode?: (code: string) => Promise<void>;
  avatarUrl?: string | null;
onUploadAvatar?: (file: Blob) => Promise<void>;
onRemoveAvatar?: () => Promise<void>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  association: 'Association',
  club: 'Club',
  team: 'Team',
  coach: 'Coach',
  player: 'Player',
  parent: 'Parent',
};

// ---------------------------------------------------------------------------
// Duplicate detection helpers
// ---------------------------------------------------------------------------

/** Lowercase, strip accents, collapse spaces. "  José  Núñez " -> "jose nunez" */
const normaliseName = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Edit distance between two strings (how many single-letter changes apart they are). */
const editDistance = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
};

const splitFirstLast = (full: string) => {
  const parts = normaliseName(full).split(' ').filter(Boolean);
  return {
    first: parts[0] || '',
    last: parts.length > 1 ? parts[parts.length - 1] : '',
  };
};

/**
 * Compares a typed name with athletes already on the team.
 * - exact: same full name (blocked: this is almost certainly the same child)
 * - similar: same surname and a close first name, e.g. "Sam" / "Samuel", "Jon" / "John"
 */
export function findDuplicateCandidates(
  firstName: string,
  surname: string,
  candidates: UserProfile[]
): { exact: UserProfile[]; similar: UserProfile[] } {
  const wantedFull = normaliseName(`${firstName} ${surname}`);
  const wf = normaliseName(firstName);
  const ws = normaliseName(surname);
  const exact: UserProfile[] = [];
  const similar: UserProfile[] = [];

  if (!wf || !ws) return { exact, similar };

  for (const p of candidates) {
    const full = normaliseName(p.name || '');
    if (!full) continue;

    if (full === wantedFull) {
      exact.push(p);
      continue;
    }

    const { first: cf, last: cl } = splitFirstLast(p.name || '');
    if (!cf || !cl) continue;

    const surnameClose = cl === ws || editDistance(cl, ws) <= (ws.length >= 6 ? 2 : 1);
    const firstClose =
      cf === wf ||
      (Math.min(cf.length, wf.length) >= 3 && (cf.startsWith(wf) || wf.startsWith(cf))) ||
      editDistance(cf, wf) <= 1;

    if (surnameClose && firstClose) similar.push(p);
  }

  return { exact, similar };
}

export default function ProfileTab({
  profile,
  teams,
  coaches,
  allPlayers = [],
  onUpdateProfile,
  onAddPlayer,
  onLinkChild,
  linkedChildren = [],
  onGetChildClaimCode,
  onClaimWithCode,
  avatarUrl,
  onUploadAvatar,
  onRemoveAvatar
}: ProfileTabProps) {
  const [name, setName] = useState(profile.name || '');
  const [email, setEmail] = useState(profile.email || '');
  const [teamId, setTeamId] = useState(profile.teamId || '');
  const [coachId, setCoachId] = useState(profile.coachId || '');
  const [manualCoachName, setManualCoachName] = useState(profile.manualCoachName || '');
  const [manualCoachEmail, setManualCoachEmail] = useState(profile.manualCoachEmail || '');
  const [coachRole, setCoachRole] = useState(profile.coachRole || 'head');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(profile.teamIds || (profile.teamId ? [profile.teamId] : []));
  const [newTeamId, setNewTeamId] = useState('');
  const [childTeamId, setChildTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [playerFirstName, setPlayerFirstName] = useState('');
  const [playerSurname, setPlayerSurname] = useState('');
  const [playerCoachId, setPlayerCoachId] = useState(profile.coachId || '');
  const [playerTeamId, setPlayerTeamId] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [playerAdded, setPlayerAdded] = useState(false);
  const [playerError, setPlayerError] = useState('');

  const availableTeams = teams.filter(t => t.approved);
  const availableCoaches = coaches.filter(c => c.approved);

  const isCoach = profile.role === 'coach';

  const teamsNotYetAdded = availableTeams.filter(t => !selectedTeamIds.includes(t.id));

  const handleAddTeam = () => {
    if (!newTeamId) return;
    if (selectedTeamIds.includes(newTeamId)) return;
    const updated = [...selectedTeamIds, newTeamId];
    setSelectedTeamIds(updated);
    if (!teamId) setTeamId(newTeamId);
    setNewTeamId('');
  };

  const handleRemoveTeam = (id: string) => {
    const updated = selectedTeamIds.filter(t => t !== id);
    setSelectedTeamIds(updated);
    if (teamId === id) {
      setTeamId(updated[0] || '');
    }
  };

  const handleAddPlayer = async (e: React.FormEvent, overrideCoachId?: string, overrideTeamId?: string) => {
    e.preventDefault();
    if (!onAddPlayer) return;
    if (!playerFirstName.trim() || !playerSurname.trim()) {
      setPlayerError("Please enter the athlete's first name and surname.");
      return;
    }
    setPlayerError('');
    setAddingPlayer(true);
    setPlayerAdded(false);
    try {
      await onAddPlayer({
        firstName: playerFirstName.trim(),
        surname: playerSurname.trim(),
        coachId: overrideCoachId || playerCoachId || undefined,
        teamId: overrideTeamId || playerTeamId || undefined
      });
      setPlayerFirstName('');
      setPlayerSurname('');
      setPlayerAdded(true);
      setTimeout(() => setPlayerAdded(false), 4000);
    } catch (err) {
      setPlayerError(err instanceof Error ? err.message : 'Failed to add athlete.');
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleSetActiveTeam = (id: string) => {
    setTeamId(id);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);

    const updates: Partial<UserProfile> = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      teamId: teamId || undefined,
      coachId: coachId || undefined,
      manualCoachName: manualCoachName.trim() || undefined,
      manualCoachEmail: manualCoachEmail.trim() || undefined,
      coachRole: isCoach ? coachRole : undefined,
    };

    if (isCoach) {
      updates.teamIds = selectedTeamIds.length > 0 ? selectedTeamIds : undefined;
    }

    try {
      await onUpdateProfile(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition-colors';
  const labelClass =
    'block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-4">
          <ProfileAvatar
            role={profile.role}
            avatarUrl={avatarUrl}
            onUpload={onUploadAvatar}
            onRemove={onRemoveAvatar}
          />
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800 truncate">{profile.name}</h2>
            <p className="text-xs text-slate-500">{ROLE_LABELS[profile.role]}</p>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div>
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-sky-500" />
            Personal Information
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className={labelClass}>Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>
          </div>
        </div>

        {/* Coach: multi-team management */}
        {isCoach && (
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-sky-500" />
              My Teams
            </h3>

            <p className="text-[11px] text-slate-400 mb-4">
              You can be linked to multiple teams. The starred team is your active focus team.
            </p>

            {/* List of linked teams */}
            {selectedTeamIds.length > 0 ? (
              <div className="space-y-2 mb-4">
                {selectedTeamIds.map((tid) => {
                  const team = availableTeams.find(t => t.id === tid);
                  const teamName = team ? team.name : tid;
                  const isActive = teamId === tid;
                  return (
                    <div
                      key={tid}
                      className={`flex items-center justify-between rounded-xl border px-4 py-2.5 transition ${
                        isActive
                          ? 'border-sky-300 bg-sky-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleSetActiveTeam(tid)}
                          className={`shrink-0 transition ${
                            isActive
                              ? 'text-sky-500'
                              : 'text-slate-300 hover:text-sky-400'
                          }`}
                          title={isActive ? 'Active team' : 'Set as active team'}
                        >
                          <Star className={`w-4 h-4 ${isActive ? 'fill-sky-400' : ''}`} />
                        </button>
                        <span className="text-sm font-semibold text-slate-700 truncate">
                          {teamName}
                        </span>
                        {isActive && (
                          <span className="text-[9px] font-mono uppercase tracking-wider text-sky-500 bg-sky-100 px-1.5 py-0.5 rounded shrink-0">
                            Active
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTeam(tid)}
                        className="shrink-0 text-slate-300 hover:text-rose-400 transition p-1"
                        title="Remove team"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4">
                You are not linked to any teams yet. Add one below.
              </div>
            )}

            {/* Add a team */}
            {teamsNotYetAdded.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  className={`${inputClass} flex-1`}
                >
                  <option value="">-- Select a team to add --</option>
                  {teamsNotYetAdded.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddTeam}
                  disabled={!newTeamId}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold text-sm transition flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Add Team
                </button>
              </div>
            )}

            {/* Coach role */}
            <div className="mt-4">
              <label className={labelClass}>Coach Role</label>
              <select
                value={coachRole}
                onChange={(e) => setCoachRole(e.target.value as 'head' | 'assistant')}
                className={inputClass}
              >
                <option value="head">Head Coach</option>
                <option value="assistant">Assistant Coach</option>
              </select>
            </div>

            {/* My Children — link a child on any team */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-500" />
                My Children
              </h4>
              <p className="text-[11px] text-slate-400 mb-3">
                Add your child even if they play on a different team.
              </p>

              {linkedChildren.length > 0 && (
                <div className="space-y-2 mb-4">
                  {linkedChildren.map((child) => {
                    const childTeam = teams.find(t => t.id === child.teamId);
                    const childCoach = coaches.find(c => c.id === child.coachId);
                    return (
                      <div key={child.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-sky-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">{child.name}</p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {childTeam ? childTeam.name : 'No team'}
                              {childCoach ? ` · ${childCoach.name}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {child.email?.endsWith('@pdp.com') && onGetChildClaimCode && (
                            <ClaimCodeButton childId={child.id} onGet={onGetChildClaimCode} />
                          )}
                          <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            My Child
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <CoachAddChildForm
                teams={availableTeams}
                coaches={availableCoaches}
                allPlayers={allPlayers}
                profileId={profile.id}
                onAdd={handleAddPlayer}
                onLinkChild={onLinkChild}
                adding={addingPlayer}
                added={playerAdded}
                error={playerError}
                firstName={playerFirstName}
                surname={playerSurname}
                setFirstName={setPlayerFirstName}
                setSurname={setPlayerSurname}
                childTeamId={childTeamId}
                setChildTeamId={setChildTeamId}
              />
            </div>
          </div>
        )}

        {/* Player: single team + coach selection */}
        {profile.role === 'player' && (
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-sky-500" />
              Team & Coach Assignment
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Team</label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- No team selected --</option>
                  {availableTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Coach</label>
                <select
                  value={coachId}
                  onChange={(e) => setCoachId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- No coach selected --</option>
                  {availableCoaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Manual coach entry for players without an in-app coach */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-[11px] text-slate-400 mb-3">
                If your coach isn't on the platform yet, you can enter their details manually.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Manual Coach Name</label>
                  <input
                    type="text"
                    value={manualCoachName}
                    onChange={(e) => setManualCoachName(e.target.value)}
                    className={inputClass}
                    placeholder="Coach name (optional)"
                  />
                </div>
                <div>
                  <label className={labelClass}>Manual Coach Email</label>
                  <input
                    type="email"
                    value={manualCoachEmail}
                    onChange={(e) => setManualCoachEmail(e.target.value)}
                    className={inputClass}
                    placeholder="coach@example.com"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Parent: coaches with teams and team players, add child per team */}
        {profile.role === 'parent' && (() => {
          const parentCoachIds = new Set<string>();
          if (profile.coachId) parentCoachIds.add(profile.coachId);
          if (profile.coachIds) profile.coachIds.forEach(id => parentCoachIds.add(id));
          const parentCoaches = coaches.filter(c => parentCoachIds.has(c.id));
          const parentTeamIds = new Set<string>();
          if (profile.teamIds) profile.teamIds.forEach(id => parentTeamIds.add(id));
          if (profile.teamId) parentTeamIds.add(profile.teamId);
          const parentTeams = teams.filter(t => parentTeamIds.has(t.id));

          // Every child this parent is linked to, whether via the parent's own list or the child's parentUserId
          const myChildIds = new Set<string>();
          if (profile.childPlayerId) myChildIds.add(profile.childPlayerId);
          (profile.childPlayerIds || []).forEach(id => myChildIds.add(id));

          return (
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-500" />
                My Athletes & Teams
              </h3>

              {/* Parent's coaches with their teams and players */}
              {parentCoaches.length > 0 || parentTeams.length > 0 ? (
                <div className="space-y-4 mb-6">
                  {parentCoaches.map(coach => {
                    const coachTeamIds = coach.teamIds && coach.teamIds.length > 0
                      ? coach.teamIds
                      : (coach.teamId ? [coach.teamId] : []);
                    const coachTeams = parentTeams.filter(t => coachTeamIds.includes(t.id));
                    const teamsToShow = coachTeams.length > 0 ? coachTeams : parentTeams;
                    if (teamsToShow.length === 0) return null;
                    return (
                      <div key={coach.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-sky-50 border-b border-slate-200">
                          <div className="w-9 h-9 rounded-lg bg-sky-100 border border-sky-200 flex items-center justify-center shrink-0">
                            <Award className="w-4 h-4 text-sky-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-700 truncate">{coach.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                              {coach.coachRole === 'assistant' ? 'Assistant Coach' : 'Head Coach'}
                            </p>
                          </div>
                        </div>
                        {teamsToShow.map(team => {
                          const teamPlayers = allPlayers.filter(p => p.role === 'player' && p.teamId === team.id);
                          const myChildrenOnTeam = teamPlayers.filter(p => p.parentUserId === profile.id || myChildIds.has(p.id));
                          return (
                            <div key={team.id} className="border-t border-slate-100">
                              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50">
                                <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="text-xs font-bold text-slate-600">{team.name}</span>
                                <span className="text-[10px] text-slate-400 ml-auto">
                                  {teamPlayers.length} player{teamPlayers.length !== 1 ? 's' : ''} · {myChildrenOnTeam.length} mine
                                </span>
                              </div>
                              {teamPlayers.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                  {teamPlayers.map(p => {
                                    const isMine = p.parentUserId === profile.id || myChildIds.has(p.id);
                                    return (
                                      <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                          <User className="w-3.5 h-3.5 text-slate-400" />
                                        </div>
                                        <span className="text-sm text-slate-700 truncate flex-1">{p.name}</span>
                                        {isMine && (
                                          <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                                            My Child
                                          </span>
                                        )}
                                        {isMine && p.email?.endsWith('@pdp.com') && onGetChildClaimCode && (
                                          <ClaimCodeButton childId={p.id} onGet={onGetChildClaimCode} />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="px-4 py-3 text-xs text-slate-400 italic">
                                  No players assigned to this team yet.
                                </div>
                              )}
                              {/* Add child to this team (with duplicate check) */}
                              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                                <AddChildForm
                                  coachId={coach.id}
                                  teamId={team.id}
                                  teamPlayers={teamPlayers}
                                  linkedIds={myChildIds}
                                  profileId={profile.id}
                                  onAdd={handleAddPlayer}
                                  onLinkChild={onLinkChild}
                                  adding={addingPlayer}
                                  added={playerAdded}
                                  error={playerError}
                                  firstName={playerFirstName}
                                  surname={playerSurname}
                                  setFirstName={setPlayerFirstName}
                                  setSurname={setPlayerSurname}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-6">
                  You are not linked to any coaches or teams yet. Add a coach and team in your registration or contact your association.
                </div>
              )}

              {/* Children not under a registered coach or team */}
              {linkedChildren.length > 0 && parentCoaches.length === 0 && (
                <div className="space-y-2 mb-6">
                  {linkedChildren.map((child) => {
                    const childTeam = teams.find(t => t.id === child.teamId);
                    const childCoach = coaches.find(c => c.id === child.coachId);
                    return (
                      <div key={child.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-sky-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-700 truncate">{child.name}</p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {childTeam ? childTeam.name : 'No team'}
                              {childCoach ? ` · ${childCoach.name}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {child.email?.endsWith('@pdp.com') && onGetChildClaimCode && (
                            <ClaimCodeButton childId={child.id} onGet={onGetChildClaimCode} />
                          )}
                          <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            Linked
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Player: enter a claim code from a parent to link an existing child profile */}
        {profile.role === 'player' && onClaimWithCode && (
          <ClaimWithCodeCard onClaim={onClaimWithCode} />
        )}

        {/* Read-only role info */}
        <div className="pt-2 border-t border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Account Role</label>
              <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                {ROLE_LABELS[profile.role]}
              </div>
            </div>
            <div>
              <label className={labelClass}>Account Status</label>
              <div className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                Active
              </div>
            </div>
            <div>
              <label className={labelClass}>User ID</label>
              <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-mono truncate">
                {profile.id}
              </div>
            </div>
          </div>
        </div>

        {/* Error / success messages */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-xl px-4 py-3 text-xs">
            {error}
          </div>
        )}
        {saved && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl px-4 py-3 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Profile updated successfully.
          </div>
        )}

        {/* Save button */}
        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm"
        >
          {saving ? (
            'Saving...'
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </form>
    </div>
  );
}

/**
 * Parent: shows a claim code for a child who doesn't have their own login yet.
 * The code is created the first time it's requested.
 */
function ClaimCodeButton({ childId, onGet }: { childId: string; onGet: (id: string) => Promise<string> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const show = async () => {
    setBusy(true);
    setErr('');
    try {
      setCode(await onGet(childId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not get the code.');
    } finally {
      setBusy(false);
    }
  };

  if (code) {
    return (
      <span className="shrink-0 text-[11px] font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-1 rounded-lg tracking-widest">
        Code: {code}
      </span>
    );
  }

  return (
    <div className="shrink-0 flex flex-col items-end">
      <button
        type="button"
        onClick={show}
        disabled={busy}
        className="px-2.5 py-1 rounded-lg bg-white border border-sky-300 text-sky-600 font-bold text-[10px] hover:bg-sky-50 disabled:opacity-50 transition"
      >
        {busy ? '...' : 'Get claim code'}
      </button>
      {err && <span className="text-[10px] text-rose-500 mt-1 max-w-[200px] text-right">{err}</span>}
    </div>
  );
}

/**
 * Player: enter the claim code a parent gave them to link their own account
 * to the child profile the parent created.
 */
function ClaimWithCodeCard({ onClaim }: { onClaim: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setErr('');
    setOk('');
    try {
      await onClaim(code);
      setOk('Profile linked. Your team and parent link are now on your account.');
      setCode('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not link the profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-bold text-slate-800">Already added by a parent?</h4>
        <p className="text-[11px] text-slate-500 mt-1">
          Ask your parent for the claim code on their profile, then enter it here to link your account to your existing athlete profile.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. 4F9A2C"
          maxLength={10}
          className="flex-1 bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition-colors font-mono tracking-widest"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !code.trim()}
          className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-xs transition"
        >
          {busy ? 'Linking...' : 'Link profile'}
        </button>
      </div>
      {err && (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-xl px-4 py-2.5 text-xs">{err}</div>
      )}
      {ok && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl px-4 py-2.5 text-xs">{ok}</div>
      )}
    </div>
  );
}

/**
 * Parent add-child form for one team.
 * 1. Shows every athlete already on the team so the parent can pick their child.
 * 2. Compares the typed name with that list as they type.
 *    - Exact match: blocked. The parent is offered "This is my child" instead.
 *    - Similar match (e.g. "Sam" vs "Samuel"): warned, and creating a new athlete needs an explicit confirmation.
 */
function AddChildForm({
  coachId,
  teamId,
  teamPlayers,
  linkedIds,
  profileId,
  onAdd,
  onLinkChild,
  adding,
  added,
  error,
  firstName,
  surname,
  setFirstName,
  setSurname
}: {
  coachId: string;
  teamId: string;
  teamPlayers: UserProfile[];
  linkedIds: Set<string>;
  profileId: string;
  onAdd: (e: React.FormEvent, coachId?: string, teamId?: string) => void;
  onLinkChild?: (playerId: string) => Promise<void>;
  adding: boolean;
  added: boolean;
  error: string;
  firstName: string;
  surname: string;
  setFirstName: (v: string) => void;
  setSurname: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDifferent, setConfirmDifferent] = useState(false);
  const [linkingId, setLinkingId] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');
  const inputClass = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition-colors';
  const labelClass = 'block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5';

  const isLinked = (p: UserProfile) => linkedIds.has(p.id) || p.parentUserId === profileId;

  const { exact, similar } = useMemo(
    () => findDuplicateCandidates(firstName, surname, teamPlayers),
    [firstName, surname, teamPlayers]
  );
  const exactUnlinked = exact.filter(p => !isLinked(p));
  const exactLinked = exact.filter(p => isLinked(p));
  const similarUnlinked = similar.filter(p => !isLinked(p));

  const namesFilled = !!firstName.trim() && !!surname.trim();
  const blockAdd =
    !namesFilled ||
    adding ||
    exact.length > 0 ||
    (similarUnlinked.length > 0 && !confirmDifferent);

  const handleAdd = () => {
    if (blockAdd) return;
    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
    onAdd(fakeEvent, coachId, teamId);
  };

  const handleLink = async (playerId: string) => {
    if (!onLinkChild) return;
    setLinkingId(playerId);
    setLinkError('');
    setLinkSuccess('');
    try {
      await onLinkChild(playerId);
      setLinkSuccess('Child linked to your account.');
      setTimeout(() => setLinkSuccess(''), 4000);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to link child.');
    } finally {
      setLinkingId('');
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full py-2 border border-dashed border-slate-300 hover:border-sky-400 rounded-xl text-xs font-bold text-slate-500 hover:text-sky-500 transition flex items-center justify-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Add My Child to This Team
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: pick an athlete already on the team */}
      {teamPlayers.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
            Already on this team: choose your child
          </p>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
            {teamPlayers.map(p => {
              const linked = isLinked(p);
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <span className="text-sm text-slate-700 truncate flex-1">{p.name}</span>
                  {linked ? (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shrink-0">
                      My child
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!onLinkChild || linkingId === p.id}
                      onClick={() => handleLink(p.id)}
                      className="shrink-0 px-3 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-600 font-bold text-[11px] transition disabled:opacity-50"
                    >
                      {linkingId === p.id ? 'Linking...' : 'This is my child'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          No athletes are on this team yet. Add your child below.
        </div>
      )}

      {/* Step 2: add a new athlete only if they are not already on the team */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
          Not in the list? Add a new athlete
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First Name</label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setConfirmDifferent(false); }}
              className={inputClass}
              placeholder="First name"
            />
          </div>
          <div>
            <label className={labelClass}>Surname</label>
            <input
              type="text"
              required
              value={surname}
              onChange={(e) => { setSurname(e.target.value); setConfirmDifferent(false); }}
              className={inputClass}
              placeholder="Surname"
            />
          </div>
        </div>

        {/* Exact match: already on the team */}
        {exactUnlinked.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 space-y-2">
            <p className="font-bold">{exactUnlinked[0].name} is already on this team.</p>
            <p>Adding them again would create a duplicate. Choose them from the list above instead.</p>
            <button
              type="button"
              disabled={!onLinkChild || linkingId === exactUnlinked[0].id}
              onClick={() => handleLink(exactUnlinked[0].id)}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-100 border border-rose-300 text-rose-700 font-bold text-[11px] transition disabled:opacity-50"
            >
              {linkingId === exactUnlinked[0].id ? 'Linking...' : 'This is my child'}
            </button>
          </div>
        )}

        {/* Exact match: already linked to this parent */}
        {exactLinked.length > 0 && exactUnlinked.length === 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
            <span className="font-bold">{exactLinked[0].name}</span> is already linked to your account.
          </div>
        )}

        {/* Similar name: needs confirmation */}
        {exact.length === 0 && similarUnlinked.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 space-y-2">
            <p className="font-bold">Is this {similarUnlinked[0].name}?</p>
            <p>A similar name is already on this team. If it's the same child, choose them from the list above.</p>
            <button
              type="button"
              disabled={!onLinkChild || linkingId === similarUnlinked[0].id}
              onClick={() => handleLink(similarUnlinked[0].id)}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 font-bold text-[11px] transition disabled:opacity-50"
            >
              {linkingId === similarUnlinked[0].id ? 'Linking...' : 'This is my child'}
            </button>
            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmDifferent}
                onChange={(e) => setConfirmDifferent(e.target.checked)}
                className="mt-0.5"
              />
              <span>This is a different child. Create a new athlete anyway.</span>
            </label>
          </div>
        )}

        {linkError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-xl px-4 py-2.5 text-xs">
            {linkError}
          </div>
        )}
        {linkSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {linkSuccess}
          </div>
        )}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-xl px-4 py-2.5 text-xs">
            {error}
          </div>
        )}
        {added && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Athlete added to this team.
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={blockAdd}
            onClick={handleAdd}
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition flex items-center gap-1.5"
          >
            {adding ? 'Adding...' : (<><Plus className="w-3.5 h-3.5" /> Add Athlete</>)}
          </button>
          <button
            type="button"
            onClick={() => { setExpanded(false); setConfirmDifferent(false); }}
            className="px-3 py-2 rounded-xl text-slate-400 hover:text-slate-600 text-xs font-medium transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CoachAddChildForm({
  teams,
  coaches,
  allPlayers,
  profileId,
  onAdd,
  onLinkChild,
  adding,
  added,
  error,
  firstName,
  surname,
  setFirstName,
  setSurname,
  childTeamId,
  setChildTeamId
}: {
  teams: Team[];
  coaches: Coach[];
  allPlayers: UserProfile[];
  profileId: string;
  onAdd: (e: React.FormEvent, coachId?: string, teamId?: string) => void;
  onLinkChild?: (playerId: string) => Promise<void>;
  adding: boolean;
  added: boolean;
  error: string;
  firstName: string;
  surname: string;
  setFirstName: (v: string) => void;
  setSurname: (v: string) => void;
  childTeamId: string;
  setChildTeamId: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAddNew, setShowAddNew] = useState(false);
  const [linkingId, setLinkingId] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');
  const inputClass = 'w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition-colors';
  const labelClass = 'block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5';

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full py-2 border border-dashed border-slate-300 hover:border-sky-400 rounded-xl text-xs font-bold text-slate-500 hover:text-sky-500 transition flex items-center justify-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        Add My Child
      </button>
    );
  }

  const selectedTeamCoaches = coaches.filter(c =>
    c.teamId === childTeamId || (c.teamIds || []).includes(childTeamId)
  );

  const teamPlayers = childTeamId
    ? allPlayers.filter(p => p.role === 'player' && p.teamId === childTeamId)
    : [];

  const linkedIds = new Set<string>();
  allPlayers.forEach(p => {
    if (p.parentUserId === profileId) linkedIds.add(p.id);
  });

  const handleLink = async (playerId: string) => {
    if (!onLinkChild) return;
    setLinkingId(playerId);
    setLinkError('');
    setLinkSuccess('');
    try {
      await onLinkChild(playerId);
      setLinkSuccess('Child linked successfully.');
      setTimeout(() => setLinkSuccess(''), 4000);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to link child.');
    } finally {
      setLinkingId('');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Select Team</label>
        <select
          value={childTeamId}
          onChange={(e) => { setChildTeamId(e.target.value); setShowAddNew(false); setLinkSuccess(''); setLinkError(''); }}
          className={inputClass}
        >
          <option value="">-- Select a team --</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {selectedTeamCoaches.length > 0 && (
        <p className="text-[11px] text-slate-400">
          Coach: {selectedTeamCoaches.map(c => c.name).join(', ')}
        </p>
      )}

      {/* Existing players on the selected team */}
      {childTeamId && teamPlayers.length > 0 && !showAddNew && (
        <div className="space-y-2">
          <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
            Existing players on this team — select your child
          </p>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            {teamPlayers.map(p => {
              const isLinked = linkedIds.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 bg-white">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <span className="text-sm text-slate-700 truncate flex-1">{p.name}</span>
                  {isLinked ? (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shrink-0">
                      Linked
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={linkingId === p.id}
                      onClick={() => handleLink(p.id)}
                      className="shrink-0 px-3 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-600 font-bold text-[11px] transition disabled:opacity-50"
                    >
                      {linkingId === p.id ? 'Linking...' : 'Link as My Child'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {linkError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-xl px-4 py-2.5 text-xs">
              {linkError}
            </div>
          )}
          {linkSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {linkSuccess}
            </div>
          )}
        </div>
      )}

      {childTeamId && teamPlayers.length === 0 && !showAddNew && (
        <div className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          No players found on this team yet.
        </div>
      )}

      {/* Toggle: add a new player not listed */}
      {childTeamId && !showAddNew && (
        <button
          type="button"
          onClick={() => setShowAddNew(true)}
          className="w-full py-2 border border-dashed border-slate-300 hover:border-sky-400 rounded-xl text-xs font-bold text-slate-500 hover:text-sky-500 transition flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Child not listed? Add a new player
        </button>
      )}

      {/* Add new player form */}
      {childTeamId && showAddNew && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                placeholder="First name"
              />
            </div>
            <div>
              <label className={labelClass}>Surname</label>
              <input
                type="text"
                required
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className={inputClass}
                placeholder="Surname"
              />
            </div>
          </div>
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-xl px-4 py-2.5 text-xs">
              {error}
            </div>
          )}
          {added && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Child added and linked successfully.
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={adding}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                const teamCoach = selectedTeamCoaches[0];
                onAdd(fakeEvent, teamCoach?.id, childTeamId);
              }}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-xs transition flex items-center gap-1.5"
            >
              {adding ? 'Adding...' : (<><Plus className="w-3.5 h-3.5" /> Add Child</>)}
            </button>
            <button
              type="button"
              onClick={() => setShowAddNew(false)}
              className="px-3 py-2 rounded-xl text-slate-400 hover:text-slate-600 text-xs font-medium transition"
            >
              Back to list
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => { setExpanded(false); setShowAddNew(false); setChildTeamId(''); }}
        className="px-3 py-2 rounded-xl text-slate-400 hover:text-slate-600 text-xs font-medium transition"
      >
        Cancel
      </button>
    </div>
  );
}
