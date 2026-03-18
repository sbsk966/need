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
