import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { resolveSettledThreadTimestamp } from "@t3tools/client-runtime/state/thread-sort";

export type ChatsTab = "all" | "active" | "snoozed" | "settled";
export type ChatsGrouping = "date" | "project";
export type ChatStatus = "needs-you" | "working" | "snoozed" | "settled" | "open";

export function chatStatus(thread: EnvironmentThreadShell, now: string): ChatStatus {
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return "needs-you";
  if (effectiveSnoozed(thread, { now })) return "snoozed";
  if (thread.settledOverride === "settled") return "settled";
  return isThreadWorking(thread) ? "working" : "open";
}

export function chatMatchesTab(tab: ChatsTab, status: ChatStatus): boolean {
  if (tab === "all") return true;
  if (tab === "snoozed" || tab === "settled") return status === tab;
  return status !== "snoozed" && status !== "settled";
}

/** When the chat last moved: its settle time, else its latest message or run. */
export function chatActivityMs(thread: EnvironmentThreadShell): number {
  const at = resolveSettledThreadTimestamp(thread);
  const ms = at === null ? NaN : Date.parse(at);
  return Number.isNaN(ms) ? 0 : ms;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

/** "Today", "Yesterday", "Previous 7 days", "Previous 30 days", then one bucket per month. */
export function chatDateBucket(ms: number, now: Date): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ms >= startOfToday) return "Today";
  if (ms >= startOfToday - DAY_MS) return "Yesterday";
  if (ms >= startOfToday - 7 * DAY_MS) return "Previous 7 days";
  if (ms >= startOfToday - 30 * DAY_MS) return "Previous 30 days";
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, {
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Groups already-sorted items by key, keeping first-seen order. */
export function groupInOrder<T>(
  items: ReadonlyArray<T>,
  keyOf: (item: T) => string,
): Array<{ key: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups, ([key, groupItems]) => ({ key, items: groupItems }));
}
