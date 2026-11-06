import {
  OrchestratorMcpFailure,
  ServerSettingsPatch,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as EnvironmentTheme from "../../../environmentTheme.ts";
import * as Environment from "../../../environment/ServerEnvironment.ts";
import * as ThreadCommandExecutor from "../../../orchestration-v2/ThreadCommandExecutor.ts";
import * as Settings from "../../../serverSettings.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { readCaller, unavailable } from "../../threadAccess.ts";
import { AGENT_SETTINGS_DENYLIST, EnvironmentToolkit } from "./tools.ts";

const decodeSettingsPatch = Schema.decodeUnknownEffect(ServerSettingsPatch);

/** The settings an agent may read or change: what the user sees, minus credentials. */
function agentVisibleSettings(
  settings: ServerSettings,
  keys?: ReadonlyArray<string>,
): { settings: Record<string, unknown>; keys: string[] } {
  const wanted = keys === undefined ? null : new Set(keys);
  const visible: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (AGENT_SETTINGS_DENYLIST.has(key)) continue;
    if (wanted !== null && !wanted.has(key)) continue;
    visible[key] = value;
  }
  return { settings: visible, keys: Object.keys(visible).sort() };
}

const invalid = (message: string) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message });

export function preferences(settings: ServerSettings) {
  const {
    defaultThreadEnvMode,
    newWorktreesStartFromOrigin,
    enableProviderUpdateChecks,
    backgroundActivity,
    sourceControlWritingStyle,
  } = settings;
  const characters = Array.from(sourceControlWritingStyle.customInstructions);
  return {
    defaultThreadEnvMode,
    newWorktreesStartFromOrigin,
    enableProviderUpdateChecks,
    backgroundActivity: { profile: backgroundActivity.profile },
    sourceControlWritingStyle: {
      ...sourceControlWritingStyle,
      customInstructions: characters.slice(0, 4000).join(""),
      truncated: characters.length > 4000,
    },
  };
}
const access = Effect.gen(function* () {
  const context = yield* readCaller();
  const environment = yield* Environment.ServerEnvironment;
  const descriptor = yield* environment.getDescriptor;
  if (descriptor.environmentId !== context.scope.environmentId)
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "This credential belongs to another environment.",
    });
  return { ...context, descriptor, settings: yield* Settings.ServerSettingsService };
});
const withEnvironmentLock = Effect.fn("EnvironmentMcp.withEnvironmentLock")(function* <
  A,
  E,
  R,
  C,
  RC,
>(check: Effect.Effect<C, OrchestratorMcpFailure, RC>, run: Effect.Effect<A, E, R>) {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  const executor = yield* ThreadCommandExecutor.ThreadCommandExecutor;
  // The turn may have ended, or the thread's modes changed, while this waited for the lock.
  const guarded = check.pipe(Effect.andThen(run));
  return yield* scope.thread === undefined
    ? guarded
    : executor.withLock(scope.thread.threadId, guarded);
});

export const layer = McpToolAccess.toLayer(EnvironmentToolkit, {
  t3_settings_read: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const { settings } = yield* access;
      const current = yield* settings.getSettings.pipe(Effect.mapError(unavailable));
      return agentVisibleSettings(current, input.keys);
    }),
  ),
  t3_settings_update: McpToolAccess.writesEnvironment((input, check) =>
    withEnvironmentLock(
      check,
      Effect.gen(function* () {
        const denied = Object.keys(input.patch).filter((key) => AGENT_SETTINGS_DENYLIST.has(key));
        if (denied.length > 0) {
          return yield* invalid(
            `These settings hold credentials or provider wiring and stay in Settings: ${denied.join(", ")}.`,
          );
        }
        const patch = yield* decodeSettingsPatch(input.patch).pipe(
          Effect.mapError((cause) =>
            invalid(`The patch does not match the settings shape: ${cause.message}`),
          ),
        );
        const { settings } = yield* access;
        const updated = yield* settings.updateSettings(patch).pipe(Effect.mapError(unavailable));
        return agentVisibleSettings(updated, Object.keys(input.patch));
      }),
    ),
  ),
  t3_theme_publish: McpToolAccess.writesEnvironment((input, check) =>
    withEnvironmentLock(
      check,
      Effect.gen(function* () {
        yield* access;
        const themes = yield* EnvironmentTheme.EnvironmentThemeService;
        return yield* themes.publish(input);
      }),
    ),
  ),
  t3_environment_read: McpToolAccess.reads(() =>
    Effect.gen(function* () {
      const { descriptor, settings } = yield* access;
      const current = yield* settings.getSettings.pipe(Effect.mapError(unavailable));
      return {
        environmentId: descriptor.environmentId,
        label: descriptor.label,
        serverVersion: descriptor.serverVersion,
        platform: descriptor.platform,
        preferences: preferences(current),
      };
    }),
  ),
  t3_environment_preferences_update: McpToolAccess.writesEnvironment((patch, check) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const executor = yield* ThreadCommandExecutor.ThreadCommandExecutor;
      const update = Effect.gen(function* () {
        // The turn may have ended, or the thread's modes changed, while this waited for the lock.
        yield* check;
        const { settings } = yield* access;
        return preferences(
          yield* settings.updateSettings(patch).pipe(Effect.mapError(unavailable)),
        );
      });
      return yield* scope.thread === undefined
        ? update
        : executor.withLock(scope.thread.threadId, update);
    }),
  ),
});
