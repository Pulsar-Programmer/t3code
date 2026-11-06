import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { snoozeWakeLabel } from "@t3tools/client-runtime/state/thread-settled";
import { sortSettledThreads } from "@t3tools/client-runtime/state/thread-sort";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import {
  AlarmClockIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleCheckIcon,
  FolderGit2Icon,
  GitBranchIcon,
  LayersIcon,
  PinIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useSidebarProjectGroups } from "../../hooks/useSidebarProjectGroups";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import {
  deriveProviderEntriesByEnvironment,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useDelegatedUnderParent, useQuietThreadShells } from "../../state/entities";
import { useEnvironmentIdentities } from "../../state/environments";
import {
  olderSettledScopes,
  useOlderSettledShelf,
  useOlderSettledShelfGrowth,
} from "../../state/olderSettledShelf";
import { environmentPresentations } from "../../state/presentation";
import { buildThreadRouteParams } from "../../threadRoutes";
import { ProjectFavicon } from "../ProjectFavicon";
import { RelativeTime } from "../RelativeTime";
import { filterSidebarV2VisibleThreads } from "../Sidebar.logic";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { SidebarInset } from "../ui/sidebar";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  chatActivityMs,
  chatDateBucket,
  chatMatchesTab,
  chatStatus,
  groupInOrder,
  type ChatStatus,
  type ChatsGrouping,
  type ChatsTab,
} from "./chatsPage.logic";

const TABS: ReadonlyArray<{ id: ChatsTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "snoozed", label: "Snoozed" },
  { id: "settled", label: "Settled" },
];
const TAB_STORAGE_KEY = "chats:tab";
const GROUPING_STORAGE_KEY = "chats:grouping";
const ChatsTabSchema = Schema.Literals(["all", "active", "snoozed", "settled"]);
const isChatsTab = Schema.is(ChatsTabSchema);
const ChatsGroupingSchema = Schema.Literals(["date", "project"]);
const SETTLED_PAGE = 50;

interface ChatRow {
  readonly key: string;
  readonly thread: EnvironmentThreadShell;
  readonly status: ChatStatus;
  readonly activityMs: number;
  readonly project: SidebarProjectSnapshot | null;
}

