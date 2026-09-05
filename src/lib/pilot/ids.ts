export function nextPublicId(prefix: string, n: number, year = 2026): string {
  return `${prefix}-${year}-${String(n).padStart(5, "0")}`;
}

export function rid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${Date.now().toString(36).slice(-4)}`;
}

export function requestId(): string {
  return `req_${Math.random().toString(36).slice(2, 12)}`;
}
