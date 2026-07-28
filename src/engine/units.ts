// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Unit handling. The engine is metres-and-seconds throughout; this module is
 * the only place that knows about gallons, feet, minutes or days.
 *
 * Exact definitions used:
 *   1 international foot   = 0.3048 m exactly
 *   1 US liquid gallon     = 3.785411784 L exactly
 *   1 imperial gallon      = 4.54609 L exactly
 */

export interface Unit {
  id: string;
  label: string;
  /** Multiply a value in this unit by `toBase` to get the SI base unit. */
  toBase: number;
}

const FOOT = 0.3048;
const US_GAL = 3.785411784e-3; // m^3
const IMP_GAL = 4.54609e-3; // m^3

export const LENGTH_UNITS: Unit[] = [
  { id: 'm', label: 'm', toBase: 1 },
  { id: 'cm', label: 'cm', toBase: 0.01 },
  { id: 'ft', label: 'ft', toBase: FOOT },
  { id: 'in', label: 'in', toBase: FOOT / 12 },
];

export const TIME_UNITS: Unit[] = [
  { id: 's', label: 's', toBase: 1 },
  { id: 'min', label: 'min', toBase: 60 },
  { id: 'h', label: 'h', toBase: 3600 },
  { id: 'd', label: 'd', toBase: 86400 },
];

export const DISCHARGE_UNITS: Unit[] = [
  { id: 'm3/d', label: 'm³/d', toBase: 1 / 86400 },
  { id: 'm3/h', label: 'm³/h', toBase: 1 / 3600 },
  { id: 'L/s', label: 'L/s', toBase: 1e-3 },
  { id: 'gpm', label: 'US gpm', toBase: US_GAL / 60 },
  { id: 'igpm', label: 'imp gpm', toBase: IMP_GAL / 60 },
  { id: 'ft3/d', label: 'ft³/d', toBase: FOOT ** 3 / 86400 },
];

export const TRANSMISSIVITY_UNITS: Unit[] = [
  { id: 'm2/d', label: 'm²/d', toBase: 1 / 86400 },
  { id: 'ft2/d', label: 'ft²/d', toBase: FOOT ** 2 / 86400 },
  // 1 gal/day/ft = 1 ft^3/day/ft * (1/7.48052) -> handled directly:
  { id: 'gpd/ft', label: 'gpd/ft', toBase: US_GAL / FOOT / 86400 },
  { id: 'm2/s', label: 'm²/s', toBase: 1 },
];

export function findUnit(list: Unit[], id: string): Unit {
  const found = list.find((u) => u.id === id);
  if (!found) throw new Error(`unknown unit: ${id}`);
  return found;
}

export const toBase = (value: number, unit: Unit): number => value * unit.toBase;
export const fromBase = (value: number, unit: Unit): number => value / unit.toBase;

export interface UnitChoice {
  length: string;
  time: string;
  discharge: string;
  transmissivity: string;
}

export const DEFAULT_UNITS: UnitChoice = {
  length: 'm',
  time: 'min',
  discharge: 'm3/d',
  transmissivity: 'm2/d',
};

/** Format a number for a data-dense readout: significant figures, not decimals. */
export function sig(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(value)));
  if (exp >= digits || exp < -3) {
    const mantissa = value / 10 ** exp;
    return `${mantissa.toFixed(Math.max(0, digits - 1))}e${exp}`;
  }
  return value.toFixed(Math.max(0, digits - 1 - exp));
}
