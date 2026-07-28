// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { logTicks, makeLogScale, niceLogDomain, paramsToTranslation, translateParams } from '../chart/scale';
import { parseReadings } from '../engine/parse';
import { decodeState, encodeState, fromBase64Url, toBase64Url } from '../share/codec';
import { theis } from '../engine/models';
import { sig } from '../engine/units';

describe('log scale', () => {
  const scale = makeLogScale(1, 1000, 0, 300);

  it('places decades at equal pixel spacing', () => {
    expect(scale.toPx(1)).toBeCloseTo(0, 9);
    expect(scale.toPx(10)).toBeCloseTo(100, 9);
    expect(scale.toPx(100)).toBeCloseTo(200, 9);
    expect(scale.toPx(1000)).toBeCloseTo(300, 9);
    expect(scale.perDecade).toBeCloseTo(100, 9);
  });

  it('round-trips values through pixels', () => {
    for (const v of [1.5, 7, 42, 365, 999]) {
      expect(scale.toValue(scale.toPx(v))).toBeCloseTo(v, 6);
    }
  });

  it('handles an inverted pixel range, which is how the y axis is drawn', () => {
    const y = makeLogScale(0.01, 10, 400, 0);
    expect(y.toPx(0.01)).toBeCloseTo(400, 9);
    expect(y.toPx(10)).toBeCloseTo(0, 9);
    expect(y.toValue(200)).toBeCloseTo(Math.sqrt(0.01 * 10), 6);
  });

  it('does not divide by zero on a degenerate domain', () => {
    const flat = makeLogScale(5, 5, 0, 100);
    expect(Number.isFinite(flat.toPx(5))).toBe(true);
    expect(Number.isFinite(flat.perDecade)).toBe(true);
  });
});

describe('graph paper ruling', () => {
  it('rules a heavy line on every power of ten and light lines at 2 to 9', () => {
    const ticks = logTicks(1, 100);
    const majors = ticks.filter((t) => t.major).map((t) => t.value);
    expect(majors).toEqual([1, 10, 100]);
    expect(ticks.filter((t) => !t.major).length).toBe(16); // 2..9 in each of two decades
  });

  it('drops the minor ruling when the plot spans too many decades to read', () => {
    const ticks = logTicks(1e-6, 1e6, 8);
    expect(ticks.every((t) => t.major)).toBe(true);
  });

  it('returns nothing rather than looping forever on an impossible domain', () => {
    expect(logTicks(0, 100)).toEqual([]);
    expect(logTicks(-1, 100)).toEqual([]);
    expect(logTicks(100, 1)).toEqual([]);
    expect(logTicks(Number.NaN, 10)).toEqual([]);
  });

  it('rounds a domain outward to whole decades', () => {
    expect(niceLogDomain([3, 400])).toEqual([1, 1000]);
    expect(niceLogDomain([])).toEqual([1, 10]);
    expect(niceLogDomain([Number.NaN, Number.POSITIVE_INFINITY, -5])).toEqual([1, 10]);
  });
});

describe('type-curve translation', () => {
  /**
   * The claim under test is the physical one: sliding the type curve on
   * log-log paper is exactly equivalent to changing T and S. If that is
   * wrong, the drag interaction is a lie. So check it against the model
   * itself rather than against the formula it was derived from.
   */
  it('a translated curve equals the curve computed from the translated parameters', () => {
    const Q = 1000 / 86400;
    const T = 300 / 86400;
    const S = 2e-4;
    const r = 40;
    const dh = 0.35;
    const dv = -0.2;
    const moved = translateParams(T, S, dh, dv);

    for (const minutes of [1, 10, 100, 1000]) {
      const t = minutes * 60;
      // A point on the original curve, shifted right by dh decades in time and
      // up by dv decades in drawdown.
      const shiftedTime = t * 10 ** dh;
      const shiftedDrawdown = theis(Q, T, S, r, t) * 10 ** dv;
      // The same point evaluated from the translated parameters.
      const direct = theis(Q, moved.T, moved.S, r, shiftedTime);
      expect(Math.abs(direct - shiftedDrawdown) / shiftedDrawdown).toBeLessThan(1e-9);
    }
  });

  it('is exactly invertible', () => {
    const T = 3.4e-3;
    const S = 1.7e-4;
    const moved = translateParams(T, S, 0.7, -0.3);
    const back = paramsToTranslation(T, S, moved.T, moved.S);
    expect(back.decadesRight).toBeCloseTo(0.7, 12);
    expect(back.decadesUp).toBeCloseTo(-0.3, 12);
  });

  it('a zero shift changes nothing', () => {
    const moved = translateParams(1e-3, 1e-4, 0, 0);
    expect(moved.T).toBeCloseTo(1e-3, 15);
    expect(moved.S).toBeCloseTo(1e-4, 15);
  });
});

