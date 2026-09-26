/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis AskUser 的 JSON Schema → gemini Question[] 翻译。
// answers 以问题索引为键返回，keyAt 负责换回 schema 字段名。

import { QuestionType, type Question } from '@google/gemini-cli-core';

export interface SchemaQuestions {
  questions: Question[];
  keyAt: (index: number) => string;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (v as Record<string, unknown>)
    : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function schemaToQuestions(
  schema: Record<string, unknown>,
  message: string,
): SchemaQuestions {
  const props = asRecord(schema['properties']) ?? {};
  const keys = Object.keys(props);

  if (keys.length === 0) {
    // 非对象 schema（或空）——整包作单个自由文本问题
    return {
      questions: [
        {
          question: message,
          header: 'answer',
          type: QuestionType.TEXT,
          unconstrainedHeight: true,
        },
      ],
      keyAt: () => 'answer',
    };
  }

  const questions: Question[] = keys.map((key) => {
    const p = asRecord(props[key]) ?? {};
    const enumVals = Array.isArray(p['enum']) ? p['enum'] : undefined;
    const type: QuestionType = enumVals
      ? QuestionType.CHOICE
      : p['type'] === 'boolean'
        ? QuestionType.YESNO
        : QuestionType.TEXT;
    const description = str(p['description']);
    const title = str(p['title']);
    const placeholder = str(p['default']);
    return {
      question: description ?? title ?? key,
      header: title ?? key,
      type,
      ...(enumVals
        ? {
            options: enumVals.map((v) => ({
              label: String(v),
              description: '',
            })),
          }
        : {}),
      ...(placeholder ? { placeholder } : {}),
    };
  });

  return {
    questions,
    keyAt: (index) => keys[index] ?? String(index),
  };
}
