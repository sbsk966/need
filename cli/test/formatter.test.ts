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
      },
    ];

    const output = formatResults(results);
    expect(output).toContain('jq');
    expect(output).toContain('brew install jq');
    // Should NOT contain "Usage:" section
    expect(output).not.toContain('Usage:');
  });
});
