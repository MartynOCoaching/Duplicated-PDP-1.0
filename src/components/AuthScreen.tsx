/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, User, Users, Landmark, Award, Mail, ArrowRight, Eye, EyeOff, Check, Circle as HelpCircle, Clock, Clock as Unlock, Building, Database, Wifi, WifiOff, Plus } from 'lucide-react';
import { UserProfile, Coach, Team, UserRole } from '../types';

interface AuthScreenProps {
  users: UserProfile[];
  coaches: Coach[];
  teams: Team[];
  useFirestore?: boolean;
  onToggleFirestore?: (val: boolean) => void;
  onLogin: (profile: UserProfile, staySignedIn: boolean) => void;
  onLoginCredentials?: (email: string, password: string, staySignedIn: boolean) => Promise<void>;
  onGoogleSignIn?: () => Promise<void>;
  onPlayerSignup: (fields: {
    name: string;
    email: string;
    password?: string;
    coachId?: string;
    teamId?: string;
    staySignedIn: boolean;
  }) => Promise<void>;
  onCoachSignup: (fields: {
    name: string;
    email: string;
    password?: string;
    teamId?: string;
    teamIds?: string[];
    coachRole: 'head' | 'assistant';
    staySignedIn: boolean;
  }) => Promise<void>;
  onAssociationSignup: (fields: {
    name: string;
    email: string;
    password?: string;
    associationName: string;
    staySignedIn: boolean;
  }) => Promise<void>;
  onParentSignup: (fields: {
    parentName: string;
    parentEmail: string;
    parentPassword?: string;
    coachId?: string;
    coachIds?: string[];
    teamIds?: string[];
    staySignedIn: boolean;
  }) => Promise<void>;
}

