import OpenAI from 'openai';
import type { LLMRouter, SummaryResult, StructuredSchema } from '../types.js';
import { LLMCallError } from '../cli/errors.js';
import { schemaToJsonSchemaObject, normalizeSummaryResult } from './schema.js';

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

    async completeStructured(prompt: string, schema: StructuredSchema, maxTokens: number): Promise<SummaryResult> {
      const jsonSchema = schemaToJsonSchemaObject(schema);

      const attempt = async () => {
        const response = await client.chat.completions.create({
          model: MODEL,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'summary',
              strict: true,
              schema: jsonSchema,
            },
          } as Parameters<typeof client.chat.completions.create>[0]['response_format'],
        });
        const text = response.choices[0]?.message?.content;
        if (!text) throw new Error('Empty response from OpenAI');
        return normalizeSummaryResult(JSON.parse(text), schema);
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
