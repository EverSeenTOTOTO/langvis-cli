/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/telemetry/types.ts，langvis 关闭此能力：
// 遥测事件类型与上游同形（数据字段/构造签名一致），OTel 属性
// 方法退化为返回空对象；loggers 全部 no-op，事件只进内存不外发。

import type { Config } from '../config/config.js';
import type { ApprovalMode } from '../policy/types.js';
import { CoreToolCallStatus } from '../scheduler/types.js';
import { LlmRole } from './llmRole.js';

export { LlmRole };
export type { ToolCallDecision } from './tool-call-decision.js';

type LogAttributes = Record<string, unknown>;

export interface BaseTelemetryEvent {
  'event.name': string;
  /** Current timestamp in ISO 8601 format */
  'event.timestamp': string;
}

export const EVENT_USER_PROMPT = 'gemini_cli.user_prompt';
export class UserPromptEvent implements BaseTelemetryEvent {
  'event.name': 'user_prompt';
  'event.timestamp': string;
  prompt_length: number;
  prompt_id: string;
  auth_type?: string;
  prompt?: string;

  constructor(
    prompt_length: number,
    prompt_Id: string,
    auth_type?: string,
    prompt?: string,
  ) {
    this['event.name'] = 'user_prompt';
    this['event.timestamp'] = new Date().toISOString();
    this.prompt_length = prompt_length;
    this.prompt_id = prompt_Id;
    this.auth_type = auth_type;
    this.prompt = prompt;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `User prompt. Length: ${this.prompt_length}.`;
  }
}

export const EVENT_CLI_CONFIG = 'gemini_cli.config';
export class StartSessionEvent implements BaseTelemetryEvent {
  'event.name': 'cli_config';
  'event.timestamp': string;
  model: string;
  embedding_model: string;
  sandbox_enabled: boolean;
  core_tools_enabled: string;
  approval_mode: string;
  api_key_enabled: boolean;
  vertex_ai_enabled: boolean;
  debug_enabled: boolean;
  mcp_servers: string;
  telemetry_enabled: boolean;
  telemetry_log_user_prompts_enabled: boolean;
  file_filtering_respect_git_ignore: boolean;
  mcp_servers_count: number;
  mcp_tools_count?: number;
  mcp_tools?: string;
  extensions_count: number;
  extensions: string;
  extension_ids: string;
  auth_type?: string;
  worktree_active: boolean;
  output_format?: string;

  constructor(config: Config, _toolRegistry?: unknown) {
    this['event.name'] = 'cli_config';
    this['event.timestamp'] = new Date().toISOString();
    this.model = config.getModel();
    this.embedding_model = config.getEmbeddingModel();
    this.sandbox_enabled = config.getSandboxEnabled();
    this.core_tools_enabled = (config.getCoreTools() ?? []).join(',');
    this.approval_mode = String(config.getApprovalMode());
    this.api_key_enabled = false;
    this.vertex_ai_enabled = false;
    this.debug_enabled = config.getDebugMode();
    this.mcp_servers = '';
    this.telemetry_enabled = config.getTelemetryEnabled();
    this.telemetry_log_user_prompts_enabled =
      config.getTelemetryLogPromptsEnabled();
    this.file_filtering_respect_git_ignore =
      config.getFileFilteringRespectGitIgnore();
    this.mcp_servers_count = 0;
    this.extensions_count = 0;
    this.extensions = '';
    this.extension_ids = '';
    this.auth_type = undefined;
    this.worktree_active = !!config.getWorktreeSettings();
    this.output_format = String(config.getOutputFormat());
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return 'CLI config.';
  }
}

export const EVENT_CONVERSATION_FINISHED = 'gemini_cli.conversation_finished';
export class ConversationFinishedEvent {
  'event_name': 'conversation_finished';
  'event.timestamp': string;
  approvalMode: ApprovalMode;
  turnCount: number;

