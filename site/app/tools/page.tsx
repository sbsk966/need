import { getCategories, listTools } from "@/lib/api";
import { SearchBar } from "@/components/ui/search-bar";
import Link from "next/link";

export const metadata = {
  title: "Browse CLI Tools | need",
  description: "Search and browse thousands of CLI tools. Find the right command-line tool in plain English.",
};

export default async function ToolsPage() {
  const categories = await getCategories();

  // If no categories exist yet, show total tool count from listTools
  const toolCount = categories.length > 0
    ? categories.reduce((sum, c) => sum + c.count, 0)
    : (await listTools({ limit: 1 })).total;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Find the right CLI tool
        </h1>
        <p className="text-muted-foreground max-w-lg text-lg">
          Search {toolCount.toLocaleString()}+ tools in plain English
        </p>
        <SearchBar />
      </div>

      {categories.length > 0 && (
        <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {categories.map((cat) => (
            <Link
              key={cat.category}
              href={`/tools/category/${encodeURIComponent(cat.category)}`}
              className="bg-card border-border hover:border-primary/30 rounded-xl border p-4 transition-colors"
            >
              <div className="text-foreground font-medium capitalize">{cat.category}</div>
              <div className="text-muted-foreground text-sm">{cat.count} tools</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
