import { BookmarkIcon, BookmarkPlusIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import { ComposerBanner } from "./ComposerBanner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export const ComposerStashBadge = memo(function ComposerStashBadge(props: {
  count: number;
  menuOpen: boolean;
  /** Bumped per stash; each new key replays the pulse. 0 means never pulsed. */
  pulseKey: number;
  /** Keep the tab on screen with nothing stashed, with a button that stashes the prompt. */
  alwaysVisible?: boolean;
  stashShortcutLabel?: string | null;
  onToggleMenu: () => void;
  onStash?: (() => void) | undefined;
}) {
  const alwaysVisible = props.alwaysVisible === true && props.onStash !== undefined;
  if (props.count === 0 && !alwaysVisible) return null;
  const pulsed = props.pulseKey > 0;
  const stashHint = `Stash this prompt${props.stashShortcutLabel ? ` (${props.stashShortcutLabel})` : ""}`;
  // With nothing stashed the tab itself stashes (or opens the empty stash); otherwise the tab
  // opens the stash and the plus beside the count stashes, so one click still restores.
  const tabStashes = props.count === 0;
  const count =
    props.count === 0 ? null : (
      <ComposerBanner.Count
        // Remounting the count per stash restarts its CSS pulse; no timer has to end it.
        key={props.pulseKey}
        className={cn(
          "text-muted-foreground",
          pulsed &&
            "animate-stash-pulse-count transition-[opacity,translate] duration-180 ease-out starting:translate-y-0.5 starting:opacity-0 motion-reduce:transition-none",
        )}
      >
        {props.count}
      </ComposerBanner.Count>
    );

  return (
    <ComposerBanner.Root
      density="comfortable"
      width="content"
      data-composer-shoulder-tab
      className="ml-auto"
    >
      <ComposerBanner.Row
        data-prompt-stash-badge="true"
        className={cn(
          "relative transition-colors duration-200",
          props.menuOpen ? "text-foreground" : "text-muted-foreground",
          // The row keeps its identity (focus, hover) across stashes. Swapping between two
          // identical keyframes restarts the row's animation instead.
          pulsed &&
            (props.pulseKey % 2 === 0 ? "animate-stash-pulse-row-alt" : "animate-stash-pulse-row"),
        )}
      >
        <ComposerBanner.Icon>
          {tabStashes ? <BookmarkPlusIcon /> : <BookmarkIcon />}
        </ComposerBanner.Icon>
        <ComposerBanner.Content>
          <button
            type="button"
            className={cn(
              "cursor-pointer outline-none before:absolute before:inset-0 hover:text-foreground focus-visible:before:ring-2 focus-visible:before:ring-inset focus-visible:before:ring-ring",
              props.menuOpen && "pointer-events-none",
            )}
            aria-label={
              tabStashes
                ? stashHint
                : `Stashed prompts: ${props.count}. ${props.menuOpen ? "Close" : "Open"} stash.`
            }
            aria-expanded={tabStashes ? undefined : props.menuOpen}
            onPointerDown={(event) => event.preventDefault()}
            onClick={tabStashes ? props.onStash : props.onToggleMenu}
          >
            Stash
          </button>
        </ComposerBanner.Content>
        <ComposerBanner.Actions>
          {count}
          {!tabStashes && alwaysVisible ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <ComposerBanner.Dismiss
                    aria-label={stashHint}
                    className="z-10"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={props.onStash}
                  />
                }
              >
                <BookmarkPlusIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">{stashHint}</TooltipPopup>
            </Tooltip>
          ) : null}
        </ComposerBanner.Actions>
      </ComposerBanner.Row>
    </ComposerBanner.Root>
  );
});
