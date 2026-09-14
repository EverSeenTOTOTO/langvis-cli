/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/code_assist/setup.ts，langvis 关闭此能力：错误类型保留，用户
// 校验流程不落地。

import type { IneligibleTier } from './types.js';
import type { Config } from '../config/config.js';
import type { AuthClient } from './server.js';

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      'This account requires setting the GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID env var. See https://goo.gle/gemini-cli-auth-docs#workspace-gca',
    );
    this.name = 'ProjectIdRequiredError';
  }
}

export class InvalidNumericProjectIdError extends Error {
  constructor(projectId: string) {
    super(
      `Invalid Google Cloud Project ID: "${projectId}". The GOOGLE_CLOUD_PROJECT (or GOOGLE_CLOUD_PROJECT_ID) environment variable must be set to your string-based Project ID (e.g., "my-project-123"), not your numeric Project Number. Please update your environment variables.`,
    );
    this.name = 'InvalidNumericProjectIdError';
  }
}

export class ValidationCancelledError extends Error {
  constructor() {
    super('User cancelled account validation');
    this.name = 'ValidationCancelledError';
  }
}

export class IneligibleTierError extends Error {
  readonly ineligibleTiers: IneligibleTier[];

  constructor(ineligibleTiers: IneligibleTier[]) {
    const reasons = ineligibleTiers.map((t) => t.reasonMessage).join(', ');
    super(reasons);
    this.name = 'IneligibleTierError';
    this.ineligibleTiers = ineligibleTiers;
  }
}

export interface UserData {
  projectId?: string;
  userEmail?: string;
  tierId?: string;
  analyticsOptIn?: boolean;
  apiKey?: string;
}

export function resetUserDataCacheForTesting() {}

export async function setupUser(
  _client: AuthClient,
  _config: Config,
  _httpOptions: Record<string, unknown> = {},
): Promise<UserData> {
  throw new Error('langvis: code assist user setup is disabled');
}
