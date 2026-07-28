<a name="readme-top"></a>

# Clepsydra

Aquifer pumping-test analysis that runs entirely in a browser tab. Paste time
and drawdown readings, match a type curve, read off transmissivity and
storativity with an honest uncertainty on each.

Theis, Cooper–Jacob, Hantush–Jacob and Theis recovery. Nothing is uploaded,
nothing is installed, and there is no account.

**Free software under the GNU AGPL v3.** Not certified or approved by anybody.

---

## Why this exists

The mathematics of aquifer test interpretation has been public and
unencumbered since 1935. Theis derived the well function from the heat
conduction analogy; Cooper and Jacob published the logarithmic approximation in
1946; Hantush and Jacob published the leaky solution in 1955. None of it is
anyone's intellectual property.

What is charged for is the interface.

Before building this I went looking for a free tool that would take a column of
drawdown readings and fit a curve to them in a browser. Every free option I
found fails in the same specific way: **the engine exists but there is no
interface**. The maths is available in R and Python packages that need a
language runtime and a toolchain before they compute anything, or in Windows
desktop programs, or in a spreadsheet. Nothing does it in a browser tab.

This is that missing interface, and nothing more. The solutions it implements
are the ones any hydrogeology textbook contains.

## How this compares

*Verified by searching in July 2026. Prices and capabilities change; check them
before relying on this table. If any of it has gone stale, please open an issue.*

Clepsydra is listed last on purpose. Read the row above it first.

| | What it is | Cost | Where it beats Clepsydra |
|---|---|---|---|
| **`khaors/pumpingtest`** | R package. Theis, Cooper–Jacob, Hantush–Jacob, Boulton, Papadopulos–Cooper, Warren–Root, Gringarten, Hvorslev, Bouwer–Rice, plus a Shiny GUI | Free software | **Start here if you can run R.** Far more solution methods than Clepsydra, including slug tests, fractured and dual-porosity aquifers. Bayesian MCMC parameter estimation as well as least squares. Diagnostic derivative plots with several derivative estimators. It is a more capable analysis tool in every respect except that it is not on CRAN and must be installed from GitHub, and you need R. |
| **PyTheis** | Published Python tool for nonlinear Theis fitting with error estimates | Free software | Peer-reviewed and written up in the literature, which Clepsydra is not. Same core idea of replacing manual type-curve matching with least squares plus a proper error estimate. |
| **`NumericalEnvironmental` pumping-test script** | Python: Theis, Hantush–Jacob, numerical unconfined with wellbore storage | Free software | Models an unconfined aquifer with reduced saturated thickness and wellbore storage, which Clepsydra does not attempt. Its author is explicit that it does not do automatic curve fitting and is not a comprehensive alternative to commercial codes. |
| **Aquaprobe** | Standalone desktop app from India's Central Ground Water Board. Cooper–Jacob, Theis, Theis recovery | Freeware | Free of charge with no toolchain at all, and it produces reports. Windows desktop download rather than a web page. |
| **AQTESOLV** | The market leader since 1989. The most complete set of solutions available anywhere | $500 Standard single-user, $750 Pro single-user, $1000/$1500 site licences; academic $400–$750 | **Better than this at nearly everything.** Variable-rate and step-drawdown tests, slug tests, constant-head tests, bounded aquifers, image wells, partial penetration, wellbore storage and skin, predictive test design, contouring, and printed reports that regulators recognise. Windows only. The free demo has no time limit but cannot save files or print results. |
| **AquiferTest** (Waterloo Hydrogeologic) | The other major commercial package | Price not published; quote only. Licensed by MAC-address softkey, USB dongle, or network server | Automatic type-curve fitting, barometric and baseline trend correction, Lugeon tests, integration with water-level instrumentation, professional report output. |
| **OSE Inverse Theis Calculator** (New Mexico) | Browser tool for predicting drawdown | Free, no login | Genuinely free and in a browser. It solves the forward problem and states plainly that it cannot solve for transmissivity, because for most parameter sets no unique solution exists. That is the number a pumping test is run to get, so it does not overlap much with this. |
| **University of the Free State pumping-test programme** | Excel workbook; pumping, step-drawdown and slug tests | Free | Handles slug and step-drawdown tests. Needs Excel 2010. |
| **Clepsydra** | This | Free software | Runs in a browser tab with no install and no account. Readings never leave the machine. The type curve can be dragged the way it was done on tracing paper, which is worth something for teaching. Reports uncertainty as a multiplicative factor, which is how these parameters actually behave. Shares an analysis as a link that carries the data in its fragment. |

**If you can install R, use `pumpingtest` instead of this.** It is more capable.
Clepsydra's only real advantage over it is that it needs nothing installed.

