// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { W, hantushW, besselK0 } from '../engine/wellfunction';

/**
 * The well function is the load-bearing piece of the whole tool: if W(u) is
 * wrong, every transmissivity it reports is wrong by the same factor and
 * nothing downstream will notice. So it is checked three independent ways.
 *
 *   1. Against published values of the exponential integral E1.
 *   2. Against a quadrature written here from the integral definition, which
 *      shares no code with the series/continued-fraction implementation.
 *   3. Against identities the function must satisfy regardless of either.
 */

/**
 * Reference values of E1(x) = W(x), carried to 12 significant figures.
 *
 * These were produced with mpmath at 25 decimal digits of working precision
 * (mpmath.e1) rather than typed in from a printed table, because a printed
 * table only carries 4 to 7 figures for W(u) and a transcription slip in the
 * reference values is indistinguishable from a bug in the implementation.
 * They agree with the published Abramowitz & Stegun table 5.1 values of E1
 * and with Wenzel's 1942 W(u) table everywhere those tables carry digits.
 */
const PUBLISHED_E1: Array<[number, number]> = [
  [0.001, 6.33153936414],
  [0.01, 4.03792957654],
  [0.05, 2.46789848851],
  [0.1, 1.82292395842],
  [0.2, 1.22265054418],
  [0.5, 0.559773594776],
  [1.0, 0.219383934396],
  [1.5, 0.100019582407],
  [2.0, 0.0489005107081],
  [3.0, 0.0130483810942],
  [5.0, 0.00114829559128],
  [10.0, 4.15696892969e-6],
];

/**
 * Independent computation of E1(u) by substitution y = u + x, giving
 *   E1(u) = exp(-u) * integral from 0 to inf of exp(-x)/(u+x) dx
 * evaluated with Gauss-Legendre panels on a geometrically stretched grid.
 * Deliberately shares nothing with the implementation under test.
 */
function e1ByQuadrature(u: number): number {
  const nodes = [
    -0.9061798459386640, -0.5384693101056831, 0, 0.5384693101056831, 0.9061798459386640,
  ];
  const weights = [
    0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665,
    0.2369268850561891,
  ];
  let total = 0;
  let lo = 0;
  let width = Math.min(u, 1) * 0.05 + 1e-6;
  while (lo < 800) {
    const hi = Math.min(lo + width, 800);
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2;
    for (let i = 0; i < nodes.length; i++) {
      const x = mid + half * nodes[i];
      total += weights[i] * half * (Math.exp(-x) / (u + x));
    }
    lo = hi;
    width *= 1.15;
  }
  return Math.exp(-u) * total;
}

describe('Theis well function W(u)', () => {
  it('matches published values of the exponential integral', () => {
    for (const [u, expected] of PUBLISHED_E1) {
      const got = W(u);
      expect(Math.abs(got - expected) / expected).toBeLessThan(1e-11);
    }
  });

  it('matches an independent quadrature across ten orders of magnitude in u', () => {
    for (let e = -6; e <= 1; e += 0.25) {
      const u = 10 ** e;
      const got = W(u);
      const quad = e1ByQuadrature(u);
      expect(Math.abs(got - quad) / quad).toBeLessThan(1e-7);
    }
  });

  it('is continuous across the u = 1 branch switch', () => {
    const below = W(1 - 1e-9);
    const above = W(1 + 1e-9);
    expect(Math.abs(below - above)).toBeLessThan(1e-8);
  });

  it('is strictly decreasing in u', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let e = -8; e <= 2; e += 0.1) {
      const value = W(10 ** e);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it('approaches the Cooper-Jacob logarithmic form when u is small', () => {
    // W(u) -> -gamma - ln(u), i.e. ln(0.5615/u), as u -> 0.
    for (const u of [1e-4, 1e-5, 1e-6, 1e-8]) {
      const approx = Math.log(0.5615 / u);
      expect(Math.abs(W(u) - approx) / approx).toBeLessThan(2e-3);
    }
  });

  it('handles degenerate input without throwing', () => {
    expect(W(0)).toBe(Number.POSITIVE_INFINITY);
    expect(W(-1)).toBe(Number.POSITIVE_INFINITY);
    expect(W(1e9)).toBe(0);
    expect(Number.isNaN(W(Number.NaN))).toBe(true);
    expect(Number.isNaN(W(Number.POSITIVE_INFINITY))).toBe(true);
  });
});

describe('Hantush-Jacob leaky well function W(u, r/B)', () => {
  it('reduces exactly to the Theis well function when r/B is zero', () => {
    for (const u of [1e-5, 1e-3, 0.1, 1, 5]) {
      expect(hantushW(u, 0)).toBeCloseTo(W(u), 12);
    }
  });

  it('approaches Theis as r/B becomes small', () => {
    for (const u of [1e-4, 1e-2, 0.5]) {
      const leaky = hantushW(u, 1e-4);
      expect(Math.abs(leaky - W(u)) / W(u)).toBeLessThan(1e-3);
    }
  });

  it('satisfies the steady-state identity W(0, b) = 2 K0(b)', () => {
    // As u -> 0 the leaky solution reaches steady state at 2*K0(r/B).
    for (const beta of [0.01, 0.05, 0.1, 0.5, 1, 2]) {
      const limit = hantushW(1e-12, beta);
      const identity = 2 * besselK0(beta);
      expect(Math.abs(limit - identity) / identity).toBeLessThan(1e-5);
    }
  });

  it('is bounded above by the Theis well function for any leakage', () => {
    for (const u of [1e-5, 1e-3, 0.1, 1]) {
      for (const beta of [0.01, 0.1, 1, 3]) {
        expect(hantushW(u, beta)).toBeLessThanOrEqual(W(u) + 1e-12);
      }
    }
  });

  it('decreases monotonically as leakage increases', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const beta of [0.001, 0.01, 0.1, 0.3, 1, 2, 4]) {
      const value = hantushW(1e-3, beta);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it('rejects nonsense input rather than returning a plausible number', () => {
    expect(Number.isNaN(hantushW(1, -1))).toBe(true);
    expect(Number.isNaN(hantushW(Number.NaN, 1))).toBe(true);
    expect(hantushW(1e9, 1)).toBe(0);
  });
});

describe('besselK0 (test-suite cross-check only)', () => {
  it('matches published values of K0', () => {
    // Standard tabulated values of the modified Bessel function K0.
    const published: Array<[number, number]> = [
      [0.1, 2.427069025],
      [0.5, 0.9244190712],
      [1.0, 0.4210244382],
      [2.0, 0.1138938727],
      [5.0, 0.003691098334],
    ];
    for (const [x, expected] of published) {
      expect(Math.abs(besselK0(x) - expected) / expected).toBeLessThan(2e-6);
    }
  });
});
