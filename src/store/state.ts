// SPDX-License-Identifier: AGPL-3.0-only

import type { ModelId, Params, Piezometer } from '../engine/types';
import type { UnitChoice } from '../engine/units';
import { DEFAULT_UNITS } from '../engine/units';
import { SAMPLES } from '../engine/samples';
import { decodeState, encodeState } from '../share/codec';

/**
 * The serialisable state. Everything the app can restore from a link or from
 * localStorage lives here; anything derived (the fit, the derivative, the
 * scales) is recomputed rather than stored, so a stale cache can never be
 * mistaken for a result.
 */
export interface AppState {
  /** Schema version, so an old saved analysis can be recognised rather than crash. */
  v: 1;
  title: string;
  /** Discharge in the chosen discharge unit, as typed. */
  Q: number;
  model: ModelId;
  /** Pumping duration in the chosen time unit. Recovery only. */
  pumpingDuration: number;
  units: UnitChoice;
  piezometers: Piezometer[];
  /** Manual curve position, when the person has dragged the sheet. */
  manual: Params | null;
}

const STORAGE_KEY = 'clepsydra.state.v1';

export function defaultState(): AppState {
  const sample = SAMPLES[0];
  return {
    v: 1,
    title: sample.name,
    Q: 788,
    model: 'theis',
    pumpingDuration: 840,
    units: { ...DEFAULT_UNITS },
    piezometers: sample.setup.piezometers.map((p) => ({
      ...p,
      readings: p.readings.map((d) => ({ t: d.t / 60, s: d.s })),
    })),
    manual: null,
  };
}

export function loadLocal(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    return parsed && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLocal(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing, a full quota, or storage disabled entirely. The app
    // works without persistence, so this is not worth interrupting anyone over.
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* see saveLocal */
  }
}

export async function stateToHash(state: AppState): Promise<string> {
  return encodeState(state);
}

export async function hashToState(hash: string): Promise<AppState | null> {
  const payload = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!payload) return null;
  const decoded = await decodeState<AppState>(payload);
  if (!decoded || decoded.v !== 1) return null;
  if (!Array.isArray(decoded.piezometers)) return null;
  return decoded;
}