  constructor(approvalMode: ApprovalMode, turnCount: number) {
    this['event_name'] = 'conversation_finished';
    this['event.timestamp'] = new Date().toISOString();
    this.approvalMode = approvalMode;
    this.turnCount = turnCount;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Conversation finished.`;
  }
}

export const EVENT_SLASH_COMMAND = 'gemini_cli.slash_command';
export interface SlashCommandEvent extends BaseTelemetryEvent {
  'event.name': 'slash_command';
  'event.timestamp': string;
  command: string;
  subcommand?: string;
  status?: SlashCommandStatus;
  extension_id?: string;
  toOpenTelemetryAttributes(config: Config): LogAttributes;
  toLogBody(): string;
}

export function makeSlashCommandEvent({
  command,
  subcommand,
  status,
  extension_id,
}: Omit<
  SlashCommandEvent,
  'event.name' | 'event.timestamp' | 'toOpenTelemetryAttributes' | 'toLogBody'
>): SlashCommandEvent {
  return {
    'event.name': 'slash_command',
    'event.timestamp': new Date().toISOString(),
    command,
    subcommand,
    status,
    extension_id,
    toOpenTelemetryAttributes(_config: Config): LogAttributes {
      return {};
    },
    toLogBody(): string {
      return `Slash command: ${this.command}.`;
    },
  };
}

export enum SlashCommandStatus {
  SUCCESS = CoreToolCallStatus.Success,
  ERROR = CoreToolCallStatus.Error,
}

export const EVENT_REWIND = 'gemini_cli.rewind';
export class RewindEvent implements BaseTelemetryEvent {
  'event.name': 'rewind';
  'event.timestamp': string;
  outcome: string;

  constructor(outcome: string) {
    this['event.name'] = 'rewind';
    this['event.timestamp'] = new Date().toISOString();
    this.outcome = outcome;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Rewind. Outcome: ${this.outcome}.`;
  }
}

export const EVENT_MALFORMED_JSON_RESPONSE =
  'gemini_cli.malformed_json_response';
export class MalformedJsonResponseEvent implements BaseTelemetryEvent {
  'event.name': 'malformed_json_response';
  'event.timestamp': string;
  model: string;

  constructor(model: string) {
    this['event.name'] = 'malformed_json_response';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Malformed JSON response from ${this.model}.`;
  }
}

export const EVENT_CONTENT_RETRY = 'gemini_cli.chat.content_retry';
export class ContentRetryEvent implements BaseTelemetryEvent {
  'event.name': 'content_retry';
  'event.timestamp': string;
  attempt_number: number;
  error_type: string;
  retry_delay_ms: number;
  model: string;

  constructor(
    attempt_number: number,
    error_type: string,
    retry_delay_ms: number,
    model: string,
  ) {
    this['event.name'] = 'content_retry';
    this['event.timestamp'] = new Date().toISOString();
    this.attempt_number = attempt_number;
    this.error_type = error_type;
    this.retry_delay_ms = retry_delay_ms;
    this.model = model;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Content retry attempt ${this.attempt_number} due to ${this.error_type}.`;
  }
}

export const EVENT_CONTENT_RETRY_FAILURE =
  'gemini_cli.chat.content_retry_failure';
export class ContentRetryFailureEvent implements BaseTelemetryEvent {
  'event.name': 'content_retry_failure';
  'event.timestamp': string;
  total_attempts: number;
  final_error_type: string;
  total_duration_ms?: number;
  model: string;

  constructor(
    total_attempts: number,
    final_error_type: string,
    model: string,
    total_duration_ms?: number,
  ) {
    this['event.name'] = 'content_retry_failure';
    this['event.timestamp'] = new Date().toISOString();
    this.total_attempts = total_attempts;
    this.final_error_type = final_error_type;
    this.total_duration_ms = total_duration_ms;
    this.model = model;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `All content retries failed after ${this.total_attempts} attempts.`;
  }
}

export const EVENT_NETWORK_RETRY_ATTEMPT = 'gemini_cli.network_retry_attempt';
export class NetworkRetryAttemptEvent implements BaseTelemetryEvent {
  'event.name': 'network_retry_attempt';
  'event.timestamp': string;
  attempt: number;
  max_attempts: number;
  error_type: string;
  delay_ms: number;
  model: string;

