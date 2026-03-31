# Lemnisca Panel — Final Synthesis Report

*Generated: 2026-03-31 18:16*

---

Here is the structured synthesis report of the PRD co-authoring session.

## 1. Consensus Areas
*   **Product Name:** Lemnisca Triage
*   **Target User:** MSAT Process Engineer / MSAT Lead (technically trained generalists, not modeling experts).
*   **The Trigger:** Early morning (e.g., 6:30 AM) following an overnight deviation. The user has 90 minutes to form a defensible hypothesis for the 8:00 AM cross-functional triage standup.
*   **Required Inputs (The 3-Minute Flow):**
    1. *Symptom:* DO crash/spike, Base/Acid anomaly, or OUR/CER divergence.
    2. *Organism Class:* *E. coli*, *S. cerevisiae*, or *CHO*.
    3. *Vessel Archetype:* Volume (<2kL, 2-10kL, >10kL) + Aspect Ratio (Squat <2:1, Standard 2-3:1, Tall >3:1).
    4. *Working Volume:* At time of deviation.
    5. *Process Phase:* e.g., early exponential, late feed.
    6. *Estimated Biomass:* OD600, Wet Cell Weight, or Dry Cell Weight at time of deviation.
*   **Output Format:** A structured "Triage Brief" containing explicit mathematical assumptions, sensitivity warnings, and a "Diagnostic Bounding Box" (a text conclusion generated from a 3x3 matrix of symptoms vs. Damköhler limits). Below this sits the "Trapdoor"—a locked visualization prompting a paid upgrade.

## 2. Key Tensions Resolved
*   **Tension: The Input-to-Logic Paradox.** Product required sparse inputs (<6) for low friction; Physics required exact reactor geometry and kinetics to calculate Damköhler numbers.
    *   *Resolution:* "Archetypes with Transparent Overrides." Users select standard dropdown profiles that auto-load baseline constants. These constants are explicitly displayed for QA trust and can be manually overridden.
*   **Tension: Vessel Geometry Oversimplification.** Product proposed a generic "15kL Tank." MSAT rejected this, noting aspect ratio dictates mixing zones.
    *   *Resolution:* Aspect Ratio (Squat, Standard, Tall) was added as a mandatory modifier to Volume to ensure mixing time ($t_{mix}$) calculations are scientifically defensible.
*   **Tension: The Biomass Flaw.** Physics assumed "Phase" could determine maximum oxygen uptake. Engineering/Outsider flagged that "late phase" biomass varies wildly between facilities, rendering the math useless.
    *   *Resolution:* Added "Estimated Biomass" (Input 6). MSAT confirmed this data is reliably available via offline samples or capacitance probes at 6:30 AM.
*   **Tension: The Wedge Collapse.** The original upsell trapdoor only pitched a 3D spatial map for *transport* failures. If the tool proved a *kinetic* failure, the wedge offered nothing.
    *   *Resolution:* A "Dual Trapdoor" was created. Transport failures pitch a 3D spatial map; Kinetic failures pitch a time-series kinetic trajectory overlay to compare against a golden batch. (A third "Transition Regime" trapdoor pitches a full dynamic simulation).
*   **Tension: QA Trigger Words.** MSAT warned that definitively diagnosing "contamination" would trigger mandatory, costly QA plant quarantines.
    *   *Resolution:* Output text is strictly limited to "Diagnostic Bounding Statements" (e.g., "Definitive kinetic anomaly," "Physics cleared") rather than specific biological diagnoses.

## 3. Winning Product Concept
*   **Product Name:** Lemnisca Triage
*   **One-Liner:** A low-friction diagnostic calculator that uses bounding physics to instantly eliminate physically impossible root causes during a fermentation deviation.
*   **Product Form:** A fast, web-based interval arithmetic calculator that generates a defensible, presentation-ready Triage Brief.
*   **Target Pain:** 
    *   *P-Level (MSAT):* Wasting 48 hours chasing wild geese after a deviation because they lack the data to defend a physical vs. biological root cause at the morning standup.
    *   *C-Level (Plant Ops):* Costly operational downtime and knee-jerk CAPAs driven by gut feelings rather than bounding physics.
*   **Why it works as a wedge for Lemnisca:** It provides immediate, high-stress utility for free (surviving the 8 AM standup) while exposing a structural blindspot (exact spatial location or metabolic divergence) that can only be solved by purchasing Lemnisca Core.
*   **Confidence:** High. The math relies on elimination via physical limits (highly defensible), the inputs match operational reality, and the wedge accounts for all mathematical outcomes.

## 4. What Was Explicitly Ruled Out
*   **NO** time-series data uploads (CSV or API). Single-point-in-time inputs only.
*   **NO** custom reactor geometry drawing. Users must fit an archetype or use the manual $k_La$ override.
*   **NO** dynamic simulations or browser-based CFD solving. This is strictly an interval arithmetic calculator.
*   **NO** single-point mathematical estimates. The engine must calculate extreme physical boundaries (Min and Max).
*   **NO** definitive biological diagnoses (e.g., the word "contamination" is banned from the output).

## 5. Open Questions Before Build Starts
The panel ended with a call for hidden engineering landmines. The following must be explicitly defined before development begins:
1.  **The Biomass Conversion Math:** Engineering needs the exact formulas to auto-convert the user's selected unit (OD600, Wet Cell Weight, or Dry Cell Weight) into the standard Biomass variable ($X$) required for the Professor's $t_{rxn}$ calculation.
2.  **The Hardcoded Constants:** The PRD defines the *logic* for the archetypes, but Engineering needs the actual numerical values. The Professor must provide the exact $[t_{rxn, min}, t_{rxn, max}]$, specific power input ($P/V$), and superficial gas velocity ($v_s$) bounds for every Organism and Vessel combination.
3.  **Manual Override Logic:** If a user uses the "Advanced" toggle to input their exact $k_La$, Engineering needs to know how this impacts the interval arithmetic. Does it replace the bounds with a single number, or generate a tighter bound around the user's input?