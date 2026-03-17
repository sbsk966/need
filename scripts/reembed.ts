// scripts/reembed.ts
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

if (!DATABASE_URL) throw new Error('DATABASE_URL env var required');
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY env var required');

const sql = neon(DATABASE_URL);

interface Tool {
  id: number;
  name: string;
  description: string;
  usage_examples: Array<{ description: string; command: string }>;
}

function buildEmbeddingText(tool: Tool): string {
  const exampleDescs = (tool.usage_examples ?? [])
    .map((e) => e.description)
    .filter(Boolean)
    .slice(0, 3);

  const parts = [`${tool.name}: ${tool.description}`];
  if (exampleDescs.length > 0) {
    parts.push(exampleDescs.join('. '));
  }
  return parts.join('. ');
}

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: texts, model: 'text-embedding-3-small' }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    data: Array<{ embedding: number[]; index: number }>;
  };
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

async function reembed() {
  const tools = await sql`
    SELECT id, name, description, usage_examples
    FROM public.tools
    WHERE usage_examples IS NOT NULL
      AND usage_examples != '[]'::jsonb
    ORDER BY id
  ` as Tool[];

  console.log(`Re-embedding ${tools.length} enriched tools...`);

  const BATCH_SIZE = 100;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < tools.length; i += BATCH_SIZE) {
    const batch = tools.slice(i, i + BATCH_SIZE);
    const texts = batch.map(buildEmbeddingText);

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tools.length / BATCH_SIZE);
    console.log(`Batch ${batchNum}/${totalBatches} — embedding ${batch.length} tools...`);

    let embeddings: number[][];
    try {
      embeddings = await getEmbeddings(texts);
    } catch (err) {
      console.error(`  Batch ${batchNum} embedding failed:`, err);
      failed += batch.length;
      continue;
    }

    const results = await Promise.allSettled(
      batch.map((tool, j) => {
        const embedding = JSON.stringify(embeddings[j]);
        return sql`
          UPDATE public.tools
          SET embedding = ${embedding}::vector(1536)
          WHERE id = ${tool.id}
        `;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') updated++;
      else { failed++; console.error('  Update failed:', r.reason); }
    }

    console.log(`  Progress: ${updated + failed}/${tools.length} (${updated} ok, ${failed} failed)`);

    if (i + BATCH_SIZE < tools.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\nDone! Updated ${updated} embeddings, ${failed} failed.`);
}

reembed().catch((err) => {
  console.error('Re-embed failed:', err);
  process.exit(1);
});
