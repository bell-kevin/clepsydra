// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sheet } from '../components/Sheet';
import { Diagnostic } from '../components/Diagnostic';
import { fit } from '../engine/fit';
import { SAMPLES } from '../engine/samples';
import { findUnit, LENGTH_UNITS, TIME_UNITS } from '../engine/units';
import type { TestSetup } from '../engine/types';

/**
 * These exist because of a bug that no amount of engine testing would have
 * caught: the plot was ruled in SI seconds while its axis label said minutes,
 * so every reading sat two decades from where the label claimed. The numbers
 * were all correct and the picture was wrong.
 *
 * The engine is metres-and-seconds and the plot is whatever the field sheet
 * used. That boundary now has a test on it.
 */

const MIN = findUnit(TIME_UNITS, 'min');
const SEC = findUnit(TIME_UNITS, 's');
const METRE = findUnit(LENGTH_UNITS, 'm');
const FOOT = findUnit(LENGTH_UNITS, 'ft');
const noop = () => {};

/** Every <text> node's contents, in document order. */
function texts(markup: string): string[] {
  return Array.from(markup.matchAll(/<text[^>]*>([^<]*)<\/text>/g)).map((m) => m[1]);
}

/** A record spanning 1 to 1000 minutes and 0.01 to 1 metres, stored in SI. */
function setupSI(): TestSetup {
  const readings = [];
  for (let i = 0; i <= 20; i++) {
    const minutes = 10 ** ((3 * i) / 20);
    readings.push({ t: minutes * 60, s: 0.01 * 10 ** ((2 * i) / 20) });
  }
  return {
    Q: 1000 / 86400,
    model: 'theis',
    piezometers: [{ id: 'a', label: 'A', r: 30, readings }],
  };
}

describe('the plot is ruled in the unit its axis claims', () => {
  it('rules the time axis in minutes when the readings are shown in minutes', () => {
    const markup = renderToStaticMarkup(
      <Sheet
        setup={setupSI()}
        params={{ T: 3e-3, S: 2e-4 }}
        timeLabel="time (min)"
        drawdownLabel="drawdown (m)"
        timeUnit={MIN}
        lengthUnit={METRE}
        onDrag={noop}
        onToggleReading={noop}
      />,
    );
    const labels = texts(markup);
    // 1 to 1000 minutes.
    for (const expected of ['1', '10', '100', '1000']) {
      expect(labels).toContain(expected);
    }
    // If it were plotting the underlying seconds the axis would run to 1e5.
    expect(labels).not.toContain('1e5');
    expect(labels).not.toContain('10000');
  });

  it('rules the same data differently when the display unit changes', () => {
    const inSeconds = texts(
      renderToStaticMarkup(
        <Sheet
          setup={setupSI()}
          params={{ T: 3e-3, S: 2e-4 }}
          timeLabel="time (s)"
          drawdownLabel="drawdown (m)"
          timeUnit={SEC}
          lengthUnit={METRE}
          onDrag={noop}
          onToggleReading={noop}
        />,
      ),
    );
    // The same record in seconds runs to 60000, so the ruling must reach 1e5.
    expect(inSeconds).toContain('1e5');
  });

  it('rules the drawdown axis in feet when lengths are shown in feet', () => {
    const inFeet = texts(
      renderToStaticMarkup(
        <Sheet
          setup={setupSI()}
          params={{ T: 3e-3, S: 2e-4 }}
          timeLabel="time (min)"
          drawdownLabel="drawdown (ft)"
          timeUnit={MIN}
          lengthUnit={FOOT}
          onDrag={noop}
          onToggleReading={noop}
        />,
      ),
    );
    // 0.01 to 1 m is 0.033 to 3.3 ft, so the axis reaches 10 rather than 1.
    expect(inFeet).toContain('10');
  });
});

