/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LoadedSettings } from '../config/settings.js';

// CLI 设置 → 新会话 conversation config 的种子。
// defaultApprovalMode: default→default, auto_edit→auto(plan 未支持按 default)
export function defaultApprovalConfig(
  settings: LoadedSettings,
): Record<string, unknown> {
  const mode = settings.merged.general?.defaultApprovalMode;
  return { approval: { mode: mode === 'auto_edit' ? 'auto' : 'default' } };
}
