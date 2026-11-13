
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { CircleCheck as CheckCircle, ArrowRight, GraduationCap, Send, Play, Image as ImageIcon, Trash2, Calendar, Users } from 'lucide-react';
import { ClassroomSession, ModuleCompletion, UserProfile, Assignment } from '../types';

interface ClassroomTabProps {
  modules: ClassroomSession[];
  completions: ModuleCompletion[];
  onCompleteModule: (moduleId: string) => void;
  currentProfile?: UserProfile;
  onAddAssignment?: (assignment: Omit<Assignment, 'id' | 'completedByPlayerIds'>) => void;
  onDeleteAssignment?: (assignmentId: string) => void;
  assignments?: Assignment[];
  initialModuleId?: string;
}

// The only filter labels shown in the UI
export const CLASSROOM_CATEGORIES = [
  'Nutrition ',
  'Strength & Conditioning ',
  'Recovery ',
  'Mental Health ',
  'Stretching & Yoga ',
  'Injury Prevention ',
  'Tactical ',
] as const;

// "Strength & Conditioning", "strength and conditioning", "STRENGTH_CONDITIONING"
// all become "strengthandconditioning"
const slugifyCategory = (value?: string | null) =>
  (value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

const CATEGORY_LOOKUP = new Map<string, string>(
  CLASSROOM_CATEGORIES.map((label) => [slugifyCategory(label), label])
);

// Maps any database category string to its canonical filter label, or null if unknown
export function toCanonicalCategory(value?: string | null): string | null {
  return CATEGORY_LOOKUP.get(slugifyCategory(value)) ?? null;
}

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url || url === 'null') return null;

  // Already an embed URL
  const embedMatch = url.match(/youtube\.com\/embed\/([\w-]{11})/);
  if (embedMatch) return `https://www.youtube.com/embed/${embedMatch[1]}`;

  // youtu.be short link
  const shortMatch = url.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;

  // youtube.com/shorts/VIDEO_ID
  const shortsMatch = url.match(/youtube\.com\/shorts\/([\w-]{11})/);
  if (shortsMatch) return `https://www.youtube.com/embed/${shortsMatch[1]}`;

  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;

  return null;
}

function isValidImageUrl(url: string | undefined): boolean {
  return !!url && url !== 'null';
}

