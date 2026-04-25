import type { LLMRouter, WdidConfig, LLMProvider } from '../types.js';
import { NoAPIKeyError, ConfigError } from '../cli/errors.js';
import { createAnthropicRouter } from './anthropic.js';
import { createGeminiRouter } from './gemini.js';
import { createOpenAIRouter } from './openai.js';

const PROVIDERS: LLMProvider[] = ['anthropic', 'gemini', 'openai'];

const ENV_KEYS: Record<LLMProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
};

function getApiKey(provider: LLMProvider): string | undefined {
  return process.env[ENV_KEYS[provider]];
}

function createProvider(provider: LLMProvider, apiKey: string): LLMRouter {
  switch (provider) {
    case 'anthropic': return createAnthropicRouter(apiKey);
    case 'gemini': return createGeminiRouter(apiKey);
    case 'openai': return createOpenAIRouter(apiKey);
  }
}

export function createRouter(config: WdidConfig, providerOverride?: string): LLMRouter {
  const requestedProvider = (providerOverride ?? config.llm.provider) as LLMProvider | undefined;

  if (requestedProvider) {
    if (!PROVIDERS.includes(requestedProvider)) {
      throw new ConfigError(
        `Unknown provider "${requestedProvider}". Valid options: ${PROVIDERS.join(', ')}`
      );
    }
    const apiKey = getApiKey(requestedProvider);
    if (!apiKey) {
      throw new ConfigError(
        `Provider "${requestedProvider}" requires ${ENV_KEYS[requestedProvider]} to be set.`
      );
    }
    return createProvider(requestedProvider, apiKey);
  }

  // Auto-detect from environment
  for (const provider of PROVIDERS) {
    const apiKey = getApiKey(provider);
    if (apiKey) {
      return createProvider(provider, apiKey);
    }
  }

  throw new NoAPIKeyError();
}

export function detectProvider(config: WdidConfig): string {
  try {
    const router = createRouter(config);
    return `${router.provider} (${router.model})`;
  } catch {
    return 'none detected — set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY';
  }
}
