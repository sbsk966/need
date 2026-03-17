import { getToolByName, listTools } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { InstallCommand } from "@/components/ui/install-command";
import { ToolCard } from "@/components/ui/tool-card";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";

export default async function ToolPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const tool = await getToolByName(decodeURIComponent(name));
  if (!tool) notFound();

  // Fetch related tools from same category
  const related = tool.category
    ? await listTools({ category: tool.category, limit: 6 }).then((r) =>
        r.tools.filter((t) => t.id !== tool.id).slice(0, 5)
      )
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Top */}
      <div className="flex flex-col gap-4">
        <h1 className="font-mono text-3xl font-bold">{tool.name}</h1>
        {tool.short_description && (
          <p className="text-muted-foreground text-lg">{tool.short_description}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{tool.package_manager}</Badge>
          {tool.platform?.map((p) => (
            <Badge key={p} variant="secondary">{p}</Badge>
          ))}
          {tool.category && (
            <Link href={`/tools/category/${encodeURIComponent(tool.category)}`}>
              <Badge variant="brand-secondary">{tool.category}</Badge>
            </Link>
          )}
        </div>
        <InstallCommand command={tool.install_command} />
        {tool.source_url && (
          <a
            href={tool.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
          >
            Source <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>

      {/* Middle */}
      <div className="mt-10 flex flex-col gap-8">
        <div>
          <h2 className="mb-3 text-lg font-semibold">About</h2>
          <p className="text-muted-foreground leading-relaxed">{tool.description}</p>
        </div>

        {tool.binaries && tool.binaries.length > 0 && (
          <div>
            <h2 className="mb-3 text-lg font-semibold">Commands</h2>
            <div className="flex flex-wrap gap-2">
              {tool.binaries.map((bin) => (
                <code key={bin} className="bg-muted rounded px-2 py-1 font-mono text-sm">{bin}</code>
              ))}
            </div>
          </div>
        )}

        {tool.usage_examples && tool.usage_examples.length > 0 && (
          <div>
            <h2 className="mb-3 text-lg font-semibold">Examples</h2>
            <div className="flex flex-col gap-4">
              {tool.usage_examples.map((example, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-sm">{example.description}</span>
                  <code className="bg-muted rounded-lg px-4 py-3 font-mono text-sm">
                    <span className="text-muted-foreground">$ </span>{example.command}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom */}
      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">Related Tools</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {related.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-12 text-center">
        <p className="text-muted-foreground text-sm">Try it in your terminal</p>
        <code className="text-foreground mt-2 inline-block font-mono text-sm">
          npx @needtools/need {tool.name}
        </code>
      </div>
    </div>
  );
}
