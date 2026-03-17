import Link from "next/link";
import { Navbar, NavbarLeft, NavbarRight } from "@/components/ui/navbar";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "lucide-react";
import { siteConfig } from "@/config/site";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="line-b px-4">
        <div className="mx-auto max-w-4xl">
          <Navbar>
            <NavbarLeft>
              <Link href="/" className="font-mono font-semibold">
                need
              </Link>
              <Link href="/tools" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
                Browse
              </Link>
            </NavbarLeft>
            <NavbarRight>
              <Button variant="ghost" size="icon" asChild>
                <a href={siteConfig.links.github} target="_blank" rel="noopener noreferrer">
                  <GithubIcon className="size-4" />
                </a>
              </Button>
            </NavbarRight>
          </Navbar>
        </div>
      </div>
      {children}
    </div>
  );
}
