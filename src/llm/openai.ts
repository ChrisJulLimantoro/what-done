import OpenAI from 'openai';
import type { LLMRouter } from '../types.js';
import { LLMCallError } from '../cli/errors.js';

const MODEL = 'gpt-4.1';

export function createOpenAIRouter(apiKey: string): LLMRouter {
  const client = new OpenAI({ apiKey });

  return {
    provider: 'openai',
    model: MODEL,

    async complete(prompt: string, maxTokens: number): Promise<string> {
      const attempt = async () => {
        const response = await client.chat.completions.create({
          model: MODEL,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        });
        const text = response.choices[0]?.message?.content;
        if (!text) throw new Error('Empty response from OpenAI');
        return text;
      };

      try {
        return await attempt();
      } catch (err) {
        if (process.env.WDID_NO_RETRY) throw new LLMCallError('openai', String(err));
        await new Promise((r) => setTimeout(r, 1000));
        try {
          return await attempt();
        } catch (err2) {
          throw new LLMCallError('openai', String(err2));
        }
      }
    },
  };
}
