import type { RawData, SummaryResult, DailySnapshot, Chunk, TemplateSection } from '../types.js';

function buildSchemaString(sections: TemplateSection[]): string {
  const fields = sections.map((s) => {
    if (s.type === 'list') {
      return `  "${s.name}": ["..."]  // ${s.description}`;
    }
    return `  "${s.name}": "..."  // ${s.description}`;
  });
  return `{\n${fields.join(',\n')}\n}`;
}

export function buildTodayPrompt(rawData: RawData, sections?: TemplateSection[]): string {
  const parts: string[] = [];

  parts.push(`You are a helpful assistant that summarizes a software developer's daily work.`);
  parts.push(`Analyze the following git activity and Claude Code session data for ${rawData.date}.`);
  parts.push(``);

  if (sections && sections.length > 0) {
    parts.push(`Respond with ONLY valid JSON. No markdown, no code fences, no explanation.`);
    parts.push(`Return a JSON object matching this schema:`);
    parts.push(buildSchemaString(sections));
  } else {
    parts.push(`Respond with ONLY valid JSON. No markdown, no code fences, no explanation.`);
    parts.push(`Return a JSON object with: oneLiner (string), narratives (array), bullets (array), themes (array).`);
  }
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
    parts.push(rawData.diff.slice(0, 12000));
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

export function buildSynthesisPrompt(chunkSummaries: string[], date: string, sections?: TemplateSection[]): string {
  const parts: string[] = [];
  parts.push(`You are a helpful assistant that summarizes a software developer's daily work.`);
  parts.push(`Synthesize the following partial summaries of code changes made on ${date}.`);
  parts.push(``);

  if (sections && sections.length > 0) {
    parts.push(`Respond with ONLY valid JSON. No markdown, no code fences, no explanation.`);
    parts.push(`Return a JSON object matching this schema:`);
    parts.push(buildSchemaString(sections));
  } else {
    parts.push(`Respond with ONLY valid JSON. No markdown, no code fences, no explanation.`);
    parts.push(`Return a JSON object with: oneLiner (string), narratives (array), bullets (array), themes (array).`);
  }
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
  const oneLiner = String(snapshot.summary['oneLiner'] ?? '');
  const bullets = (snapshot.summary['bullets'] ?? []) as string[];
  const themes = (snapshot.summary['themes'] ?? []) as string[];

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
    oneLiner,
    ``,
    `## Details`,
    bullets.map((b) => `- ${b}`).join('\n'),
    ``,
    `## Themes`,
    themes.join(', '),
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
    const oneLiner = String(snap.summary['oneLiner'] ?? '');
    const bullets = (snap.summary['bullets'] ?? []) as string[];
    parts.push(oneLiner);
    if (bullets.length > 0) {
      parts.push(bullets.map((b) => `- ${b}`).join('\n'));
    }
    parts.push('');
  }

  return parts.join('\n');
}

export function parseSummaryResult(response: string): SummaryResult {
  let text = response.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const result: SummaryResult = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string') {
        result[key] = val;
      } else if (Array.isArray(val)) {
        result[key] = val.map(String);
      }
    }
    return result;
  } catch {
    return {
      oneLiner: text.split('\n')[0]?.slice(0, 200) ?? 'Summary unavailable.',
      narratives: [],
      bullets: [],
      themes: [],
    };
  }
}
