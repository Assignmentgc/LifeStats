-- The complete_quest() return table exposes a stat_name output variable.
-- Prefer table columns for conflicts in the deployed version of this function.
alter function public.complete_quest(uuid)
  set plpgsql.variable_conflict = 'use_column';
