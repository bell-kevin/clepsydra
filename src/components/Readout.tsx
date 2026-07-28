// SPDX-License-Identifier: AGPL-3.0-only

import type { FitResult, Params, TestSetup } from '../engine/types';
import { findUnit, fromBase, sig, TRANSMISSIVITY_UNITS } from '../engine/units';

/**
 * The answer, and everything needed to distrust it.
 *
 * Uncertainty is reported as a multiplicative factor rather than a plus-or-minus,
 * because T and S are fitted in log space and genuinely behave that way: a
 * storativity is uncertain by a factor of two, not by 0.0001.
 */

interface Props {
  setup: TestSetup;
  params: Params;
  result: FitResult | null;
  manual: boolean;
  transmissivityUnit: string;
}

export function Readout({ setup, params, result, manual, transmissivityUnit }: Props) {
  const tUnit = findUnit(TRANSMISSIVITY_UNITS, transmissivityUnit);
  const showT = Number.isFinite(params.T);
  const errors = manual ? {} : (result?.errors ?? {});

  return (
    <>
      <div className="readout">
        <div>
          <div className="result-label">Transmissivity</div>
          <div className="result-value">
            {showT ? sig(fromBase(params.T, tUnit)) : '—'}
            <span className="result-unit">{tUnit.label}</span>
          </div>
          <div className="result-note">{factorNote(errors.T?.factor95)}</div>
        </div>

        <div>
          <div className="result-label">Storativity</div>
          <div className="result-value">{showT ? sig(params.S) : '—'}</div>
          <div className="result-note">{factorNote(errors.S?.factor95)}</div>
        </div>

        {setup.model === 'hantush' && (
          <div>
            <div className="result-label">Leakage r/B</div>
            <div className="result-value">{params.rOverB ? sig(params.rOverB) : '—'}</div>
            <div className="result-note">{factorNote(errors.rOverB?.factor95)}</div>
          </div>
        )}

        <div>
          <div className="result-label">Fit</div>
          <div className="result-value" style={{ color: 'var(--misfit)' }}>
            {result ? sig(result.rmse, 3) : '—'}
            <span className="result-unit">m rms</span>
          </div>
          <div className="result-note">
            {result
              ? `${result.n} readings · R² ${Number.isFinite(result.r2) ? result.r2.toFixed(4) : '—'} · largest u ${
                  Number.isFinite(result.maxU) ? result.maxU.toPrecision(2) : '—'
                }`
              : 'Not fitted yet.'}
          </div>
        </div>
      </div>

      {manual && (
        <p className="provenance">
          <b>Curve placed by hand.</b> These numbers come from where you dragged the curve, not from
          least squares, so no uncertainty is quoted. Press <b>Match the curve</b> to fit it
          numerically.
        </p>
      )}

      {result && result.warnings.length > 0 && (
        <div className="warnings" role="status">
          {result.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </>
  );
}

function factorNote(factor?: number): string {
  if (!factor || !Number.isFinite(factor)) return 'No uncertainty estimate.';
  if (factor > 100) return '95% interval spans more than two orders of magnitude. Effectively unconstrained.';
  return `95% interval: ×÷ ${factor.toFixed(2)}`;
}
