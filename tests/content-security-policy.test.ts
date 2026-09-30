import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "../src/proxy";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

describe("content security policy", () => {
  const production = directives(contentSecurityPolicy("abc123", false));
  const development = directives(contentSecurityPolicy("abc123", true));

  it("only runs scripts carrying this response's nonce", () => {
    expect(production.get("script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it("never allows eval in production", () => {
    expect(production.get("script-src")).not.toContain("'unsafe-eval'");
    expect(development.get("script-src")).toContain("'unsafe-eval'");
  });

  it("forbids framing, plugins and base rewrites", () => {
    expect(production.get("frame-ancestors")).toEqual(["'none'"]);
    expect(production.get("object-src")).toEqual(["'none'"]);
    expect(production.get("base-uri")).toEqual(["'none'"]);
  });

  it("keeps images, fonts and connections on this origin", () => {
    expect(production.get("img-src")).toEqual(["'self'", "blob:", "data:"]);
    expect(production.get("font-src")).toEqual(["'self'"]);
    expect(production.get("connect-src")).toEqual(["'self'"]);
  });
});
