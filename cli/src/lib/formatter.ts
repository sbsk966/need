import type { ToolResult } from './types.js';

export function formatResults(results: ToolResult[]): string {
  if (results.length === 0) {
    return '\n  No tools found for that query. Try different words.\n';
  }

  const lines = results.map((tool, i) => {
    const num = `  ${i + 1}.`;

    // Social proof line — only show what we have real data for
    const parts: string[] = [];
    if (tool.github_stars > 0) {
      parts.push(`★ ${formatCount(tool.github_stars)} stars`);
    }
    if (tool.use_count >= 10) {
      parts.push(`${Math.round(tool.success_rate * 100)}% success`);
      parts.push(`${formatCount(tool.use_count)} agent uses`);
    }
    const socialProof = parts.length > 0
      ? `\n     ${parts.join(' · ')}`
      : '';

    let block = `${num} ${tool.name}\n     ${tool.install_command}${socialProof}`;

    if (tool.usage_examples && tool.usage_examples.length > 0) {
      const examples = tool.usage_examples
        .slice(0, 3)
        .map((ex) => `       ${ex.command}  # ${ex.description}`)
        .join('\n');
      block += '\n     Usage:\n' + examples;
    }

    return block;
  });

  return '\n' + lines.join('\n\n') + '\n';
}

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return String(n);
}
