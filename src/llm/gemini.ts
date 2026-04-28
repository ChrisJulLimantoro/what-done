import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { LLMRouter, SummaryResult, StructuredSchema } from '../types.js';
import { LLMCallError } from '../cli/errors.js';
import { normalizeSummaryResult } from './schema.js';

const MODEL = 'gemini-2.5-flash-lite-preview';

export function createGeminiRouter(apiKey: string): LLMRouter {
  const genAI = new GoogleGenerativeAI(apiKey);

  return {
    provider: 'gemini',
    model: MODEL,

    async complete(prompt: string, maxTokens: number): Promise<string> {
      const attempt = async () => {
        const model = genAI.getGenerativeModel({
          model: MODEL,
          generationConfig: { maxOutputTokens: maxTokens },
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (!text) throw new Error('Empty response from Gemini');
        return text;
      };

      try {
        return await attempt();
      } catch (err) {
        if (process.env.WDID_NO_RETRY) throw new LLMCallError('gemini', String(err));
        await new Promise((r) => setTimeout(r, 1000));
        try {
          return await attempt();
        } catch (err2) {
          throw new LLMCallError('gemini', String(err2));
        }
      }
    },

    async completeStructured(prompt: string, schema: StructuredSchema, maxTokens: number): Promise<SummaryResult> {
      const attempt = async () => {
        const geminiProps: Record<string, object> = {};
        for (const [name, def] of Object.entries(schema.properties)) {
          if (def.type === 'array') {
            geminiProps[name] = { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: def.description };
          } else {
            geminiProps[name] = { type: SchemaType.STRING, description: def.description };
          }
        }

        const model = genAI.getGenerativeModel({
          model: MODEL,
          generationConfig: {
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.OBJECT,
              properties: geminiProps,
            },
          },
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (!text) throw new Error('Empty response from Gemini');
        return normalizeSummaryResult(JSON.parse(text), schema);
      };

      try {
        return await attempt();
      } catch (err) {
        if (process.env.WDID_NO_RETRY) throw new LLMCallError('gemini', String(err));
        await new Promise((r) => setTimeout(r, 1000));
        try {
          return await attempt();
        } catch (err2) {
          throw new LLMCallError('gemini', String(err2));
        }
      }
    },
  };
}
