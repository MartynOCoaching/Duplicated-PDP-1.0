/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Camera, Users, Check, ImageOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { UserProfile } from '../../types';
import {
  fetchPlayerAvatar,
  uploadPlayerAvatar,
  removePlayerAvatar,
} from '../../utils/playerAvatar';
import ProfileImageEditor from '../ProfileImageEditor';

interface TeamRosterProps {
  players: UserProfile[];
  isCoach: boolean;
}

interface AvatarState {
  [playerId: string]: { url: string | null; busy: boolean };
}

export function TeamRoster({ players, isCoach }: TeamRosterProps) {
  const [expanded, setExpanded] = useState(false);
  const [avatars, setAvatars] = useState<AvatarState>({});
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [expandedOnce, setExpandedOnce] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<UserProfile | null>(null);

  const setAvatarState = (id: string, patch: { url?: string | null; busy?: boolean }) =>
    setAvatars(prev => ({
      ...prev,
      [id]: { url: prev[id]?.url ?? null, busy: prev[id]?.busy ?? false, ...patch },
    }));

  // Photos are fetched once the panel is first opened (the roster can be long
  // and photos may have been changed elsewhere).
  React.useEffect(() => {
    if (!expanded || !expandedOnce) return;
    let cancelled = false;
    players.forEach(p => {
      if (avatars[p.id]?.url) return;
      fetchPlayerAvatar(p.id).then(url => {
        if (!cancelled) setAvatarState(p.id, { url });
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, players.map(p => p.id).join(',')]);

  const openEditor = (player: UserProfile) => {
    if (!isCoach) return;
    setErrorId(null);
    setEditingPlayer(player);
  };

  const handleEditorUpload = async (file: Blob) => {
    if (!editingPlayer) return;
    const playerId = editingPlayer.id;
    setAvatarState(playerId, { busy: true });
    try {
      const url = await uploadPlayerAvatar(playerId, file);
      setAvatarState(playerId, { url, busy: false });
      setSavedId(playerId);
      setTimeout(() => setSavedId(null), 2500);
    } catch (err) {
      setAvatarState(playerId, { busy: false });
      setErrorId(playerId);
      setTimeout(() => setErrorId(null), 4000);
      throw err;
    }
  };

  const handleEditorRemove = async () => {
    if (!editingPlayer) return;
    const playerId = editingPlayer.id;
    setAvatarState(playerId, { busy: true });
    try {
      await removePlayerAvatar(playerId);
      setAvatarState(playerId, { url: null, busy: false });
    } catch (err) {
      setAvatarState(playerId, { busy: false });
      setErrorId(playerId);
      setTimeout(() => setErrorId(null), 4000);
      throw err;
    }
  };

  const handleUpload = async (playerId: string, file: File) => {
    setErrorId(null);
    setAvatarState(playerId, { busy: true });
    try {
      const url = await uploadPlayerAvatar(playerId, file);
      setAvatarState(playerId, { url, busy: false });
      setSavedId(playerId);
      setTimeout(() => setSavedId(null), 2500);
    } catch (err) {
      setAvatarState(playerId, { busy: false });
      setErrorId(playerId);
      setTimeout(() => setErrorId(null), 4000);
      console.error(err);
    }
  };

  const handleRemove = async (playerId: string) => {
    setErrorId(null);
    setAvatarState(playerId, { busy: true });
    try {
      await removePlayerAvatar(playerId);
      setAvatarState(playerId, { url: null, busy: false });
    } catch (err) {
      setAvatarState(playerId, { busy: false });
      setErrorId(playerId);
      setTimeout(() => setErrorId(null), 4000);
      console.error(err);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setExpanded(o => !o);
          setExpandedOnce(true);
        }}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-850/40 transition text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-[#00bbff]/20 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-[#00bbff]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Team Roster
            </h2>
            <p className="text-[9px] font-mono text-slate-100 uppercase tracking-wider mt-0.5">
              {players.length} player{players.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCoach && (
            <span className="hidden sm:inline-flex text-[9px] font-mono text-slate-450 uppercase tracking-wider bg-slate-950 border border-slate-850 px-2 py-0.5 rounded-full">
              Tap photo to add
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[#00bbff]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#00bbff]" />
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-slate-800">
              {players.length === 0 ? (
                <div className="py-8 text-center">
                  <ImageOff className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs italic text-slate-500">No players on this team yet.</p>
                </div>
              ) : (
                <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {players.map(p => {
                    const st = avatars[p.id];
                    const url = st?.url ?? null;
                    const busy = st?.busy ?? false;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 bg-slate-950/60 border border-slate-850 rounded-xl px-3 py-2.5"
                      >
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            disabled={!isCoach || busy}
                            onClick={() => openEditor(p)}
                            className={`w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center border transition ${
                              url
                                ? 'border-[#00bbff]/40'
                                : 'bg-slate-800 border-slate-700 border-dashed'
                            } ${isCoach && !busy ? 'cursor-pointer hover:border-[#00bbff]' : 'cursor-default'}`}
                            title={isCoach ? (url ? 'Change photo' : 'Add photo') : undefined}
                            aria-label={url ? `Change photo of ${p.name}` : `Add photo of ${p.name}`}
                          >
                            {url ? (
                              <img src={url} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[#c9a962] font-bold text-sm">
                                {p.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </button>

                          {busy ? (
                            <div className="absolute inset-0 rounded-xl bg-slate-900/60 flex items-center justify-center">
                              <div className="w-4 h-4 border-2 border-[#00bbff] border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : (
                            isCoach && (
                              <button
                                type="button"
                                onClick={() => openEditor(p)}
                                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#00bbff] hover:bg-[#009be0] text-slate-950 flex items-center justify-center shadow-sm border-2 border-slate-900 transition"
                                aria-label={url ? `Change photo of ${p.name}` : `Add photo of ${p.name}`}
                              >
                                <Camera className="w-2.5 h-2.5" />
                              </button>
                            )
                          )}

                          {url && isCoach && !busy && (
                            <button
                              type="button"
                              onClick={() => handleRemove(p.id)}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-700 hover:bg-rose-500 text-white flex items-center justify-center shadow-sm border border-slate-900 transition"
                              aria-label={`Remove photo of ${p.name}`}
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-100 truncate">{p.name}</p>
                          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider truncate">
                            {p.role === 'player' ? 'Player' : p.role}
                          </p>
                          {savedId === p.id && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase text-emerald-400">
                              <Check className="w-3 h-3" /> Photo saved
                            </span>
                          )}
                          {errorId === p.id && (
                            <span className="mt-1 inline-block text-[9px] font-mono text-rose-400">
                              Upload failed — try again
                            </span>
                          )}
                        </div>

                        <input
                          id={`roster-photo-input-${p.id}`}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) handleUpload(p.id, file);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {editingPlayer && (
        <ProfileImageEditor
          onUpload={handleEditorUpload}
          onRemove={handleEditorRemove}
          hasAvatar={Boolean(avatars[editingPlayer.id]?.url)}
          onClose={() => setEditingPlayer(null)}
        />
      )}
    </div>
  );
}
