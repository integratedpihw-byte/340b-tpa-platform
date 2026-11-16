-- The engine keeps one Medicare summary row per covered entity and updates it on each run,
-- instead of adding a new row every time.
alter table public.payer_reconciliations
  add column source text not null default 'manual' check (source in ('manual', 'engine'));
create unique index payer_reconciliations_engine_uniq
  on public.payer_reconciliations (org_id, covered_entity_id, payer_type) where source = 'engine';

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
      (org_id, covered_entity_id, payer_type, period_start, period_end, total_claims, matched_claims, exception_count, status, completed_at, source)
    select m.org_id, m.covered_entity_id, 'medicare', min(m.claim_date), max(m.claim_date), count(distinct m.id),
           count(distinct m.id) - count(distinct x.medicare_claim_id), count(distinct x.medicare_claim_id), 'completed', v_start, 'engine'
      from medicare_claims m
      left join claims_exceptions x on x.medicare_claim_id = m.id and x.status = 'open'
     where m.org_id = p_org
     group by m.org_id, m.covered_entity_id
    on conflict (org_id, covered_entity_id, payer_type) where source = 'engine' do update
      set period_start = excluded.period_start, period_end = excluded.period_end, total_claims = excluded.total_claims,
          matched_claims = excluded.matched_claims, exception_count = excluded.exception_count,
          status = 'completed', completed_at = excluded.completed_at;
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
