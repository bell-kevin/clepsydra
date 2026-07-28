// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { fit, seedParams } from '../engine/fit';
import { cooperJacob, theis, theisRecovery, hantushJacob } from '../engine/models';
import { fitStraightLine } from '../engine/straightline';
import { bourdetDerivative, plateauTransmissivity } from '../engine/derivative';
import { SAMPLES } from '../engine/samples';
import type { TestSetup } from '../engine/types';

const DAY = 86400;
const MIN = 60;

function syntheticSetup(opts: {
  T: number; // m2/d
  S: number;
  Q: number; // m3/d
  r: number;
  noise?: number;
  count?: number;
  model?: TestSetup['model'];
  rOverB?: number;
}): TestSetup {
  const T = opts.T / DAY;
  const S = opts.S;
  const Q = opts.Q / DAY;
  const count = opts.count ?? 30;
  // Deterministic, symmetric "noise" so the expected answer is not biased.
  const noiseAt = (i: number) => (opts.noise ?? 0) * Math.sin(i * 2.399963229728653);

  const readings = [];
  for (let i = 0; i < count; i++) {
    const minutes = 10 ** (Math.log10(1) + ((Math.log10(1440) - Math.log10(1)) * i) / (count - 1));
    const t = minutes * MIN;
    const s =
      opts.model === 'hantush'
        ? hantushJacob(Q, T, S, opts.rOverB ?? 0.2, opts.r, t)
        : theis(Q, T, S, opts.r, t);
    readings.push({ t, s: s + noiseAt(i) });
  }
  return {
    Q,
    model: opts.model ?? 'theis',
    piezometers: [{ id: 'obs', label: 'OBS', r: opts.r, readings }],
  };
}

describe('models', () => {
  it('Cooper-Jacob agrees with Theis once u is small', () => {
    const T = 300 / DAY;
    const S = 2e-4;
    const Q = 900 / DAY;
    const r = 50;
    // u < 0.01 is the usual validity threshold; check the agreement there.
    for (const minutes of [200, 500, 1000, 2000]) {
      const t = minutes * MIN;
      const u = (r * r * S) / (4 * T * t);
      expect(u).toBeLessThan(0.01);
      const a = theis(Q, T, S, r, t);
      const b = cooperJacob(Q, T, S, r, t);
      expect(Math.abs(a - b) / a).toBeLessThan(0.01);
    }
  });

  it('Cooper-Jacob visibly disagrees with Theis at early time, as it should', () => {
    const T = 300 / DAY;
    const S = 2e-4;
    const Q = 900 / DAY;
    const r = 200;
    const t = 1 * MIN;
    const u = (r * r * S) / (4 * T * t);
    expect(u).toBeGreaterThan(1);
    const a = theis(Q, T, S, r, t);
    const b = cooperJacob(Q, T, S, r, t);
    // At u > 1 the logarithm has gone negative and Cooper-Jacob is not merely
    // inaccurate, it is meaningless. Using it here would be a real error.
    expect(b).toBe(0);
    expect(Math.abs(a - b) / a).toBeGreaterThan(0.9);
  });

  it('drawdown scales linearly with discharge', () => {
    const args = [200 / DAY, 3e-4, 40, 3600] as const;
    const one = theis(1 / DAY, ...args);
    const ten = theis(10 / DAY, ...args);
    expect(ten / one).toBeCloseTo(10, 10);
  });

  it('recovery residual drawdown falls towards zero as time since shut-in grows', () => {
    const T = 250 / DAY;
    const S = 4e-4;
    const Q = 800 / DAY;
    const tp = 12 * 3600;
    const early = theisRecovery(Q, T, S, 30, 60, tp);
    const late = theisRecovery(Q, T, S, 30, 40 * 3600, tp);
    expect(early).toBeGreaterThan(late);
    expect(late).toBeGreaterThan(0);
  });
});

describe('straight-line Cooper-Jacob solution', () => {
  it('recovers the parameters it was generated from', () => {
    const setup = syntheticSetup({ T: 400, S: 3e-4, Q: 1000, r: 60, count: 40 });
    const line = fitStraightLine(setup.Q, setup.piezometers[0], 0.4);
    expect(line).not.toBeNull();
    expect((line!.T * DAY) / 400).toBeGreaterThan(0.95);
    expect((line!.T * DAY) / 400).toBeLessThan(1.05);
    expect(line!.S / 3e-4).toBeGreaterThan(0.8);
    expect(line!.S / 3e-4).toBeLessThan(1.25);
  });

  it('returns null rather than a wrong answer when drawdown does not increase', () => {
    const flat: TestSetup = {
      Q: 1000 / DAY,
      model: 'cooper-jacob',
      piezometers: [
        {
          id: 'x',
          label: 'X',
          r: 20,
          readings: [
            { t: 60, s: 1 },
            { t: 600, s: 1 },
            { t: 6000, s: 1 },
            { t: 60000, s: 1 },
          ],
        },
      ],
    };
    expect(fitStraightLine(flat.Q, flat.piezometers[0])).toBeNull();
  });
});

