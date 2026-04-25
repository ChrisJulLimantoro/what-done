import chalk from 'chalk';
import type { DailySnapshot, WdidConfig } from '../types.js';

export function renderToday(snapshot: DailySnapshot, provider: string, model: string): void {
  console.log('');
  console.log(chalk.bold.cyan('━━━ What Did I Do Today ━━━'));
  console.log('');
  console.log(chalk.bold('Summary'));
  console.log(chalk.white(snapshot.summary.oneLiner));
  console.log('');

  if (snapshot.summary.narratives.length > 0) {
    console.log(chalk.bold('Highlights'));
    for (const n of snapshot.summary.narratives) {
      console.log(chalk.white('  ' + n));
    }
    console.log('');
  }

  if (snapshot.summary.bullets.length > 0) {
    console.log(chalk.bold('Details'));
    for (const b of snapshot.summary.bullets) {
      console.log(chalk.gray('  • ' + b));
    }
    console.log('');
  }

  if (snapshot.summary.themes.length > 0) {
    console.log(chalk.bold('Themes'));
    console.log(chalk.gray('  ' + snapshot.summary.themes.join(', ')));
    console.log('');
  }

  console.log(chalk.dim(`Generated via ${provider} (${model}) · ${snapshot.date}`));
}

export function renderStandup(output: string): void {
  console.log('');
  console.log(chalk.bold.cyan('━━━ Standup ━━━'));
  console.log('');
  console.log(chalk.white(output));
  console.log('');
}

export function renderWeekly(output: string): void {
  console.log('');
  console.log(chalk.bold.cyan('━━━ Weekly Summary ━━━'));
  console.log('');
  console.log(chalk.white(output));
  console.log('');
}

export function renderConfig(config: WdidConfig, configPath: string, detectedProvider: string): void {
  console.log('');
  console.log(chalk.bold.cyan('━━━ wdid config ━━━'));
  console.log('');
  console.log(chalk.bold('Config file:'), chalk.white(configPath));
  console.log(chalk.bold('LLM provider:'), chalk.green(detectedProvider));
  console.log(chalk.bold('Git repos:'), chalk.white(config.git.repos.join(', ')));
  console.log(chalk.bold('Sessions path:'), chalk.white(config.claude_code.session_path));
  console.log(chalk.bold('Sessions enabled:'), chalk.white(String(config.claude_code.enabled)));
  console.log('');
}

export function renderDryRun(prompt: string): void {
  console.log('');
  console.log(chalk.bold.yellow('━━━ Dry Run — Prompt Preview ━━━'));
  console.log('');
  console.log(chalk.gray(prompt));
  console.log('');
  console.log(chalk.dim('(No LLM call made — remove --dry-run to generate a summary)'));
}

export function renderError(message: string): void {
  console.error(chalk.bold.red('Error:'), chalk.red(message));
}

export function renderWarning(message: string): void {
  console.warn(chalk.yellow('Warning:'), message);
}

export function renderInfo(message: string): void {
  console.log(chalk.dim(message));
}
