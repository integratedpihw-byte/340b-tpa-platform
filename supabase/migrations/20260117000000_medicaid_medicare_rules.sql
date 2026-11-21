-- Item 5: Medicaid Exclusion File (MEF) comparison, state Medicaid rule notes, payer details on
-- prescriptions, and Medicare 340B modifier edge cases.
--
-- Facts these rules rest on (HRSA / CMS, checked November 2026):
--  * The MEF covers Medicaid fee-for-service only, not managed care. A carve-in site lists each Medicaid
--    state it bills and the billing number(s) (NPI, state Medicaid number, or both). A carve-out site must
--    not be listed. Changes take effect on the first day of the following quarter.
--  * Contract pharmacies may not use 340B drugs for Medicaid fee-for-service patients unless an arrangement
--    with the state Medicaid agency prevents duplicate discounts and is reported to HRSA.
--  * States decide how 340B claims are identified in Medicaid managed care, so state rules are kept as
--    notes the organization maintains. No state-specific rule is built in.
--  * Medicare Part B: modifier JG or TB on separately payable 340B drugs for dates of service in 2024
--    (all 340B covered entities); TB only from 1 January 2025.
--  * CMS finalized a new Medicare payment rate for 340B-acquired drugs for 2027. The 2027 modifier
--    instructions were not confirmed, so dates of service from 2027 get a review prompt, not a correction.

-- ---------- columns on existing tables ----------
alter table public.prescriptions
  add column if not exists payer_type text
    check (payer_type in ('medicaid_ffs', 'medicaid_mco', 'medicare_b', 'medicare_d', 'commercial', 'uninsured', 'other')),
  add column if not exists medicaid_state text check (medicaid_state ~ '^[A-Z]{2}$');

alter table public.dispensing_records
  add column if not exists claim_340b_identified boolean not null default false;

alter table public.pharmacy_contracts
  add column if not exists medicaid_arrangement boolean not null default false;

alter table public.medicare_claims
  add column if not exists jg_modifier_applied boolean not null default false,
  add column if not exists separately_payable boolean not null default true,
  add column if not exists identifier_340b_applied boolean not null default false;

alter table public.medicaid_enrollments
  add column if not exists mef_checked_at timestamptz;

-- ---------- helper: compare billing numbers ignoring punctuation, case and leading zeros ----------
create or replace function public.norm_id(t text) returns text
language sql immutable set search_path = ''
as $$ select nullif(regexp_replace(regexp_replace(upper(coalesce(t, '')), '[^A-Z0-9]', '', 'g'), '^0+', ''), '') $$;
revoke execute on function public.norm_id(text) from public, anon;
grant execute on function public.norm_id(text) to authenticated;

-- ---------- MEF rows (only this organization's 340B IDs are ever stored) ----------
create table public.mef_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  quarter_start date not null
    check (extract(day from quarter_start) = 1 and extract(month from quarter_start) in (1, 4, 7, 10)),
  opais_id text not null,
  medicaid_state text not null check (medicaid_state ~ '^[A-Z]{2}$'),
  medicaid_provider_number text,
  npi text,
  entity_name text,
  source_file text,
  created_at timestamptz not null default now()
);
create index mef_entries_org_id_idx on public.mef_entries (org_id, quarter_start);

-- One row per uploaded quarter, so "a file was uploaded" is known even when none of its rows belong to this organization.
create table public.mef_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  quarter_start date not null
    check (extract(day from quarter_start) = 1 and extract(month from quarter_start) in (1, 4, 7, 10)),
  source_file text,
  row_count integer not null default 0,
  uploaded_at timestamptz not null default now(),
  unique (org_id, quarter_start)
);

-- ---------- state rule notes, maintained by the organization ----------
create table public.state_medicaid_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  state text not null check (state ~ '^[A-Z]{2}$'),
  mco_identifier_method text not null default 'unknown'
    check (mco_identifier_method in ('unknown', 'none', 'scc_20', 'modifier', 'other')),
  contract_pharmacy_medicaid text not null default 'unknown'
    check (contract_pharmacy_medicaid in ('unknown', 'not_allowed', 'allowed_by_arrangement')),
  summary text,
  source_url text,
  last_reviewed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, state)
);
create index state_medicaid_rules_org_id_idx on public.state_medicaid_rules (org_id);

