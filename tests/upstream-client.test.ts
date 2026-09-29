import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createUpstreamClient } from "../src/lib/upstream/client";

const schema = z.object({ ok: z.boolean() });

function clientReturning(response: () => Response, options: { minIntervalMs?: number } = {}) {
  const requests: RequestInit[] = [];
  const sleeps: number[] = [];
  let clock = 0;
  const client = createUpstreamClient({
    fetch: (async (_url: string, init: RequestInit) => {
      requests.push(init);
      return response();
    }) as typeof fetch,
    minIntervalMs: options.minIntervalMs ?? 0,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
  });
  return { client, requests, sleeps, advance: (ms: number) => (clock += ms) };
}

describe("upstream client", () => {
  it("returns the parsed body when it matches the schema", async () => {
    const { client } = clientReturning(() => Response.json({ ok: true }));
    await expect(client.fetchJson("https://tw.ncsoft.com/x", schema)).resolves.toEqual({ ok: true });
  });

  it("names the failing field when the body does not match", async () => {
    const { client } = clientReturning(() => Response.json({ ok: "yes" }));
    await expect(client.fetchJson("https://tw.ncsoft.com/x", schema)).rejects.toThrow(/failed validation: ok:/);
  });

  it("refuses to follow redirects and identifies itself", async () => {
    const { client, requests } = clientReturning(() => Response.json({ ok: true }));
    await client.fetchJson("https://tw.ncsoft.com/x", schema);
    expect(requests[0].redirect).toBe("error");
    expect(new Headers(requests[0].headers).get("User-Agent")).toMatch(/^party-planner/);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("waits out the minimum interval between requests", async () => {
    const { client, sleeps, advance } = clientReturning(() => Response.json({ ok: true }), { minIntervalMs: 1500 });

    await client.fetchJson("https://tw.ncsoft.com/a", schema);
    advance(400);
    await client.fetchJson("https://tw.ncsoft.com/b", schema);
    advance(2000);
    await client.fetchJson("https://tw.ncsoft.com/c", schema);

    expect(sleeps).toEqual([1100]);
    expect(client.requestCount()).toBe(3);
  });

  it("wraps network failures with the URL", async () => {
    const client = createUpstreamClient({
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
      minIntervalMs: 0,
    });
    await expect(client.fetchJson("https://tw.ncsoft.com/x", schema)).rejects.toThrow(
      "request failed: fetch failed (https://tw.ncsoft.com/x)",
    );
  });

  it("stops reading a body that grows past 5 MB", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(32);
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    const { client } = clientReturning(() => new Response(endless));

    await expect(client.fetchJson("https://tw.ncsoft.com/x", schema)).rejects.toThrow("response larger than");
    expect(pulled).toBeLessThan(10);
  });

  it("wraps a failure while reading the body with the URL", async () => {
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    const { client } = clientReturning(() => new Response(broken));

    await expect(client.fetchJson("https://tw.ncsoft.com/x", schema)).rejects.toThrow(
      "reading the response failed: connection reset (https://tw.ncsoft.com/x)",
    );
  });
});
