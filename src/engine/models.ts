// SPDX-License-Identifier: AGPL-3.0-only

import { W, hantushW } from './wellfunction';
import type { ModelId, Params, TestSetup } from './types';

/**
 * Analytical drawdown solutions. All arguments are SI base units.
 *
 * Theis (1935)            confined, fully penetrating well, no leakage
 * Cooper & Jacob (1946)   the logarithmic approximation to Theis, valid at small u
 * Hantush & Jacob (1955)  leaky confined, aquitard storage neglected
 * Theis recovery          residual drawdown after shut-in, by superposition
 */

/** u = r^2 S / (4 T t) */
export function argU(T: number, S: number, r: number, t: number): number {
  return (r * r * S) / (4 * T * t);
}

export function theis(Q: number, T: number, S: number, r: number, t: number): number {
  if (t <= 0 || T <= 0 || S <= 0) return Number.NaN;
  return (Q / (4 * Math.PI * T)) * W(argU(T, S, r, t));
}

/** s = Q/(4 pi T) * ln(2.25 T t / (r^2 S)). Returns 0 below the time where the log turns negative. */
export function cooperJacob(Q: number, T: number, S: number, r: number, t: number): number {
  if (t <= 0 || T <= 0 || S <= 0) return Number.NaN;
  const arg = (2.25 * T * t) / (r * r * S);
  if (arg <= 1) return 0;
  return (Q / (4 * Math.PI * T)) * Math.log(arg);
}

export function hantushJacob(
  Q: number,
  T: number,
  S: number,
  rOverB: number,
  r: number,
  t: number,
): number {
  if (t <= 0 || T <= 0 || S <= 0 || rOverB < 0) return Number.NaN;
  return (Q / (4 * Math.PI * T)) * hantushW(argU(T, S, r, t), rOverB);
}

/**
 * Residual drawdown during recovery, by superposition of a real well pumping
 * from t = 0 and an image well injecting from t = pumpingDuration.
 * `tPrime` is time since the pump stopped.
 */
export function theisRecovery(
  Q: number,
  T: number,
  S: number,
  r: number,
  tPrime: number,
  pumpingDuration: number,
): number {
  if (tPrime <= 0 || T <= 0 || S <= 0 || pumpingDuration <= 0) return Number.NaN;
  const t = pumpingDuration + tPrime;
  return (Q / (4 * Math.PI * T)) * (W(argU(T, S, r, t)) - W(argU(T, S, r, tPrime)));
}

/** Dispatch to whichever solution the setup selected. */
export function drawdown(setup: TestSetup, p: Params, r: number, t: number): number {
  switch (setup.model) {
    case 'theis':
      return theis(setup.Q, p.T, p.S, r, t);
    case 'cooper-jacob':
      return cooperJacob(setup.Q, p.T, p.S, r, t);
    case 'hantush':
      return hantushJacob(setup.Q, p.T, p.S, p.rOverB ?? 0, r, t);
    case 'recovery':
      return theisRecovery(setup.Q, p.T, p.S, r, t, setup.pumpingDuration ?? 0);
  }
}

export const MODEL_LABELS: Record<ModelId, string> = {
  theis: 'Theis',
  'cooper-jacob': 'Cooper–Jacob',
  hantush: 'Hantush–Jacob',
  recovery: 'Theis recovery',
};

export const MODEL_NOTES: Record<ModelId, string> = {
  theis: 'Confined, fully penetrating well, no leakage, constant discharge.',
  'cooper-jacob': 'Logarithmic approximation to Theis. Only valid where u is small.',
  hantush: 'Leaky confined. Aquitard storage neglected. Adds r/B.',
  recovery: 'Residual drawdown after shut-in. Needs the pumping duration.',
};

/** Models that carry a third fitted parameter. */
export const MODEL_PARAMS: Record<ModelId, Array<'T' | 'S' | 'rOverB'>> = {
  theis: ['T', 'S'],
  'cooper-jacob': ['T', 'S'],
  hantush: ['T', 'S', 'rOverB'],
  recovery: ['T', 'S'],
};