  constructor(
    attempt: number,
    max_attempts: number,
    error_type: string,
    delay_ms: number,
    model: string,
  ) {
    this['event.name'] = 'network_retry_attempt';
    this['event.timestamp'] = new Date().toISOString();
    this.attempt = attempt;
    this.max_attempts = max_attempts;
    this.error_type = error_type;
    this.delay_ms = delay_ms;
    this.model = model;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Network retry attempt ${this.attempt}/${this.max_attempts} for ${this.model}.`;
  }
}

export enum IdeConnectionType {
  START = 'start',
  SESSION = 'session',
}

export const EVENT_IDE_CONNECTION = 'gemini_cli.ide_connection';
export class IdeConnectionEvent {
  'event.name': 'ide_connection';
  'event.timestamp': string;
  connection_type: IdeConnectionType;

  constructor(connection_type: IdeConnectionType) {
    this['event.name'] = 'ide_connection';
    this['event.timestamp'] = new Date().toISOString();
    this.connection_type = connection_type;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Ide connection. Type: ${this.connection_type}.`;
  }
}

export const EVENT_EXTENSION_INSTALL = 'gemini_cli.extension_install';
export class ExtensionInstallEvent implements BaseTelemetryEvent {
  'event.name': 'extension_install';
  'event.timestamp': string;
  extension_name: string;
  hashed_extension_name: string;
  extension_id: string;
  extension_version: string;
  extension_source: string;
  status: CoreToolCallStatus.Success | CoreToolCallStatus.Error;

  constructor(
    extension_name: string,
    hashed_extension_name: string,
    extension_id: string,
    extension_version: string,
    extension_source: string,
    status: CoreToolCallStatus.Success | CoreToolCallStatus.Error,
  ) {
    this['event.name'] = 'extension_install';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.hashed_extension_name = hashed_extension_name;
    this.extension_id = extension_id;
    this.extension_version = extension_version;
    this.extension_source = extension_source;
    this.status = status;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Installed extension ${this.extension_name}`;
  }
}

export const EVENT_EXTENSION_UNINSTALL = 'gemini_cli.extension_uninstall';
export class ExtensionUninstallEvent implements BaseTelemetryEvent {
  'event.name': 'extension_uninstall';
  'event.timestamp': string;
  extension_name: string;
  hashed_extension_name: string;
  extension_id: string;
  status: CoreToolCallStatus.Success | CoreToolCallStatus.Error;

  constructor(
    extension_name: string,
    hashed_extension_name: string,
    extension_id: string,
    status: CoreToolCallStatus.Success | CoreToolCallStatus.Error,
  ) {
    this['event.name'] = 'extension_uninstall';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.hashed_extension_name = hashed_extension_name;
    this.extension_id = extension_id;
    this.status = status;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Uninstalled extension ${this.extension_name}`;
  }
}

export const EVENT_EXTENSION_UPDATE = 'gemini_cli.extension_update';
export class ExtensionUpdateEvent implements BaseTelemetryEvent {
  'event.name': 'extension_update';
  'event.timestamp': string;
  extension_name: string;
  hashed_extension_name: string;
  extension_id: string;
  extension_previous_version: string;
  extension_version: string;
  extension_source: string;
  status: CoreToolCallStatus.Success | CoreToolCallStatus.Error;

  constructor(
    extension_name: string,
    hashed_extension_name: string,
    extension_id: string,
    extension_version: string,
    extension_previous_version: string,
    extension_source: string,
    status: CoreToolCallStatus.Success | CoreToolCallStatus.Error,
  ) {
    this['event.name'] = 'extension_update';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.hashed_extension_name = hashed_extension_name;
    this.extension_id = extension_id;
    this.extension_previous_version = extension_previous_version;
    this.extension_version = extension_version;
    this.extension_source = extension_source;
    this.status = status;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Updated extension ${this.extension_name}`;
  }
}

export const EVENT_EXTENSION_ENABLE = 'gemini_cli.extension_enable';
export class ExtensionEnableEvent implements BaseTelemetryEvent {
  'event.name': 'extension_enable';
  'event.timestamp': string;
  extension_name: string;
  hashed_extension_name: string;
  extension_id: string;
  setting_scope: string;

  constructor(
    extension_name: string,
    hashed_extension_name: string,
    extension_id: string,
    settingScope: string,
  ) {
    this['event.name'] = 'extension_enable';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.hashed_extension_name = hashed_extension_name;
    this.extension_id = extension_id;
    this.setting_scope = settingScope;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Enabled extension ${this.extension_name}`;
  }
}

