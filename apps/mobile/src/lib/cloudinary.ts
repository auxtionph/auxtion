import { apiClient } from '../services/api/client';

export type CloudinaryPhoto = {
  url: string;
  publicId: string;
  width: number;
  height: number;
};

type UploadSignature = {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
  eager: string;
};

let cachedSignature: { sig: UploadSignature; fetchedAt: number } | null = null;
const SIGNATURE_TTL_MS = 50 * 60 * 1000;

async function getSignature(): Promise<UploadSignature> {
  const now = Date.now();
  if (cachedSignature && now - cachedSignature.fetchedAt < SIGNATURE_TTL_MS) {
    return cachedSignature.sig;
  }
  const { data } = await apiClient.get<{ data: UploadSignature }>('/shop-items/upload-signature');
  // API wraps response in { success, data, timestamp }
  const sig = (data as any).data ?? data;
  cachedSignature = { sig, fetchedAt: now };
  return sig;
}

export function invalidateUploadSignature() {
  cachedSignature = null;
}

export async function uploadPhotoToCloudinary(
  localUri: string,
  onProgress?: (pct: number) => void,
): Promise<CloudinaryPhoto> {
  const sig = await getSignature();

  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    type: 'image/jpeg',
    name: `upload_${Date.now()}.jpg`,
  } as any);
  formData.append('api_key', sig.apiKey);
  formData.append('timestamp', String(sig.timestamp));
  formData.append('signature', sig.signature);
  formData.append('folder', sig.folder);
  formData.append('eager', sig.eager);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`;

  return new Promise<CloudinaryPhoto>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          const eagerUrl = json.eager?.[0]?.secure_url;
          resolve({
            url: eagerUrl || json.secure_url,
            publicId: json.public_id,
            width: json.eager?.[0]?.width || json.width,
            height: json.eager?.[0]?.height || json.height,
          });
        } catch {
          reject(new Error('Invalid Cloudinary response'));
        }
      } else {
        if (xhr.status === 401) cachedSignature = null;
        reject(new Error(`Upload failed: ${xhr.status} — ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}