**If you need a report a regulator will accept, buy AQTESOLV.** This project has
no standing with anyone.

## What this is not

- **Not certified, accredited or approved** by any agency, regulator, standards
  body or trade association. No one has reviewed it.
- **Not a substitute for a hydrogeologist.** It will fit a curve to nonsense
  without complaint. Reading the diagnostic plot is the actual skill and the
  software cannot do it for you.
- **No slug tests, no constant-head tests, no step-drawdown tests.**
- **No bounded aquifers, image wells or barriers.** Every solution here assumes
  an aquifer of infinite lateral extent.
- **No partial penetration, wellbore storage or skin effect.** All wells are
  assumed fully penetrating with negligible storage.
- **No unconfined-specific solution.** Neuman's delayed-yield solution is not
  implemented. Applying Theis to a water-table aquifer, as this would let you
  do, ignores delayed gravity drainage and will mislead you at intermediate
  times.
- **No variable discharge.** Constant rate only.
- **No printed report output.**

## Verification

`npm run test` runs 74 tests. The ones that matter:

**The well function is checked three independent ways.** Against reference
values of the exponential integral computed with mpmath at 25 decimal digits
(agreement to 1 part in 10¹¹); against a Gauss–Legendre quadrature written
separately from the integral definition, sharing no code with the
implementation; and against identities it must satisfy regardless of either,
including W(u,0) = W(u) exactly, W(0,b) = 2K₀(b), and monotonicity in both
arguments.

**The fit is checked against the commercial incumbent on public field data.**
The Oude Korendijk test (de Wit 1963, published in Kruseman & de Ridder, ILRI
Publication 47) is the standard worked example in the field. Fitting both
piezometers simultaneously, AQTESOLV, MLU and TTim all report hydraulic
conductivity near 66 m/d and specific storage near 2.54 × 10⁻⁵ /m, which for a
7 m aquifer is T = 462.6 m²/d and S = 1.779 × 10⁻⁴, with RMSE 0.0501 m.

Clepsydra returns **T = 462.6 m²/d, S = 1.779 × 10⁻⁴, RMSE 0.0501 m.**

**The drag interaction is checked against physics, not against its own formula.**
Sliding a type curve on log-log paper is exactly equivalent to changing T and S.
A test shifts a point on the curve by a given number of decades and compares it
against the model evaluated at the translated parameters, requiring agreement
to 1 part in 10⁹.

**Two paths to transmissivity that share no arithmetic.** The Bourdet
log-derivative plateau gives T = Q/4πT′ without any curve fitting at all. It is
printed next to the fitted value so a disagreement is visible.

**Degenerate input is tested, not assumed.** Empty records, fewer readings than
parameters, zero and negative discharge, zero radial distance, NaN and Infinity
in the readings, non-positive times, all-zero drawdown, recovery without a
pumping duration, truncated and corrupt share links, malformed pasted data.

### Things the tests caught that would otherwise have shipped

Recorded because a test suite that never found anything is not evidence of
anything:

1. **The optimiser returned a confident wrong answer on leaky aquifers.** It
   reported T = 1599 m²/d where the true value was 300. Sum of squared residuals
   at the true parameters was exactly zero; at the "converged" answer it was
   0.53. The cause was a straight-line seed for storativity that is five orders
   of magnitude wrong on a response approaching steady state. Fixed by scanning
   absolute physical grids for S and r/B rather than grids relative to a seed.
2. **The plot was ruled in SI seconds while its axis said minutes.** Every
   reading sat two decades from where the label claimed. Every number in the
   readout was correct and the picture was wrong. Caught by rendering the
   component and looking at it, not by any engine test. There is now a
   regression test on that boundary.
3. **A reference value was wrong, not the code.** W(0.05) failed at 1.4 × 10⁻⁸.
   The transcribed table value was bad; the implementation was fine. Reference
   values now come from mpmath rather than from a printed table, and the
   tolerance was tightened rather than loosened.
4. **A screen reader would have announced "Transmissivity NaN."**

### What could not be tested here

There was no browser available in the environment this was built in. The
components were rendered with `react-dom/server` and the resulting SVG
rasterised and inspected, which verifies scales, ruling, curve geometry, marker
placement and colour assignment — but **not** the HTML layout, the CSS grid, the
responsive breakpoint, focus rings, or any pointer interaction.

**Check these first after deploying:**

1. **Dragging the curve.** Pointer capture and the touch path are entirely
   unexercised. Press on the curve, drag, confirm T and S move the right way:
   dragging up should *decrease* T.
2. **Arrow-key nudging** after tabbing to the curve, and whether the focus ring
   is visible on it.
