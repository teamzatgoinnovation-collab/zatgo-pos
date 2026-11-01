/** Frappe messages carry HTML (<strong>, links) and entities: show them as plain text. */
export function plainMessage(raw: string): string {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** An error from a site call. `status` is 0 for a transport failure (no HTTP response). */
export class ApiError extends Error {
  status: number;
  network: boolean;
  excType: string | null;
  constructor(message: string, opts: { status?: number; network?: boolean; excType?: string | null } = {}) {
    super(plainMessage(message));
    this.name = "ApiError";
    this.status = opts.status ?? 0;
    this.network = opts.network ?? false;
    this.excType = opts.excType ?? null;
  }
}
