import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs');

const mockedFs = vi.mocked(fs);

const MARKER = '<!-- need-tools -->';

describe('appendClaudeMdRule', () => {
  let appendClaudeMdRule: (filePath: string) => 'created' | 'updated' | 'already exists';

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockedFs.mkdirSync.mockImplementation(() => undefined as any);
    mockedFs.writeFileSync.mockImplementation(() => {});
    const mod = await import('../src/lib/claude-md.js');
    appendClaudeMdRule = mod.appendClaudeMdRule;
  });

  it('creates a new file with the rule when the file does not exist', () => {
    mockedFs.existsSync.mockReturnValue(false);

    const result = appendClaudeMdRule('/fake/.claude/CLAUDE.md');

    expect(result).toBe('created');
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      '/fake/.claude/CLAUDE.md',
      expect.stringContaining(MARKER),
      'utf-8',
    );
  });

  it('appends the rule to an existing file that lacks the marker', () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue('# My existing content\n');

    const result = appendClaudeMdRule('/fake/CLAUDE.md');

    expect(result).toBe('updated');
    const written = vi.mocked(mockedFs.writeFileSync).mock.calls[0][1] as string;
    expect(written).toContain('# My existing content');
    expect(written).toContain(MARKER);
  });

  it('returns already exists without writing when marker is present', () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(`# Config\n\n${MARKER}\nsome rule\n${MARKER}\n`);

    const result = appendClaudeMdRule('/fake/CLAUDE.md');

    expect(result).toBe('already exists');
    expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
  });

  it('creates parent directory when it does not exist', () => {
    mockedFs.existsSync.mockReturnValue(false);

    appendClaudeMdRule('/fake/newdir/CLAUDE.md');

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith('/fake/newdir', { recursive: true });
  });
});

describe('ensureDir', () => {
  let ensureDir: (dirPath: string) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockedFs.mkdirSync.mockImplementation(() => undefined as any);
    const mod = await import('../src/lib/claude-md.js');
    ensureDir = mod.ensureDir;
  });

  it('creates directory when it does not exist', () => {
    mockedFs.existsSync.mockReturnValue(false);

    ensureDir('/fake/dir');

    expect(mockedFs.mkdirSync).toHaveBeenCalledWith('/fake/dir', { recursive: true });
  });

  it('does not call mkdirSync when directory already exists', () => {
    mockedFs.existsSync.mockReturnValue(true);

    ensureDir('/fake/dir');

    expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
  });
});
