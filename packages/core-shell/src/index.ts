/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// core-shell：以 langvis 后端为心脏顶替 @google/gemini-cli-core 的 UI 契约。
// 纯类型/纯函数直接拷自上游；有状态服务为薄壳；按 cli 消费面 tsc 驱动增长。
// langvis/ 目录（协议实现）不在本出口——由 cli 装配层直接引用。

export * from './config/config.js';
export * from './config/agent-loop-context.js';
export * from './config/memory.js';
export * from './config/defaultModelConfigs.js';
export * from './config/models.js';
export * from './config/constants.js';
export * from './output/types.js';
export * from './output/json-formatter.js';
export * from './output/stream-json-formatter.js';
export * from './policy/types.js';
export * from './policy/policy-engine.js';
export * from './policy/toml-loader.js';
export * from './policy/config.js';
export * from './policy/integrity.js';
export * from './config/extensions/integrity.js';
export * from './config/extensions/integrityTypes.js';
export * from './confirmation-bus/types.js';
export * from './confirmation-bus/message-bus.js';
export * from './commands/types.js';
export * from './commands/memory.js';
export * from './commands/init.js';
export * from './commands/restore.js';
export * from './core/client.js';
export * from './core/contentGenerator.js';
export * from './core/logger.js';
export * from './core/tokenLimits.js';
export * from './core/turn.js';
export * from './core/geminiRequest.js';
export * from './core/apiKeyCredentialStorage.js';
export * from './scheduler/scheduler.js';
export * from './scheduler/types.js';
export * from './fallback/types.js';
export * from './fallback/handler.js';
export * from './code_assist/types.js';
export * from './code_assist/server.js';
export * from './code_assist/setup.js';
export * from './code_assist/codeAssist.js';
export * from './code_assist/oauth2.js';
export * from './code_assist/telemetry.js';
export * from './code_assist/converter.js';
export * from './code_assist/admin/mcpUtils.js';
export * from './code_assist/experiments/experiments.js';
export * from './code_assist/experiments/flagNames.js';
export * from './code_assist/experiments/types.js';
export * from './utils/fetch.js';
export { homedir, tmpdir } from './utils/paths.js';
export * from './utils/paths.js';
export * from './utils/checks.js';
export * from './utils/headless.js';
export * from './utils/schemaValidator.js';
export * from './utils/errors.js';
export * from './utils/fsErrorMessages.js';
export * from './utils/exitCodes.js';
export * from './utils/getFolderStructure.js';
export * from './utils/getPty.js';
export * from './utils/gitIgnoreParser.js';
export * from './utils/gitUtils.js';
export * from './utils/editor.js';
export * from './utils/quotaErrorDetection.js';
export * from './utils/userAccountManager.js';
export * from './utils/authConsent.js';
export * from './utils/googleQuotaErrors.js';
export * from './utils/googleErrors.js';
export * from './utils/fileUtils.js';
export * from './utils/sessionOperations.js';
export * from './utils/planUtils.js';
export * from './utils/approvalModeUtils.js';
export * from './utils/fileDiffUtils.js';
export * from './utils/path-validator.js';
export * from './utils/atCommandUtils.js';
export * from './utils/retry.js';
export * from './utils/shell-utils.js';
export * from './utils/security.js';
export * from './utils/tool-utils.js';
export * from './utils/terminalSerializer.js';
export * from './utils/textUtils.js';
export * from './utils/generateContentResponseUtilities.js';
export * from './utils/errorParsing.js';
export * from './utils/workspaceContext.js';
export * from './utils/environmentContext.js';
export * from './utils/ignorePatterns.js';
export * from './utils/partUtils.js';
export * from './utils/promptIdContext.js';
export * from './utils/thoughtUtils.js';
export * from './utils/secure-browser-launcher.js';
export * from './utils/browser.js';
export * from './utils/markdownUtils.js';
export * from './utils/buildFileUtils.js';
export * from './utils/sessionUtils.js';
export * from './utils/session.js';
export * from './utils/cryptoUtils.js';
export * from './utils/tokenCalculation.js';
export * from './utils/channel.js';
export * from './utils/version.js';
export * from './utils/package.js';
export * from './utils/cache.js';
export * from './utils/checkpointUtils.js';
export * from './utils/pathReader.js';
export * from './utils/stdio.js';
export * from './utils/terminal.js';
export * from './utils/compatibility.js';
export * from './utils/httpErrors.js';
export * from './utils/apiConversionUtils.js';
export * from './utils/modelUtils.js';
export * from './utils/errorReporting.js';
export * from './utils/messageInspectors.js';
export * from './utils/historyHardening.js';
export * from './utils/delay.js';
export * from './utils/binaryCheck.js';
export * from './utils/extensionLoader.js';
export * from './utils/oauth-flow.js';
export * from './utils/trust.js';
export * from './utils/debugLogger.js';
export * from './utils/events.js';
export * from './utils/safeJsonStringify.js';
export * from './utils/ragLogger.js';
export * from './utils/ignoreFileParser.js';
export * from './utils/ignorePathUtils.js';
export * from './tools/tools.js';
export * from './tools/tool-error.js';
export * from './tools/tool-names.js';
export * from './tools/tool-registry.js';
export * from './tools/mcp-client.js';
export * from './tools/mcp-client-manager.js';
export * from './tools/mcp-tool.js';
export * from './tools/grep-utils.js';
export * from './tools/memoryTool.js';
export * from './tools/definitions/base-declarations.js';
export * from './agents/types.js';
export * from './agents/registry.js';
export * from './agents/agentLoader.js';
export type {
  AgentProtocol,
  AgentEvent,
  AgentEvents,
  AgentEventType,
  AgentSend,
  ContentPart,
  ToolDisplay,
  DisplayContent,
  DisplayText,
  DisplayDiff,
  Trajectory,
  WithMeta,
} from './agent/types.js';
export type { Unsubscribe as AgentUnsubscribe } from './agent/types.js';
export * from './agent/legacy-agent-protocol.js';
export * from './agent/content-utils.js';
export * from './agent/tool-display-utils.js';
export * from './safety/protocol.js';
export * from './services/sandboxManager.js';
export * from './services/sandboxManagerFactory.js';
export * from './services/shellExecutionService.js';
export * from './services/executionLifecycleService.js';
export * from './services/chatRecordingService.js';
export * from './services/chatRecordingTypes.js';
export * from './services/gitService.js';
export * from './services/fileSystemService.js';
export * from './services/fileDiscoveryService.js';
export * from './services/FolderTrustDiscoveryService.js';
export * from './services/modelConfigService.js';
export * from './services/memoryService.js';
export * from './services/memoryPatchUtils.js';
export * from './services/sessionSummaryUtils.js';
export * from './services/sessionScratchpadUtils.js';
export * from './services/keychainService.js';
export * from './services/keychainTypes.js';
export * from './services/fileKeychain.js';
export * from './ide/types.js';
export * from './ide/constants.js';
export * from './ide/detect-ide.js';
export * from './ide/ide-client.js';
export * from './ide/ideContext.js';
export * from './ide/ide-installer.js';
export * from './hooks/types.js';
export * from './hooks/hookRegistry.js';
export * from './hooks/hookSystem.js';
export { Storage } from './config/storage.js';
export * from './config/projectRegistry.js';
export * from './config/storageMigration.js';
export * from './config/injectionService.js';
export * from './prompts/prompt-registry.js';
export * from './prompts/mcp-prompts.js';
export * from './resources/resource-registry.js';
export * from './skills/skillLoader.js';
export * from './skills/skillManager.js';
export {
  DEFAULT_TOOL_PROTECTION_THRESHOLD,
  DEFAULT_MIN_PRUNABLE_TOKENS_THRESHOLD,
  DEFAULT_PROTECT_LATEST_TURN,
} from './context/toolOutputMaskingService.js';
export * from './context/types.js';
export * from './availability/errorClassification.js';
export * from './availability/modelAvailabilityService.js';
export * from './availability/modelPolicy.js';
export * from './availability/policyHelpers.js';
export * from './mcp/oauth-provider.js';
export * from './mcp/oauth-token-storage.js';
export * from './mcp/oauth-utils.js';
export * from './mcp/token-storage/index.js';
export * from './voice/audioRecorder.js';
export * from './voice/transcriptionFactory.js';
export * from './voice/transcriptionProvider.js';
export * from './voice/whisperModelManager.js';
export * from './telemetry/index.js';
export * from './telemetry/startupProfiler.js';
export * from './telemetry/constants.js';
export * from './telemetry/tool-call-decision.js';
export * from './commands/extensions.js';
export * from './billing/billing.js';
export * from './code_assist/admin/admin_controls.js';
export * from './tools/read-many-files.js';
export * from './tools/glob.js';
export * from './tools/ask-user.js';
export * from './utils/filesearch/fileSearch.js';
export * from './utils/fastAckHelper.js';
export * from './services/worktreeService.js';
export * from './utils/tool-visibility.js';
export * from './utils/testUtils.js';
export * from './core/agentChatHistory.js';
export * from './utils/constants.js';
export * from './core/baseLlmClient.js';
export * from './telemetry/telemetry-utils.js';
export * from './utils/language-detection.js';
export type { Content, Part, FunctionCall } from '@google/genai';

// ─── langvis 接入面（装配层消费） ───
export {
  langvisClient,
  setLangvisConversation,
  getLangvisConversationId,
} from './langvis/agent-protocol.js';
export { LangvisClient, LangvisNotLoggedInError } from './langvis/client.js';
export type {
  LangvisConversation,
  LangvisMessage,
  LangvisSkill,
  LangvisModel,
  LangvisTurn,
  RunEvent as LangvisRunEvent,
  EnrichedEvent as LangvisEnrichedEvent,
  StreamFrame as LangvisStreamFrame,
} from './langvis/types.js';
export {
  fetchAndCacheLangvisModels,
  fetchAndCacheLangvisSkills,
  getLangvisModelDefinitions,
  setLangvisConversationRecord,
  getLangvisConversationRecord,
  bindLangvisRecordListener,
  getLangvisCurrentModelId,
} from './langvis/models.js';
export { playLangvisAudio } from './langvis/audio.js';
export { langvisBaseUrl } from './langvis/client.js';
