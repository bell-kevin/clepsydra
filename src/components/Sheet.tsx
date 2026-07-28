// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { logTicks, makeLogScale, niceLogDomain, translateParams } from '../chart/scale';
import { drawdown } from '../engine/models';
import type { Params, TestSetup } from '../engine/types';
import type { Unit } from '../engine/units';

/**
 * THE SHEET.
 *
 * For most of the twentieth century an aquifer test was interpreted by
 * plotting the field data on log-log paper, laying a sheet of tracing paper
 * carrying the theoretical type curve over the top, and sliding it around
 * until the two agreed. The parameters were then read off the offset between
 * the two sets of axes.
 *
 * That method survives here as the actual interaction, because it is not a
 * skeuomorph: on log-log paper a translation IS a change of parameters, exactly
 * and without approximation. Sliding the curve up divides transmissivity;
 * sliding it right multiplies storativity. Anyone who has done this by hand
 * already knows how to use it, and anyone who has not learns what the
 * parameters actually do to the curve, which no numeric input box teaches.
 *
 * Automatic curve matching is a button, not the only route.
 */

const W = 900;
const H = 560;
const PAD = { top: 22, right: 26, bottom: 46, left: 66 };

/** Shape encodes which piezometer. Colour is reserved for what a thing means. */
const MARKERS = ['circle', 'square', 'triangle', 'diamond'] as const;

interface Props {
  setup: TestSetup;
  params: Params;
  timeLabel: string;
  drawdownLabel: string;
  /**
   * The engine works in metres and seconds, but the plot has to be ruled in
   * whatever the field sheet used, or the axis labels are a lie. These are the
   * SI values of one display unit, so dividing by them converts for display.
   */
  timeUnit: Unit;
  lengthUnit: Unit;
  onDrag: (next: Params) => void;
  onToggleReading: (piezometerId: string, index: number) => void;
}

