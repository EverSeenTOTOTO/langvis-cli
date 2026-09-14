/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/telemetry/index.ts，langvis 关闭此能力：
// 只保留类型与 no-op 聚合出口；OTel/GCP/Clearcut 导出器全数裁去。

export enum TelemetryTarget {
  GCP = 'gcp',
  LOCAL = 'local',
}

const DEFAULT_TELEMETRY_TARGET = TelemetryTarget.LOCAL;
const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4317';

export { DEFAULT_TELEMETRY_TARGET, DEFAULT_OTLP_ENDPOINT };

export {
  initializeTelemetry,
  shutdownTelemetry,
  flushTelemetry,
  isTelemetrySdkInitialized,
} from './sdk.js';

export {
  resolveTelemetrySettings,
  parseBooleanEnvFlag,
  parseTelemetryTargetValue,
} from './config.js';

export * from './loggers.js';

export {
  SlashCommandStatus,
  makeSlashCommandEvent,
  makeChatCompressionEvent,
  ConversationFinishedEvent,
  StartSessionEvent,
  UserPromptEvent,
  RewindEvent,
  IdeConnectionEvent,
  IdeConnectionType,
  ModelSlashCommandEvent,
  ExtensionInstallEvent,
  ExtensionUninstallEvent,
  ExtensionUpdateEvent,
  ExtensionEnableEvent,
  ExtensionDisableEvent,
} from './types.js';
export type {
  SlashCommandEvent,
  ChatCompressionEvent,
  TelemetryEvent,
} from './types.js';

export { LlmRole } from './llmRole.js';
export { ToolCallDecision } from './tool-call-decision.js';
export { runInDevTraceSpan } from './trace.js';
export type { SpanMetadata } from './trace.js';

export * from './uiTelemetry.js';
export * from './billingEvents.js';

export {
  recordCreditPurchaseClick,
  recordExitFail,
  recordFlickerFrame,
  recordOverageOptionSelected,
  recordSlowRender,
} from './metrics.js';
