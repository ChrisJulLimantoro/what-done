import { expandPath } from '../config/loader.js';
import { homedir } from 'os';
import { join } from 'path';

describe('expandPath', () => {
  it('expands ~ to home directory', () => {
    const result = expandPath('~/.wdid/config.toml');
    expect(result).toBe(join(homedir(), '.wdid/config.toml'));
  });

  it('expands lone ~ to home directory', () => {
    expect(expandPath('~')).toBe(homedir());
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandPath('/absolute/path')).toBe('/absolute/path');
  });

  it('leaves relative paths unchanged', () => {
    expect(expandPath('relative/path')).toBe('relative/path');
  });

  it('leaves . unchanged', () => {
    expect(expandPath('.')).toBe('.');
  });
});
