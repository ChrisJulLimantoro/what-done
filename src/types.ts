export type SectionType = 'string' | 'list';

export interface TemplateSection {
  name: string;
  type: SectionType;
  description: string;
  required?: boolean;
}

export type GroupingMode = 'flat' | 'by_project';

export interface TemplateConfig {
  grouping: GroupingMode;
  sections: TemplateSection[];
}

export type SummaryResult = Record<string, string | string[]>;

export interface DailySnapshot {
  version: 2;
  date: string;        // YYYY-MM-DD
  generatedAt: string; // ISO timestamp
  provider: string;
  model: string;
  summary: SummaryResult;
  groups?: Record<string, SummaryResult>; // by_project grouping
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
  template: TemplateConfig;
}

export type LLMProvider = 'anthropic' | 'gemini' | 'openai';

export interface LLMRouter {
  complete(prompt: string, maxTokens: number): Promise<string>;
  completeStructured(prompt: string, schema: StructuredSchema, maxTokens: number): Promise<SummaryResult>;
  provider: LLMProvider;
  model: string;
}

export interface StructuredSchema {
  properties: Record<string, { type: 'string' | 'array'; description: string; required?: boolean }>;
}

export interface RawData {
  commits: string[];
  diffstat: string;
  diff: string;
  sessions: string[];
  repoPath: string;
  date: string;
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
