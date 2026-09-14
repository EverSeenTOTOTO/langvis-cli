/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AuthType,
  type Config,
  getErrorMessage,
  ValidationRequiredError,
  isAccountSuspendedError,
  ProjectIdRequiredError,
} from '@google/gemini-cli-core';

import type { AccountSuspensionInfo } from '../ui/contexts/UIStateContext.js';

export interface InitialAuthResult {
  authError: string | null;
  accountSuspensionInfo: AccountSuspensionInfo | null;
}

/**
 * Handles the initial authentication flow.
 * @param config The application config.
 * @param authType The selected auth type.
 * @returns The auth result with error message and account suspension status.
 */
export async function performInitialAuth(
  config: Config,
  authType: AuthType | undefined,
): Promise<InitialAuthResult> {
  if (!authType) {
    return { authError: null, accountSuspensionInfo: null };
  }

  try {
    await config.refreshAuth(authType);
    // The console.log is intentionally left out here.
    // We can add a dedicated startup message later if needed.
  } catch (e) {
    if (e instanceof ValidationRequiredError) {
      // Don't treat validation required as a fatal auth error during startup.
      // This allows the React UI to load and show the ValidationDialog.
      return { authError: null, accountSuspensionInfo: null };
    }
    const suspendedError = isAccountSuspendedError(e);
    if (suspendedError) {
      return {
        authError: null,
        accountSuspensionInfo: {
          message: suspendedError.message,
          appealUrl: suspendedError.appealUrl,
          appealLinkText: suspendedError.appealLinkText,
        },
      };
    }
    if (e instanceof ProjectIdRequiredError) {
      // OAuth succeeded but account setup requires project ID
      // Show the error message directly without "Failed to login" prefix
      return {
        authError: getErrorMessage(e),
        accountSuspensionInfo: null,
      };
    }
    return {
      authError: `Failed to sign in. Message: ${getErrorMessage(e)}`,
      accountSuspensionInfo: null,
    };
  }

  return { authError: null, accountSuspensionInfo: null };
}

// ─── langvis：后端会话校验 + cwd 会话绑定 ───

import { basename } from 'node:path';
import {
  langvisClient,
  setLangvisConversation,
  LangvisNotLoggedInError,
} from '@google/gemini-cli-core';

/**
 * 校验 langvis 登录（cookies.json 或 LANGVIS_EMAIL/PASSWORD 兜底），
 * 然后把当前 cwd 绑定到一个 conversation（复用该 workspace 最新会话，否则新建）。
 * 返回 conversationId 供 Config.setSessionId 对齐。
 */
export async function initializeLangvis(): Promise<string> {
  try {
    await langvisClient.requireSession();
  } catch (e) {
    if (!(e instanceof LangvisNotLoggedInError)) throw e;
    const email = process.env['LANGVIS_EMAIL'];
    const password = process.env['LANGVIS_PASSWORD'];
    if (!email || !password) {
      throw new LangvisNotLoggedInError();
    }
    await langvisClient.signIn(email, password);
  }

  const cwd = process.cwd();
  const { conversations } = await langvisClient.listConversationsByWorkspace(
    cwd,
  );
  const conversation =
    conversations[0] ??
    (await langvisClient.createConversation(basename(cwd) || cwd, cwd));
  setLangvisConversation(conversation.id);
  return conversation.id;
}
