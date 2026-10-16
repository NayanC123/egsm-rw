// src/services/storageService.ts
// Native-Safe Supabase Storage Uploader using React Native native multipart streaming via XMLHttpRequest.
// Avoids Expo Winter fetch "Unsupported FormDataPart implementation" error on React Native Android/iOS.

import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

export type StorageBucket = 'chat-media' | 'post-attachments';

/**
 * Uploads a local file URI (from camera, image library, document picker, or audio recorder)
 * directly to the specified Supabase Storage bucket using XMLHttpRequest with native FormData.
 * Returns the public HTTPS URL for the uploaded file.
 */
export async function uploadFileToSupabase(
  localUri: string,
  fileName: string,
  mimeType: string,
  bucket: StorageBucket
): Promise<string> {
  const safeName = fileName || 'attachment';
  const cleanFileName = `${Date.now()}_${safeName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const endpoint = `${SUPABASE_URL}/storage/v1/object/${bucket}/${cleanFileName}`;

  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    name: cleanFileName,
    type: mimeType || 'application/octet-stream',
  } as any);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('x-upsert', 'true');

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(cleanFileName);
        resolve(data.publicUrl);
      } else {
        const errorText = xhr.responseText || xhr.statusText || 'Unknown upload error';
        reject(new Error(`Storage upload failed (${xhr.status}): ${errorText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error(`Storage network request failed (${xhr.status || 'ERR'}): ${xhr.responseText || 'Connection failed'}`));
    };

    xhr.ontimeout = () => {
      reject(new Error('Storage upload timed out. Please check your network connection.'));
    };

    xhr.send(formData);
  });
}
