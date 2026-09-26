/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// langvis AskUser 的 JSON Schema → gemini Question[] 翻译。
// AskUserDialog 的 answers 全为字符串（索引键 + 选项 label / "Yes"/"No" / 文本），
// normalize 负责换回 schema 字段名并按类型还原原始值（enum 对象原样、boolean、number）。

import { QuestionType, type Question } from '@google/gemini-cli-core';

export interface SchemaQuestions {
  questions: Question[];
  /** 索引键 + 字符串答案 → schema 键 + 归一值（提交给 human-input 的最终形状）。 */
  normalize: (answers: { [questionIndex: string]: string }) => Record<string, unknown>;
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

/** enum 项的展示 label：对象取 label/title/name，否则字符串化。 */
function enumLabel(v: unknown): string {
  const rec = asRecord(v);
  return str(rec?.['label']) ?? str(rec?.['title']) ?? str(rec?.['name']) ?? String(v);
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
      normalize: (answers) => ({
        answer: answers['0'] ?? '',
      }),
    };
  }

  const questions: Question[] = [];
  // label → 原始 enum 值（对象值原样保留），按字段名分桶
  const labelMaps = new Map<string, Map<string, unknown>>();

  for (const key of keys) {
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

    if (enumVals) {
      const map = new Map<string, unknown>();
      for (const v of enumVals) map.set(enumLabel(v), v);
      labelMaps.set(key, map);
    }

    questions.push({
      question: description ?? title ?? key,
      header: title ?? key,
      type,
      ...(enumVals
        ? {
            options: enumVals.map((v) => ({
              label: enumLabel(v),
              description: '',
            })),
          }
        : {}),
      ...(placeholder ? { placeholder } : {}),
    });
  }

  const normalize = (
    answers: { [questionIndex: string]: string },
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [index, answer] of Object.entries(answers)) {
      const key = keys[Number(index)] ?? String(index);
      const p = asRecord(props[key]) ?? {};
      const labelMap = labelMaps.get(key);
      if (labelMap && labelMap.has(answer)) {
        // 选中枚举项——回传原始值（对象原样）
        out[key] = labelMap.get(answer);
        continue;
      }
      if (p['type'] === 'boolean') {
        out[key] = answer === 'Yes';
        continue;
      }
      if (p['type'] === 'number' || p['type'] === 'integer') {
        const n = Number(answer);
        out[key] = Number.isNaN(n) ? answer : n;
        continue;
      }
      out[key] = answer;
    }
    return out;
  };

  return { questions, normalize };
}
