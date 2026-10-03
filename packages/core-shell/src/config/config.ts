/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/config/config.ts，langvis 关闭此能力：Config 是宽构造空壳。
// 类型（ConfigParameters/MCPServerConfig 等）与上游同形；方法按 cli 消费面给出
// 语义默认值（交互开、MCP/扩展/沙箱/遥测关、模型走构造参数）。
// 真正的会话/模型/工具状态由 langvis 后端持有，本壳不落地。

import { z } from 'zod';
import type { EventEmitter } from 'node:events';
import type { GenerateContentParameters } from '@google/genai';
import { Storage } from './storage.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import type { ExtensionLoader } from '../utils/extensionLoader.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { ApprovalMode } from '../policy/types.js';
import { coreEvents } from '../utils/events.js';
import { GeminiClient } from '../core/client.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ResourceRegistry } from '../resources/resource-registry.js';
import { AgentRegistry } from '../agents/registry.js';
import { SkillManager } from '../skills/skillManager.js';
import type { HookSystem } from '../hooks/hookSystem.js';
import type { McpClientManager } from '../tools/mcp-client-manager.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import {
  StandardFileSystemService,
  type FileSystemService,
} from '../services/fileSystemService.js';
import {
  NoopSandboxManager,
  type SandboxManager,
} from '../services/sandboxManager.js';
import type {
  ShellExecutionConfig,
  ShellOutputEvent,
} from '../services/shellExecutionService.js';
import { InjectionService } from './injectionService.js';
import { TelemetryTarget } from '../telemetry/index.js';
import { OutputFormat } from '../output/types.js';
import type { OverageStrategy } from '../billing/billing.js';
import type {
  UserTierId,
  GeminiUserTier,
  RetrieveUserQuotaResponse,
  AdminControlsSettings,
} from '../code_assist/types.js';
import type { Experiments } from '../code_assist/experiments/experiments.js';
import type { ContextManagementConfig } from '../context/types.js';
import type { HierarchicalMemory } from './memory.js';
import type { ConversationRecord } from '../services/chatRecordingTypes.js';