export function Sheet({
  setup,
  params,
  timeLabel,
  drawdownLabel,
  timeUnit,
  lengthUnit,
  onDrag,
  onToggleReading,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Colons from useId are legal in an id but awkward inside url(#...).
  const clipId = `plot-${useId().replace(/:/g, '')}`;
  const dragRef = useRef<{ x: number; y: number; T: number; S: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [shift, setShift] = useState<{ dh: number; dv: number } | null>(null);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const { xScale, yScale, hasData } = useMemo(() => {
    const times: number[] = [];
    const values: number[] = [];
    for (const p of setup.piezometers) {
      for (const d of p.readings) {
        if (d.t > 0 && Number.isFinite(d.t)) times.push(d.t / timeUnit.toBase);
        if (d.s > 0 && Number.isFinite(d.s)) values.push(d.s / lengthUnit.toBase);
      }
    }
    const [tMin, tMax] = niceLogDomain(times.length ? times : [1, 1000]);
    const [sMin, sMax] = niceLogDomain(values.length ? values : [0.01, 10]);
    return {
      xScale: makeLogScale(tMin, tMax, PAD.left, PAD.left + plotW),
      yScale: makeLogScale(sMin, sMax, PAD.top + plotH, PAD.top),
      hasData: times.length > 0 && values.length > 0,
    };
  }, [setup.piezometers, plotW, plotH, timeUnit, lengthUnit]);

  const curves = useMemo(() => {
    if (!Number.isFinite(params.T) || !Number.isFinite(params.S) || !hasData) return [];
    return setup.piezometers.map((p) => {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 220; i++) {
        const tDisplay = xScale.min * (xScale.max / xScale.min) ** (i / 220);
        const s = drawdown(setup, params, p.r, tDisplay * timeUnit.toBase) / lengthUnit.toBase;
        if (Number.isFinite(s) && s > 0) pts.push([xScale.toPx(tDisplay), yScale.toPx(s)]);
      }
      return { id: p.id, label: p.label, d: toPath(pts) };
    });
  }, [setup, params, xScale, yScale, hasData, timeUnit, lengthUnit]);

  const pointerToLocal = useCallback((event: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    };
  }, []);

  const startDrag = (event: React.PointerEvent) => {
    if (!Number.isFinite(params.T)) return;
    const local = pointerToLocal(event);
    dragRef.current = { x: local.x, y: local.y, T: params.T, S: params.S };
    setDragging(true);
    setShift({ dh: 0, dv: 0 });
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent) => {
    const origin = dragRef.current;
    if (!origin) return;
    const local = pointerToLocal(event);
    const pxPerDecadeY = Math.abs(yScale.perDecade);
    const dh = (local.x - origin.x) / xScale.perDecade;
    const dv = (origin.y - local.y) / pxPerDecadeY;
    setShift({ dh, dv });
    const moved = translateParams(origin.T, origin.S, dh, dv);
    onDrag({ ...params, ...moved });
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
    setShift(null);
  };

  const nudge = (event: React.KeyboardEvent) => {
    if (!Number.isFinite(params.T)) return;
    const step = event.shiftKey ? 0.1 : 0.02;
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = map[event.key];
    if (!delta) return;
    event.preventDefault();
    onDrag({ ...params, ...translateParams(params.T, params.S, delta[0], delta[1]) });
  };

  const xTicks = logTicks(xScale.min, xScale.max);
  const yTicks = logTicks(yScale.min, yScale.max);

  return (
    <svg
      ref={svgRef}
      className="sheet"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={
        Number.isFinite(params.T)
          ? `Log-log plot of drawdown against time. Type curve at transmissivity ${params.T.toPrecision(
              3,
            )} square metres per second, storativity ${params.S.toPrecision(3)}.`
          : 'Log-log plot of drawdown against time. No type curve is placed yet.'
      }
    >
      {/*
        The type curve is a mathematical object with no edges: Theis drawdown
        tends to zero as time tends to zero, so on log paper the curve descends
        forever. Without a clip it draws straight out of the plot box and over
        the axis labels. Clip it to the ruled area; the data markers are inside
        the domain by construction and are left alone so a reading sitting
        exactly on a decade is not sliced in half.
      */}
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      {/* graph paper */}
      <rect
        x={PAD.left}
        y={PAD.top}
        width={plotW}
        height={plotH}
        fill="var(--paper-sunk)"
        stroke="var(--rule-major)"
      />
      <g aria-hidden="true">
        {xTicks.map((tick) => (
          <line
            key={`vx${tick.value}`}
            x1={xScale.toPx(tick.value)}
            x2={xScale.toPx(tick.value)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke={tick.major ? 'var(--rule-major)' : 'var(--rule)'}
            strokeWidth={tick.major ? 1 : 0.5}
          />
        ))}
        {yTicks.map((tick) => (
          <line
            key={`hz${tick.value}`}
            y1={yScale.toPx(tick.value)}
            y2={yScale.toPx(tick.value)}
            x1={PAD.left}
            x2={PAD.left + plotW}
            stroke={tick.major ? 'var(--rule-major)' : 'var(--rule)'}
            strokeWidth={tick.major ? 1 : 0.5}
          />
        ))}
      </g>

      {/* axis labels, decades only */}
      <g fontSize={11} fill="var(--ink-soft)" fontFamily="var(--mono)">
        {xTicks
          .filter((t) => t.major)
          .map((tick) => (
            <text key={`xl${tick.value}`} x={xScale.toPx(tick.value)} y={PAD.top + plotH + 16} textAnchor="middle">
              {formatDecade(tick.value)}
            </text>
          ))}
        {yTicks
          .filter((t) => t.major)
          .map((tick) => (
            <text key={`yl${tick.value}`} x={PAD.left - 8} y={yScale.toPx(tick.value) + 4} textAnchor="end">
              {formatDecade(tick.value)}
            </text>
          ))}
        <text x={PAD.left + plotW / 2} y={H - 8} textAnchor="middle" fontSize={11} letterSpacing="0.18em">
          {timeLabel.toUpperCase()}
        </text>
        <text
          x={-(PAD.top + plotH / 2)}
          y={16}
          textAnchor="middle"
          transform="rotate(-90)"
          fontSize={11}
          letterSpacing="0.18em"
        >
          {drawdownLabel.toUpperCase()}
        </text>
      </g>

      {/* the tracing sheet, visible while it is being moved */}
      {dragging && (
        <g className="sheet-ghost" aria-hidden="true">
          <rect
            x={PAD.left + 4}
            y={PAD.top + 4}
            width={plotW - 8}
            height={plotH - 8}
            fill="var(--model)"
            fillOpacity={0.06}
            stroke="var(--model)"
            strokeOpacity={0.5}
            strokeDasharray="6 4"
          />
          {shift && (
            <text
              x={PAD.left + 14}
              y={PAD.top + 24}
              fontSize={11}
              fill="var(--model)"
              fontFamily="var(--mono)"
              letterSpacing="0.08em"
            >
              {`Δ time ${signed(shift.dh)} dec   Δ drawdown ${signed(shift.dv)} dec`}
            </text>
          )}
        </g>
      )}

      {/* model curves, one per piezometer */}
      <g
        className={`grab-curve${dragging ? ' dragging' : ''}`}
        tabIndex={0}
        role="slider"
        aria-label="Type curve position. Drag, or use the arrow keys, to match the curve to the data."
        aria-valuetext={
          Number.isFinite(params.T)
            ? `Transmissivity ${params.T.toPrecision(3)} square metres per second`
            : 'No type curve placed'
        }
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={nudge}
        clipPath={`url(#${clipId})`}
      >
        {curves.map((c) => (
          <g key={c.id}>
            {/* a wide invisible stroke so the curve is easy to grab */}
            <path d={c.d} fill="none" stroke="transparent" strokeWidth={22} />
            <path d={c.d} fill="none" stroke="var(--model)" strokeWidth={1.75} strokeLinejoin="round" />
          </g>
        ))}
      </g>

      {/* measured readings */}
      {setup.piezometers.map((p, pi) => (
        <g key={p.id}>
          {p.readings.map((d, i) => {
            if (!(d.t > 0) || !(d.s > 0)) return null;
            const tDisplay = d.t / timeUnit.toBase;
            const sDisplay = d.s / lengthUnit.toBase;
            const cx = xScale.toPx(tDisplay);
            const cy = yScale.toPx(sDisplay);
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
            return (
              <g
                key={`${p.id}-${i}`}
                onClick={() => onToggleReading(p.id, i)}
                style={{ cursor: 'pointer' }}
              >
                <title>{`${p.label}  t=${trim(tDisplay)} ${timeUnit.label}  s=${trim(sDisplay)} ${
                  lengthUnit.label
                }${d.excluded ? '  (excluded)' : ''} — click to ${d.excluded ? 'include' : 'exclude'}`}</title>
                {marker(MARKERS[pi % MARKERS.length], cx, cy, d.excluded ? 'var(--excluded)' : 'var(--observed)')}
              </g>
            );
          })}
        </g>
      ))}

      {!hasData && (
        <text
          x={PAD.left + plotW / 2}
          y={PAD.top + plotH / 2}
          textAnchor="middle"
          fontSize={13}
          fill="var(--ink-soft)"
          fontFamily="var(--mono)"
        >
          Paste time and drawdown readings to plot them.
        </text>
      )}
    </svg>
  );
}

function marker(kind: (typeof MARKERS)[number], cx: number, cy: number, colour: string) {
  const r = 3.6;
  const common = { fill: 'none', stroke: colour, strokeWidth: 1.5 };
  switch (kind) {
    case 'circle':
      return <circle cx={cx} cy={cy} r={r} {...common} />;
    case 'square':
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />;
    case 'triangle':
      return <polygon points={`${cx},${cy - r * 1.2} ${cx + r * 1.1},${cy + r} ${cx - r * 1.1},${cy + r}`} {...common} />;
    case 'diamond':
      return (
        <polygon
          points={`${cx},${cy - r * 1.3} ${cx + r * 1.3},${cy} ${cx},${cy + r * 1.3} ${cx - r * 1.3},${cy}`}
          {...common}
        />
      );
  }
}

function toPath(points: Array<[number, number]>): string {
  if (points.length === 0) return '';
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
}

function formatDecade(value: number): string {
  if (value >= 1 && value < 100000) return String(value);
  const exp = Math.round(Math.log10(value));
  return `1e${exp}`;
}

const signed = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

const trim = (v: number): string => Number(v.toPrecision(6)).toString();
