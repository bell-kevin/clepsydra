// SPDX-License-Identifier: AGPL-3.0-only

import type { Piezometer, Reading } from './types';

/**
 * The Cooper-Jacob straight-line method, done by ordinary least squares on
 * s against ln(t) instead of by eye on semi-log paper.
 *
 *   s = (Q / 4 pi T) * ln(2.25 T t / r^2 S)
 *
 * so the slope per natural log cycle gives T directly, and the time-axis
 * intercept t0 where the fitted line crosses s = 0 gives S:
 *
 *   T  = Q / (4 pi * slope)
 *   S  = 2.25 * T * t0 / r^2
 *
 * This is also how the curve-fitting seed is produced: a bad seed sends
 * Levenberg-Marquardt into a flat region of the well function and it never
 * recovers, so the seed is worth computing properly.
 */

export interface StraightLine {
  slope: number;
  intercept: number;
  T: number;
  S: number;
  /** Points that entered the regression. */
  n: number;
  r2: number;
}

export function fitStraightLine(Q: number, piezo: Piezometer, lateFraction = 0.5): StraightLine | null {
  const usable = piezo.readings
    .filter((d) => !d.excluded && d.t > 0 && Number.isFinite(d.s))
    .sort((a, b) => a.t - b.t);
  if (usable.length < 3) return null;

  // Cooper-Jacob applies to late time. Take the later portion of the record.
  const start = Math.min(usable.length - 3, Math.floor(usable.length * (1 - lateFraction)));
  const pts = usable.slice(start);

  const xs = pts.map((d) => Math.log(d.t));
  const ys = pts.map((d) => d.s);
  const n = pts.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  if (!(slope > 0)) return null;

  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * xs[i] + intercept;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }

  const T = Q / (4 * Math.PI * slope);
  const t0 = Math.exp(-intercept / slope);
  const S = (2.25 * T * t0) / (piezo.r * piezo.r);

  if (!Number.isFinite(T) || !Number.isFinite(S) || T <= 0 || S <= 0) return null;

  return {
    slope,
    intercept,
    T,
    S,
    n,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 1,
  };
}

/** A crude but always-finite fallback seed for when the straight line fails. */
export function fallbackSeed(Q: number, piezo: Piezometer): { T: number; S: number } {
  const usable = piezo.readings.filter((d: Reading) => !d.excluded && d.t > 0 && d.s > 0);
  const maxS = usable.length ? Math.max(...usable.map((d) => d.s)) : 1;
  const T = Q / (4 * Math.PI * Math.max(maxS, 1e-6));
  return { T: Math.max(T, 1e-8), S: 1e-4 };
}
