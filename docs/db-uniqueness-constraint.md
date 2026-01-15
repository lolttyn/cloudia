# Database Uniqueness Constraint for cloudia_segment_versions

## Fix 3: Add Uniqueness Constraint (Optional but Recommended)

To prevent duplicate attempt numbers for the same `(episode_id, segment_key)` combination, add a unique constraint:

```sql
-- Add unique constraint to prevent duplicate attempt numbers
ALTER TABLE public.cloudia_segment_versions
ADD CONSTRAINT cloudia_segment_versions_episode_segment_attempt_unique
UNIQUE (episode_id, segment_key, attempt_number);
```

### Why This Helps

- **Prevents duplicates**: If any code path tries to insert the same `(episode_id, segment_key, attempt_number)` twice, the database will hard-fail with a clear error
- **Enforces data integrity**: Makes the append-only table's attempt numbering reliable
- **Makes ordering meaningful**: With proper attempt numbering (Fix 2) and this constraint, ordering by `attempt_number` becomes deterministic

### When to Apply

Apply this constraint **after** Fix 2 is deployed and verified, since:
1. Fix 2 ensures attempt numbers increment properly across reruns
2. The constraint will fail if old code tries to insert duplicate attempt numbers
3. Once Fix 2 is live, the constraint provides safety against future bugs

### Rollback

If you need to remove the constraint:

```sql
ALTER TABLE public.cloudia_segment_versions
DROP CONSTRAINT cloudia_segment_versions_episode_segment_attempt_unique;
```
