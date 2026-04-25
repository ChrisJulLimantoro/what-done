import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { SNAPSHOTS_DIR } from '../config/loader.js';
import type { DailySnapshot } from '../types.js';

function snapshotDir(date: string): string {
  return join(SNAPSHOTS_DIR, date);
}

function nextVersionPath(date: string): string {
  const dir = snapshotDir(date);
  if (!existsSync(dir)) return join(dir, 'v1.json');

  const existing = readdirSync(dir)
    .filter((f) => /^v\d+\.json$/.test(f))
    .map((f) => parseInt(f.slice(1, -5), 10))
    .sort((a, b) => b - a);

  const nextVersion = (existing[0] ?? 0) + 1;
  return join(dir, `v${nextVersion}.json`);
}

export function saveSnapshot(snapshot: DailySnapshot): string {
  const dir = snapshotDir(snapshot.date);
  mkdirSync(dir, { recursive: true });
  const path = nextVersionPath(snapshot.date);
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf-8');
  return path;
}

export function loadSnapshot(date: string): DailySnapshot | null {
  const dir = snapshotDir(date);
  if (!existsSync(dir)) return null;

  // Load the latest version
  const files = readdirSync(dir)
    .filter((f) => /^v\d+\.json$/.test(f))
    .sort((a, b) => {
      const av = parseInt(a.slice(1, -5), 10);
      const bv = parseInt(b.slice(1, -5), 10);
      return bv - av; // descending — latest first
    });

  if (files.length === 0) return null;

  try {
    const raw = readFileSync(join(dir, files[0]), 'utf-8');
    return JSON.parse(raw) as DailySnapshot;
  } catch {
    return null;
  }
}

export function loadSnapshotsRange(startDate: string, endDate: string): DailySnapshot[] {
  const snapshots: DailySnapshot[] = [];

  // Enumerate dates in range
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const snap = loadSnapshot(dateStr);
    if (snap) snapshots.push(snap);
  }

  return snapshots.sort((a, b) => a.date.localeCompare(b.date));
}
