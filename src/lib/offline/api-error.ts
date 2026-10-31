/** An error from a site call. `status` is 0 for a transport failure (no HTTP response). */
export class ApiError extends Error {
  status: number;
  network: boolean;
  excType: string | null;
  constructor(message: string, opts: { status?: number; network?: boolean; excType?: string | null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status ?? 0;
    this.network = opts.network ?? false;
    this.excType = opts.excType ?? null;
  }
}
