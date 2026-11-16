-- Data import keys, engine tracking, and the reconciliation / risk / opportunity engine.

-- ===== 1. Keys that make CSV re-imports safe (same file twice = same rows, not duplicates) =====
alter table public.prescriptions    add column rx_number text;
alter table public.dispensing_records add column external_ref text;
alter table public.purchase_orders  add column invoice_number text;

create unique index prescriptions_org_rx_uniq        on public.prescriptions (org_id, rx_number);
create unique index dispensing_records_org_ref_uniq  on public.dispensing_records (org_id, external_ref);
create unique index purchase_orders_org_invoice_uniq on public.purchase_orders (org_id, invoice_number, ndc);
create unique index medicare_claims_org_claim_uniq   on public.medicare_claims (org_id, claim_number);

-- ===== 2. Engine output is marked, so people can tell it from hand-entered records =====
alter table public.compliance_findings
  add column source text not null default 'manual' check (source in ('manual', 'engine')),
  add column rule_code text,
  add column evidence jsonb,
  add column dedupe_key text,
  add column last_detected_at timestamptz;
create unique index compliance_findings_org_dedupe_uniq on public.compliance_findings (org_id, dedupe_key);

alter table public.claims_exceptions
  add column source text not null default 'manual' check (source in ('manual', 'engine')),
  add column rule_code text,
  add column evidence jsonb,
  add column dedupe_key text,
  add column last_detected_at timestamptz;
create unique index claims_exceptions_org_dedupe_uniq on public.claims_exceptions (org_id, dedupe_key);

alter table public.opportunities
  add column source text not null default 'manual' check (source in ('manual', 'engine')),
  add column rule_code text,
  add column evidence jsonb,
  add column dedupe_key text,
  add column last_detected_at timestamptz;
create unique index opportunities_org_dedupe_uniq on public.opportunities (org_id, dedupe_key);

-- ===== 3. Run history =====
create table public.engine_runs (
  id uuid not null default gen_random_uuid(),
  org_id uuid not null,
  run_type text not null check (run_type in ('all', 'reconciliation', 'risk', 'opportunities')),
  ran_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb,
  created_at timestamptz not null default now(),
  constraint engine_runs_pkey primary key (id)
);
alter table public.engine_runs add constraint engine_runs_org_id_fkey foreign key (org_id) references organizations(id) on delete cascade;
alter table public.engine_runs add constraint engine_runs_ran_by_fkey foreign key (ran_by) references auth.users(id);
create index engine_runs_org_id_idx on public.engine_runs (org_id, started_at desc);

alter table public.engine_runs enable row level security;
create policy engine_runs_select on public.engine_runs for select using ((org_id = auth_org_id()) or is_platform_admin());
create policy engine_runs_insert on public.engine_runs for insert with check (((org_id = auth_org_id()) and auth_has_permission('engine.run')) or is_platform_admin());
create trigger audit_engine_runs after insert or update or delete on public.engine_runs for each row execute function audit_trigger();
revoke all on public.engine_runs from anon;
revoke update, delete, truncate on public.engine_runs from authenticated;

-- running the engine is an explicit permission
update public.roles set permissions = permissions || '["engine.run"]'::jsonb
 where org_id is null and name = 'org_admin' and not (permissions ? 'engine.run');

