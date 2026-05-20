# Image Upload — Auxtion (Expo + Cloudinary, Signed)

> Covers expo-image-picker → signed Cloudinary upload → storing `{url, publicId}` in DB.
> Read before building any image upload feature in Auxtion (shop item photos, profile avatars, show banners, etc.).

## Architecture decision

**Signed direct upload.** Mobile fetches a short-lived signature from our API, uploads the binary straight to Cloudinary (server never touches the bytes), then sends the resulting `{url, publicId}` to our API to persist.

**Why signed, not unsigned:**
- Mobile bundle contains zero Cloudinary credentials → decompile yields nothing
- Server enforces per-user folder via `folder: auxtion/<feature>/<userId>/` baked into the signature
- Stored `publicId` enables server-side delete → no orphans burning the 25GB free tier
- Per-user rate limiting possible at the signature endpoint
- Production-grade pattern. Do not regress to unsigned uploads.

## Stack

- **Picker:** `expo-image-picker` (camera + library via ActionSheetIOS)
- **Storage:** Cloudinary (signed upload, eager transform: `c_limit,w_1600,q_auto,f_auto`)
- **Signature source:** `GET /shop-items/upload-signature` (Auth required) — generic enough to reuse for other features; rename per-feature if needed
- **DB schema:** `photos Json @default("[]")` storing `Array<{url, publicId, width, height}>`

## Required env vars (apps/api/.env)

```bash
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

**Never** put these in mobile env. The signed pattern means mobile never sees the secret.

## Backend: signature generation

`apps/api/src/modules/shop-items/shop-items.service.ts`

```typescript
import * as crypto from 'crypto';

getUploadSignature(userId: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Cloudinary not configured');

  const timestamp = Math.round(Date.now() / 1000);
  const folder = `auxtion/shop-items/${userId}`;
  const eager = 'c_limit,w_1600,q_auto,f_auto';

  // Cloudinary signing: alphabetical key=value joined with &, append api_secret, SHA-1.
  const paramsToSign = `eager=${eager}&folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(paramsToSign + apiSecret).digest('hex');

  return { signature, timestamp, cloudName, apiKey, folder, eager };
}
```

**Signing rules — never violate:**
- Parameters must be sorted alphabetically before signing
- Only sign params you'll actually send (eager, folder, timestamp)
- `api_key` and `signature` go in the upload form but are **not** part of the signed string
- Signature is SHA-1, not SHA-256 — Cloudinary spec

## Backend: delete on item removal (mandatory)

Without this, every deleted item leaves orphans on Cloudinary forever. In `shop-items.service.ts`:

```typescript
async deletePhotoFromCloudinary(publicId: string): Promise<void> {
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1')
    .update(paramsToSign + process.env.CLOUDINARY_API_SECRET).digest('hex');

  const formData = new URLSearchParams();
  formData.append('public_id', publicId);
  formData.append('timestamp', String(timestamp));
  formData.append('api_key', process.env.CLOUDINARY_API_KEY!);
  formData.append('signature', signature);

  // Fire-and-forget; log failures, don't block user action
  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/destroy`,
      { method: 'POST', body: formData },
    );
    if (!res.ok) console.warn(`[Cloudinary] delete ${publicId} failed:`, await res.text());
  } catch (err) {
    console.warn(`[Cloudinary] delete error ${publicId}:`, err);
  }
}
```

Call this in `update()` for dropped photos (diff old vs new) and in `remove()` for all photos.

## Mobile: upload utility

`apps/mobile/src/lib/cloudinary.ts`

- Caches signature for 50min (server signature lasts 1hr, refresh early)
- Uses **XHR not fetch** — `fetch()` on React Native doesn't expose upload progress events
- On 401 response, invalidate cache so next attempt refetches signature
- Prefers `eager[0].secure_url` (optimized variant) over raw `secure_url`

Form fields sent to Cloudinary (exact list, in any order):