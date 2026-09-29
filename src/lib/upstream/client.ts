import type { z } from "zod";

export const UPSTREAM_ORIGIN = "https://tw.ncsoft.com";
export const SITE_API = `${UPSTREAM_ORIGIN}/aion2/api`;
export const DICTIONARY_API = `${UPSTREAM_ORIGIN}/aion2_tw/v2.0`;

const USER_AGENT = "party-planner catalog sync (+https://github.com/MartinLVila/party-planner)";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(`${message} (${url})`);
    this.name = "UpstreamError";
  }
}

export type FetchJson = <Schema extends z.ZodType>(url: string, schema: Schema) => Promise<z.infer<Schema>>;

export interface UpstreamClientOptions {
  fetch?: typeof fetch;
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createUpstreamClient(options: UpstreamClientOptions = {}): {
  fetchJson: FetchJson;
  requestCount: () => number;
} {
  const doFetch = options.fetch ?? fetch;
  const minIntervalMs = options.minIntervalMs ?? 1_500;
  const sleep = options.sleep ?? wait;
  const now = options.now ?? Date.now;
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  let requests = 0;

  const fetchJson: FetchJson = async (url, schema) => {
    const elapsed = now() - lastRequestAt;
    if (elapsed < minIntervalMs) await sleep(minIntervalMs - elapsed);
    lastRequestAt = now();
    requests += 1;

    let response: Response;
    try {
      response = await doFetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new UpstreamError(`request failed: ${error instanceof Error ? error.message : String(error)}`, url);
    }

    if (!response.ok) throw new UpstreamError(`HTTP ${response.status}`, url);

    const body = await response.text();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new UpstreamError(`response larger than ${MAX_BODY_BYTES} bytes`, url);
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new UpstreamError("response is not JSON", url);
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      throw new UpstreamError(`response failed validation: ${issues}`, url);
    }
    return parsed.data;
  };

  return { fetchJson, requestCount: () => requests };
}
