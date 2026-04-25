import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import TOML from '@iarna/toml';
import { DEFAULT_CONFIG } from './defaults.js';
import type { WdidConfig } from '../types.js';
import { ConfigError } from '../cli/errors.js';

export const CONFIG_DIR = join(homedir(), '.whatdone');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.toml');
export const SNAPSHOTS_DIR = join(CONFIG_DIR, 'snapshots');
export const CACHE_DIR = join(CONFIG_DIR, 'cache');

export function loadConfig(): WdidConfig {
  if (!existsSync(CONFIG_PATH)) {
    return structuredClone(DEFAULT_CONFIG);
  }

  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, 'utf-8');
  } catch (err) {
    throw new ConfigError(`Cannot read config file at ${CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = TOML.parse(raw);
  } catch (err) {
    throw new ConfigError(`Invalid TOML in config file: ${err instanceof Error ? err.message : String(err)}`);
  }

  return deepMerge(DEFAULT_CONFIG, parsed as Partial<WdidConfig>);
}

export function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2));
  }
  if (p === '~') {
    return homedir();
  }
  return p;
}

export function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });
}

export function writeConfig(config: WdidConfig): void {
  ensureConfigDir();
  const toml = TOML.stringify(config as unknown as TOML.JsonMap);
  writeFileSync(CONFIG_PATH, toml, 'utf-8');
}

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = structuredClone(base) as Record<string, unknown>;
  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideVal = override[key];
    const baseVal = base[key];
    if (
      overrideVal !== null &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key as string] = deepMerge(
        baseVal as object,
        overrideVal as Partial<object>
      );
    } else if (overrideVal !== undefined) {
      result[key as string] = overrideVal;
    }
  }
  return result as T;
}
