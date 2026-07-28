// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Render harness for offline inspection.
 *
 * There is no browser in the environment this was built in, so the components
 * are rendered with react-dom/server and the resulting SVG is written to disk
 * with the CSS custom properties resolved to literal colours, which is the
 * only way a rasteriser will see them.
 *
 * This verifies real component output: scales, ruling, curve geometry, marker
 * placement, colour assignment. It does NOT verify the HTML layout around
 * them, focus rings, pointer dragging, or anything CSS grid does.
 *
 * Not part of the build. Run with:
 *   npx esbuild tools/render-screens.tsx --bundle --platform=node --format=esm \
 *     --external:react --external:react-dom --outfile=/tmp/render.mjs && node /tmp/render.mjs
 */

import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sheet } from '../src/components/Sheet';
import { Diagnostic } from '../src/components/Diagnostic';
import { fit } from '../src/engine/fit';
import { hantushJacob } from '../src/engine/models';
import { SAMPLES } from '../src/engine/samples';
import type { TestSetup } from '../src/engine/types';
import { findUnit, LENGTH_UNITS, TIME_UNITS } from '../src/engine/units';

const MIN = findUnit(TIME_UNITS, 'min');
const METRE = findUnit(LENGTH_UNITS, 'm');

const TOKENS: Record<string, string> = {
  '--paper': '#eef0ea',
  '--paper-sunk': '#e5e8e0',
  '--paper-edge': '#d6dbd2',
  '--rule': '#b4c1b7',
  '--rule-major': '#8b9c90',
  '--ink': '#16201a',
  '--ink-soft': '#5d6a62',
  '--ink-faint': '#8a958e',
  '--observed': '#0b5563',
  '--model': '#4a3aa8',
  '--derivative': '#8a6a00',
  '--misfit': '#a32020',
  '--excluded': '#9aa69e',
  '--mono': 'DejaVu Sans Mono, monospace',
};

function resolve(markup: string): string {
  let out = markup;
  for (const [name, value] of Object.entries(TOKENS)) {
    out = out.split(`var(${name})`).join(value);
  }
  return out;
}

function writeSvg(name: string, markup: string) {
  // Extract each top-level <svg> and give it a paper backdrop so the ruling reads.
  const svgs = markup.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
  svgs.forEach((svg, i) => {
    const withBg = svg.replace(
      /(<svg[^>]*>)/,
      `$1<rect x="0" y="0" width="100%" height="100%" fill="${TOKENS['--paper']}"/>`,
    );
    const file = svgs.length > 1 ? `/tmp/shots/${name}-${i + 1}.svg` : `/tmp/shots/${name}.svg`;
    writeFileSync(file, resolve(withBg));
    console.log('wrote', file);
  });
}

const noop = () => {};

// 1. The real Oude Korendijk test, both piezometers, automatically matched.
const korendijk = SAMPLES.find((s) => s.id === 'oude-korendijk')!.setup;
const korendijkFit = fit(korendijk);
console.log(
  'Oude Korendijk fit: T =',
  (korendijkFit.params.T * 86400).toFixed(1),
  'm2/d, S =',
  korendijkFit.params.S.toExponential(3),
  ', rmse =',
  korendijkFit.rmse.toFixed(4),
);
writeSvg(
  'sheet-korendijk',
  renderToStaticMarkup(
    <Sheet
      setup={korendijk}
      params={korendijkFit.params}
      timeLabel="time since pumping started (min)"
      drawdownLabel="drawdown (m)"
      timeUnit={MIN}
      lengthUnit={METRE}
      onDrag={noop}
      onToggleReading={noop}
    />,
  ),
);
writeSvg(
  'diagnostic-korendijk',
  renderToStaticMarkup(
    <Diagnostic
      setup={korendijk}
      params={korendijkFit.params}
      transmissivityUnit="m2/d"
      timeUnit={MIN}
      lengthUnit={METRE}
    />,
  ),
);

// 2. Empty state: no readings at all.
const empty: TestSetup = {
  Q: 1000 / 86400,
  model: 'theis',
  piezometers: [{ id: 'a', label: 'OBS-1', r: 30, readings: [] }],
};
writeSvg(
  'sheet-empty',
  renderToStaticMarkup(
    <Sheet
      setup={empty}
      params={{ T: 1e-3, S: 1e-4 }}
      timeLabel="time since pumping started (min)"
      drawdownLabel="drawdown (m)"
      timeUnit={MIN}
      lengthUnit={METRE}
      onDrag={noop}
      onToggleReading={noop}
    />,
  ),
);

// 3. A leaky response, so the Hantush curve family is visible flattening off.
const leakyReadings = [];
for (let i = 0; i < 34; i++) {
  const minutes = 10 ** ((Math.log10(2880) * i) / 33);
  const t = minutes * 60;
  leakyReadings.push({ t, s: hantushJacob(1000 / 86400, 300 / 86400, 2e-4, 0.4, 50, t) });
}
const leaky: TestSetup = {
  Q: 1000 / 86400,
  model: 'hantush',
  piezometers: [{ id: 'l', label: 'OBS-L', r: 50, readings: leakyReadings }],
};
const leakyFit = fit(leaky);
console.log(
  'Leaky fit: T =',
  (leakyFit.params.T * 86400).toFixed(1),
  'm2/d, r/B =',
  leakyFit.params.rOverB?.toFixed(3),
);
writeSvg(
  'sheet-leaky',
  renderToStaticMarkup(
    <Sheet
      setup={leaky}
      params={leakyFit.params}
      timeLabel="time since pumping started (min)"
      drawdownLabel="drawdown (m)"
      timeUnit={MIN}
      lengthUnit={METRE}
      onDrag={noop}
      onToggleReading={noop}
    />,
  ),
);

// 4. Excluded readings, to check the grey encoding and the misfit strip.
const withExclusions: TestSetup = {
  ...korendijk,
  piezometers: korendijk.piezometers.map((p, pi) => ({
    ...p,
    readings: p.readings.map((d, i) => ({ ...d, excluded: pi === 0 && i < 8 })),
  })),
};
writeSvg(
  'sheet-excluded',
  renderToStaticMarkup(
    <Sheet
      setup={withExclusions}
      params={fit(withExclusions).params}
      timeLabel="time since pumping started (min)"
      drawdownLabel="drawdown (m)"
      timeUnit={MIN}
      lengthUnit={METRE}
      onDrag={noop}
      onToggleReading={noop}
    />,
  ),
);
