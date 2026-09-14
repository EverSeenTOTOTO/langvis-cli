/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/telemetry/loggers.ts，langvis 关闭此能力：
// 遥测外发全部关闭，logger 为 no-op（签名与上游同形）。

import type { Config } from '../config/config.js';
import type {
  ChatCompressionEvent,
  ConversationFinishedEvent,
  ExtensionDisableEvent,
  ExtensionEnableEvent,
  ExtensionInstallEvent,
  ExtensionUninstallEvent,
  ExtensionUpdateEvent,
  IdeConnectionEvent,
  MalformedJsonResponseEvent,
  ModelSlashCommandEvent,
  NetworkRetryAttemptEvent,
  ContentRetryEvent,
  ContentRetryFailureEvent,
  RewindEvent,
  SlashCommandEvent,
  StartSessionEvent,
  ToolOutputMaskingEvent,
  UserPromptEvent,
  HookCallEvent,
  StartupStatsEvent,
} from './types.js';

export function logCliConfiguration(
  _config: Config,
  _event: StartSessionEvent,
): void {}

export function logUserPrompt(_config: Config, _event: UserPromptEvent): void {}

export function logToolCall(..._args: unknown[]): void {}

export function logToolOutputTruncated(..._args: unknown[]): void {}

export function logToolOutputMasking(
  _config: Config,
  _event: ToolOutputMaskingEvent,
): void {}

export function logFileOperation(..._args: unknown[]): void {}

export function logApiRequest(..._args: unknown[]): void {}

export function logApiError(..._args: unknown[]): void {}

export function logApiResponse(..._args: unknown[]): void {}

export function logFlashFallback(..._args: unknown[]): void {}

export function logRipgrepFallback(..._args: unknown[]): void {}

export function logLoopDetected(..._args: unknown[]): void {}

export function logLoopDetectionDisabled(..._args: unknown[]): void {}

export function logNextSpeakerCheck(..._args: unknown[]): void {}

export function logSlashCommand(
  _config: Config,
  _event: SlashCommandEvent,
): void {}

export function logRewind(_config: Config, _event: RewindEvent): void {}

export function logIdeConnection(
  _config: Config,
  _event: IdeConnectionEvent,
): void {}

export function logConversationFinishedEvent(
  _config: Config,
  _event: ConversationFinishedEvent,
): void {}

export function logChatCompression(
  _config: Config,
  _event: ChatCompressionEvent,
): void {}

export function logMalformedJsonResponse(
  _config: Config,
  _event: MalformedJsonResponseEvent,
): void {}

export function logInvalidChunk(..._args: unknown[]): void {}

export function logNetworkRetryAttempt(
  _config: Config,
  _event: NetworkRetryAttemptEvent,
): void {}

export function logContentRetry(
  _config: Config,
  _event: ContentRetryEvent,
): void {}

export function logContentRetryFailure(
  _config: Config,
  _event: ContentRetryFailureEvent,
): void {}

export function logModelRouting(..._args: unknown[]): void {}

export function logModelSlashCommand(
  _config: Config,
  _event: ModelSlashCommandEvent,
): void {}

export function logEditStrategy(..._args: unknown[]): void {}

export function logEditCorrectionEvent(..._args: unknown[]): void {}

export function logAgentStart(..._args: unknown[]): void {}

export function logAgentFinish(..._args: unknown[]): void {}

export function logWebFetchFallbackAttempt(..._args: unknown[]): void {}

export function logNetworkRetry(..._args: unknown[]): void {}

export function logOnboardingStart(..._args: unknown[]): void {}

export function logOnboardingSuccess(..._args: unknown[]): void {}

export function logBillingEvent(..._args: unknown[]): void {}

export async function logExtensionInstallEvent(
  _config: Config,
  _event: ExtensionInstallEvent,
): Promise<void> {}

export async function logExtensionUninstall(
  _config: Config,
  _event: ExtensionUninstallEvent,
): Promise<void> {}

export async function logExtensionUpdateEvent(
  _config: Config,
  _event: ExtensionUpdateEvent,
): Promise<void> {}

export async function logExtensionEnable(
  _config: Config,
  _event: ExtensionEnableEvent,
): Promise<void> {}

export async function logExtensionDisable(
  _config: Config,
  _event: ExtensionDisableEvent,
): Promise<void> {}

export function logHookCall(_config: Config, _event: HookCallEvent): void {}

export function logStartupStats(
  _config: Config,
  _event: StartupStatsEvent,
): void {}
