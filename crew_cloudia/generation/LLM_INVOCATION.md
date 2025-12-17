# LLM Invocation Contract

This module defines the **only permitted path** by which language models
are invoked in Cloudia.

## Guarantees
- Exactly one model is called per invocation
- Parameters are deterministic
- No retries
- No fallback models
- No hidden orchestration

## Explicitly forbidden
- Segment-specific model tuning
- Silent retries
- Logging prompts or outputs
- Quality judgments
- Auto-correction of output

If prose quality is insufficient, the fix belongs upstream
(in contracts, prompts, or editorial intent),
not here.

