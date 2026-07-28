// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Log scales and log-log graph paper ruling.
 *
 * Kept separate from the React components so the geometry can be tested
 * without a DOM, and so the type-curve drag arithmetic lives next to the
 * scales it depends on.
 */

export interface LogScale {
  /** Domain in data units (both strictly positive). */
  min: number;
  max: number;
  /** Range in pixels. */
  from: number;
  to: number;
  toPx: (value: number) => number;
  toValue: (px: number) => number;
  /** Pixels per decade. Constant on a log scale, which is what makes dragging work. */
  perDecade: number;
}

export function makeLogScale(min: number, max: number, from: number, to: number): LogScale {
  const lo = Math.log10(Math.max(min, Number.MIN_VALUE));
  const hi = Math.log10(Math.max(max, min * 1.0000001));
  const span = hi - lo || 1;
  const perDecade = (to - from) / span;
  return {
    min,
    max,
    from,
    to,
    perDecade,
    toPx: (value: number) => from + ((Math.log10(value) - lo) / span) * (to - from),
    toValue: (px: number) => 10 ** (lo + ((px - from) / (to - from)) * span),
  };
}

export interface Tick {
  value: number;
  /** Decade boundaries get a label and a heavier rule. */
  major: boolean;
}

/**
 * Graph-paper ruling: a heavy line at every power of ten and light lines at
 * 2 through 9 within each decade. This is what makes the plot readable as
 * paper rather than as a chart with arbitrary gridlines.
 */
export function logTicks(min: number, max: number, maxMinorDecades = 8): Tick[] {
  if (!(min > 0) || !(max > min)) return [];
  const firstExp = Math.floor(Math.log10(min));
  const lastExp = Math.ceil(Math.log10(max));
  const decades = lastExp - firstExp;
  const includeMinor = decades <= maxMinorDecades;

  const ticks: Tick[] = [];
  for (let e = firstExp; e <= lastExp; e++) {
    const base = 10 ** e;
    if (base >= min && base <= max) ticks.push({ value: base, major: true });
    if (!includeMinor) continue;
    for (let m = 2; m <= 9; m++) {
      const v = base * m;
      if (v >= min && v <= max) ticks.push({ value: v, major: false });
    }
  }
  return ticks;
}

/** Round a domain outward to whole decades so the paper starts and ends on a rule. */
export function niceLogDomain(values: number[], padDecades = 0): [number, number] {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0);
  if (positive.length === 0) return [1, 10];
  const lo = Math.min(...positive);
  const hi = Math.max(...positive);
  let min = 10 ** (Math.floor(Math.log10(lo)) - padDecades);
  let max = 10 ** (Math.ceil(Math.log10(hi)) + padDecades);
  if (min === max) max = min * 10;
  return [min, max];
}

/**
 * Translating a type curve on log-log paper IS a change of parameters, which
 * is the whole basis of the manual curve-matching method this tool reproduces.
 *
 *   s = Q/(4 pi T) * W(u)      so shifting the curve up by dv decades divides T by 10^dv
 *   t = r^2 S/(4 T u)          so shifting it right by dh decades multiplies t by 10^dh
 *
 * Holding the curve shape fixed and combining both shifts:
 *
 *   T' = T * 10^(-dv)
 *   S' = S * 10^(dh - dv)
 *
 * dv is measured upward, dh rightward, both in decades.
 */
export function translateParams(
  T: number,
  S: number,
  decadesRight: number,
  decadesUp: number,
): { T: number; S: number } {
  return {
    T: T * 10 ** -decadesUp,
    S: S * 10 ** (decadesRight - decadesUp),
  };
}

/** Inverse of translateParams: what shift takes (T, S) to (T2, S2)? */
export function paramsToTranslation(
  T: number,
  S: number,
  T2: number,
  S2: number,
): { decadesRight: number; decadesUp: number } {
  const decadesUp = -Math.log10(T2 / T);
  const decadesRight = Math.log10(S2 / S) + decadesUp;
  return { decadesRight, decadesUp };
}
