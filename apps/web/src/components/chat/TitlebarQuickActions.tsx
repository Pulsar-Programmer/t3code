import type { ScopedThreadRef } from "@t3tools/contracts";
import { CommandIcon, PinIcon, PinOffIcon } from "lucide-react";
import { memo } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { useClientSettings } from "../../hooks/useSettings";
import { useQuietThreadProjection } from "../../state/entities";
import { usePinnedMessageIds, useUiStateStore } from "../../uiStateStore";
import { textDirection } from "~/textDirection";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { requestTimelineJump } from "./timelineJump";

const PREVIEW_MAX_CHARS = 140;

function previewText(text: string | null | undefined): string {
  const compact = text?.replace(/\s+/g, " ").trim() ?? "";
  if (compact.length === 0) return "Pinned response";
  return compact.length > PREVIEW_MAX_CHARS ? `${compact.slice(0, PREVIEW_MAX_CHARS)}…` : compact;
}

/** The pinned responses of the open thread, in pin order, with a jump and an unpin per row. */
function PinnedMessagesControl(props: {
  readonly threadRef: ScopedThreadRef;
  readonly threadKey: string;
}) {
  const pinnedIds = usePinnedMessageIds(props.threadKey);
  const toggleMessagePinned = useUiStateStore((state) => state.toggleMessagePinned);
  // The quiet projection holds the text without re-rendering this menu per streamed token.
  const projection = useQuietThreadProjection(props.threadRef)?.projection ?? null;
  const count = pinnedIds.length;
  const label = count === 0 ? "No pinned responses yet" : `Pinned responses (${count})`;
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="shrink-0 [-webkit-app-region:no-drag]"
      aria-label={label}
      disabled={count === 0}
      data-pinned-count={count}
    >
      <PinIcon className={count > 0 ? "size-4 fill-warning text-warning" : "size-4"} />
    </Button>
  );
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger render={<span className="flex shrink-0" />}>
          {count === 0 ? trigger : <PopoverTrigger render={trigger} />}
        </TooltipTrigger>
        <TooltipPopup side="bottom">{label}</TooltipPopup>
      </Tooltip>
      <PopoverPopup align="end" width="md" padding="compact" aria-label="Pinned responses">
        <ul role="list" className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {pinnedIds.map((messageId, index) => {
            const message = projection?.messages.find((candidate) => candidate.id === messageId);
            const text = previewText(message?.text);
            return (
              <li key={messageId} className="flex items-start gap-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => {
                    if (requestTimelineJump({ threadKey: props.threadKey, messageId })) return;
                    toastManager.add({
                      type: "info",
                      title: "That response is not loaded",
                      description: "Scroll up to load earlier turns, then try again.",
                    });
                  }}
                >
                  <span className="mt-0.5 shrink-0 text-xs tabular-nums text-warning">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 line-clamp-2" dir={textDirection(text)}>
                    {text}
                  </span>
                </button>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Unpin response"
                        onClick={() => toggleMessagePinned(props.threadKey, messageId)}
                      />
                    }
                  >
                    <PinOffIcon />
                  </TooltipTrigger>
                  <TooltipPopup side="left">Unpin</TooltipPopup>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </PopoverPopup>
    </Popover>
  );
}

/**
 * Discoverable entry points for features that otherwise hide behind shortcuts: the command
 * palette and the thread's pinned responses. Each has its own setting, on by default.
 */
export const TitlebarQuickActions = memo(function TitlebarQuickActions(props: {
  readonly threadRef: ScopedThreadRef | null;
  readonly threadKey: string;
  readonly commandPaletteShortcutLabel: string | null;
}) {
  const showCommandPalette = useClientSettings((settings) => settings.commandPaletteButtonEnabled);
  const showPinned = useClientSettings((settings) => settings.pinnedMessagesButtonEnabled);
  if (!showCommandPalette && !showPinned) return null;
  const paletteLabel = `Command palette${props.commandPaletteShortcutLabel ? ` (${props.commandPaletteShortcutLabel})` : ""}`;
  return (
    <div
      className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]"
      data-titlebar-quick-actions
    >
      {showPinned && props.threadRef ? (
        <PinnedMessagesControl threadRef={props.threadRef} threadKey={props.threadKey} />
      ) : null}
      {showCommandPalette ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 [-webkit-app-region:no-drag]"
                aria-label={paletteLabel}
                onClick={() => openCommandPalette()}
              />
            }
          >
            <CommandIcon className="size-4" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">{paletteLabel}</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
});
