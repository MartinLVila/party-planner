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

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function readCappedBody(response: Response, url: string): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new UpstreamError(`response larger than ${MAX_BODY_BYTES} bytes`, url);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(`reading the response failed: ${describe(error)}`, url);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
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
      throw new UpstreamError(`request failed: ${describe(error)}`, url);
    }

    if (!response.ok) throw new UpstreamError(`HTTP ${response.status}`, url);

    const body = await readCappedBody(response, url);

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
