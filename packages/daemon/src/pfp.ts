import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { avatarStorageId } from '@teambridge/core';

export type DitherAlgorithm = 'floyd-steinberg' | 'atkinson' | 'bayer';

export type PfpOptions = {
  query?: string;
  size?: number;
  algorithm?: DitherAlgorithm;
  bayerLevel?: number;
  color?: { r: number; g: number; b: number };
  seed?: string;
};

export type PfpMeta = {
  algorithm: DitherAlgorithm;
  size: number;
  color: { r: number; g: number; b: number };
  source: 'pexels' | 'procedural';
  query?: string;
  sourceUrl?: string;
  imageUrl?: string;
  photographer?: string;
  alt?: string;
};

export const DEFAULT_PFP_QUERY = 'flower close up';
const DEFAULT_QUERY = DEFAULT_PFP_QUERY;
const DEFAULT_SIZE = 220;
const DEFAULT_ALGORITHM: DitherAlgorithm = 'bayer';
const DEFAULT_BAYER_LEVEL = 1;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: string): number {
  return parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16);
}

function srgbToLinear(c: number): number {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
}

export function randomColor(seed?: string): { r: number; g: number; b: number } {
  const rng = mulberry32(hashSeed(seed ?? randomUUID()));
  const h = rng() * 360;
  return hslToRgb(h, 0.65, 0.55);
}

function generateBayer(level: number): number[][] {
  let matrix = [[0, 2], [3, 1]];
  for (let l = 0; l < level; l += 1) {
    const n = matrix.length;
    const next: number[][] = Array.from({ length: n * 2 }, () => new Array(n * 2).fill(0));
    const offset = 4 * (n * n);
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const v = matrix[y][x];
        next[y][x] = v;
        next[y][x + n] = v + offset / 2;
        next[y + n][x] = v + (3 * offset) / 4;
        next[y + n][x + n] = v + offset / 4;
      }
    }
    matrix = next;
  }
  return matrix;
}

function rgbaToLinearLuminance(rgba: Buffer, width: number, height: number): Float32Array {
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    const r = srgbToLinear(rgba[p]);
    const g = srgbToLinear(rgba[p + 1]);
    const b = srgbToLinear(rgba[p + 2]);
    lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return lum;
}

function ditherFloydSteinberg(lum: Float32Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const old = lum[idx];
      const val = old >= 0.5 ? 1 : 0;
      out[idx] = val;
      const err = old - val;
      if (x + 1 < width) lum[idx + 1] += err * (7 / 16);
      if (x - 1 >= 0 && y + 1 < height) lum[idx + width - 1] += err * (3 / 16);
      if (y + 1 < height) lum[idx + width] += err * (5 / 16);
      if (x + 1 < width && y + 1 < height) lum[idx + width + 1] += err * (1 / 16);
    }
  }
  return out;
}

function ditherAtkinson(lum: Float32Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  const distribute = (idx: number, err: number) => {
    if (idx >= 0 && idx < lum.length) lum[idx] += err * (1 / 8);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const old = lum[idx];
      const val = old >= 0.5 ? 1 : 0;
      out[idx] = val;
      const err = old - val;
      distribute(idx + 1, err);
      distribute(idx + 2, err);
      distribute(idx + width - 1, err);
      distribute(idx + width, err);
      distribute(idx + width + 1, err);
      distribute(idx + 2 * width, err);
    }
  }
  return out;
}

function ditherBayer(lum: Float32Array, width: number, height: number, level: number): Uint8Array {
  const matrix = generateBayer(level);
  const n = matrix.length;
  const max = n * n;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const threshold = (matrix[y % n][x % n] + 0.5) / max;
      out[y * width + x] = lum[y * width + x] >= threshold ? 1 : 0;
    }
  }
  return out;
}

