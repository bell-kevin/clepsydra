// SPDX-License-Identifier: AGPL-3.0-only

import { levenbergMarquardt } from './lm';
import { argU, drawdown, MODEL_PARAMS } from './models';
import { fallbackSeed, fitStraightLine } from './straightline';
import type { FitResult, Params, Reading, TestSetup } from './types';

/**
 * Automatic curve matching.
 *
 * T, S and r/B are strictly positive and range over many orders of magnitude,
 * so the optimiser works on their base-10 logarithms. That keeps the parameter
 * space unconstrained, makes the step size scale-free, and means the reported
 * uncertainty is naturally multiplicative, which is how these parameters
 * actually behave.
 */

interface FitPoint {
  r: number;
  t: number;
  s: number;
}

export function collectFitPoints(setup: TestSetup): FitPoint[] {
  const out: FitPoint[] = [];
  for (const p of setup.piezometers) {
    for (const d of p.readings) {
      if (d.excluded) continue;
      if (!Number.isFinite(d.t) || !Number.isFinite(d.s)) continue;
      if (d.t <= 0) continue;
      out.push({ r: p.r, t: d.t, s: d.s });
    }
  }
  return out;
}

export function seedParams(setup: TestSetup): Params {
  const withData = setup.piezometers.filter(
    (p) => p.readings.some((d) => !d.excluded && d.t > 0),
  );
  if (withData.length === 0) return { T: 1e-3, S: 1e-4, rOverB: 0.1 };

  // Seed from the piezometer with the most usable readings.
  const best = withData.reduce((a, b) =>
    b.readings.filter((d) => !d.excluded).length > a.readings.filter((d) => !d.excluded).length ? b : a,
  );

  // A leaky response flattens towards steady state, so a straight line through
  // its late data reads as an enormous transmissivity. Use the middle of the
  // record instead, where the response is still behaving like Theis.
  const line =
    setup.model === 'hantush'
      ? (fitStraightLine(setup.Q, best, 0.5) ?? fitStraightLine(setup.Q, best))
      : fitStraightLine(setup.Q, best);
  const base = line ? { T: line.T, S: line.S } : fallbackSeed(setup.Q, best);
  return { ...base, rOverB: 0.1 };
}

/**
 * Sum of squared residuals at a given parameter set, used by the coarse
 * multistart scan before any Levenberg-Marquardt iteration is spent.
 */
function ssrAt(setup: TestSetup, points: FitPoint[], params: Params): number {
  let total = 0;
  for (const pt of points) {
    const modelled = drawdown(setup, params, pt.r, pt.t);
    if (!Number.isFinite(modelled)) return Number.POSITIVE_INFINITY;
    total += (modelled - pt.s) ** 2;
  }
  return total;
}

/**
 * Levenberg-Marquardt is a local method: from a bad enough start it walks into
 * a flat corner of the well function and stops there, reporting a confident
 * and completely wrong transmissivity. So the seed is never trusted on its own.
 *
 * Transmissivity is scanned relative to the straight-line seed, which is
 * usually within an order of magnitude. Storativity and leakage are scanned on
 * ABSOLUTE grids instead, because both have a known physical range that does
 * not depend on the seed at all, and because a straight-line seed for S can be
 * wrong by five orders of magnitude on a leaky response. Anchoring those two
 * to physics rather than to a possibly-bad seed is what makes the leaky case
 * converge.
 */
function startingPoints(setup: TestSetup, points: FitPoint[], seed: Params): Params[] {
  const tMuls = [1e-3, 1e-2, 1e-1, 1, 10, 100, 1e3];
  // Confined storativity runs about 1e-5 to 1e-3; specific yield reaches 0.3.
  const sGrid = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 0.1];
  const bGrid = setup.model === 'hantush' ? [0.01, 0.03, 0.1, 0.3, 1, 3] : [seed.rOverB ?? 0.1];

  // Ranking only needs the shape of the misfit, so scan on a subsample. This
  // keeps the leaky case, whose well function is a quadrature, responsive.
  const stride = Math.max(1, Math.ceil(points.length / 20));
  const scanPoints = points.filter((_, i) => i % stride === 0);

  const grid: Array<{ params: Params; ssr: number }> = [];
  for (const tm of tMuls) {
    for (const S of sGrid) {
      for (const rOverB of bGrid) {
        const params: Params = { T: seed.T * tm, S, rOverB };
        grid.push({ params, ssr: ssrAt(setup, scanPoints, params) });
      }
    }
  }
  grid.sort((a, b) => a.ssr - b.ssr);
  const best = grid.filter((g) => Number.isFinite(g.ssr)).slice(0, 4).map((g) => g.params);
  return [seed, ...best];
}

