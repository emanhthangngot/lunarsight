import { describe, expect, it } from 'vitest';
import { firstBothVisibleIndex } from './landingMoment';

describe('firstBothVisibleIndex', () => {
  it('returns the earliest sample where both bodies are known visible', () => {
    expect(firstBothVisibleIndex([false, null, true, true])).toBe(2);
  });

  it('does not treat unknown or hidden samples as a usable moment', () => {
    expect(firstBothVisibleIndex([false, null, false])).toBeNull();
    expect(firstBothVisibleIndex([])).toBeNull();
  });
});
