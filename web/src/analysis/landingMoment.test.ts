import { describe, expect, it } from 'vitest';
import { planLandingMoment } from './landingMoment';

describe('planLandingMoment', () => {
  it('moves to the earliest sample where both bodies are known visible', () => {
    expect(planLandingMoment([false, null, true, true], 0, true)).toEqual({ kind: 'move', index: 2 });
    expect(planLandingMoment([false, true, false, true], 3, true)).toEqual({ kind: 'move', index: 1 });
  });

  it('keeps the cursor when it is already on that sample', () => {
    expect(planLandingMoment([false, true, true], 1, true)).toEqual({ kind: 'already', index: 1 });
  });

  it('keeps the cursor and reports none only when every sample is known hidden', () => {
    expect(planLandingMoment([false, false, false], 2, true)).toEqual({ kind: 'none', index: 2 });
  });

  it('does not report none when unknown samples might qualify', () => {
    expect(planLandingMoment([false, null, false], 0, true)).toEqual({ kind: 'none-known', index: 0 });
  });

  it('reports the missing mask instead of a visibility verdict', () => {
    expect(planLandingMoment([null, null], 1, false)).toEqual({ kind: 'mask-unavailable', index: 1 });
  });
});
