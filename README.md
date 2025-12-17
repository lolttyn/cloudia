## What Cloudia Is
- Governed, layered AI editorial system for daily multi-segment content.
- Optimized for correctness, voice consistency, and automation readiness (not automation itself).

## Core Design Principles
- Layered authority: facts → interpretation → editorial governance → voice.
- Contracts before creativity; prompts reflect obligations first.
- Determinism over retries; single-pass generations fail fast on errors.
- Violations are signal, not noise; enforcement is explicit.

## System Layers (Brief)
- Layer 0: Astronomical data (Swiss Ephemeris source available).
- Layer 1: Astrological facts.
- Layer 2: Interpretation.
- Layer 3: Editorial governance (segment contracts, required sections).
- Layer 4: Voice (Cloudia showrunner).
- Layers 0–3 are structured; Layer 4 is expressive. Generation currently exercises Layers 3–4 with provided plans and contracts.

## Current State (Truthful)
- Intro and main_themes segment generation proven via local inspection runners.
- Structural vs semantic required-section enforcement active; structural matching is normalized (case/spacing/punctuation) and strict.
- Single-pass generation; no retries or fallbacks.
- Local runners (`run-intro.ts`, `run-main-themes.ts`) support inspection of outputs and self-checks.

## What Is Intentionally Not Built Yet
- Editorial gate / human approval workflow.
- Persistence or versioning of generations.
- Automation or scheduling of runs.
- Publishing pipeline.