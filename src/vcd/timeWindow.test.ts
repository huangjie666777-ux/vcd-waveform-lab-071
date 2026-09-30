import { describe, expect, it } from 'vitest';
import { timeToX, xToTime } from './timeWindow';

it('keeps very large timestamp positioning exact enough for BigInt cursor deltas', () => {
  const huge = 123456789012345678901234567890n;
  const view = { startN: 0n, spanN: huge * 1_000_000n, width: 1000 };
  expect(timeToX(huge, view)).toBe(1000);
  expect(xToTime(500, view)).toBe(huge / 2n);
});
