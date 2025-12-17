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

