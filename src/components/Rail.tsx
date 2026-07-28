// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';
import { MODEL_LABELS, MODEL_NOTES } from '../engine/models';
import { formatReadings, parseReadings } from '../engine/parse';
import type { ModelId, Piezometer } from '../engine/types';
import {
  DISCHARGE_UNITS,
  LENGTH_UNITS,
  TIME_UNITS,
  TRANSMISSIVITY_UNITS,
  type Unit,
} from '../engine/units';
import { SAMPLES } from '../engine/samples';
import type { AppState } from '../store/state';

const MODELS: ModelId[] = ['theis', 'cooper-jacob', 'hantush', 'recovery'];
const MARKER_GLYPH = ['○', '□', '△', '◇'];

interface Props {
  state: AppState;
  onChange: (next: Partial<AppState>) => void;
  onLoadSample: (id: string) => void;
  onAutoMatch: () => void;
  onShare: () => void;
  onClear: () => void;
  canFit: boolean;
  shareNote: string | null;
}

export function Rail({
  state,
  onChange,
  onLoadSample,
  onAutoMatch,
  onShare,
  onClear,
  canFit,
  shareNote,
}: Props) {
  const timeLabel = unitLabel(TIME_UNITS, state.units.time);
  const lengthLabel = unitLabel(LENGTH_UNITS, state.units.length);

  const setPiezometer = (index: number, patch: Partial<Piezometer>) => {
    const next = state.piezometers.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange({ piezometers: next });
  };

  const addPiezometer = () => {
    const n = state.piezometers.length + 1;
    onChange({
      piezometers: [
        ...state.piezometers,
        { id: `p${Date.now()}`, label: `OBS-${n}`, r: 30, readings: [] },
      ],
    });
  };

  const removePiezometer = (index: number) => {
    onChange({ piezometers: state.piezometers.filter((_, i) => i !== index) });
  };

  return (
    <div className="rail">
      <section className="section">
        <h2 className="section-title">Test</h2>

        <div className="field">
          <label htmlFor="title">Name</label>
          <input
            id="title"
            value={state.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Untitled test"
          />
        </div>

        <div className="field">
          <label htmlFor="Q">Discharge</label>
          <input
            id="Q"
            type="number"
            step="any"
            value={state.Q}
            onChange={(e) => onChange({ Q: Number(e.target.value) })}
          />
          <select
            aria-label="Discharge unit"
            value={state.units.discharge}
            onChange={(e) => onChange({ units: { ...state.units, discharge: e.target.value } })}
          >
            {DISCHARGE_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        {state.model === 'recovery' && (
          <div className="field">
            <label htmlFor="tp">Pumped for</label>
            <input
              id="tp"
              type="number"
              step="any"
              value={state.pumpingDuration}
              onChange={(e) => onChange({ pumpingDuration: Number(e.target.value) })}
            />
            <span className="result-note">{timeLabel}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="ulen">Length in</label>
          <select
            id="ulen"
            value={state.units.length}
            onChange={(e) => onChange({ units: { ...state.units, length: e.target.value } })}
          >
            {LENGTH_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <label htmlFor="utime" style={{ flex: '0 0 auto', paddingLeft: 8 }}>
            time in
          </label>
          <select
            id="utime"
            value={state.units.time}
            onChange={(e) => onChange({ units: { ...state.units, time: e.target.value } })}
          >
            {TIME_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="utrans">Report T in</label>
          <select
            id="utrans"
            value={state.units.transmissivity}
            onChange={(e) => onChange({ units: { ...state.units, transmissivity: e.target.value } })}
          >
            {TRANSMISSIVITY_UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        <p className="hint">
          Changing a unit reinterprets the numbers you have typed, it does not convert them. Set
          the units to match your field sheet before entering readings.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">Model</h2>
        <div className="model-choice">
          {MODELS.map((id) => (
            <label key={id} className="model-option" data-on={state.model === id}>
              <input
                type="radio"
                name="model"
                checked={state.model === id}
                onChange={() => onChange({ model: id })}
              />
              <span>
                <b>{MODEL_LABELS[id]}</b>
                <span>{MODEL_NOTES[id]}</span>
              </span>
            </label>
          ))}
        </div>
        <button className="primary" style={{ marginTop: 12 }} onClick={onAutoMatch} disabled={!canFit}>
          Match the curve
        </button>
        <p className="hint">
          Or drag the curve on the plot. Sliding it up and down changes transmissivity; sliding it
          sideways changes storativity. Arrow keys nudge it when it has focus.
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">Piezometers</h2>
        {state.piezometers.map((p, i) => (
          <PiezometerEditor
            key={p.id}
            index={i}
            piezometer={p}
            timeLabel={timeLabel}
            lengthLabel={lengthLabel}
            onChange={(patch) => setPiezometer(i, patch)}
            onRemove={state.piezometers.length > 1 ? () => removePiezometer(i) : null}
          />
        ))}
        <div className="button-row" style={{ marginTop: 12 }}>
          <button onClick={addPiezometer}>Add piezometer</button>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Session</h2>
        <div className="field">
          <label htmlFor="sample">Load example</label>
          <select
            id="sample"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) onLoadSample(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">Choose…</option>
            {SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="button-row">
          <button onClick={onShare}>Copy link</button>
          <button onClick={onClear}>Start over</button>
        </div>
        {shareNote && <p className="hint">{shareNote}</p>}
        <p className="hint">
          Your readings stay in this browser. The link carries the whole analysis in its fragment,
          which is never sent to a server.
        </p>
      </section>
    </div>
  );
}

function PiezometerEditor({
  index,
  piezometer,
  timeLabel,
  lengthLabel,
  onChange,
  onRemove,
}: {
  index: number;
  piezometer: Piezometer;
  timeLabel: string;
  lengthLabel: string;
  onChange: (patch: Partial<Piezometer>) => void;
  onRemove: (() => void) | null;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const apply = () => {
    if (draft === null) return;
    const { rows, skipped, signFlipped } = parseReadings(draft);
    onChange({ readings: rows.map((r) => ({ t: r.t, s: r.s })) });
    const parts: string[] = [`Read ${rows.length} readings.`];
    if (signFlipped) parts.push('The drawdown column was negative, so it was flipped to positive.');
    if (skipped.length) {
      parts.push(
        `Skipped ${skipped.length} line${skipped.length === 1 ? '' : 's'}: ` +
          skipped
            .slice(0, 3)
            .map((s) => `line ${s.line} (${s.reason})`)
            .join(', ') +
          (skipped.length > 3 ? '…' : ''),
      );
    }
    setNote(parts.join(' '));
    setDraft(null);
  };

  const toggle = (i: number) => {
    onChange({
      readings: piezometer.readings.map((d, j) =>
        j === i ? { ...d, excluded: !d.excluded } : d,
      ),
    });
  };

  return (
    <div>
      <div className="piezo-head">
        <span className="piezo-name">
          <span aria-hidden="true" style={{ color: 'var(--observed)' }}>
            {MARKER_GLYPH[index % MARKER_GLYPH.length]}
          </span>
          <input
            aria-label="Piezometer name"
            value={piezometer.label}
            onChange={(e) => onChange({ label: e.target.value })}
            style={{ width: 92, flex: '0 0 auto' }}
          />
        </span>
        {onRemove && (
          <button onClick={onRemove} title="Remove this piezometer">
            Remove
          </button>
        )}
      </div>

      <div className="field">
        <label htmlFor={`r-${piezometer.id}`}>Distance</label>
        <input
          id={`r-${piezometer.id}`}
          type="number"
          step="any"
          value={piezometer.r}
          onChange={(e) => onChange({ r: Number(e.target.value) })}
        />
        <span className="result-note">{lengthLabel} from the pumped well</span>
      </div>

      <textarea
        aria-label={`Readings for ${piezometer.label}`}
        spellCheck={false}
        value={draft ?? formatReadings(piezometer.readings)}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={`time (${timeLabel})\tdrawdown (${lengthLabel})`}
      />
      <div className="button-row" style={{ marginTop: 6 }}>
        <button onClick={apply} disabled={draft === null}>
          Apply readings
        </button>
        {draft !== null && <button onClick={() => setDraft(null)}>Discard edit</button>}
      </div>
      {note && <p className="hint">{note}</p>}

      {piezometer.readings.length > 0 && (
        <div className="readings" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>t ({timeLabel})</th>
                <th>s ({lengthLabel})</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {piezometer.readings.map((d, i) => (
                <tr key={i} data-excluded={Boolean(d.excluded)}>
                  <td>{d.t}</td>
                  <td>{d.s}</td>
                  <td>
                    <button
                      onClick={() => toggle(i)}
                      title={d.excluded ? 'Include in the fit' : 'Exclude from the fit'}
                      aria-label={d.excluded ? 'Include in the fit' : 'Exclude from the fit'}
                    >
                      {d.excluded ? '+' : '×'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function unitLabel(list: Unit[], id: string): string {
  return list.find((u) => u.id === id)?.label ?? id;
}
