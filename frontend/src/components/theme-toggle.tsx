"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/** Magic UI's view-transition toggler, driven by next-themes so the choice persists. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // The saved theme is only known in the browser; render the server's default icon until hydrated.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <AnimatedThemeToggler
      theme={mounted ? theme : "light"}
      onThemeChange={setTheme}
      duration={550}
      aria-label="Toggle theme"
      className={cn(
        "flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4",
        className,
      )}
    />
  );
}
