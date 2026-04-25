import type { RawData, SummaryResult, WdidConfig, LLMRouter } from '../types.js';
import { applyPrivacyFilter } from './filter.js';
import { chunkText } from './chunker.js';
import {
  buildTodayPrompt,
  buildChunkSummaryPrompt,
  buildSynthesisPrompt,
  parseSummaryResult,
} from '../llm/prompts.js';

export async function summarize(
  rawData: RawData,
  config: WdidConfig,
  router: LLMRouter
): Promise<SummaryResult> {
  // Apply privacy filter to the diff
  const { filtered: filteredDiff, redactedFiles } = applyPrivacyFilter(
    rawData.diff,
    config.git.exclude_patterns
  );

  if (redactedFiles.length > 0) {
    console.warn(`[whatdone] Redacted ${redactedFiles.length} file(s) matching privacy filters: ${redactedFiles.join(', ')}`);
  }

  // Build the full text blob for chunking
  const textBlob = buildTextBlob({ ...rawData, diff: filteredDiff });

  // Chunk it
  const chunks = chunkText(
    textBlob,
    config.llm.max_tokens_per_chunk,
    config.llm.max_chunks
  );

  const maxSummaryTokens = config.llm.max_summary_tokens;

  if (chunks.length === 0) {
    // No meaningful content — return a minimal result
    return {
      oneLiner: 'No git activity or session data found for this date.',
      narratives: [],
      bullets: [],
      themes: [],
    };
  }

  if (chunks.length === 1) {
    // Single chunk — direct call
    const prompt = buildTodayPrompt({ ...rawData, diff: filteredDiff });
    const response = await router.complete(prompt, maxSummaryTokens);
    return parseSummaryResult(response);
  }

  // Multi-chunk: map phase — one mini-summary per chunk
  const chunkSummaries: string[] = [];
  for (const chunk of chunks) {
    const prompt = buildChunkSummaryPrompt(chunk, rawData.date);
    const response = await router.complete(prompt, 300);
    chunkSummaries.push(response.trim());
  }

  // Reduce phase — synthesize chunk summaries into final result
  const synthesisPrompt = buildSynthesisPrompt(chunkSummaries, rawData.date);
  const finalResponse = await router.complete(synthesisPrompt, maxSummaryTokens);
  return parseSummaryResult(finalResponse);
}

function buildTextBlob(rawData: RawData): string {
  const parts: string[] = [];

  if (rawData.commits.length > 0) {
    parts.push(`## Commits (${rawData.commits.length})\n${rawData.commits.join('\n')}`);
  }

  if (rawData.diffstat) {
    parts.push(`## Diff Summary\n${rawData.diffstat}`);
  }

  if (rawData.diff) {
    parts.push(`## Code Changes\n${rawData.diff}`);
  }

  if (rawData.sessions.length > 0) {
    parts.push(`## Claude Code Sessions\n${rawData.sessions.join('\n\n')}`);
  }

  return parts.join('\n\n');
}
