export interface DailySnapshot {
  version: 1;
  date: string;        // YYYY-MM-DD
  generatedAt: string; // ISO timestamp
  provider: string;
  model: string;
  summary: {
    oneLiner: string;
    narratives: string[];
    bullets: string[];
    themes: string[];
  };
  raw: {
    commits: string[];
    diffstat: string;
    sessions: string[];
  };
}

export interface WdidConfig {
  llm: {
    provider?: 'anthropic' | 'gemini' | 'openai';
    max_tokens_per_chunk: number;
    max_chunks: number;
    max_summary_tokens: number;
  };
  git: {
    auto_discover: boolean;
    repos: string[];
    exclude_patterns: string[];
    max_diff_tokens: number;
  };
  claude_code: {
    session_path: string;
    enabled: boolean;
  };
  output: {
    format: 'text' | 'markdown' | 'json';
  };
}

export type LLMProvider = 'anthropic' | 'gemini' | 'openai';

export interface LLMRouter {
  complete(prompt: string, maxTokens: number): Promise<string>;
  provider: LLMProvider;
  model: string;
}

export interface RawData {
  commits: string[];
  diffstat: string;
  diff: string;
  sessions: string[];
  repoPath: string;
  date: string;
}

export interface SummaryResult {
  oneLiner: string;
  narratives: string[];
  bullets: string[];
  themes: string[];
}

export interface Chunk {
  index: number;
  total: number;
  content: string;
  tokenEstimate: number;
}

export interface GitData {
  commits: string[];
  diffstat: string;
  diff: string;
  branch: string;
  commitCount: number;
}

export interface SessionEntry {
  timestamp: string;
  role: string;
  content: string;
  filePaths: string[];
}

export interface SessionData {
  sessionCount: number;
  durationMinutes: number;
  entries: SessionEntry[];
  summaries: string[];
}
