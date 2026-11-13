/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const BUCKET = 'profile-images';
const MAX_BYTES = 2 * 1024 * 1024; // matches the bucket's 2 MB limit
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface AvatarProfile {
  id: string;
  email?: string;
  role?: string;
}

// Escape % and _ so an email is matched literally by ilike
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

// Public URL -> storage path inside the bucket
const pathFromUrl = (url: string): string | null => {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
};

/**
 * Keeps the signed-in user's profile photo.
 * - Loads users.avatar_url when the profile changes.
 * - uploadAvatar: saves the file to the profile-images bucket, then writes the link.
 * - removeAvatar: clears the link and deletes the file.
 * Deliberately does not touch the UserProfile object or supabaseService.saveDocument.
 */
export function useProfileAvatar(profile: AvatarProfile | null) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('users')
      .select('avatar_url')
      .eq('id', profile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[avatar] load failed:', error.message);
          return;
        }
        setAvatarUrl(data?.avatar_url || null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  // Writes the link (or null) to users, then mirrors it to players / coaches.
  const writeAvatar = async (url: string | null) => {
    if (!profile) throw new Error('You need to be signed in.');

    // The users row is the source of truth: failure here is an error.
    const { data, error } = await supabase
      .from('users')
      .update({ avatar_url: url })
      .eq('id', profile.id)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error('Could not save to your profile. Please sign out, sign back in, and try again.');
    }

    // Mirrors are best effort: failures are logged, not thrown.
    const email = (profile.email || '').trim();
    const safeEmail = email ? escapeLike(email) : '';
    const mirrors: PromiseLike<any>[] = [
      supabase.from('players').update({ avatar_url: url }).eq('id', profile.id)
    ];
    if (profile.role === 'player' && safeEmail) {
      mirrors.push(supabase.from('players').update({ avatar_url: url }).ilike('email', safeEmail));
    }
    if (profile.role === 'coach') {
      mirrors.push(supabase.from('coaches').update({ avatar_url: url }).eq('id', profile.id));
      if (safeEmail) {
        mirrors.push(supabase.from('coaches').update({ avatar_url: url }).ilike('coach_email', safeEmail));
      }
    }
    const results = await Promise.all(mirrors);
    results.forEach(r => {
      if (r?.error) console.warn('[avatar] mirror update failed:', r.error.message);
    });
  };

  const uploadAvatar = async (file: Blob) => {
    if (!profile) throw new Error('You need to be signed in.');
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error('Please choose a JPG, PNG or WebP image.');
    }
    if (file.size > MAX_BYTES) {
      throw new Error('That image is over 2 MB. Please choose a smaller one.');
    }

    // The storage policy compares the folder name with auth.uid(), so use the auth id.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('You need to be signed in to upload a photo.');
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    // A new file name each time avoids stale cached images.
    const path = `${authData.user.id}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = pub.publicUrl;
    const previousUrl = avatarUrl;

    try {
      await writeAvatar(url);
    } catch (err) {
      // Do not leave an orphaned file behind
      await supabase.storage.from(BUCKET).remove([path]);
      throw err;
    }

    setAvatarUrl(url);

    // Remove the previous file (best effort)
    if (previousUrl) {
      const oldPath = pathFromUrl(previousUrl);
      if (oldPath && oldPath !== path) {
        const { error } = await supabase.storage.from(BUCKET).remove([oldPath]);
        if (error) console.warn('[avatar] could not delete old file:', error.message);
      }
    }
  };

  const removeAvatar = async () => {
    if (!profile) return;
    const current = avatarUrl;

    await writeAvatar(null);
    setAvatarUrl(null);

    if (current) {
      const oldPath = pathFromUrl(current);
      if (oldPath) {
        const { error } = await supabase.storage.from(BUCKET).remove([oldPath]);
        if (error) console.warn('[avatar] could not delete file:', error.message);
      }
    }
  };

  return { avatarUrl, uploadAvatar, removeAvatar };
}