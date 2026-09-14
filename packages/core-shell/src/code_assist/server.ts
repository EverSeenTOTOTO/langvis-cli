/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/code_assist/server.ts，langvis 关闭此能力：
// Code Assist API 客户端为空壳——认证/配额/实验开关由 langvis 后端处理，
// 所有远端方法直接抛错或返回空结果。

import type {
  CodeAssistGlobalUserSettingResponse,
  FetchAdminControlsRequest,
  FetchAdminControlsResponse,
  GeminiUserTier,
  LongRunningOperationResponse,
  OnboardUserRequest,
  RecordCodeAssistMetricsRequest,
  RetrieveUserQuotaRequest,
  RetrieveUserQuotaResponse,
  SetCodeAssistGlobalUserSettingRequest,
  UserTierId,
  ClientMetadata,
} from './types.js';
import type {
  ListExperimentsRequest,
  ListExperimentsResponse,
} from './experiments/types.js';
export type { ListExperimentsResponse } from './experiments/types.js';
import type { Config } from '../config/config.js';
import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';

export type AuthClient = unknown;

export class CodeAssistServer {
  constructor(
    readonly client: AuthClient,
    readonly projectId?: string,
    readonly httpOptions: Record<string, unknown> = {},
    readonly sessionId?: string,
    readonly userTier?: UserTierId,
    readonly userTierName?: string,
    readonly paidTier?: GeminiUserTier,
    readonly config?: Config,
  ) {}

  getEffectiveSessionId(): string | undefined {
    return this.sessionId;
  }

  async generateContentStream(
    _request: GenerateContentParameters,
    _signal?: AbortSignal,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    throw new Error('langvis: code assist API is disabled');
  }

  async generateContent(
    _request: GenerateContentParameters,
    _signal?: AbortSignal,
  ): Promise<GenerateContentResponse> {
    throw new Error('langvis: code assist API is disabled');
  }

  async onboardUser(
    _req: OnboardUserRequest,
  ): Promise<LongRunningOperationResponse> {
    throw new Error('langvis: code assist API is disabled');
  }

  async getOperation(_name: string): Promise<LongRunningOperationResponse> {
    throw new Error('langvis: code assist API is disabled');
  }

  async refreshAvailableCredits(): Promise<void> {}

  async fetchAdminControls(
    _req: FetchAdminControlsRequest,
  ): Promise<FetchAdminControlsResponse> {
    return {};
  }

  async getCodeAssistGlobalUserSetting(): Promise<CodeAssistGlobalUserSettingResponse> {
    return {};
  }

  async setCodeAssistGlobalUserSetting(
    _req: SetCodeAssistGlobalUserSettingRequest,
  ): Promise<CodeAssistGlobalUserSettingResponse> {
    return {};
  }

  async countTokens(_req: CountTokensParameters): Promise<CountTokensResponse> {
    throw new Error('langvis: code assist API is disabled');
  }

  async embedContent(
    _req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('langvis: code assist API is disabled');
  }

  async listExperiments(
    _metadata: ClientMetadata,
    _req?: ListExperimentsRequest,
  ): Promise<ListExperimentsResponse> {
    return {};
  }

  async retrieveUserQuota(
    _req: RetrieveUserQuotaRequest,
  ): Promise<RetrieveUserQuotaResponse> {
    return {};
  }

  async recordConversationOffered(): Promise<void> {}

  async recordConversationInteraction(): Promise<void> {}

  async recordCodeAssistMetrics(
    _request: RecordCodeAssistMetricsRequest,
  ): Promise<void> {}
}
