import { Command } from 'commander';
import { createRequire } from 'module';
import { todayCommand } from './today.js';
import { standupCommand } from './standup.js';
import { weeklyCommand } from './weekly.js';
import { configCommand } from './config.js';
import { NoAPIKeyError, LLMCallError, WdidError } from './errors.js';
import { renderError } from './renderer.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { name: string; version: string; description: string };

const program = new Command();

program
  .name(pkg.name)
  .description(pkg.description)
  .version(pkg.version);

program.addCommand(todayCommand());
program.addCommand(standupCommand());
program.addCommand(weeklyCommand());
program.addCommand(configCommand());

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (err instanceof NoAPIKeyError) {
    renderError(
      `No LLM API key found.\n\nSet one of:\n  ANTHROPIC_API_KEY\n  GEMINI_API_KEY\n  OPENAI_API_KEY\n\nOr set [llm] provider in ~/.whatdone/config.toml`
    );
  } else if (err instanceof LLMCallError) {
    renderError(`LLM call failed: ${err.message}`);
  } else if (err instanceof WdidError) {
    renderError(err.message);
  } else if (process.env.WHATDONE_DEBUG) {
    console.error(err);
  } else {
    renderError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
}