3. **The mobile breakpoint at 860px**, where the rail moves below the plot.
4. **Clipboard access for share links**, which browsers restrict differently.
   There is a fallback that writes the link to the address bar; confirm it fires
   rather than failing silently.
5. **`CompressionStream('deflate-raw')`**, which older Safari lacks. There is an
   uncompressed fallback path that has been unit-tested but never exercised in a
   real browser that actually lacks the API.
6. **localStorage in private browsing**, where writes throw. The failure is
   swallowed on purpose; confirm the app still works rather than blanking.

## Data and attribution

- **Oude Korendijk dataset.** Field measurements from a 1963 test in a polder
  south of Rotterdam (de Wit 1963), published in Kruseman & de Ridder, *Analysis
  and Evaluation of Pumping Test Data*, ILRI Publication 47. The time–drawdown
  values were transcribed from the TTim project (MIT licensed, Mark Bakker,
  <https://github.com/mbakker7/ttim>), which distributes them as
  `docs/03pumpingtests/data/piezometer_h30.txt` and `piezometer_h90.txt`. The
  published comparison against AQTESOLV, MLU and TTim comes from TTim's
  documentation.
- **The second built-in dataset is synthetic**, generated by this repository at
  stated parameters with seeded pseudo-random noise. It is labelled as such in
  the interface. It proves nothing about real aquifers.

## Reading the plot

Colour means one thing and one thing only:

| | |
|---|---|
| **teal** | measured drawdown |
| **indigo** | anything computed from a model |
| **ochre** | the log-derivative |
| **red** | misfit, and errors |
| **grey** | readings excluded from the fit |

**Which piezometer is encoded by shape** — circle, square, triangle, diamond —
so that the colour channel stays free to carry meaning. Nothing in the interface
chrome is coloured.

The two strips under the plot both answer "should I believe this?" The
derivative flattens onto a plateau at Q/4πT once radial flow is established; if
your late data are not flat, the aquifer is not doing what the model assumes and
curve fitting will not fix that. Structure in the misfit strip — a run of
same-sign residuals — means the wrong model, not noisy data.

## Method notes

- T, S and r/B are fitted in log₁₀ space by Levenberg–Marquardt with a numeric
  Jacobian. Uncertainty comes from the covariance matrix and is reported as a
  multiplicative 95% factor, because a storativity is uncertain by a factor of
  two, not by ±0.0001. The 95% interval uses 1.96 standard errors rather than a
  t-distribution.
- The optimiser is started from a Cooper–Jacob straight-line seed plus the four
  best corners of a coarse grid scan, and the lowest sum of squares wins.
- W(u) uses a series expansion below u = 1 and a modified Lentz continued
  fraction above it. The leaky well function uses composite 8-point
  Gauss–Legendre over the window where the integrand is above e⁻⁵⁰.
- The derivative uses the Bourdet weighted-window scheme with a smoothing width
  of 0.25 in ln t.
- Everything crossing an engine boundary is metres and seconds. Unit conversion
  happens in exactly one file.

## Running it

```
npm install
npm run dev      # development server
npm run test     # 74 tests
npm run build    # static output in dist/
```

Vite, React and TypeScript are pinned to conservative versions so this runs in
WebContainer environments such as bolt.new. `base` is `./` and the build target
is es2021. There are no runtime dependencies beyond React; the charts are
hand-rolled SVG.

## Licence

GNU Affero General Public License v3.0 only. See `LICENSE`.

The AGPL is deliberate: if you run a modified version of this as a network
service, the people using it are entitled to your source.


--------------------------------------------------------------------------------------------------------------------------
== We're Using GitHub Under Protest ==

This project is currently hosted on GitHub.  This is not ideal; GitHub is a
proprietary, trade-secret system that is not Free and Open Souce Software
(FOSS).  We are deeply concerned about using a proprietary system like GitHub
to develop our FOSS project. I have a [website](https://bellKevin.me) where the
project contributors are actively discussing how we can move away from GitHub
in the long term.  We urge you to read about the [Give up GitHub](https://GiveUpGitHub.org) campaign 
from [the Software Freedom Conservancy](https://sfconservancy.org) to understand some of the reasons why GitHub is not 
a good place to host FOSS projects.

If you are a contributor who personally has already quit using GitHub, please
email me at **kevinBell@Linux.com** for how to send us contributions without
using GitHub directly.

Any use of this project's code by GitHub Copilot, past or present, is done
without our permission.  We do not consent to GitHub's use of this project's
code in Copilot.

![Logo of the GiveUpGitHub campaign](https://sfconservancy.org/img/GiveUpGitHub.png)

<p align="right"><a href="#readme-top">back to top</a></p>