describe('automatic curve matching', () => {
  it('recovers known parameters from clean synthetic data', () => {
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45, count: 35 });
    const result = fit(setup);
    expect(result.converged).toBe(true);
    expect(result.params.T * DAY).toBeCloseTo(250, 1);
    expect(result.params.S / 5e-4).toBeCloseTo(1, 2);
  });

  it('still recovers parameters within a few percent under noise', () => {
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45, noise: 0.01, count: 35 });
    const result = fit(setup);
    const ratioT = (result.params.T * DAY) / 250;
    const ratioS = result.params.S / 5e-4;
    expect(ratioT).toBeGreaterThan(0.93);
    expect(ratioT).toBeLessThan(1.07);
    expect(ratioS).toBeGreaterThan(0.75);
    expect(ratioS).toBeLessThan(1.3);
  });

  it('recovers leakage from a synthetic Hantush-Jacob response', () => {
    const setup = syntheticSetup({
      T: 300,
      S: 2e-4,
      Q: 1000,
      r: 50,
      count: 40,
      model: 'hantush',
      rOverB: 0.3,
    });
    const result = fit(setup);
    expect(result.params.T * DAY).toBeCloseTo(300, 0);
    expect(result.params.rOverB).toBeCloseTo(0.3, 2);
  });

  it('is insensitive to the starting guess', () => {
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45, count: 35 });
    const fromDefault = fit(setup);
    const fromBad = fit(setup, { T: 1e-6, S: 1e-2, rOverB: 0.1 });
    expect(fromBad.params.T / fromDefault.params.T).toBeCloseTo(1, 2);
  });

  it('reports uncertainty that widens when the data get noisier', () => {
    const clean = fit(syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45, noise: 0.002, count: 35 }));
    const dirty = fit(syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45, noise: 0.05, count: 35 }));
    expect(clean.errors.T!.log10Se).toBeLessThan(dirty.errors.T!.log10Se);
  });

  it('warns when Cooper-Jacob is applied where u is not small', () => {
    const setup = syntheticSetup({ T: 60, S: 1e-3, Q: 500, r: 250, count: 25 });
    setup.model = 'cooper-jacob';
    const result = fit(setup);
    expect(result.maxU).toBeGreaterThan(0.01);
    expect(result.warnings.join(' ')).toMatch(/u is small/i);
  });
});

describe('Bourdet derivative', () => {
  it('flattens onto Q/(4 pi T) for a Theis response', () => {
    const T = 250 / DAY;
    const Q = 1200 / DAY;
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45, count: 60 });
    const d = bourdetDerivative(setup.piezometers[0].readings);
    const plateau = plateauTransmissivity(d, Q);
    expect(plateau).not.toBeNull();
    // The derivative plateau gives T without any curve fitting at all.
    expect(plateau!.T / T).toBeGreaterThan(0.95);
    expect(plateau!.T / T).toBeLessThan(1.05);
  });

  it('returns an empty series rather than throwing on too few points', () => {
    expect(bourdetDerivative([{ t: 1, s: 1 }])).toEqual([]);
    expect(bourdetDerivative([])).toEqual([]);
  });
});

describe('published field data: Oude Korendijk', () => {
  const sample = SAMPLES.find((s) => s.id === 'oude-korendijk')!;

  it('reproduces the published AQTESOLV result on both piezometers together', () => {
    const result = fit(sample.setup);
    const T = result.params.T * DAY;
    const S = result.params.S;

    // AQTESOLV, MLU and TTim, fitting the two piezometers simultaneously,
    // report k close to 66.09 m/d and Ss close to 2.541e-5 /m for a 7 m
    // aquifer. That is T = 462.6 m2/d and S = 1.779e-4.
    const publishedT = 66.086 * 7;
    const publishedS = 2.541e-5 * 7;

    expect(T / publishedT).toBeGreaterThan(0.9);
    expect(T / publishedT).toBeLessThan(1.1);
    expect(S / publishedS).toBeGreaterThan(0.8);
    expect(S / publishedS).toBeLessThan(1.25);
  });

  it('produces a residual scatter comparable to the published RMSE', () => {
    const result = fit(sample.setup);
    // The published simultaneous fits report RMSE about 0.050 m.
    expect(result.rmse).toBeLessThan(0.08);
  });

  it('the 30 m and 90 m piezometers disagree, which is a real feature of this test', () => {
    const only30: TestSetup = { ...sample.setup, piezometers: [sample.setup.piezometers[0]] };
    const only90: TestSetup = { ...sample.setup, piezometers: [sample.setup.piezometers[1]] };
    const a = fit(only30).params.T * DAY;
    const b = fit(only90).params.T * DAY;
    // Published single-well fits differ by several percent; assert they differ
    // rather than pretending a heterogeneous aquifer gives one answer.
    expect(Math.abs(a - b) / a).toBeGreaterThan(0.01);
  });
});

