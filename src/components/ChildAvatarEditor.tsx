/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Camera, Trash2, X, Loader2, ImageIcon } from 'lucide-react';
import { UserProfile } from '../types';
import ProfileImageEditor from './ProfileImageEditor';

interface ChildAvatarEditorProps {
  child: UserProfile;
  avatarUrl: string | null;
  onUpload: (file: Blob) => Promise<void>;
  onRemove: () => Promise<void>;
  onClose: () => void;
}

/**
 * Small dialog where a parent updates their child's profile photo.
 * Upload and removal are handled by the parent-supplied callbacks
 * (the useChildAvatar hook), so the dialog only shows state and errors.
 */
export default function ChildAvatarEditor({ child, avatarUrl, onUpload, onRemove, onClose }: ChildAvatarEditorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);

  const handleUpload = async (file: Blob) => {
    setBusy(true);
    setError('');
    try {
      await onUpload(file);
      setEditorOpen(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo. Please try again.');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError('');
    try {
      await onRemove();
      setEditorOpen(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the photo. Please try again.');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold text-slate-100 font-sans">Athlete Photo</h3>
            <p className="text-[11px] text-slate-400 mt-1">Update the profile picture shown for {child.name}.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-center py-2">
          <div className="w-28 h-28 rounded-full overflow-hidden bg-slate-800 border-2 border-slate-700 flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${child.name}'s profile`} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-10 h-10 text-slate-600" />
            )}
          </div>
        </div>

        {editorOpen && (
          <ProfileImageEditor
            onUpload={handleUpload}
            onRemove={handleRemove}
            hasAvatar={Boolean(avatarUrl)}
            onClose={() => setEditorOpen(false)}
          />
        )}

        {busy ? (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 mt-5">
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving photo...
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-5">
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#00bbff] hover:bg-[#00a8e0] text-slate-950 font-bold text-xs transition"
            >
              <Camera className="w-4 h-4" />
              {avatarUrl ? 'Choose a new photo' : 'Upload a photo'}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={handleRemove}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold text-xs transition"
              >
                <Trash2 className="w-4 h-4" />
                Remove photo
              </button>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-[11px] text-rose-400 text-center">{error}</p>}
        <p className="mt-4 text-[10px] text-slate-500 text-center font-mono">JPG, PNG or WebP - max 2 MB</p>
      </div>
    </div>
  );
}
