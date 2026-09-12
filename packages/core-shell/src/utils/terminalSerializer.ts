/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 终端序列化类型（langvis shell 输出走后端投影，不做本地 PTY 序列化）。

export interface AnsiToken {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  dim: boolean;
  inverse: boolean;
  isUninitialized: boolean;
  fg: string;
  bg: string;
}

export type AnsiLine = AnsiToken[];
export type AnsiOutput = AnsiLine[];
