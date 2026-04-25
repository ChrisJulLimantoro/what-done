import Anthropic from '@anthropic-ai/sdk';
import type { LLMRouter } from '../types.js';
import { LLMCallError } from '../cli/errors.js';

const MODEL = 'claude-sonnet-4-6';

export function createAnthropicRouter(apiKey: string): LLMRouter {
  const client = new Anthropic({ apiKey });

  return {
    provider: 'anthropic',
    model: MODEL,

    async complete(prompt: string, maxTokens: number): Promise<string> {
      const attempt = async () => {
        const msg = await client.messages.create({
          model: MODEL,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        });
        const block = msg.content.find((b) => b.type === 'text');
        if (!block || block.type !== 'text') {
          throw new Error('No text content in response');
        }
        return block.text;
      };

      try {
        return await attempt();
      } catch (err) {
        if (process.env.WDID_NO_RETRY) throw new LLMCallError('anthropic', String(err));
        await new Promise((r) => setTimeout(r, 1000));
        try {
          return await attempt();
        } catch (err2) {
          throw new LLMCallError('anthropic', String(err2));
        }
      }
    },
  };
}
