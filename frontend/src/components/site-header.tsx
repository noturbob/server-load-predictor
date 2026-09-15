"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

import { Logo } from "@/components/logo";
import { SimControls } from "@/components/sim-controls";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Fleet", match: (p: string) => p === "/" || p.startsWith("/clusters") },
  { href: "/models", label: "Models", match: (p: string) => p.startsWith("/models") },
  { href: "/settings", label: "Policy", match: (p: string) => p.startsWith("/settings") },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-auto w-full max-w-[1320px] flex-wrap items-stretch gap-x-8 px-4 sm:h-16 sm:flex-nowrap sm:px-8">
        <Link href="/" className="flex h-14 items-center sm:h-auto" aria-label="Load Predictor home">
          <Logo />
        </Link>

        <nav className="order-3 -mx-1 flex w-full items-stretch gap-1 sm:order-none sm:mx-0 sm:w-auto">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center px-3 py-3 text-sm transition-colors sm:py-0",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors",
                    active ? "bg-brand" : "bg-transparent",
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <SimControls />
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <Sun className="size-4 dark:hidden" />
            <Moon className="hidden size-4 dark:block" />
          </button>
        </div>
      </div>
    </header>
  );
}
