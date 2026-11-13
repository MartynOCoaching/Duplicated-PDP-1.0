/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase, sanitizeUUID } from '../supabase';
import { compressImage } from './compressImage';

const BUCKET = 'profile-images';

// Public URL -> storage path inside the bucket
const pathFromUrl = (url: string): string | null => {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
};

/** Read the current photo link for a player (users row first, players row fallback). */
export async function fetchPlayerAvatar(playerId: string): Promise<string | null> {
  const dbId = sanitizeUUID(playerId);
  const { data, error } = await supabase
    .from('users')
    .select('avatar_url')
    .eq('id', dbId)
    .maybeSingle();
  if (error) {
    console.warn('[player-avatar] load failed:', error.message);
    return null;
  }
  if (data?.avatar_url) return data.avatar_url;

  const { data: pData, error: pError } = await supabase
    .from('players')
    .select('avatar_url')
    .eq('id', dbId)
    .maybeSingle();
  if (pError) {
    console.warn('[player-avatar] player load failed:', pError.message);
    return null;
  }
  return pData?.avatar_url || null;
}

/**
 * Coach uploads a player's profile photo. The file lands in the signed-in
 * coach's own storage folder; the link is written through the server-side
 * set_player_avatar function, which verifies the coach-player relationship.
 * Returns the new public URL.
 */
export async function uploadPlayerAvatar(playerId: string, file: Blob): Promise<string> {
  if (!playerId) throw new Error('No player selected.');
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image.');
  }

  // Ready-to-save transparent PNGs from the editor upload as-is; other
  // images are compressed and re-encoded to JPEG like elsewhere in the app.
  const isEditorPng = file.type === 'image/png';
  const uploadBlob = isEditorPng ? file : await compressImage(file as File);
  const contentType = uploadBlob.type;

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('You need to be signed in to upload a photo.');
  }

  const dbId = sanitizeUUID(playerId);
  // A new file name each time avoids stale cached images.
  const path = `${authData.user.id}/player-avatar-${Date.now()}.${isEditorPng ? 'png' : 'jpg'}`;

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

  const { error: rpcError } = await supabase.rpc('set_player_avatar', {
    p_player_id: dbId,
    p_avatar_url: url,
  });
  if (rpcError) {
    // Do not leave an orphaned file behind
    await supabase.storage.from(BUCKET).remove([path]);
    if (rpcError.message.includes('Not authorized')) {
      throw new Error('This player is not linked to your team.');
    }
    throw new Error('Could not save the photo. Please try again.');
  }

  return url;
}

/** Clear a player's profile photo and remove the stored file. */
export async function removePlayerAvatar(playerId: string): Promise<void> {
  if (!playerId) return;
  const dbId = sanitizeUUID(playerId);

  const previousUrl = await fetchPlayerAvatar(playerId);

  const { error: rpcError } = await supabase.rpc('set_player_avatar', {
    p_player_id: dbId,
    p_avatar_url: null,
  });
  if (rpcError) {
    if (rpcError.message.includes('Not authorized')) {
      throw new Error('This player is not linked to your team.');
    }
    throw new Error('Could not remove the photo. Please try again.');
  }

  if (previousUrl) {
    const oldPath = pathFromUrl(previousUrl);
    if (oldPath) {
      const { error } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (error) console.warn('[player-avatar] could not delete old file:', error.message);
    }
  }
}
