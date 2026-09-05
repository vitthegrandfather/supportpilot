export function escapeHtml(s: string): string {
  const amp = String.fromCharCode(38);
  return s
    .replace(/&/g, `${amp}amp;`)
    .replace(/</g, `${amp}lt;`)
    .replace(/>/g, `${amp}gt;`)
    .replace(/"/g, `${amp}quot;`)
    .replace(/'/g, `${amp}#39;`);
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "document";
  return base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "document";
}

export const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
]);

export const ALLOWED_EXT = new Set([".pdf", ".docx", ".txt", ".md", ".markdown", ".html", ".htm"]);

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function validateUpload(filename: string, mime: string, size: number): string | null {
  const safe = sanitizeFilename(filename);
  const ext = `.${safe.split(".").pop()?.toLowerCase() ?? ""}`;
  if (!ALLOWED_EXT.has(ext)) return "Unsupported file type. Allowed: PDF, DOCX, TXT, Markdown, HTML.";
  if (mime && !ALLOWED_MIME.has(mime) && mime !== "application/octet-stream") {
    return "MIME type does not match an allowed knowledge format.";
  }
  if (size > MAX_UPLOAD_BYTES) return "File exceeds the 8 MB upload limit.";
  return null;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9]{10,}/g, "sk-[redacted]")
    .replace(/(api[_-]?key|secret|token|password)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9\-._]+/g, "Bearer [redacted]");
}

export function csvSafe(value: string): string {
  const v = String(value ?? "");
  const prefixed = /^[=+\-@|]/.test(v) ? `'${v}` : v;
  if (/[",\n]/.test(prefixed)) return `"${prefixed.replace(/"/g, '""')}"`;
  return prefixed;
}

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const cut = now - this.windowMs;
    const prev = (this.hits.get(key) ?? []).filter((t) => t > cut);
    if (prev.length >= this.max) {
      this.hits.set(key, prev);
      return false;
    }
    prev.push(now);
    this.hits.set(key, prev);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

export const generateLimiter = new SlidingWindowLimiter(20, 60_000);
export const mutateLimiter = new SlidingWindowLimiter(80, 60_000);