describe('the sheet renders without a DOM', () => {
  it('draws a marker for every plottable reading and a curve for every piezometer', () => {
    const setup = SAMPLES[0].setup;
    const markup = renderToStaticMarkup(
      <Sheet
        setup={setup}
        params={fit(setup).params}
        timeLabel="time (min)"
        drawdownLabel="drawdown (m)"
        timeUnit={MIN}
        lengthUnit={METRE}
        onDrag={noop}
        onToggleReading={noop}
      />,
    );
    const plottable = setup.piezometers.reduce(
      (n, p) => n + p.readings.filter((d) => d.t > 0 && d.s > 0).length,
      0,
    );
    // Circles for the first piezometer, squares for the second.
    const markers = (markup.match(/<circle /g)?.length ?? 0) + (markup.match(/<rect /g)?.length ?? 0);
    expect(markers).toBeGreaterThanOrEqual(plottable);
    // Two model curves, each drawn twice: a fat invisible grab stroke and the line.
    expect(markup.match(/stroke="#?var\(--model\)"|stroke="var\(--model\)"/g)?.length).toBe(2);
  });

  it('shows an invitation and no curve when there is nothing to plot', () => {
    const empty: TestSetup = {
      Q: 1000 / 86400,
      model: 'theis',
      piezometers: [{ id: 'a', label: 'A', r: 30, readings: [] }],
    };
    const markup = renderToStaticMarkup(
      <Sheet
        setup={empty}
        params={{ T: 1e-3, S: 1e-4 }}
        timeLabel="time (min)"
        drawdownLabel="drawdown (m)"
        timeUnit={MIN}
        lengthUnit={METRE}
        onDrag={noop}
        onToggleReading={noop}
      />,
    );
    expect(markup).toContain('Paste time and drawdown readings');
    expect(markup).not.toContain('var(--model)');
  });

  it('never emits a NaN coordinate, which silently blanks an SVG', () => {
    const hostile: TestSetup = {
      Q: 0,
      model: 'theis',
      piezometers: [
        {
          id: 'a',
          label: 'A',
          r: 0,
          readings: [
            { t: 0, s: 0 },
            { t: -1, s: -1 },
            { t: Number.NaN, s: 1 },
            { t: 60, s: Number.NaN },
            { t: 600, s: 0.5 },
          ],
        },
      ],
    };
    const markup = renderToStaticMarkup(
      <Sheet
        setup={hostile}
        params={{ T: Number.NaN, S: Number.NaN }}
        timeLabel="time (min)"
        drawdownLabel="drawdown (m)"
        timeUnit={MIN}
        lengthUnit={METRE}
        onDrag={noop}
        onToggleReading={noop}
      />,
    );
    expect(markup).not.toMatch(/="NaN"/);
    expect(markup).not.toContain('NaN');
  });
});

describe('the diagnostic strips render without a DOM', () => {
  it('reports a derivative plateau for a well-behaved record', () => {
    const setup = SAMPLES[1].setup; // synthetic confined
    const markup = renderToStaticMarkup(
      <Diagnostic
        setup={setup}
        params={fit(setup).params}
        transmissivityUnit="m2/d"
        timeUnit={MIN}
        lengthUnit={METRE}
      />,
    );
    expect(markup).toContain('without any curve fitting');
    expect(markup).not.toContain('NaN');
  });

  it('says so plainly rather than drawing an empty box when there is too little data', () => {
    const thin: TestSetup = {
      Q: 1000 / 86400,
      model: 'theis',
      piezometers: [{ id: 'a', label: 'A', r: 30, readings: [{ t: 60, s: 0.1 }] }],
    };
    const markup = renderToStaticMarkup(
      <Diagnostic
        setup={thin}
        params={{ T: 1e-3, S: 1e-4 }}
        transmissivityUnit="m2/d"
        timeUnit={MIN}
        lengthUnit={METRE}
      />,
    );
    expect(markup).toContain('Not enough readings');
  });
});
