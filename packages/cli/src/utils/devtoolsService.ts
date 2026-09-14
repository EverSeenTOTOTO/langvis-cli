/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis 裁剪：devtools 面板/活动上报关闭。保留 AppContainer 动态导入的
// 契约，调用为 no-op。
import type { Config } from '@google/gemini-cli-core';

export async function setupInitialActivityLogger(_config: Config) {}

export async function toggleDevToolsPanel(
  _config: Config,
  _showErrorDetails: unknown,
  _onClose: () => void,
  _onFocus: () => void,
) {}
