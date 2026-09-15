"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { GithubIcon } from "@/components/landing/github-icon";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { GITHUB_URL } from "@/content/snapshot";

const LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#results", label: "Results" },
  { href: "#run", label: "Run it" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-8 px-4 sm:px-8">
        <Link href="/" aria-label="Load Predictor home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            className="flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <GithubIcon className="size-4" />
          </a>
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="hidden h-9 items-center gap-1.5 rounded-md bg-foreground px-3.5 text-sm font-medium text-background transition-opacity hover:opacity-90 sm:flex"
          >
            Dashboard <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
