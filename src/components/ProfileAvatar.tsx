
import React, { useState } from 'react';
import { User, Award, Landmark, Shield, Users, Camera, X } from 'lucide-react';
import { UserRole } from '../types';
import ProfileImageEditor from './ProfileImageEditor';

interface ProfileAvatarProps {
  role: UserRole;
  avatarUrl?: string | null;
  onUpload?: (file: Blob) => Promise<void>;
  onRemove?: () => Promise<void>;
}

const ROLE_ICONS: Record<string, React.ReactNode> = {
  coach: <Award className="w-7 h-7 text-sky-500" />,
  association: <Landmark className="w-7 h-7 text-sky-500" />,
  parent: <Users className="w-7 h-7 text-sky-500" />,
  admin: <Shield className="w-7 h-7 text-rose-500" />,
  player: <User className="w-7 h-7 text-sky-500" />,
};

const ROLE_FALLBACK = <User className="w-7 h-7 text-sky-500" />;

export default function ProfileAvatar({
  role,
  avatarUrl,
  onUpload,
  onRemove
}: ProfileAvatarProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);

  const canEdit = Boolean(onUpload);

  const openEditor = () => {
    if (!canEdit || busy) return;
    setError('');
    setEditorOpen(true);
  };

  const handleUpload = async (file: Blob) => {
    if (!onUpload) return;
    setBusy(true);
    setError('');
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo.');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;

    setError('');
    setBusy(true);

    try {
      await onRemove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the photo.');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0">
      <div className="relative group">
        <div
          className={`w-14 h-14 rounded-2xl overflow-hidden flex items-center justify-center border ${
            avatarUrl ? 'border-sky-200' : 'bg-sky-50 border-sky-200'
          } ${canEdit ? 'cursor-pointer' : ''}`}
          onClick={openEditor}
          role={canEdit ? 'button' : undefined}
          aria-label={avatarUrl ? 'Change profile photo' : 'Add profile photo'}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Profile photo" className="w-full h-full object-cover" />
          ) : (
            ROLE_ICONS[role] || ROLE_FALLBACK
          )}

          {busy && (
            <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {canEdit && !busy && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openEditor();
            }}
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center shadow-sm border-2 border-white transition-colors"
            aria-label={avatarUrl ? 'Change photo' : 'Add photo'}
          >
            <Camera className="w-3 h-3" />
          </button>
        )}

        {avatarUrl && onRemove && !busy && (
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-600 hover:bg-rose-500 text-white hidden group-hover:flex items-center justify-center shadow-sm border-2 border-white transition-colors"
            aria-label="Remove photo"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {editorOpen && onUpload && (
        <ProfileImageEditor
          onUpload={handleUpload}
          onRemove={onRemove ? handleRemove : undefined}
          hasAvatar={Boolean(avatarUrl)}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {error && (
        <p className="mt-1 text-[10px] text-rose-500 max-w-[14rem] leading-snug">
          {error}
        </p>
      )}
    </div>
  );
}
