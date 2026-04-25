import { applyPrivacyFilter } from '../pipeline/filter.js';

const SAMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index abc..def 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
+const x = 1;
 export {};

diff --git a/.env b/.env
index 000..111 100644
--- a/.env
+++ b/.env
@@ -0,0 +1,2 @@
+SECRET_KEY=abc123
+DATABASE_URL=postgres://...

diff --git a/src/utils.ts b/src/utils.ts
index 222..333 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,2 +1,3 @@
+export const helper = () => {};
`;

describe('applyPrivacyFilter', () => {
  it('passes through diff unchanged when no patterns', () => {
    const { filtered, redactedFiles } = applyPrivacyFilter(SAMPLE_DIFF, []);
    expect(filtered).toBe(SAMPLE_DIFF);
    expect(redactedFiles).toHaveLength(0);
  });

  it('removes .env hunk from diff', () => {
    const { filtered, redactedFiles } = applyPrivacyFilter(SAMPLE_DIFF, ['.env', '.env.*']);
    expect(filtered).not.toContain('SECRET_KEY');
    expect(filtered).not.toContain('DATABASE_URL');
    expect(redactedFiles).toContain('.env');
  });

  it('preserves non-matching files', () => {
    const { filtered } = applyPrivacyFilter(SAMPLE_DIFF, ['.env', '.env.*']);
    expect(filtered).toContain('src/app.ts');
    expect(filtered).toContain('src/utils.ts');
    expect(filtered).toContain('export const helper');
  });

  it('adds REDACTED marker for excluded files', () => {
    const { filtered } = applyPrivacyFilter(SAMPLE_DIFF, ['.env']);
    expect(filtered).toContain('[REDACTED');
  });

  it('handles *secret* glob pattern', () => {
    const diff = `diff --git a/my-secret-keys.json b/my-secret-keys.json\n+{"key": "value"}`;
    const { filtered, redactedFiles } = applyPrivacyFilter(diff, ['*secret*']);
    expect(filtered).not.toContain('key": "value"');
    expect(redactedFiles).toContain('my-secret-keys.json');
  });

  it('returns empty redactedFiles when nothing matches', () => {
    const { redactedFiles } = applyPrivacyFilter(SAMPLE_DIFF, ['*.lock', 'dist/*']);
    expect(redactedFiles).toHaveLength(0);
  });

  it('handles empty diff gracefully', () => {
    const { filtered, redactedFiles } = applyPrivacyFilter('', ['*.env']);
    expect(filtered).toBe('');
    expect(redactedFiles).toHaveLength(0);
  });
});
