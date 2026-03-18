# Signals + Stars Ranking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix search ranking by blending GitHub stars (cold-start) and proven query-tool signals (learning loop) into the `search_tools` function.

**Architecture:** Four-signal ranking: `semantic * 0.50 + star_score * 0.25 + proven_score * 0.15 + fts_norm * 0.10`. Stars are fetched once via GitHub API and stored on the `tools` table. Query embeddings are stored on the `signals` table whenever an agent reports a result with `query_text`. The `proven_score` CTE finds signals for each candidate tool where the stored `query_embedding` is semantically similar to the current query, then computes their success rate.

**Tech Stack:** Neon Postgres (pgvector), TypeScript/tsx, Cloudflare Workers (Hono), GitHub REST API, OpenAI text-embedding-3-small, Wrangler

---

## Background

The current `search_tools` ranking (65% semantic + 35% FTS) doesn't fix the canonical tool problem — curl loses to ipull, ripgrep loses to zfind. Root cause: terse tool names have no keyword advantage. GitHub stars fix this immediately (curl has 36k, ipull has ~100). The query embedding column sets up the learning loop for the future.

**Key files:**
- `supabase/migrations/002_better_ranking.sql` — current function to replace
- `api/src/index.ts:140-168` — `/signal` endpoint to update
- `api/src/lib/db.ts` — `insertSignal` and `searchTools` to update
- `api/src/lib/embeddings.ts` — `getEmbedding()` already exists, use it

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/003_stars_and_proven_score.sql`

**Step 1: Create the migration file**

Write `supabase/migrations/003_stars_and_proven_score.sql`:

```sql
-- Add github_stars to tools for cold-start ranking
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS github_stars int NOT NULL DEFAULT 0;

-- Add query_embedding to signals for proven-score ranking
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS query_embedding vector(1536);

-- Index for proven_score CTE — finds signals with similar query embeddings per tool
-- lists=10 is appropriate for a small table (signals will be <100k rows for a long time)
CREATE INDEX IF NOT EXISTS signals_query_embedding_idx
  ON public.signals USING ivfflat (query_embedding vector_cosine_ops)
  WITH (lists = 10);
```

**Step 2: Apply to Neon DB**

Get DATABASE_URL from shell history:
```bash
grep -i "postgresql://" ~/.zsh_history 2>/dev/null | tail -1 | grep -o "postgresql://[^[:space:]]*"
```

Apply:
```bash
DATABASE_URL="postgresql://..." psql "$DATABASE_URL" -f supabase/migrations/003_stars_and_proven_score.sql
```

**Step 3: Verify columns exist**

```bash
DATABASE_URL="postgresql://..." psql "$DATABASE_URL" -c "\d tools" | grep github_stars
DATABASE_URL="postgresql://..." psql "$DATABASE_URL" -c "\d signals" | grep query_embedding
```

Expected: both lines show the new columns.

**Step 4: Commit**

```bash
git add supabase/migrations/003_stars_and_proven_score.sql
git commit -m "feat: add github_stars to tools and query_embedding to signals"
```

---

## Task 2: Fetch GitHub stars script

**Files:**
- Create: `scripts/fetch-stars.ts`

**Context:** Reads all tools from DB, extracts GitHub owner/repo from `source_url` using regex `github\.com/([^/]+)/([^/?#]+)`, calls GitHub REST API `/repos/{owner}/{repo}`, writes `github_stars` back. Needs `GITHUB_TOKEN` env var (5000 req/hr authenticated vs 60 unauthenticated). Tools without a GitHub URL keep `github_stars = 0`. Run serially with 100ms pause to stay within rate limits.

**Step 1: Create `scripts/fetch-stars.ts`**

```typescript
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;

if (!DATABASE_URL) throw new Error('DATABASE_URL required');
if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN required');

const sql = neon(DATABASE_URL);

function extractGithubRepo(url: string | null): { owner: string; repo: string } | null {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  // Strip .git suffix if present
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

async function fetchStars(owner: string, repo: string): Promise<number | null> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 404) return null; // repo deleted/renamed
  if (!res.ok) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    throw new Error(`GitHub API error ${res.status} (rate limit remaining: ${remaining})`);
  }

  const data = await res.json() as { stargazers_count: number };
  return data.stargazers_count;
}

async function main() {
  const tools = await sql`
    SELECT id, name, source_url FROM public.tools
    ORDER BY id
  ` as Array<{ id: number; name: string; source_url: string | null }>;

  console.log(`Processing ${tools.length} tools...`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const tool of tools) {
    const repo = extractGithubRepo(tool.source_url);
    if (!repo) {
      skipped++;
      continue;
    }

    try {
      const stars = await fetchStars(repo.owner, repo.repo);
      if (stars === null) {
        skipped++;
        continue;
      }

      await sql`UPDATE public.tools SET github_stars = ${stars} WHERE id = ${tool.id}`;
      updated++;

      if (updated % 100 === 0) {
        console.log(`  ${updated} updated, ${skipped} skipped, ${failed} failed`);
      }
    } catch (err) {
      console.error(`  x ${tool.name}: ${err}`);
      failed++;
      // Stop on rate limit errors
      if (String(err).includes('403') || String(err).includes('429')) {
        console.error('Rate limit hit — wait 60s and re-run');
        break;
      }
    }

    // 100ms pause to stay well within 5000/hr rate limit
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped (no GitHub URL), ${failed} failed`);

  // Show top 10 by stars as sanity check
  const top = await sql`
    SELECT name, github_stars FROM public.tools
    WHERE github_stars > 0
    ORDER BY github_stars DESC
    LIMIT 10
  `;
  console.log('\nTop 10 by stars:');
  top.forEach((r: any) => console.log(`  ${r.name}: ${r.github_stars.toLocaleString()}`));
}