export function ChatsPage() {
  const navigate = useNavigate();
  const threads = useQuietThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const projectGroups = useSidebarProjectGroups();
  const environments = useEnvironmentIdentities();
  const serverConfigs = useAtomValue(environmentPresentations.serverConfigsAtom);
  const providersByEnvironment = useAtomValue(environmentPresentations.providersByEnvironmentAtom);
  const [tab, setTab] = useLocalStorage<ChatsTab, ChatsTab>(TAB_STORAGE_KEY, "all", ChatsTabSchema);
  const [grouping, setGrouping] = useLocalStorage<ChatsGrouping, ChatsGrouping>(
    GROUPING_STORAGE_KEY,
    "date",
    ChatsGroupingSchema,
  );
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [settledLimit, setSettledLimit] = useState(SETTLED_PAGE);

  const providerEntries = deriveProviderEntriesByEnvironment(
    [...serverConfigs].map(
      ([environmentId, config]) =>
        [environmentId, providersByEnvironment.get(environmentId) ?? [], config.settings] as const,
    ),
  );
  const environmentLabels = new Map(
    environments.map((environment) => [environment.environmentId, environment.label] as const),
  );
  const showEnvironment = environments.length > 1;
  const pickableGroups = projectGroups.filter((group) => !group.archived);
  const groupByProjectKey = new Map(
    projectGroups.flatMap((group) =>
      group.memberProjectRefs.map(
        (ref) => [`${ref.environmentId}:${ref.projectId}`, group] as const,
      ),
    ),
  );
  const selectedGroup = pickableGroups.find((group) => group.projectKey === projectKey) ?? null;
  const scopedProjectKeys =
    selectedGroup === null
      ? null
      : new Set(
          selectedGroup.memberProjectRefs.map((ref) => `${ref.environmentId}:${ref.projectId}`),
        );

  // The minute clock re-renders the list as relative buckets and snooze labels age.
  const nowIso = `${useNowMinute()}:00.000Z`;
  const now = new Date(nowIso);
  const rows: ChatRow[] = filterSidebarV2VisibleThreads(
    threads,
    scopedProjectKeys,
    delegatedUnderParent,
  ).map((thread) => ({
    key: `${thread.environmentId}:${thread.id}`,
    thread,
    status: chatStatus(thread, nowIso),
    activityMs: chatActivityMs(thread),
    project: groupByProjectKey.get(`${thread.environmentId}:${thread.projectId}`) ?? null,
  }));

  // Older settled chats load from the server in pages, as the sidebar's Settled shelf does.
  const settledShown = tab === "all" || tab === "settled";
  const shelf = useOlderSettledShelf({
    scopes: olderSettledScopes([...serverConfigs.keys()], scopedProjectKeys),
    expanded: settledShown,
    visibleCount: settledLimit,
  });
  const settledThreads = rows.flatMap((row) => (row.status === "settled" ? [row.thread] : []));
  const listedSettled = sortSettledThreads(settledThreads).filter(shelf.isListed);
  useOlderSettledShelfGrowth(shelf, listedSettled);
  const shownSettledKeys = new Set(
    listedSettled.slice(0, settledLimit).map((thread) => `${thread.environmentId}:${thread.id}`),
  );
  const settledTotal = settledThreads.length + shelf.unloadedCount(rows.map((row) => row.thread));
  const hiddenSettled = Math.max(0, settledTotal - shownSettledKeys.size);

  const needle = query?.trim().toLowerCase() ?? "";
  const visible = rows
    .filter(
      (row) =>
        chatMatchesTab(tab, row.status) &&
        (row.status !== "settled" || shownSettledKeys.has(row.key)) &&
        (needle === "" ||
          row.thread.title.toLowerCase().includes(needle) ||
          (row.project?.displayName.toLowerCase().includes(needle) ?? false) ||
          (row.thread.branch?.toLowerCase().includes(needle) ?? false)),
    )
    .toSorted((left, right) => right.activityMs - left.activityMs);
  const sections = groupInOrder(visible, (row) =>
    grouping === "date"
      ? chatDateBucket(row.activityMs, now)
      : (row.project?.projectKey ?? "__none__"),
  );
  const counts = {
    all: rows.length - settledThreads.length + settledTotal,
    active: rows.filter((row) => chatMatchesTab("active", row.status)).length,
    snoozed: rows.filter((row) => row.status === "snoozed").length,
    settled: settledTotal,
  } satisfies Record<ChatsTab, number>;

  const openChat = (thread: EnvironmentThreadShell) => {
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
    });
  };

  return (
    <SidebarInset
      {...workspaceAreaProps("chats", 1, "Chats")}
      className="h-dvh min-h-0 overflow-hidden overscroll-y-none"
    >
      <WorkspacePageHeader electron={isElectron} className="bg-background" />
      <ScrollArea className="min-h-0 flex-1" radius="none">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-2 sm:px-8">
          <h1 className="font-serif text-3xl tracking-tight">Chats</h1>

          <div className="flex h-9 items-center gap-2">
            <ToggleGroup
              className={cn("shrink-0", query !== null && "max-sm:hidden")}
              aria-label="Show"
              value={[tab]}
              onValueChange={(next) => {
                const value = next[0];
                if (isChatsTab(value)) setTab(value);
              }}
            >
              {TABS.map((entry) => (
                <Toggle key={entry.id} value={entry.id}>
                  {entry.label}
                  {counts[entry.id] > 0 ? (
                    <span className="ms-1 text-muted-foreground tabular-nums">
                      {counts[entry.id]}
                    </span>
                  ) : null}
                </Toggle>
              ))}
            </ToggleGroup>
            <div className="ms-auto flex min-w-0 items-center gap-1">
              {query === null ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost-muted"
                        size="icon-sm"
                        aria-label="Search chats"
                        onClick={() => setQuery("")}
                      />
                    }
                  >
                    <SearchIcon />
                  </TooltipTrigger>
                  <TooltipPopup side="bottom">Search</TooltipPopup>
                </Tooltip>
              ) : (
                <InputGroup className="min-w-0 flex-1 basis-40 sm:max-w-72">
                  <InputGroupAddon align="inline-start">
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    autoFocus
                    type="search"
                    aria-label="Search chats"
                    placeholder="Search chats…"
                    value={query}
                    onValueChange={(value) => setQuery(value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setQuery(null);
                    }}
                  />
                  <InputGroupAddon align="inline-end">
                    <Button
                      variant="ghost-muted"
                      size="icon-xs"
                      aria-label="Close search"
                      onClick={() => setQuery(null)}
                    >
                      <XIcon />
                    </Button>
                  </InputGroupAddon>
                </InputGroup>
              )}
              <ProjectFilterMenu
                groups={pickableGroups}
                selected={selectedGroup}
                onSelect={(group) => {
                  setProjectKey(group?.projectKey ?? null);
                  setSettledLimit(SETTLED_PAGE);
                }}
              />
              <Menu>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <MenuTrigger
                        render={
                          <Button variant="ghost-muted" size="icon-sm" aria-label="Group chats" />
                        }
                      />
                    }
                  >
                    <LayersIcon />
                  </TooltipTrigger>
                  <TooltipPopup side="bottom">
                    Grouped by {grouping === "date" ? "date" : "project"}
                  </TooltipPopup>
                </Tooltip>
                <MenuPopup align="end" width="content">
                  <MenuGroup>
                    <MenuGroupLabel>Group by</MenuGroupLabel>
                    {(["date", "project"] as const).map((option) => (
                      <MenuItem key={option} onClick={() => setGrouping(option)}>
                        <CheckIcon className={cn(option !== grouping && "invisible")} />
                        {option === "date" ? "Date" : "Project"}
                      </MenuItem>
                    ))}
                  </MenuGroup>
                </MenuPopup>
              </Menu>
            </div>
          </div>

          {sections.length === 0 ? (
            shelf.loading ? null : (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{needle ? "No matching chats" : "No chats here yet"}</EmptyTitle>
                  <EmptyDescription>
                    {needle
                      ? "Try another word, or search everything with the command palette."
                      : tab === "snoozed"
                        ? "Snoozed chats wait here until they wake."
                        : tab === "settled"
                          ? "Chats you settle land here."
                          : "Start a chat and it shows up here."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          ) : (
            <div className="flex flex-col gap-6">
              {sections.map((section) => {
                const project = section.items[0]?.project ?? null;
                return (
                  <section key={section.key} className="flex flex-col">
                    <h2 className="flex items-center gap-2 pb-1 font-medium text-muted-foreground text-xs">
                      {grouping === "project" ? (
                        <>
                          {project ? (
                            <ProjectFavicon project={project} className="size-3.5" />
                          ) : null}
                          <span className="truncate">{project?.displayName ?? "Other"}</span>
                        </>
                      ) : (
                        section.key
                      )}
                      <span className="tabular-nums text-muted-foreground/60">
                        {section.items.length}
                      </span>
                    </h2>
                    <ul className="flex flex-col">
                      {section.items.map((row) => (
                        <ChatListRow
                          key={row.key}
                          row={row}
                          nowIso={nowIso}
                          showProject={grouping !== "project"}
                          showSettledBadge={tab !== "settled"}
                          environmentLabel={
                            showEnvironment
                              ? (environmentLabels.get(row.thread.environmentId) ?? null)
                              : null
                          }
                          providerEntry={
                            providerEntries
                              .get(row.thread.environmentId)
                              ?.get(row.thread.modelSelection.instanceId) ?? null
                          }
                          onOpen={() => openChat(row.thread)}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          {settledShown && (hiddenSettled > 0 || shelf.loading || shelf.failed) ? (
            <div className="flex justify-center">
              <Button
                variant="ghost-muted"
                size="sm"
                disabled={shelf.loading}
                onClick={() =>
                  shelf.failed ? shelf.retry() : setSettledLimit((limit) => limit + SETTLED_PAGE)
                }
              >
                {shelf.loading
                  ? "Loading older chats…"
                  : shelf.failed
                    ? "Couldn't load older chats. Retry"
                    : `Show ${Math.min(hiddenSettled, SETTLED_PAGE)} older settled chats`}
              </Button>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </SidebarInset>
  );
}

function ProjectFilterMenu({
  groups,
  selected,
  onSelect,
}: {
  groups: ReadonlyArray<SidebarProjectSnapshot>;
  selected: SidebarProjectSnapshot | null;
  onSelect: (group: SidebarProjectSnapshot | null) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost-muted" size="sm" aria-label="Filter by project" />}
      >
        {selected ? <ProjectFavicon project={selected} className="size-3.5" /> : null}
        <span className="max-w-36 truncate">{selected?.displayName ?? "All projects"}</span>
        <ChevronDownIcon />
      </MenuTrigger>
      <MenuPopup align="end" width="content" className="max-h-[70vh] overflow-y-auto">
        <MenuItem onClick={() => onSelect(null)}>
          <CheckIcon className={cn(selected !== null && "invisible")} />
          All projects
        </MenuItem>
        {groups.length > 0 ? <MenuSeparator /> : null}
        {groups.map((group) => (
          <MenuItem key={group.projectKey} onClick={() => onSelect(group)}>
            <CheckIcon className={cn(selected?.projectKey !== group.projectKey && "invisible")} />
            <ProjectFavicon project={group} className="size-3.5" />
            <span className="truncate">{group.displayName}</span>
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

function ChatListRow({
  row,
  nowIso,
  showProject,
  showSettledBadge,
  environmentLabel,
  providerEntry,
  onOpen,
}: {
  row: ChatRow;
  nowIso: string;
  showProject: boolean;
  showSettledBadge: boolean;
  environmentLabel: string | null;
  providerEntry: ProviderInstanceEntry | null;
  onOpen: () => void;
}) {
  const { thread, project, status } = row;
  const model = providerEntry?.models.find((entry) => entry.slug === thread.modelSelection.model);
  const modelLabel = model?.shortName ?? model?.name ?? thread.modelSelection.model;
  const isWorktree = (thread.worktreePath?.trim().length ?? 0) > 0;
  const BranchIcon = isWorktree ? FolderGit2Icon : GitBranchIcon;
  const activityAt = row.activityMs > 0 ? new Date(row.activityMs).toISOString() : null;

  return (
    <li className="list-none border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="group/chat -mx-2 flex w-[calc(100%+--spacing(4))] cursor-pointer items-center gap-4 rounded-lg px-2 py-3 text-left outline-hidden hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            {thread.pinnedAt != null ? (
              <PinIcon aria-label="Pinned" className="size-3 shrink-0 text-muted-foreground" />
            ) : null}
            <span className="truncate text-foreground text-sm">{thread.title}</span>
            <ChatStatusBadge
              status={status}
              snoozedUntil={thread.snoozedUntil ?? null}
              nowIso={nowIso}
              showSettled={showSettledBadge}
            />
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
            {showProject && project ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <ProjectFavicon project={project} className="size-3 shrink-0" />
                <span className="truncate">{project.displayName}</span>
              </span>
            ) : null}
            {environmentLabel ? <MetaPart>{environmentLabel}</MetaPart> : null}
            {providerEntry ? (
              <MetaPart first={!showProject && !environmentLabel}>
                <ProviderInstanceIcon
                  driverKind={providerEntry.driverKind}
                  displayName={providerEntry.displayName}
                  accentColor={providerEntry.accentColor}
                  acpRegistryAgentId={providerEntry.acpRegistryAgentId}
                  acpRegistryIconUrl={providerEntry.acpRegistryIconUrl}
                  iconClassName="size-3 shrink-0 opacity-70"
                />
                <span className="truncate">
                  {providerEntry.displayName}
                  {modelLabel ? ` · ${modelLabel}` : ""}
                </span>
              </MetaPart>
            ) : null}
            {thread.branch ? (
              <MetaPart className="max-sm:hidden">
                <BranchIcon className="size-3 shrink-0" />
                <span className="truncate">{thread.branch}</span>
              </MetaPart>
            ) : null}
            {thread.pullRequests.length > 0 ? (
              <MetaPart>
                <PullRequestGlyph.pullRequest className="size-3 shrink-0" />
                <span className="tabular-nums">{thread.pullRequests.length}</span>
              </MetaPart>
            ) : null}
          </span>
        </span>
        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
          {activityAt ? <RelativeTime timestamp={activityAt} /> : null}
        </span>
      </button>
    </li>
  );
}

function MetaPart({
  children,
  first = false,
  className,
}: {
  children: ReactNode;
  first?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {first ? null : <span className="text-muted-foreground/50">·</span>}
      {children}
    </span>
  );
}

function ChatStatusBadge({
  status,
  snoozedUntil,
  nowIso,
  showSettled,
}: {
  status: ChatStatus;
  snoozedUntil: string | null;
  nowIso: string;
  showSettled: boolean;
}) {
  if (status === "needs-you") {
    return (
      <Badge variant="warning" size="sm" className="shrink-0">
        Needs you
      </Badge>
    );
  }
  if (status === "working") {
    return (
      <Badge variant="info" size="sm" className="shrink-0">
        Working
      </Badge>
    );
  }
  if (status === "snoozed") {
    return (
      <Badge variant="secondary" size="sm" className="shrink-0">
        <AlarmClockIcon />
        {snoozedUntil ? `Wakes in ${snoozeWakeLabel(snoozedUntil, { now: nowIso })}` : "Snoozed"}
      </Badge>
    );
  }
  if (status === "settled" && showSettled) {
    return (
      <Badge variant="secondary" size="sm" className="shrink-0">
        <CircleCheckIcon />
        Settled
      </Badge>
    );
  }
  return null;
}