describe('reading parser', () => {
  it('accepts tabs, commas, semicolons and runs of spaces', () => {
    const text = '1\t0.10\n2,0.20\n3;0.30\n4    0.40';
    const { rows } = parseReadings(text);
    expect(rows).toEqual([
      { t: 1, s: 0.1 },
      { t: 2, s: 0.2 },
      { t: 3, s: 0.3 },
      { t: 4, s: 0.4 },
    ]);
  });

  it('skips headers and comments without counting them as data', () => {
    const { rows, skipped } = parseReadings('# minutes, metres\ntime\tdrawdown\n1\t0.1\n2\t0.2');
    expect(rows.length).toBe(2);
    expect(skipped.length).toBe(1);
    expect(skipped[0].reason).toMatch(/header/);
  });

  it('inverts a column of negative heads and says so', () => {
    const { rows, signFlipped } = parseReadings('1 -0.10\n2 -0.20\n3 -0.30');
    expect(signFlipped).toBe(true);
    expect(rows.map((r) => r.s)).toEqual([0.1, 0.2, 0.3]);
  });

  it('leaves a genuinely positive column alone', () => {
    const { signFlipped } = parseReadings('1 0.10\n2 0.20\n3 -0.01');
    expect(signFlipped).toBe(false);
  });

  it('reports lines it could not use instead of dropping them silently', () => {
    const { rows, skipped } = parseReadings('1 0.1\nbroken\n3 x\n4 0.4');
    expect(rows.length).toBe(2);
    expect(skipped.map((s) => s.line)).toEqual([2, 3]);
  });

  it('ignores extra columns rather than failing', () => {
    const { rows } = parseReadings('1,0.1,notes,99\n2,0.2,more,98');
    expect(rows).toEqual([
      { t: 1, s: 0.1 },
      { t: 2, s: 0.2 },
    ]);
  });

  it('returns empty output for empty and whitespace input', () => {
    expect(parseReadings('').rows).toEqual([]);
    expect(parseReadings('   \n\n\t').rows).toEqual([]);
  });

  it('handles scientific notation and leading signs', () => {
    const { rows } = parseReadings('1e1 1.5e-2\n2E1 +0.03');
    expect(rows).toEqual([
      { t: 10, s: 0.015 },
      { t: 20, s: 0.03 },
    ]);
  });
});

describe('share codec', () => {
  it('round-trips base64url including bytes that need escaping', () => {
    const bytes = new Uint8Array([0, 1, 62, 63, 127, 128, 250, 255]);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(Array.from(fromBase64Url(text))).toEqual(Array.from(bytes));
  });

  it('round-trips an analysis through compression', async () => {
    const state = {
      v: 1,
      title: 'Oude Korendijk',
      readings: Array.from({ length: 70 }, (_, i) => ({ t: i + 1, s: (i + 1) * 0.01 })),
    };
    const encoded = await encodeState(state);
    const decoded = await decodeState<typeof state>(encoded);
    expect(decoded).toEqual(state);
  });

  it('actually compresses a realistic payload to something a link can carry', async () => {
    const state = {
      v: 1,
      piezometers: Array.from({ length: 2 }, (_, p) => ({
        id: `p${p}`,
        readings: Array.from({ length: 35 }, (_, i) => ({ t: (i + 1) * 60, s: i * 0.03 })),
      })),
    };
    const encoded = await encodeState(state);
    expect(encoded.length).toBeLessThan(2000);
    expect(encoded.startsWith('1z')).toBe(true);
  });

  it('returns null on truncated, corrupt or foreign payloads instead of throwing', async () => {
    expect(await decodeState('')).toBeNull();
    expect(await decodeState('1z')).toBeNull();
    expect(await decodeState('1znotvalidbase64!!!')).toBeNull();
    expect(await decodeState('9xAAAA')).toBeNull();
    const good = await encodeState({ a: 1 });
    expect(await decodeState(good.slice(0, good.length - 4))).toBeNull();
  });

  it('reads back a plain uncompressed payload, for browsers without CompressionStream', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
    const payload = '1p' + toBase64Url(bytes);
    expect(await decodeState(payload)).toEqual({ hello: 'world' });
  });
});

describe('significant-figure formatting', () => {
  it('keeps four significant figures across magnitudes', () => {
    expect(sig(462.6012)).toBe('462.6');
    expect(sig(1.779e-4)).toBe('1.779e-4');
    expect(sig(0.05)).toBe('0.05000');
  });

  it('does not print a fake number for missing data', () => {
    expect(sig(Number.NaN)).toBe('—');
    expect(sig(Number.POSITIVE_INFINITY)).toBe('—');
    expect(sig(0)).toBe('0');
  });
});
