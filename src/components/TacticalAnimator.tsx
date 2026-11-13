/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabaseService, generateUUID } from '../supabase';
import { Play, Pause, RotateCcw, Trophy, Zap, Plus, Trash2, Save, Copy, Move, ArrowRight, User, BookOpen, CircleCheck as CheckCircle, FolderOpen, ChevronLeft } from 'lucide-react';
import { UserProfile } from '../types';

export interface FramePlayer {
  id: string;
  label: string;
  isAttacking: boolean;
  x: number;
  y: number;
  color: string;
}

export interface FrameBall {
  id: string;
  x: number;
  y: number;
  height: number;
  color: string;
}

export interface FrameLine {
  id: string;
  type: 'dotted_arrow' | 'solid_arrow' | 'dotted_line' | 'solid_line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface PlaybookFrame {
  id: string;
  players: FramePlayer[];
  balls: FrameBall[];
  lines: FrameLine[];
}

export interface TacticalPlaybook {
  id?: string;
  coachId: string;
  coachName: string;
  teamId: string;
  title: string;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  fieldRatio: 'third' | 'half' | 'full';
  playbackSpeed: number;
  isAssigned: boolean;
  createdAt?: string;
  updatedAt?: string;
  frames: PlaybookFrame[];
}

const PALETTE = ['#00bbff', '#ef4444', '#fbbf24', '#10b981', '#ffffff', '#cbd5e1'];

interface Props {
  currentProfile?: UserProfile;
}

