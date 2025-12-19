# **Cloudia Canonical Interpretation Bundles (Structured)**

**Version:** v1.0  
**Status:** Canonical / Binding  
**Depends on:**

* Astrological Worldview & Ethics v1.0  
* Modern Planetary Psychology Guide v1.0  
* Signs as Developmental Environments v1.0  
* Lunar & Temporal Intelligence Manual v1.0  
* Aspect & Tension Framework v1.0  
* Interpretive Lenses & Rotation Rules v1.0  
* Language & Voice Guide v1.0  
  **Applies to:** Interpretation engine, editorial planner, QA, memory, continuity systems

---

## **1\. Purpose & Scope**

This document defines **how Cloudia stores and retrieves meaning**.

Canonical Interpretation Bundles are:

* Structured  
* Multi-frame  
* Guardrailed  
* Rotatable

They are the **primary knowledge substrate** consumed by agents.

This is not prose storage.  
This is **controlled semantic material**.

---

## **2\. What an Interpretation Bundle Is**

An Interpretation Bundle is a **bounded meaning object** representing one astrological configuration under multiple valid frames.

A bundle:

* Never contains a single “truth”  
* Never collapses into keywords  
* Never encodes prediction

Instead, it offers **curated interpretive options**.

---

## **3\. Bundle Eligibility Rules**

Bundles may be created for:

* Common planetary transits  
* Repeating aspect patterns  
* High-salience configurations  
* Editorially significant themes

Bundles may **not** be created for:

* Rare edge cases without review  
* One-off poetic ideas  
* Unvetted metaphors

---

## **4\. Canonical Bundle Schema**

Every bundle must conform to the following structure.

### **4.1 Bundle Identity**

* `bundle_id` — stable identifier  
* `configuration_signature` — normalized astro signature  
* `planetary_functions` — referenced planet IDs  
* `sign_environment` — referenced sign IDs  
* `aspect_type` — if applicable  
* `salience_class` — primary / secondary / background

---

### **4.2 Interpretive Frames (Required)**

Each bundle must include **multiple frames**, each tagged by lens.

Each frame contains:

* `lens_type` — psychological / relational / somatic / systems / etc.  
* `core_dynamic` — one-sentence description  
* `experiential_markers` — how this tends to feel  
* `attention_pull` — where awareness is drawn  
* `growth_vector` — non-moralized development direction  
* `language_examples` — approved phrasing patterns

Minimum frames per bundle: **3**  
Maximum frames per bundle: **7**

---

### **4.3 Shadow Frame (Required)**

Each bundle must include a **shadow expression**, framed as:

* Defensive pattern  
* Avoidance strategy  
* Misallocation of energy

Shadow frames must:

* Avoid pathology  
* Avoid blame  
* Avoid inevitability

---

### **4.4 Guardrails (Required)**

Each bundle must explicitly state:

* `prohibited_claims`  
* `language_to_avoid`  
* `common_misreads`

These are enforced at generation time.

---

### **4.5 Freshness & Rotation Metadata**

Each bundle includes:

* `freshness_group` — A / B / C (used for rotation)  
* `cooldown_days` — minimum reuse interval  
* `preferred_lenses` — ranked list  
* `disallowed_lenses` — if any

This prevents overuse and tonal stagnation.

---

### **4.6 Source Notes (Internal Only)**

* `source_lineage` — texts, schools, or frameworks synthesized  
* `canon_alignment_check` — pass/fail  
* `last_reviewed` — date  
* `review_owner` — human or system

Never surfaced to listeners.

---

## **5\. Example (Abstracted, Non-Exhaustive)**

**Configuration:** Saturn square Mercury

**Frames might include:**

* Psychological: cognitive load and patience with thinking  
* Systems: communication bottlenecks in existing processes  
* Somatic: mental fatigue and pacing  
* Shadow: self-criticism masquerading as rigor

Each frame is separate, selectable, and rotatable.

No single frame dominates.

---

## **6\. Consumption Rules (Agent-Side)**

Agents must:

* Select **one primary frame**  
* Optionally reference **one secondary frame**  
* Never merge more than two frames in short-form output  
* Respect cooldown and lens rotation rules

If no valid frame is available:

* Suppress the configuration  
* Do not improvise

---

## **7\. Anti-Hallucination Policy**

Agents are **not allowed** to:

* Invent interpretations  
* Synthesize meaning not present in bundles  
* Extend metaphors beyond stored material

If coverage is missing:

* Flag for bundle creation  
* Do not “fill the gap”

---

## **8\. Editorial Planner Interface**

The editorial planner:

* Sees available bundles  
* Tracks recent usage  
* Enforces cooldowns  
* Chooses frame/lens alignment with arc position

Meaning selection is **explicit**, not emergent.

---

## **9\. Enforcement Notes**

Violations include:

* Single-frame bundles  
* Missing shadow expressions  
* Absent guardrails  
* Reuse without cooldown  
* Improvised meaning

Violations trigger:

* Hard failure  
* Bundle rejection  
* QA escalation

---

## **10\. Lock Statement**

This bundle system is **locked**.

All interpretation must route through:

facts → bundles → frames → voice

No shortcuts.

