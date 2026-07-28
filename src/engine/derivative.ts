// SPDX-License-Identifier: AGPL-3.0-only

import type { Reading } from './types';

/**
 * Bourdet et al. (1989) log-derivative, ds/d(ln t).
 *
 * Why it earns its place: on a log-log plot the derivative of a Theis response
 * flattens onto a horizontal plateau at Q/(4 pi T) once radial flow is
 * established. That plateau is the single most useful thing on the screen. It
 * says whether the aquifer is behaving like the model at all, and it gives an
 * independent read on T that owes nothing to the curve fit.
 *
 * A raw point-to-point derivative of field data is unreadable noise, so the
 * differences are taken across a window of width L in ln(t) and combined as a
 * weighted mean of the left and right slopes.
 */

export interface DerivativePoint {
  t: number;
  /** ds/d(ln t), metres per natural log cycle. */
  d: number;
}

export function bourdetDerivative(readings: Reading[], smoothing = 0.25): DerivativePoint[] {
  const pts = readings
    .filter((d) => Number.isFinite(d.t) && Number.isFinite(d.s) && d.t > 0)
    .sort((a, b) => a.t - b.t);
  if (pts.length < 3) return [];

  const lnT = pts.map((d) => Math.log(d.t));
  const out: DerivativePoint[] = [];

  for (let i = 1; i < pts.length - 1; i++) {
    let left = i - 1;
    while (left > 0 && lnT[i] - lnT[left] < smoothing) left--;
    let right = i + 1;
    while (right < pts.length - 1 && lnT[right] - lnT[i] < smoothing) right++;

    const dxLeft = lnT[i] - lnT[left];
    const dxRight = lnT[right] - lnT[i];
    if (dxLeft <= 0 || dxRight <= 0) continue;

    const slopeLeft = (pts[i].s - pts[left].s) / dxLeft;
    const slopeRight = (pts[right].s - pts[i].s) / dxRight;
    const d = (slopeLeft * dxRight + slopeRight * dxLeft) / (dxLeft + dxRight);
    if (Number.isFinite(d)) out.push({ t: pts[i].t, d });
  }
  return out;
}

/**
 * The transmissivity implied by the flat part of the derivative:
 * T = Q / (4 pi * plateau). Returns null when no plateau is identifiable.
 *
 * The plateau is taken as the median derivative over the late half of the
 * record, and it is only reported when that late half is genuinely flat.
 */
export function plateauTransmissivity(
  points: DerivativePoint[],
  Q: number,
): { T: number; plateau: number; spread: number } | null {
  if (points.length < 4 || !(Q > 0)) return null;
  const late = points.slice(Math.floor(points.length / 2));
  const values = late.map((p) => p.d).filter((v) => v > 0).sort((a, b) => a - b);
  if (values.length < 3) return null;

  const median = values[Math.floor(values.length / 2)];
  const lo = values[0];
  const hi = values[values.length - 1];
  const spread = median > 0 ? (hi - lo) / median : Number.POSITIVE_INFINITY;
  if (!(median > 0)) return null;

  return { T: Q / (4 * Math.PI * median), plateau: median, spread };
}
