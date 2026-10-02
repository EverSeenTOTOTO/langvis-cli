/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import path from 'node:path';
import { Box, Text } from 'ink';
import {
  ApprovalMode,
  getLangvisConversationRecord,
  langvisClient,
} from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { getAllToolCalls } from '../utils/historyUtils.js';

// 紧凑状态行（仿 claude-code statusline）：左对齐单行、│ 分段、超宽截断。
// 取代上游 Footer/详情行（右对齐散布、条目间大片留白）。
export const LangvisStatusLine: React.FC = () => {
  const uiState = useUIState();
  const settings = useSettings();
  const [identity, setIdentity] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.merged.ui.showUserIdentity || identity !== null) return;
    let alive = true;
    langvisClient
      .sessionUser()
      .then((email) => {
        if (alive) setIdentity(email);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [settings.merged.ui.showUserIdentity, identity]);

  const parts: React.ReactNode[] = [];

  if (settings.merged.ui.showUserIdentity && identity) {
    parts.push(
      <Text key="identity" color={theme.ui.comment}>
        {identity}
      </Text>,
    );
  }

  if (uiState.currentModel) {
    parts.push(
      <Text key="model" color={theme.text.accent}>
        [{uiState.currentModel}]
      </Text>,
    );
  }

  // workspace 取会话记录（web 终端=PTY cwd 的临时目录、本地=启动目录）；无记录回退 cwd
  const record = getLangvisConversationRecord();
  const workspace = path.basename(record?.workspacePath || process.cwd());
  parts.push(
    <Text key="cwd" color={theme.text.secondary}>
      {workspace}
      {uiState.branchName ? ' ' : ''}
    </Text>,
  );
  if (uiState.branchName) {
    parts.push(
      <Text key="branch" color={theme.text.link}>
        git:({uiState.branchName})
      </Text>,
    );
  }
  if (record?.id) {
    parts.push(
      <Text key="conv" color={theme.ui.comment}>
        {record.id}
      </Text>,
    );
  }

  if (uiState.conversationUsage) {
    const { used, total } = uiState.conversationUsage;
    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const filled = Math.round(pct / 10);
    const barColor =
      pct >= 80
        ? theme.status.error
        : pct >= 50
          ? theme.status.warning
          : theme.status.success;
    parts.push(
      <Text key="ctx">
        <Text color={theme.text.secondary}>Context </Text>
        <Text color={barColor}>
          {'█'.repeat(filled)}
          {'░'.repeat(Math.max(0, 10 - filled))}
        </Text>
        <Text color={theme.text.secondary}> {pct}%</Text>
      </Text>,
    );
  }

  // 本轮工具计数：按展示名聚合（✓/✗ ×次数），取前 3 组
  const counts = new Map<string, { ok: number; fail: number }>();
  for (const call of getAllToolCalls(uiState.pendingHistoryItems)) {
    const name = call.name || call.originalRequestName || 'tool';
    const slot = counts.get(name) ?? { ok: 0, fail: 0 };
    if (call.status === 'error') slot.fail++;
    else if (call.status === 'success') slot.ok++;
    counts.set(name, slot);
  }
  const toolSegments = [...counts.entries()].slice(0, 3);
  if (toolSegments.length > 0) {
    parts.push(
      <Text key="tools">
        {toolSegments
          .map(([name, c], idx) => {
            const totalCalls = c.ok + c.fail;
            const mark =
              c.fail > 0 && c.ok === 0 ? (
                <Text color={theme.status.error}>✗</Text>
              ) : (
                <Text color={theme.status.success}>✓</Text>
              );
            return (
              <React.Fragment key={name}>
                {idx > 0 ? <Text color={theme.text.secondary}> | </Text> : null}
                {mark}
                <Text color={theme.text.secondary}>
                  {' '}
                  {name}
                  {totalCalls > 1 ? ` ×${totalCalls}` : ''}
                </Text>
              </React.Fragment>
            );
          })
          .flat()}
      </Text>,
    );
  }

  const mode = uiState.showApprovalModeIndicator;
  const modeText =
    mode === ApprovalMode.YOLO
      ? '⏵⏵⏵ yolo!'
      : mode === ApprovalMode.AUTO_EDIT
        ? '⏵⏵ auto'
        : '⏸ default';
  const modeColor =
    mode === ApprovalMode.YOLO
      ? theme.status.warning
      : mode === ApprovalMode.AUTO_EDIT
        ? theme.status.success
        : theme.text.secondary;
  parts.push(
    <Text key="mode">
      <Text color={modeColor} bold>
        {modeText}
      </Text>
      <Text color={theme.text.secondary}> (shift+tab)</Text>
    </Text>,
  );

  return (
    <Box marginLeft={1}>
      <Text wrap="truncate">
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Text color={theme.ui.comment}> │ </Text> : null}
            {part}
          </React.Fragment>
        ))}
      </Text>
    </Box>
  );
};