function maskToRgba(mask: Uint8Array, color: { r: number; g: number; b: number }): Buffer {
  const rgba = Buffer.alloc(mask.length * 4);
  for (let i = 0, p = 0; i < mask.length; i += 1, p += 4) {
    if (mask[i]) {
      rgba[p] = color.r;
      rgba[p + 1] = color.g;
      rgba[p + 2] = color.b;
      rgba[p + 3] = 255;
    } else {
      rgba[p] = 0;
      rgba[p + 1] = 0;
      rgba[p + 2] = 0;
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

type PexelsPhoto = {
  url?: string;
  src?: { medium?: string; large?: string; original?: string };
  photographer?: string;
  alt?: string;
};

type FetchedImage = {
  buffer: Buffer;
  source: 'pexels' | 'procedural';
  sourceUrl?: string;
  imageUrl?: string;
  photographer?: string;
  alt?: string;
};

async function fetchPexelsImage(query: string, seed: string): Promise<FetchedImage> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return { buffer: proceduralImage(seed), source: 'procedural' };
  }
  const rng = mulberry32(hashSeed(seed));
  const searchUrl = new URL('https://api.pexels.com/v1/search');
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('per_page', '30');
  searchUrl.searchParams.set('orientation', 'square');
  const searchRes = await fetch(searchUrl, { headers: { Authorization: apiKey } });
  if (!searchRes.ok) {
    return { buffer: proceduralImage(seed), source: 'procedural' };
  }
  const json = (await searchRes.json()) as { photos?: PexelsPhoto[] };
  const photos = json.photos ?? [];
  if (photos.length === 0) {
    return { buffer: proceduralImage(seed), source: 'procedural' };
  }
  const pick = photos[Math.floor(rng() * photos.length)];
  const imageUrl = pick.src?.large ?? pick.src?.medium ?? pick.src?.original;
  if (!imageUrl) {
    return { buffer: proceduralImage(seed), source: 'procedural' };
  }
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    return { buffer: proceduralImage(seed), source: 'procedural' };
  }
  const arrayBuffer = await imgRes.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    source: 'pexels',
    sourceUrl: pick.url,
    imageUrl: pick.src?.original ?? imageUrl,
    photographer: pick.photographer,
    alt: pick.alt
  };
}

