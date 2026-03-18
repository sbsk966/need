import { describe, it, expect } from 'vitest';
import { formatResults } from '../src/lib/formatter.js';

describe('formatResults', () => {
  it('formats search results as a readable table', () => {
    const results = [
      {
        id: 1,
        name: 'imagemagick',
        description: 'Convert images',
        short_description: null,
        install_command: 'brew install imagemagick',
        package_manager: 'brew',
        platform: ['macos'],
        category: 'image',
        source_url: null,
        binaries: [],
        usage_examples: [],
        similarity: 0.94,
        success_rate: 0.94,
        use_count: 4100,
        github_stars: 0,
      },
    ];

    const output = formatResults(results);
    expect(output).toContain('imagemagick');
    expect(output).toContain('brew install imagemagick');
    expect(output).toContain('94%');
  });

  it('shows a message when no results found', () => {
    const output = formatResults([]);
    expect(output).toContain('No tools found');
  });

  it('displays usage examples when available', () => {
    const results = [
      {
        id: 1,
        name: 'poppler',
        description: 'PDF rendering library',
        short_description: 'Convert and inspect PDFs',
        install_command: 'brew install poppler',
        package_manager: 'brew',
        platform: ['macos'],
        category: null,
        source_url: null,
        binaries: ['pdftoppm', 'pdftotext'],
        usage_examples: [
          { description: 'Convert PDF to PNG', command: 'pdftoppm -png input.pdf output' },
          { description: 'Extract text', command: 'pdftotext input.pdf output.txt' },
        ],
        similarity: 0.92,
        success_rate: 0.85,
        use_count: 342,
        github_stars: 0,
      },
    ];

    const output = formatResults(results);
    expect(output).toContain('poppler');
    expect(output).toContain('pdftoppm -png input.pdf output');
    expect(output).toContain('pdftotext input.pdf output.txt');
    expect(output).toContain('85%');
  });

  it('works without usage examples (backward compat)', () => {
    const results = [
      {
        id: 1,
        name: 'jq',
        description: 'JSON processor',
        short_description: null,
        install_command: 'brew install jq',
        package_manager: 'brew',
        platform: ['macos'],
        category: null,
        source_url: null,
        binaries: [],
        usage_examples: [],
        similarity: 0.9,
        success_rate: 0.5,
        use_count: 0,
        github_stars: 0,
      },
    ];

    const output = formatResults(results);
    expect(output).toContain('jq');
    expect(output).toContain('brew install jq');
    // Should NOT contain "Usage:" section
    expect(output).not.toContain('Usage:');
  });

  it('shows social proof line when both stars and signals available', () => {
    const results = [
      {
        id: 1, name: 'pngquant', description: 'Lossy PNG compressor',
        short_description: null, install_command: 'brew install pngquant',
        package_manager: 'brew', platform: ['macos'], category: 'image',
        source_url: null, binaries: [], usage_examples: [],
        similarity: 0.95, success_rate: 0.94, use_count: 1200, github_stars: 36000,
      },
    ];
    const output = formatResults(results);
    expect(output).toContain('★ 36k stars');
    expect(output).toContain('94% success');
    expect(output).toContain('1.2k agent uses');
  });

  it('shows only stars when use_count below threshold', () => {
    const results = [
      {
        id: 1, name: 'obscuretool', description: 'Some tool',
        short_description: null, install_command: 'brew install obscuretool',
        package_manager: 'brew', platform: ['macos'], category: null,
        source_url: null, binaries: [], usage_examples: [],
        similarity: 0.8, success_rate: 1.0, use_count: 5, github_stars: 500,
      },
    ];
    const output = formatResults(results);
    expect(output).toContain('★ 500 stars');
    expect(output).not.toContain('agent uses');
    expect(output).not.toContain('% success');
  });

  it('shows nothing when no stars and use_count below threshold', () => {
    const results = [
      {
        id: 1, name: 'newtool', description: 'Brand new tool',
        short_description: null, install_command: 'brew install newtool',
        package_manager: 'brew', platform: ['macos'], category: null,
        source_url: null, binaries: [], usage_examples: [],
        similarity: 0.8, success_rate: 0.5, use_count: 3, github_stars: 0,
      },
    ];
    const output = formatResults(results);
    expect(output).not.toContain('★');
    expect(output).not.toContain('agent uses');
  });
});
