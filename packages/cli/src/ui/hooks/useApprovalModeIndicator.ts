/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import {
  ApprovalMode,
  type Config,
  getAdminErrorMessage,
} from '@google/gemini-cli-core';
import { useKeypress } from './useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from './useKeyMatchers.js';
import { MessageType, type HistoryItemWithoutId } from '../types.js';

export interface UseApprovalModeIndicatorArgs {
  config: Config;
  addItem?: (item: HistoryItemWithoutId, timestamp: number) => void;
  onApprovalModeChange?: (mode: ApprovalMode) => void | Promise<void>;
  isActive?: boolean;
}

export function useApprovalModeIndicator({
  config,
  addItem,
  onApprovalModeChange,
  isActive = true,
}: UseApprovalModeIndicatorArgs): {
  mode: ApprovalMode;
  pending: ApprovalMode | null;
} {
  const keyMatchers = useKeyMatchers();
  const currentConfigValue = config.getApprovalMode();
  const [showApprovalMode, setApprovalMode] = useState(currentConfigValue);
  // 后端确认中：UI 保持旧档 + spinner，确认成功才变更（失败回滚并提示）。
  const [pendingMode, setPendingMode] = useState<ApprovalMode | null>(null);

  useEffect(() => {
    // pending 期间 config 本地值是"暂存"(守卫先行+确认后生效),显示不跟随;
    // 待确认/回滚落定后再同步,外部变更也顺延到空闲时生效。
    if (pendingMode === null) setApprovalMode(currentConfigValue);
  }, [currentConfigValue, pendingMode]);

  useKeypress(
    (key) => {
      let nextApprovalMode: ApprovalMode | undefined;

      if (keyMatchers[Command.TOGGLE_YOLO](key)) {
        if (
          config.isYoloModeDisabled() &&
          config.getApprovalMode() !== ApprovalMode.YOLO
        ) {
          if (addItem) {
            let text =
              'You cannot enter YOLO mode since it is disabled in your settings.';
            const adminSettings = config.getRemoteAdminSettings();
            const hasSettings =
              adminSettings && Object.keys(adminSettings).length > 0;
            if (hasSettings && !adminSettings.strictModeDisabled) {
              text = getAdminErrorMessage('YOLO mode', config);
            }

            addItem(
              {
                type: MessageType.WARNING,
                text,
              },
              Date.now(),
            );
          }
          return;
        }
        nextApprovalMode =
          config.getApprovalMode() === ApprovalMode.YOLO
            ? ApprovalMode.DEFAULT
            : ApprovalMode.YOLO;
      } else if (keyMatchers[Command.CYCLE_APPROVAL_MODE](key)) {
        // langvis 三档循环：default → auto → yolo → default（plan 无后端对应，不入循环）
        const currentMode = config.getApprovalMode();
        switch (currentMode) {
          case ApprovalMode.DEFAULT:
            nextApprovalMode = ApprovalMode.AUTO_EDIT;
            break;
          case ApprovalMode.AUTO_EDIT:
            // 不可信目录禁 yolo——退回 default 而非进 yolo
            nextApprovalMode = config.isYoloModeDisabled()
              ? ApprovalMode.DEFAULT
              : ApprovalMode.YOLO;
            break;
          case ApprovalMode.PLAN:
          case ApprovalMode.YOLO:
          default:
            nextApprovalMode = ApprovalMode.DEFAULT;
        }
      }

      if (nextApprovalMode && !pendingMode) {
        // 同步策略守卫（不可信目录/禁特权档）先于任何后端交互；
        // 抛错原文提示，档位不变。
        try {
          config.setApprovalMode(nextApprovalMode);
        } catch (e) {
          if (addItem) {
            addItem(
              {
                type: MessageType.INFO,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                text: (e as Error).message,
              },
              Date.now(),
            );
          }
          return;
        }
        const previous = showApprovalMode;
        setPendingMode(nextApprovalMode);
        void (async () => {
          try {
            // PUT 落库确认；显示在确认后才变更
            await Promise.resolve(onApprovalModeChange?.(nextApprovalMode));
            setApprovalMode(nextApprovalMode);
          } catch (e) {
            // 落库失败：回滚本地 config 与显示
            config.setApprovalMode(previous);
            if (addItem) {
              addItem(
                {
                  type: MessageType.ERROR,
                  text: `Approval mode switch failed, keeping ${previous}: ${
                    e instanceof Error ? e.message : String(e)
                  }`,
                },
                Date.now(),
              );
            }
          } finally {
            setPendingMode(null);
          }
        })();
      }
    },
    { isActive },
  );

  return { mode: showApprovalMode, pending: pendingMode };
}
