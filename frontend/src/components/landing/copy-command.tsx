"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/** A terminal-style block with a copy button. Lines starting with "#" render as comments. */
export function CopyCommand({ lines, className }: { lines: string[]; className?: string }) {
  const [copied, setCopied] = useState(false);
  const text = lines.filter((l) => !l.startsWith("#")).join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className={cn("relative overflow-hidden rounded-lg border bg-[#141412] text-[#ecebe4] dark:bg-[#0b0b0a]", className)}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2 rounded-full bg-white/15" />
          <span className="size-2 rounded-full bg-white/15" />
          <span className="size-2 rounded-full bg-white/15" />
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-white/60 uppercase transition-colors hover:text-white"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-7">
        {lines.map((line, i) =>
          line.startsWith("#") ? (
            <div key={i} className="text-white/40">
              {line}
            </div>
          ) : (
            <div key={i}>
              <span className="text-[#e55d27] select-none">$ </span>
              {line}
            </div>
          ),
        )}
      </pre>
    </div>
  );
}
