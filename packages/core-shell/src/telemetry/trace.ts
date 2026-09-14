/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 摘自 core/telemetry/trace.ts，langvis 关闭此能力：
// dev trace span 不落地，runInDevTraceSpan 直接执行回调。

type AttributeValue = string | number | boolean;

export interface SpanMetadata {
  /** The name of the span. */
  name: string;
  /** The input to the span. */
  input?: unknown;
  /** The output of the span. */
  output?: unknown;
  error?: unknown;
  /** Additional attributes for the span. */
  attributes: Record<string, AttributeValue>;
}

export interface SpanOptions {
  name?: string;
  attributes?: Record<string, AttributeValue>;
}

export async function runInDevTraceSpan<R>(
  _opts: SpanOptions & {
    operation: unknown;
    logPrompts?: boolean;
    sessionId: string;
    tracesEnabled?: boolean;
  },
  fn: ({ metadata }: { metadata: SpanMetadata }) => Promise<R>,
): Promise<R> {
  const metadata = {
    name: String(_opts.operation ?? ''),
    attributes: {},
  } as SpanMetadata;
  return fn({ metadata });
}
