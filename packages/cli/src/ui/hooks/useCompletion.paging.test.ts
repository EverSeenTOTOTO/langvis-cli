/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { act } from 'react';
import { useCompletion } from './useCompletion.js';

const makeSuggestions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ label: `cmd${i}`, value: `cmd${i}` }));

describe('useCompletion paging wrap', () => {
  it('down at the last item wraps to the first with window reset', async () => {
    const { result } = await renderHook(() => useCompletion());
    act(() => result.current.setSuggestions(makeSuggestions(16)));
    // 逐个走到 15
    for (let i = 0; i < 16; i++) act(() => result.current.navigateDown());
    expect(result.current.activeSuggestionIndex).toBe(15);
    act(() => result.current.navigateDown());
    expect(result.current.activeSuggestionIndex).toBe(0);
    expect(result.current.visibleStartIndex).toBe(0);
  });

  it('up at the first item wraps to the last with window pinned to bottom', async () => {
    const { result } = await renderHook(() => useCompletion());
    act(() => result.current.setSuggestions(makeSuggestions(16)));
    act(() => result.current.setActiveSuggestionIndex(0));
    act(() => result.current.setVisibleStartIndex(0));
    act(() => result.current.navigateUp());
    expect(result.current.activeSuggestionIndex).toBe(15);
    expect(result.current.visibleStartIndex).toBe(8);
  });

  it('down crossing the visible window scrolls by one', async () => {
    const { result } = await renderHook(() => useCompletion());
    act(() => result.current.setSuggestions(makeSuggestions(16)));
    for (let i = 0; i < 8; i++) act(() => result.current.navigateDown());
    expect(result.current.activeSuggestionIndex).toBe(7);
    act(() => result.current.navigateDown());
    expect(result.current.activeSuggestionIndex).toBe(8);
    expect(result.current.visibleStartIndex).toBe(1);
  });
});
