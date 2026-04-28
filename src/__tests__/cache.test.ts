import { hashContent } from '../store/cache.js';
import type { SummaryResult } from '../types.js';

describe('hashContent', () => {
  it('returns a 16-character hex string', () => {
    const hash = hashContent('some content');
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic', () => {
    const h1 = hashContent('hello world');
    const h2 = hashContent('hello world');
    expect(h1).toBe(h2);
  });

  it('differs for different inputs', () => {
    const h1 = hashContent('content A');
    const h2 = hashContent('content B');
    expect(h1).not.toBe(h2);
  });

  it('handles empty string', () => {
    const hash = hashContent('');
    expect(hash).toHaveLength(16);
  });
});

// Test parseSummaryResult separately (pure function, no file I/O)
import { parseSummaryResult } from '../llm/prompts.js';

describe('parseSummaryResult', () => {
  it('parses valid JSON', () => {
    const json = JSON.stringify({
      oneLiner: 'Did some work',
      narratives: ['Built feature X'],
      bullets: ['Added file A', 'Fixed bug B'],
      themes: ['feature', 'bugfix'],
    });
    const result = parseSummaryResult(json);
    expect(result['oneLiner']).toBe('Did some work');
    expect((result['bullets'] as string[]).length).toBe(2);
    expect((result['themes'] as string[])).toContain('feature');
  });

  it('strips markdown code fences', () => {
    const fenced = '```json\n{"oneLiner": "test", "narratives": [], "bullets": [], "themes": []}\n```';
    const result = parseSummaryResult(fenced);
    expect(result['oneLiner']).toBe('test');
  });

  it('falls back gracefully on invalid JSON', () => {
    const result = parseSummaryResult('not valid json at all');
    expect(result['oneLiner']).toBeTruthy();
    expect(Array.isArray(result['bullets'] ?? [])).toBe(true);
  });

  it('uses first line as fallback oneLiner', () => {
    const result = parseSummaryResult('Summary of work done today\nMore details here');
    expect(result['oneLiner']).toBe('Summary of work done today');
  });

  const validResult: SummaryResult = { oneLiner: 'test', narratives: [], bullets: [], themes: [] };
  void validResult;
});
