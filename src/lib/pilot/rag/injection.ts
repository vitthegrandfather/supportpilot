export interface InjectionFinding {
  matched: boolean;
  patterns: string[];
  excerpt: string | null;
}

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "ignore_previous", re: /ignore (all )?(previous|prior|above|system) (instructions|rules|policies|prompts)/i },
  { name: "system_override", re: /system override|developer mode|unrestricted mode|jailbreak/i },
  { name: "reveal_secrets", re: /reveal .{0,48}(api key|secret|token|password|credentials)/i },
  { name: "disregard_safety", re: /disregard (your )?(safety|system|content) (rules|policy|prompt)/i },
  { name: "print_token", re: /print the internal (api|auth)?\s?(token|key|secret)/i },
  { name: "always_refund", re: /always (approve|issue) (full )?refunds without (verification|review)/i },
];

export function detectPromptInjection(text: string): InjectionFinding {
  const patterns: string[] = [];
  let excerpt: string | null = null;
  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (m) {
      patterns.push(p.name);
      if (!excerpt) {
        const start = Math.max(0, m.index - 40);
        excerpt = text.slice(start, m.index + m[0].length + 40).replace(/\s+/g, " ").trim();
      }
    }
  }
  return { matched: patterns.length > 0, patterns, excerpt };
}

export function stripInjectedChunks<T extends { text: string }>(
  chunks: T[],
): { kept: T[]; flagged: (T & { flagReason: string })[] } {
  const kept: T[] = [];
  const flagged: (T & { flagReason: string })[] = [];
  for (const chunk of chunks) {
    const finding = detectPromptInjection(chunk.text);
    if (finding.matched) {
      flagged.push({
        ...chunk,
        flagReason: `Prompt-injection patterns: ${finding.patterns.join(", ")}`,
      });
    } else {
      kept.push(chunk);
    }
  }
  return { kept, flagged };
}
