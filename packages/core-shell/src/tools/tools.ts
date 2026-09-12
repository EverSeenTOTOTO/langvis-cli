/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 工具类别原语——UI 渲染依赖 Kind 做图标/着色分流。

export enum Kind {
  Read = 'read',
  Edit = 'edit',
  Delete = 'delete',
  Move = 'move',
  Search = 'search',
  Execute = 'execute',
  Think = 'think',
  Agent = 'agent',
  Fetch = 'fetch',
  Communicate = 'communicate',
  Plan = 'plan',
  SwitchMode = 'switch_mode',
  Other = 'other',
}

export const MUTATOR_KINDS: Kind[] = [
  Kind.Edit,
  Kind.Delete,
  Kind.Move,
  Kind.Execute,
] as const;

export const READ_ONLY_KINDS: Kind[] = [Kind.Read, Kind.Search, Kind.Fetch];

// toolName → Kind 的启发式映射（langvis 工具名与 gemini 命名不同，按语义归族）。
export function inferKindFromToolName(name: string): Kind {
  const n = name.toLowerCase();
  if (/read|view|get|list|search|grep|find|glob/.test(n)) return Kind.Read;
  if (/edit|write|patch|apply/.test(n)) return Kind.Edit;
  if (/delete|remove|rm/.test(n)) return Kind.Delete;
  if (/move|rename/.test(n)) return Kind.Move;
  if (/bash|shell|exec|run|spawn/.test(n)) return Kind.Execute;
  if (/agent|subagent|delegate/.test(n)) return Kind.Agent;
  if (/fetch|http|web|request/.test(n)) return Kind.Fetch;
  if (/ask|confirm|dialog|user/.test(n)) return Kind.Communicate;
  if (/think|plan/.test(n)) return Kind.Think;
  return Kind.Other;
}
