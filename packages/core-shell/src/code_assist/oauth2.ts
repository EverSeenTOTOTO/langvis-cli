/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/code_assist/oauth2.ts，langvis 关闭此能力：
// OAuth 客户端不落地。

import type { AuthType } from '../core/contentGenerator.js';
import type { Config } from '../config/config.js';
import type { AuthClient } from './server.js';

export async function getOauthClient(
  _authType: AuthType,
  _config: Config,
): Promise<AuthClient> {
  throw new Error('langvis: oauth is disabled');
}

export function getAvailablePort(): Promise<number> {
  return Promise.resolve(0);
}

export function clearOauthClientCache() {}

export async function clearCachedCredentialFile() {}

export function resetOauthClientForTesting() {}