export function fit(setup: TestSetup, seed?: Params): FitResult {
  const points = collectFitPoints(setup);
  const names = MODEL_PARAMS[setup.model];
  const warnings: string[] = [];

  const empty: FitResult = {
    params: { T: Number.NaN, S: Number.NaN },
    errors: {},
    ssr: Number.NaN,
    rmse: Number.NaN,
    r2: Number.NaN,
    n: points.length,
    iterations: 0,
    converged: false,
    maxU: Number.NaN,
    warnings,
  };

  if (points.length < names.length + 1) {
    warnings.push(
      `Need at least ${names.length + 1} readings to fit ${names.length} parameters. Have ${points.length}.`,
    );
    return empty;
  }
  if (!(setup.Q > 0)) {
    warnings.push('Discharge must be greater than zero.');
    return empty;
  }
  if (setup.model === 'recovery' && !(setup.pumpingDuration && setup.pumpingDuration > 0)) {
    warnings.push('Recovery analysis needs the pumping duration before shut-in.');
    return empty;
  }
  if (setup.piezometers.some((p) => p.readings.some((d) => !d.excluded) && !(p.r > 0))) {
    warnings.push('Every piezometer needs a radial distance greater than zero.');
    return empty;
  }

  const start = seed ?? seedParams(setup);

  const unpack = (p: number[]): Params => {
    const out: Params = { T: 0, S: 0 };
    names.forEach((name, i) => {
      const value = 10 ** p[i];
      if (name === 'rOverB') out.rOverB = value;
      else out[name] = value;
    });
    return out;
  };

  const residuals = (p: number[]): number[] => {
    const params = unpack(p);
    return points.map((pt) => {
      const modelled = drawdown(setup, params, pt.r, pt.t);
      return Number.isFinite(modelled) ? modelled - pt.s : Number.NaN;
    });
  };

  let result = null as ReturnType<typeof levenbergMarquardt> | null;
  for (const candidate of startingPoints(setup, points, start)) {
    const p0 = names.map((name) =>
      Math.log10(clampPositive(name === 'rOverB' ? (candidate.rOverB ?? 0.1) : candidate[name])),
    );
    const attempt = levenbergMarquardt(residuals, p0, { step: 1e-5, maxIterations: 150 });
    if (!Number.isFinite(attempt.ssr)) continue;
    if (!result || attempt.ssr < result.ssr) result = attempt;
  }
  if (!result) {
    warnings.push('The fit did not produce finite residuals. Check the discharge, distances and units.');
    return empty;
  }
  const params = unpack(result.p);

  if (!result.converged) {
    warnings.push('Curve matching hit the iteration limit without settling. Treat the result as provisional.');
  }

  const meanS = points.reduce((a, b) => a + b.s, 0) / points.length;
  const ssTot = points.reduce((a, b) => a + (b.s - meanS) ** 2, 0);
  const rmse = Math.sqrt(result.ssr / points.length);
  const r2 = ssTot > 0 ? 1 - result.ssr / ssTot : Number.NaN;

  const errors: FitResult['errors'] = {};
  if (result.covariance) {
    names.forEach((name, i) => {
      const variance = result.covariance![i][i];
      if (variance >= 0 && Number.isFinite(variance)) {
        const log10Se = Math.sqrt(variance);
        errors[name] = { log10Se, factor95: 10 ** (1.96 * log10Se) };
      }
    });
  } else {
    warnings.push('Not enough degrees of freedom to estimate parameter uncertainty.');
  }

  const maxU = points.reduce(
    (acc, pt) => Math.max(acc, argU(params.T, params.S, pt.r, effectiveTime(setup, pt.t))),
    0,
  );

  if (setup.model === 'cooper-jacob' && maxU > 0.01) {
    warnings.push(
      `Cooper–Jacob assumes u is small; the largest u among the fitted points is ${maxU.toPrecision(2)}. ` +
        'Exclude the early readings or switch to Theis.',
    );
  }
  if (params.S >= 1) {
    warnings.push('Storativity came out at or above 1, which is not physical for a confined aquifer.');
  }

  return {
    params,
    errors,
    ssr: result.ssr,
    rmse,
    r2,
    n: points.length,
    iterations: result.iterations,
    converged: result.converged,
    maxU,
    warnings,
  };
}

/** For recovery the reported time is since shut-in; u is evaluated on total elapsed time. */
function effectiveTime(setup: TestSetup, t: number): number {
  return setup.model === 'recovery' ? (setup.pumpingDuration ?? 0) + t : t;
}

function clampPositive(v: number | undefined): number {
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : 1e-6;
}

/** Per-point residuals for the misfit strip, in the order the piezometers are listed. */
export function residualSeries(
  setup: TestSetup,
  params: Params,
): Array<{ piezometerId: string; t: number; residual: number; excluded: boolean }> {
  const out: Array<{ piezometerId: string; t: number; residual: number; excluded: boolean }> = [];
  for (const p of setup.piezometers) {
    for (const d of p.readings as Reading[]) {
      if (!Number.isFinite(d.t) || d.t <= 0) continue;
      const modelled = drawdown(setup, params, p.r, d.t);
      out.push({
        piezometerId: p.id,
        t: d.t,
        residual: Number.isFinite(modelled) ? modelled - d.s : Number.NaN,
        excluded: Boolean(d.excluded),
      });
    }
  }
  return out;
}
