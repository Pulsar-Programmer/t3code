import type { LegendListRef } from "@legendapp/list/react";
import type { AssistantCitation, MessageId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import {
  resolveAssistantCitationRange,
  type AssistantCitationSourceAnchor,
} from "~/lib/assistantTextSelection";
import { toastManager } from "../ui/toast";
import { observeResize } from "~/lib/observeResize";

const CITATION_HIGHLIGHT_RISE_MS = 280;
const CITATION_HIGHLIGHT_HOLD_MS = 2400;
const CITATION_HIGHLIGHT_FADE_MS = 900;
const CITATION_HIGHLIGHT_TOTAL_MS =
  CITATION_HIGHLIGHT_RISE_MS + CITATION_HIGHLIGHT_HOLD_MS + CITATION_HIGHLIGHT_FADE_MS;
const CITATION_HIGHLIGHT_OPACITY = "--assistant-citation-highlight-opacity";
// index.css scales the underline by 3x, so the peak stays at or under 1/3.
const CITATION_HIGHLIGHT_PEAK = 0.3;

/** One box per visual line of `range`, from text nodes only (element rects would cover whole blocks). */
function rangeLineRects(range: Range) {
  const common = range.commonAncestorContainer;
  const doc = common.ownerDocument ?? document;
  const walker = doc.createTreeWalker(common, NodeFilter.SHOW_TEXT);
  const piece = doc.createRange();
  const lines: { left: number; right: number; top: number; bottom: number }[] = [];
  for (
    let node = common.nodeType === Node.TEXT_NODE ? common : walker.nextNode();
    node;
    node = walker.nextNode()
  ) {
    if (!range.intersectsNode(node)) continue;
    // Unselectable chrome (copy buttons, labels) never shows as selected natively either.
    if (node.parentElement && getComputedStyle(node.parentElement).userSelect === "none") continue;
    piece.selectNodeContents(node);
    if (node === range.startContainer) piece.setStart(node, range.startOffset);
    if (node === range.endContainer) piece.setEnd(node, range.endOffset);
    for (const rect of piece.getClientRects()) {
      // Clipped screen-reader copies (KaTeX MathML) report 1px rects.
      if (rect.width < 2 || rect.height < 2) continue;
      // ponytail: linear scan per rect; fine for quote-sized ranges.
      const line = lines.find((l) => rect.top < l.bottom && rect.bottom > l.top);
      if (!line) {
        lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
        continue;
      }
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
    }
  }
  return lines;
}

/** Paints `range` into the source's marker layer, padded by `--citation-highlight-padding`. */
function paintCitationMarker(
  source: HTMLElement,
  range: Range | null,
  owner: object,
  look: "reveal" | "comment" | "selection",
) {
  const layer = source.parentElement?.querySelector<HTMLElement>(
    ":scope > [data-citation-markers]",
  );
  if (!layer) return;
  for (const old of markerBoxes.get(owner) ?? []) old.remove();
  markerBoxes.delete(owner);
  if (!range) return;
  const origin = layer.getBoundingClientRect();
  const boxes = rangeLineRects(range).map((line) => {
    const box = layer.ownerDocument.createElement("span");
    box.dataset.look = look;
    box.style.setProperty("--x", `${line.left - origin.left}px`);
    box.style.setProperty("--y", `${line.top - origin.top}px`);
    box.style.setProperty("--w", `${line.right - line.left}px`);
    box.style.setProperty("--h", `${line.bottom - line.top}px`);
    return box;
  });
  layer.append(...boxes);
  markerBoxes.set(owner, boxes);
}
const markerBoxes = new WeakMap<object, HTMLElement[]>();

/**
 * Follows the live text selection inside `viewport` with padded marker boxes. Sources it paints
 * get `data-selection-marked`, which hides the native selection paint there (see index.css).
 */
export function observeAssistantSelectionMarker(viewport: HTMLElement): () => void {
  const doc = viewport.ownerDocument;
  let marked = new Set<HTMLElement>();
  let frame: number | null = null;
  const unmark = (source: HTMLElement) => {
    paintCitationMarker(source, null, source, "selection");
    delete source.dataset.selectionMarked;
  };
  const paint = () => {
    frame = null;
    const selection = doc.getSelection();
    const range =
      selection && selection.rangeCount > 0 && !selection.isCollapsed
        ? selection.getRangeAt(0)
        : null;
    const next = new Set<HTMLElement>();
    if (range) {
      for (const source of viewport.querySelectorAll<HTMLElement>(
        "[data-assistant-citation-source]",
      )) {
        if (!range.intersectsNode(source)) continue;
        const part = range.cloneRange();
        if (!source.contains(range.startContainer)) part.setStart(source, 0);
        if (!source.contains(range.endContainer)) part.setEnd(source, source.childNodes.length);
        paintCitationMarker(source, part, source, "selection");
        source.dataset.selectionMarked = "";
        next.add(source);
      }
    }
    for (const source of marked) if (!next.has(source)) unmark(source);
    marked = next;
  };
  const onSelectionChange = () => {
    frame ??= requestAnimationFrame(paint);
  };
  doc.addEventListener("selectionchange", onSelectionChange);
  return () => {
    doc.removeEventListener("selectionchange", onSelectionChange);
    if (frame !== null) cancelAnimationFrame(frame);
    for (const source of marked) unmark(source);
  };
}

export function observeAssistantCitationCommentSource({
  anchor,
  citation,
  onUnavailable,
}: {
  anchor: AssistantCitationSourceAnchor;
  citation: AssistantCitation;
  onUnavailable: () => void;
}): () => void {
  const { source, range, viewport } = anchor;
  const owner = {};
  let stopped = false;
  const paint = () => {
    if (!stopped) paintCitationMarker(source, range, owner, "comment");
  };
  const observer = new MutationObserver((records) => {
    if (stopped) return;
    // Repainting on our own marker boxes would loop.
    const external = records.filter(
      (record) =>
        !(record.target instanceof Element && record.target.matches("[data-citation-markers]")),
    );
    if (external.length === 0) return;
    const sourceChanged = external.some((record) => source.contains(record.target));
    if (validate(sourceChanged)) paint();
  });
  let stopObservingResize = () => {};
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    stopObservingResize();
    paintCitationMarker(source, null, owner, "comment");
  };
  const unavailable = () => {
    if (stopped) return;
    dispose();
    onUnavailable();
  };
  const validate = (sourceChanged: boolean): boolean => {
    if (!source.isConnected || !viewport.contains(source)) {
      unavailable();
      return false;
    }
    if (
      sourceChanged ||
      range.collapsed ||
      !source.contains(range.startContainer) ||
      !source.contains(range.endContainer)
    ) {
      const repaired = resolveAssistantCitationRange(source, citation);
      if (!repaired) {
        unavailable();
        return false;
      }
      range.setStart(repaired.startContainer, repaired.startOffset);
      range.setEnd(repaired.endContainer, repaired.endOffset);
    }
    return true;
  };

  if (!validate(false)) return dispose;
  paint();
  observer.observe(viewport, { childList: true, subtree: true, characterData: true });
  stopObservingResize = observeResize([source], paint);
  return dispose;
}