export const EVENT_EXTENSION_DISABLE = 'gemini_cli.extension_disable';
export class ExtensionDisableEvent implements BaseTelemetryEvent {
  'event.name': 'extension_disable';
  'event.timestamp': string;
  extension_name: string;
  hashed_extension_name: string;
  extension_id: string;
  setting_scope: string;

  constructor(
    extension_name: string,
    hashed_extension_name: string,
    extension_id: string,
    settingScope: string,
  ) {
    this['event.name'] = 'extension_disable';
    this['event.timestamp'] = new Date().toISOString();
    this.extension_name = extension_name;
    this.hashed_extension_name = hashed_extension_name;
    this.extension_id = extension_id;
    this.setting_scope = settingScope;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Disabled extension ${this.extension_name}`;
  }
}

export const EVENT_MODEL_SLASH_COMMAND = 'gemini_cli.slash_command.model';
export class ModelSlashCommandEvent implements BaseTelemetryEvent {
  'event.name': 'model_slash_command';
  'event.timestamp': string;
  model_name: string;

  constructor(model_name: string) {
    this['event.name'] = 'model_slash_command';
    this['event.timestamp'] = new Date().toISOString();
    this.model_name = model_name;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Model slash command: ${this.model_name}`;
  }
}

export const EVENT_TOOL_OUTPUT_MASKING = 'gemini_cli.tool_output_masking';
export class ToolOutputMaskingEvent implements BaseTelemetryEvent {
  'event.name': 'tool_output_masking';
  'event.timestamp': string;
  tokens_before: number;
  tokens_after: number;
  masked_count: number;
  total_prunable_tokens: number;

  constructor(details: {
    tokens_before: number;
    tokens_after: number;
    masked_count: number;
    total_prunable_tokens: number;
  }) {
    this['event.name'] = 'tool_output_masking';
    this['event.timestamp'] = new Date().toISOString();
    this.tokens_before = details.tokens_before;
    this.tokens_after = details.tokens_after;
    this.masked_count = details.masked_count;
    this.total_prunable_tokens = details.total_prunable_tokens;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Tool output masking: ${this.masked_count} masked.`;
  }
}

export const EVENT_KEYCHAIN_AVAILABILITY = 'gemini_cli.keychain.availability';
export class KeychainAvailabilityEvent implements BaseTelemetryEvent {
  'event.name': 'keychain_availability';
  'event.timestamp': string;
  available: boolean;

  constructor(available: boolean) {
    this['event.name'] = 'keychain_availability';
    this['event.timestamp'] = new Date().toISOString();
    this.available = available;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Keychain available: ${this.available}.`;
  }
}

export const EVENT_TOKEN_STORAGE_INITIALIZATION =
  'gemini_cli.token_storage_initialization';
export class TokenStorageInitializationEvent implements BaseTelemetryEvent {
  'event.name': 'token_storage_initialization';
  'event.timestamp': string;
  type: string;
  forced: boolean;

