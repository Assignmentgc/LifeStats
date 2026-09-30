# LifeStats

LifeStats measures one overall **Life** score from exactly six core statistics:
Health, Intellect, Progress, Social, Prosperity, and Purpose.

- A substat is scored by averaging its 0–100 measurements.
- A core score is the average of all of its substats.
- Life is the unweighted average of the six core scores.
- `score_history` stores daily snapshots. The `get_my_score_trends` RPC rolls
  those snapshots into daily, weekly, monthly, or yearly series.

Apply the Supabase migrations before using the statistics screens. The latest
migration seeds the 52 requested default substats and lets a user add more to
an existing core without creating a seventh core category.
