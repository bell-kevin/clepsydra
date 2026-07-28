// SPDX-License-Identifier: AGPL-3.0-only

import { useMemo } from 'react';
import { logTicks, makeLogScale, niceLogDomain } from '../chart/scale';
import { bourdetDerivative, plateauTransmissivity } from '../engine/derivative';
import { residualSeries } from '../engine/fit';
import type { Params, TestSetup } from '../engine/types';
import { fromBase, findUnit, TRANSMISSIVITY_UNITS, sig, type Unit } from '../engine/units';

/**
 * Two narrow strips under the sheet, both answering "should I believe this?"
 *
 * DERIVATIVE  ds/d(ln t). A Theis response flattens onto a plateau at
 *             Q/(4 pi T) once radial flow is established. If the late data are
 *             not flat, the aquifer is not doing what the model assumes, and no
 *             amount of curve fitting fixes that. The transmissivity implied by
 *             the plateau is printed next to the fitted one: two numbers from
 *             two methods that share no arithmetic.
 *
 * MISFIT      Model minus measurement, on a linear scale, in metres. Structure
 *             in the residuals (a run of same-sign points) means the wrong
 *             model, not noisy data.
 */

const W = 900;
const H = 128;
const PAD = { top: 14, right: 26, bottom: 26, left: 66 };

interface Props {
  setup: TestSetup;
  params: Params;
  transmissivityUnit: string;
  /** SI value of one display unit, so dividing converts for the plot. */
  timeUnit: Unit;
  lengthUnit: Unit;
}

export function Diagnostic({ setup, params, transmissivityUnit, timeUnit, lengthUnit }: Props) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const tUnit = findUnit(TRANSMISSIVITY_UNITS, transmissivityUnit);

  const { derivativeSeries, plateau } = useMemo(() => {
    const merged = setup.piezometers[0]?.readings ?? [];
    const d = bourdetDerivative(merged.filter((x) => !x.excluded));
    return { derivativeSeries: d, plateau: plateauTransmissivity(d, setup.Q) };
  }, [setup]);

  const residuals = useMemo(
    () => (Number.isFinite(params.T) ? residualSeries(setup, params) : []),
    [setup, params],
  );

  // The derivative is computed in SI, then divided for display. Its horizontal
  // position is a time and its value is a length per natural log cycle, so both
  // need converting or the axis ruling contradicts the labels.
  const times = derivativeSeries.map((d) => d.t / timeUnit.toBase);
  const dValues = derivativeSeries
    .map((d) => d.d / lengthUnit.toBase)
    .filter((v) => v > 0);
  const [tMin, tMax] = niceLogDomain(times.length ? times : [1, 1000]);
  const [dMin, dMax] = niceLogDomain(dValues.length ? dValues : [0.001, 1]);
  const x = makeLogScale(tMin, tMax, PAD.left, PAD.left + plotW);
  const y = makeLogScale(dMin, dMax, PAD.top + plotH, PAD.top);

  const finiteResiduals = residuals.filter((r) => Number.isFinite(r.residual) && r.t > 0);
  const maxAbs = finiteResiduals.length
    ? Math.max(...finiteResiduals.map((r) => Math.abs(r.residual)))
    : 1;

  return (
    <div className="sheet-wrap" style={{ paddingTop: 0 }}>
      <svg className="sheet" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Log-derivative diagnostic">
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="var(--paper-sunk)" stroke="var(--rule-major)" />
        <g aria-hidden="true">
          {logTicks(tMin, tMax).map((tick) => (
            <line
              key={`d${tick.value}`}
              x1={x.toPx(tick.value)}
              x2={x.toPx(tick.value)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={tick.major ? 'var(--rule-major)' : 'var(--rule)'}
              strokeWidth={tick.major ? 1 : 0.5}
            />
          ))}
        </g>
        {logTicks(dMin, dMax).map((tick) => (
          <line
            key={`dh${tick.value}`}
            y1={y.toPx(tick.value)}
            y2={y.toPx(tick.value)}
            x1={PAD.left}
            x2={PAD.left + plotW}
            stroke={tick.major ? 'var(--rule-major)' : 'var(--rule)'}
            strokeWidth={tick.major ? 1 : 0.5}
          />
        ))}
        {logTicks(dMin, dMax)
          .filter((tk) => tk.major)
          .map((tk) => (
            <text
              key={`dl${tk.value}`}
              x={PAD.left - 6}
              y={y.toPx(tk.value) + 3}
              textAnchor="end"
              fontSize={9}
              fill="var(--ink-soft)"
            >
              {tk.value >= 1 ? tk.value : `1e${Math.round(Math.log10(tk.value))}`}
            </text>
          ))}
        {plateau && (
          <line
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={y.toPx(plateau.plateau / lengthUnit.toBase)}
            y2={y.toPx(plateau.plateau / lengthUnit.toBase)}
            stroke="var(--derivative)"
            strokeWidth={1}
            strokeDasharray="5 4"
          />
        )}
        {derivativeSeries.map((d, i) =>
          d.d > 0 ? (
            <circle
              key={i}
              cx={x.toPx(d.t / timeUnit.toBase)}
              cy={y.toPx(d.d / lengthUnit.toBase)}
              r={2.4}
              fill="var(--derivative)"
            />
          ) : null,
        )}
        <text x={PAD.left + 6} y={PAD.top + 12} fontSize={10} fill="var(--derivative)" letterSpacing="0.1em">
          {`ds/dlnt (${lengthUnit.label})`}
        </text>
      </svg>

      <svg className="sheet" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Residual misfit">
        <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="var(--paper-sunk)" stroke="var(--rule-major)" />
        <line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={PAD.top + plotH / 2}
          y2={PAD.top + plotH / 2}
          stroke="var(--rule-major)"
        />
        {finiteResiduals.map((r, i) => {
          const px = x.toPx(r.t / timeUnit.toBase);
          const py = PAD.top + plotH / 2 - (r.residual / (maxAbs * 1.15)) * (plotH / 2);
          // maxAbs is already in SI, so the ratio is unit-free and safe here.
          if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
          return (
            <line
              key={i}
              x1={px}
              x2={px}
              y1={PAD.top + plotH / 2}
              y2={py}
              stroke={r.excluded ? 'var(--excluded)' : 'var(--misfit)'}
              strokeWidth={1.5}
            />
          );
        })}
        <text x={PAD.left + 6} y={PAD.top + 12} fontSize={10} fill="var(--misfit)" letterSpacing="0.1em">
          misfit, model minus measured
        </text>
        <text x={PAD.left - 8} y={PAD.top + plotH / 2 + 4} textAnchor="end" fontSize={10} fill="var(--ink-soft)">
          0
        </text>
        <text x={PAD.left + plotW} y={H - 8} textAnchor="end" fontSize={10} fill="var(--ink-soft)">
          {`max |misfit| ${sig(maxAbs / lengthUnit.toBase, 2)} ${lengthUnit.label}`}
        </text>
      </svg>

      <p className="result-note" style={{ marginTop: 4 }}>
        {plateau ? (
          <>
            The flat part of the derivative puts transmissivity at{' '}
            <b>{sig(fromBase(plateau.T, tUnit))} {tUnit.label}</b>, worked out without any curve fitting.{' '}
            {plateau.spread > 0.6
              ? 'The late derivative is not very flat, so treat that number, and the whole Theis assumption, with suspicion.'
              : 'It should sit close to the fitted value below; a large gap means the model is fighting the data.'}
          </>
        ) : (
          <>Not enough readings on the first piezometer to compute a derivative plateau.</>
        )}
      </p>
    </div>
  );
}
