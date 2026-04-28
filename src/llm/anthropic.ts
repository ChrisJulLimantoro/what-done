import Anthropic from '@anthropic-ai/sdk';
import type { LLMRouter, SummaryResult, StructuredSchema } from '../types.js';
import { LLMCallError } from '../cli/errors.js';
import { schemaToJsonSchemaObject, normalizeSummaryResult } from './schema.js';

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

    async completeStructured(prompt: string, schema: StructuredSchema, maxTokens: number): Promise<SummaryResult> {
      const jsonSchema = schemaToJsonSchemaObject(schema);

      const attempt = async () => {
        const msg = await client.messages.create({
          model: MODEL,
          max_tokens: maxTokens,
          tools: [
            {
              name: 'emit_summary',
              description: 'Emit the structured summary of the developer\'s work',
              input_schema: jsonSchema as Anthropic.Tool['input_schema'],
            },
          ],
          tool_choice: { type: 'tool', name: 'emit_summary' },
          messages: [{ role: 'user', content: prompt }],
        });

        const toolBlock = msg.content.find((b) => b.type === 'tool_use');
        if (!toolBlock || toolBlock.type !== 'tool_use') {
          throw new Error('No tool_use block in Anthropic response');
        }
        return normalizeSummaryResult(toolBlock.input, schema);
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
