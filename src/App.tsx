// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Diagnostic } from './components/Diagnostic';
import { Rail } from './components/Rail';
import { Readout, type ParamSource } from './components/Readout';
import { Sheet } from './components/Sheet';
import { fit, seedParams } from './engine/fit';
import { SAMPLES } from './engine/samples';
import type { FitResult, Params, TestSetup } from './engine/types';
import {
  DISCHARGE_UNITS,
  findUnit,
  LENGTH_UNITS,
  TIME_UNITS,
  toBase,
} from './engine/units';
import {
  clearLocal,
  defaultState,
  hashToState,
  loadLocal,
  saveLocal,
  stateToHash,
  type AppState,
} from './store/state';

export default function App() {
  const [state, setState] = useState<AppState>(() => loadLocal() ?? defaultState());
  const [result, setResult] = useState<FitResult | null>(null);
  const [manual, setManual] = useState<Params | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // A link, if there is one, wins over whatever was left in localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (window.location.hash.length > 1) {
        const fromLink = await hashToState(window.location.hash);
        if (fromLink && !cancelled) {
          setState(fromLink);
          setManual(fromLink.manual);
        }
      }
      if (!cancelled) setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (restored) saveLocal({ ...state, manual });
  }, [state, manual, restored]);

  /** Everything the engine sees is metres and seconds. This is the only crossing point. */
  const setup: TestSetup = useMemo(() => {
    const lengthUnit = findUnit(LENGTH_UNITS, state.units.length);
    const timeUnit = findUnit(TIME_UNITS, state.units.time);
    const dischargeUnit = findUnit(DISCHARGE_UNITS, state.units.discharge);
    return {
      Q: toBase(state.Q, dischargeUnit),
      model: state.model,
      pumpingDuration: toBase(state.pumpingDuration, timeUnit),
      piezometers: state.piezometers.map((p) => ({
        ...p,
        r: toBase(p.r, lengthUnit),
        readings: p.readings.map((d) => ({
          t: toBase(d.t, timeUnit),
          s: toBase(d.s, lengthUnit),
          excluded: d.excluded,
        })),
      })),
    };
  }, [state]);

  const readingCount = setup.piezometers.reduce(
    (n, p) => n + p.readings.filter((d) => !d.excluded && d.t > 0).length,
    0,
  );
  const canFit = readingCount >= 3 && state.Q > 0;

  // Refitting whenever anything changes would fight with dragging, so a fit is
  // only ever produced by pressing the button. Editing data clears the old one
  // rather than leaving a stale answer on screen.
  useEffect(() => {
    setResult(null);
  }, [setup]);

  const runFit = useCallback(() => {
    const next = fit(setup);
    setResult(next);
    setManual(null);
  }, [setup]);

  const params: Params = useMemo(() => {
    if (manual) return manual;
    if (result && Number.isFinite(result.params.T)) return result.params;
    return seedParams(setup);
  }, [manual, result, setup]);

  const source: ParamSource = manual
    ? 'manual'
    : result && Number.isFinite(result.params.T)
      ? 'fit'
      : 'seed';

  const loadSample = (id: string) => {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    const timeUnit = findUnit(TIME_UNITS, 'min');
    setState({
      v: 1,
      title: sample.name,
      Q: sample.setup.Q * 86400,
      model: sample.setup.model,
      pumpingDuration: 840,
      units: { length: 'm', time: 'min', discharge: 'm3/d', transmissivity: 'm2/d' },
      piezometers: sample.setup.piezometers.map((p) => ({
        ...p,
        readings: p.readings.map((d) => ({ t: d.t / timeUnit.toBase, s: d.s })),
      })),
      manual: null,
    });
    setManual(null);
    setResult(null);
  };

  const share = async () => {
    const hash = await stateToHash({ ...state, manual });
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    window.history.replaceState(null, '', `#${hash}`);
    try {
      await navigator.clipboard.writeText(url);
      setShareNote(`Link copied. ${url.length} characters.`);
    } catch {
      setShareNote('Clipboard is blocked here, but the address bar now holds the full link.');
    }
  };

  const startOver = () => {
    clearLocal();
    window.history.replaceState(null, '', window.location.pathname);
    setState(defaultState());
    setManual(null);
    setResult(null);
    setShareNote(null);
  };

  const toggleReading = (piezometerId: string, index: number) => {
    setState((s) => ({
      ...s,
      piezometers: s.piezometers.map((p) =>
        p.id === piezometerId
          ? {
              ...p,
              readings: p.readings.map((d, i) => (i === index ? { ...d, excluded: !d.excluded } : d)),
            }
          : p,
      ),
    }));
  };

  const sample = SAMPLES.find((s) => s.name === state.title);
  const timeLabel = `time since pumping ${state.model === 'recovery' ? 'stopped' : 'started'} (${
    findUnit(TIME_UNITS, state.units.time).label
  })`;
  const drawdownLabel = `${state.model === 'recovery' ? 'residual drawdown' : 'drawdown'} (${
    findUnit(LENGTH_UNITS, state.units.length).label
  })`;

  return (
    <div className="app">
      <header className="masthead">
        <h1 className="wordmark">Clepsydra</h1>
        <span className="tagline">aquifer test analysis · runs entirely in this browser</span>
        <span className="masthead-spacer" />
        <span className="tagline">{state.title || 'Untitled test'}</span>
      </header>

      <Rail
        state={state}
        onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
        onLoadSample={loadSample}
        onAutoMatch={runFit}
        onShare={share}
        onClear={startOver}
        canFit={canFit}
        shareNote={shareNote}
      />

      <main className="stage">
        <div className="sheet-wrap">
          <Sheet
            setup={setup}
            params={params}
            timeLabel={timeLabel}
            drawdownLabel={drawdownLabel}
            timeUnit={findUnit(TIME_UNITS, state.units.time)}
            lengthUnit={findUnit(LENGTH_UNITS, state.units.length)}
            onDrag={setManual}
            onToggleReading={toggleReading}
          />
        </div>

        <div className="sheet-caption">
          <span className="key">
            <span className="key-swatch" style={{ borderTopColor: 'var(--observed)' }} />
            measured
          </span>
          <span className="key">
            <span className="key-swatch" style={{ borderTopColor: 'var(--model)' }} />
            model
          </span>
          <span className="key">
            <span className="key-swatch" style={{ borderTopColor: 'var(--derivative)' }} />
            derivative
          </span>
          <span className="key">
            <span className="key-swatch" style={{ borderTopColor: 'var(--misfit)' }} />
            misfit
          </span>
          <span className="key">
            <span className="key-swatch" style={{ borderTopColor: 'var(--excluded)' }} />
            excluded
          </span>
          <span>Shape marks which piezometer. Click a reading to drop it from the fit.</span>
        </div>

        <Readout
          setup={setup}
          params={params}
          result={result}
          source={source}
          transmissivityUnit={state.units.transmissivity}
        />

        <Diagnostic
          setup={setup}
          params={params}
          transmissivityUnit={state.units.transmissivity}
          timeUnit={findUnit(TIME_UNITS, state.units.time)}
          lengthUnit={findUnit(LENGTH_UNITS, state.units.length)}
        />

        {sample && (
          <p className="provenance">
            <b>{sample.synthetic ? 'Synthetic data.' : 'Real field data.'}</b> {sample.provenance}
            {sample.published ? ` ${sample.published}` : ''}
          </p>
        )}

        <p className="provenance">
          Clepsydra is free software under the GNU AGPL v3. It is not certified or approved by any
          agency or trade body, and nothing it prints is a substitute for a hydrogeologist reading
          the plot.
        </p>
      </main>
    </div>
  );
}