describe('degenerate and hostile input', () => {
  const base: TestSetup = {
    Q: 1000 / DAY,
    model: 'theis',
    piezometers: [{ id: 'a', label: 'A', r: 30, readings: [] }],
  };

  it('reports a reason when there are no readings at all', () => {
    const r = fit(base);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(Number.isNaN(r.params.T)).toBe(true);
  });

  it('reports a reason when there are fewer readings than parameters', () => {
    const r = fit({ ...base, piezometers: [{ ...base.piezometers[0], readings: [{ t: 60, s: 0.1 }] }] });
    expect(r.warnings.join(' ')).toMatch(/at least/i);
  });

  it('rejects zero and negative discharge', () => {
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45 });
    expect(fit({ ...setup, Q: 0 }).warnings.join(' ')).toMatch(/discharge/i);
    expect(fit({ ...setup, Q: -1 }).warnings.join(' ')).toMatch(/discharge/i);
  });

  it('rejects a piezometer at zero distance', () => {
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45 });
    setup.piezometers[0].r = 0;
    expect(fit(setup).warnings.join(' ')).toMatch(/distance/i);
  });

  it('refuses recovery analysis without a pumping duration', () => {
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45 });
    setup.model = 'recovery';
    expect(fit(setup).warnings.join(' ')).toMatch(/pumping duration/i);
  });

  it('ignores non-positive times instead of producing NaN', () => {
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45, count: 30 });
    setup.piezometers[0].readings.unshift({ t: 0, s: 0 }, { t: -60, s: -1 });
    const r = fit(setup);
    expect(Number.isFinite(r.params.T)).toBe(true);
    expect(r.n).toBe(30);
  });

  it('survives NaN and Infinity in the readings', () => {
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45, count: 30 });
    setup.piezometers[0].readings.push(
      { t: Number.NaN, s: 1 },
      { t: 600, s: Number.NaN },
      { t: Number.POSITIVE_INFINITY, s: 1 },
    );
    const r = fit(setup);
    expect(Number.isFinite(r.params.T)).toBe(true);
  });

  it('excluded readings genuinely take no part in the fit', () => {
    const setup = syntheticSetup({ T: 250, S: 5e-4, Q: 1200, r: 45, count: 30 });
    const clean = fit(setup);
    setup.piezometers[0].readings.push({ t: 300, s: 99, excluded: true });
    const withOutlier = fit(setup);
    expect(withOutlier.params.T).toBeCloseTo(clean.params.T, 12);
    expect(withOutlier.n).toBe(clean.n);
  });

  it('does not silently succeed on an all-zero drawdown record', () => {
    const setup: TestSetup = {
      Q: 1000 / DAY,
      model: 'theis',
      piezometers: [
        {
          id: 'z',
          label: 'Z',
          r: 30,
          readings: Array.from({ length: 20 }, (_, i) => ({ t: (i + 1) * 60, s: 0 })),
        },
      ],
    };
    const r = fit(setup);
    const suspicious = !Number.isFinite(r.params.T) || r.params.T * DAY > 1e6 || r.warnings.length > 0;
    expect(suspicious).toBe(true);
  });

  it('seeding never returns a non-finite or non-positive parameter', () => {
    const nasty: TestSetup = {
      Q: 1000 / DAY,
      model: 'theis',
      piezometers: [
        { id: 'a', label: 'A', r: 10, readings: [{ t: 1, s: -5 }, { t: 2, s: -6 }, { t: 3, s: -7 }] },
      ],
    };
    const seed = seedParams(nasty);
    expect(seed.T).toBeGreaterThan(0);
    expect(seed.S).toBeGreaterThan(0);
    expect(Number.isFinite(seed.T)).toBe(true);
  });
});