export default function TacticalAnimator({ currentProfile }: Props) {
  const isCoach = !!currentProfile && currentProfile.role === 'coach';
  const finalTeamId = currentProfile?.teamId || 'no-team';

  // 'list' shows available animations, 'play' shows the animation screen
  const [viewMode, setViewMode] = useState<'list' | 'play'>('list');

  const [playbooks, setPlaybooks] = useState<TacticalPlaybook[]>([]);
  const [activePlaybookId, setActivePlaybookId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Builder States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate');
  const [fieldRatio, setFieldRatio] = useState<'third' | 'half' | 'full'>('half');
  const [frames, setFrames] = useState<PlaybookFrame[]>([
    { id: 'f_init', players: [], balls: [], lines: [] }
  ]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);

  // Playback Control States
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);

  // Editor Selection/Interactivity States
  const [selectedTool, setSelectedTool] = useState<'select' | 'player' | 'ball' | 'line'>('select');
  const [selectedElement, setSelectedElement] = useState<{ type: 'player' | 'ball' | 'line'; id: string } | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ type: 'player' | 'ball' | 'line-start' | 'line-end'; id: string } | null>(null);

  // Tool customization configs
  const [playerLabel] = useState('ST');
  const [isAttackingPlayer, setIsAttackingPlayer] = useState(true);
  const [lineType, setLineType] = useState<'dotted_arrow' | 'solid_arrow' | 'dotted_line' | 'solid_line'>('solid_arrow');
  const [activeColor, setActiveColor] = useState('#00bbff');

  // Drawing sequence state for two-click line placement
  const [lineStartPoint, setLineStartPoint] = useState<{ x: number; y: number } | null>(null);

  const fieldRef = useRef<HTMLDivElement>(null);

  // Load playbooks from Supabase based on teamId
  const loadPlaybooks = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await supabaseService.fetchCollection<TacticalPlaybook>('tactical_playbooks');
      const teamItems = items.filter(p =>
        p.teamId === finalTeamId || p.teamId === 'all' ||
        p.teamId === '00000000-0000-0000-0000-000000000000'
      );
      setPlaybooks(teamItems);
    } catch (err) {
      console.error('Error reading playbooks from Supabase:', err);
      setErrorMessage('Could not load playbooks. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  }, [finalTeamId]);

  useEffect(() => {
    loadPlaybooks();
  }, [loadPlaybooks]);

  const activePlaybook = useMemo(() => {
    return playbooks.find(p => p.id === activePlaybookId);
  }, [playbooks, activePlaybookId]);

  // Sync builder state with the selected animation
  useEffect(() => {
    if (activePlaybook) {
      setTitle(activePlaybook.title);
      setDescription(activePlaybook.description);
      setDifficulty(activePlaybook.difficulty);
      setFieldRatio(activePlaybook.fieldRatio);
      setFrames(activePlaybook.frames.length > 0
        ? JSON.parse(JSON.stringify(activePlaybook.frames))
        : [{ id: 'f0', players: [], balls: [], lines: [] }]);
      setCurrentFrameIndex(0);
      setIsPlaying(false);
      setSelectedElement(null);
    }
  }, [activePlaybookId, activePlaybook]);

  // Playback timer ticker
  useEffect(() => {
    if (!isPlaying) return;

    const baseDuration = 1800;
    const timePerStep = baseDuration / speed;

    const intervalId = setInterval(() => {
      setCurrentFrameIndex((prevIndex) => {
        if (prevIndex >= frames.length - 1) {
          return 0;
        }
        return prevIndex + 1;
      });
    }, timePerStep);

    return () => clearInterval(intervalId);
  }, [isPlaying, frames, speed]);

  const maxAxisBoundY = useMemo(() => {
    if (fieldRatio === 'third') return 45;
    if (fieldRatio === 'half') return 65;
    return 120;
  }, [fieldRatio]);

  const viewPortSettings = useMemo(() => {
    switch (fieldRatio) {
      case 'third':
        return { viewBox: '0 0 100 45', aspectClass: 'aspect-[2.2/1]' };
      case 'half':
        return { viewBox: '0 0 100 65', aspectClass: 'aspect-[1.5/1]' };
      case 'full':
      default:
        return { viewBox: '0 0 100 120', aspectClass: 'aspect-[4/5]' };
    }
  }, [fieldRatio]);

  const activeFrame = useMemo(() => {
    return frames[currentFrameIndex] || frames[0] || { id: 'def', players: [], balls: [], lines: [] };
  }, [frames, currentFrameIndex]);

  const updateItemPosition = (type: string, id: string, x: number, y: number) => {
    setFrames(prevFrames => {
      const copy = JSON.parse(JSON.stringify(prevFrames));
      const targetFrame = copy[currentFrameIndex];
      if (!targetFrame) return prevFrames;

      if (type === 'player') {
        const item = targetFrame.players.find((p: any) => p.id === id);
        if (item) {
          item.x = parseFloat(x.toFixed(1));
          item.y = parseFloat(y.toFixed(1));
        }
      } else if (type === 'ball') {
        const item = targetFrame.balls.find((b: any) => b.id === id);
        if (item) {
          item.x = parseFloat(x.toFixed(1));
          item.y = parseFloat(y.toFixed(1));
        }
      } else if (type === 'line-start') {
        const item = targetFrame.lines.find((l: any) => l.id === id);
        if (item) {
          item.x1 = parseFloat(x.toFixed(1));
          item.y1 = parseFloat(y.toFixed(1));
        }
      } else if (type === 'line-end') {
        const item = targetFrame.lines.find((l: any) => l.id === id);
        if (item) {
          item.x2 = parseFloat(x.toFixed(1));
          item.y2 = parseFloat(y.toFixed(1));
        }
      }
      return copy;
    });
  };

  const handleFieldClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isCoach) return;
    if (selectedTool === 'select' || draggedItem) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const clickY = Math.min(maxAxisBoundY, Math.max(0, ((e.clientY - rect.top) / rect.height) * maxAxisBoundY));

    setFrames(prevFrames => {
      const copy = JSON.parse(JSON.stringify(prevFrames));
      const targetFrame = copy[currentFrameIndex];
      if (!targetFrame) return prevFrames;

      if (selectedTool === 'player') {
        const newPlayer: FramePlayer = {
          id: `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          label: playerLabel,
          isAttacking: isAttackingPlayer,
          x: parseFloat(clickX.toFixed(1)),
          y: parseFloat(clickY.toFixed(1)),
          color: activeColor
        };
        targetFrame.players.push(newPlayer);
        setSelectedElement({ type: 'player', id: newPlayer.id });
      } else if (selectedTool === 'ball') {
        const newBall: FrameBall = {
          id: `b_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          x: parseFloat(clickX.toFixed(1)),
          y: parseFloat(clickY.toFixed(1)),
          height: 0,
          color: '#ffffff'
        };
        targetFrame.balls.push(newBall);
        setSelectedElement({ type: 'ball', id: newBall.id });
      } else if (selectedTool === 'line') {
        if (!lineStartPoint) {
          setLineStartPoint({ x: clickX, y: clickY });
          return prevFrames;
        } else {
          const newLine: FrameLine = {
            id: `l_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            type: lineType,
            x1: parseFloat(lineStartPoint.x.toFixed(1)),
            y1: parseFloat(lineStartPoint.y.toFixed(1)),
            x2: parseFloat(clickX.toFixed(1)),
            y2: parseFloat(clickY.toFixed(1)),
            color: activeColor
          };
          targetFrame.lines.push(newLine);
          setSelectedElement({ type: 'line', id: newLine.id });
          setLineStartPoint(null);
        }
      }
      return copy;
    });

    if (selectedTool !== 'line' || lineStartPoint) {
      setSelectedTool('select');
    }
  };

  const handlePointerDown = (e: React.PointerEvent, type: 'player' | 'ball' | 'line-start' | 'line-end', id: string) => {
    if (!isCoach) return;
    e.stopPropagation();
    setDraggedItem({ type, id });

    const elementType = (type === 'line-start' || type === 'line-end')
      ? 'line'
      : (type === 'player' ? 'player' : 'ball') as any;
    setSelectedElement({ type: elementType, id });
  };

  const handleFieldPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggedItem || !isCoach) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(maxAxisBoundY, Math.max(0, ((e.clientY - rect.top) / rect.height) * maxAxisBoundY));
    updateItemPosition(draggedItem.type, draggedItem.id, x, y);
  };

  const handlePointerUp = () => {
    setDraggedItem(null);
  };

  const activeSelectedElementData = useMemo(() => {
    if (!selectedElement) return null;
    const { type, id } = selectedElement;
    if (type === 'player') return activeFrame.players.find(p => p.id === id) || null;
    if (type === 'ball') return activeFrame.balls.find(b => b.id === id) || null;
    if (type === 'line') return activeFrame.lines.find(l => l.id === id) || null;
    return null;
  }, [selectedElement, activeFrame]);

  const updateSelectedElementProps = (props: Partial<FramePlayer & FrameBall & FrameLine>) => {
    if (!selectedElement) return;
    setFrames(prevFrames => {
      const copy = JSON.parse(JSON.stringify(prevFrames));
      const targetFrame = copy[currentFrameIndex];
      if (!targetFrame) return prevFrames;

      const { type, id } = selectedElement;
      if (type === 'player') {
        const item = targetFrame.players.find((p: any) => p.id === id);
        if (item) Object.assign(item, props);
      } else if (type === 'ball') {
        const item = targetFrame.balls.find((b: any) => b.id === id);
        if (item) Object.assign(item, props);
      } else if (type === 'line') {
        const item = targetFrame.lines.find((l: any) => l.id === id);
        if (item) Object.assign(item, props);
      }
      return copy;
    });
  };

  const deleteSelectedElement = () => {
    if (!selectedElement) return;
    setFrames(prevFrames => {
      const copy = JSON.parse(JSON.stringify(prevFrames));
      const targetFrame = copy[currentFrameIndex];
      if (!targetFrame) return prevFrames;

      const { type, id } = selectedElement;
      if (type === 'player') {
        targetFrame.players = targetFrame.players.filter((p: any) => p.id !== id);
      } else if (type === 'ball') {
        targetFrame.balls = targetFrame.balls.filter((b: any) => b.id !== id);
      } else if (type === 'line') {
        targetFrame.lines = targetFrame.lines.filter((l: any) => l.id !== id);
      }
      return copy;
    });
    setSelectedElement(null);
  };

  const handleAddFrame = () => {
    setFrames(prev => {
      const last = prev[prev.length - 1] || { id: 'def', players: [], balls: [], lines: [] };
      const clone = JSON.parse(JSON.stringify(last));
      clone.id = `f_${Date.now()}_${Math.floor(Math.random() * 100)}`;
      return [...prev, clone];
    });
    setCurrentFrameIndex(frames.length);
  };

  const handleDuplicateFrame = () => {
    setFrames(prev => {
      const current = prev[currentFrameIndex] || { id: 'def', players: [], balls: [], lines: [] };
      const clone = JSON.parse(JSON.stringify(current));
      clone.id = `f_${Date.now()}_${Math.floor(Math.random() * 100)}`;
      const newFrames = [...prev];
      newFrames.splice(currentFrameIndex + 1, 0, clone);
      return newFrames;
    });
    setCurrentFrameIndex(prev => prev + 1);
  };

  const handleDeleteFrame = (idx: number) => {
    if (frames.length === 1) return;
    setFrames(prev => prev.filter((_, i) => i !== idx));
    setCurrentFrameIndex(prev => {
      if (prev >= frames.length - 1) {
        return Math.max(0, frames.length - 2);
      }
      return prev;
    });
  };

  // Open an existing animation on the animation screen
  const openAnimation = (p: TacticalPlaybook) => {
    if (!p.id) return;
    setActivePlaybookId(p.id);
    setViewMode('play');
  };

  // Coach starts a blank animation
  const startNewAnimation = () => {
    setActivePlaybookId('');
    setTitle('');
    setDescription('');
    setDifficulty('Intermediate');
    setFieldRatio('half');
    setFrames([{ id: `f_${Date.now()}`, players: [], balls: [], lines: [] }]);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setSelectedElement(null);
    setSelectedTool('select');
    setLineStartPoint(null);
    setViewMode('play');
  };

  const backToList = () => {
    setIsPlaying(false);
    setSelectedElement(null);
    setViewMode('list');
  };

  const handleSavePlaybook = async () => {
    if (!title.trim()) {
      setErrorMessage('Please input an authoritative title for this animation.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const now = new Date().toISOString();
    const playbookData: TacticalPlaybook = {
      coachId: currentProfile?.id || 'anonymous',
      coachName: currentProfile?.name || 'Coach Playbook Manager',
      teamId: finalTeamId,
      title: title.trim(),
      description: description.trim(),
      difficulty,
      fieldRatio,
      playbackSpeed: speed,
      isAssigned: true,
      updatedAt: now,
      frames: frames.map((fr, idx) => ({
        id: fr.id || `f_${idx}`,
        players: fr.players,
        balls: fr.balls,
        lines: fr.lines
      }))
    };

    try {
      if (!activePlaybookId) {
        const newId = generateUUID();
        await supabaseService.saveDocument(newId, 'tactical_playbooks', {
          ...playbookData,
          id: newId,
          createdAt: now
        });
        setActivePlaybookId(newId);
        setSuccessMessage('Animation saved successfully!');
      } else {
        await supabaseService.saveDocument(activePlaybookId, 'tactical_playbooks', {
          ...playbookData,
          id: activePlaybookId
        });
        setSuccessMessage(`Tactical playbook "${title}" updated successfully!`);
      }

      await loadPlaybooks();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (e: any) {
      console.error(e);
      setErrorMessage(`Failed to save playbook. ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePlaybook = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this animation?')) return;

    setIsLoading(true);
    try {
      await supabaseService.deleteDocument(id, 'tactical_playbooks');
      setActivePlaybookId('');
      setViewMode('list');
      await loadPlaybooks();
      setSuccessMessage('Animation deleted.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage('Error deleting animation.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatRatio = (r: 'third' | 'half' | 'full') =>
    r === 'third' ? '1/3 Pitch' : r === 'half' ? '1/2 Pitch' : 'Full Pitch';

  return (
    <div id="tactical-simulator-workspace" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-6">

      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 tracking-tight font-sans">
              Tactical Playbook Animation Studio
            </h3>
            {isCoach && (
              <p className="text-[11px] text-slate-400">
                Toolbox workspace: Create drills, plays and set pieces with the animation studio.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLoading && (
            <span className="text-[10px] text-sky-400 animate-pulse font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
              Syncing...
            </span>
          )}
          {isCoach && (
            <span className="bg-sky-500/10 text-sky-400 border border-sky-400/20 px-2.5 py-1 rounded-full text-[9px] font-mono uppercase tracking-wider font-bold">
              Coach Workspace
            </span>
          )}
        </div>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {successMessage && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-mono">
            {successMessage}
          </motion.div>
        )}
        {errorMessage && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs font-mono">
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================== LIST SCREEN ===================== */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
              Available Animations ({playbooks.length})
            </label>

            {isCoach && (
              <button
                type="button"
                onClick={startNewAnimation}
                className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/25 text-[10px] font-mono font-bold uppercase rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Animation
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {playbooks.length === 0 ? (
              <div className="col-span-1 md:col-span-2 p-6 rounded-xl border border-dashed border-slate-800 bg-slate-950/20 text-center text-slate-400 space-y-1 py-10">
                <p className="text-xs font-semibold text-slate-300">No Tactical Playbooks Available</p>
                <p className="text-[10px] text-slate-500">
                  {isCoach
                    ? 'Create your first animation with the New Animation button.'
                    : 'Your coaching staff has not published any animations yet. Check back later!'}
                </p>
              </div>
            ) : (
              playbooks.map((p) => (
                <div
                  key={p.id}
                  onClick={() => openAnimation(p)}
                  className="p-3.5 rounded-xl border text-left cursor-pointer transition flex justify-between items-start gap-4 relative group bg-slate-950/40 border-slate-850 hover:bg-slate-950/70 hover:border-sky-500/30"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] font-mono text-slate-500">
                        {formatRatio(p.fieldRatio)}
                      </span>
                      <span className={`text-[8px] font-mono px-1.5 rounded uppercase ${
                        p.difficulty === 'Advanced'
                          ? 'text-rose-400 border border-rose-500/20 bg-rose-500/5'
                          : 'text-amber-400 border border-amber-500/20 bg-amber-500/5'
                      }`}>
                        {p.difficulty}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold leading-tight text-slate-200">
                      {p.title}
                    </h4>
                    {p.description && (
                      <p className="text-[10.5px] text-slate-400 leading-normal line-clamp-2">
                        {p.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 self-center">
                    {isCoach && p.id && (
                      <button
                        type="button"
                        onClick={(e) => handleDeletePlaybook(p.id!, e)}
                        className="p-1.5 rounded bg-slate-900 border border-slate-850 text-slate-500 hover:text-rose-400 hover:border-rose-950 transition cursor-pointer"
                        title="Delete Animation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="w-8 h-8 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 flex items-center justify-center">
                      <Play className="w-3.5 h-3.5 fill-sky-400" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===================== ANIMATION SCREEN ===================== */}
      {viewMode === 'play' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={backToList}
              className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[10.5px] font-mono font-bold uppercase rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to Animations
            </button>

            {isCoach && (
              <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
                {activePlaybookId ? 'Editing Team Animation' : 'New Animation'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* LEFT COLUMN: playback, pitch and timeline */}
            <div className={isCoach ? 'lg:col-span-7 space-y-4' : 'lg:col-span-12 w-full space-y-6 animate-fadeIn'}>

              {/* Player info: Active Drill label only */}
              {!isCoach && (
                <div className="bg-slate-950 border border-slate-850 rounded-xl p-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-mono text-sky-400/80 tracking-wider">Active Drill</span>
                    <h3 className="text-sm font-bold text-slate-100 leading-snug">
                      {title || 'Untitled Animation'}
                    </h3>
                  </div>
                </div>
              )}

              {/* Playback controls */}
              {isCoach ? (
              <div className="bg-slate-950 max-w-[500px] mx-auto border border-slate-850/60 p-3.5 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center transition cursor-pointer shadow ${
                      isPlaying
                        ? 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                        : 'bg-sky-500/10 border-sky-500/25 text-sky-400 hover:bg-sky-500/20'
                    }`}
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-sky-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentFrameIndex(0);
                    }}
                    className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 flex items-center justify-center transition cursor-pointer"
                    title="Reset animation to frame 1"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <div className="bg-slate-900 border border-slate-800 p-0.5 rounded-lg flex items-center">
                    {([0.5, 1, 2] as const).map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => setSpeed(sp)}
                        className={`text-[9px] font-mono font-bold px-2 py-1 rounded transition select-none cursor-pointer ${
                          speed === sp
                            ? 'bg-sky-500/15 text-sky-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-350'
                        }`}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {(['third', 'half', 'full'] as const).map((z) => {
                    const labelMap = { third: '1/3 field', half: '1/2 field', full: 'full field' };
                    const isSelected = fieldRatio === z;
                    return (
                      <button
                        key={z}
                        type="button"
                        disabled={!isCoach}
                        onClick={() => setFieldRatio(z)}
                        className={`text-[9.5px] font-mono leading-none px-2 py-1.5 rounded uppercase border transition ${
                          isSelected
                            ? 'bg-slate-900 text-sky-400 border-sky-400/20 font-bold'
                            : 'text-slate-500 border-transparent hover:text-slate-300'
                        } disabled:opacity-50`}
                      >
                        {labelMap[z]}
                      </button>
                    );
                  })}
                </div>
              </div>
              ) : (
              <div className="bg-slate-950 max-w-[500px] mx-auto border border-slate-850/60 p-3.5 rounded-xl flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center transition cursor-pointer shadow ${
                    isPlaying
                      ? 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                      : 'bg-sky-500/10 border-sky-500/25 text-sky-400 hover:bg-sky-500/20'
                  }`}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-sky-400" />}
                </button>
              </div>
              )}

              {/* Pitch */}
              <div className="flex justify-center w-full">
                <div
                  ref={fieldRef}
                  className={`pitch-canvas-container w-full max-w-[500px] bg-[#143d1a] border-4 border-slate-800 rounded-2xl relative overflow-hidden shadow-2xl transition-all duration-300 ${viewPortSettings.aspectClass}`}
                >
                  <div className="absolute inset-0 flex flex-col opacity-[0.16] pointer-events-none select-none z-0">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 w-full ${i % 2 === 0 ? 'bg-emerald-900' : 'bg-[#0f2913]'}`}
                      />
                    ))}
                  </div>

                  <div className="absolute inset-0 pointer-events-none select-none z-0 p-3 opacity-60">
                    <svg
                      className="w-full h-full text-white/50"
                      viewBox={viewPortSettings.viewBox}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.5"
                    >
                      <rect className="field-marking-rect" x="1" y="1" width="98" height="118" />
                      <line className="field-marking-line" x1="1" y1="60" x2="99" y2="60" />
                      <circle className="field-marking-circle" cx="50" cy="60" r="14" />
                      <circle className="field-marking-circle" cx="50" cy="60" r="0.8" fill="currentColor" />

                      <rect className="field-marking-rect" x="25" y="1" width="50" height="18" />
                      <rect className="field-marking-rect" x="37" y="1" width="26" height="6" />
                      <circle className="field-marking-circle" cx="50" cy="13" r="0.8" fill="currentColor" />
                      <path className="field-marking-path" d="M 40 19 A 10 10 0 0 0 60 19" />

                      <rect className="field-marking-rect" x="25" y="101" width="50" height="18" />
                      <rect className="field-marking-rect" x="37" y="113" width="26" height="6" />
                      <circle className="field-marking-circle" cx="50" cy="107" r="0.8" fill="currentColor" />
                      <path className="field-marking-path" d="M 40 101 A 10 10 0 0 1 60 101" />

                      <path className="field-marking-path" d="M 1 5 A 4 4 0 0 0 5 1" />
                      <path className="field-marking-path" d="M 95 1 A 4 4 0 0 0 99 5" />
                    </svg>
                  </div>

                  <div className="absolute inset-0 z-10 p-3 select-none">
                    <svg
                      className="w-full h-full cursor-crosshair"
                      viewBox={viewPortSettings.viewBox}
                      onClick={handleFieldClick}
                      onPointerMove={handleFieldPointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={handlePointerUp}
                    >
                      <defs>
                        {PALETTE.map((colorHex, idx) => (
                          <marker
                            key={idx}
                            id={`marker-arrow-${idx}`}
                            markerWidth="7"
                            markerHeight="7"
                            refX="6.5"
                            refY="3.5"
                            orient="auto"
                          >
                            <polygon points="0 0.8, 7 3.5, 0 6.2" fill={colorHex} />
                          </marker>
                        ))}
                      </defs>

                      {activeFrame.lines && activeFrame.lines.map((l) => {
                        const isSelected = selectedElement?.type === 'line' && selectedElement.id === l.id;
                        const markerColorIdx = PALETTE.indexOf(l.color);
                        const markerIdStr = markerColorIdx !== -1 ? `marker-arrow-${markerColorIdx}` : 'marker-arrow-5';
                        const isDotted = l.type.startsWith('dotted_');
                        const isArrow = l.type.endsWith('_arrow');

                        return (
                          <g key={l.id}>
                            <line
                              x1={l.x1}
                              y1={l.y1}
                              x2={l.x2}
                              y2={l.y2}
                              stroke={l.color}
                              strokeWidth={isSelected ? '1.6' : '0.9'}
                              strokeDasharray={isDotted ? '2.5,2.5' : undefined}
                              markerEnd={isArrow ? `url(#${markerIdStr})` : undefined}
                              className="transition-all duration-350 cursor-pointer tactical-line"
                              style={{ '--line-color': l.color } as React.CSSProperties}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedElement({ type: 'line', id: l.id });
                              }}
                            />

                            {isCoach && isSelected && (
                              <>
                                <circle
                                  cx={l.x1}
                                  cy={l.y1}
                                  r="1.8"
                                  fill="#1e293b"
                                  stroke="#00bbff"
                                  strokeWidth="0.5"
                                  onPointerDown={(e) => handlePointerDown(e, 'line-start', l.id)}
                                  className="cursor-move z-40 endpoint-grab-circle"
                                  style={{ '--endpoint-fill': '#1e293b' } as React.CSSProperties}
                                />
                                <circle
                                  cx={l.x2}
                                  cy={l.y2}
                                  r="1.8"
                                  fill="#6366f1"
                                  stroke="#00bbff"
                                  strokeWidth="0.5"
                                  onPointerDown={(e) => handlePointerDown(e, 'line-end', l.id)}
                                  className="cursor-move z-40 endpoint-grab-circle"
                                  style={{ '--endpoint-fill': '#6366f1' } as React.CSSProperties}
                                />
                              </>
                            )}
                          </g>
                        );
                      })}

                      {activeFrame.players && activeFrame.players.map((pl) => {
                        const isSelected = selectedElement?.type === 'player' && selectedElement.id === pl.id;
                        const defaultColor = pl.isAttacking ? '#00bbff' : '#ef4444';
                        const activeDisplayColor = pl.color || defaultColor;

                        return (
                          <g
                            key={pl.id}
                            className="cursor-pointer"
                            onPointerDown={(e) => handlePointerDown(e, 'player', pl.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement({ type: 'player', id: pl.id });
                            }}
                          >
                            <circle cx={pl.x} cy={pl.y} r="4" className="player-hotspot" />

                            {isSelected && (
                              <circle cx={pl.x} cy={pl.y} r="4.5" className="player-selection-ring animate-pulse" />
                            )}

                            <text
                              x={pl.x}
                              y={pl.y + 1.2}
                              textAnchor="middle"
                              fill={activeDisplayColor}
                              fontSize="4.8"
                              fontWeight="900"
                              fontFamily="monospace"
                            >
                              {pl.isAttacking ? 'X' : 'O'}
                            </text>
                          </g>
                        );
                      })}

                      {activeFrame.balls && activeFrame.balls.map((b) => {
                        const isSelected = selectedElement?.type === 'ball' && selectedElement.id === b.id;
                        return (
                          <g
                            key={b.id}
                            className="cursor-pointer"
                            onPointerDown={(e) => handlePointerDown(e, 'ball', b.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElement({ type: 'ball', id: b.id });
                            }}
                          >
                            <circle cx={b.x} cy={b.y} r="4.0" className="player-hotspot" />

                            {isSelected && (
                              <circle cx={b.x} cy={b.y} r="2.0" className="ball-glow-ring" />
                            )}

                            {b.height > 0 && (
                              <circle cx={b.x} cy={b.y + b.height} r="0.6" className="ball-shadow" />
                            )}

                            <circle
                              cx={b.x}
                              cy={b.y}
                              r="0.9"
                              className="ball-body transition-all"
                              style={{ '--ball-stroke-color': b.color || '#1e293b' } as React.CSSProperties}
                              strokeWidth="0.25"
                            />

                            <polygon
                              points={`${b.x},${b.y - 0.25} ${b.x + 0.24},${b.y - 0.08} ${b.x + 0.15},${b.y + 0.20} ${b.x - 0.15},${b.y + 0.20} ${b.x - 0.24},${b.y - 0.08}`}
                              className="ball-marking"
                            />

                            <line x1={b.x} y1={b.y - 0.25} x2={b.x} y2={b.y - 0.9} stroke="#1e293b" strokeWidth="0.12" strokeLinecap="round" />
                            <line x1={b.x + 0.24} y1={b.y - 0.08} x2={b.x + 0.86} y2={b.y - 0.28} stroke="#1e293b" strokeWidth="0.12" strokeLinecap="round" />
                            <line x1={b.x + 0.15} y1={b.y + 0.20} x2={b.x + 0.53} y2={b.y + 0.73} stroke="#1e293b" strokeWidth="0.12" strokeLinecap="round" />
                            <line x1={b.x - 0.15} y1={b.y + 0.20} x2={b.x - 0.53} y2={b.y + 0.73} stroke="#1e293b" strokeWidth="0.12" strokeLinecap="round" />
                            <line x1={b.x - 0.24} y1={b.y - 0.08} x2={b.x - 0.86} y2={b.y - 0.28} stroke="#1e293b" strokeWidth="0.12" strokeLinecap="round" />
                          </g>
                        );
                      })}

                      {lineStartPoint && selectedTool === 'line' && (
                        <line
                          x1={lineStartPoint.x}
                          y1={lineStartPoint.y}
                          x2={lineStartPoint.x}
                          y2={lineStartPoint.y}
                          stroke="#fbbf24"
                          strokeWidth="0.6"
                          strokeDasharray="2,2"
                        />
                      )}
                    </svg>

                    {isCoach && selectedTool !== 'select' && (
                      <div className="absolute top-2.5 left-2.5 bg-slate-950/90 border border-slate-800 rounded px-2 py-1 text-[9px] font-mono text-center text-amber-400 select-none animate-pulse pointer-events-none">
                        {selectedTool === 'line' && !lineStartPoint && 'Click twice: 1st for line START, 2nd for line END'}
                        {selectedTool === 'line' && lineStartPoint && 'Click anywhere on field to place arrow destination'}
                        {selectedTool === 'player' && 'Click anywhere to deploy a Player circle'}
                        {selectedTool === 'ball' && 'Click anywhere to drop a ball'}
                      </div>
                    )}
                  </div>

                  <AnimatePresence>
                    {frames.length > 0 && currentFrameIndex === frames.length - 1 && (
                      <div className="absolute inset-x-0 bottom-[12%] flex justify-center pointer-events-none select-none z-30">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="bg-emerald-500 text-slate-950 text-[10px] font-bold px-3 py-1 rounded-full shadow border border-white flex items-center gap-1 font-mono uppercase tracking-wider"
                        >
                          <Trophy className="w-3.5 h-3.5" />
                          Play Sequence Complete
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Frame timeline (coach only) */}
              {isCoach && (
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">
                  Playbook Frame Timeline ({frames.length} total frames)
                </span>
                <div className="flex gap-2.5 items-center overflow-x-auto pb-2 pr-1">
                  {frames.map((fr, idx) => {
                    const isActive = currentFrameIndex === idx;
                    return (
                      <div key={fr.id} className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentFrameIndex(idx);
                            setIsPlaying(false);
                          }}
                          className={`w-[60px] h-[48px] border rounded-lg transition-all flex flex-col justify-between p-1.5 cursor-pointer text-left ${
                            isActive
                              ? 'bg-sky-950/40 border-sky-400 text-slate-100 shadow'
                              : 'bg-slate-950 border-slate-850 hover:border-slate-800 text-slate-400'
                          }`}
                        >
                          <span className="text-[9px] font-bold font-mono">FR {idx + 1}</span>
                          <span className="text-[8px] text-slate-500 font-mono">
                            {fr.players.length}P · {fr.lines.length}L
                          </span>
                        </button>

                        {isCoach && frames.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteFrame(idx)}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-slate-950/90 text-slate-400 hover:text-rose-400 border border-slate-850 rounded-full flex items-center justify-center cursor-pointer transition"
                            title="Delete Frame"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {isCoach && (
                    <div className="flex items-center gap-1.5 shrink-0 pl-1">
                      <button
                        type="button"
                        onClick={handleDuplicateFrame}
                        className="h-[48px] px-3 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 rounded-lg text-[9px] font-mono text-slate-400 hover:text-slate-200 cursor-pointer flex flex-col items-center justify-center gap-1 transition"
                        title="Clone active frame"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Clone Fit
                      </button>

                      <button
                        type="button"
                        onClick={handleAddFrame}
                        className="h-[48px] px-4 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/10 rounded-lg text-[9px] font-mono text-sky-400 hover:text-sky-300 cursor-pointer flex flex-col items-center justify-center gap-1 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        + New Frame
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>

            {/* RIGHT COLUMN: coach tools and database save (coach only) */}
            {isCoach && (
              <div className="lg:col-span-5 space-y-5">

                <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 space-y-4">
                  <h4 className="text-[11px] uppercase font-mono font-bold tracking-widest text-sky-400 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-sky-400" />
                    Drill Tools
                  </h4>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-slate-400 uppercase">
                        Select Active Deployment Tool:
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(['select', 'player', 'ball', 'line'] as const).map((tool) => {
                          const isSel = selectedTool === tool;
                          return (
                            <button
                              key={tool}
                              type="button"
                              onClick={() => {
                                setSelectedTool(tool);
                                setLineStartPoint(null);
                              }}
                              className={`py-2 rounded-xl text-[10.5px] font-bold font-mono tracking-wide uppercase border cursor-pointer select-none transition flex flex-col items-center justify-center gap-1 ${
                                isSel
                                  ? 'bg-sky-500/15 text-sky-400 border-sky-400/40 shadow'
                                  : 'bg-slate-900 text-slate-400 border-slate-850 hover:text-slate-300'
                              }`}
                            >
                              {tool === 'select' && <Move className="w-3.5 h-3.5 text-sky-400" />}
                              {tool === 'player' && <User className="w-3.5 h-3.5 text-sky-500" />}
                              {tool === 'ball' && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
                              {tool === 'line' && <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />}
                              {tool}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {selectedTool === 'player' && (
                      <div className="bg-slate-900 rounded p-3 border border-slate-850 space-y-3.5 animate-fadeIn">
                        <div className="flex items-center justify-between gap-2.5">
                          <span className="text-[10px] uppercase font-mono text-slate-300">Deployment Type:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsAttackingPlayer(!isAttackingPlayer);
                              setActiveColor(!isAttackingPlayer ? '#00bbff' : '#ef4444');
                            }}
                            className={`text-[9.5px] font-mono font-bold px-2 py-1 rounded border cursor-pointer transition ${
                              isAttackingPlayer
                                ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            }`}
                          >
                            {isAttackingPlayer ? 'Blue X (Player)' : 'Red O (Other Team)'}
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-mono text-slate-300">Aesthetic Color Palette:</span>
                          <div className="flex items-center gap-1.5">
                            {PALETTE.map((cHex) => (
                              <button
                                key={cHex}
                                type="button"
                                onClick={() => setActiveColor(cHex)}
                                className="w-5 h-5 rounded-full border border-slate-950 transition-transform scale-100 hover:scale-110 cursor-pointer"
                                style={{ backgroundColor: cHex, outline: activeColor === cHex ? '1px solid #00bbff' : 'none' }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedTool === 'line' && (
                      <div className="bg-slate-900 rounded p-3 border border-slate-850 space-y-3 animate-fadeIn">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-slate-300">Tactical Line Style:</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {([
                              { code: 'solid_arrow', label: 'Solid Arrow' },
                              { code: 'dotted_arrow', label: 'Dotted Arrow' },
                              { code: 'solid_line', label: 'Plain Line' },
                              { code: 'dotted_line', label: 'Dotted Line' }
                            ] as const).map((lineOpt) => {
                              const isSel = lineType === lineOpt.code;
                              return (
                                <button
                                  key={lineOpt.code}
                                  type="button"
                                  onClick={() => setLineType(lineOpt.code)}
                                  className={`py-1 px-2 rounded font-mono text-[9px] font-bold border cursor-pointer transition ${
                                    isSel
                                      ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                      : 'bg-slate-950 text-slate-400 border-slate-850 hover:text-slate-300'
                                  }`}
                                >
                                  {lineOpt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-mono text-slate-300">Line Outline Color:</span>
                          <div className="flex items-center gap-1.5">
                            {PALETTE.map((cHex) => (
                              <button
                                key={cHex}
                                type="button"
                                onClick={() => setActiveColor(cHex)}
                                className="w-5 h-5 rounded-full border border-slate-950 transition-transform scale-100 hover:scale-110 cursor-pointer"
                                style={{ backgroundColor: cHex, outline: activeColor === cHex ? '1px solid #00bbff' : 'none' }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedElement && activeSelectedElementData && (
                      <div className="bg-slate-900 border border-sky-500/20 rounded p-3 space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <span className="text-[10px] uppercase font-mono font-bold text-sky-400">
                            Selected Element Settings
                          </span>
                          <button
                            type="button"
                            onClick={deleteSelectedElement}
                            className="text-[9px] uppercase font-mono font-bold text-rose-400 hover:text-rose-300 transition cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete Item
                          </button>
                        </div>

                        {selectedElement.type === 'player' && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[9.5px] uppercase font-mono text-slate-400">Tactical Type:</span>
                            <button
                              type="button"
                              onClick={() => {
                                const currentVal = (activeSelectedElementData as FramePlayer).isAttacking;
                                updateSelectedElementProps({
                                  isAttacking: !currentVal,
                                  color: !currentVal ? '#00bbff' : '#ef4444'
                                });
                              }}
                              className={`text-[9.5px] font-mono font-bold px-2.5 py-1 rounded border cursor-pointer transition ${
                                (activeSelectedElementData as FramePlayer).isAttacking
                                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              }`}
                            >
                              {(activeSelectedElementData as FramePlayer).isAttacking ? 'Blue X (Player)' : 'Red O (Other Team)'}
                            </button>
                          </div>
                        )}

                        {selectedElement.type === 'line' && (
                          <div className="space-y-2">
                            <span className="text-[9.5px] uppercase font-mono text-slate-400">Edit Line/Arrow style:</span>
                            <div className="grid grid-cols-2 gap-1 px-1">
                              {(['dotted_arrow', 'solid_arrow', 'dotted_line', 'solid_line'] as const).map((lType) => {
                                const isMatched = (activeSelectedElementData as FrameLine).type === lType;
                                return (
                                  <button
                                    key={lType}
                                    type="button"
                                    onClick={() => updateSelectedElementProps({ type: lType })}
                                    className={`text-[8.5px] font-mono p-1 rounded transition border cursor-pointer ${
                                      isMatched
                                        ? 'bg-sky-500/20 text-sky-400 border-sky-400/40'
                                        : 'bg-slate-950 text-slate-500 border-transparent hover:text-slate-350'
                                    }`}
                                  >
                                    {lType.replace('_', ' ')}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <span className="text-[9.5px] uppercase font-mono text-slate-400">Change Item Color:</span>
                          <div className="flex items-center gap-1.5">
                            {PALETTE.map((cHex) => (
                              <button
                                key={cHex}
                                type="button"
                                onClick={() => updateSelectedElementProps({ color: cHex })}
                                className="w-4 h-4 rounded-full border border-slate-950 transition-transform scale-100 hover:scale-110 cursor-pointer"
                                style={{
                                  backgroundColor: cHex,
                                  outline: activeSelectedElementData.color === cHex ? '1px solid #ffffff' : 'none'
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Save panel */}
                <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 space-y-4">
                  <h4 className="text-[11px] uppercase font-mono font-bold tracking-widest text-[#00bbff] flex items-center gap-1.5">
                    <Save className="w-4 h-4" />
                    Playbook Details Database Saving
                  </h4>

                  <div className="space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-mono text-slate-450">
                        Playbook Animation Title:
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Corner Kick Run Combinations"
                        className="w-full bg-slate-900 text-xs text-slate-100 rounded-xl border border-slate-800 px-3 py-2.5 focus:border-[#00bbff] focus:outline-none placeholder-slate-600 font-sans"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-mono text-slate-450">
                        Coaching Instructions / Description:
                      </label>
                      <textarea
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Explain drill steps so players understand where to cut..."
                        className="w-full bg-slate-900 text-xs text-slate-100 rounded-xl border border-slate-800 px-3 py-2 focus:border-[#00bbff] focus:outline-none placeholder-slate-600 font-sans"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] uppercase font-mono text-slate-450 block">Drill Difficulty:</span>
                      <div className="flex gap-2.5">
                        {(['Beginner', 'Intermediate', 'Advanced'] as const).map((diff) => {
                          const isMatched = difficulty === diff;
                          return (
                            <button
                              key={diff}
                              type="button"
                              onClick={() => setDifficulty(diff)}
                              className={`flex-1 py-1.5 rounded-lg text-[9.5px] font-mono uppercase font-bold border cursor-pointer transition ${
                                isMatched
                                  ? 'bg-[#00bbff]/15 text-[#00bbff] border-[#00bbff]/30'
                                  : 'bg-slate-900 text-slate-500 border-transparent hover:text-slate-400'
                              }`}
                            >
                              {diff}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-850">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={handleSavePlaybook}
                        className="w-full bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition text-xs shadow-md cursor-pointer disabled:opacity-40"
                      >
                        <Save className="w-4 h-4 text-slate-950" />
                        {activePlaybookId ? 'Update Active Custom Playbook' : 'Save New Animation'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-1.5">
                  <h5 className="text-[10px] font-mono uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    Studying Tactical Drills (1-2-3 Sync)
                  </h5>
                  <ol className="text-[10.5px] text-slate-400 space-y-1 font-sans list-decimal list-inside pl-1 leading-normal">
                    <li>Deploy icons/tools directly coordinates wise on the board.</li>
                    <li>Duplicate frame timeline segments to register dynamic motion loops.</li>
                    <li>Toggle playback speed rates safely to inspect detailed wings maneuvers!</li>
                  </ol>
                </div>
              </div>
            )}

          </div>
        </>
      )}

    </div>
  );
}