export default function AuthScreen({
  users,
  coaches,
  teams,
  useFirestore = true,
  onToggleFirestore,
  onLogin,
  onLoginCredentials,
  onPlayerSignup,
  onCoachSignup,
  onAssociationSignup,
  onParentSignup
}: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // General Inputs
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState(''); // Empty by default for authentic entries
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('player');

  // Player Signup Inputs
  const [playerCoachId, setPlayerCoachId] = useState('');
  const [playerTeamId, setPlayerTeamId] = useState('');

  // Coach Signup Inputs
  const [coachTeamId, setCoachTeamId] = useState('');
  const [coachTeamIds, setCoachTeamIds] = useState<string[]>([]);
  const [coachRole, setCoachRole] = useState<'head' | 'assistant'>('head');

  // Association Signup Inputs
  const [associationName, setAssociationName] = useState('');

  // Parent Signup Inputs — array of { coachId, teamIds } pairs (one per child)
  const [parentCoachTeamPairs, setParentCoachTeamPairs] = useState<{ coachId: string; teamIds: string[] }[]>([
    { coachId: '', teamIds: [] }
  ]);

  // Map backend failures onto a small set of plain messages so internal detail
  // (schema names, policy errors, network internals) never reaches the screen.
  const friendlyAuthError = (err: any, fallback: string): string => {
    const raw = String(err?.message || '').toLowerCase();
    if (raw.includes('invalid login') || raw.includes('invalid credentials')) {
      return 'That email address and password do not match. Please try again.';
    }
    if (raw.includes('already registered') || raw.includes('already exists') || raw.includes('duplicate')) {
      return 'An account with that email address already exists. Try signing in instead.';
    }
    if (raw.includes('password')) {
      return 'Please choose a password with at least 6 characters.';
    }
    if (raw.includes('email')) {
      return 'Please check the email address you entered.';
    }
    if (raw.includes('rate') || raw.includes('too many')) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    if (raw.includes('network') || raw.includes('fetch')) {
      return 'We could not reach the server. Please check your connection and try again.';
    }
    console.warn('Auth error:', err);
    return fallback;
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email) {
      setErrorMsg('Please enter an email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your account password.');
      return;
    }

    setLoading(true);
    try {
      if (onLoginCredentials) {
        // True credentials login with Firebase Auth
        await onLoginCredentials(email.trim(), password, staySignedIn);
      } else {
        // Fallback or offline demo matching
        const match = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
        if (match) {
          onLogin(match, staySignedIn);
        } else {
          setErrorMsg('That email address and password do not match. Please try again.');
        }
      }
    } catch (err: any) {
      setErrorMsg(friendlyAuthError(err, 'We could not sign you in. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name || !email || !password) {
      setErrorMsg('Please complete all required fields.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Please choose a password with at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (selectedRole === 'player') {
        const selectedCoachObj = playerCoachId ? coaches.find(c => c.id === playerCoachId) : null;
        const coachTeamsList = selectedCoachObj
          ? (selectedCoachObj.teamIds && selectedCoachObj.teamIds.length > 0
              ? teams.filter(t => selectedCoachObj.teamIds!.includes(t.id))
              : teams.filter(t => t.id === selectedCoachObj.teamId))
          : [];

        if (coachTeamsList.length >= 2 && !playerTeamId) {
          setErrorMsg('Your Coach manages multiple teams. Please select your specific team.');
          setLoading(false);
          return;
        }

        await onPlayerSignup({
          name,
          email: email.trim(),
          password,
          coachId: playerCoachId || undefined,
          teamId: playerTeamId || undefined,
          staySignedIn
        });
      } else if (selectedRole === 'coach') {
        await onCoachSignup({
          name,
          email: email.trim(),
          password,
          teamId: coachTeamIds[0] || undefined,
          teamIds: coachTeamIds,
          coachRole,
          staySignedIn
        });
      } else if (selectedRole === 'association') {
        if (!associationName) {
          setErrorMsg('Please enter your Association / Governing Body name.');
          setLoading(false);
          return;
        }
        await onAssociationSignup({
          name,
          email: email.trim(),
          password,
          associationName,
          staySignedIn
        });
      } else if (selectedRole === 'parent') {
        const allCoachIds = parentCoachTeamPairs
          .map(p => p.coachId)
          .filter(id => id !== '');
        const allTeamIds = parentCoachTeamPairs
          .flatMap(p => p.teamIds);
        await onParentSignup({
          parentName: name,
          parentEmail: email.trim(),
          parentPassword: password,
          coachId: allCoachIds[0] || undefined,
          coachIds: allCoachIds.length > 0 ? allCoachIds : undefined,
          teamIds: allTeamIds.length > 0 ? allTeamIds : undefined,
          staySignedIn
        });
      }
    } catch (err: any) {
      setErrorMsg(friendlyAuthError(err, 'We could not create your account. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans transition-colors duration-300">

      {/* Welcome & Navigation Header */}
      <header className="bg-slate-900/60 border-b border-slate-850 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img
              src="https://i.ibb.co/gb9535YK/Untitled-design-6.png"
              alt="Echelon Logo"
              className="h-10 w-10 object-contain rounded-xl"
              referrerPolicy="no-referrer"
            />
            <span className="text-sm font-bold text-slate-100 tracking-tight font-sans">
              Player Development Portal
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setErrorMsg('');
              setTimeout(() => {
                const headerEl = document.getElementById('welcome-back-header');
                if (headerEl) {
                  headerEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 50);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#00BBFF] text-white text-xs font-bold rounded-full transition hover:opacity-90 cursor-pointer"
          >
            <Unlock className="w-3.5 h-3.5 text-white" />
            <span>LOG IN</span>
          </button>
        </div>
      </header>

      {/* Main Landing & Authentication Screen */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl shadow-indigo-500/5 grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">

          {/* Absolute Glowing Elements */}
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Input/Interactive Panel (7 cols) */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between space-y-8 z-10">

          {/* Top Form Selection Toggles */}
          <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded-2xl border border-slate-850 relative">
            <button
              onClick={() => { setIsSignUp(false); setErrorMsg(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold font-sans transition-colors flex items-center justify-center gap-1.5 relative z-10 ${
                !isSignUp
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {!isSignUp && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-[#00BBFF] rounded-xl shadow shadow-[#00BBFF]/20 -z-10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Unlock className="w-3.5 h-3.5" />
              Sign Into Account
            </button>
            <button
              onClick={() => { setIsSignUp(true); setErrorMsg(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold font-sans transition-colors flex items-center justify-center gap-1.5 relative z-10 ${
                isSignUp
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isSignUp && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-[#00BBFF] rounded-xl shadow shadow-[#00BBFF]/20 -z-10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Users className="w-3.5 h-3.5" />
              Register Profile
            </button>
          </div>

          {/* Primary Interactive Form Wrapper */}
          <div className="flex-1 flex flex-col justify-center py-4">

            {errorMsg && (
              <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs space-y-3">
                <div className="font-mono font-bold flex items-center gap-1.5">
                  <span className="text-sm">⚠</span> {errorMsg.toLowerCase().includes('network') || errorMsg.toLowerCase().includes('failed') || errorMsg.toLowerCase().includes('fetch') ? 'Supabase Network Fault' : 'Verification Alert'}
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  {errorMsg.toLowerCase().includes('network') || errorMsg.toLowerCase().includes('failed') || errorMsg.toLowerCase().includes('fetch')
                    ? "Unable to reach Supabase Cloud servers. Please double check your local connection, firewall rules, or verify your Supabase project endpoints."
                    : errorMsg}
                </p>
              </div>
            )}

            {!isSignUp ? (
              /* SIGN IN FORM */
              <form onSubmit={handleSignInSubmit} className="space-y-4">
                <div className="space-y-1">
                  <h3 id="welcome-back-header" className="text-lg font-bold text-slate-100">Welcome Back</h3>
                  <p className="text-xs text-slate-400 font-sans">Insert your credentials to enter the dashboard</p>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">EMAIL ADDRESS</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      <input
                        type="email"
                        required
                        placeholder="e.g. jjenkins@coaches.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs text-slate-100 placeholder:text-slate-650 outline-none focus:border-[#00BBFF] focus:ring-1 focus:ring-[#00BBFF] transition-colors font-sans"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">PASSWORD</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs text-slate-100 placeholder:text-slate-650 outline-none focus:border-[#00BBFF] focus:ring-1 focus:ring-[#00BBFF] transition-colors font-sans"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Keep Signed In toggle option */}
                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={staySignedIn}
                      onChange={(e) => setStaySignedIn(e.target.checked)}
                      className="rounded border-[#00BBFF] text-[#00BBFF] bg-slate-950 focus:ring-0 focus:ring-offset-0 h-4 w-4 cursor-pointer"
                    />
                    <span className="text-xs text-slate-400">Stay signed in on this device</span>
                  </label>
                  <a href="#forgot" className="text-xs text-[#00BBFF] hover:underline font-semibold">Forgot?</a>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#00BBFF] hover:bg-[#009be0] disabled:opacity-50 text-white font-bold text-xs py-3 rounded-full transition duration-200 mt-4 flex items-center justify-center gap-1.5 shadow"
                >
                  {loading ? 'Authenticating Secures...' : 'Access Dashboard Portal'}
                  {!loading && <ArrowRight className="h-4 w-4 text-white" />}
                </button>
              </form>
            ) : (
              /* SIGN UP FORM (MULTIPATH ROLE SELECTION) */
              <form onSubmit={handleSignUpSubmit} className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-100">Create Sporting Account</h3>
                  <p className="text-xs text-slate-400">Join the PDP to participate in athletic operations</p>
                </div>

                {/* Role Selector Grid */}
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-2">My Sporting Level / Role</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => { setSelectedRole('player'); setErrorMsg(''); }}
                      className={`py-3 px-2 rounded-xl text-xs font-bold font-sans border transition-all flex flex-col items-center justify-center gap-1.5 ${
                        selectedRole === 'player'
                          ? 'bg-[#1d75ff]/15 text-[#1d75ff] border-[#1d75ff]/30 shadow-sm shadow-[#1d75ff]/10'
                          : 'bg-slate-950/60 border-slate-850 hover:border-slate-800 text-white'
                      }`}
                    >
                      <User className="h-4 w-4" />
                      <span>Player</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedRole('coach'); setErrorMsg(''); }}
                      className={`py-3 px-2 rounded-xl text-xs font-bold font-sans border transition-all flex flex-col items-center justify-center gap-1.5 ${
                        selectedRole === 'coach'
                          ? 'bg-[#1d75ff]/15 text-[#1d75ff] border-[#1d75ff]/30 shadow-sm shadow-[#1d75ff]/10'
                          : 'bg-slate-950/60 border-slate-850 hover:border-slate-800 text-white'
                      }`}
                    >
                      <Award className="h-4 w-4" />
                      <span>Coach</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedRole('association'); setErrorMsg(''); }}
                      className={`py-3 px-2 rounded-xl text-xs font-bold font-sans border transition-all flex flex-col items-center justify-center gap-1.5 ${
                        selectedRole === 'association'
                          ? 'bg-[#1d75ff]/15 text-[#1d75ff] border-[#1d75ff]/30 shadow-sm shadow-[#1d75ff]/10'
                          : 'bg-slate-950/60 border-slate-850 hover:border-slate-800 text-white'
                      }`}
                    >
                      <Landmark className="h-4 w-4" />
                      <span>Association</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedRole('parent'); setErrorMsg(''); }}
                      className={`py-3 px-2 rounded-xl text-xs font-bold font-sans border transition-all flex flex-col items-center justify-center gap-1.5 ${
                        selectedRole === 'parent'
                          ? 'bg-[#1d75ff]/15 text-[#1d75ff] border-[#1d75ff]/30 shadow-sm shadow-[#1d75ff]/10'
                          : 'bg-slate-950/60 border-slate-850 hover:border-slate-800 text-white'
                      }`}
                    >
                      <Users className="h-4 w-4 text-indigo-400" />
                      <span>Parent</span>
                    </button>
                  </div>
                </div>

                {/* General Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                      {selectedRole === 'parent' ? 'PARENT FULL NAME' : 'YOUR FULL NAME'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={selectedRole === 'parent' ? "e.g. Maria Rivera" : "e.g. Alex Rivera"}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-700 outline-none focus:border-[#00BBFF] focus:ring-1 focus:ring-[#00BBFF] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">
                      {selectedRole === 'parent' ? 'PARENT EMAIL ADDRESS' : 'EMAIL ADDRESS'}
                    </label>
                    <input
                      type="email"
                      required
                      placeholder={selectedRole === 'parent' ? "e.g. mrivera@gmail.com" : "e.g. arivera@gmail.com"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-700 outline-none focus:border-[#00BBFF] focus:ring-1 focus:ring-[#00BBFF] transition-colors"
                    />
                  </div>
                </div>

                {/* Choose Password Field */}
                <div className="pt-2">
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">CHOOSE PASSWORD</label>
                  <div className="relative font-sans">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Minimum 6 characters for Firebase security"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-xs text-slate-100 placeholder:text-slate-650 outline-none focus:border-[#00BBFF] focus:ring-1 focus:ring-[#00BBFF] transition-colors font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* ROLE PATH 1: Player selection logic */}
                {selectedRole === 'player' && (() => {
                  const selectedCoachObj = playerCoachId ? coaches.find(c => c.id === playerCoachId) : null;
                  const coachTeamsList = selectedCoachObj
                    ? (selectedCoachObj.teamIds && selectedCoachObj.teamIds.length > 0
                        ? teams.filter(t => selectedCoachObj.teamIds!.includes(t.id))
                        : teams.filter(t => t.id === selectedCoachObj.teamId))
                    : [];

                  return (
                    <div className="p-4 bg-slate-950 border border-slate-850 rounded-2xl space-y-3">
                      <div>
                        <label className="block text-[10px] font-mono text-slate-405 uppercase tracking-wider mb-1">
                          SELECT YOUR COACH (auto-links Team & Organization)
                        </label>
                        <select
                          value={playerCoachId}
                          onChange={(e) => {
                            setPlayerCoachId(e.target.value);
                            setPlayerTeamId(''); // Reset selected team on coach change
                          }}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-205 rounded-lg p-2.5 outline-none font-sans"
                        >
                          <option value="">-- No Coach selected (Sign up as Unlisted) --</option>
                          {coaches.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.email})
                            </option>
                          ))}
                        </select>
                      </div>

                      {playerCoachId !== '' && coachTeamsList.length >= 2 && (
                        <div className="mt-3">
                          <label className="block text-[10px] font-mono text-slate-405 uppercase tracking-wider mb-1">
                            SELECT YOUR SPECIFIC TEAM (Required)
                          </label>
                          <select
                            value={playerTeamId}
                            required
                            onChange={(e) => setPlayerTeamId(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-205 rounded-lg p-2.5 outline-none font-sans"
                          >
                            <option value="">-- Choose your team --</option>
                            {coachTeamsList.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {playerCoachId === '' ? (
                        <p className="text-[11px] text-amber-400/80 italic font-medium leading-normal">
                          * You don't have a coach on this system? No worries. You'll sign in as an <b>Unlisted Athlete</b> and can link/create later in profile settings!
                        </p>
                      ) : coachTeamsList.length >= 2 && !playerTeamId ? (
                        <p className="text-[11px] text-amber-400/85 italic font-medium leading-normal animate-pulse">
                          * Your coach manages multiple teams. Please select which team you are registering for above!
                        </p>
                      ) : (
                        <p className="text-[11px] text-emerald-400/90 font-medium leading-normal font-sans">
                          ✓ Excellent. Team affiliation and parent club information will populate automatically from your coach's registration details!
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* ROLE PATH 2: Coach selection logic */}
                {selectedRole === 'coach' && (
                  <div className="p-4 bg-slate-950 border border-slate-850 rounded-2xl space-y-4">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-405 uppercase tracking-wider mb-2">
                        COACHING ASSIGNMENT ROLE
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setCoachRole('head')}
                          className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                            coachRole === 'head'
                              ? 'bg-indigo-600/15 border-indigo-505 text-indigo-405'
                              : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                          }`}
                        >
                          <span className="font-sans font-black">Head Coach</span>
                          <span className="text-[9px] font-mono font-medium opacity-80 uppercase">TACTICAL LEADER</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCoachRole('assistant')}
                          className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 ${
                            coachRole === 'assistant'
                              ? 'bg-[#00BBFF]/15 border-[#00BBFF]/60 text-[#00BBFF]'
                              : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                          }`}
                        >
                          <span className="font-sans font-black">Assistant Coach</span>
                          <span className="text-[9px] font-mono font-medium opacity-80 uppercase">SUPPORT STAFF</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-slate-405 uppercase tracking-wider mb-2">
                        SELECT ASSIGNED TEAMS (You can select multiple!)
                      </label>
                      <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl bg-slate-900 p-2.5 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-850 scrollbar-track-transparent">
                        {teams.length === 0 ? (
                          <div className="text-slate-500 text-xs italic p-2">No teams available in the system yet.</div>
                        ) : (
                          teams.map(t => {
                            const isChecked = coachTeamIds.includes(t.id);
                            return (
                              <label key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition select-none">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setCoachTeamIds(prev => prev.filter(id => id !== t.id));
                                    } else {
                                      setCoachTeamIds(prev => [...prev, t.id]);
                                    }
                                  }}
                                  className="rounded border-slate-700 bg-slate-950 text-indigo-550 focus:ring-opacity-40 h-4 w-4"
                                />
                                <span className="text-xs text-slate-205 font-medium font-sans">
                                  {t.name}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <p className="text-[9px] font-mono text-slate-505 mt-1 uppercase tracking-wider">
                        {coachTeamIds.length} team(s) selected
                      </p>
                    </div>
                    {coachTeamIds.length === 0 ? (
                      <p className="text-[11px] text-amber-400/80 italic font-medium leading-normal">
                        * No worries if your team is not listed. Upon entering the app, we will guide you to <b>Formulate a new Team, create or select a Club, and integrate your Governing Association</b> instantly!
                      </p>
                    ) : (
                      <p className="text-[11px] text-emerald-400/90 font-medium leading-normal font-sans">
                        ✓ Your coach credentials will instantly bind to your selected roster squad(s) or competitive teams.
                      </p>
                    )}
                  </div>
                )}

                {/* ROLE PATH 3: Association creation logic */}
                {selectedRole === 'association' && (
                  <div className="p-4 bg-slate-950 border border-slate-850 rounded-2xl space-y-3 font-sans">
                    <div>
                      <label className="block text-[10px] font-mono text-slate-405 uppercase tracking-wider mb-1">
                        NAME OF YOUR ATHLETIC ASSOCIATION / LEAGUE
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Washington Premier Athletic Association"
                        value={associationName}
                        onChange={(e) => setAssociationName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-150 outline-none"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      As an Association President/Manager account, you will have first-class privileges to <b>Register Clubs, delegate Teams, and verified Coaches</b> inside your corporate governance dashboard.
                    </p>
                  </div>
                )}

                {/* ROLE PATH 4: Parent registration logic */}
                {selectedRole === 'parent' && (
                  <div className="p-4 bg-slate-950 border border-slate-850 rounded-2xl space-y-4">
                    {parentCoachTeamPairs.map((pair, pairIndex) => {
                      const pairCoachObj = pair.coachId ? coaches.find(c => c.id === pair.coachId) : null;
                      const pairCoachTeams = pairCoachObj
                        ? (pairCoachObj.teamIds && pairCoachObj.teamIds.length > 0
                            ? teams.filter(t => pairCoachObj.teamIds!.includes(t.id))
                            : teams.filter(t => t.id === pairCoachObj.teamId))
                        : [];
                      return (
                        <div key={pairIndex} className="space-y-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold text-[#00BBFF] uppercase tracking-wider">
                              Child {pairIndex + 1}
                            </span>
                            {parentCoachTeamPairs.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setParentCoachTeamPairs(prev => prev.filter((_, i) => i !== pairIndex));
                                }}
                                className="text-[10px] text-rose-400 hover:text-rose-300 font-medium transition"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono text-slate-405 uppercase tracking-wider mb-1">
                              SELECT COACH
                            </label>
                            <select
                              value={pair.coachId}
                              onChange={(e) => {
                                const newCoachId = e.target.value;
                                setParentCoachTeamPairs(prev => prev.map((p, i) =>
                                  i === pairIndex ? { coachId: newCoachId, teamIds: [] } : p
                                ));
                              }}
                              className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-205 rounded-lg p-2.5 outline-none font-sans"
                            >
                              <option value="">-- Select a coach --</option>
                              {coaches.map(c => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.email})
                                </option>
                              ))}
                            </select>
                          </div>

                          {pair.coachId === '' ? (
                            <p className="text-[11px] text-amber-400/80 italic font-medium leading-normal">
                              * Select a coach above to see their available teams.
                            </p>
                          ) : (
                            <p className="text-[11px] text-emerald-400/90 font-medium leading-normal font-sans">
                              ✓ Teams from your selected coach are listed below.
                            </p>
                          )}

                          <div>
                            <label className="block text-[10px] font-mono text-slate-405 uppercase tracking-wider mb-2">
                              SELECT YOUR CHILD'S TEAM
                            </label>
                            {pair.coachId === '' ? (
                              <div className="border border-slate-800 rounded-xl bg-slate-900 p-4 text-center">
                                <p className="text-slate-500 text-xs italic">Select a coach first to see their teams.</p>
                              </div>
                            ) : (
                              <>
                                <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl bg-slate-900 p-2.5 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-850 scrollbar-track-transparent">
                                  {pairCoachTeams.length === 0 ? (
                                    <div className="text-slate-500 text-xs italic p-2">This coach does not have any teams assigned yet.</div>
                                  ) : (
                                    pairCoachTeams.map(t => {
                                      const isChecked = pair.teamIds.includes(t.id);
                                      return (
                                        <label key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition select-none">
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => {
                                              setParentCoachTeamPairs(prev => prev.map((p, i) => {
                                                if (i !== pairIndex) return p;
                                                if (isChecked) {
                                                  return { ...p, teamIds: p.teamIds.filter(id => id !== t.id) };
                                                }
                                                return { ...p, teamIds: [...p.teamIds, t.id] };
                                              }));
                                            }}
                                            className="rounded border-slate-700 bg-slate-950 text-indigo-550 focus:ring-opacity-40 h-4 w-4"
                                          />
                                          <span className="text-xs text-slate-205 font-medium font-sans">
                                            {t.name}
                                          </span>
                                        </label>
                                      );
                                    })
                                  )}
                                </div>
                                <p className="text-[9px] font-mono text-slate-505 mt-1 uppercase tracking-wider">
                                  {pair.teamIds.length} team(s) selected
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {parentCoachTeamPairs.length < 3 && (
                      <button
                        type="button"
                        onClick={() => {
                          setParentCoachTeamPairs(prev => [...prev, { coachId: '', teamIds: [] }]);
                        }}
                        className="w-full py-2.5 border border-dashed border-slate-700 hover:border-[#00BBFF]/50 rounded-xl text-xs font-bold text-slate-400 hover:text-[#00BBFF] transition flex items-center justify-center gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Another Child's Coach/Team
                      </button>
                    )}

                    <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4 text-[#00BBFF]" />
                        <span className="text-[11px] font-sans font-bold text-slate-200">
                          Add or link your child later
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        After you register, head to your <b>profile settings</b> page to add a new athlete profile or link an existing player account to your parent account.
                      </p>
                    </div>
                  </div>
                )}

                {/* Stay signed in checkbox */}
                <div className="flex items-center pt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={staySignedIn}
                      onChange={(e) => setStaySignedIn(e.target.checked)}
                      className="rounded border-slate-800 text-[#00BBFF] bg-slate-950 focus:ring-0 focus:ring-offset-0 h-4 w-4 cursor-pointer"
                    />
                    <span className="text-xs text-slate-400">Remember my session and auto-login next time</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#00BBFF] hover:bg-[#009be0] disabled:opacity-50 text-white font-bold text-xs py-3 rounded-full transition duration-200 mt-4 flex items-center justify-center gap-1.5 shadow-lg shadow-[#00BBFF]/15"
                >
                  {loading ? 'Registering Credentials...' : 'Register Profile & Log In'}
                  {!loading && <ArrowRight className="h-4 w-4 text-white" />}
                </button>
              </form>
            )}

          </div>

        </div>

        {/* Brand/Pitch Side Panel (4 cols) - Positioned below Interactive on mobile, right on desktop */}
        <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/40 p-8 sm:p-10 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-6 z-10">
            <div className="space-y-4 pt-4 sm:pt-6">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 font-sans tracking-tight leading-tight text-center">
                Unlock Athletic Excellence.
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                The Player Development Portal is a comprehensive platform built for athletes, coaches, clubs, and associations who are serious about long-term performance growth. Athletes can track GPS-recorded runs, complete structured classroom sessions in strength and conditioning, injury prevention, mental resilience, yoga, and recovery — all in one place. Monitor daily sleep, hydration, and personal goals, while your coach gains full visibility into your progress and can assign training schedules, sessions, and distance targets tailored to your development stage. Whether you're an athlete building your foundation or a coach managing an entire squad, PDP gives every level of your organisation the tools to develop with purpose and perform with confidence.
              </p>
            </div>
          </div>

          {/* Core Taxonomic Indicators */}
          <div className="space-y-4 pt-8 sm:pt-0 z-10">
            <p className="text-[10px] font-mono text-slate-500 text-center lg:text-left mt-4 pt-4 border-t border-slate-800/50">
              Player Development Portal — 2026 Sports Performance Engine
            </p>
          </div>
        </div>

      </div>
    </div>
  </div>
  );
}