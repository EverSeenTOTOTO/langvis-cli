/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/ide/ide-client.ts，langvis 关闭此能力：
// IDE 集成关闭。类型（连接状态/Diff 结果）与上游同形；IdeClient 为
// 单例空壳——恒为断开态，diff 操作直接拒绝。

import type { IdeInfo } from './detect-ide.js';

export type DiffUpdateResult =
  | {
      status: 'accepted';
      content?: string;
    }
  | {
      status: 'rejected';
      content: undefined;
    };

export type IDEConnectionState = {
  status: IDEConnectionStatus;
  details?: string;
};

export enum IDEConnectionStatus {
  Connected = 'connected',
  Disconnected = 'disconnected',
  Connecting = 'connecting',
}

export class IdeClient {
  private static instancePromise: Promise<IdeClient> | null = null;

  private state: IDEConnectionState = {
    status: IDEConnectionStatus.Disconnected,
    details: 'langvis: IDE integration is disabled.',
  };

  private currentIde: IdeInfo | undefined;
  private statusListeners = new Set<(state: IDEConnectionState) => void>();
  private trustChangeListeners = new Set<(isTrusted: boolean) => void>();

  private constructor() {}

  static getInstance(): Promise<IdeClient> {
    if (!IdeClient.instancePromise) {
      IdeClient.instancePromise = Promise.resolve(new IdeClient());
    }
    return IdeClient.instancePromise;
  }

  addStatusChangeListener(listener: (state: IDEConnectionState) => void) {
    this.statusListeners.add(listener);
  }

  removeStatusChangeListener(listener: (state: IDEConnectionState) => void) {
    this.statusListeners.delete(listener);
  }

  addTrustChangeListener(listener: (isTrusted: boolean) => void) {
    this.trustChangeListeners.add(listener);
  }

  removeTrustChangeListener(listener: (isTrusted: boolean) => void) {
    this.trustChangeListeners.delete(listener);
  }

  async connect(_options: { logToConsole?: boolean } = {}): Promise<void> {}

  async openDiff(
    _filePath: string,
    _newContent: string,
  ): Promise<DiffUpdateResult> {
    throw new Error('langvis: IDE integration is disabled.');
  }

  async closeDiff(
    _filePath: string,
    _options?: { suppressNotification?: boolean },
  ): Promise<string | undefined> {
    return undefined;
  }

  async resolveDiffFromCli(
    _filePath: string,
    _outcome: 'accepted' | 'rejected',
  ): Promise<void> {}

  async disconnect(): Promise<void> {}

  getCurrentIde(): IdeInfo | undefined {
    return this.currentIde;
  }

  getConnectionStatus(): IDEConnectionState {
    return this.state;
  }

  getDetectedIdeDisplayName(): string | undefined {
    return this.currentIde?.name;
  }

  isDiffingEnabled(): boolean {
    return false;
  }
}
