// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Every number crossing an engine boundary is in base SI: metres and seconds.
 * Q is m^3/s, r is m, t is s, drawdown is m, T is m^2/s, S is dimensionless.
 * Conversion to and from the units a person actually types happens in units.ts
 * and nowhere else.
 */

export type ModelId = 'theis' | 'cooper-jacob' | 'hantush' | 'recovery';

export interface Reading {
  /** Time since pumping started, seconds. For 'recovery', time since pumping STOPPED. */
  t: number;
  /** Drawdown, metres, positive downward. */
  s: number;
  /** Excluded points are drawn but take no part in the fit. */
  excluded?: boolean;
}

export interface Piezometer {
  id: string;
  label: string;
  /** Radial distance from the pumped well, metres. */
  r: number;
  readings: Reading[];
}

export interface TestSetup {
  /** Constant discharge, m^3/s. */
  Q: number;
  model: ModelId;
  /** Pumping duration before shut-in, seconds. Required by 'recovery' only. */
  pumpingDuration?: number;
  piezometers: Piezometer[];
}

export interface Params {
  /** Transmissivity, m^2/s. */
  T: number;
  /** Storativity, dimensionless. */
  S: number;
  /** Leakage parameter r/B. Hantush-Jacob only. */
  rOverB?: number;
}

export interface ParamError {
  /**
   * Standard error in log10 units. A value of 0.04 means the parameter is
   * known to roughly a factor of 10^0.04, i.e. about +-10 percent.
   */
  log10Se: number;
  /** Multiplicative 95% interval factor, 10^(1.96 * log10Se). */
  factor95: number;
}

export interface FitResult {
  params: Params;
  errors: Partial<Record<'T' | 'S' | 'rOverB', ParamError>>;
  /** Sum of squared residuals, m^2. */
  ssr: number;
  /** Root mean square residual, m. */
  rmse: number;
  /** Coefficient of determination against the mean of the observed drawdowns. */
  r2: number;
  /** Number of readings that took part in the fit. */
  n: number;
  iterations: number;
  converged: boolean;
  /**
   * Largest u among the fitted points. Cooper-Jacob is only valid where
   * u is small, so this is reported rather than hidden.
   */
  maxU: number;
  warnings: string[];
}
