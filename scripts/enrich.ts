import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

const sql = neon(DATABASE_URL);

interface Tool {
  id: number;
  name: string;
  description: string;
}

interface EnrichmentResult {
  short_description: string;
  binaries: string[];
  usage_examples: Array<{ description: string; command: string }>;
}

async function enrichTool(tool: Tool): Promise<EnrichmentResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are a CLI tool expert. For the Homebrew package "${tool.name}" (${tool.description}), provide:

1. A short_description: A clear one-sentence description of what this tool does (max 80 chars)
2. binaries: The actual command-line binary names this package installs (not the package name, but the commands you run). If unsure, use the package name.
3. usage_examples: 2-3 practical usage examples showing common tasks

Respond with ONLY valid JSON, no markdown:
{"short_description": "...", "binaries": ["..."], "usage_examples": [{"description": "...", "command": "..."}]}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    content: Array<{ type: string; text: string }>;
  };

  let text = data.content[0].text.trim();
  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(text) as EnrichmentResult;
}

async function enrich() {
  // Get tools that haven't been enriched yet
  const tools = await sql`
    SELECT id, name, description FROM public.tools
    WHERE usage_examples = '[]'::jsonb OR usage_examples IS NULL
    ORDER BY id
  ` as Tool[];

  console.log(`Found ${tools.length} tools to enrich`);

  const BATCH_SIZE = 20;
  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < tools.length; i += BATCH_SIZE) {
    const batch = tools.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (tool) => {
        const result = await enrichTool(tool);
        await sql`
          UPDATE public.tools
          SET
            short_description = ${result.short_description},
            binaries = ${result.binaries as string[]},
            usage_examples = ${JSON.stringify(result.usage_examples)}::jsonb
          WHERE id = ${tool.id}
        `;
        return tool.name;
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        enriched++;
        console.log(`  + ${r.value}`);
      } else {
        failed++;
        console.error(`  x Error: ${r.reason}`);
      }
    }

    console.log(`Progress: ${enriched + failed}/${tools.length} (${enriched} ok, ${failed} failed)`);

    // Rate limit pause
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nDone! Enriched ${enriched} tools, ${failed} failed.`);
}

enrich().catch((err) => {
  console.error('Enrichment failed:', err);
  process.exit(1);
});
