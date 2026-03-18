import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NeedApiClient } from '../src/lib/api-client.js';

function makeFetch(ok: boolean, body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe('NeedApiClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEED_API_URL;
  });

  describe('constructor', () => {
    it('uses NEED_API_URL env var when set', async () => {
      process.env.NEED_API_URL = 'https://custom.api.dev';
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [], query: 'test' }) });

      const client = new NeedApiClient();
      await client.search('test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('custom.api.dev'),
      );
    });

    it('falls back to the default API URL', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [], query: 'test' }) });

      const client = new NeedApiClient();
      await client.search('test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.agentneed.dev'),
      );
    });
  });

  describe('search()', () => {
    it('builds the correct URL with query and limit params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], query: 'convert pdf' }),
      });

      const client = new NeedApiClient();
      await client.search('convert pdf', 5);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/search');
      expect(calledUrl).toContain('q=convert+pdf');
      expect(calledUrl).toContain('limit=5');
    });

    it('returns parsed results on success', async () => {
      const payload = {
        results: [{ id: 1, name: 'jq', install_command: 'brew install jq' }],
        query: 'json processor',
      };
      mockFetch.mockResolvedValue({ ok: true, json: async () => payload });

      const client = new NeedApiClient();
      const result = await client.search('json processor');

      expect(result.results[0].name).toBe('jq');
      expect(result.query).toBe('json processor');
    });

    it('throws with status code on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      const client = new NeedApiClient();
      await expect(client.search('test')).rejects.toThrow('API error (503)');
    });
  });

  describe('logInstallAsQuery()', () => {
    it('POSTs with [direct install] prefix', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      const client = new NeedApiClient();
      await client.logInstallAsQuery('brew install imagemagick');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/log-query'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('[direct install] brew install imagemagick'),
        }),
      );
    });

    it('silently ignores fetch errors', async () => {
      mockFetch.mockRejectedValue(new Error('network down'));

      const client = new NeedApiClient();
      await expect(client.logInstallAsQuery('npm install foo')).resolves.toBeUndefined();
    });
  });

  describe('reportSignal()', () => {
    it('POSTs signal with correct fields', async () => {
      mockFetch.mockResolvedValue({ ok: true, text: async () => '' });

      const client = new NeedApiClient();
      await client.reportSignal(42, true, 'compress images', 'pngquant img.png', 'resizing screenshots');

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/signal');
      const body = JSON.parse(init.body as string);
      expect(body.tool_id).toBe(42);
      expect(body.success).toBe(true);
      expect(body.query_text).toBe('compress images');
      expect(body.command_ran).toBe('pngquant img.png');
      expect(body.context).toBe('resizing screenshots');
      expect(body.agent_type).toBe('cli');
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => 'Unprocessable Entity',
      });

      const client = new NeedApiClient();
      await expect(client.reportSignal(1, false)).rejects.toThrow('Signal error (422)');
    });
  });
});
