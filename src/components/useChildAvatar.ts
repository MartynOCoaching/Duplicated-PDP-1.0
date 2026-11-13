/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { supabase, sanitizeUUID } from '../supabase';
import { compressImage } from '../utils/compressImage';

const BUCKET = 'profile-images';

interface ChildRef {
  id: string;
}

// Legacy text ids (e.g. "user-player-123") must be mapped to the UUID used
// in the users table, otherwise every query fails with a 400.
const dbId = (child: ChildRef): string => {
  try {
    return sanitizeUUID(child.id);
  } catch (_) {
    return child.id;
  }
};

// Public URL -> storage path inside the bucket
const pathFromUrl = (url: string): string | null => {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
};

/**
 * Keeps the profile photo of a parent's linked child.
 * The parent is signed in, so uploads land in the parent's own storage folder
 * and the link is written through the server-side set_child_avatar function,
 * which verifies the parent-child relationship.
 */
export function useChildAvatar(child: ChildRef | null) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!child?.id) {
      setAvatarUrl(null);
      return;
    }
    const childDbId = dbId(child);
    let cancelled = false;
    supabase
      .from('users')
      .select('avatar_url')
      .eq('id', childDbId)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[child-avatar] load failed:', error.message);
          return;
        }
        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url);
          return;
        }
        // Children without a users row keep their photo on the players table.
        const { data: pData, error: pError } = await supabase
          .from('players')
          .select('avatar_url')
          .eq('id', childDbId)
          .maybeSingle();
        if (cancelled) return;
        if (pError) {
          console.warn('[child-avatar] player load failed:', pError.message);
          return;
        }
        setAvatarUrl(pData?.avatar_url || null);
      });
    return () => {
      cancelled = true;
    };
  }, [child?.id]);

  const uploadAvatar = async (file: Blob) => {
    if (!child?.id) throw new Error('No athlete selected.');
    const childDbId = dbId(child);

    // Ready-to-save transparent PNGs from the editor upload as-is; other
    // images are compressed and re-encoded to JPEG like the profile page.
    const isEditorPng = file.type === 'image/png';
    const uploadBlob = isEditorPng ? file : await compressImage(file as File);
    const contentType = uploadBlob.type;

    // The storage policy compares the folder name with auth.uid(), so use the auth id.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('You need to be signed in to upload a photo.');
    }

    const ext = isEditorPng ? 'png' : 'jpg';
    // A new file name each time avoids stale cached images.
    const path = `${authData.user.id}/avatar-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, uploadBlob, { contentType, cacheControl: '3600', upsert: false });
    if (uploadError) {
      if (uploadError.message.includes('row-level security') || uploadError.message.includes('policy')) {
        throw new Error('Photo uploads are not permitted for your account.');
      }
      throw new Error('Could not upload the photo. Please try again.');
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = pub.publicUrl;
    const previousUrl = avatarUrl;

    const { error: rpcError } = await supabase.rpc('set_child_avatar', {
      p_child_id: childDbId,
      p_avatar_url: url,
    });
    if (rpcError) {
      // Do not leave an orphaned file behind
      await supabase.storage.from(BUCKET).remove([path]);
      if (rpcError.message.includes('Not authorized')) {
        throw new Error('This athlete is not linked to your account.');
      }
      throw new Error('Could not save the photo. Please try again.');
    }

    setAvatarUrl(url);

    // Remove the previous file (best effort)
    if (previousUrl) {
      const oldPath = pathFromUrl(previousUrl);
      if (oldPath && oldPath !== path) {
        const { error } = await supabase.storage.from(BUCKET).remove([oldPath]);
        if (error) console.warn('[child-avatar] could not delete old file:', error.message);
      }
    }
  };

  const removeAvatar = async () => {
    if (!child?.id) return;
    const current = avatarUrl;

    const { error: rpcError } = await supabase.rpc('set_child_avatar', {
      p_child_id: dbId(child),
      p_avatar_url: null,
    });
    if (rpcError) {
      if (rpcError.message.includes('Not authorized')) {
        throw new Error('This athlete is not linked to your account.');
      }
      throw new Error('Could not remove the photo. Please try again.');
    }
    setAvatarUrl(null);

    if (current) {
      const oldPath = pathFromUrl(current);
      if (oldPath) {
        const { error } = await supabase.storage.from(BUCKET).remove([oldPath]);
        if (error) console.warn('[child-avatar] could not delete file:', error.message);
      }
    }
  };

  return { avatarUrl, uploadAvatar, removeAvatar };
}