  constructor(type: string, forced: boolean) {
    this['event.name'] = 'token_storage_initialization';
    this['event.timestamp'] = new Date().toISOString();
    this.type = type;
    this.forced = forced;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Token storage initialization: ${this.type}.`;
  }
}

export const EVENT_CHAT_COMPRESSION = 'gemini_cli.chat_compression';
export interface ChatCompressionEvent extends BaseTelemetryEvent {
  'event.name': 'chat_compression';
  'event.timestamp': string;
  tokens_before: number;
  tokens_after: number;
  toOpenTelemetryAttributes(config: Config): LogAttributes;
  toLogBody(): string;
}

export function makeChatCompressionEvent({
  tokens_before,
  tokens_after,
}: Omit<
  ChatCompressionEvent,
  'event.name' | 'event.timestamp' | 'toOpenTelemetryAttributes' | 'toLogBody'
>): ChatCompressionEvent {
  return {
    'event.name': 'chat_compression',
    'event.timestamp': new Date().toISOString(),
    tokens_before,
    tokens_after,
    toOpenTelemetryAttributes(_config: Config): LogAttributes {
      return {};
    },
    toLogBody(): string {
      return `Chat compression (Saved ${tokens_before - tokens_after} tokens)`;
    },
  };
}

export type TelemetryEvent =
  | UserPromptEvent
  | StartSessionEvent
  | ConversationFinishedEvent
  | SlashCommandEvent
  | RewindEvent
  | IdeConnectionEvent;

export interface ServerDetails {
  address: string;
  port: number;
}

export interface GenAIPromptDetails {
  prompt_id: string;
  contents: unknown[];
  generate_content_config?: unknown;
  server?: ServerDetails;
}

export interface GenAIResponseDetails {
  finish_reasons: string[];
  response_id?: string;
  server?: ServerDetails;
}

export interface ContextBreakdown {
  context_size?: number;
  char_count?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  visible_input_tokens?: number;
  visible_output_tokens?: number;
  thought_tokens?: number;
  tool_tokens?: number;
}

export interface GenAIUsageDetails {
  input_token_count: number;
  output_token_count: number;
  total_token_count: number;
  cached_content_token_count: number;
  thoughts_token_count: number;
  tool_token_count: number;
}

export const EVENT_TOOL_CALL = 'gemini_cli.tool_call';
export class ToolCallEvent implements BaseTelemetryEvent {
  'event.name': 'tool_call';
  'event.timestamp': string;
  function_name: string;
  function_args: Record<string, unknown>;
  duration_ms: number;
  success: boolean;
  decision?: import('./tool-call-decision.js').ToolCallDecision;
  error?: string;
  error_type?: string;
  prompt_id: string;
  tool_type: 'native' | 'mcp';
  content_length?: number;
  mcp_server_name?: string;
  extension_name?: string;
  extension_id?: string;
  start_time?: number;
  end_time?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: { [key: string]: any };

  constructor(
    function_name: string,
    function_args: Record<string, unknown>,
    duration_ms: number,
    success: boolean,
    prompt_id: string,
    tool_type: 'native' | 'mcp',
    error?: string,
  ) {
    this['event.name'] = 'tool_call';
    this['event.timestamp'] = new Date().toISOString();
    this.function_name = function_name;
    this.function_args = function_args;
    this.duration_ms = duration_ms;
    this.success = success;
    this.prompt_id = prompt_id;
    this.tool_type = tool_type;
    this.error = error;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Tool call: ${this.function_name}`;
  }
}

export const EVENT_API_ERROR = 'gemini_cli.api_error';
export class ApiErrorEvent implements BaseTelemetryEvent {
  'event.name': 'api_error';
  'event.timestamp': string;
  model: string;
  prompt: GenAIPromptDetails;
  error: string;
  error_type?: string;
  status_code?: number | string;
  duration_ms: number;
  auth_type?: string;
  role?: LlmRole;

  constructor(
    model: string,
    error: string,
    duration_ms: number,
    prompt_details: GenAIPromptDetails,
    auth_type?: string,
    error_type?: string,
    status_code?: number | string,
    role?: LlmRole,
  ) {
    this['event.name'] = 'api_error';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.error = error;
    this.error_type = error_type;
    this.status_code = status_code;
    this.duration_ms = duration_ms;
    this.prompt = prompt_details;
    this.auth_type = auth_type;
    this.role = role;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `API error for ${this.model}. Error: ${this.error}.`;
  }
}

export const EVENT_API_RESPONSE = 'gemini_cli.api_response';
export class ApiResponseEvent implements BaseTelemetryEvent {
  'event.name': 'api_response';
  'event.timestamp': string;
  model: string;
  prompt: GenAIPromptDetails;
  duration_ms: number;
  response?: GenAIResponseDetails;
  usage: GenAIUsageDetails;
  auth_type?: string;
  role?: LlmRole;
  status_code?: number | string;