function proceduralImage(seed: string): Buffer {
  const size = 256;
  const rng = mulberry32(hashSeed(seed));
  const cx = size / 2;
  const cy = size / 2;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const petals = 6;
      const angle = Math.atan2(dy, dx);
      const petal = 0.5 + 0.5 * Math.cos(angle * petals);
      const v = Math.max(0, 1 - r) * (0.4 + 0.6 * petal) + rng() * 0.15;
      const clamped = Math.min(1, Math.max(0, v));
      const c = Math.round(clamped * 255);
      const p = (y * size + x) * 4;
      rgba[p] = c;
      rgba[p + 1] = Math.round(c * 0.85);
      rgba[p + 2] = Math.round(c * 0.6);
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

export async function generatePfp(options: PfpOptions = {}): Promise<{ png: Buffer; meta: PfpMeta }> {
  const size = Math.max(8, Math.min(512, options.size ?? DEFAULT_SIZE));
  const algorithm = options.algorithm ?? DEFAULT_ALGORITHM;
  const query = options.query?.trim() || DEFAULT_QUERY;
  const seed = options.seed ?? randomUUID();
  const color = options.color ?? randomColor(seed);
  const bayerLevel = Math.max(0, Math.min(4, options.bayerLevel ?? DEFAULT_BAYER_LEVEL));

  const { buffer: sourceBuffer, source, sourceUrl, imageUrl, photographer, alt } = await fetchPexelsImage(query, seed);

  const isRawRgba = source === 'procedural';
  const resized = isRawRgba
    ? await sharp(sourceBuffer, { raw: { width: 256, height: 256, channels: 4 } })
        .resize(size, size, { fit: 'cover' })
        .ensureAlpha()
        .raw()
        .toBuffer()
    : await sharp(sourceBuffer)
        .resize(size, size, { fit: 'cover' })
        .ensureAlpha()
        .raw()
        .toBuffer();

  const lum = rgbaToLinearLuminance(resized, size, size);
  let mask: Uint8Array;
  if (algorithm === 'atkinson') mask = ditherAtkinson(lum, size, size);
  else if (algorithm === 'bayer') mask = ditherBayer(lum, size, size, bayerLevel);
  else mask = ditherFloydSteinberg(lum, size, size);

  const rgba = maskToRgba(mask, color);
  const png = await sharp(rgba, { raw: { width: size, height: size, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    png,
    meta: { algorithm, size, color, source, query, sourceUrl, imageUrl, photographer, alt }
  };
}

/** Detect avatars cached with a non-flower Pexels query (legacy init bug used display names). */
export function avatarNeedsRegeneration(meta: PfpMeta, expectedQuery = DEFAULT_QUERY): boolean {
  if (meta.query) {
    return meta.query !== expectedQuery;
  }
  if (meta.source === 'pexels' && meta.alt) {
    const alt = meta.alt.toLowerCase();
    if (/portrait|headshot|eyeglasses|\bbeard\b|arms crossed|\bman with|\bwoman with|\bperson with/.test(alt)) {
      return true;
    }
  }
  return false;
}

function avatarsDir(repoRoot: string): string {
  return join(repoRoot, '.teambridge', 'avatars');
}

function avatarPath(repoRoot: string, participantId: string): string {
  return join(avatarsDir(repoRoot), `${participantId}.png`);
}

function metaPath(repoRoot: string, participantId: string): string {
  return join(avatarsDir(repoRoot), `${participantId}.meta.json`);
}

export async function avatarExists(repoRoot: string, participantId: string): Promise<boolean> {
  try {
    await readFile(avatarPath(repoRoot, participantId));
    return true;
  } catch {
    return false;
  }
}

async function readAvatarMeta(repoRoot: string, avatarId: string): Promise<PfpMeta> {
  return readFile(metaPath(repoRoot, avatarId))
    .then((buffer) => JSON.parse(buffer.toString('utf8')) as PfpMeta)
    .catch(() => ({
      algorithm: DEFAULT_ALGORITHM,
      size: DEFAULT_SIZE,
      color: randomColor(avatarId),
      source: 'procedural' as const
    }));
}

async function writeAvatar(repoRoot: string, avatarId: string, png: Buffer, meta: PfpMeta): Promise<void> {
  await mkdir(avatarsDir(repoRoot), { recursive: true });
  await writeFile(avatarPath(repoRoot, avatarId), png);
  await writeFile(metaPath(repoRoot, avatarId), `${JSON.stringify(meta, null, 2)}\n`);
}

async function migrateLegacyPexelsAvatar(
  repoRoot: string,
  avatarId: string,
  legacyAvatarIds: string[]
): Promise<{ png: Buffer; meta: PfpMeta } | null> {
  for (const legacyId of legacyAvatarIds) {
    if (!(await avatarExists(repoRoot, legacyId))) continue;
    const meta = await readAvatarMeta(repoRoot, legacyId);
    if (meta.source !== 'pexels') continue;
    if (avatarNeedsRegeneration(meta, DEFAULT_QUERY)) continue;
    const png = await readFile(avatarPath(repoRoot, legacyId));
    const normalizedMeta = { ...meta, query: meta.query ?? DEFAULT_QUERY };
    await writeAvatar(repoRoot, avatarId, png, normalizedMeta);
    return { png, meta: normalizedMeta };
  }
  return null;
}

export async function getAvatarVersion(repoRoot: string, avatarId: string): Promise<string | undefined> {
  try {
    const pngStat = await stat(avatarPath(repoRoot, avatarId));
    return String(Math.floor(pngStat.mtimeMs));
  } catch {
    return undefined;
  }
}

export async function getAvatarVersionForDisplayName(
  repoRoot: string,
  displayName: string
): Promise<string | undefined> {
  return getAvatarVersion(repoRoot, avatarStorageId(displayName));
}

function canUsePexels(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

export async function getOrGenerateAvatar(
  repoRoot: string,
  avatarId: string,
  options: PfpOptions = {},
  legacyAvatarIds: string[] = []
): Promise<{ png: Buffer; meta: PfpMeta }> {
  const effectiveQuery = options.query?.trim() || DEFAULT_QUERY;
  const existing = await readFile(avatarPath(repoRoot, avatarId)).then((buffer) => buffer).catch(() => null);
  if (existing) {
    const meta = await readAvatarMeta(repoRoot, avatarId);
    if (avatarNeedsRegeneration(meta, effectiveQuery)) {
      await rm(avatarPath(repoRoot, avatarId), { force: true });
      await rm(metaPath(repoRoot, avatarId), { force: true });
    } else if (meta.source === 'pexels') {
      return { png: existing, meta };
    } else {
      const migrated = await migrateLegacyPexelsAvatar(repoRoot, avatarId, legacyAvatarIds);
      if (migrated) return migrated;

      if (meta.source === 'procedural' && canUsePexels()) {
        await rm(avatarPath(repoRoot, avatarId), { force: true });
        await rm(metaPath(repoRoot, avatarId), { force: true });
      } else {
        return { png: existing, meta };
      }
    }
  } else {
    const migrated = await migrateLegacyPexelsAvatar(repoRoot, avatarId, legacyAvatarIds);
    if (migrated) return migrated;
  }

  const { png, meta } = await generatePfp({ seed: avatarId, query: effectiveQuery, ...options });
  await writeAvatar(repoRoot, avatarId, png, meta);
  return { png, meta };
}

export async function regenerateAvatar(
  repoRoot: string,
  participantId: string,
  options: PfpOptions = {}
): Promise<{ png: Buffer; meta: PfpMeta }> {
  await rm(avatarPath(repoRoot, participantId), { force: true });
  await rm(metaPath(repoRoot, participantId), { force: true });
  const { png, meta } = await generatePfp({ seed: `${participantId}:${Date.now()}`, ...options });
  await mkdir(avatarsDir(repoRoot), { recursive: true });
  await writeFile(avatarPath(repoRoot, participantId), png);
  await writeFile(metaPath(repoRoot, participantId), `${JSON.stringify(meta, null, 2)}\n`);
  return { png, meta };
}
