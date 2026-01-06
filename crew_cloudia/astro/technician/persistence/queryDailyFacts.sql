-- Example queries for astrology_daily_facts table

-- Get facts for a specific date
SELECT * FROM astrology_daily_facts 
WHERE episode_date = '2024-01-15';

-- Get facts with extracted counts
SELECT 
  episode_date,
  technician_policy_version,
  technician_schema_version,
  jsonb_array_length(facts->'transits_primary') as primary_count,
  jsonb_array_length(facts->'transits_secondary') as secondary_count,
  jsonb_array_length(facts->'background_conditions') as background_count,
  jsonb_array_length(facts->'excluded') as excluded_count,
  generated_at
FROM astrology_daily_facts
ORDER BY episode_date DESC
LIMIT 10;

-- Get all retrogrades for a date range
SELECT 
  episode_date,
  condition->>'body' as retrograde_body
FROM astrology_daily_facts,
  jsonb_array_elements(facts->'background_conditions') as condition
WHERE condition->>'kind' = 'retrograde'
  AND episode_date BETWEEN '2024-01-01' AND '2024-12-31'
ORDER BY episode_date, retrograde_body;

-- Get all primary transits for a specific date
SELECT 
  episode_date,
  transit->>'body_a' as body_a,
  transit->>'body_b' as body_b,
  transit->>'aspect_type' as aspect_type,
  (transit->>'orb_deg')::float as orb_deg,
  (transit->>'is_exact')::boolean as is_exact
FROM astrology_daily_facts,
  jsonb_array_elements(facts->'transits_primary') as transit
WHERE episode_date = '2024-01-15'
ORDER BY orb_deg;

