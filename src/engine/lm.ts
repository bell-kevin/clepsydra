// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Levenberg-Marquardt least squares, small and dense.
 *
 * Written for problems with two or three parameters and a few dozen residuals,
 * which is exactly the size of an aquifer test. The Jacobian is computed by
 * central differences because the well functions have no convenient closed-form
 * derivative and the parameter count is tiny.
 *
 * Callers fit in log10 space, so a "step" of 1e-5 here is 1e-5 decades.
 */

export interface LMOptions {
  maxIterations?: number;
  /** Finite-difference step, in the caller's parameter units. */
  step?: number;
  /** Stop when the sum of squared residuals improves by less than this fraction. */
  tolerance?: number;
  lambda0?: number;
}

export interface LMResult {
  p: number[];
  ssr: number;
  iterations: number;
  converged: boolean;
  /** Parameter covariance matrix, already scaled by the residual variance. */
  covariance: number[][] | null;
}

type ResidualFn = (p: number[]) => number[];

export function levenbergMarquardt(
  residuals: ResidualFn,
  p0: number[],
  options: LMOptions = {},
): LMResult {
  const maxIterations = options.maxIterations ?? 200;
  const step = options.step ?? 1e-5;
  const tolerance = options.tolerance ?? 1e-12;
  const m = p0.length;

  let p = p0.slice();
  let r = residuals(p);
  if (!allFinite(r)) {
    return { p, ssr: Number.NaN, iterations: 0, converged: false, covariance: null };
  }
  let ssr = sumSquares(r);
  let lambda = options.lambda0 ?? 1e-3;
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations++) {
    const J = jacobian(residuals, p, step, r.length);
    if (!J) break;

    const A = matmulTranspose(J, J); // J^T J
    const g = matvecTranspose(J, r); // J^T r

    let accepted = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const damped = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) : v)));
      const delta = solve(damped, g.map((v) => -v));
      if (!delta) {
        lambda *= 10;
        continue;
      }
      const candidate = p.map((v, i) => v + delta[i]);
      const rc = residuals(candidate);
      if (!allFinite(rc)) {
        lambda *= 10;
        continue;
      }
      const ssrC = sumSquares(rc);
      if (ssrC < ssr) {
        const improvement = (ssr - ssrC) / Math.max(ssr, Number.MIN_VALUE);
        p = candidate;
        r = rc;
        ssr = ssrC;
        lambda = Math.max(lambda / 10, 1e-12);
        accepted = true;
        if (improvement < tolerance) converged = true;
        break;
      }
      lambda *= 10;
    }

    if (!accepted) {
      // Nothing downhill was reachable; treat that as a local minimum.
      converged = true;
      break;
    }
    if (converged) break;
  }

  const covariance = computeCovariance(residuals, p, step, r.length, ssr, m);
  return { p, ssr, iterations, converged, covariance };
}

function computeCovariance(
  residuals: ResidualFn,
  p: number[],
  step: number,
  n: number,
  ssr: number,
  m: number,
): number[][] | null {
  const dof = n - m;
  if (dof <= 0) return null;
  const J = jacobian(residuals, p, step, n);
  if (!J) return null;
  const A = matmulTranspose(J, J);
  const inv = invert(A);
  if (!inv) return null;
  const variance = ssr / dof;
  return inv.map((row) => row.map((v) => v * variance));
}

function jacobian(
  residuals: ResidualFn,
  p: number[],
  step: number,
  n: number,
): number[][] | null {
  const m = p.length;
  const J: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0));
  for (let j = 0; j < m; j++) {
    const up = p.slice();
    const down = p.slice();
    up[j] += step;
    down[j] -= step;
    const ru = residuals(up);
    const rd = residuals(down);
    if (!allFinite(ru) || !allFinite(rd)) return null;
    for (let i = 0; i < n; i++) {
      J[i][j] = (ru[i] - rd[i]) / (2 * step);
    }
  }
  return J;
}

function matmulTranspose(A: number[][], B: number[][]): number[][] {
  const m = A[0].length;
  const out: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let k = 0; k < A.length; k++) sum += A[k][i] * B[k][j];
      out[i][j] = sum;
    }
  }
  return out;
}

function matvecTranspose(A: number[][], v: number[]): number[] {
  const m = A[0].length;
  const out = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let k = 0; k < A.length; k++) sum += A[k][i] * v[k];
    out[i] = sum;
  }
  return out;
}

/** Gaussian elimination with partial pivoting. Returns null on a singular matrix. */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    if (Math.abs(M[pivot][col]) < 1e-300) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= factor * M[col][k];
    }
  }
  const x = new Array<number>(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x.every(Number.isFinite) ? x : null;
}

export function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const e = new Array<number>(n).fill(0);
    e[i] = 1;
    const col = solve(A, e);
    if (!col) return null;
    out.push(col);
  }
  // `out` currently holds columns; transpose into rows.
  return out[0].map((_, i) => out.map((col) => col[i]));
}

const allFinite = (v: number[]): boolean => v.every((x) => Number.isFinite(x));
const sumSquares = (v: number[]): number => v.reduce((acc, x) => acc + x * x, 0);