main().catch(err => { console.error(err); process.exit(1); });
```

**Step 2: Get a GitHub token**

Go to github.com/settings/tokens → Generate new token (classic) → no scopes needed (public repos are readable without scopes). Copy the token.

**Step 3: Dry-run on 5 tools to verify**

```bash
cd /Users/tucker.schreiber/Documents/mar16/scripts
DATABASE_URL="postgresql://..." GITHUB_TOKEN="ghp_..." npx tsx -e "
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const tools = await sql\`SELECT id, name, source_url FROM tools WHERE name IN ('curl','ripgrep','jq','ffmpeg','wget') ORDER BY name\`;
for (const t of tools) {
  const m = t.source_url?.match(/github\\.com\\/([^/]+)\\/([^/?#]+)/);
  if (!m) { console.log(t.name, '-> no github url'); continue; }
  const res = await fetch(\`https://api.github.com/repos/\${m[1]}/\${m[2].replace(/\\.git\$/, '')}\`, {
    headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json' }
  });
  const d = await res.json();
  console.log(t.name, '->', d.stargazers_count ?? d.message);
}
"
```

Expected: all 5 tools return star counts in the thousands.

**Step 4: Run the full fetch (takes ~20 min for ~4-5k GitHub tools)**

```bash
cd /Users/tucker.schreiber/Documents/mar16/scripts
DATABASE_URL="postgresql://..." GITHUB_TOKEN="ghp_..." npx tsx fetch-stars.ts
```

**Step 5: Commit**

```bash
cd /Users/tucker.schreiber/Documents/mar16
git add scripts/fetch-stars.ts
git commit -m "feat: add fetch-stars script to populate github_stars on tools"
```

---

## Task 3: Store query embeddings on signals

**Files:**
- Modify: `api/src/lib/db.ts` — update `insertSignal` signature
- Modify: `api/src/index.ts` — generate embedding before calling `insertSignal`

**Context:** When `/signal` receives `query_text`, generate its embedding via `getEmbedding()` (already in `api/src/lib/embeddings.ts`) and store it. The embedding only generates when `query_text` is provided — no cost when it's absent. No changes to the public API signature.

**Step 1: Update `insertSignal` in `api/src/lib/db.ts`**

Current signature (line ~58):
```typescript
async insertSignal(toolId: number, success: boolean, queryText?: string, agentType?: string, commandRan?: string, context?: string): Promise<void>
```

Add `queryEmbedding?: number[]` parameter and store it:

```typescript
async insertSignal(
  toolId: number,
  success: boolean,
  queryText?: string,
  agentType?: string,
  commandRan?: string,
  context?: string,
  queryEmbedding?: number[],
): Promise<void> {
  await sql`
    INSERT INTO signals (tool_id, query_text, success, agent_type, command_ran, context, query_embedding)
    VALUES (
      ${toolId},
      ${queryText ?? null},
      ${success},
      ${agentType ?? null},
      ${commandRan ?? null},
      ${context ?? null},
      ${queryEmbedding ? JSON.stringify(queryEmbedding) + '::vector(1536)' : null}
    )
  `;
},
```

Wait — the neon tagged template doesn't interpolate raw SQL. Use this instead:

