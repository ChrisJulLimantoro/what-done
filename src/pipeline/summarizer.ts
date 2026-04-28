import type { RawData, SummaryResult, WdidConfig, LLMRouter } from '../types.js';
import { applyPrivacyFilter } from './filter.js';
import { chunkText } from './chunker.js';
import {
  buildTodayPrompt,
  buildChunkSummaryPrompt,
  buildSynthesisPrompt,
  parseSummaryResult,
} from '../llm/prompts.js';
import { sectionsToSchema } from '../llm/schema.js';

const EMPTY_RESULT: SummaryResult = {
  oneLiner: 'No git activity or session data found for this date.',
  narratives: [],
  bullets: [],
  themes: [],
};

async function summarizeOne(
  rawData: RawData,
  config: WdidConfig,
  router: LLMRouter
): Promise<SummaryResult> {
  const { filtered: filteredDiff, redactedFiles } = applyPrivacyFilter(
    rawData.diff,
    config.git.exclude_patterns
  );

  if (redactedFiles.length > 0) {
    console.warn(`[whatdone] Redacted ${redactedFiles.length} file(s) matching privacy filters: ${redactedFiles.join(', ')}`);
  }

  const textBlob = buildTextBlob({ ...rawData, diff: filteredDiff });
  const chunks = chunkText(textBlob, config.llm.max_tokens_per_chunk, config.llm.max_chunks);
  const maxSummaryTokens = config.llm.max_summary_tokens;
  const sections = config.template.sections;
  const schema = sectionsToSchema(sections);

  if (chunks.length === 0) return EMPTY_RESULT;

  if (chunks.length === 1) {
    const prompt = buildTodayPrompt({ ...rawData, diff: filteredDiff }, sections);
    return router.completeStructured(prompt, schema, maxSummaryTokens);
  }

  // Multi-chunk: map phase
  const chunkSummaries: string[] = [];
  for (const chunk of chunks) {
    const prompt = buildChunkSummaryPrompt(chunk, rawData.date);
    const response = await router.complete(prompt, 300);
    chunkSummaries.push(response.trim());
  }

  // Reduce phase
  const synthesisPrompt = buildSynthesisPrompt(chunkSummaries, rawData.date, sections);
  return router.completeStructured(synthesisPrompt, schema, maxSummaryTokens);
}

export async function summarize(
  repoDataList: RawData[],
  config: WdidConfig,
  router: LLMRouter
): Promise<{ summary: SummaryResult; groups?: Record<string, SummaryResult> }> {
  if (repoDataList.length === 0) {
    return { summary: EMPTY_RESULT };
  }

  if (config.template.grouping === 'by_project' && repoDataList.length > 1) {
    // Fan out: one summary per repo in parallel
    const results = await Promise.all(
      repoDataList.map((rd) => summarizeOne(rd, config, router))
    );

    const groups: Record<string, SummaryResult> = {};
    for (let i = 0; i < repoDataList.length; i++) {
      const name = repoName(repoDataList[i].repoPath);
      groups[name] = results[i];
    }

    // Also build a flat merged summary for standup/weekly consumers
    const merged = mergeSummaries(results, config);
    return { summary: merged, groups };
  }

  // Flat mode: merge all repo data into one call
  const merged = mergeRawData(repoDataList);
  const summary = await summarizeOne(merged, config, router);
  return { summary };
}

function repoName(repoPath: string): string {
  return repoPath.split('/').filter(Boolean).pop() ?? repoPath;
}

function mergeRawData(list: RawData[]): RawData {
  return {
    commits: list.flatMap((r) => r.commits),
    diffstat: list.map((r) => r.diffstat).filter(Boolean).join('\n\n'),
    diff: list.map((r) => r.diff).filter(Boolean).join('\n\n'),
    sessions: list.flatMap((r) => r.sessions),
    repoPath: list[0]?.repoPath ?? '.',
    date: list[0]?.date ?? '',
  };
}

function mergeSummaries(results: SummaryResult[], config: WdidConfig): SummaryResult {
  const merged: SummaryResult = {};
  for (const section of config.template.sections) {
    if (section.type === 'string') {
      // Combine one-liners
      const lines = results
        .map((r) => String(r[section.name] ?? ''))
        .filter(Boolean);
      merged[section.name] = lines.join(' | ');
    } else {
      // Concatenate lists
      merged[section.name] = results.flatMap((r) => (r[section.name] as string[]) ?? []);
    }
  }
  return merged;
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

// Keep for backward-compat with tests
export { parseSummaryResult };
