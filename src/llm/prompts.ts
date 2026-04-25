import type { RawData, SummaryResult, DailySnapshot, Chunk } from '../types.js';

const SUMMARY_SCHEMA = `{
  "oneLiner": "one sentence summary of the day",
  "narratives": ["2-4 bullet points describing major work streams"],
  "bullets": ["6-10 granular bullet points of specific changes"],
  "themes": ["2-4 theme keywords like 'refactoring', 'bug fixes', 'new feature'"]
}`;

function jsonOnlyInstruction(): string {
  return 'Respond with ONLY valid JSON. No markdown, no code fences, no explanation.';
}

export function buildTodayPrompt(rawData: RawData): string {
  const parts: string[] = [];

  parts.push(`You are a helpful assistant that summarizes a software developer's daily work.`);
  parts.push(`Analyze the following git activity and Claude Code session data for ${rawData.date}.`);
  parts.push(``);
  parts.push(`${jsonOnlyInstruction()} Return a JSON object matching this schema:`);
  parts.push(SUMMARY_SCHEMA);
  parts.push('');

  if (rawData.commits.length > 0) {
    parts.push(`## Commits`);
    parts.push(rawData.commits.join('\n'));
    parts.push('');
  }

  if (rawData.diffstat) {
    parts.push(`## Changes Summary`);
    parts.push(rawData.diffstat);
    parts.push('');
  }

  if (rawData.diff) {
    parts.push(`## Code Diff`);
    parts.push(rawData.diff.slice(0, 12000)); // safety cap
    parts.push('');
  }

  if (rawData.sessions.length > 0) {
    parts.push(`## Claude Code Sessions`);
    parts.push(rawData.sessions.join('\n\n'));
    parts.push('');
  }

  return parts.join('\n');
}

export function buildChunkSummaryPrompt(chunk: Chunk, date: string): string {
  return [
    `Summarize the following code changes (chunk ${chunk.index} of ${chunk.total}) from ${date}.`,
    `Write 2-4 concise bullet points describing what changed. Plain text, no JSON needed.`,
    ``,
    chunk.content,
  ].join('\n');
}

export function buildSynthesisPrompt(chunkSummaries: string[], date: string): string {
  const parts: string[] = [];
  parts.push(`You are a helpful assistant that summarizes a software developer's daily work.`);
  parts.push(`Synthesize the following partial summaries of code changes made on ${date}.`);
  parts.push(``);
  parts.push(`${jsonOnlyInstruction()} Return a JSON object matching this schema:`);
  parts.push(SUMMARY_SCHEMA);
  parts.push('');
  parts.push('## Partial Summaries');
  chunkSummaries.forEach((s, i) => {
    parts.push(`### Part ${i + 1}`);
    parts.push(s);
    parts.push('');
  });
  return parts.join('\n');
}

export function buildStandupPrompt(snapshot: DailySnapshot): string {
  return [
    `Convert the following work summary into a concise standup update.`,
    `Format it as:`,
    `**Yesterday:** [what was done]`,
    `**Today:** [what will be continued or next steps]`,
    `**Blockers:** [any blockers, or "None"]`,
    ``,
    `Keep it brief — 2-3 sentences per section. Plain text output.`,
    ``,
    `## Summary`,
    snapshot.summary.oneLiner,
    ``,
    `## Details`,
    snapshot.summary.bullets.map((b) => `- ${b}`).join('\n'),
    ``,
    `## Themes`,
    snapshot.summary.themes.join(', '),
  ].join('\n');
}

export function buildWeeklyPrompt(snapshots: DailySnapshot[]): string {
  const parts: string[] = [];
  parts.push(`Summarize the following daily work summaries into a cohesive weekly report.`);
  parts.push(`Identify major accomplishments, recurring themes, and progress made.`);
  parts.push(`Write in plain text, 3-5 paragraphs. No JSON needed.`);
  parts.push('');

  for (const snap of snapshots) {
    parts.push(`### ${snap.date}`);
    parts.push(snap.summary.oneLiner);
    if (snap.summary.bullets.length > 0) {
      parts.push(snap.summary.bullets.map((b) => `- ${b}`).join('\n'));
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Parse an LLM response into a SummaryResult.
 * Handles raw JSON and markdown-wrapped JSON. Falls back gracefully.
 */
export function parseSummaryResult(response: string): SummaryResult {
  const fallback: SummaryResult = {
    oneLiner: response.trim().split('\n')[0]?.slice(0, 200) ?? 'Summary unavailable.',
    narratives: [],
    bullets: [],
    themes: [],
  };

  let text = response.trim();

  // Strip markdown code fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(text) as Partial<SummaryResult>;
    return {
      oneLiner: typeof parsed.oneLiner === 'string' ? parsed.oneLiner : fallback.oneLiner,
      narratives: Array.isArray(parsed.narratives) ? parsed.narratives.map(String) : [],
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map(String) : [],
      themes: Array.isArray(parsed.themes) ? parsed.themes.map(String) : [],
    };
  } catch {
    return fallback;
  }
}
