// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { nextVelocity, shouldStartMomentum, MOMENTUM_DECAY } from './useDragScroll';

describe('nextVelocity', () => {
  it('applies the per-16ms-frame decay at the reference frame size', () => {
    expect(nextVelocity(10)).toBeCloseTo(10 * MOMENTUM_DECAY);
    expect(nextVelocity(-4)).toBeCloseTo(-4 * MOMENTUM_DECAY);
  });

  it('decays to below the stop threshold within ~15 frames at 60fps', () => {
    // log_{0.94}(0.05/20) ≈ 96.8 16ms-steps. With 20 px/frame initial velocity
    // we expect roughly 97 frames before crossing 0.05; cap generously.
    let v = 20;
    let frames = 0;
    while (Math.abs(v) >= 0.05 && frames < 200) {
      v = nextVelocity(v);
      frames++;
    }
    expect(Math.abs(v)).toBeLessThan(0.05);
    expect(frames).toBeGreaterThan(90);
    expect(frames).toBeLessThan(110);
  });

  it('is frame-rate independent: 1×16ms ≡ 2×8ms ≡ 4×4ms', () => {
    const v0 = 10;
    const after16 = nextVelocity(v0, 16);
    const after8x2 = nextVelocity(nextVelocity(v0, 8), 8);
    const after4x4 = nextVelocity(
      nextVelocity(nextVelocity(nextVelocity(v0, 4), 4), 4),
      4,
    );
    expect(after8x2).toBeCloseTo(after16, 10);
    expect(after4x4).toBeCloseTo(after16, 10);
  });
});

describe('shouldStartMomentum', () => {
  it('returns false for slow releases (avoid jitter from a click)', () => {
    expect(shouldStartMomentum(0)).toBe(false);
    expect(shouldStartMomentum(1.4)).toBe(false);
    expect(shouldStartMomentum(-1.4)).toBe(false);
    expect(shouldStartMomentum(1.5)).toBe(false);
  });

  it('returns true once the absolute velocity exceeds the threshold', () => {
    expect(shouldStartMomentum(1.6)).toBe(true);
    expect(shouldStartMomentum(-1.6)).toBe(true);
    expect(shouldStartMomentum(50)).toBe(true);
  });
});
