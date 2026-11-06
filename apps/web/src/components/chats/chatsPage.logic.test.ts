import { describe, expect, it } from "vite-plus/test";

import { chatDateBucket, chatMatchesTab } from "./chatsPage.logic";

describe("chatDateBucket", () => {
  const now = new Date(2026, 10, 5, 11, 30);
  it.each([
    [new Date(2026, 10, 5, 0, 1), "Today"],
    [new Date(2026, 10, 4, 23, 59), "Yesterday"],
    [new Date(2026, 10, 4, 0, 0), "Yesterday"],
    [new Date(2026, 10, 1), "Previous 7 days"],
    [new Date(2026, 9, 20), "Previous 30 days"],
  ])("puts %s in %s", (date, bucket) => {
    expect(chatDateBucket(date.getTime(), now)).toBe(bucket);
  });

  it("names older months, with the year only when it differs", () => {
    const sameYear = new Date(2026, 1, 3);
    const lastYear = new Date(2025, 1, 3);
    expect(chatDateBucket(sameYear.getTime(), now)).toBe(
      sameYear.toLocaleDateString(undefined, { month: "long" }),
    );
    expect(chatDateBucket(lastYear.getTime(), now)).toBe(
      lastYear.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    );
  });
});

describe("chatMatchesTab", () => {
  it("keeps snoozed and settled chats out of Active", () => {
    expect(chatMatchesTab("active", "working")).toBe(true);
    expect(chatMatchesTab("active", "needs-you")).toBe(true);
    expect(chatMatchesTab("active", "snoozed")).toBe(false);
    expect(chatMatchesTab("active", "settled")).toBe(false);
    expect(chatMatchesTab("settled", "settled")).toBe(true);
    expect(chatMatchesTab("all", "snoozed")).toBe(true);
  });
});
