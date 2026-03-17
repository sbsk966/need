export interface UsageExample {
  description: string;
  command: string;
}

export interface ToolResult {
  id: number;
  name: string;
  description: string;
  short_description: string | null;
  install_command: string;
  package_manager: string;
  platform: string[];
  category: string | null;
  source_url: string | null;
  binaries: string[];
  usage_examples: UsageExample[];
  similarity: number;
  success_rate: number;
  use_count: number;
}

/** Alias used by api-client */
export type SearchResult = ToolResult;