-- ===== 4. The rules (views run with the caller's access, so row-level security still applies) =====
create view public.engine_finding_candidates with (security_invoker = true) as
  -- 340B pricing used for a patient whose prescription is marked ineligible
  select p.org_id, p.covered_entity_id, d.facility_id,
         'diversion'::text as finding_type, 'critical'::text as severity,
         'RX-DISP-INELIGIBLE'::text as rule_code,
         'RX-DISP-INELIGIBLE:' || d.id as dedupe_key,
         format('Dispensed at 340B pricing for a prescription marked ineligible (%s, Rx %s).', p.drug_name, coalesce(p.rx_number, p.id::text)) as description,
         jsonb_build_object('dispensing_id', d.id, 'prescription_id', p.id, 'rx_number', p.rx_number, 'drug', p.drug_name,
                            'ndc', d.ndc, 'quantity', d.quantity_dispensed, 'dispensed_at', d.dispensed_at) as evidence
    from public.dispensing_records d join public.prescriptions p on p.id = d.prescription_id
   where d.pricing_tier = '340b' and p.eligibility_status = 'ineligible'
  union all
  -- 340B pricing used before eligibility was reviewed
  select p.org_id, p.covered_entity_id, d.facility_id, 'other', 'high', 'RX-DISP-UNREVIEWED',
         'RX-DISP-UNREVIEWED:' || d.id,
         format('Dispensed at 340B pricing while patient eligibility is still pending review (%s, Rx %s).', p.drug_name, coalesce(p.rx_number, p.id::text)),
         jsonb_build_object('dispensing_id', d.id, 'prescription_id', p.id, 'rx_number', p.rx_number, 'drug', p.drug_name, 'quantity', d.quantity_dispensed)
    from public.dispensing_records d join public.prescriptions p on p.id = d.prescription_id
   where d.pricing_tier = '340b' and p.eligibility_status = 'pending_review'
  union all
  -- 340B dispensing still attached to a reversed or void prescription
  select p.org_id, p.covered_entity_id, d.facility_id, 'other', 'medium', 'RX-DISP-REVERSED',
         'RX-DISP-REVERSED:' || d.id,
         format('Prescription is %s but a 340B-priced dispensing record still exists (%s, Rx %s). Confirm the claim was reversed and the drug returned to stock.', p.status, p.drug_name, coalesce(p.rx_number, p.id::text)),
         jsonb_build_object('dispensing_id', d.id, 'prescription_id', p.id, 'rx_number', p.rx_number, 'prescription_status', p.status)
    from public.dispensing_records d join public.prescriptions p on p.id = d.prescription_id
   where d.pricing_tier = '340b' and p.status in ('reversed', 'void')
  union all
  -- the drug dispensed is not the drug prescribed
  select p.org_id, p.covered_entity_id, d.facility_id, 'inventory_discrepancy', 'medium', 'RX-DISP-NDC',
         'RX-DISP-NDC:' || d.id,
         format('Dispensed NDC %s differs from prescribed NDC %s (Rx %s).', d.ndc, p.ndc, coalesce(p.rx_number, p.id::text)),
         jsonb_build_object('dispensing_id', d.id, 'prescription_id', p.id, 'dispensed_ndc', d.ndc, 'prescribed_ndc', p.ndc)
    from public.dispensing_records d join public.prescriptions p on p.id = d.prescription_id
   where d.ndc is not null and p.ndc is not null and d.ndc <> p.ndc
  union all
  -- more dispensed than prescribed
  select p.org_id, p.covered_entity_id, d.facility_id, 'inventory_discrepancy', 'medium', 'RX-DISP-QTY',
         'RX-DISP-QTY:' || d.id,
         format('Dispensed quantity %s is more than the prescribed quantity %s (Rx %s).', d.quantity_dispensed, p.quantity, coalesce(p.rx_number, p.id::text)),
         jsonb_build_object('dispensing_id', d.id, 'prescription_id', p.id, 'dispensed', d.quantity_dispensed, 'prescribed', p.quantity)
    from public.dispensing_records d join public.prescriptions p on p.id = d.prescription_id
   where d.quantity_dispensed is not null and p.quantity is not null and d.quantity_dispensed > p.quantity
  union all
  -- marked dispensed but there is no dispensing record
  select p.org_id, p.covered_entity_id, p.facility_id, 'other', 'medium', 'RX-DISPENSED-NO-RECORD',
         'RX-DISPENSED-NO-RECORD:' || p.id,
         format('Prescription is marked dispensed but has no dispensing record (%s, Rx %s).', p.drug_name, coalesce(p.rx_number, p.id::text)),
         jsonb_build_object('prescription_id', p.id, 'rx_number', p.rx_number)
    from public.prescriptions p
   where p.status = 'dispensed'
     and not exists (select 1 from public.dispensing_records d where d.prescription_id = p.id)
  union all
  -- more 340B units dispensed than purchased (no opening balance is recorded, so this is a review prompt)
  select x.org_id, x.covered_entity_id, null::uuid, 'inventory_discrepancy', 'medium', 'INV-PURCH-SHORT',
         'INV-PURCH-SHORT:' || x.covered_entity_id || ':' || x.ndc,
         format('NDC %s: %s unit(s) dispensed at 340B pricing but only %s unit(s) received on purchase orders. If stock was on hand before the first purchase order was recorded this is expected; otherwise check for missing purchases or diversion.', x.ndc, x.dispensed, x.purchased),
         jsonb_build_object('ndc', x.ndc, 'dispensed_340b', x.dispensed, 'purchased_received', x.purchased)
    from (select p.org_id, p.covered_entity_id, d.ndc, sum(d.quantity_dispensed) as dispensed,
                 coalesce((select sum(po.quantity_ordered) from public.purchase_orders po
                            where po.covered_entity_id = p.covered_entity_id and po.ndc = d.ndc and po.status = 'received'), 0) as purchased
            from public.dispensing_records d join public.prescriptions p on p.id = d.prescription_id
           where d.pricing_tier = '340b' and d.ndc is not null and d.quantity_dispensed is not null
           group by p.org_id, p.covered_entity_id, d.ndc) x
   where x.dispensed > x.purchased
  union all
  -- Medicaid exclusion file status needs attention
  select e.org_id, e.covered_entity_id, null::uuid, 'duplicate_discount', 'medium', 'MCD-MEF-UNMATCHED',
         'MCD-MEF-UNMATCHED:' || e.id,
         format('Medicaid enrollment%s is marked unmatched against the HRSA Medicaid Exclusion File. Verify the billing number and the carve-in / carve-out choice.', coalesce(' (' || e.state || ')', '')),
         jsonb_build_object('medicaid_enrollment_id', e.id, 'state', e.state, 'provider_number', e.medicaid_provider_number)
    from public.medicaid_enrollments e
   where e.status = 'active' and e.mef_match_status = 'unmatched'
  union all
  -- active Medicaid enrollment but no carve-in / carve-out decision recorded
  select ce.org_id, ce.id, null::uuid, 'duplicate_discount', 'medium', 'MCD-BILLING-METHOD-MISSING',
         'MCD-BILLING-METHOD-MISSING:' || ce.id,
         'Covered entity has an active Medicaid enrollment but no carve-in or carve-out choice recorded. HRSA audits check that Medicaid billing intent matches the Medicaid Exclusion File.',
         jsonb_build_object('covered_entity_id', ce.id)
    from public.covered_entities ce
   where ce.medicaid_billing_method is null and ce.status <> 'terminated'
     and exists (select 1 from public.medicaid_enrollments e where e.covered_entity_id = ce.id and e.status = 'active')
  union all
  -- HRSA recommends quarterly internal audits of every contract pharmacy
  select c.org_id, c.covered_entity_id, c.pharmacy_facility_id, 'contract_pharmacy_violation', 'medium', 'CP-INTERNAL-AUDIT-DUE',
         'CP-INTERNAL-AUDIT-DUE:' || c.id || ':' || coalesce(c.last_internal_audit_date::text, 'never'),
         case when c.last_internal_audit_date is null then 'No internal audit is recorded for this contract pharmacy. HRSA recommends quarterly internal audits.'
              else format('Last internal audit of this contract pharmacy was %s. HRSA recommends quarterly internal audits.', c.last_internal_audit_date) end,
         jsonb_build_object('pharmacy_contract_id', c.id, 'last_internal_audit_date', c.last_internal_audit_date)
    from public.pharmacy_contracts c
   where c.status = 'active' and (c.last_internal_audit_date is null or c.last_internal_audit_date < current_date - 92)
  union all
  -- HRSA expects an independent audit of every contract pharmacy at least yearly
  select c.org_id, c.covered_entity_id, c.pharmacy_facility_id, 'contract_pharmacy_violation', 'high', 'CP-INDEPENDENT-AUDIT-DUE',
         'CP-INDEPENDENT-AUDIT-DUE:' || c.id || ':' || coalesce(c.last_independent_audit_date::text, 'never'),
         case when c.last_independent_audit_date is null then 'No independent audit is recorded for this contract pharmacy. HRSA guidelines expect an independent audit at least once a year.'
              else format('Last independent audit of this contract pharmacy was %s. HRSA guidelines expect one at least once a year.', c.last_independent_audit_date) end,
         jsonb_build_object('pharmacy_contract_id', c.id, 'last_independent_audit_date', c.last_independent_audit_date)
    from public.pharmacy_contracts c
   where c.status = 'active' and (c.last_independent_audit_date is null or c.last_independent_audit_date < current_date - 365)
  union all
  -- contract ended but still marked active
  select c.org_id, c.covered_entity_id, c.pharmacy_facility_id, 'contract_pharmacy_violation', 'high', 'CP-CONTRACT-EXPIRED',
         'CP-CONTRACT-EXPIRED:' || c.id || ':' || c.contract_end_date,
         format('Contract pharmacy agreement ended on %s but the contract is still marked active.', c.contract_end_date),
         jsonb_build_object('pharmacy_contract_id', c.id, 'contract_end_date', c.contract_end_date)
    from public.pharmacy_contracts c
   where c.status = 'active' and c.contract_end_date < current_date
  union all
  -- annual recertification overdue
  select ce.org_id, ce.id, null::uuid, 'other', 'high', 'CE-RECERT-OVERDUE',
         'CE-RECERT-OVERDUE:' || ce.id || ':' || ce.recertification_date,
         format('Annual 340B recertification was due %s and is overdue.', ce.recertification_date),
         jsonb_build_object('covered_entity_id', ce.id, 'recertification_date', ce.recertification_date)
    from public.covered_entities ce
   where ce.status <> 'terminated' and ce.recertification_date < current_date
  union all
  -- annual recertification coming up
  select ce.org_id, ce.id, null::uuid, 'other', 'medium', 'CE-RECERT-DUE-SOON',
         'CE-RECERT-DUE-SOON:' || ce.id || ':' || ce.recertification_date,
         format('Annual 340B recertification is due %s (within 30 days).', ce.recertification_date),
         jsonb_build_object('covered_entity_id', ce.id, 'recertification_date', ce.recertification_date)
    from public.covered_entities ce
   where ce.status <> 'terminated' and ce.recertification_date between current_date and current_date + 30
  union all
  -- documents past their expiry
  select d.org_id, d.covered_entity_id, d.facility_id, 'other', 'medium', 'DOC-EXPIRED',
         'DOC-EXPIRED:' || d.id || ':' || d.expires_at,
         format('Document "%s" expired on %s.', d.title, d.expires_at),
         jsonb_build_object('document_id', d.id, 'document_type', d.document_type, 'expires_at', d.expires_at)
    from public.documents d
   where d.covered_entity_id is not null and d.expires_at < current_date;

create view public.engine_exception_candidates with (security_invoker = true) as
  -- Medicare Part B: CMS requires the TB modifier on separately payable 340B-acquired drugs from 1 Jan 2025
  select m.org_id, m.id as medicare_claim_id, 'missing_modifier'::text as exception_type,
         'MCR-TB-MISSING'::text as rule_code, 'MCR-TB-MISSING:' || m.id as dedupe_key,
         format('Part B claim %s (service date %s) is for a prescription dispensed at 340B pricing but the TB modifier is not recorded. CMS requires the TB modifier on separately payable Part B drugs acquired through 340B for dates of service on or after 1 January 2025. Confirm the drug is separately payable and correct the claim if so.', coalesce(m.claim_number, m.id::text), m.claim_date) as description,
         jsonb_build_object('medicare_claim_id', m.id, 'claim_number', m.claim_number, 'claim_date', m.claim_date, 'prescription_id', m.prescription_id) as evidence
    from public.medicare_claims m
   where m.part = 'B' and not m.tb_modifier_applied and m.claim_date >= date '2025-01-01' and m.status <> 'denied'
     and exists (select 1 from public.dispensing_records d where d.prescription_id = m.prescription_id and d.pricing_tier = '340b')
  union all
  -- the 340B modifier is on a claim whose drug was not dispensed at 340B pricing
  select m.org_id, m.id, 'other', 'MCR-TB-UNSUPPORTED', 'MCR-TB-UNSUPPORTED:' || m.id,
         format('Part B claim %s carries the 340B modifier but no dispensing record for its prescription is at 340B pricing. Check the acquisition source.', coalesce(m.claim_number, m.id::text)),
         jsonb_build_object('medicare_claim_id', m.id, 'claim_number', m.claim_number, 'prescription_id', m.prescription_id)
    from public.medicare_claims m
   where m.part = 'B' and m.tb_modifier_applied and m.prescription_id is not null
     and exists (select 1 from public.dispensing_records d where d.prescription_id = m.prescription_id)
     and not exists (select 1 from public.dispensing_records d where d.prescription_id = m.prescription_id and d.pricing_tier = '340b');

create view public.engine_opportunity_candidates with (security_invoker = true) as
  select p.org_id, p.covered_entity_id, '340b_eligibility_recapture'::text as opportunity_type,
         'OPP-ELIGIBLE-UNFILLED'::text as rule_code, 'OPP-ELIGIBLE-UNFILLED:' || p.covered_entity_id as dedupe_key,
         format('%s eligible prescription(s) were written more than 14 days ago and have no dispensing record. Follow up with patients and pharmacies to recapture them.', count(*)) as description,
         jsonb_build_object('prescriptions', count(*), 'total_quantity', sum(p.quantity), 'oldest', min(p.prescribed_at)) as evidence
    from public.prescriptions p
   where p.eligibility_status = 'eligible' and p.status = 'prescribed' and p.prescribed_at < now() - interval '14 days'
     and not exists (select 1 from public.dispensing_records d where d.prescription_id = p.id)
   group by p.org_id, p.covered_entity_id
  union all
  select p.org_id, p.covered_entity_id, '340b_eligibility_recapture', 'OPP-NON340B-PRICED', 'OPP-NON340B-PRICED:' || p.covered_entity_id,
         format('%s dispensing record(s) for eligible prescriptions used non-340B pricing. Review whether 340B stock could have been used.', count(*)),
         jsonb_build_object('dispensing_records', count(*), 'total_quantity', sum(d.quantity_dispensed))
    from public.dispensing_records d join public.prescriptions p on p.id = d.prescription_id
   where p.eligibility_status = 'eligible' and d.pricing_tier in ('wac', 'gpo', 'other')
   group by p.org_id, p.covered_entity_id
  union all
  select p.org_id, p.covered_entity_id, 'other', 'OPP-REVIEW-BACKLOG', 'OPP-REVIEW-BACKLOG:' || p.covered_entity_id,
         format('%s prescription(s) have waited more than 30 days for an eligibility decision. Clearing the backlog lets eligible ones be filled at 340B pricing.', count(*)),
         jsonb_build_object('prescriptions', count(*), 'oldest', min(p.prescribed_at))
    from public.prescriptions p
   where p.eligibility_status = 'pending_review' and p.prescribed_at < now() - interval '30 days'
   group by p.org_id, p.covered_entity_id
  union all
  select c.org_id, c.covered_entity_id, 'other', 'OPP-PHARMACY-IDLE', 'OPP-PHARMACY-IDLE:' || c.id,
         'An active contract pharmacy has no dispensing records in the last 90 days. Check whether prescriptions are being routed to it.',
         jsonb_build_object('pharmacy_contract_id', c.id, 'pharmacy_facility_id', c.pharmacy_facility_id)
    from public.pharmacy_contracts c
   where c.status = 'active'
     and not exists (select 1 from public.dispensing_records d where d.facility_id = c.pharmacy_facility_id and d.dispensed_at >= now() - interval '90 days');

revoke all on public.engine_finding_candidates, public.engine_exception_candidates, public.engine_opportunity_candidates from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ===== 5. The engine =====
create or replace function public.run_engine(p_org uuid, p_scope text default 'all')
returns jsonb
language plpgsql
set search_path = public
as $fn$
declare
  v_start timestamptz := clock_timestamp();
  v_run uuid;
  v_summary jsonb;
  v_findings jsonb; v_exceptions jsonb; v_opps jsonb;
  v_disp_exception int := 0; v_disp_matched int := 0; v_stale int := 0;
begin
  if p_scope not in ('all', 'reconciliation', 'risk', 'opportunities') then
    raise exception 'Unknown scope %', p_scope using errcode = '22023';
  end if;
  if not (is_platform_admin() or (p_org = auth_org_id() and auth_has_permission('engine.run'))) then
    raise exception 'You do not have permission to run the analysis engine.' using errcode = '42501';
  end if;

  -- compliance findings (reconciliation rules start with RX- / INV-, everything else is a risk rule)
  if p_scope in ('all', 'reconciliation', 'risk') then
    insert into compliance_findings
      (org_id, covered_entity_id, facility_id, finding_type, severity, description, discovered_date, status,
       source, rule_code, evidence, dedupe_key, last_detected_at, created_at)
    select c.org_id, c.covered_entity_id, c.facility_id, c.finding_type, c.severity, c.description, current_date, 'open',
           'engine', c.rule_code, c.evidence, c.dedupe_key, v_start, v_start
      from engine_finding_candidates c
     where c.org_id = p_org
       and (p_scope = 'all'
            or (p_scope = 'reconciliation' and c.rule_code ~ '^(RX|INV)-')
            or (p_scope = 'risk' and c.rule_code !~ '^(RX|INV)-'))
    on conflict (org_id, dedupe_key) do update
      set last_detected_at = excluded.last_detected_at,
          evidence = case when compliance_findings.status = 'open' then excluded.evidence else compliance_findings.evidence end,
          description = case when compliance_findings.status = 'open' then excluded.description else compliance_findings.description end;
  end if;

  -- claim exceptions and per-record reconciliation status
  if p_scope in ('all', 'reconciliation') then
    insert into claims_exceptions
      (org_id, medicare_claim_id, exception_type, description, status, source, rule_code, evidence, dedupe_key, last_detected_at, created_at)
    select c.org_id, c.medicare_claim_id, c.exception_type, c.description, 'open', 'engine', c.rule_code, c.evidence, c.dedupe_key, v_start, v_start
      from engine_exception_candidates c
     where c.org_id = p_org
    on conflict (org_id, dedupe_key) do update
      set last_detected_at = excluded.last_detected_at,
          evidence = case when claims_exceptions.status = 'open' then excluded.evidence else claims_exceptions.evidence end;

    with issues as (
      select distinct (c.evidence ->> 'dispensing_id')::uuid as id
        from engine_finding_candidates c
       where c.org_id = p_org and c.evidence ? 'dispensing_id')
    update dispensing_records d set reconciliation_status = 'exception'
     where d.org_id = p_org and d.id in (select id from issues) and d.reconciliation_status <> 'exception';
    get diagnostics v_disp_exception = row_count;

    with issues as (
      select distinct (c.evidence ->> 'dispensing_id')::uuid as id
        from engine_finding_candidates c
       where c.org_id = p_org and c.evidence ? 'dispensing_id')
    update dispensing_records d set reconciliation_status = 'matched'
     where d.org_id = p_org and d.id not in (select id from issues) and d.reconciliation_status <> 'matched';
    get diagnostics v_disp_matched = row_count;

    -- one Medicare reconciliation summary per covered entity that has claims
    insert into payer_reconciliations
      (org_id, covered_entity_id, payer_type, period_start, period_end, total_claims, matched_claims, exception_count, status, completed_at)
    select m.org_id, m.covered_entity_id, 'medicare', min(m.claim_date), max(m.claim_date), count(distinct m.id),
           count(distinct m.id) - count(distinct x.medicare_claim_id), count(distinct x.medicare_claim_id), 'completed', v_start
      from medicare_claims m
      left join claims_exceptions x on x.medicare_claim_id = m.id and x.status = 'open'
     where m.org_id = p_org
     group by m.org_id, m.covered_entity_id;
  end if;

  -- opportunities
  if p_scope in ('all', 'opportunities') then
    insert into opportunities
      (org_id, covered_entity_id, opportunity_type, description, status, identified_date, source, rule_code, evidence, dedupe_key, last_detected_at, created_at)
    select c.org_id, c.covered_entity_id, c.opportunity_type, c.description, 'identified', current_date, 'engine', c.rule_code, c.evidence, c.dedupe_key, v_start, v_start
      from engine_opportunity_candidates c
     where c.org_id = p_org
    on conflict (org_id, dedupe_key) do update
      set last_detected_at = excluded.last_detected_at,
          description = case when opportunities.status in ('identified', 'evaluating') then excluded.description else opportunities.description end,
          evidence = case when opportunities.status in ('identified', 'evaluating') then excluded.evidence else opportunities.evidence end;
  end if;

  -- summary
  select coalesce(jsonb_object_agg(rule_code, jsonb_build_object('detected', n, 'new', n_new)), '{}'::jsonb) into v_findings
    from (select rule_code, count(*) n, count(*) filter (where created_at = v_start) n_new
            from compliance_findings where org_id = p_org and source = 'engine' and last_detected_at = v_start group by rule_code) s;
  select coalesce(jsonb_object_agg(rule_code, jsonb_build_object('detected', n, 'new', n_new)), '{}'::jsonb) into v_exceptions
    from (select rule_code, count(*) n, count(*) filter (where created_at = v_start) n_new
            from claims_exceptions where org_id = p_org and source = 'engine' and last_detected_at = v_start group by rule_code) s;
  select coalesce(jsonb_object_agg(rule_code, jsonb_build_object('detected', n, 'new', n_new)), '{}'::jsonb) into v_opps
    from (select rule_code, count(*) n, count(*) filter (where created_at = v_start) n_new
            from opportunities where org_id = p_org and source = 'engine' and last_detected_at = v_start group by rule_code) s;

  select count(*) into v_stale from compliance_findings f
   where f.org_id = p_org and f.source = 'engine' and f.status = 'open' and f.last_detected_at < v_start
     and (p_scope = 'all' or (p_scope = 'reconciliation' and f.rule_code ~ '^(RX|INV)-') or (p_scope = 'risk' and f.rule_code !~ '^(RX|INV)-'));

  v_summary := jsonb_build_object(
    'scope', p_scope,
    'findings', v_findings, 'exceptions', v_exceptions, 'opportunities', v_opps,
    'dispensing_marked_exception', v_disp_exception, 'dispensing_marked_matched', v_disp_matched,
    'open_findings_no_longer_detected', v_stale);

  insert into engine_runs (org_id, run_type, ran_by, started_at, finished_at, summary)
  values (p_org, p_scope, auth.uid(), v_start, clock_timestamp(), v_summary)
  returning id into v_run;

  return v_summary || jsonb_build_object('run_id', v_run);
end
$fn$;

revoke execute on function public.run_engine(uuid, text) from public, anon;
grant execute on function public.run_engine(uuid, text) to authenticated;
