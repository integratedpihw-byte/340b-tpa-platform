-- Several pages ask for a covered entity's display name, but the column was never created.
alter table public.covered_entities add column name text;
