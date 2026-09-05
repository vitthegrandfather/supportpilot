import { hash32, tokenize } from "./tokenize";

export const EMBED_DIM = 256;

export interface EmbeddingProvider {
  readonly name: string;
  embed(text: string): number[] | Promise<number[]>;
  embedMany(texts: string[]): number[][] | Promise<number[][]>;
}

export class SandboxEmbeddingProvider implements EmbeddingProvider {
  readonly name = "sandbox-hash-v1";

  embed(text: string): number[] {
    const vec = new Array<number>(EMBED_DIM).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vec;
    for (const token of tokens) {
      const h = hash32(token);
      vec[h % EMBED_DIM] += 1;
      vec[(h >>> 8) % EMBED_DIM] += 0.45;
      vec[(h >>> 16) % EMBED_DIM] += 0.2;
      if (token.length > 4) {
        const bi = hash32(token.slice(0, 4));
        vec[bi % EMBED_DIM] += 0.15;
      }
    }
    return l2Normalize(vec);
  }

  embedMany(texts: string[]): number[][] {
    return texts.map((t) => this.embed(t));
  }
}

export function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const n = Math.sqrt(sum) || 1;
  return vec.map((v) => v / n);
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i += 1) dot += a[i] * b[i];
  return Math.max(-1, Math.min(1, dot));
}

/** Adapter surface for a future hosted embedding API. Not used in preview. */
export class OpenAIEmbeddingAdapter implements EmbeddingProvider {
  readonly name = "openai-adapter";
  constructor(private readonly _apiKey?: string) {}
  embed(_text: string): number[] {
    throw new Error("Hosted embedding providers are disabled in this demo.");
  }
  embedMany(_texts: string[]): number[][] {
    throw new Error("Hosted embedding providers are disabled in this demo.");
  }
}
