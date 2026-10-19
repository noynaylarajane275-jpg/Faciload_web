import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ApiError } from '../errors/apiError.js';

/**
 * Profile-photo storage (tech-stack.md "File Storage": LOCAL in development,
 * S3-compatible (MinIO) in production). Phase 3 wires the LOCAL driver:
 * multipart uploads are validated (type + ~2MB size), written under
 * `<uploads root>/avatars/`, and served statically at /uploads/avatars/*.
 * `avatar_url` stores the public URL path so a production S3 driver can swap
 * the storage location without changing the DB shape or the client.
 */

/** Hard cap on profile photos (matching the UI hint "up to 2MB"). */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Allowed image types — validated by MIME and again by magic bytes below. */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function uploadsRoot(): string {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(process.cwd(), 'uploads');
}

export function avatarDir(): string {
  return path.join(uploadsRoot(), 'avatars');
}

/** Strip the public URL down to the on-disk basename (defensive: no traversal). */
function safeBasenameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = path.basename(url.replace(/\\/g, '/'));
  return /^avatar-[A-Za-z0-9-]+\.(jpg|png|webp)$/.test(base) ? base : null;
}

/**
 * Content-sniff the upload instead of trusting the client-declared MIME:
 * JPEG (FF D8 FF), PNG (89 50 4E 47) and RIFF…WEBP are accepted; anything
 * else (including HTML/SVG tricks) is rejected with a clean 400.
 */
export function detectImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Validate one uploaded file. Returns the canonical extension to store with.
 * Throws ApiError.badRequest with a user-facing message on any problem.
 */
export function validateAvatarUpload(file: {
  mimetype?: string;
  size?: number;
  buffer: Buffer;
}): string {
  if (!file.mimetype || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw ApiError.badRequest('Photo must be a JPG, PNG or WebP image', {
      code: 'INVALID_AVATAR_TYPE',
    });
  }
  if (typeof file.size === 'number' && file.size > MAX_AVATAR_BYTES) {
    throw ApiError.badRequest('Photo must be 2MB or smaller', { code: 'AVATAR_TOO_LARGE' });
  }
  const sniffed = detectImageType(file.buffer);
  if (!sniffed || sniffed !== file.mimetype) {
    throw ApiError.badRequest('Photo must be a JPG, PNG or WebP image', {
      code: 'INVALID_AVATAR_TYPE',
    });
  }
  return MIME_TO_EXT[file.mimetype];
}

/**
 * Persist the validated avatar bytes and return the public URL path.
 * Files are named `avatar-<userId>-<random>.<ext>` so repeat uploads never
 * collide and stale caches can't serve a previous photo under the same URL.
 */
export function saveAvatarFile(userId: string, ext: string, buffer: Buffer): string {
  if ((process.env.FILE_STORAGE ?? 'local') !== 'local') {
    throw ApiError.server('S3 avatar storage is not wired in this phase');
  }
  const dir = avatarDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `avatar-${userId}-${randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `/uploads/avatars/${name}`;
}

/** Best-effort delete of a previously stored avatar (never throws to the caller). */
export function deleteAvatarFile(url: string | null | undefined): void {
  const base = safeBasenameFromUrl(url);
  if (!base) return;
  try {
    fs.unlinkSync(path.join(avatarDir(), base));
  } catch {
    // Missing/locked file is not an upload failure — keep going.
  }
}
