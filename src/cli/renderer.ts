import chalk from 'chalk';
import boxen from 'boxen';
import gradient from 'gradient-string';
import type { DailySnapshot, WdidConfig, TemplateConfig, SummaryResult } from '../types.js';

const TERM_WIDTH = process.stdout.columns ?? 80;

function wrap(text: string, indent = 2): string {
  const maxLen = TERM_WIDTH - indent - 4;
  if (text.length <= maxLen) return ' '.repeat(indent) + text;
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > maxLen) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => ' '.repeat(indent) + l).join('\n');
}

function renderSectionContent(value: string | string[]): string {
  if (typeof value === 'string') {
    return wrap(value, 0);
  }
  if (value.length === 0) return chalk.dim('  (none)');
  return value.map((item) => wrap(`• ${item}`, 0)).join('\n');
}

function renderSummaryBox(
  summary: SummaryResult,
  template: TemplateConfig,
  title?: string
): string {
  const lines: string[] = [];

  for (const section of template.sections) {
    const val = summary[section.name];
    if (val === undefined || val === null) continue;
    if (typeof val === 'string' && val === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;

    lines.push(chalk.bold(section.name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())));
    lines.push(renderSectionContent(val));
    lines.push('');
  }

  // Remove trailing blank line
  while (lines[lines.length - 1] === '') lines.pop();

  return boxen(lines.join('\n'), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: title ? 'round' : 'classic',
    borderColor: title ? 'cyan' : 'gray',
    title: title ? chalk.cyan(title) : undefined,
    titleAlignment: 'left',
    width: Math.min(TERM_WIDTH - 2, 100),
  });
}

export function renderToday(
  snapshot: DailySnapshot,
  provider: string,
  model: string,
  template?: TemplateConfig
): void {
  const tpl = template ?? {
    grouping: 'flat' as const,
    sections: [
      { name: 'oneLiner', type: 'string' as const, description: 'Summary', required: true },
      { name: 'narratives', type: 'list' as const, description: 'Highlights' },
      { name: 'bullets', type: 'list' as const, description: 'Details' },
      { name: 'themes', type: 'list' as const, description: 'Themes' },
    ],
  };

  console.log('');
  console.log(gradient.cristal('  ◆ What Did I Do Today ◆'));
  console.log(chalk.dim(`  ${snapshot.date}  ·  ${provider} (${model})`));
  console.log('');

  if (tpl.grouping === 'by_project' && snapshot.groups && Object.keys(snapshot.groups).length > 0) {
    const projectBoxes = Object.entries(snapshot.groups)
      .map(([name, s]) => renderSummaryBox(s, tpl, name))
      .join('\n');

    console.log(
      boxen(projectBoxes, {
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        borderStyle: 'double',
        borderColor: 'cyan',
        title: chalk.bold.cyan('Per-Project Summary'),
        titleAlignment: 'center',
        width: Math.min(TERM_WIDTH - 2, 104),
      })
    );
  } else {
    console.log(renderSummaryBox(snapshot.summary, tpl));
  }

  console.log('');
}

export function renderStandup(output: string): void {
  console.log('');
  console.log(gradient.morning('  ◆ Standup Update ◆'));
  console.log('');
  console.log(
    boxen(chalk.white(output), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'yellow',
      width: Math.min(TERM_WIDTH - 2, 100),
    })
  );
  console.log('');
}

export function renderWeekly(output: string): void {
  console.log('');
  console.log(gradient.passion('  ◆ Weekly Summary ◆'));
  console.log('');
  console.log(
    boxen(chalk.white(output), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'magenta',
      width: Math.min(TERM_WIDTH - 2, 100),
    })
  );
  console.log('');
}

export function renderConfig(config: WdidConfig, configPath: string, detectedProvider: string): void {
  const lines = [
    `${chalk.bold('Config file:')}    ${chalk.white(configPath)}`,
    `${chalk.bold('LLM provider:')}   ${chalk.green(detectedProvider)}`,
    `${chalk.bold('Git repos:')}      ${chalk.white(config.git.repos.length > 0 ? config.git.repos.join(', ') : 'auto-discover')}`,
    `${chalk.bold('Sessions path:')}  ${chalk.white(config.claude_code.session_path)}`,
    `${chalk.bold('Sessions:')}       ${chalk.white(config.claude_code.enabled ? 'enabled' : 'disabled')}`,
    `${chalk.bold('Grouping:')}       ${chalk.white(config.template.grouping)}`,
    `${chalk.bold('Sections:')}       ${chalk.white(config.template.sections.map((s) => s.name).join(', '))}`,
  ].join('\n');

  console.log('');
  console.log(gradient.atlas('  ◆ whatdone config ◆'));
  console.log('');
  console.log(
    boxen(lines, {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'blue',
      width: Math.min(TERM_WIDTH - 2, 100),
    })
  );
  console.log('');
}

export function renderDryRun(prompt: string): void {
  console.log('');
  console.log(chalk.bold.yellow('  ◆ Dry Run — Prompt Preview ◆'));
  console.log('');
  console.log(
    boxen(chalk.gray(prompt), {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'classic',
      borderColor: 'yellow',
      width: Math.min(TERM_WIDTH - 2, 100),
    })
  );
  console.log('');
  console.log(chalk.dim('  (No LLM call made — remove --dry-run to generate a summary)'));
}

export function renderError(message: string): void {
  console.error(
    boxen(`${chalk.bold.red('Error:')} ${chalk.red(message)}`, {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderStyle: 'round',
      borderColor: 'red',
      width: Math.min(TERM_WIDTH - 2, 80),
    })
  );
}

export function renderWarning(message: string): void {
  console.warn(chalk.yellow('⚠ ') + chalk.yellow(message));
}

export function renderInfo(message: string): void {
  console.log(chalk.dim('  ' + message));
}

export function renderMissingDates(dates: string[]): void {
  const list = dates.map((d) => `  • ${d}`).join('\n');
  console.warn(chalk.yellow(`⚠  Missing snapshots for:\n${list}`));
}