export interface AssistantCitationRequest {
  citation: AssistantCitation;
  key: string;
}

/** Navigation owns activation state across virtual row remounts. */
export interface AssistantCitationTarget extends AssistantCitationRequest {
  activationRef: RefObject<{
    scrolled: boolean;
    dismissed: boolean;
    cancelScroll?: () => void;
    pulse?: { startedAt: number; reducedMotion: boolean };
  }>;
  onComplete: () => void;
}

function observeAssistantCitationSource({
  root,
  itemKey,
  request,
  list,
}: {
  root: HTMLElement;
  itemKey: string;
  request: AssistantCitationTarget;
  list: LegendListRef;
}) {
  const activation = request.activationRef.current;
  if (activation.dismissed) return;
  const scrollNode = list.getScrollableNode();
  if (!(scrollNode instanceof HTMLElement)) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const owner = {};
  let ownedRange: Range | null = null;
  let frame: number | null = null;
  let scrolling = false;
  let stopped = false;
  let pulseAnimation: Animation | null = null;
  const clear = () => {
    paintCitationMarker(root, null, owner, "reveal");
    ownedRange = null;
    delete root.dataset.citationHighlighted;
  };
  const finishHighlight = () => {
    if (stopped) return;
    activation.dismissed = true;
    dispose();
  };
  const highlight = () => {
    frame = null;
    if (stopped || activation.dismissed || !root.isConnected || !scrollNode.contains(root)) {
      clear();
      return;
    }
    if (
      activation.pulse &&
      performance.now() - activation.pulse.startedAt >= CITATION_HIGHLIGHT_TOTAL_MS
    ) {
      finishHighlight();
      return;
    }
    const state = list.getState();
    const index = state.indexByKey(itemKey);
    if (index === undefined || !(state.sizeAtIndex(index) > 0)) return;
    const range = resolveAssistantCitationRange(root, request.citation);
    const rect = (range ?? root).getBoundingClientRect();
    if (rect.height <= 0 || scrollNode.clientHeight <= 0) {
      clear();
      return;
    }
    if (!activation.scrolled) {
      if (scrolling) return;
      const scrollRect = scrollNode.getBoundingClientRect();
      const offset = Math.max(
        0,
        Math.min(
          scrollNode.scrollHeight - scrollNode.clientHeight,
          state.scroll + rect.top - scrollRect.top - Math.min(120, scrollNode.clientHeight / 3),
        ),
      );
      if (Math.abs(offset - state.scroll) > 1) {
        scrolling = true;
        void list.scrollToOffset({ offset, animated: !reducedMotion }).then(
          () => {
            scrolling = false;
            if (!stopped && !activation.dismissed) schedule();
          },
          () => {
            scrolling = false;
            if (stopped || activation.dismissed) return;
            activation.dismissed = true;
            clear();
            request.onComplete();
            toastManager.add({
              type: "warning",
              title: "Could not open the cited response",
              description: "Click the citation to try again.",
            });
          },
        );
        return;
      }
      if (rect.bottom <= scrollRect.top || rect.top >= scrollRect.bottom) return;
      activation.scrolled = true;
      request.onComplete();
      if (!range) {
        toastManager.add({
          type: "warning",
          title: "The quoted text has changed",
          description: "Showing the source response. The saved quote is unchanged.",
        });
      }
    }
    if (!range) {
      finishHighlight();
      return;
    }
    paintCitationMarker(root, range, owner, "reveal");
    ownedRange = range;
    root.dataset.citationHighlighted = "true";
    if (!pulseAnimation) {
      const pulse = (activation.pulse ??= {
        startedAt: performance.now(),
        reducedMotion,
      });
      const at = (milliseconds: number) => milliseconds / CITATION_HIGHLIGHT_TOTAL_MS;
      const holdEnd = at(CITATION_HIGHLIGHT_TOTAL_MS - CITATION_HIGHLIGHT_FADE_MS);
      // The marker layer is the root's sibling, so the opacity lives on their shared parent.
      pulseAnimation = (root.parentElement ?? root).animate(
        [
          {
            offset: 0,
            [CITATION_HIGHLIGHT_OPACITY]: pulse.reducedMotion ? CITATION_HIGHLIGHT_PEAK : 0,
            easing: "cubic-bezier(0.23, 1, 0.32, 1)",
          },
          {
            offset: at(CITATION_HIGHLIGHT_RISE_MS),
            [CITATION_HIGHLIGHT_OPACITY]: CITATION_HIGHLIGHT_PEAK,
          },
          {
            offset: holdEnd,
            [CITATION_HIGHLIGHT_OPACITY]: CITATION_HIGHLIGHT_PEAK,
            easing: "ease-in-out",
          },
          { offset: 1, [CITATION_HIGHLIGHT_OPACITY]: 0 },
        ],
        { duration: CITATION_HIGHLIGHT_TOTAL_MS },
      );
      pulseAnimation.id = "t3-assistant-citation-pulse";
      pulseAnimation.currentTime = Math.max(0, performance.now() - pulse.startedAt);
      void pulseAnimation.finished.then(finishHighlight, () => {});
    }
  };
  const schedule = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(highlight);
  };
  const observer = new MutationObserver((records) => {
    const rangeMoved =
      ownedRange !== null &&
      (ownedRange.collapsed ||
        !root.contains(ownedRange.startContainer) ||
        !root.contains(ownedRange.endContainer));
    if (rangeMoved) {
      clear();
    }
    if (
      rangeMoved ||
      records.some(
        (record) =>
          root.contains(record.target) ||
          [...record.addedNodes, ...record.removedNodes].some((node) => node.contains(root)),
      )
    ) {
      schedule();
    }
  });
  observer.observe(scrollNode, { childList: true, characterData: true, subtree: true });
  const stopObservingResize = observeResize([root, scrollNode], schedule);
  const state = list.getState();
  const unsubscribe = [
    state.listenToPosition(itemKey, schedule),
    state.listen("totalSize", schedule),
    state.listen("headerSize", schedule),
  ];
  const cancelScroll = () => {
    if (scrolling) {
      scrolling = false;
      void list.scrollToOffset({
        // Legend may defer reading the offset until after the user scrolls.
        get offset() {
          return scrollNode.scrollTop;
        },
        animated: false,
      });
    }
  };
  activation.cancelScroll = cancelScroll;
  schedule();
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    cancelScroll();
    pulseAnimation?.cancel();
    if (frame !== null) cancelAnimationFrame(frame);
    observer.disconnect();
    stopObservingResize();
    for (const stop of unsubscribe) stop();
    if (activation.cancelScroll === cancelScroll) delete activation.cancelScroll;
    clear();
  };
  return dispose;
}

export function AssistantCitationSource({
  messageId,
  threadRef,
  itemKey,
  request,
  listRef,
  children,
}: {
  messageId: MessageId;
  threadRef?: ScopedThreadRef;
  itemKey: string;
  request: AssistantCitationTarget | null;
  listRef: RefObject<LegendListRef | null>;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- observes this message's DOM for a citation reveal request and scrolls the LegendList to it
  useEffect(() => {
    const root = rootRef.current;
    const list = listRef.current;
    if (!root || !list || !request || request.citation.messageId !== messageId) return;
    return observeAssistantCitationSource({ root, itemKey, request, list });
  }, [itemKey, listRef, messageId, request]);

  return (
    <div className="relative">
      <div
        ref={rootRef}
        data-assistant-citation-source={messageId}
        data-assistant-citation-environment={threadRef?.environmentId}
        data-assistant-citation-thread={threadRef?.threadId}
      >
        {children}
      </div>
      <div aria-hidden="true" data-citation-markers="" />
    </div>
  );
}
