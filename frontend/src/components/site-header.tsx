"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/logo";
import { SimControls } from "@/components/sim-controls";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Fleet", match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/clusters") },
  { href: "/dashboard/models", label: "Models", match: (p: string) => p.startsWith("/dashboard/models") },
  { href: "/dashboard/policy", label: "Policy", match: (p: string) => p.startsWith("/dashboard/policy") },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-auto w-full max-w-[1320px] flex-wrap items-stretch gap-x-8 px-4 sm:h-16 sm:flex-nowrap sm:px-8">
        <Link href="/dashboard" className="flex h-14 items-center sm:h-auto" aria-label="Dashboard home">
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
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
