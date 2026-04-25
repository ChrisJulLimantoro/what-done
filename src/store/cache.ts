import { createHash } from 'crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { CACHE_DIR } from '../config/loader.js';
import type { SummaryResult } from '../types.js';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  hash: string;
  result: SummaryResult;
  generatedAt: string;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function cachePath(hash: string): string {
  return join(CACHE_DIR, `${hash}.json`);
}

export function readCache(hash: string): SummaryResult | null {
  const path = cachePath(hash);
  if (!existsSync(path)) return null;

  try {
    const stat = statSync(path);
    const age = Date.now() - stat.mtimeMs;
    if (age > CACHE_TTL_MS) return null;

    const raw = readFileSync(path, 'utf-8');
    const entry = JSON.parse(raw) as CacheEntry;
    return entry.result;
  } catch {
    return null;
  }
}

export function writeCache(hash: string, result: SummaryResult): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = {
    hash,
    result,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(cachePath(hash), JSON.stringify(entry, null, 2), 'utf-8');
}
