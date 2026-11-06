import { describe, expect, it } from "vite-plus/test";

import { popoutWindowHref } from "./popoutWindow";

describe("popoutWindowHref", () => {
  it.each([
    [false, "https://app.example/env/old?x=1", "https://app.example/env/thread-1?popout=1"],
    [true, "t3code://app/index.html#/env/old", "t3code://app/index.html?popout=1#/env/thread-1"],
  ])("routes the pop-out to the thread (hash routing: %s)", (hashRouting, current, expected) => {
    expect(popoutWindowHref("/env/thread-1", new URL(current), hashRouting)).toBe(expected);
  });
});
