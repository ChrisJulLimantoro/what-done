import type { WdidConfig } from '../types.js';

export const DEFAULT_CONFIG: WdidConfig = {
  llm: {
    provider: undefined,
    max_tokens_per_chunk: 3000,
    max_chunks: 10,
    max_summary_tokens: 500,
  },
  git: {
    auto_discover: true,
    repos: [],
    exclude_patterns: [
      '*.lock',
      'dist/*',
      'build/*',
      '*.sum',
      '*.min.js',
      '.env',
      '.env.*',
      '*secret*',
      '*credential*',
      '*password*',
      '*.key',
      '*.pem',
    ],
    max_diff_tokens: 4000,
  },
  claude_code: {
    session_path: '~/.claude/projects',
    enabled: true,
  },
  output: {
    format: 'text',
  },
};