import { checkPathTrust } from '../utils/trust.js';
import { flattenMemory } from './memory.js';
import {
  ModelConfigService,
  type ModelConfigServiceConfig,
  type ModelConfig,
} from '../services/modelConfigService.js';
import { FileExclusions } from '../utils/ignorePatterns.js';
import { getProjectHash } from '../utils/paths.js';
import type {
  FallbackModelHandler,
  ValidationHandler,
} from '../fallback/types.js';
import type { HookDefinition, HookEventName } from '../hooks/types.js';
import type { AgentDefinition } from '../agents/types.js';
import type { SkillDefinition } from '../skills/skillLoader.js';
import type {
  PolicyRule,
  SafetyCheckerRule,
  PolicyEngineConfig,
} from '../policy/types.js';
import type { MCPOAuthConfig } from '../mcp/oauth-provider.js';
import type { AnyDeclarativeTool, AnyToolInvocation } from '../tools/tools.js';
import type {
  AuthType,
  ContentGeneratorConfig,
  VertexAiRoutingConfig,
  ContentGenerator,
} from '../core/contentGenerator.js';
import { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import {
  getLangvisModelDefinitions,
  getLangvisConversationRecord,
  getLangvisCurrentModelId,
  getLangvisSkills,
} from '../langvis/models.js';
import { langvisClient } from '../langvis/agent-protocol.js';
import type { EnvironmentSanitizationConfig } from '../services/environmentSanitization.js';
import {
  DEFAULT_FILE_FILTERING_OPTIONS,
  type FileFilteringOptions,
} from './constants.js';

export { DEFAULT_FILE_FILTERING_OPTIONS };
export type { FileFilteringOptions };

export type {
  MCPOAuthConfig,
  AnyToolInvocation,
  AnyDeclarativeTool,
  ConversationRecord,
};

export interface AccessibilitySettings {
  screenReader?: boolean;
}

export interface BugCommandSettings {
  urlTemplate: string;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}

export interface PlanSettings {
  enabled?: boolean;
  directory?: string;
  modelRouting?: boolean;
}

export interface TelemetrySettings {
  enabled?: boolean;
  traces?: boolean;
  target?: TelemetryTarget;
  otlpEndpoint?: string;
  otlpProtocol?: 'grpc' | 'http';
  logPrompts?: boolean;
  outfile?: string;
  useCollector?: boolean;
  useCliAuth?: boolean;
}

export interface OutputSettings {
  format?: OutputFormat;
}

export interface GemmaModelRouterSettings {
  enabled?: boolean;
  autoStartServer?: boolean;
  binaryPath?: string;
  classifier?: {
    host?: string;
    model?: string;
  };
}

export interface ADKSettings {
  agentSessionNoninteractiveEnabled?: boolean;
  agentSessionInteractiveEnabled?: boolean;
  agentSessionSubagentEnabled?: boolean;
}

export interface ExtensionSetting {
  name: string;
  description: string;
  envVar: string;
  sensitive?: boolean;
}

export interface ResolvedExtensionSetting {
  name: string;
  envVar: string;
  value?: string;
  sensitive: boolean;
  scope?: 'user' | 'workspace';
  source?: string;
}

export interface TrajectoryProvider {
  prefix: string;
  displayName?: string;
  listSessions(workspaceUri?: string): Promise<
    Array<{
      id: string;
      mtime: string;
      name?: string;
      displayName?: string;
      messageCount?: number;
    }>
  >;
  loadSession(id: string): Promise<ConversationRecord | null>;
}

export interface AgentRunConfig {
  maxTimeMinutes?: number;
  maxTurns?: number;
}

export interface AgentOverride {
  modelConfig?: ModelConfig;
  runConfig?: AgentRunConfig;
  enabled?: boolean;
  tools?: string[];
  mcpServers?: Record<string, MCPServerConfig>;
}

export interface AgentSettings {
  overrides?: Record<string, AgentOverride>;
}

export interface CustomTheme {
  type: 'custom';
  name: string;

  text?: {
    primary?: string;
    secondary?: string;
    link?: string;
    accent?: string;
    response?: string;
  };
  background?: {
    primary?: string;
    diff?: {
      added?: string;
      removed?: string;
    };
  };
  border?: {
    default?: string;
  };
  ui?: {
    comment?: string;
    symbol?: string;
    active?: string;
    focus?: string;
    gradient?: string[];
  };
  status?: {
    error?: string;
    success?: string;
    warning?: string;
  };

  Background?: string;
  Foreground?: string;
  LightBlue?: string;
  AccentBlue?: string;
  AccentPurple?: string;
  AccentCyan?: string;
  AccentGreen?: string;
  AccentYellow?: string;
  AccentRed?: string;
  DiffAdded?: string;
  DiffRemoved?: string;
  Comment?: string;
  Gray?: string;
  DarkGray?: string;
  GradientColors?: string[];
}

export interface GeminiCLIExtension {
  name: string;
  version: string;
  isActive: boolean;
  path: string;
  installMetadata?: ExtensionInstallMetadata;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFiles: string[];
  excludeTools?: string[];
  id: string;
  hooks?: { [K in HookEventName]?: HookDefinition[] };
  settings?: ExtensionSetting[];
  resolvedSettings?: ResolvedExtensionSetting[];
  skills?: SkillDefinition[];
  agents?: AgentDefinition[];
  themes?: CustomTheme[];
  rules?: PolicyRule[];
  checkers?: SafetyCheckerRule[];
  plan?: {
    directory?: string;
  };
  migratedTo?: string;
  trajectoryProviderModule?: TrajectoryProvider;
}

export interface ExtensionInstallMetadata {
  source: string;
  type: 'git' | 'local' | 'link' | 'github-release';
  releaseTag?: string;
  ref?: string;
  autoUpdate?: boolean;
  allowPreRelease?: boolean;
}

export const DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD = 40_000;

export class MCPServerConfig {
  constructor(
    readonly command?: string,
    readonly args?: string[],
    readonly env?: Record<string, string>,
    readonly cwd?: string,
    readonly url?: string,
    readonly httpUrl?: string,
    readonly headers?: Record<string, string>,
    readonly tcp?: string,
    readonly type?: 'sse' | 'http',
    readonly timeout?: number,
    readonly trust?: boolean,
    readonly description?: string,
    readonly includeTools?: string[],
    readonly excludeTools?: string[],
    readonly extension?: GeminiCLIExtension,
    readonly oauth?: MCPOAuthConfig,
    readonly authProviderType?: AuthProviderType,
    readonly targetAudience?: string,
    readonly targetServiceAccount?: string,
  ) {}
}

export enum AuthProviderType {
  DYNAMIC_DISCOVERY = 'dynamic_discovery',
  GOOGLE_CREDENTIALS = 'google_credentials',
  SERVICE_ACCOUNT_IMPERSONATION = 'service_account_impersonation',
}

export interface SandboxConfig {
  enabled: boolean;
  allowedPaths?: string[];
  includeDirectories?: string[];
  networkAccess?: boolean;
  command?:
    | 'docker'
    | 'podman'
    | 'sandbox-exec'
    | 'runsc'
    | 'lxc'
    | 'windows-native';
  image?: string;
}

export const ConfigSchema = z.object({
  sandbox: z
    .object({
      enabled: z.boolean().default(false),
      allowedPaths: z.array(z.string()).default([]),
      includeDirectories: z.array(z.string()).default([]),
      networkAccess: z.boolean().default(false),
      command: z
        .enum([
          'docker',
          'podman',
          'sandbox-exec',
          'runsc',
          'lxc',
          'windows-native',
        ])
        .optional(),
      image: z.string().optional(),
    })
    .optional(),
});

export interface McpEnablementCallbacks {
  isSessionDisabled: (serverId: string) => boolean;
  isFileEnabled: (serverId: string) => Promise<boolean>;
}

export interface PolicyUpdateConfirmationRequest {
  scope: string;
  identifier: string;
  policyDir: string;
  newHash: string;
}

export interface WorktreeSettings {
  name: string;
  path: string;
  baseSha: string;
}

export interface ConfigParameters {
  sessionId: string;
  clientName?: string;
  clientVersion?: string;
  embeddingModel?: string;
  sandbox?: SandboxConfig;
  toolSandboxing?: boolean;
  targetDir: string;
  debugMode: boolean;
  question?: string;

  coreTools?: string[];
  mainAgentTools?: string[];
  allowedTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  mcpEnablementCallbacks?: McpEnablementCallbacks;
  userMemory?: string | HierarchicalMemory;
  geminiMdFileCount?: number;
  geminiMdFilePaths?: string[];
  approvalMode?: ApprovalMode;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  fileFiltering?: {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
    enableFileWatcher?: boolean;
    enableRecursiveFileSearch?: boolean;
    enableFuzzySearch?: boolean;
    maxFileCount?: number;
    searchTimeout?: number;
    customIgnoreFilePaths?: string[];
  };
  checkpointing?: boolean;
  proxy?: string;
  cwd: string;
  fileDiscoveryService?: FileDiscoveryService;
  includeDirectories?: string[];
  bugCommand?: BugCommandSettings;
  model: string;
  disableLoopDetection?: boolean;
  maxSessionTurns?: number;
  acpMode?: boolean;
  listSessions?: boolean;
  deleteSession?: string;
  listExtensions?: boolean;
  extensionLoader?: ExtensionLoader;
  enabledExtensions?: string[];
  enableExtensionReloading?: boolean;
  allowedMcpServers?: string[];
  blockedMcpServers?: string[];
  allowedEnvironmentVariables?: string[];
  blockedEnvironmentVariables?: string[];
  enableEnvironmentVariableRedaction?: boolean;
  noBrowser?: boolean;
  summarizeToolOutput?: Record<string, SummarizeToolOutputSettings>;
  folderTrust?: boolean;
  ideMode?: boolean;
  loadMemoryFromIncludeDirectories?: boolean;
  includeDirectoryTree?: boolean;
  importFormat?: 'tree' | 'flat';
  discoveryMaxDirs?: number;
  compressionThreshold?: number;
  interactive?: boolean;
  trustedFolder?: boolean;
  useBackgroundColor?: boolean;
  useAlternateBuffer?: boolean;
  useTerminalBuffer?: boolean;
  useRenderProcess?: boolean;
  useRipgrep?: boolean;
  enableInteractiveShell?: boolean;
  shellBackgroundCompletionBehavior?: string;
  skipNextSpeakerCheck?: boolean;
  shellExecutionConfig?: ShellExecutionConfig;
  extensionManagement?: boolean;
  extensionRegistryURI?: string;
  truncateToolOutputThreshold?: number;
  eventEmitter?: EventEmitter;
  useWriteTodos?: boolean;
  env?: Record<string, string>;
  workspacePoliciesDir?: string;
  policyEngineConfig?: PolicyEngineConfig;
  directWebFetch?: boolean;
  policyUpdateConfirmationRequest?: PolicyUpdateConfirmationRequest;
  output?: OutputSettings;
  gemmaModelRouter?: GemmaModelRouterSettings;
  adk?: ADKSettings;
  disableModelRouterForAuth?: AuthType[];
  retryFetchErrors?: boolean;
  maxAttempts?: number;
  enableShellOutputEfficiency?: boolean;
  shellToolInactivityTimeout?: number;
  fakeResponses?: string;
  fakeResponsesNonStrict?: string;
  recordResponses?: string;
  ptyInfo?: string;
  disableYoloMode?: boolean;
  disableAlwaysAllow?: boolean;
  voiceMode?: boolean;
  rawOutput?: boolean;
  acceptRawOutputRisk?: boolean;
  dynamicModelConfiguration?: boolean;
  modelConfigServiceConfig?: ModelConfigServiceConfig;
  enableHooks?: boolean;
  enableHooksUI?: boolean;
  experiments?: Experiments;
  contextManagement?: Partial<ContextManagementConfig>;
  hooks?: { [K in HookEventName]?: HookDefinition[] };
  disabledHooks?: string[];
  projectHooks?: { [K in HookEventName]?: HookDefinition[] };
  enableAgents?: boolean;
  enableEventDrivenScheduler?: boolean;
  skillsSupport?: boolean;
  disabledSkills?: string[];
  adminSkillsEnabled?: boolean;
  autoDistillation?: boolean;
  experimentalAutoMemory?: boolean;
  experimentalGemma?: boolean;
  experimentalContextManagementConfig?: string;
  experimentalAgentHistoryTruncation?: boolean;
  experimentalAgentHistoryTruncationThreshold?: number;
  experimentalAgentHistoryRetainedMessages?: number;
  experimentalAgentHistorySummarization?: boolean;
  memoryBoundaryMarkers?: string[];
  topicUpdateNarration?: boolean;

  disableLLMCorrection?: boolean;
  plan?: boolean;
  tracker?: boolean;
  planSettings?: PlanSettings;
  worktreeSettings?: WorktreeSettings;
  modelSteering?: boolean;
  onModelChange?: (model: string) => void;
  mcpEnabled?: boolean;
  extensionsEnabled?: boolean;
  agents?: AgentSettings;
  onReload?: () => Promise<{
    disabledSkills?: string[];
    adminSkillsEnabled?: boolean;
    agents?: AgentSettings;
  }>;
  enableConseca?: boolean;
  billing?: {
    overageStrategy?: OverageStrategy;
  };
  vertexAiRouting?: VertexAiRoutingConfig;
  logRagSnippets?: boolean;
}

// 大数上限：langvis 会话轮次由后端 BudgetHook 兜底，前端不设小上限卡死。
const DEFAULT_MAX_SESSION_TURNS = 1_000_000;

/**
 * langvis Config 空壳。宽构造：未识别字段忽略；getter 按 cli 消费面给语义默认。
 */
export class Config {
  private _sessionId: string;
  private _promptId: string;
  private readonly clientName: string | undefined;
  private _clientVersion: string = 'unknown';
  private workspaceContext: WorkspaceContext;
  private readonly targetDir: string;
  private readonly cwd: string;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;
  private readonly worktreeSettings: WorktreeSettings | undefined;

  private model: string;
  private _activeModel: string;
  private readonly maxSessionTurns: number;
  private approvalMode: ApprovalMode;
  private ideMode: boolean;
  /** Public for testing only. */
  readonly interactive: boolean;
  private readonly useBackgroundColor: boolean;
  private readonly useAlternateBuffer: boolean;
  private readonly useTerminalBuffer: boolean;
  private readonly useRenderProcess: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly folderTrust: boolean;
  private readonly trustedFolder: boolean | undefined;
  private readonly acpMode: boolean;
  private readonly mcpEnabled: boolean;
  private readonly extensionsEnabled: boolean;
  private mcpServers: Record<string, MCPServerConfig> | undefined;
  private readonly allowedMcpServers: string[];
  private readonly blockedMcpServers: string[];
  private readonly sandbox: SandboxConfig | undefined;
  private readonly checkpointing: boolean;
  private readonly proxy: string | undefined;
  private readonly bugCommand: BugCommandSettings | undefined;
  private readonly listSessions: boolean;
  private readonly deleteSession: string | undefined;
  private readonly listExtensions: boolean;
  private readonly _extensionLoader: ExtensionLoader | undefined;
  private readonly _enabledExtensions: string[];
  private readonly enableExtensionReloading: boolean;
  private readonly extensionRegistryURI: string | undefined;
  private readonly extensionManagement: boolean;
  private readonly useRipgrep: boolean;
  private readonly enableInteractiveShell: boolean;
  private readonly skipNextSpeakerCheck: boolean;
  private readonly shellExecutionConfig: ShellExecutionConfig;
  private readonly outputSettings: OutputSettings | undefined;
  private readonly gemmaModelRouter: GemmaModelRouterSettings;
  private readonly disableYoloMode: boolean;
  private readonly disableAlwaysAllow: boolean;
  private readonly rawOutput: boolean;
  private readonly acceptRawOutputRisk: boolean;
  private readonly dynamicModelConfiguration: boolean;
  private readonly fileFiltering: {
    respectGitIgnore: boolean;
    respectGeminiIgnore: boolean;
    enableFileWatcher: boolean;
    enableRecursiveFileSearch: boolean;
    enableFuzzySearch: boolean;
    maxFileCount: number;
    searchTimeout: number;
    customIgnoreFilePaths: string[];
  };
  private readonly truncateToolOutputThreshold: number;
  private readonly compressionThreshold: number | undefined;
  private userMemory: string | HierarchicalMemory;
  private geminiMdFileCount: number;
  private geminiMdFilePaths: string[];
  private readonly contextFileName: string | string[] | undefined;
  private readonly loadMemoryFromIncludeDirectories: boolean;
  private readonly includeDirectoryTree: boolean;
  private readonly importFormat: 'tree' | 'flat';
  private readonly discoveryMaxDirs: number;
  private readonly pendingIncludeDirectories: string[];
  private readonly workspacePoliciesDir: string | undefined;
  private readonly policyUpdateConfirmationRequest:
    | PolicyUpdateConfirmationRequest
    | undefined;
  private readonly directWebFetch: boolean;
  private readonly enableHooks: boolean;
  private readonly enableHooksUI: boolean;
  private readonly agentSessionNoninteractiveEnabled: boolean;
  private readonly agentSessionInteractiveEnabled: boolean;
  private readonly enableAgents: boolean;
  private readonly skillsSupport: boolean;
  private readonly experimentalAutoMemory: boolean;
  private readonly experimentalGemma: boolean;
  private readonly planEnabled: boolean;
  private readonly voiceMode: boolean;
  private readonly modelSteering: boolean;
  private readonly disableLLMCorrection: boolean;
  private readonly billing: { overageStrategy: OverageStrategy };
  private readonly vertexAiRouting: VertexAiRoutingConfig | undefined;
  private readonly embeddingModel: string;
  private readonly summarizeToolOutput:
    | Record<string, SummarizeToolOutputSettings>
    | undefined;
  private readonly allowedEnvironmentVariables: string[];
  private readonly blockedEnvironmentVariables: string[];
  private readonly enableEnvironmentVariableRedaction: boolean;
  private readonly usageStatisticsEnabled: boolean;
  private readonly onModelChange: ((model: string) => void) | undefined;

  private initialized = false;
  private hookSystem?: HookSystem;
  private mcpClientManager?: McpClientManager;
  private agentRegistry?: AgentRegistry;
  private skillManager?: SkillManager;
  private _toolRegistry?: ToolRegistry;
  private _promptRegistry?: PromptRegistry;
  private _resourceRegistry?: ResourceRegistry;
  private _messageBus?: MessageBus;
  private _geminiClient?: GeminiClient;
  private _baseLlmClient?: BaseLlmClient;
  private policyEngine?: PolicyEngine;
  private fileSystemService?: FileSystemService;
  private fileDiscoveryService?: FileDiscoveryService;
  private readonly fileExclusions: FileExclusions;
  private gitService?: GitService;
  private terminalBackground: string | undefined;
  private remoteAdminSettings: AdminControlsSettings | undefined;
  private approvedPlanPath: string | undefined;
  private latestApiRequest: GenerateContentParameters | undefined;
  private fallbackModelHandler?: FallbackModelHandler;
  private validationHandler?: ValidationHandler;
  private quotaErrorOccurred = false;
  private contentGeneratorConfig?: ContentGeneratorConfig;
  private lastRetrievedQuota?: RetrieveUserQuotaResponse;
  private readonly contextManagementConfigValue: ContextManagementConfig = {
    enabled: false,
    historyWindow: { maxTokens: 0, retainedTokens: 0 },
    messageLimits: {
      normalMaxTokens: 0,
      retainedMaxTokens: 0,
      normalizationHeadRatio: 0,
    },
    tools: {
      distillation: {
        maxOutputTokens: 4096,
        summarizationThresholdTokens: 4096,
      },
      outputMasking: {
        protectionThresholdTokens: Number.MAX_SAFE_INTEGER,
        minPrunableThresholdTokens: Number.MAX_SAFE_INTEGER,
        protectLatestTurn: false,
      },
    },
  };
  private readonly modelAvailabilityService: ModelAvailabilityService;
  private experiments?: Experiments;

  readonly storage: Storage;
  readonly injectionService: InjectionService;
  readonly modelConfigService: ModelConfigService;
  readonly env?: Record<string, string>;

  constructor(params: ConfigParameters) {
    this._sessionId = params.sessionId;
    this._promptId = `p-${params.sessionId}`;
    this.clientName = params.clientName;
    this._clientVersion = params.clientVersion ?? 'unknown';
    this.targetDir = params.targetDir;
    this.cwd = params.cwd;
    this.debugMode = params.debugMode;
    this.question = params.question;
    this.worktreeSettings = params.worktreeSettings;
    this.workspaceContext = new WorkspaceContext(params.targetDir, []);

    // 初始模型：params.model → 绑定的 conversation config → 后端默认
    this.model = params.model ?? getLangvisCurrentModelId();
    this._activeModel = this.model;
    this.maxSessionTurns = params.maxSessionTurns ?? DEFAULT_MAX_SESSION_TURNS;
    this.approvalMode =
      params.approvalMode ??
      params.policyEngineConfig?.approvalMode ??
      ApprovalMode.DEFAULT;
    this.ideMode = params.ideMode ?? false;
    this.interactive = params.interactive ?? true;
    this.useBackgroundColor = params.useBackgroundColor ?? false;
    this.useAlternateBuffer = params.useAlternateBuffer ?? false;
    this.useTerminalBuffer = params.useTerminalBuffer ?? false;
    this.useRenderProcess = params.useRenderProcess ?? false;
    this.accessibility = params.accessibility ?? {};
    this.folderTrust = params.folderTrust ?? false;
    this.trustedFolder = params.trustedFolder;
    this.acpMode = params.acpMode ?? false;
    this.mcpEnabled = params.mcpEnabled ?? false;
    this.extensionsEnabled = params.extensionsEnabled ?? false;
    this.mcpServers = params.mcpServers;
    this.allowedMcpServers = params.allowedMcpServers ?? [];
    this.blockedMcpServers = params.blockedMcpServers ?? [];
    this.sandbox = params.sandbox;
    this.checkpointing = params.checkpointing ?? false;
    this.proxy = params.proxy;
    this.bugCommand = params.bugCommand;
    this.listSessions = params.listSessions ?? false;
    this.deleteSession = params.deleteSession;
    this.listExtensions = params.listExtensions ?? false;
    this._extensionLoader = params.extensionLoader;
    this._enabledExtensions = params.enabledExtensions ?? [];
    this.enableExtensionReloading = params.enableExtensionReloading ?? false;
    this.extensionRegistryURI = params.extensionRegistryURI;
    this.extensionManagement = params.extensionManagement ?? false;
    this.useRipgrep = params.useRipgrep ?? false;
    this.enableInteractiveShell = params.enableInteractiveShell ?? false;
    this.skipNextSpeakerCheck = params.skipNextSpeakerCheck ?? false;
    this.shellExecutionConfig = params.shellExecutionConfig ?? {};
    this.outputSettings = params.output;
    this.gemmaModelRouter = params.gemmaModelRouter ?? { enabled: false };
    this.disableYoloMode = params.disableYoloMode ?? false;
    this.disableAlwaysAllow = params.disableAlwaysAllow ?? false;
    this.rawOutput = params.rawOutput ?? false;
    this.acceptRawOutputRisk = params.acceptRawOutputRisk ?? false;
    // langvis 恒走动态模型配置——ModelDialog 从 modelDefinitions（后端模型集）取列表。
    this.dynamicModelConfiguration = params.dynamicModelConfiguration ?? true;
    this.fileFiltering = {
      respectGitIgnore: params.fileFiltering?.respectGitIgnore ?? true,
      respectGeminiIgnore: params.fileFiltering?.respectGeminiIgnore ?? true,
      enableFileWatcher: params.fileFiltering?.enableFileWatcher ?? false,
      enableRecursiveFileSearch:
        params.fileFiltering?.enableRecursiveFileSearch ?? true,
      enableFuzzySearch: params.fileFiltering?.enableFuzzySearch ?? false,
      maxFileCount: params.fileFiltering?.maxFileCount ?? -1,
      searchTimeout: params.fileFiltering?.searchTimeout ?? 10_000,
      customIgnoreFilePaths: params.fileFiltering?.customIgnoreFilePaths ?? [],
    };
    this.truncateToolOutputThreshold =
      params.truncateToolOutputThreshold ??
      DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD;
    this.compressionThreshold = params.compressionThreshold;
    this.userMemory = params.userMemory ?? '';
    this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
    this.geminiMdFilePaths = params.geminiMdFilePaths ?? [];
    this.contextFileName = params.contextFileName;
    this.loadMemoryFromIncludeDirectories =
      params.loadMemoryFromIncludeDirectories ?? false;
    this.includeDirectoryTree = params.includeDirectoryTree ?? true;
    this.importFormat = params.importFormat ?? 'tree';
    this.discoveryMaxDirs = params.discoveryMaxDirs ?? 100;
    this.pendingIncludeDirectories = params.includeDirectories ?? [];
    this.workspacePoliciesDir = params.workspacePoliciesDir;
    this.policyUpdateConfirmationRequest =
      params.policyUpdateConfirmationRequest;
    this.directWebFetch = params.directWebFetch ?? false;
    this.enableHooks = params.enableHooks ?? false;
    this.enableHooksUI = params.enableHooksUI ?? false;
    // 关键：langvis 走 AgentProtocol 路径，交互会话必须启用。
    this.agentSessionInteractiveEnabled = true;
    this.agentSessionNoninteractiveEnabled = false;
    this.enableAgents = params.enableAgents ?? false;
    this.skillsSupport = params.skillsSupport ?? false;
    this.experimentalAutoMemory = params.experimentalAutoMemory ?? false;
    this.experimentalGemma = params.experimentalGemma ?? false;
    this.planEnabled = params.plan ?? false;
    this.voiceMode = params.voiceMode ?? false;
    this.modelSteering = params.modelSteering ?? false;
    this.disableLLMCorrection = params.disableLLMCorrection ?? false;
    this.billing = {
      overageStrategy: params.billing?.overageStrategy ?? 'never',
    };
    this.vertexAiRouting = params.vertexAiRouting;
    this.embeddingModel = params.embeddingModel ?? 'text-embedding-004';
    this.summarizeToolOutput = params.summarizeToolOutput;
    this.allowedEnvironmentVariables = params.allowedEnvironmentVariables ?? [];
    this.blockedEnvironmentVariables = params.blockedEnvironmentVariables ?? [];
    this.enableEnvironmentVariableRedaction =
      params.enableEnvironmentVariableRedaction ?? false;
    this.usageStatisticsEnabled = params.usageStatisticsEnabled ?? false;
    this.onModelChange = params.onModelChange;

    this.storage = new Storage(this.targetDir);
    this.injectionService = new InjectionService(() => false);
    this.modelConfigService = new ModelConfigService(
      params.modelConfigServiceConfig ?? {
        modelDefinitions: getLangvisModelDefinitions(),
      },
    );
    this.modelAvailabilityService = new ModelAvailabilityService();
    this.fileExclusions = new FileExclusions(this);
    this.env = params.env;
    this.experiments = params.experiments;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /** AgentLoopContext 自引用（上游 Config 实现同一接口）。 */
  get config(): Config {
    return this;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
    // 打开 useSessionResume 的自动重放闸门（isGeminiClientInitialized）
    await this.getGeminiClient()?.initialize();
  }

  async refreshAuth(
    _authMethod?: unknown,
    _apiKey?: string,
    _baseUrl?: string,
    _customHeaders?: Record<string, string>,
  ): Promise<void> {}

  get promptId(): string {
    return this._promptId;
  }

  get toolRegistry(): ToolRegistry {
    if (!this._toolRegistry) {
      // langvis：工具集在后端；本地给空注册表满足 UI 遍历。
      this._toolRegistry = new ToolRegistry();
    }
    return this._toolRegistry;
  }

  get promptRegistry(): PromptRegistry {
    if (!this._promptRegistry) {
      this._promptRegistry = new PromptRegistry();
    }
    return this._promptRegistry;
  }

  get resourceRegistry(): ResourceRegistry {
    if (!this._resourceRegistry) {
      this._resourceRegistry = new ResourceRegistry();
    }
    return this._resourceRegistry;
  }

  get messageBus(): MessageBus {
    if (!this._messageBus) {
      this._messageBus = new MessageBus(new PolicyEngine({}), this.debugMode);
    }
    return this._messageBus;
  }

  setMessageBus(bus: MessageBus): void {
    this._messageBus = bus;
  }

  get geminiClient(): GeminiClient {
    // agent 路径下无本地 client——惰性 GeminiClient 壳（no-op/空返回，legacy 专属方法才抛）
    this._geminiClient ??= new GeminiClient(this);
    return this._geminiClient;
  }

  get sandboxManager(): SandboxManager {
    return new NoopSandboxManager();
  }

  get clientVersion(): string {
    return this._clientVersion;
  }

  getSessionId(): string {
    return this._sessionId;
  }

  setSessionId(sessionId: string): void {
    this._sessionId = sessionId;
  }

  rotateSessionId(sessionId: string): void {
    this._sessionId = sessionId;
  }

  resetNewSessionState(sessionId: string): void {
    this._sessionId = sessionId;
  }

  getWorktreeSettings(): WorktreeSettings | undefined {
    return this.worktreeSettings;
  }

  getClientName(): string | undefined {
    return this.clientName;
  }

  setTerminalBackground(terminalBackground: string | undefined): void {
    this.terminalBackground = terminalBackground;
  }

  getTerminalBackground(): string | undefined {
    return this.terminalBackground;
  }

  getLatestApiRequest(): GenerateContentParameters | undefined {
    return this.latestApiRequest;
  }

  setLatestApiRequest(req: GenerateContentParameters): void {
    this.latestApiRequest = req;
  }

  getRemoteAdminSettings(): AdminControlsSettings | undefined {
    return this.remoteAdminSettings;
  }

  setRemoteAdminSettings(settings: AdminControlsSettings | undefined): void {
    this.remoteAdminSettings = settings;
  }

  shouldLoadMemoryFromIncludeDirectories(): boolean {
    return this.loadMemoryFromIncludeDirectories;
  }

  getIncludeDirectoryTree(): boolean {
    return this.includeDirectoryTree;
  }

  getImportFormat(): 'tree' | 'flat' {
    return this.importFormat;
  }

  getDiscoveryMaxDirs(): number {
    return this.discoveryMaxDirs;
  }

  getContentGeneratorConfig(): ContentGeneratorConfig {
    return this.contentGeneratorConfig ?? {};
  }

  setContentGeneratorConfig(cfg: ContentGeneratorConfig): void {
    this.contentGeneratorConfig = cfg;
  }

  getModel(): string {
    return this.model;
  }

  getDisableLoopDetection(): boolean {
    return true;
  }

  // 落后端确认后才本地生效：调用方在 await 期间展示 spinner，失败上抛由调用方提示。
  // 回声抑制：record 已是该模型（启动/换会话种子场景）时直接生效不回写。
  async setModel(
    newModel: string,
    _isTemporary: boolean = true,
  ): Promise<void> {
    const conversation = getLangvisConversationRecord();
    const current = (
      conversation?.config as { model?: { modelId?: string } } | undefined
    )?.model?.modelId;
    if (!conversation || current === newModel) {
      this.applyModelLocal(newModel);
      return;
    }
    const merged = {
      ...conversation.config,
      model: {
        ...(conversation.config as { model?: object }).model,
        modelId: newModel,
      },
    };
    await langvisClient.updateConversation({
      ...conversation,
      config: merged,
    });
    conversation.config = merged;
    this.applyModelLocal(newModel);
  }

  private applyModelLocal(newModel: string): void {
    this.model = newModel;
    this._activeModel = newModel;
    this.onModelChange?.(newModel);
    coreEvents.emitModelChanged(newModel);
  }

  activateFallbackMode(model: string, _failedModel?: string): void {
    this._activeModel = model;
  }

  getFallbackOverride(_model: string): string | undefined {
    return undefined;
  }

  getActiveModel(): string {
    return this._activeModel;
  }

  setActiveModel(model: string): void {
    this._activeModel = model;
  }

  setFallbackModelHandler(handler: FallbackModelHandler): void {
    this.fallbackModelHandler = handler;
  }

  getFallbackModelHandler(): FallbackModelHandler | undefined {
    return this.fallbackModelHandler;
  }

  setValidationHandler(handler: ValidationHandler): void {
    this.validationHandler = handler;
  }

  getValidationHandler(): ValidationHandler | undefined {
    return this.validationHandler;
  }

  resetTurn(): void {}

  resetBillingTurnState(_overageStrategy?: OverageStrategy): void {}

  getMaxSessionTurns(): number {
    return this.maxSessionTurns;
  }

  setQuotaErrorOccurred(value: boolean): void {
    this.quotaErrorOccurred = value;
  }

  getQuotaErrorOccurred(): boolean {
    return this.quotaErrorOccurred;
  }

  setCreditsNotificationShown(_value: boolean): void {}

  getCreditsNotificationShown(): boolean {
    return true;
  }

  setQuota(_remaining?: number, _limit?: number, _resetTime?: string): void {}

  getQuotaRemaining(): number | undefined {
    const amount = this.lastRetrievedQuota?.buckets?.[0]?.remainingAmount;
    return amount !== undefined ? Number(amount) : undefined;
  }

  getQuotaLimit(): number | undefined {
    return undefined;
  }

  getQuotaResetTime(): string | undefined {
    return this.lastRetrievedQuota?.buckets?.[0]?.resetTime;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  getSandboxEnabled(): boolean {
    return false;
  }

  getSandboxAllowedPaths(): string[] {
    return [...(this.sandbox?.allowedPaths ?? [])];
  }

  getSandboxNetworkAccess(): boolean {
    return this.sandbox?.networkAccess ?? false;
  }

  isRestrictiveSandbox(): boolean {
    return false;
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  async getRipgrepPath(): Promise<string | null> {
    return null;
  }

  async canUseRipgrep(): Promise<boolean> {
    return false;
  }

  __resetRipgrepPathCache(): void {}

  getWorkspaceContext(): WorkspaceContext {
    return this.workspaceContext;
  }

  getAgentRegistry(): AgentRegistry {
    this.agentRegistry ??= new AgentRegistry(this);
    return this.agentRegistry;
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getPromptRegistry(): PromptRegistry {
    return this.promptRegistry;
  }

  getSkillManager(): SkillManager {
    if (!this.skillManager) {
      this.skillManager = new SkillManager();
      // langvis：后端 skills 预热注入（/skills 列表与补全数据源）
      const langvisSkills = getLangvisSkills();
      if (langvisSkills.length > 0) {
        this.skillManager.addSkills(langvisSkills);
      }
    }
    return this.skillManager;
  }

  getResourceRegistry(): ResourceRegistry {
    return this.resourceRegistry;
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }

  getQuestion(): string | undefined {
    return this.question;
  }

  getHasAccessToPreviewModel(): boolean {
    return false;
  }

  setHasAccessToPreviewModel(_hasAccess: boolean | null): void {}

  async refreshAvailableCredits(): Promise<void> {}

  async refreshUserQuota(): Promise<RetrieveUserQuotaResponse | undefined> {
    return this.lastRetrievedQuota;
  }

  async refreshUserQuotaIfStale(): Promise<void> {}

  getLastRetrievedQuota(): RetrieveUserQuotaResponse | undefined {
    return this.lastRetrievedQuota;
  }

  getRemainingQuotaForModel(_modelId: string): {
    remaining: number | undefined;
    limit: number | undefined;
  } {
    return { remaining: undefined, limit: undefined };
  }

  getCoreTools(): string[] | undefined {
    return undefined;
  }

  getMainAgentTools(): string[] | undefined {
    return undefined;
  }

  getAllowedTools(): string[] | undefined {
    return undefined;
  }

  getExcludeTools(..._args: unknown[]): string[] | undefined {
    return undefined;
  }

  getToolDiscoveryCommand(): string | undefined {
    return undefined;
  }

  getToolCallCommand(): string | undefined {
    return undefined;
  }

  getMcpServerCommand(): string | undefined {
    return undefined;
  }

  getMcpServers(): Record<string, MCPServerConfig> | undefined {
    return this.mcpServers;
  }

  getMcpEnabled(): boolean {
    return this.mcpEnabled;
  }

  getMcpEnablementCallbacks(): McpEnablementCallbacks | undefined {
    return undefined;
  }

  getExtensionsEnabled(): boolean {
    return this.extensionsEnabled;
  }

  getExtensionRegistryURI(): string | undefined {
    return this.extensionRegistryURI;
  }

  getMcpClientManager(): McpClientManager | undefined {
    return this.mcpClientManager;
  }

  setUserInteractedWithMcp(): void {}

  getLastMcpError(_serverName: string): string | undefined {
    return undefined;
  }

  emitMcpDiagnostic(..._args: unknown[]): void {}

  getAllowedMcpServers(): string[] | undefined {
    return this.allowedMcpServers.length ? this.allowedMcpServers : undefined;
  }

  getBlockedMcpServers(): string[] | undefined {
    return this.blockedMcpServers.length ? this.blockedMcpServers : undefined;
  }

  get sanitizationConfig(): EnvironmentSanitizationConfig {
    return {
      allowedEnvironmentVariables: this.allowedEnvironmentVariables,
      blockedEnvironmentVariables: this.blockedEnvironmentVariables,
      enableEnvironmentVariableRedaction:
        this.enableEnvironmentVariableRedaction,
    };
  }

  setMcpServers(mcpServers: Record<string, MCPServerConfig>): void {
    this.mcpServers = mcpServers;
  }

  getUserMemory(): string | HierarchicalMemory {
    return this.userMemory;
  }

  async refreshMcpContext(): Promise<void> {}

  setUserMemory(newUserMemory: string | HierarchicalMemory): void {
    this.userMemory = newUserMemory;
  }

  getSystemInstructionMemory(): string | HierarchicalMemory {
    return this.userMemory;
  }

  getSessionMemory(_options?: { includeExtensionContext?: boolean }): string {
    return flattenMemory(this.userMemory);
  }

  getGlobalMemory(): string {
    return '';
  }

  getEnvironmentMemory(): string {
    return '';
  }

  getMemoryContextManager():
    | {
        refresh(): Promise<void>;
        discoverContext(
          accessedPath: string,
          trustedRoots: string[],
        ): Promise<string>;
      }
    | undefined {
    return undefined;
  }

  isContextManagementEnabled(): boolean {
    return false;
  }

  isAgentSessionSubagentEnabled(): boolean {
    return false;
  }

  getMemoryBoundaryMarkers(): readonly string[] {
    return [];
  }

  isAutoMemoryEnabled(): boolean {
    return this.experimentalAutoMemory;
  }

  getExperimentalGemma(): boolean {
    return this.experimentalGemma;
  }

  getExperimentalContextManagementConfig(): string | undefined {
    return undefined;
  }

  getContextManagementConfig(): ContextManagementConfig {
    return this.contextManagementConfigValue;
  }

  isTopicUpdateNarrationEnabled(): boolean {
    return false;
  }

  isModelSteeringEnabled(): boolean {
    return this.modelSteering;
  }

  async getToolOutputMaskingConfig(): Promise<{
    enabled: boolean;
    protectionThresholdTokens: number;
    minPrunableThresholdTokens: number;
    protectLatestTurn: boolean;
  }> {
    return {
      enabled: false,
      protectionThresholdTokens: Number.MAX_SAFE_INTEGER,
      minPrunableThresholdTokens: Number.MAX_SAFE_INTEGER,
      protectLatestTurn: false,
    };
  }

  getGeminiMdFileCount(): number {
    return this.geminiMdFileCount;
  }

  setGeminiMdFileCount(count: number): void {
    this.geminiMdFileCount = count;
  }

  getGeminiMdFilePaths(): string[] {
    return this.geminiMdFilePaths;
  }

  getWorkspacePoliciesDir(): string | undefined {
    return this.workspacePoliciesDir;
  }

  setGeminiMdFilePaths(paths: string[]): void {
    this.geminiMdFilePaths = paths;
  }

  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  isPlanMode(): boolean {
    return this.approvalMode === ApprovalMode.PLAN;
  }

  getPolicyUpdateConfirmationRequest():
    | PolicyUpdateConfirmationRequest
    | undefined {
    return this.policyUpdateConfirmationRequest;
  }

  async loadWorkspacePolicies(_policyDir: string): Promise<void> {}

  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  logCurrentModeDuration(_mode: ApprovalMode): void {}

  isYoloModeDisabled(): boolean {
    return this.disableYoloMode || !this.isTrustedFolder();
  }

  getDisableAlwaysAllow(): boolean {
    return this.disableAlwaysAllow;
  }

  getRawOutput(): boolean {
    return this.rawOutput;
  }

  getAcceptRawOutputRisk(): boolean {
    return this.acceptRawOutputRisk;
  }

  getExperimentalDynamicModelConfiguration(): boolean {
    return this.dynamicModelConfiguration;
  }

  getReleaseChannel(): string {
    return 'stable';
  }

  getPendingIncludeDirectories(): string[] {
    return this.pendingIncludeDirectories;
  }

  clearPendingIncludeDirectories(): void {}

  getShowMemoryUsage(): boolean {
    return false;
  }

  getAccessibility(): AccessibilitySettings {
    return this.accessibility;
  }

  getLogRagSnippets(): boolean {
    return false;
  }

  getTelemetryEnabled(): boolean {
    return false;
  }

  getTelemetryTracesEnabled(): boolean {
    return false;
  }

  getTelemetryLogPromptsEnabled(): boolean {
    return false;
  }

  getTelemetryOtlpEndpoint(): string {
    return '';
  }

  getTelemetryOtlpProtocol(): 'grpc' | 'http' {
    return 'grpc';
  }

  getTelemetryTarget(): TelemetryTarget {
    return TelemetryTarget.GCP;
  }

  getTelemetryOutfile(): string | undefined {
    return undefined;
  }

  getBillingSettings(): { overageStrategy: OverageStrategy } {
    return this.billing;
  }

  setOverageStrategy(strategy: OverageStrategy): void {
    this.billing.overageStrategy = strategy;
  }

  getTelemetryUseCollector(): boolean {
    return false;
  }

  getTelemetryUseCliAuth(): boolean {
    return false;
  }

  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  updateSystemInstructionIfInitialized(): void {}

  getModelConfigService(): ModelConfigService {
    return this.modelConfigService;
  }

  getEnableRecursiveFileSearch(): boolean {
    return this.fileFiltering.enableRecursiveFileSearch;
  }

  getFileFilteringEnableFuzzySearch(): boolean {
    return this.fileFiltering.enableFuzzySearch;
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFiltering.respectGitIgnore;
  }

  getFileFilteringRespectGeminiIgnore(): boolean {
    return this.fileFiltering.respectGeminiIgnore;
  }

  getCustomIgnoreFilePaths(): string[] {
    return this.fileFiltering.customIgnoreFilePaths;
  }

  getFileFilteringOptions(): FileFilteringOptions {
    return DEFAULT_FILE_FILTERING_OPTIONS;
  }

  getCustomExcludes(): string[] {
    return [];
  }

  getFileExclusions(): FileExclusions {
    return this.fileExclusions;
  }

  getCheckpointingEnabled(): boolean {
    return this.checkpointing;
  }

  getProxy(): string | undefined {
    return this.proxy;
  }

  getWorkingDir(): string {
    return this.cwd;
  }

  getBugCommand(): BugCommandSettings | undefined {
    return this.bugCommand;
  }

  getFileService(): FileDiscoveryService {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir, {
        respectGitIgnore: this.fileFiltering.respectGitIgnore,
        respectGeminiIgnore: this.fileFiltering.respectGeminiIgnore,
        customIgnoreFilePaths: this.fileFiltering.customIgnoreFilePaths,
      });
    }
    return this.fileDiscoveryService;
  }

  getUsageStatisticsEnabled(): boolean {
    return this.usageStatisticsEnabled;
  }

  getAcpMode(): boolean {
    return this.acpMode;
  }

  async waitForMcpInit(): Promise<void> {}

  getListExtensions(): boolean {
    return this.listExtensions;
  }

  getListSessions(): boolean {
    return this.listSessions;
  }

  getDeleteSession(): string | undefined {
    return this.deleteSession;
  }

  getExtensionManagement(): boolean {
    return this.extensionManagement;
  }

  getExtensions(): GeminiCLIExtension[] {
    return [];
  }

  getExtensionLoader(): ExtensionLoader {
    if (!this._extensionLoader) {
      throw new Error('langvis: extension loader not wired');
    }
    return this._extensionLoader;
  }

  getEnabledExtensions(): string[] {
    return this._enabledExtensions;
  }

  getEnableExtensionReloading(): boolean {
    return this.enableExtensionReloading;
  }

  getDisableLLMCorrection(): boolean {
    return this.disableLLMCorrection;
  }

  isPlanEnabled(): boolean {
    return this.planEnabled;
  }

  isVoiceModeEnabled(): boolean {
    return this.voiceMode;
  }

  isTrackerEnabled(): boolean {
    return false;
  }

  getApprovedPlanPath(): string | undefined {
    return this.approvedPlanPath;
  }

  getDirectWebFetch(): boolean {
    return this.directWebFetch;
  }

  setApprovedPlanPath(path: string | undefined): void {
    this.approvedPlanPath = path;
  }

  isAgentsEnabled(): boolean {
    return this.enableAgents;
  }

  isEventDrivenSchedulerEnabled(): boolean {
    return false;
  }

  getNoBrowser(): boolean {
    return true;
  }

  getAgentsSettings(): AgentSettings {
    return {};
  }

  isBrowserLaunchSuppressed(): boolean {
    return true;
  }

  getSummarizeToolOutputConfig():
    | Record<string, SummarizeToolOutputSettings>
    | undefined {
    return this.summarizeToolOutput;
  }

  getIdeMode(): boolean {
    return this.ideMode;
  }

  getFolderTrust(): boolean {
    return this.folderTrust;
  }

  isTrustedFolder(): boolean {
    const { isTrusted, source } = checkPathTrust({
      path: this.targetDir,
      isFolderTrustEnabled: this.folderTrust,
    });
    if (isTrusted === false) {
      return false;
    }
    if (source === 'env') {
      return isTrusted ?? false;
    }
    if (this.trustedFolder !== undefined) {
      return this.trustedFolder;
    }
    return isTrusted ?? false;
  }

  setIdeMode(value: boolean): void {
    this.ideMode = value;
  }

  getFileSystemService(): FileSystemService {
    if (!this.fileSystemService) {
      this.fileSystemService = new StandardFileSystemService();
    }
    return this.fileSystemService;
  }

  isPathAllowed(absolutePath: string): boolean {
    return absolutePath.startsWith(this.targetDir);
  }

  validatePathAccess(
    _absolutePath: string,
    _checkType: 'read' | 'write' = 'write',
  ): string | null {
    return null;
  }

  setFileSystemService(fileSystemService: FileSystemService): void {
    this.fileSystemService = fileSystemService;
  }

  async getCompressionThreshold(): Promise<number | undefined> {
    return this.compressionThreshold;
  }

  async getUserCaching(): Promise<boolean | undefined> {
    return undefined;
  }

  async getPlanModeRoutingEnabled(): Promise<boolean> {
    return false;
  }

  async getNumericalRoutingEnabled(): Promise<boolean> {
    return false;
  }

  async getResolvedClassifierThreshold(): Promise<number> {
    return 0.5;
  }

  async getClassifierThreshold(): Promise<number | undefined> {
    return undefined;
  }

  async getBannerTextNoCapacityIssues(): Promise<string> {
    return '';
  }

  async getBannerTextCapacityIssues(): Promise<string> {
    return '';
  }

  async getProModelNoAccess(): Promise<boolean> {
    return false;
  }

  getProModelNoAccessSync(): boolean {
    return false;
  }

  async getUseCustomToolModel(): Promise<boolean> {
    return false;
  }

  getUseCustomToolModelSync(): boolean {
    return false;
  }

  getRequestTimeoutMs(): number | undefined {
    return undefined;
  }

  async getExperimentsAsync(): Promise<Experiments | undefined> {
    return this.experiments;
  }

  getUserTier(): UserTierId | undefined {
    return undefined;
  }

  getUserTierName(): string | undefined {
    return undefined;
  }

  getUserPaidTier(): GeminiUserTier | undefined {
    return undefined;
  }

  getBaseLlmClient(): BaseLlmClient | undefined {
    return this._baseLlmClient;
  }

  getLocalLiteRtLmClient(): undefined {
    return undefined;
  }

  isInteractiveShellEnabled(): boolean {
    return this.enableInteractiveShell;
  }

  isSkillsSupportEnabled(): boolean {
    return this.skillsSupport;
  }

  async reloadSkills(): Promise<void> {}

  async reloadAgents(): Promise<void> {}

  isInteractive(): boolean {
    return this.interactive;
  }

  getUseRipgrep(): boolean {
    return this.useRipgrep;
  }

  getUseBackgroundColor(): boolean {
    return this.useBackgroundColor;
  }

  getUseAlternateBuffer(): boolean {
    return this.useAlternateBuffer;
  }

  getUseTerminalBuffer(): boolean {
    return this.useTerminalBuffer;
  }

  getUseRenderProcess(): boolean {
    return this.useRenderProcess;
  }

  getEnableInteractiveShell(): boolean {
    return this.enableInteractiveShell;
  }

  getShellBackgroundCompletionBehavior(): 'inject' | 'notify' | 'silent' {
    return 'notify';
  }

  getSkipNextSpeakerCheck(): boolean {
    return this.skipNextSpeakerCheck;
  }

  getRetryFetchErrors(): boolean {
    return false;
  }

  getMaxAttempts(): number {
    return 3;
  }

  getEnableShellOutputEfficiency(): boolean {
    return false;
  }

  getShellToolInactivityTimeout(): number {
    return 30_000;
  }

  getShellExecutionConfig(): ShellExecutionConfig {
    return this.shellExecutionConfig;
  }

  setShellExecutionConfig(config: Partial<ShellExecutionConfig>): void {
    Object.assign(this.shellExecutionConfig, config);
  }

  getScreenReader(): boolean {
    return this.accessibility.screenReader ?? false;
  }

  getTruncateToolOutputThreshold(): number {
    return this.truncateToolOutputThreshold;
  }

  getToolMaxOutputTokens(): number {
    return 4_096;
  }

  getToolSummarizationThresholdTokens(): number {
    return 4_096;
  }

  private compressionTruncationCounter = 0;

  getNextCompressionTruncationId(): number {
    return ++this.compressionTruncationCounter;
  }

  getUseWriteTodos(): boolean {
    return false;
  }

  getOutputFormat(): OutputFormat {
    return this.outputSettings?.format
      ? this.outputSettings.format
      : OutputFormat.TEXT;
  }

  async getGitService(): Promise<GitService> {
    if (!this.gitService) {
      this.gitService = new GitService(this.targetDir, this.storage);
    }
    return this.gitService;
  }

  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  getPolicyEngine(): PolicyEngine {
    if (!this.policyEngine) {
      this.policyEngine = new PolicyEngine({});
    }
    return this.policyEngine;
  }

  getEnableHooks(): boolean {
    return this.enableHooks;
  }

  getEnableHooksUI(): boolean {
    return this.enableHooksUI;
  }

  getGemmaModelRouterEnabled(): boolean {
    return this.gemmaModelRouter.enabled ?? false;
  }

  getGemmaModelRouterSettings(): GemmaModelRouterSettings {
    return this.gemmaModelRouter;
  }

  getAgentSessionNoninteractiveEnabled(): boolean {
    return this.agentSessionNoninteractiveEnabled;
  }

  getAgentSessionInteractiveEnabled(): boolean {
    return this.agentSessionInteractiveEnabled;
  }

  getAgentOverride(_agentName: string): AgentOverride | undefined {
    return undefined;
  }

  getBrowserAgentConfig(): {
    sessionMode: 'isolated' | 'persistent' | 'existing';
    allowedDomains?: string[];
  } {
    return { sessionMode: 'isolated' };
  }

  shouldDisableBrowserUserInput(): boolean {
    return true;
  }

  async createToolRegistry(): Promise<ToolRegistry> {
    return this.toolRegistry;
  }

  getHookSystem(): HookSystem | undefined {
    return this.hookSystem;
  }

  getHooks(): { [K in HookEventName]?: HookDefinition[] } | undefined {
    return undefined;
  }

  getProjectHooks(): { [K in HookEventName]?: HookDefinition[] } | undefined {
    return undefined;
  }

  updateDisabledHooks(_disabledHooks: string[]): void {}

  getDisabledHooks(): string[] {
    return [];
  }

  getExperiments(): Experiments | undefined {
    return this.experiments;
  }

  setExperiments(experiments: Experiments): void {
    this.experiments = experiments;
  }

  getContextFileName(): string | string[] {
    return this.contextFileName ?? 'GEMINI.md';
  }

  getVertexAiRouting(): VertexAiRoutingConfig | undefined {
    return this.vertexAiRouting;
  }

  getShellOutputEvents(): AsyncIterableIterator<ShellOutputEvent> {
    return (async function* () {})() as AsyncIterableIterator<ShellOutputEvent>;
  }

  getContentGenerator(): ContentGenerator {
    throw new Error('langvis: content generator is backend-owned');
  }

  async getGemini31Launched(): Promise<boolean> {
    return true;
  }

  getGemini31LaunchedSync(): boolean {
    return true;
  }

  hasGemini35FlashGAAccess(): boolean {
    return false;
  }

  getModelAvailabilityService(): ModelAvailabilityService {
    return this.modelAvailabilityService;
  }

  getProjectHash(): string {
    return getProjectHash(this.targetDir);
  }

  async dispose(): Promise<void> {}
}