  constructor(
    model: string,
    duration_ms: number,
    prompt_details: GenAIPromptDetails,
    usage: GenAIUsageDetails,
    response: GenAIResponseDetails | undefined,
    auth_type?: string,
    role?: LlmRole,
    status_code?: number | string,
  ) {
    this['event.name'] = 'api_response';
    this['event.timestamp'] = new Date().toISOString();
    this.model = model;
    this.duration_ms = duration_ms;
    this.prompt = prompt_details;
    this.usage = usage;
    this.response = response;
    this.auth_type = auth_type;
    this.role = role;
    this.status_code = status_code;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `API response for ${this.model}. Duration: ${this.duration_ms}ms.`;
  }
}

export interface StartupPhaseStats {
  name: string;
  duration_ms: number;
  cpu_usage_user_usec: number;
  cpu_usage_system_usec: number;
  start_time_usec: number;
  end_time_usec: number;
}

export const EVENT_STARTUP_STATS = 'gemini_cli.startup_stats';
export class StartupStatsEvent implements BaseTelemetryEvent {
  'event.name': 'startup_stats';
  'event.timestamp': string;
  phases: StartupPhaseStats[];
  os_platform: string;
  os_release: string;
  is_docker: boolean;

  constructor(
    phases: StartupPhaseStats[],
    os_platform: string,
    os_release: string,
    is_docker: boolean,
  ) {
    this['event.name'] = 'startup_stats';
    this['event.timestamp'] = new Date().toISOString();
    this.phases = phases;
    this.os_platform = os_platform;
    this.os_release = os_release;
    this.is_docker = is_docker;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return 'Startup stats.';
  }
}

export const EVENT_HOOK_CALL = 'gemini_cli.hook_call';
export class HookCallEvent implements BaseTelemetryEvent {
  'event.name': string;
  'event.timestamp': string;
  hook_event_name: string;
  hook_type: import('../hooks/types.js').HookType;
  hook_name: string;
  hook_input: Record<string, unknown>;
  hook_output?: Record<string, unknown>;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  duration_ms: number;
  success: boolean;
  error?: string;

  constructor(
    hookEventName: string,
    hookType: import('../hooks/types.js').HookType,
    hookName: string,
    hookInput: Record<string, unknown>,
    durationMs: number,
    success: boolean,
    hookOutput?: Record<string, unknown>,
    exitCode?: number,
    stdout?: string,
    stderr?: string,
    error?: string,
  ) {
    this['event.name'] = 'hook_call';
    this['event.timestamp'] = new Date().toISOString();
    this.hook_event_name = hookEventName;
    this.hook_type = hookType;
    this.hook_name = hookName;
    this.hook_input = hookInput;
    this.hook_output = hookOutput;
    this.exit_code = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
    this.duration_ms = durationMs;
    this.success = success;
    this.error = error;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `Hook call: ${this.hook_name}.`;
  }
}

export const EVENT_FILE_OPERATION = 'gemini_cli.file_operation';
export class FileOperationEvent implements BaseTelemetryEvent {
  'event.name': 'file_operation';
  'event.timestamp': string;
  tool_name: string;
  operation: import('./metrics.js').FileOperation;
  lines?: number;
  mimetype?: string;
  extension?: string;
  programming_language?: string;

  constructor(
    tool_name: string,
    operation: import('./metrics.js').FileOperation,
    lines?: number,
    mimetype?: string,
    extension?: string,
    programming_language?: string,
  ) {
    this['event.name'] = 'file_operation';
    this['event.timestamp'] = new Date().toISOString();
    this.tool_name = tool_name;
    this.operation = operation;
    this.lines = lines;
    this.mimetype = mimetype;
    this.extension = extension;
    this.programming_language = programming_language;
  }

  toOpenTelemetryAttributes(_config: Config): LogAttributes {
    return {};
  }

  toLogBody(): string {
    return `File operation: ${this.operation} via ${this.tool_name}.`;
  }
}
