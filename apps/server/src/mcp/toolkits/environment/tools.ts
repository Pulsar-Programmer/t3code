import {
  BackgroundActivityProfile,
  BackgroundActivityProfileSelection,
  EnvironmentThemeFile,
  EnvironmentThemeId,
  ExecutionEnvironmentDescriptor,
  OrchestratorMcpEnvironmentTarget,
  OrchestratorMcpFailure,
  ServerSettings,
  ServerSettingsPatch,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as EnvironmentTheme from "../../../environmentTheme.ts";
import * as ServerEnvironment from "../../../environment/ServerEnvironment.ts";
import * as ThreadCommandExecutor from "../../../orchestration-v2/ThreadCommandExecutor.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as Settings from "../../../serverSettings.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const PreferenceFields = {
  defaultThreadEnvMode: ServerSettings.fields.defaultThreadEnvMode,
  newWorktreesStartFromOrigin: ServerSettings.fields.newWorktreesStartFromOrigin,
  enableProviderUpdateChecks: ServerSettings.fields.enableProviderUpdateChecks,
  backgroundActivity: Schema.Struct({ profile: BackgroundActivityProfileSelection }),
  sourceControlWritingStyle: Schema.Struct({
    mode: Schema.String,
    followChangeRequestTemplates: Schema.Boolean,
    customInstructions: Schema.String,
    truncated: Schema.Boolean,
  }),
};
const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ServerEnvironment.ServerEnvironment,
    Settings.ServerSettingsService,
    ThreadCommandExecutor.ThreadCommandExecutor,
  ],
};
const EnvironmentReadTool = Tool.make("t3_environment_read", {
  ...shared,
  description:
    "Read this server's identity and preferences. Providers and models: `orchestrator_capabilities`.",
  parameters: Schema.Struct({ environmentId: OrchestratorMcpEnvironmentTarget }),
  success: Schema.Struct({
    environmentId: ExecutionEnvironmentDescriptor.fields.environmentId,
    label: Schema.String,
    serverVersion: Schema.String,
    platform: ExecutionEnvironmentDescriptor.fields.platform,
    preferences: Schema.Struct(PreferenceFields),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
const EnvironmentPreferencesTool = Tool.make("t3_environment_preferences_update", {
  ...shared,
  description:
    "Update environment-wide preferences. Live full-access or default caller thread only. Omitted fields are unchanged; `customInstructions: ''` clears it.",
  parameters: Schema.Struct({
    environmentId: OrchestratorMcpEnvironmentTarget,
    defaultThreadEnvMode: ServerSettingsPatch.fields.defaultThreadEnvMode,
    newWorktreesStartFromOrigin: ServerSettingsPatch.fields.newWorktreesStartFromOrigin,
    enableProviderUpdateChecks: ServerSettingsPatch.fields.enableProviderUpdateChecks,
    backgroundActivity: Schema.optionalKey(Schema.Struct({ profile: BackgroundActivityProfile })),
    sourceControlWritingStyle: ServerSettingsPatch.fields.sourceControlWritingStyle,
  }),
  success: Schema.Struct(PreferenceFields),
}).annotate(Tool.Destructive, true);
/** Credentials and provider wiring stay in Settings; everything else the user can set, the agent can. */
export const AGENT_SETTINGS_DENYLIST = new Set<string>([
  "providerInstances",
  "secretProviders",
  "sourceControlHosts",
  "usageLimitSources",
  "deviceHosts",
  "easDeviceHosts",
  "simlockDeviceHosts",
  "observability",
  "migrateModelPreferences",
]);
const SettingsObject = Schema.Record(Schema.String, Schema.Unknown);
const SettingsReadTool = Tool.make("t3_settings_read", {
  ...shared,
  description:
    "Read this environment's settings, without credentials or provider wiring. `keys` limits the result.",
  parameters: Schema.Struct({
    environmentId: OrchestratorMcpEnvironmentTarget,
    keys: Schema.optional(Schema.Array(Schema.String)),
  }),
  success: Schema.Struct({ settings: SettingsObject, keys: Schema.Array(Schema.String) }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);
const SettingsUpdateTool = Tool.make("t3_settings_update", {
  ...shared,
  description:
    "Change this environment's settings for the user. `patch` maps setting keys to new values in the shape `t3_settings_read` returns; omitted keys stay. Credentials and provider wiring stay in Settings. Live full-access or default caller thread only.",
  parameters: Schema.Struct({
    environmentId: OrchestratorMcpEnvironmentTarget,
    patch: SettingsObject,
  }),
  success: Schema.Struct({ settings: SettingsObject, keys: Schema.Array(Schema.String) }),
}).annotate(Tool.Destructive, true);
const ThemePublishTool = Tool.make("t3_theme_publish", {
  ...shared,
  description:
    "Create or replace a T3 Code theme; `setAsDefault` switches connected clients to it. `theme` needs `name`, `appearance`, and `canvas` plus `accent` colors to derive from, or `colors` per token. Live full-access or default caller thread only.",
  parameters: Schema.Struct({
    environmentId: OrchestratorMcpEnvironmentTarget,
    id: EnvironmentThemeId,
    theme: EnvironmentThemeFile,
    setAsDefault: Schema.optional(Schema.Boolean),
  }),
  success: Schema.Struct({
    id: EnvironmentThemeId,
    path: Schema.String,
    isDefault: Schema.Boolean,
  }),
  dependencies: [...shared.dependencies, EnvironmentTheme.EnvironmentThemeService],
}).annotate(Tool.Destructive, true);
export const EnvironmentToolkit = Toolkit.make(
  EnvironmentReadTool,
  EnvironmentPreferencesTool,
  SettingsReadTool,
  SettingsUpdateTool,
  ThemePublishTool,
);
