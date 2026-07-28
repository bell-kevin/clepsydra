// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Well functions used by the analytical drawdown solutions.
 *
 * W(u)     Theis (1935) well function, identical to the exponential integral E1(u).
 * W(u, b)  Hantush & Jacob (1955) leaky well function, b = r/B.
 * besselK0 Modified Bessel function K0, present only so the test suite can check
 *          the leaky well function against its independent steady-state identity
 *          W(0, b) = 2*K0(b). Nothing in the app calls it at runtime.
 */

export const EULER_GAMMA = 0.5772156649015329;

const MAX_ITER = 200;
const EPS = 1e-15;
const TINY = 1e-300;

/**
 * Theis well function W(u) = E1(u) = integral from u to infinity of exp(-y)/y dy.
 *
 * Series expansion below u = 1, modified Lentz continued fraction above it.
 * Both branches are the standard treatment of E1 (Abramowitz & Stegun 5.1.11
 * and 5.1.22); the split point is where each is comfortably convergent.
 */
export function W(u: number): number {
  if (!Number.isFinite(u)) return Number.NaN;
  if (u <= 0) return Number.POSITIVE_INFINITY;
  // Beyond this, exp(-u) has underflowed to a value no drawdown model can use.
  if (u > 700) return 0;

  if (u < 1) {
    let sum = -Math.log(u) - EULER_GAMMA;
    let fact = 1;
    for (let i = 1; i <= MAX_ITER; i++) {
      fact *= -u / i;
      const del = -fact / i;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) return sum;
    }
    return sum;
  }

  let b = u + 1;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITER; i++) {
    const a = -i * i;
    b += 2;
    d = a * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    c = b + a / c;
    if (Math.abs(c) < TINY) c = TINY;
    const del = c * d;
    h *= del;
    if (Math.abs(del - 1) < EPS) return h * Math.exp(-u);
  }
  return h * Math.exp(-u);
}

/**
 * Hantush & Jacob (1955) leaky well function.
 *
 *   W(u, b) = integral from u to infinity of (1/y) exp(-y - b^2/(4y)) dy
 *
 * Substituting y = u*exp(z) turns this into a smooth, single-humped integral
 * over z in [0, Z] with (1/y)dy = dz, which composite Simpson handles well:
 *
 *   W(u, b) = integral from 0 to infinity of exp(-u e^z - b^2/(4 u e^z)) dz
 *
 * The upper limit is truncated where u*e^z reaches 700, past which the
 * integrand is zero in double precision.
 */
export function hantushW(u: number, beta: number): number {
  if (!Number.isFinite(u) || !Number.isFinite(beta)) return Number.NaN;
  if (beta < 0) return Number.NaN;
  if (beta === 0) return W(u);
  if (u <= 0) return 2 * besselK0(beta);
  if (u > 700) return 0;

  const quarterBetaSq = (beta * beta) / 4;

  // The integrand is exp(-y - b^2/4y) with y = u e^z. Both terms in the
  // exponent kill it, one at each end, so integrate only over the window where
  // exp(...) is above exp(-CUTOFF) and treat the tails as zero. This matters:
  // automatic curve matching evaluates this function a few hundred thousand
  // times, and integrating the dead tails was most of the cost.
  const CUTOFF = 50;
  const zHi = Math.log(CUTOFF / u);
  const zLo = Math.max(0, Math.log(quarterBetaSq / (CUTOFF * u)));
  if (zHi <= zLo) return 0;

  const f = (z: number): number => {
    const y = u * Math.exp(z);
    const arg = -y - quarterBetaSq / y;
    return arg < -745 ? 0 : Math.exp(arg);
  };

  return gaussLegendre(f, zLo, zHi);
}

const GL8_NODES = [
  -0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
  0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363,
];
const GL8_WEIGHTS = [
  0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
  0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
];

/**
 * Composite 8-point Gauss-Legendre over panels no wider than PANEL in z.
 * The integrand is smooth and single-humped with a width of order one in z,
 * so half-unit panels put several nodes across every feature.
 */
function gaussLegendre(f: (x: number) => number, a: number, b: number): number {
  const PANEL = 0.5;
  const panels = Math.max(1, Math.ceil((b - a) / PANEL));
  const width = (b - a) / panels;
  const half = width / 2;
  let total = 0;
  for (let p = 0; p < panels; p++) {
    const mid = a + width * (p + 0.5);
    for (let i = 0; i < 8; i++) {
      total += GL8_WEIGHTS[i] * f(mid + half * GL8_NODES[i]);
    }
  }
  return total * half;
}

/**
 * Modified Bessel function of the second kind, order zero.
 * Polynomial approximations from Abramowitz & Stegun 9.8.5-9.8.8,
 * accurate to roughly 1e-7. Test-suite use only.
 */
export function besselK0(x: number): number {
  if (x <= 0) return Number.POSITIVE_INFINITY;
  if (x <= 2) {
    // I0 series is in (x/3.75)^2; the K0 correction series is in (x/2)^2.
    const p = (x / 3.75) * (x / 3.75);
    const i0 =
      1 +
      p * (3.5156229 + p * (3.0899424 + p * (1.2067492 + p * (0.2659732 + p * (0.0360768 + p * 0.0045813)))));
    const y = (x / 2) * (x / 2);
    return (
      -Math.log(x / 2) * i0 -
      0.57721566 +
      y *
        (0.4227842 +
          y * (0.23069756 + y * (0.0348859 + y * (0.00262698 + y * (0.0001075 + y * 0.0000074)))))
    );
  }
  const z = 2 / x;
  const poly =
    1.25331414 +
    z *
      (-0.07832358 +
        z * (0.02189568 + z * (-0.01062446 + z * (0.00587872 + z * (-0.0025154 + z * 0.00053208)))));
  return (Math.exp(-x) / Math.sqrt(x)) * poly;
}
