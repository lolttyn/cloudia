# Editorial Violations Catalog (v0.1)

## Purpose
Defines the complete, closed set of editorial violations recognized by Cloudia. Violations are signals, not opinions.

## Violation Classes
- BLOCKING
- REWRITE_ELIGIBLE
- WARNING
- IGNORED

## Canonical Violation List

### CANON_PREDICTIVE_CLAIM

- **ID:** CANON_PREDICTIVE_CLAIM
- **Class:** BLOCKING
- **Source:** Canon Enforcement
- **Applies To:** All segments
- **Description:** Script asserts deterministic future outcomes.
- **Example:** "This will bring a breakthrough."
- **Rationale:** Violates Cloudia's non-deterministic worldview.

### CANON_CAUSAL_OVERREACH

- **ID:** CANON_CAUSAL_OVERREACH
- **Class:** BLOCKING
- **Source:** Canon Enforcement
- **Applies To:** All segments
- **Description:** Claims causal certainty from astrological factors.
- **Example:** "Venus causes this event to happen."
- **Rationale:** Treats astrology as deterministic force, breaking canon.

### CANON_PROHIBITED_ADVICE

- **ID:** CANON_PROHIBITED_ADVICE
- **Class:** BLOCKING
- **Source:** Canon Enforcement
- **Applies To:** All segments
- **Description:** Medical, legal, financial, or moral prescriptions.
- **Example:** "You must invest now."
- **Rationale:** Forbidden advice classes are never allowed.

### ASTRO_FACT_MISMATCH

- **ID:** ASTRO_FACT_MISMATCH
- **Class:** BLOCKING
- **Source:** Technician / Ephemeris Consistency
- **Applies To:** All segments
- **Description:** Astrological claim conflicts with sky state.
- **Example:** "Mars is in Leo" when ephemeris shows otherwise.
- **Rationale:** Factual error destroys authority instantly.

### ASTRO_INVALID_RETROGRADE

- **ID:** ASTRO_INVALID_RETROGRADE
- **Class:** BLOCKING
- **Source:** Technician / Ephemeris Consistency
- **Applies To:** All segments
- **Description:** Incorrectly claims retrograde/direct status.
- **Example:** "Mercury is retrograde" when it is direct.
- **Rationale:** Misstates planetary motion; no recovery.

### STRUCTURE_MISSING_REQUIRED_ARC

- **ID:** STRUCTURE_MISSING_REQUIRED_ARC
- **Class:** BLOCKING
- **Source:** Structural Validators
- **Applies To:** Structurally governed segments only
- **Description:** Required narrative arc or section is absent.
- **Example:** Missing mandated setup or payoff in `main_themes`.
- **Rationale:** Structure defines the segment; absence voids it.

### STRUCTURE_MISSING_GROUNDING

- **ID:** STRUCTURE_MISSING_GROUNDING
- **Class:** BLOCKING
- **Source:** Structural Validators
- **Applies To:** Structurally governed segments only
- **Description:** Required grounding example or sky reference is missing.
- **Example:** No concrete example where contract mandates one.
- **Rationale:** Grounding is a required structural element.

### BANNED_LANGUAGE_PRESENT

- **ID:** BANNED_LANGUAGE_PRESENT
- **Class:** BLOCKING
- **Source:** Phrase Blacklist / Framing Rules
- **Applies To:** All segments
- **Description:** Contains prohibited clichés, fortune-telling, or metaphors.
- **Example:** "The stars guarantee your success."
- **Rationale:** Explicit "never say" list; zero tolerance.

### SEGMENT_SCHEMA_MISMATCH

- **ID:** SEGMENT_SCHEMA_MISMATCH
- **Class:** BLOCKING
- **Source:** Segment Schema Validation
- **Applies To:** All segments
- **Description:** Output violates the segment's declared schema or intent.
- **Example:** Segment speaks outside its mandate or misses required field.
- **Rationale:** If the segment is not what it claims, it cannot ship.

### THEME_UNCLEAR

- **ID:** THEME_UNCLEAR
- **Class:** REWRITE_ELIGIBLE
- **Source:** Interpretive Clarity Checks
- **Applies To:** All segments
- **Description:** Primary theme is vague or underdeveloped.
- **Example:** Topic stated but not articulated.
- **Rationale:** Fixable by tightening without re-authoring.

### THEME_MULTIPLE_COMPETING

- **ID:** THEME_MULTIPLE_COMPETING
- **Class:** REWRITE_ELIGIBLE
- **Source:** Interpretive Clarity Checks
- **Applies To:** All segments
- **Description:** Multiple competing primary themes.
- **Example:** Two unrelated focal points in the same segment.
- **Rationale:** Needs focus, not new content.

### GROUNDING_THIN

- **ID:** GROUNDING_THIN
- **Class:** REWRITE_ELIGIBLE
- **Source:** Structural Diagnostics
- **Applies To:** Structurally governed segments only
- **Description:** Grounding example exists but is generic or underused.
- **Example:** Vague illustration that barely connects to the sky reference.
- **Rationale:** Sharpening is possible without changing structure.

### TONE_MILD_DRIFT

- **ID:** TONE_MILD_DRIFT
- **Class:** REWRITE_ELIGIBLE
- **Source:** Tone Analysis
- **Applies To:** All segments
- **Description:** Tone slightly deviates within allowed bounds.
- **Example:** Slightly too instructional for the segment.
- **Rationale:** Minor adjustment fixes it without new claims.

### INTRA_SEGMENT_REDUNDANCY

- **ID:** INTRA_SEGMENT_REDUNDANCY
- **Class:** REWRITE_ELIGIBLE
- **Source:** Repetition Detection
- **Applies To:** All segments
- **Description:** Same idea restated within the segment.
- **Example:** Circular phrasing repeating the main point twice.
- **Rationale:** Local cleanup only; meaning unchanged.

### CROSS_EPISODE_THEME_REPEAT

- **ID:** CROSS_EPISODE_THEME_REPEAT
- **Class:** WARNING
- **Source:** Continuity Checks
- **Applies To:** All segments
- **Description:** Theme resembles a recent episode.
- **Example:** Reusing yesterday's metaphor.
- **Rationale:** Requires human judgment; not enforceable.

### LANGUAGE_GENERIC

- **ID:** LANGUAGE_GENERIC
- **Class:** WARNING
- **Source:** Specificity Heuristics
- **Applies To:** All segments
- **Description:** Generic or vague language.
- **Example:** Broad motivational phrasing without detail.
- **Rationale:** Taste-based; logged only.

### MISSED_INTERPRETIVE_OPPORTUNITY

- **ID:** MISSED_INTERPRETIVE_OPPORTUNITY
- **Class:** WARNING
- **Source:** Heuristic Analysis
- **Applies To:** All segments
- **Description:** An interesting transit is noted but underused.
- **Example:** Mentions a conjunction without exploring implications.
- **Rationale:** Insightful but subjective; no authority granted.

### SUBJECTIVE_FLATNESS

- **ID:** SUBJECTIVE_FLATNESS
- **Class:** IGNORED
- **Source:** Heuristic Opinion
- **Applies To:** All segments
- **Description:** "Feels flat" style feedback.
- **Example:** "Could go deeper."
- **Rationale:** Opinionated, not deterministic; tracked only.

### ENGAGEMENT_SPECULATION

- **ID:** ENGAGEMENT_SPECULATION
- **Class:** IGNORED
- **Source:** Engagement Speculation
- **Applies To:** All segments
- **Description:** Predictions about listener behavior or virality.
- **Example:** "Listeners will drop off here."
- **Rationale:** Growth speculation is not editorial authority.

