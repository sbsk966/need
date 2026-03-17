import { neon } from '@neondatabase/serverless';

export interface SearchResult {
  id: number;
  name: string;
  description: string;
  install_command: string;
  package_manager: string;
  platform: string[];
  category: string | null;
  source_url: string | null;
  similarity: number;
  success_rate: number;
  use_count: number;
  short_description: string | null;
  binaries: string[];
  usage_examples: Array<{ description: string; command: string }>;
}

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);

  return {
    async searchTools(queryEmbedding: number[], limit: number = 10): Promise<SearchResult[]> {
      const results = await sql`
        SELECT * FROM search_tools(
          ${JSON.stringify(queryEmbedding)}::vector(1536),
          0.4,
          ${limit}
        )
      `;
      return results as SearchResult[];
    },

    async logQuery(queryText: string, resultsCount: number): Promise<void> {
      await sql`
        INSERT INTO queries (query_text, results_count)
        VALUES (${queryText}, ${resultsCount})
      `;
    },

    async insertSignal(toolId: number, success: boolean, queryText?: string, agentType?: string, commandRan?: string, context?: string): Promise<void> {
      await sql`
        INSERT INTO signals (tool_id, query_text, success, agent_type, command_ran, context)
        VALUES (${toolId}, ${queryText ?? null}, ${success}, ${agentType ?? null}, ${commandRan ?? null}, ${context ?? null})
      `;
    },

    async getToolByName(name: string): Promise<SearchResult | null> {
      const results = await sql`
        SELECT id, name, description, short_description, install_command,
               package_manager, platform, category, source_url, binaries,
               usage_examples,
               0 as similarity, 0.5 as success_rate, 0 as use_count
        FROM tools
        WHERE lower(name) = lower(${name})
        LIMIT 1
      `;
      return (results[0] as SearchResult) ?? null;
    },

    async listTools(options: { category?: string; limit?: number; offset?: number } = {}): Promise<{ tools: SearchResult[]; total: number }> {
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;

      const countResult = options.category
        ? await sql`SELECT COUNT(*)::int as count FROM tools WHERE category = ${options.category}`
        : await sql`SELECT COUNT(*)::int as count FROM tools`;

      const results = options.category
        ? await sql`
            SELECT id, name, description, short_description, install_command,
                   package_manager, platform, category, source_url, binaries,
                   usage_examples,
                   0 as similarity, 0.5 as success_rate, 0 as use_count
            FROM tools
            WHERE category = ${options.category}
            ORDER BY name ASC
            LIMIT ${limit} OFFSET ${offset}
          `
        : await sql`
            SELECT id, name, description, short_description, install_command,
                   package_manager, platform, category, source_url, binaries,
                   usage_examples,
                   0 as similarity, 0.5 as success_rate, 0 as use_count
            FROM tools
            ORDER BY name ASC
            LIMIT ${limit} OFFSET ${offset}
          `;

      return { tools: results as SearchResult[], total: countResult[0].count };
    },

    async getCategories(): Promise<Array<{ category: string; count: number }>> {
      const results = await sql`
        SELECT category, COUNT(*)::int as count
        FROM tools
        WHERE category IS NOT NULL AND category != ''
        GROUP BY category
        ORDER BY count DESC
      `;
      return results as Array<{ category: string; count: number }>;
    },
  };
}
