import { Command } from 'commander';
import { createInterface } from 'readline';
import { existsSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig, CONFIG_PATH, writeConfig, expandPath } from '../config/loader.js';
import { detectProvider } from '../llm/router.js';
import { renderConfig, renderInfo, renderError, renderWarning } from './renderer.js';
import type { WdidConfig } from '../types.js';

const PROVIDER_KEY_NAMES: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  gemini:    'GEMINI_API_KEY',
  openai:    'OPENAI_API_KEY',
};

const PROVIDER_KEY_URLS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  gemini:    'https://aistudio.google.com/app/apikey',
  openai:    'https://platform.openai.com/api-keys',
};

async function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/** Detect which shell profile file exists, in preference order */
function detectShellProfile(): string | null {
  const home = homedir();
  const candidates = [
    join(home, '.zshrc'),
    join(home, '.bashrc'),
    join(home, '.bash_profile'),
    join(home, '.profile'),
  ];
  return candidates.find(existsSync) ?? null;
}

/** Check if the key is already present in the shell profile */
function isKeyInProfile(profilePath: string, keyName: string): boolean {
  try {
    return readFileSync(profilePath, 'utf-8').includes(keyName);
  } catch {
    return false;
  }
}

/** Append export line to the shell profile */
function writeKeyToProfile(profilePath: string, keyName: string, keyValue: string): void {
  const line = `\n# Added by wdid\nexport ${keyName}="${keyValue}"\n`;
  appendFileSync(profilePath, line, 'utf-8');
}

async function setupApiKey(
  rl: ReturnType<typeof createInterface>,
  providerName: string
): Promise<void> {
  const keyName = PROVIDER_KEY_NAMES[providerName];
  const keyUrl  = PROVIDER_KEY_URLS[providerName];

  // Already set in environment — nothing to do
  if (process.env[keyName]) {
    console.log(`  ✓ ${keyName} already set in your environment\n`);
    return;
  }

  console.log(`\n  No ${keyName} found in your environment.`);
  console.log(`  Get your API key at: ${keyUrl}\n`);

  const keyValue = await prompt(rl, `  Paste your ${providerName} API key: `);
  if (!keyValue.trim()) {
    renderWarning(`Skipping API key setup — you can add ${keyName} to your shell profile later.`);
    return;
  }

  const profilePath = detectShellProfile();

  if (!profilePath) {
    console.log(`\n  Could not detect a shell profile. Add this line manually:\n`);
    console.log(`    export ${keyName}="${keyValue.trim()}"\n`);
    return;
  }

  // Already in the profile from a previous run
  if (isKeyInProfile(profilePath, keyName)) {
    console.log(`  ✓ ${keyName} already exists in ${profilePath}\n`);
    return;
  }

  console.log(`\n  Where to save it?`);
  console.log(`    1. Add to ${profilePath}  (recommended)`);
  console.log(`    2. Skip — I'll set it myself\n`);

  const choice = await prompt(rl, '  > ');

  if (choice.trim() === '1' || choice.trim() === '') {
    writeKeyToProfile(profilePath, keyName, keyValue.trim());
    console.log(`\n  ✓ Added to ${profilePath}`);
    console.log(`\n  ┌─ Activate it now by running: ──────────────────┐`);
    console.log(`  │                                                 │`);
    console.log(`  │    source ${profilePath.replace(homedir(), '~').padEnd(37)}│`);
    console.log(`  │                                                 │`);
    console.log(`  │    Or just open a new terminal tab.             │`);
    console.log(`  └─────────────────────────────────────────────────┘\n`);
  } else {
    console.log(`\n  Skipped. Add this to your shell profile manually:\n`);
    console.log(`    export ${keyName}="${keyValue.trim()}"\n`);
  }
}

export function configCommand(): Command {
  const cmd = new Command('config')
    .description('Show current configuration and detected LLM provider')
    .action(() => {
      const config = loadConfig();
      const detected = detectProvider(config);
      renderConfig(config, CONFIG_PATH, detected);
    });

  cmd.command('init')
    .description('Interactive first-time setup wizard')
    .action(async () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      try {
        console.log('\nWelcome to wdid setup!\n');

        // ── LLM Provider ──────────────────────────────────────────
        const providerRaw = await prompt(
          rl,
          'LLM provider [anthropic / gemini / openai] (default: anthropic): '
        );
        const provider = providerRaw.trim().toLowerCase() || 'anthropic';

        if (!['anthropic', 'gemini', 'openai'].includes(provider)) {
          renderError(`Invalid provider "${provider}". Must be anthropic, gemini, or openai.`);
          rl.close();
          return;
        }

        // ── API Key ───────────────────────────────────────────────
        await setupApiKey(rl, provider);

        // ── Git repos ─────────────────────────────────────────────
        const autoDiscoverRaw = await prompt(
          rl,
          'Auto-discover git repos from home directory? [Y/n] (default: yes): '
        );
        const autoDiscover = autoDiscoverRaw.trim().toLowerCase() !== 'n';

        let repos: string[] = [];
        if (!autoDiscover) {
          const reposRaw = await prompt(
            rl,
            'Git repo paths (comma-separated, e.g. ~/dev/myapp,~/work/api): '
          );
          repos = reposRaw.split(',').map((r) => r.trim()).filter(Boolean);
        }

        // ── Claude Code sessions ──────────────────────────────────
        const sessionPathRaw = await prompt(
          rl,
          'Claude Code projects path (default: ~/.claude/projects): '
        );
        const sessionPath = sessionPathRaw.trim() || '~/.claude/projects';

        // ── Write config ──────────────────────────────────────────
        const config: WdidConfig = {
          llm: {
            provider: provider as WdidConfig['llm']['provider'],
            max_tokens_per_chunk: 3000,
            max_chunks: 10,
            max_summary_tokens: 500,
          },
          git: {
            auto_discover: autoDiscover,
            repos,
            exclude_patterns: [
              '*.lock', 'dist/*', 'build/*', '*.sum', '*.min.js',
              '.env', '.env.*', '*secret*', '*credential*', '*password*',
            ],
            max_diff_tokens: 4000,
          },
          claude_code: {
            session_path: sessionPath,
            enabled: true,
          },
          output: {
            format: 'text',
          },
        };

        writeConfig(config);

        console.log(`\n  ✓ Config written to ${CONFIG_PATH}`);
        console.log(`\n  You're all set! Run:\n`);
        console.log(`    wdid today\n`);

      } finally {
        rl.close();
      }
    });

  // Allow `expandPath` to be used without unused import warning
  void expandPath;

  return cmd;
}