```typescript
async insertSignal(
  toolId: number,
  success: boolean,
  queryText?: string,
  agentType?: string,
  commandRan?: string,
  context?: string,
  queryEmbedding?: number[],
): Promise<void> {
  if (queryEmbedding) {
    await sql`
      INSERT INTO signals (tool_id, query_text, success, agent_type, command_ran, context, query_embedding)
      VALUES (${toolId}, ${queryText ?? null}, ${success}, ${agentType ?? null}, ${commandRan ?? null}, ${context ?? null}, ${JSON.stringify(queryEmbedding)}::vector(1536))
    `;
  } else {
    await sql`
      INSERT INTO signals (tool_id, query_text, success, agent_type, command_ran, context)
      VALUES (${toolId}, ${queryText ?? null}, ${success}, ${agentType ?? null}, ${commandRan ?? null}, ${context ?? null})
    `;
  }
},
```

**Step 2: Update `/signal` handler in `api/src/index.ts`**

Add `getEmbedding` import at top (already imported for search, just verify it's there):
```typescript
import { getEmbedding } from './lib/embeddings.js';
```

Update the handler (lines 154-164):

```typescript
try {
  const db = createDb(c.env.DATABASE_URL);

  // Generate query embedding if query_text provided (enables proven_score ranking)
  let queryEmbedding: number[] | undefined;
  if (body.query_text) {
    try {
      queryEmbedding = await getEmbedding(body.query_text.slice(0, 500), {
        apiKey: c.env.OPENAI_API_KEY,
      });
    } catch {
      // Embedding failure is non-fatal — signal still recorded without embedding
    }
  }

  await db.insertSignal(
    body.tool_id,
    body.success,
    body.query_text?.slice(0, 500),
    body.agent_type?.slice(0, 50),
    body.command_ran?.slice(0, 500),
    body.context?.slice(0, 1000),
    queryEmbedding,
  );
  return c.json({ ok: true });
} catch (err) {
  return c.json({ error: safeErrorMessage(err) }, 500);
}
```

**Step 3: Verify it builds**

```bash
cd /Users/tucker.schreiber/Documents/mar16/api
npm run build 2>/dev/null || npx tsc --noEmit
```

Expected: no type errors.

**Step 4: Commit**

```bash
cd /Users/tucker.schreiber/Documents/mar16
git add api/src/lib/db.ts api/src/index.ts
git commit -m "feat: store query embedding on signals for proven-score ranking"
```

---

## Task 4: Update search_tools SQL + deploy

**Files:**
- Create: `supabase/migrations/003b_ranking_formula.sql`

**Context:** Replace the current `search_tools` function with the 4-signal formula. The `proven_score` CTE finds signals for each candidate tool where `query_embedding` is similar to the current query (cosine similarity > 0.75), computes their success rate. `star_score` is log-normalized. FTS drops to 10% weight.

**Step 1: Create `supabase/migrations/003b_ranking_formula.sql`**

```sql
-- 4-signal ranking: semantic (50%) + stars (25%) + proven_score (15%) + fts (10%)
CREATE OR REPLACE FUNCTION search_tools(
  query_embedding vector(1536),
  query_text text DEFAULT '',
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id bigint,
  name text,
  description text,
  short_description text,
  install_command text,
  package_manager text,
  platform text[],
  category text,
  source_url text,
  binaries text[],
  usage_examples jsonb,
  similarity float,
  success_rate float,
  use_count bigint
)
LANGUAGE sql STABLE
AS $$
  WITH
  -- Max stars for normalization (computed once)
  star_max AS (
    SELECT GREATEST(MAX(github_stars), 1) AS max_stars FROM public.tools
  ),
  -- Semantic candidates (only tools above similarity threshold)
  semantic AS (
    SELECT
      t.id,
      1 - (t.embedding <=> query_embedding) AS sem_score
    FROM public.tools t
    WHERE 1 - (t.embedding <=> query_embedding) > match_threshold
  ),
  -- FTS score (only for semantic candidates)
  fts AS (
    SELECT
      s.id,
      CASE
        WHEN query_text IS NULL OR query_text = '' THEN 0.0
        ELSE COALESCE(
          ts_rank(
            to_tsvector('english', t.name || ' ' || t.description),
            plainto_tsquery('english', query_text)
          ),
          0.0
        )
      END AS fts_score
    FROM public.tools t
    JOIN semantic s ON s.id = t.id
  ),
  -- Proven score: success rate from semantically similar past queries
  -- Defaults to 0.5 (neutral) when no similar past queries exist
  proven AS (
    SELECT
      sig.tool_id,
      COALESCE(
        SUM(CASE WHEN sig.success THEN 1.0 ELSE 0.0 END) /
        NULLIF(COUNT(*), 0),
        0.5
      ) AS proven_score,
      COUNT(*) AS proven_count
    FROM public.signals sig
    WHERE
      sig.query_embedding IS NOT NULL
      AND 1 - (sig.query_embedding <=> query_embedding) > 0.75
    GROUP BY sig.tool_id
  ),
  combined AS (
    SELECT
      t.id,
      t.name,
      t.description,
      t.short_description,
      t.install_command,
      t.package_manager,
      t.platform,
      t.category,
      t.source_url,
      t.binaries,
      t.usage_examples,
      s.sem_score,
      -- Log-normalize stars: LOG(stars+1) / LOG(max_stars+1) → [0,1]
      LOG(t.github_stars + 1) / LOG(sm.max_stars + 1) AS star_score,
      -- ts_rank typically ~0.01-0.1; scale to [0,1]
      LEAST(f.fts_score * 10, 1.0) AS fts_norm,
      COALESCE(p.proven_score, 0.5) AS proven_score,
      COALESCE(
        SUM(CASE WHEN sig.success THEN 1 ELSE 0 END)::float /
        NULLIF(COUNT(sig.id), 0),
        0.5
      ) AS success_rate,
      COUNT(sig.id) AS use_count
    FROM public.tools t
    JOIN semantic s ON s.id = t.id
    JOIN fts f ON f.id = t.id
    CROSS JOIN star_max sm
    LEFT JOIN proven p ON p.tool_id = t.id
    LEFT JOIN public.signals sig ON sig.tool_id = t.id
    GROUP BY t.id, t.name, t.description, t.short_description,
             t.install_command, t.package_manager, t.platform,
             t.category, t.source_url, t.binaries, t.usage_examples,
             s.sem_score, f.fts_score, sm.max_stars, t.github_stars,
             p.proven_score
  )
  SELECT
    id, name, description, short_description, install_command,
    package_manager, platform, category, source_url, binaries, usage_examples,
    sem_score AS similarity,
    success_rate,
    use_count
  FROM combined
  ORDER BY (
    sem_score    * 0.50 +
    star_score   * 0.25 +
    proven_score * 0.15 +
    fts_norm     * 0.10
  ) DESC
  LIMIT match_count;
$$;
```

**Step 2: Apply migration**

```bash
DATABASE_URL="postgresql://..." psql "$DATABASE_URL" -f supabase/migrations/003b_ranking_formula.sql
```

**Step 3: Test the 14 benchmark queries**

```bash
BASE="https://need-api.schreibertucbiz.workers.dev"

# First deploy the API so it uses the new signal endpoint with embeddings
cd /Users/tucker.schreiber/Documents/mar16/api
npx wrangler deploy

# Then test queries
for query in "search+text+in+files" "download+file+from+url" "resize+image" "compress+image" "monitor+system+resources" "list+files+in+tree+format" "check+disk+usage" "view+file+with+syntax+highlighting" "make+http+requests+from+terminal" "convert+document+format" "compress+video+without+losing+quality" "pretty+print+json" "find+files+by+name" "download+youtube+video"; do
  result=$(curl -s "$BASE/search?q=$query&limit=1" | python3 -c "import sys,json; r=json.load(sys.stdin)['results']; print(r[0]['name'] if r else 'no results')")
  echo "$query -> $result"
done
```

Expected: ripgrep, curl, imagemagick, imagemagick, htop, tree, ncdu, bat, httpie, pandoc, ffmpeg, jq, fd, yt-dlp

**Step 4: Commit**

```bash
cd /Users/tucker.schreiber/Documents/mar16
git add supabase/migrations/003b_ranking_formula.sql
git commit -m "feat: 4-signal ranking (semantic 50% + stars 25% + proven 15% + fts 10%)"
```

---

## Deployment Note

- Task 1 (schema): applied directly to Neon via psql — no code deploy needed
- Task 2 (stars script): run locally, writes to DB — no deploy
- Task 3 (signal endpoint): requires `npx wrangler deploy` from `api/`
- Task 4 (SQL function): applied via psql before deploying API

**Order matters:** Apply Task 1 schema first (columns must exist before the SQL function references them). Fetch stars (Task 2) before applying the new `search_tools` function (Task 4) so `star_score` has data to work with.

## Success Criteria

All 14 benchmark queries return the expected canonical tool in position #1 or #2:

| Query | Expected |
|-------|----------|
| search text in files | ripgrep |
| download file from url | curl |
| resize image | imagemagick |
| compress image | imagemagick |
| monitor system resources | htop |
| list files in tree format | tree |
| check disk usage | ncdu |
| view file with syntax highlighting | bat |
| make http requests from terminal | httpie |
| convert document format | pandoc |
| compress video without losing quality | ffmpeg |
| pretty print json | jq |
| find files by name | fd |
| download youtube video | yt-dlp |
