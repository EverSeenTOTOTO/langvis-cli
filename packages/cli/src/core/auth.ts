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
  langvisClient,
  setLangvisConversation,
  fetchAndCacheLangvisModels,
  fetchAndCacheLangvisSkills,
  setLangvisConversationRecord,
  LangvisNotLoggedInError,
  type ResumedSessionData,
} from '@google/gemini-cli-core';

import type { AccountSuspensionInfo } from '../ui/contexts/UIStateContext.js';
import type { LoadedSettings } from '../config/settings.js';
import { defaultApprovalConfig } from '../utils/langvisDefaults.js';

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

/**
 * 校验 langvis 登录（cookies.json 或 LANGVIS_EMAIL/PASSWORD 兜底），
 * 然后把当前 cwd 绑定到一个 conversation（复用该 workspace 最新会话，否则新建）。
 * 复用已有会话时附带 ResumedSessionData——UI 启动自动重放历史。
 */
export async function initializeLangvis(settings?: LoadedSettings): Promise<{
  conversationId: string;
  resumed?: ResumedSessionData;
}> {
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
  const { conversations } =
    await langvisClient.listConversationsByWorkspace(cwd);
  // 新会话用占位名——首条消息后自动改为消息摘要（会话列表可读性）
  const existing = conversations[0];
  const conversation =
    existing ??
    (await langvisClient.createConversation(
      'New chat',
      cwd,
      settings ? defaultApprovalConfig(settings) : undefined,
    ));
  setLangvisConversation(conversation.id);
  setLangvisConversationRecord(conversation);
  // 预热模型定义集与 skills——ModelDialog 动态路径、/model set、/skills 的数据源
  await fetchAndCacheLangvisModels();
  await fetchAndCacheLangvisSkills();

  // 复用已有会话：拉取历史构造 ResumedSessionData，UI 挂载后自动重放
  let resumed: ResumedSessionData | undefined;
  if (existing) {
    const { messages } = await langvisClient.getMessages(conversation.id);
    resumed = {
      filePath: conversation.id,
      conversation: {
        sessionId: conversation.id,
        projectHash: '',
        startTime: conversation.createdAt,
        lastUpdated: conversation.createdAt,
        messages: messages.map((m) => ({
          type: m.role === 'user' ? ('user' as const) : ('gemini' as const),
          content: [{ text: m.content }],
          id: m.id,
          timestamp: m.createdAt,
        })),
      },
    };
  }
  return { conversationId: conversation.id, resumed };
}
