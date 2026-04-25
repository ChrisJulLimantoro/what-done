import { chunkText } from '../pipeline/chunker.js';

describe('chunkText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('', 3000, 10)).toEqual([]);
    expect(chunkText('   ', 3000, 10)).toEqual([]);
  });

  it('returns a single chunk for small input', () => {
    const text = 'This is a small commit message.\n\nSome code changes here.';
    const chunks = chunkText(text, 3000, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(1);
    expect(chunks[0].total).toBe(1);
    expect(chunks[0].content).toContain('small commit');
  });

  it('splits on diff boundaries', () => {
    // Build two separate diff sections that together exceed chunk limit
    const section1 = 'diff --git a/file1.ts b/file1.ts\n' + 'x'.repeat(4000);
    const section2 = '\ndiff --git a/file2.ts b/file2.ts\n' + 'y'.repeat(4000);
    const text = section1 + section2;

    const chunks = chunkText(text, 2000, 10);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be within token limit (approximately)
    for (const chunk of chunks) {
      expect(chunk.tokenEstimate).toBeLessThanOrEqual(2200); // small tolerance
    }
  });

  it('caps at maxChunks and appends truncation notice', () => {
    // Many diff sections
    let text = '';
    for (let i = 0; i < 15; i++) {
      text += `\ndiff --git a/file${i}.ts b/file${i}.ts\n` + 'x'.repeat(2000);
    }

    const chunks = chunkText(text, 1000, 5);
    expect(chunks).toHaveLength(5);
    expect(chunks[4].content).toContain('TRUNCATED');
  });

  it('sets correct index and total on each chunk', () => {
    let text = '';
    for (let i = 0; i < 3; i++) {
      text += `\ndiff --git a/file${i}.ts b/file${i}.ts\n` + 'x'.repeat(3000);
    }
    const chunks = chunkText(text, 1500, 10);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i + 1);
      expect(chunks[i].total).toBe(chunks.length);
    }
  });
});
