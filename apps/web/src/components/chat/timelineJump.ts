/**
 * Asks the mounted timeline for a thread to scroll one of its messages into view. The pinned
 * list in the titlebar is far from the list's ref, so it posts here instead of threading a ref
 * through the chat view.
 */
export interface TimelineJumpRequest {
  readonly threadKey: string;
  readonly messageId: string;
}

type TimelineJumpListener = (request: TimelineJumpRequest) => boolean;

const listeners = new Set<TimelineJumpListener>();

export function subscribeTimelineJump(listener: TimelineJumpListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when a timeline took the request. */
export function requestTimelineJump(request: TimelineJumpRequest): boolean {
  let handled = false;
  for (const listener of listeners) {
    handled = listener(request) || handled;
  }
  return handled;
}