do $$
declare t text; perm text;
begin
  for t, perm in select * from (values ('mef_entries', 'mef.write'), ('mef_files', 'mef.write'), ('state_medicaid_rules', 'state_rule.write')) v(t, perm) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (org_id = auth_org_id() or is_platform_admin())', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check ((org_id = auth_org_id() and auth_has_permission(%L)) or is_platform_admin())', t || '_insert', t, perm);
    execute format('create policy %I on public.%I for update using ((org_id = auth_org_id() and auth_has_permission(%L)) or is_platform_admin())', t || '_update', t, perm);
    execute format('create policy %I on public.%I for delete using ((org_id = auth_org_id() and auth_has_permission(%L)) or is_platform_admin())', t || '_delete', t, perm);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function audit_trigger()', 'audit_' || t, t);
    execute format('create trigger zz_enforce_same_org before insert or update on public.%I for each row execute function enforce_same_org()', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

create trigger set_updated_at_state_medicaid_rules before update on public.state_medicaid_rules
  for each row execute function set_updated_at();

update public.roles
   set permissions = permissions || '["mef.write", "state_rule.write"]'::jsonb
 where org_id is null and name = 'org_admin' and not (permissions ? 'mef.write');

-- ---------- replace one quarter's MEF rows in a single step ----------
create or replace function public.replace_mef_entries(p_org uuid, p_quarter date, p_rows jsonb, p_source text default null)
returns integer
language plpgsql
set search_path = public
as $fn$
declare v_n integer;
begin
  if not (is_platform_admin() or (p_org = auth_org_id() and auth_has_permission('mef.write'))) then
    raise exception 'You do not have permission to import Medicaid Exclusion File data.' using errcode = '42501';
  end if;
  if p_quarter is null or extract(day from p_quarter) <> 1 or extract(month from p_quarter) not in (1, 4, 7, 10) then
    raise exception 'The quarter must start on 1 January, 1 April, 1 July or 1 October.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Send an array of at most 2,000 rows.' using errcode = '22023';
  end if;

  delete from mef_entries where org_id = p_org and quarter_start = p_quarter;
  insert into mef_entries (org_id, quarter_start, opais_id, medicaid_state, medicaid_provider_number, npi, entity_name, source_file)
  select p_org, p_quarter, btrim(r.opais_id), upper(btrim(r.medicaid_state)),
         nullif(btrim(r.medicaid_provider_number), ''), nullif(btrim(r.npi), ''), nullif(btrim(r.entity_name), ''), p_source
    from jsonb_to_recordset(p_rows) as r(opais_id text, medicaid_state text, medicaid_provider_number text, npi text, entity_name text)
   where nullif(btrim(r.opais_id), '') is not null and upper(btrim(r.medicaid_state)) ~ '^[A-Z]{2}$';
  get diagnostics v_n = row_count;

  insert into mef_files (org_id, quarter_start, source_file, row_count)
  values (p_org, p_quarter, p_source, v_n)
  on conflict (org_id, quarter_start) do update
    set source_file = excluded.source_file, row_count = excluded.row_count, uploaded_at = now();
  return v_n;
end
$fn$;
revoke execute on function public.replace_mef_entries(uuid, date, jsonb, text) from public, anon;
grant execute on function public.replace_mef_entries(uuid, date, jsonb, text) to authenticated;

-- ---------- MEF comparison: one row per active Medicaid enrollment ----------
-- Compared at covered-entity level (the 340B ID on the covered entity). The latest uploaded quarter is used.
create or replace view public.mef_comparison with (security_invoker = true) as
with latest as (
  select org_id, max(quarter_start) as q from public.mef_files group by org_id
), enr as (
  select e.org_id, e.id as enrollment_id, e.covered_entity_id, ce.opais_id, ce.medicaid_billing_method as method,
         upper(nullif(btrim(e.state), '')) as state, nullif(btrim(e.medicaid_provider_number), '') as num,
         coalesce(ce.name, ce.opais_id, ce.registration_number, ce.entity_type) as entity_label
    from public.medicaid_enrollments e join public.covered_entities ce on ce.id = e.covered_entity_id
   where e.status = 'active' and ce.status <> 'terminated'
), cmp as (
  select enr.*, l.q,
         m.n_listed, m.n_number_ok
    from enr
    left join latest l on l.org_id = enr.org_id
    left join lateral (
      select count(*) as n_listed,
             count(*) filter (where public.norm_id(enr.num) is not null
                                and (public.norm_id(f.medicaid_provider_number) = public.norm_id(enr.num)
                                     or public.norm_id(f.npi) = public.norm_id(enr.num))) as n_number_ok
        from public.mef_entries f
       where f.org_id = enr.org_id and f.quarter_start = l.q
         and upper(btrim(f.opais_id)) = upper(btrim(enr.opais_id)) and f.medicaid_state = enr.state
    ) m on true
), st as (
  select cmp.*,
         case
           when q is null then 'no_file'
           when opais_id is null then 'no_340b_id'
           when state is null then 'no_state'
           when method is null then 'method_missing'
           when method = 'carve_out' then case when n_listed > 0 then 'listed_but_carve_out' else 'matched' end
           when n_listed = 0 then 'not_listed'
           when public.norm_id(num) is not null and n_number_ok = 0 then 'number_mismatch'
           else 'matched'
         end as status
    from cmp
)
select st.org_id, st.enrollment_id, st.covered_entity_id, st.entity_label, st.opais_id, st.state,
       st.num as enrollment_number, st.method as billing_method, st.q as quarter_start, st.status,
       case st.status
         when 'no_file' then 'No Medicaid Exclusion File has been uploaded yet.'
         when 'no_340b_id' then 'The covered entity has no 340B ID recorded, so it cannot be looked up on the file.'
         when 'no_state' then 'The enrollment has no state, so it cannot be looked up on the file.'
         when 'method_missing' then 'The covered entity has no carve-in or carve-out choice recorded.'
         when 'listed_but_carve_out' then 'The file lists this 340B ID for this state, but the entity is recorded as carve-out. A carve-out site should not be listed.'
         when 'not_listed' then 'The file does not list this 340B ID for this state, but the entity is recorded as carve-in.'
         when 'number_mismatch' then 'Listed, but neither the Medicaid number nor the NPI on the file matches the number on this enrollment.'
         else 'Consistent with the file.'
       end as detail
  from st;

revoke all on public.mef_comparison from anon;

-- Copy the comparison into the enrollment "MEF match status" field (a person chooses to do this).
create or replace function public.apply_mef_comparison(p_org uuid)
returns integer
language plpgsql
set search_path = public
as $fn$
declare v_n integer;
begin
  if not (is_platform_admin() or (p_org = auth_org_id() and auth_has_permission('medicaid_enrollment.write'))) then
    raise exception 'You do not have permission to change Medicaid enrollments.' using errcode = '42501';
  end if;
  update medicaid_enrollments e
     set mef_match_status = case
           when c.status = 'matched' and c.billing_method = 'carve_in' then 'matched'
           when c.status = 'matched' then 'not_applicable'
           else 'unmatched' end,
         mef_checked_at = now()
    from mef_comparison c
   where c.enrollment_id = e.id and e.org_id = p_org
     and c.status in ('matched', 'not_listed', 'number_mismatch', 'listed_but_carve_out');
  get diagnostics v_n = row_count;
  return v_n;
end
$fn$;
revoke execute on function public.apply_mef_comparison(uuid) from public, anon;
grant execute on function public.apply_mef_comparison(uuid) to authenticated;

-- ---------- finding rules ----------
-- The existing candidate view keeps its rules under a new name; the public name now adds the new rules.
alter view public.engine_finding_candidates rename to engine_finding_candidates_base;

create or replace view public.engine_finding_candidates_item5 with (security_invoker = true) as
  -- MEF comparison
  select c.org_id, c.covered_entity_id, null::uuid as facility_id, 'duplicate_discount'::text as finding_type, 'high'::text as severity,
         'MCD-MEF-NOT-LISTED'::text as rule_code, 'MCD-MEF-NOT-LISTED:' || c.enrollment_id as dedupe_key,
         format('%s: recorded as carve-in for %s, but the %s Medicaid Exclusion File does not list 340B ID %s for that state. Until it is listed, states and manufacturers may not exclude these drugs from Medicaid rebates. Changes take effect from the first day of the following quarter.',
                c.entity_label, c.state, to_char(c.quarter_start, 'YYYY-"Q"Q'), c.opais_id) as description,
         jsonb_build_object('medicaid_enrollment_id', c.enrollment_id, 'state', c.state, 'opais_id', c.opais_id, 'mef_quarter', c.quarter_start) as evidence
    from public.mef_comparison c where c.status = 'not_listed'
  union all
  select c.org_id, c.covered_entity_id, null::uuid, 'duplicate_discount', 'medium', 'MCD-MEF-NUMBER-MISMATCH',
         'MCD-MEF-NUMBER-MISMATCH:' || c.enrollment_id,
         format('%s: 340B ID %s is listed for %s on the %s file, but neither the Medicaid number nor the NPI listed matches %s on this enrollment. Check which billing number is used on claims to the state and correct the file or the enrollment.',
                c.entity_label, c.opais_id, c.state, to_char(c.quarter_start, 'YYYY-"Q"Q'), c.enrollment_number),
         jsonb_build_object('medicaid_enrollment_id', c.enrollment_id, 'state', c.state, 'opais_id', c.opais_id, 'enrollment_number', c.enrollment_number, 'mef_quarter', c.quarter_start)
    from public.mef_comparison c where c.status = 'number_mismatch'
  union all
  select c.org_id, c.covered_entity_id, null::uuid, 'duplicate_discount', 'medium', 'MCD-MEF-LISTED-CARVEOUT',
         'MCD-MEF-LISTED-CARVEOUT:' || c.enrollment_id,
         format('%s: recorded as carve-out for %s, but the %s Medicaid Exclusion File lists 340B ID %s for that state. HRSA says a carve-out site should not be listed. Decide which is correct and change the listing or the record.',
                c.entity_label, c.state, to_char(c.quarter_start, 'YYYY-"Q"Q'), c.opais_id),
         jsonb_build_object('medicaid_enrollment_id', c.enrollment_id, 'state', c.state, 'opais_id', c.opais_id, 'mef_quarter', c.quarter_start)
    from public.mef_comparison c where c.status = 'listed_but_carve_out'
  union all
  -- the uploaded file is older than the current calendar quarter
  select x.org_id, x.covered_entity_id, null::uuid, 'other', 'low', 'MCD-MEF-STALE',
         'MCD-MEF-STALE:' || x.covered_entity_id,
         format('%s: the latest Medicaid Exclusion File uploaded is for %s. A newer quarterly file should be available; upload it and re-check.',
                x.entity_label, to_char(x.q, 'YYYY-"Q"Q')),
         jsonb_build_object('latest_mef_quarter', x.q)
    from (select distinct c.org_id, c.covered_entity_id, c.entity_label, c.quarter_start as q
            from public.mef_comparison c
           where c.quarter_start is not null and c.quarter_start < date_trunc('quarter', current_date)::date) x
  union all
  -- state rule notes
  select s.org_id, s.covered_entity_id, null::uuid, 'other', 'low', 'MCD-STATE-RULE-MISSING',
         'MCD-STATE-RULE-MISSING:' || s.covered_entity_id || ':' || s.state,
         format('There is an active Medicaid enrollment in %s but no note of that state''s 340B Medicaid policy. States set their own ways to identify 340B claims, so record what %s requires.', s.state, s.state),
         jsonb_build_object('state', s.state)
    from (select distinct e.org_id, e.covered_entity_id, upper(btrim(e.state)) as state
            from public.medicaid_enrollments e
           where e.status = 'active' and nullif(btrim(e.state), '') is not null) s
   where not exists (select 1 from public.state_medicaid_rules r where r.org_id = s.org_id and r.state = s.state)
  union all
  select s.org_id, s.covered_entity_id, null::uuid, 'other', 'low', 'MCD-STATE-RULE-STALE',
         'MCD-STATE-RULE-STALE:' || s.covered_entity_id || ':' || s.state,
         format('The note of %s''s 340B Medicaid policy was last reviewed %s. Check the state''s current policy and update the review date.', s.state, coalesce(r.last_reviewed_on::text, 'never')),
         jsonb_build_object('state', s.state, 'last_reviewed_on', r.last_reviewed_on)
    from (select distinct e.org_id, e.covered_entity_id, upper(btrim(e.state)) as state
            from public.medicaid_enrollments e
           where e.status = 'active' and nullif(btrim(e.state), '') is not null) s
    join public.state_medicaid_rules r on r.org_id = s.org_id and r.state = s.state
   where r.last_reviewed_on is null or r.last_reviewed_on < current_date - 365
  union all
  -- 340B drugs used for Medicaid fee-for-service while the entity carves out
  select p.org_id, p.covered_entity_id, d.facility_id, 'duplicate_discount', 'high', 'RX-MCD-CARVEOUT-340B',
         'RX-MCD-CARVEOUT-340B:' || d.id,
         format('Medicaid fee-for-service prescription dispensed at 340B pricing, but the covered entity is recorded as carve-out (%s, Rx %s). Under carve-out, drugs billed to Medicaid must be bought outside 340B.', p.drug_name, coalesce(p.rx_number, p.id::text)),
         jsonb_build_object('dispensing_id', d.id, 'prescription_id', p.id, 'rx_number', p.rx_number, 'drug', p.drug_name, 'medicaid_state', p.medicaid_state)
    from public.dispensing_records d
    join public.prescriptions p on p.id = d.prescription_id
    join public.covered_entities ce on ce.id = p.covered_entity_id
   where d.pricing_tier = '340b' and p.payer_type = 'medicaid_ffs' and ce.medicaid_billing_method = 'carve_out'
  union all
  -- carve-in entity bills a state it has no active enrollment for
  select p.org_id, p.covered_entity_id, d.facility_id, 'duplicate_discount', 'medium', 'RX-MCD-STATE-NOT-LISTED',
         'RX-MCD-STATE-NOT-LISTED:' || d.id,
         format('Medicaid fee-for-service prescription for %s dispensed at 340B pricing, but there is no active Medicaid enrollment for %s on this covered entity (%s, Rx %s). A carve-in site must list each state it bills.', p.medicaid_state, p.medicaid_state, p.drug_name, coalesce(p.rx_number, p.id::text)),
         jsonb_build_object('dispensing_id', d.id, 'prescription_id', p.id, 'rx_number', p.rx_number, 'medicaid_state', p.medicaid_state)
    from public.dispensing_records d
    join public.prescriptions p on p.id = d.prescription_id
    join public.covered_entities ce on ce.id = p.covered_entity_id
   where d.pricing_tier = '340b' and p.payer_type = 'medicaid_ffs' and ce.medicaid_billing_method = 'carve_in'
     and p.medicaid_state is not null
     and not exists (select 1 from public.medicaid_enrollments e
                      where e.covered_entity_id = p.covered_entity_id and e.status = 'active' and upper(btrim(e.state)) = p.medicaid_state)
  union all
  -- contract pharmacy used for Medicaid fee-for-service without a reported arrangement
  select p.org_id, p.covered_entity_id, d.facility_id, 'contract_pharmacy_violation', 'high', 'RX-MCD-CP-NO-ARRANGEMENT',
         'RX-MCD-CP-NO-ARRANGEMENT:' || d.id,
         format('Medicaid fee-for-service prescription dispensed at 340B pricing through a contract pharmacy with no Medicaid arrangement recorded (%s, Rx %s). HRSA expects contract pharmacies to carve out Medicaid unless an arrangement with the state prevents duplicate discounts and is reported to HRSA.', p.drug_name, coalesce(p.rx_number, p.id::text)),
         jsonb_build_object('dispensing_id', d.id, 'prescription_id', p.id, 'rx_number', p.rx_number, 'pharmacy_facility_id', d.facility_id)
    from public.dispensing_records d
    join public.prescriptions p on p.id = d.prescription_id
   where d.pricing_tier = '340b' and p.payer_type = 'medicaid_ffs'
     and exists (select 1 from public.pharmacy_contracts pc
                  where pc.pharmacy_facility_id = d.facility_id and pc.covered_entity_id = p.covered_entity_id and pc.status = 'active')
     and not exists (select 1 from public.pharmacy_contracts pc
                      where pc.pharmacy_facility_id = d.facility_id and pc.covered_entity_id = p.covered_entity_id and pc.status = 'active' and pc.medicaid_arrangement)
  union all
  -- managed care claim without the 340B identifier, only where the organization recorded that the state requires one
  select p.org_id, p.covered_entity_id, d.facility_id, 'duplicate_discount', 'medium', 'RX-MCD-MCO-NO-ID',
         'RX-MCD-MCO-NO-ID:' || d.id,
         format('Medicaid managed care prescription for %s dispensed at 340B pricing without a 340B claim identifier recorded (%s, Rx %s). Your note for %s says an identifier is used (%s).', p.medicaid_state, p.drug_name, coalesce(p.rx_number, p.id::text), p.medicaid_state, r.mco_identifier_method),
         jsonb_build_object('dispensing_id', d.id, 'prescription_id', p.id, 'rx_number', p.rx_number, 'medicaid_state', p.medicaid_state, 'identifier_method', r.mco_identifier_method)
    from public.dispensing_records d
    join public.prescriptions p on p.id = d.prescription_id
    join public.state_medicaid_rules r on r.org_id = p.org_id and r.state = p.medicaid_state
   where d.pricing_tier = '340b' and p.payer_type = 'medicaid_mco' and not d.claim_340b_identified
     and r.mco_identifier_method in ('scc_20', 'modifier', 'other');

create or replace view public.engine_finding_candidates with (security_invoker = true) as
  -- once a Medicaid Exclusion File has been uploaded, the file comparison replaces the manual "unmatched" flag
  select b.* from public.engine_finding_candidates_base b
   where not (b.rule_code = 'MCD-MEF-UNMATCHED'
              and exists (select 1 from public.mef_comparison c
                           where c.enrollment_id::text = b.evidence ->> 'medicaid_enrollment_id' and c.status <> 'no_file'))
  union all
  select i.* from public.engine_finding_candidates_item5 i;

revoke all on public.engine_finding_candidates_item5, public.engine_finding_candidates from anon;

-- ---------- Medicare claim exception rules ----------
create or replace view public.engine_exception_candidates with (security_invoker = true) as
  -- 2025 and 2026: TB on separately payable Part B 340B drugs
  select m.org_id, m.id as medicare_claim_id, 'missing_modifier'::text as exception_type, 'MCR-TB-MISSING'::text as rule_code,
         'MCR-TB-MISSING:' || m.id as dedupe_key,
         format('Part B claim %s (service date %s) is for a prescription dispensed at 340B pricing but the TB modifier is not recorded. CMS requires the TB modifier on separately payable Part B drugs acquired through 340B for dates of service on or after 1 January 2025. Confirm the drug is separately payable and correct the claim if so.',
                coalesce(m.claim_number, m.id::text), m.claim_date) as description,
         jsonb_build_object('medicare_claim_id', m.id, 'claim_number', m.claim_number, 'claim_date', m.claim_date, 'prescription_id', m.prescription_id) as evidence
    from public.medicare_claims m
   where m.part = 'B' and not m.tb_modifier_applied and not m.jg_modifier_applied
     and m.claim_date >= date '2025-01-01' and m.claim_date < date '2027-01-01'
     and m.separately_payable and m.status <> 'denied'
     and exists (select 1 from public.dispensing_records d where d.prescription_id = m.prescription_id and d.pricing_tier = '340b')
  union all
  -- 2024: JG or TB was required for every 340B covered entity
  select m.org_id, m.id, 'missing_modifier', 'MCR-340B-MOD-2024', 'MCR-340B-MOD-2024:' || m.id,
         format('Part B claim %s (service date %s) is for a prescription dispensed at 340B pricing but neither the JG nor the TB modifier is recorded. For dates of service in 2024 CMS required one of them from all 340B covered entities on separately payable Part B drugs. Confirm the drug is separately payable and correct the claim if so.',
                coalesce(m.claim_number, m.id::text), m.claim_date),
         jsonb_build_object('medicare_claim_id', m.id, 'claim_number', m.claim_number, 'claim_date', m.claim_date, 'prescription_id', m.prescription_id)
    from public.medicare_claims m
   where m.part = 'B' and not m.tb_modifier_applied and not m.jg_modifier_applied
     and m.claim_date >= date '2024-01-01' and m.claim_date < date '2025-01-01'
     and m.separately_payable and m.status <> 'denied'
     and exists (select 1 from public.dispensing_records d where d.prescription_id = m.prescription_id and d.pricing_tier = '340b')
  union all
  -- 2025 and 2026: JG alone is no longer enough
  select m.org_id, m.id, 'missing_modifier', 'MCR-JG-AFTER-2025', 'MCR-JG-AFTER-2025:' || m.id,
         format('Part B claim %s (service date %s) carries the JG modifier without TB. From 1 January 2025 CMS requires TB, even where JG was used before. Correct the claim if the drug is separately payable.',
                coalesce(m.claim_number, m.id::text), m.claim_date),
         jsonb_build_object('medicare_claim_id', m.id, 'claim_number', m.claim_number, 'claim_date', m.claim_date)
    from public.medicare_claims m
   where m.part = 'B' and m.jg_modifier_applied and not m.tb_modifier_applied
     and m.claim_date >= date '2025-01-01' and m.claim_date < date '2027-01-01'
     and m.separately_payable and m.status <> 'denied'
  union all
  -- 2027 onward: new Medicare payment rate for 340B drugs; modifier instructions to be confirmed
  select m.org_id, m.id, 'other', 'MCR-340B-MOD-2027-REVIEW', 'MCR-340B-MOD-2027-REVIEW:' || m.id,
         format('Part B claim %s (service date %s) is for a prescription dispensed at 340B pricing and has no 340B modifier. CMS finalized a new payment rate for 340B-acquired drugs for 2027. Check CMS''s current billing-modifier instructions for these dates of service before changing the claim.',
                coalesce(m.claim_number, m.id::text), m.claim_date),
         jsonb_build_object('medicare_claim_id', m.id, 'claim_number', m.claim_number, 'claim_date', m.claim_date)
    from public.medicare_claims m
   where m.part = 'B' and not m.tb_modifier_applied and not m.jg_modifier_applied
     and m.claim_date >= date '2027-01-01' and m.separately_payable and m.status <> 'denied'
     and exists (select 1 from public.dispensing_records d where d.prescription_id = m.prescription_id and d.pricing_tier = '340b')
  union all
  -- 340B modifier on a claim whose prescription was never dispensed at 340B pricing
  select m.org_id, m.id, 'other', 'MCR-TB-UNSUPPORTED', 'MCR-TB-UNSUPPORTED:' || m.id,
         format('Part B claim %s carries the 340B modifier but no dispensing record for its prescription is at 340B pricing. Check the acquisition source.', coalesce(m.claim_number, m.id::text)),
         jsonb_build_object('medicare_claim_id', m.id, 'claim_number', m.claim_number, 'prescription_id', m.prescription_id)
    from public.medicare_claims m
   where m.part = 'B' and (m.tb_modifier_applied or m.jg_modifier_applied) and m.prescription_id is not null
     and exists (select 1 from public.dispensing_records d where d.prescription_id = m.prescription_id)
     and not exists (select 1 from public.dispensing_records d where d.prescription_id = m.prescription_id and d.pricing_tier = '340b')
  union all
  -- TB is a Part B claim modifier
  select m.org_id, m.id, 'other', 'MCR-TB-ON-PART-D', 'MCR-TB-ON-PART-D:' || m.id,
         format('Part D claim %s is marked with the TB modifier. TB is a Part B claim modifier; Part D claims identify 340B with the Submission Clarification Code or Submission Type Code. Check how this claim was recorded.', coalesce(m.claim_number, m.id::text)),
         jsonb_build_object('medicare_claim_id', m.id, 'claim_number', m.claim_number)
    from public.medicare_claims m
   where m.part = 'D' and m.tb_modifier_applied
  union all
  -- Part D claim for 340B dispensing with no 340B identifier
  select m.org_id, m.id, 'other', 'MCR-PARTD-ID-MISSING', 'MCR-PARTD-ID-MISSING:' || m.id,
         format('Part D claim %s (service date %s) is for a prescription dispensed at 340B pricing and no 340B identifier is recorded. CMS expects plans to pass through the 340B codes (Submission Clarification Code 20, Submission Type Code AA) that pharmacies supply. Whether the pharmacy supplies them may depend on your contract and the plan, so confirm what applies.',
                coalesce(m.claim_number, m.id::text), m.claim_date),
         jsonb_build_object('medicare_claim_id', m.id, 'claim_number', m.claim_number, 'claim_date', m.claim_date)
    from public.medicare_claims m
   where m.part = 'D' and not m.identifier_340b_applied and m.claim_date >= date '2025-01-01' and m.status <> 'denied'
     and exists (select 1 from public.dispensing_records d where d.prescription_id = m.prescription_id and d.pricing_tier = '340b');

revoke all on public.engine_exception_candidates from anon;
