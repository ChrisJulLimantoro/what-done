export class WdidError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'WdidError';
  }
}

export class NoAPIKeyError extends WdidError {
  constructor() {
    super(
      'No LLM API key found. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY.',
      'NO_API_KEY'
    );
    this.name = 'NoAPIKeyError';
  }
}

export class NoCommitsError extends WdidError {
  constructor(date: string, repoPath: string) {
    super(`No commits found for ${date} in ${repoPath}`, 'NO_COMMITS');
    this.name = 'NoCommitsError';
  }
}

export class LLMCallError extends WdidError {
  constructor(provider: string, cause: string) {
    super(`LLM call failed (${provider}): ${cause}`, 'LLM_CALL_FAILED');
    this.name = 'LLMCallError';
  }
}

export class ConfigError extends WdidError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class NotAGitRepoError extends WdidError {
  constructor(path: string) {
    super(`Not a git repository: ${path}`, 'NOT_GIT_REPO');
    this.name = 'NotAGitRepoError';
  }
}
