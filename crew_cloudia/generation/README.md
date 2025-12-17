## Generation Boundary
- `generateSegmentDraft` is the single entrypoint for segment drafting.
- Inputs (high level): `EpisodeEditorialPlan`, `SegmentPromptInput`, `SegmentWritingContract`, `EpisodeValidationResult`.
- Output: `SegmentGenerationResult` containing draft text, metadata, contract violations, and canon flags.

## Prompt Assembly
- `buildSegmentPrompt` composes the prompt using, in order: editorial plan, segment payload, writing contract, and validation context.
- Contracts and plan define obligations; payload supplies segment-specific intent and tags. No hidden augmentation.

## LLM Invocation
- Single-pass, deterministic call via `invokeLLM` with `CLOUDIA_LLM_CONFIG`.
- No retries, fallbacks, or sampling variation inside this module. Errors surface immediately.

## Enforcement Model
- Required sections: structural sections must appear (matched after normalization of the draft: lowercase, punctuation stripped, whitespace collapsed to underscores). Semantic sections are obligations but not auto-flagged.
- Contract violations include missing structural sections, word-count bounds, and forbidden phrases (substring match).
- Canon flags are lightweight heuristics for overconfident future language; they do not block generation.
- The generator does not decide publication, gating, or retries; it only reports.

## Inspection Workflow
- Local runners `run-intro.ts` and `run-main-themes.ts` invoke `generateSegmentDraft` for inspection.
- Purpose: human review of prompt, output, and self-checks. These are not tuning loops or automated retries.
# Segment Generation Boundary

This module defines the **single allowed entrypoint** for producing a draft
script for a Cloudia segment.

## What this does
- Generates exactly one draft for one segment
- Enforces editorial and contract preconditions
- Surfaces violations without resolving them

## What this explicitly does NOT do
- Retry or loop
- Persist data
- Score quality
- Trigger rewrites
- Generate audio
- Inspect other segment drafts

If you need any of the above, you are in the wrong layer.

## Inputs are authoritative
- EpisodeEditorialPlan overrides everything
- SegmentWritingContract is a hard contract
- EpisodeValidationResult is read-only context

Violating this boundary will reintroduce silent drift.

