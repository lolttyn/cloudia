# Major Transits Integration — Design Doc

**Purpose:** Define how to add eclipse flags, slow-planet ingresses (Saturn, Jupiter, etc.), and key outer-planet aspects to the Cloudia interpretation pipeline so scripts can mention defining astrological events (e.g. Saturn entering Aries, solar eclipse at New Moon, Saturn–Neptune conjunction).

**Status:** Design only; no code changes in this doc.

---

## 1. Eclipse detection

**Goal:** Flag when the New Moon or Full Moon coincides with a solar or lunar eclipse so prompts can say e.g. "today's New Moon is also a solar eclipse."

**Mechanics:**
- **Solar eclipse:** Occurs at New Moon when the Moon is close enough to the lunar node (ascending or descending) that it passes between Earth and Sun. Typically |Moon longitude − Node longitude| (or elongation from node) within ~15–18° (eclipse season).
- **Lunar eclipse:** Occurs at Full Moon when the Moon is near the opposite node (Earth between Sun and Moon); same node-proximity idea.
- **Implementation options:**
  1. **Lunar node proximity:** Compute Moon and North (or South) node longitude for the episode date (Swiss Ephemeris provides node positions). At New Moon, if Moon–Sun elongation ≈ 0 and Moon is within ~18° of a node → solar eclipse possible. At Full Moon, if elongation ≈ 180 and Moon within ~18° of node → lunar eclipse possible. Refine with a proper eclipse window (e.g. check if date falls within a known eclipse season).
  2. **Eclipse table / API:** Use a precomputed table or external source of eclipse dates and types; for each episode date check if it matches. Simpler but requires maintenance.
- **Data to add:** Boolean (or enum) on the interpretive frame or daily context, e.g. `solar_eclipse_today: boolean`, `lunar_eclipse_today: boolean`, or a single `eclipse: "solar" | "lunar" | null`.
- **Prompt use:** When `eclipse` is set, add a line to the user prompt: "Today's New/Full Moon coincides with a solar/lunar eclipse—mention it briefly in Cloudia's voice (one line)."

**Effort:** Small–medium. Node positions are available from the ephemeris; the main work is defining the eclipse window and wiring the flag into the frame and prompts.

---

## 2. Slow-planet ingresses (Saturn, Jupiter, etc.)

**Goal:** Detect when Saturn, Jupiter, or other slow planets change zodiac signs so scripts can note e.g. "Saturn entered Aries today" (or "yesterday" / "this week").

**Mechanics:**
- Same pattern as existing Sun/Moon ingress detection: for each body (e.g. Saturn, Jupiter), compute sign for yesterday, today, and optionally tomorrow (using the same end-of-day UTC as Sun/Moon). If `sign(today) !== sign(yesterday)` → ingress "past_24h"; if `sign(today) !== sign(tomorrow)` → ingress "next_24h".
- **Bodies to support:** Saturn and Jupiter are the highest impact (multi-year stays per sign). Uranus, Neptune, Pluto move even more slowly; still useful for "Saturn entered Aries" / "Jupiter entered Gemini" style callouts.
- **Data to add:** Extend the interpretation layer's "highlights" or "signals" to include slow-planet ingresses. Example: `{ type: "ingress", body: "Saturn", from_sign: "Pisces", to_sign: "Aries", window: "past_24h" }`. Store in the frame under something like `major_transits.ingresses: [...]` or as additional signals that the prompt builder can read.
- **Prompt use:** When the frame includes a slow-planet ingress, add: "Today Saturn [or Jupiter, etc.] enters [sign]. Mention it in one line in Cloudia's voice—what it means in plain language."

**Effort:** Small. Position data for Saturn/Jupiter (and others) is already computed in `computeSkyState` (bodies). The interpretation layer currently only uses Sun and Moon for ingresses; add a loop over selected outer bodies and compare sign across the date window, then append to frame/signals.

---

## 3. Key outer-planet aspects (Saturn–Neptune, Jupiter–Saturn, etc.)

**Goal:** Detect notable outer-planet aspects (e.g. Saturn conjunct Neptune, Jupiter square Saturn) so scripts can reference them when they are exact or within orb.

**Mechanics:**
- **Aspect detection:** The codebase already has `computeAspects(bodies, orb)` in `computeAspects.js`; it computes aspects between body pairs. Extend or reuse to include outer-planet pairs (Saturn–Neptune, Jupiter–Saturn, etc.) with a suitable orb (e.g. 5–8° for slow planets).
- **Filter to "key" aspects:** Define a short list of aspect types and body pairs that are script-worthy (e.g. Saturn–Neptune conjunction, Jupiter–Saturn square). Store only those in the frame.
- **Data to add:** e.g. `major_transits.aspects: [{ body_a: "Saturn", body_b: "Neptune", aspect: "conjunction", orb_deg: 1.2 }]` or as signals with kind `outer_aspect`.
- **Prompt use:** "If major outer-planet aspects are listed (e.g. Saturn–Neptune), mention the one that is closest to exact in one line, in Cloudia's voice."

**Effort:** Medium. Requires defining the list of aspect types and body pairs, wiring aspect computation for those pairs (if not already covered), and exposing them in the frame and prompt.

---

## 4. Exposing these in the frame and prompts

**Frame shape (proposed):**
- **Eclipses:** `eclipse: "solar" | "lunar" | null` (or two booleans) on the daily interpretation or interpretive frame.
- **Slow-planet ingresses:** `major_transits.ingresses: Array<{ body, from_sign, to_sign, window }>` (or equivalent in existing `signals` with a new kind).
- **Outer-planet aspects:** `major_transits.aspects: Array<{ body_a, body_b, aspect, orb_deg }>` (or equivalent in `signals`).

**Prompt instructions:**
- When `eclipse` is set: "Today's New/Full Moon is also a [solar/lunar] eclipse. Mention it in one line."
- When `major_transits.ingresses` is non-empty: "One or more slow planets (e.g. Saturn, Jupiter) are changing signs. Mention the most notable in one line in Cloudia's voice."
- When `major_transits.aspects` is non-empty: "A key outer-planet aspect is active (e.g. Saturn–Neptune). Mention it in one line."
- Keep all of these as optional, single-line callouts so the script stays focused on the core Sun/Moon/lunation story.

---

## 5. Estimated effort

| Item | Effort | Notes |
|------|--------|------|
| Eclipse detection (node proximity or table) | Small–medium | Depends on whether we use ephemeris nodes or an eclipse table. |
| Slow-planet ingresses (Saturn, Jupiter) | Small | Reuse existing ingress logic; add body loop and frame/signal wiring. |
| Outer-planet aspects (Saturn–Neptune, etc.) | Medium | Define list of pairs/aspects; ensure aspect computation includes them; add to frame and prompts. |
| Frame schema + prompt wiring | Small | Add fields to interpretive frame (or daily interpretation) and 1–2 lines per feature in prompt builders. |

**Total:** Roughly 1–2 days for eclipses + slow-planet ingresses; add ~1 day for outer-planet aspects and tuning.
