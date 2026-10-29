// src/services/storageService.ts
// Native FormData POST uploader to Supabase Storage.
// Zero-crash architecture: does not rely on Node buffers or native file system polyfills.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

export type StorageBucket = 'chat-media' | 'post-attachments';

/**
 * Uploads a local file URI (from image or document picker) to Supabase Storage
 * via native multipart FormData POST and returns the public CDN URL.
 */
export async function uploadLocalFileToStorage(
  bucket: StorageBucket,
  localUri: string,
  originalFilename: string,
  mimeType: string
): Promise<string> {
  const sanitized = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const cleanFileName = `${Date.now()}_${sanitized}`;

  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    name: cleanFileName,
    type: mimeType || 'application/octet-stream',
  } as any);

  const endpoint = `${SUPABASE_URL}/storage/v1/object/${bucket}/${cleanFileName}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Upload to ${bucket} failed (status ${response.status}): ${errorBody}`);
  }

  // Construct and return the public storage URL
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${cleanFileName}`;
}