export default function ClassroomTab({
  modules,
  completions,
  onCompleteModule,
  currentProfile,
  onAddAssignment,
  onDeleteAssignment,
  assignments,
  initialModuleId
}: ClassroomTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeModule, setActiveModule] = useState<ClassroomSession | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const detailsRef = useRef<HTMLDivElement>(null);

  const [dueDate, setDueDate] = useState('2026-05-26');
  const [customTitle, setCustomTitle] = useState('');
  const [assignSuccess, setAssignSuccess] = useState(false);

  useEffect(() => {
    if (initialModuleId) {
      const mod = modules.find(m => m.id === initialModuleId);
      if (mod) {
        setActiveModule(mod);
        setCustomTitle(`Required Session: ${mod.title}`);
        setAssignSuccess(false);
      }
    }
  }, [initialModuleId]);

  useEffect(() => {
    if (activeModule && detailsRef.current) {
      detailsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeModule?.id]);

  // Count sessions per canonical category (drives the badges on the filter buttons)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of modules) {
      const canonical = toCanonicalCategory(m.category as string);
      if (canonical) counts[canonical] = (counts[canonical] || 0) + 1;
    }
    return counts;
  }, [modules]);

  // Filter the sessions from the classroom_sessions table, newest first
  const filteredModules = useMemo(() => {
    const sorted = [...modules].sort((a, b) => {
      const ta = a.create_at ? new Date(a.create_at).getTime() : 0;
      const tb = b.create_at ? new Date(b.create_at).getTime() : 0;
      return tb - ta;
    });

    if (selectedCategory === 'All') return sorted;

    return sorted.filter(
      (m) => toCanonicalCategory(m.category as string) === selectedCategory
    );
  }, [modules, selectedCategory]);

  // Warn about database categories that don't match any filter option
  useEffect(() => {
    const unknown = new Set(
      modules
        .map((m) => m.category as string)
        .filter((c) => c && !toCanonicalCategory(c))
    );

    if (unknown.size > 0) {
      console.warn('Classroom sessions with unrecognized categories:', [...unknown]);
    }
  }, [modules]);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setFiltersExpanded(false);

    // Close the open session if it doesn't belong to the new filter
    if (
      activeModule &&
      cat !== 'All' &&
      toCanonicalCategory(activeModule.category as string) !== cat
    ) {
      setActiveModule(null);
    }
  };

  const isCompleted = (moduleId: string) => {
    return completions.some(c => c.moduleId === moduleId);
  };

  const isAssigned = (moduleId: string) => {
    if (currentProfile?.role !== 'player') return false;
    return assignments?.some(a => a.type === 'module' && a.moduleId === moduleId) || false;
  };

  const pendingRequiredList = modules.filter(m => isAssigned(m.id) && !isCompleted(m.id));

  const handleSelectModule = (mod: ClassroomSession) => {
    setActiveModule(mod);
    setCustomTitle(`Required Session: ${mod.title}`);
    setAssignSuccess(false);
  };

  // Pastel pill colours keyed by slug (see slugifyCategory), so spacing and punctuation can't break the match.
  const CATEGORY_PASTELS: Record<string, string> = {
    nutrition: 'bg-amber-200/20 text-amber-400 border border-amber-200/30',
    strengthandconditioning: 'bg-rose-200/20 text-rose-400 border border-rose-200/30',
    recovery: 'bg-cyan-200/20 text-cyan-400 border border-cyan-200/30',
    mentalhealth: 'bg-sky-200/20 text-sky-400 border border-sky-200/30',
    stretchingandyoga: 'bg-emerald-200/20 text-emerald-400 border border-emerald-200/30',
    injuryprevention: 'bg-violet-200/20 text-violet-400 border border-violet-200/30',
    tactical: 'bg-orange-200/20 text-orange-400 border border-orange-200/30',
  };

  const categoryColor = (cat?: string | null) =>
    CATEGORY_PASTELS[slugifyCategory(cat)] ?? 'bg-slate-200/20 text-slate-300 border border-slate-300/30';

  return (
  <div className="space-y-6">
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative">
        <span className="hidden sm:inline-block p-1 px-2.5 rounded-full bg-indigo-500/15 text-indigo-400 text-xs font-mono font-medium">
          LEARNING ACADEMY
        </span>

        <h1 className="text-2xl font-sans font-bold text-slate-100 text-center sm:text-left mt-0 sm:mt-2">
          Classroom Sessions
        </h1>
      </div>

        {/* CATEGORY FILTERS */}
        <div className="mt-6">

          {/* MOBILE FILTER ACCORDION */}
          <div className="sm:hidden relative">
            <button
              type="button"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              aria-expanded={filtersExpanded}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-sky-100 border border-sky-200 text-slate-800 text-xs font-medium transition hover:bg-sky-200 hover:border-sky-300"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sky-700 font-mono uppercase tracking-wider shrink-0">
                  Filter:
                </span>

                <span className="truncate">
                  {selectedCategory.trim()}
                </span>

                <span className="font-mono text-slate-500 shrink-0">
                  ({selectedCategory === 'All'
                    ? modules.length
                    : categoryCounts[selectedCategory] || 0})
                </span>
              </div>

              <svg
                className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                  filtersExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {filtersExpanded && (
              <div className="mt-2 p-2 rounded-xl bg-slate-950 border border-slate-800 shadow-xl space-y-1">
                {['All', ...CLASSROOM_CATEGORIES].map((cat) => {
                  const isSelected = selectedCategory === cat;
                  const count = cat === 'All'
                    ? modules.length
                    : categoryCounts[cat] || 0;

                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategoryChange(cat)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                        isSelected
                          ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300'
                          : 'border border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span>{cat.trim()}</span>

                      <span className="font-mono text-[10px] opacity-70">
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* DESKTOP FILTER BUTTONS */}
          <div className="hidden sm:flex flex-wrap gap-2">
            {['All', ...CLASSROOM_CATEGORIES].map((cat) => {
              const isSelected = selectedCategory === cat;
              const count = cat === 'All'
                ? modules.length
                : categoryCounts[cat] || 0;

              return (
                <button
                  key={cat}
                  onClick={() => handleCategoryChange(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-medium font-sans border transition ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {cat.trim()}
                  <span className="ml-2 font-mono opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {pendingRequiredList.length > 0 && (
        <div className="bg-[#00bbff]/5 border border-[#00bbff]/30 p-4 rounded-2xl flex items-start gap-3 relative overflow-hidden shadow-[0_0_15px_rgba(0,187,255,0.15)]">
          <div className="p-2 rounded-lg bg-[#00bbff]/10 text-[#00bbff]">
            <GraduationCap className="w-5 h-5 shrink-0" />
          </div>

          <div>
            <h4 className="text-sm font-sans font-bold text-slate-100 flex items-center gap-1.5">
              <span>Required Training Session Pending</span>
              <span className="h-2 w-2 rounded-full bg-[#00bbff] inline-block" />
            </h4>

            <p className="text-xs text-slate-400 mt-1">
              Your coach has assigned <span className="text-[#00bbff] font-bold">"{pendingRequiredList[0].title}"</span> as a mandatory session. Please select and complete the module below.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Session List */}
        <div
          id="classroom-modules-list"
          className={`space-y-3 ${activeModule ? 'lg:col-span-4' : 'lg:col-span-12'}`}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-mono text-slate-400">
              Available Sessions ({filteredModules.length})
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
            {filteredModules.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-mono bg-slate-900 border border-slate-800 rounded-xl">
                {selectedCategory === 'All'
                  ? 'No classroom sessions available yet.'
                  : `No ${selectedCategory} sessions available yet.`}
              </div>
            ) : (
              filteredModules.map((mod) => {
                const assigned = isAssigned(mod.id);
                const isComp = isCompleted(mod.id);

                return (
                  <div
                    key={mod.id}
                    onClick={() => handleSelectModule(mod)}
                    className={`p-4 rounded-xl border transition cursor-pointer text-left relative flex flex-col justify-between ${
                      activeModule?.id === mod.id
                        ? assigned && !isComp
                          ? 'bg-indigo-500/15 border-[#00bbff] shadow-[0_0_15px_rgba(0,187,255,0.35)] font-bold'
                          : 'bg-indigo-500/10 border-indigo-500 shadow-indigo-500/5'
                        : assigned && !isComp
                          ? 'bg-slate-900 border-[#00bbff] shadow-[0_0_12px_rgba(0,187,255,0.25)] hover:shadow-[0_0_18px_rgba(0,187,255,0.4)] hover:border-[#00bbff] animate-[pulse_3s_infinite]'
                          : 'bg-slate-900 hover:bg-slate-850 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 flex-wrap sm:flex-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${categoryColor(mod.category as string)}`}>
                          {toCanonicalCategory(mod.category as string) ?? (mod.category as string)?.trim()}
                        </span>

                        {assigned && !isComp ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-[#00bbff]/10 text-[#00bbff] border border-[#00bbff]/30 animate-pulse uppercase">
                            Required
                          </span>
                        ) : assigned && isComp ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                            Required (Done)
                          </span>
                        ) : isComp ? (
                          <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-medium">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Done
                          </span>
                        ) : null}
                      </div>

                      <h3 className="font-sans font-semibold text-slate-200 mt-2.5 text-sm line-clamp-2">
                        {mod.title}
                      </h3>

                      {mod.description && (
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {mod.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-4 pt-3 border-t border-slate-800/60">
                      <span className="flex items-center gap-1">
                        {mod.videoUrl
                          ? <Play className="w-3 h-3 text-red-400" />
                          : <ImageIcon className="w-3 h-3 text-indigo-400" />}
                        {mod.videoUrl ? 'VIDEO' : 'SESSION'}
                      </span>

                      {isValidImageUrl(mod.imageUrl) && (
                        <img
                          src={mod.imageUrl}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover border border-slate-800"
                        />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Session Detail Viewer */}
        {activeModule ? (
          <div
            ref={detailsRef}
            id="classroom-module-details"
            className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 scroll-mt-24 transition-all duration-300"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-5">
              <div>
                <span className={`text-xs font-mono font-bold tracking-wider px-2 py-0.5 rounded-full ${categoryColor(activeModule.category as string)}`}>
                  {toCanonicalCategory(activeModule.category as string) ?? (activeModule.category as string)?.trim()}
                </span>

                <h2 className="text-lg font-sans font-bold text-slate-100 mt-1">
                  {activeModule.title}
                </h2>
              </div>

              <button
                onClick={() => setActiveModule(null)}
                className="self-start sm:self-center text-slate-400 hover:text-slate-200 text-xs bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 transition"
              >
                Close View
              </button>
            </div>

            {currentProfile?.role === 'coach' && (
              <div className="bg-indigo-950/20 border border-indigo-500/20 p-5 rounded-xl space-y-4 relative overflow-hidden">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <Send className="w-4 h-4" />
                  </div>

                  <div>
                    <h3 className="text-sm font-sans font-bold text-slate-100">
                      Coach Dispatch Controls
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Dispatch this learning session as a required module in players' dashboards.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 mb-1.5 uppercase">
                      Assignment Title
                    </label>

                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800/80 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition"
                      placeholder="e.g. Mandatory Nutrition Session"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 mb-1.5 uppercase">
                      Due Date
                    </label>

                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800/80 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-4">
                  <button
                    onClick={() => {
                      if (!onAddAssignment) return;

                      onAddAssignment({
                        coachId: currentProfile.coachId || currentProfile.id || 'coach-system',
                        teamId: currentProfile.teamId || '',
                        type: 'module',
                        title: customTitle || `Required Session: ${activeModule.title}`,
                        dueDate: dueDate,
                        moduleId: activeModule.id
                      });

                      setAssignSuccess(true);
                      setTimeout(() => setAssignSuccess(false), 4000);
                    }}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-500/10"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Submit to Players' Schedule
                  </button>
                </div>

                {assignSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 animate-bounce" />
                    <span>
                      Learning assignment dispatched successfully! Connected roster players can now review and complete this session.
                    </span>
                  </div>
                )}

                {(() => {
                  const coachId = currentProfile.coachId || currentProfile.id || '';

                  const dispatched = (assignments || []).filter(
                    (a) => a.type === 'module' && a.coachId === coachId && a.moduleId === activeModule.id
                  );

                  if (dispatched.length === 0) {
                    return (
                      <div className="pt-2 text-[11px] text-slate-400 italic">
                        No dispatched sessions for this module yet.
                      </div>
                    );
                  }

                  return (
                    <div className="pt-3 space-y-2">
                      <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                        Dispatched Sessions ({dispatched.length})
                      </div>

                      {dispatched.map((a) => {
                        const completedCount = a.completedByPlayerIds?.length || 0;

                        return (
                          <div
                            key={a.id}
                            className="flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-slate-200 truncate">
                                {a.title}
                              </div>

                              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {a.dueDate}
                                </span>

                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {completedCount} done
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                if (confirm(`Remove "${a.title}" from your team's schedule? This deletes the dispatch only, not the classroom session.`)) {
                                  onDeleteAssignment?.(a.id);
                                }
                              }}
                              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-semibold transition shadow-sm"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Session Content */}
            {isValidImageUrl(activeModule.imageUrl) && !activeModule.videoUrl && (
              <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                <img
                  src={activeModule.imageUrl}
                  alt={activeModule.title}
                  className="w-full h-auto"
                />
              </div>
            )}

            {activeModule.videoUrl && activeModule.videoUrl !== 'null' ? (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                  {(() => {
                    const embedUrl = getYouTubeEmbedUrl(activeModule.videoUrl!);

                    return embedUrl ? (
                      <iframe
                        src={embedUrl}
                        title={activeModule.title}
                        className="absolute top-0 left-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <video
                        src={activeModule.videoUrl}
                        controls
                        className="absolute top-0 left-0 w-full h-full"
                      />
                    );
                  })()}
                </div>
              </div>
            ) : null}

            {activeModule.description && (
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-850">
                <h4 className="text-xs font-semibold text-slate-300 font-mono mb-1.5">
                  SESSION OVERVIEW
                </h4>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {activeModule.description}
                </p>
              </div>
            )}

            {!isCompleted(activeModule.id) ? (
              <button
                onClick={() => onCompleteModule(activeModule.id)}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold p-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg"
              >
                Mark Session Complete
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl text-xs text-emerald-400 flex items-center gap-2.5 justify-center">
                <CheckCircle className="w-4 h-4" />
                You completed this learning session.
              </div>
            )}
          </div>
        ) : (
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl flex flex-col items-center justify-center text-center space-y-3 min-h-[400px]">
            <div className="p-4 rounded-full bg-slate-950 border border-slate-800 text-indigo-400">
              <GraduationCap className="w-8 h-8" />
            </div>

            <h3 className="text-base font-semibold text-slate-200">
              No Active Classroom Selection
            </h3>

            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Select one of the session cards to begin reviewing and tracking your learning progress.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
