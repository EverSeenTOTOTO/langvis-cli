/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 通用确认请求队列（terminal-setup 提示等消费；原 extension 更新流已随体系裁剪）。

import { useCallback, useReducer } from 'react';
import { checkExhaustive } from '@google/gemini-cli-core';
import type { ConfirmationRequest } from '../types.js';

type ConfirmationRequestWrapper = {
  prompt: React.ReactNode;
  onConfirm: (confirmed: boolean) => void;
};

type ConfirmationRequestAction =
  | { type: 'add'; request: ConfirmationRequestWrapper }
  | { type: 'remove'; request: ConfirmationRequestWrapper };

function confirmationRequestsReducer(
  state: ConfirmationRequestWrapper[],
  action: ConfirmationRequestAction,
): ConfirmationRequestWrapper[] {
  switch (action.type) {
    case 'add':
      return [...state, action.request];
    case 'remove':
      return state.filter((r) => r !== action.request);
    default:
      checkExhaustive(action);
  }
}

export const useConfirmUpdateRequests = () => {
  const [
    confirmUpdateExtensionRequests,
    dispatchConfirmUpdateExtensionRequests,
  ] = useReducer(confirmationRequestsReducer, []);
  const addConfirmUpdateExtensionRequest = useCallback(
    (original: ConfirmationRequest) => {
      const wrappedRequest = {
        prompt: original.prompt,
        onConfirm: (confirmed: boolean) => {
          // Remove it from the outstanding list of requests by identity.
          dispatchConfirmUpdateExtensionRequests({
            type: 'remove',
            request: wrappedRequest,
          });
          original.onConfirm(confirmed);
        },
      };
      dispatchConfirmUpdateExtensionRequests({
        type: 'add',
        request: wrappedRequest,
      });
    },
    [dispatchConfirmUpdateExtensionRequests],
  );
  return {
    addConfirmUpdateExtensionRequest,
    confirmUpdateExtensionRequests,
    dispatchConfirmUpdateExtensionRequests,
  };
};
