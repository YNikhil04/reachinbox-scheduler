import { parse } from "csv-parse/sync";

export interface ParsedRecipients {
  emails: string[];
  count: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRecipientsFromCsv(fileBuffer: Buffer): ParsedRecipients {
  const text = fileBuffer.toString("utf-8");

  // Try structured CSV parsing first (handles headers like "email,name")
  let rows: string[][];
  try {
    rows = parse(text, { skip_empty_lines: true, relax_column_count: true });
  } catch {
    // fallback: treat as plain newline/comma separated text
    rows = text.split(/[\n,]/).map((line) => [line.trim()]);
  }

  const emails = new Set<string>();

  for (const row of rows) {
    for (const cell of row) {
      const candidate = cell?.trim();
      if (candidate && EMAIL_REGEX.test(candidate)) {
        emails.add(candidate.toLowerCase());
      }
    }
  }

  return { emails: Array.from(emails), count: emails.size };
}
