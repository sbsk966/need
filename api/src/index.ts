import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getEmbedding } from './lib/embeddings.js';
import { createDb } from './lib/db.js';

type Bindings = {
  DATABASE_URL: string;
  OPENAI_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

app.get('/', (c) => c.json({ name: 'need-api', version: '0.1.0' }));

app.get('/search', async (c) => {
  const query = c.req.query('q');
  if (!query) return c.json({ error: 'Missing query parameter: q' }, 400);

  const limit = parseInt(c.req.query('limit') ?? '10', 10);

  try {
    const db = createDb(c.env.DATABASE_URL);

    // Check for exact name match first
    const exactMatch = await db.getToolByName(query.toLowerCase());

    // If exact match, return just that tool (single-word queries are likely exact lookups)
    if (exactMatch && !query.includes(' ')) {
      db.logQuery(query, 1).catch(() => {});
      return c.json({ results: [exactMatch], query });
    }

    const embedding = await getEmbedding(query, { apiKey: c.env.OPENAI_API_KEY });
    const results = await db.searchTools(embedding, limit);

    // If there's an exact match, put it first and deduplicate
    let finalResults = results;
    if (exactMatch) {
      finalResults = [
        exactMatch,
        ...results.filter((r) => r.name !== exactMatch.name),
      ].slice(0, limit);
    }

    db.logQuery(query, finalResults.length).catch(() => {});

    return c.json({ results: finalResults, query });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

app.post('/signal', async (c) => {
  const body = await c.req.json<{
    tool_id: number;
    query_text?: string;
    success: boolean;
    agent_type?: string;
    command_ran?: string;
    context?: string;
  }>();

  if (typeof body.tool_id !== 'number' || typeof body.success !== 'boolean') {
    return c.json({ error: 'Required: tool_id (number), success (boolean)' }, 400);
  }

  try {
    const db = createDb(c.env.DATABASE_URL);
    await db.insertSignal(body.tool_id, body.success, body.query_text, body.agent_type, body.command_ran, body.context);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

app.get('/categories', async (c) => {
  try {
    const db = createDb(c.env.DATABASE_URL);
    const categories = await db.getCategories();
    return c.json({ categories });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

app.get('/tools', async (c) => {
  const category = c.req.query('category');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  try {
    const db = createDb(c.env.DATABASE_URL);
    const { tools, total } = await db.listTools({ category: category || undefined, limit, offset });
    return c.json({ tools, total, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

app.get('/tools/:name', async (c) => {
  const name = c.req.param('name');
  try {
    const db = createDb(c.env.DATABASE_URL);
    const tool = await db.getToolByName(name);
    if (!tool) return c.json({ error: 'Tool not found' }, 404);
    return c.json(tool);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

export default app;
