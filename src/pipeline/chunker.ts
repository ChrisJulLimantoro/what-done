import type { Chunk } from '../types.js';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks respecting token limits.
 * Splits first on "diff --git" file boundaries, then on blank lines.
 * Never splits mid-line. Respects maxChunks cap.
 */
export function chunkText(
  text: string,
  maxTokensPerChunk: number,
  maxChunks: number
): Chunk[] {
  if (!text.trim()) return [];

  // Split on file diff boundaries first
  const sections = text.split(/(?=\ndiff --git )/);

  const rawChunks: string[] = [];
  let current = '';

  for (const section of sections) {
    const combined = current + section;
    if (estimateTokens(combined) > maxTokensPerChunk && current.length > 0) {
      // Current chunk is full — try to sub-split the incoming section
      rawChunks.push(current.trim());
      current = section;
    } else {
      current = combined;
    }

    // If even a single section is too large, split it on blank lines
    if (estimateTokens(current) > maxTokensPerChunk) {
      const subChunks = splitOnBlankLines(current, maxTokensPerChunk);
      for (let i = 0; i < subChunks.length - 1; i++) {
        rawChunks.push(subChunks[i]);
      }
      current = subChunks[subChunks.length - 1] ?? '';
    }
  }

  if (current.trim()) {
    rawChunks.push(current.trim());
  }

  // Apply maxChunks cap
  let truncated = false;
  let chunks = rawChunks;
  if (chunks.length > maxChunks) {
    chunks = rawChunks.slice(0, maxChunks);
    truncated = true;
  }

  if (truncated) {
    chunks[chunks.length - 1] += '\n\n[TRUNCATED — exceeded max chunks limit]';
  }

  const total = chunks.length;
  return chunks.map((content, index) => ({
    index: index + 1,
    total,
    content,
    tokenEstimate: estimateTokens(content),
  }));
}

function splitOnBlankLines(text: string, maxTokensPerChunk: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const result: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const combined = current ? current + '\n\n' + para : para;
    if (estimateTokens(combined) > maxTokensPerChunk && current.length > 0) {
      result.push(current);
      current = para;
    } else {
      current = combined;
    }
  }

  if (current) result.push(current);
  return result.length > 0 ? result : [text];
}
