import { describe, expect, it } from "vitest";
import { iconPathFromUrl, iconUrl } from "../src/lib/game-assets";

const BASE = "https://assets.playnccdn.com/static-aion2-gamedata/resources/";

describe("iconPathFromUrl", () => {
  it("keeps the file name of an icon on the game CDN", () => {
    expect(iconPathFromUrl(`${BASE}Icon_WP_GS_0110_T05.png`)).toBe("Icon_WP_GS_0110_T05.png");
  });

  it("round-trips through iconUrl", () => {
    const url = `${BASE}ICON_CL_SKILL_001.png`;
    expect(iconUrl(iconPathFromUrl(url) ?? "")).toBe(url);
  });

  it.each([
    ["another host", "https://evil.example/static-aion2-gamedata/resources/a.png"],
    ["a look-alike host", "https://assets.playnccdn.com.evil.example/static-aion2-gamedata/resources/a.png"],
    ["plain http", "http://assets.playnccdn.com/static-aion2-gamedata/resources/a.png"],
    ["another path", "https://assets.playnccdn.com/other/a.png"],
    ["a nested path", `${BASE}nested/a.png`],
    ["an encoded traversal", `${BASE}..%2F..%2Fsecret.png`],
    ["a query string", `${BASE}a.png?x=1`],
    ["credentials", "https://user:pass@assets.playnccdn.com/static-aion2-gamedata/resources/a.png"],
    ["a non-png file", `${BASE}a.svg`],
    ["garbage", "not a url"],
  ])("rejects %s", (_label, url) => {
    expect(iconPathFromUrl(url)).toBeNull();
  });
});
