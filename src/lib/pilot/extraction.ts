import { cleanupText } from "./rag/chunking";
import { ApiError } from "./errors";

export interface ExtractionResult {
  text: string;
  metadata: {
    title?: string;
    pages?: number;
    sourceType: string;
  };
}

export interface TextExtractor {
  supports(filename: string, mime: string): boolean;
  extract(filename: string, content: string | Uint8Array, mime: string): Promise<ExtractionResult>;
}

export class PlainTextExtractor implements TextExtractor {
  supports(filename: string, mime: string): boolean {
    return (
      mime.startsWith("text/") ||
      /\.(txt|md|markdown|html|htm|csv)$/i.test(filename)
    );
  }
  async extract(filename: string, content: string | Uint8Array): Promise<ExtractionResult> {
    const raw = typeof content === "string" ? content : new TextDecoder().decode(content);
    const text = cleanupText(stripHtml(raw));
    if (!text) throw new ApiError("extraction_failed", "The file did not contain extractable text.", 422);
    return {
      text,
      metadata: { title: filename, pages: 1, sourceType: extType(filename) },
    };
  }
}

export class PdfExtractorStub implements TextExtractor {
  supports(filename: string, mime: string): boolean {
    return mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
  }
  async extract(filename: string, content: string | Uint8Array): Promise<ExtractionResult> {
    if (typeof content === "string" && !content.startsWith("%PDF")) {
      const text = cleanupText(content);
      return { text, metadata: { title: filename, pages: 1, sourceType: "pdf" } };
    }
    throw new ApiError(
      "extraction_unavailable",
      "Binary PDF parsing is provided by the production extractor. Paste text or use Markdown/TXT in this demo.",
      422,
    );
  }
}

export class DocxExtractorStub implements TextExtractor {
  supports(filename: string, mime: string): boolean {
    return (
      mime.includes("wordprocessingml") || filename.toLowerCase().endsWith(".docx")
    );
  }
  async extract(filename: string, content: string | Uint8Array): Promise<ExtractionResult> {
    if (typeof content === "string") {
      return {
        text: cleanupText(content),
        metadata: { title: filename, pages: 1, sourceType: "docx" },
      };
    }
    throw new ApiError(
      "extraction_unavailable",
      "Binary DOCX parsing is provided by the production extractor. Paste text or use Markdown/TXT in this demo.",
      422,
    );
  }
}

const EXTRACTORS: TextExtractor[] = [
  new PlainTextExtractor(),
  new PdfExtractorStub(),
  new DocxExtractorStub(),
];

export async function extractDocument(
  filename: string,
  content: string | Uint8Array,
  mime: string,
): Promise<ExtractionResult> {
  const extractor = EXTRACTORS.find((e) => e.supports(filename, mime));
  if (!extractor) {
    throw new ApiError("unsupported_type", "No extractor is registered for this file type.", 415);
  }
  return extractor.extract(filename, content, mime);
}

function stripHtml(raw: string): string {
  if (!/<[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&");
}

function extType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  return "txt";
}
