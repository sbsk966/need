import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/api-client.js', () => {
  const mockClient = {
    search: vi.fn(),
    reportSignal: vi.fn(),
  };
  return {
    NeedApiClient: vi.fn(() => mockClient),
    __mockClient: mockClient,
  };
});

import { searchCommand } from '../src/commands/search.js';
import { NeedApiClient } from '../src/lib/api-client.js';

function getMockClient() {
  return new NeedApiClient() as unknown as {
    search: ReturnType<typeof vi.fn>;
    reportSignal: ReturnType<typeof vi.fn>;
  };
}

const baseTool = {
  description: 'A tool',
  short_description: null,
  install_command: 'brew install tool',
  package_manager: 'brew',
  platform: ['macos'],
  category: null,
  source_url: null,
  binaries: [],
  usage_examples: [],
  similarity: 0.9,
  success_rate: 0.8,
  use_count: 100,
};

describe('searchCommand', () => {
  let mockClient: ReturnType<typeof getMockClient>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = getMockClient();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  it('prints formatted results to stdout', async () => {
    mockClient.search.mockResolvedValue({
      results: [
        { ...baseTool, id: 1, name: 'jq', install_command: 'brew install jq', success_rate: 0.95, use_count: 5000 },
      ],
      query: 'json processor',
    });

    await searchCommand('json processor');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('jq'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('brew install jq'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('95% success'));
  });

  it('prints no-results message when API returns empty results', async () => {
    mockClient.search.mockResolvedValue({ results: [], query: 'zyzzyx' });

    await searchCommand('zyzzyx');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No tools found'));
  });

  it('prints error and exits on API failure', async () => {
    mockClient.search.mockRejectedValue(new Error('Network timeout'));

    await expect(searchCommand('json processor')).rejects.toThrow('process.exit');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Network timeout'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles unknown error objects on failure', async () => {
    mockClient.search.mockRejectedValue('string error');

    await expect(searchCommand('json processor')).rejects.toThrow('process.exit');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown error'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
