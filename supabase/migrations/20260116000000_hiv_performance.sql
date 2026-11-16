-- HIV program performance metrics, computed in the database so client references never leave it.
--
-- Access: the caller needs hiv_record.read. Users who also have hiv_performance.read (org_admin) see every
-- counselor and site; everyone else gets only the encounters they conducted themselves.

update public.roles set permissions = permissions || '["hiv_performance.read"]'::jsonb
 where org_id is null and name = 'org_admin' and not (permissions ? 'hiv_performance.read');

create or replace function public.hiv_performance(p_org uuid, p_from date, p_to date, p_group text default 'site')
returns table (
  group_key text, group_label text,
  tests bigint, positives bigint, negatives bigint, indeterminate bigint, pending bigint,
  risk_screened bigint, negatives_referred_prep bigint,
  positives_assessable bigint, linked_30d bigint, art_30d bigint, lost_to_follow_up bigint,
  median_days_to_attend numeric
)
language plpgsql
stable
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_all boolean;
begin
  if p_group not in ('overall', 'site', 'counselor', 'month') then
    raise exception 'Unknown grouping %', p_group using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a valid date range.' using errcode = '22023';
  end if;
  if p_to - p_from > 1100 then
    raise exception 'The date range can be at most about three years.' using errcode = '22023';
  end if;
  if not (is_platform_admin() or (p_org = auth_org_id() and auth_has_permission('hiv_record.read'))) then
    raise exception 'You do not have access to HIV program records.' using errcode = '42501';
  end if;
  v_all := is_platform_admin() or auth_has_permission('hiv_performance.read');

  return query
  with enc as (
    select e.id, e.result, e.encounter_date, e.risk_screening_completed, e.referred_to_prep,
           case p_group
             when 'site' then coalesce(e.testing_site_id::text, 'none')
             when 'counselor' then coalesce(e.counselor_user_id::text, 'none')
             when 'month' then to_char(e.encounter_date, 'YYYY-MM')
             else 'all' end as gk
      from testing_encounters e
     where e.org_id = p_org
       and e.encounter_date between p_from and p_to
       and (v_all or e.counselor_user_id = auth.uid())
  ),
  agg as (
    select enc.gk,
           count(*) as n_tests,
           count(*) filter (where enc.result = 'positive') as n_pos,
           count(*) filter (where enc.result = 'negative') as n_neg,
           count(*) filter (where enc.result = 'indeterminate') as n_ind,
           count(*) filter (where enc.result = 'pending') as n_pend,
           count(*) filter (where enc.risk_screening_completed) as n_risk,
           count(*) filter (where enc.result = 'negative' and enc.referred_to_prep) as n_prep
      from enc group by enc.gk
  ),
  pos as (
    select enc.gk, enc.encounter_date,
           (select min(l.event_date) from linkage_to_care_events l
             where l.testing_encounter_id = enc.id and l.event_type = 'appointment_attended' and l.event_date >= enc.encounter_date) as first_attended,
           (select min(l.event_date) from linkage_to_care_events l
             where l.testing_encounter_id = enc.id and l.event_type = 'art_initiated' and l.event_date >= enc.encounter_date) as first_art,
           exists (select 1 from linkage_to_care_events l
             where l.testing_encounter_id = enc.id and l.event_type = 'lost_to_follow_up') as ltfu
      from enc where enc.result = 'positive'
  ),
  lk as (
    select pos.gk,
           count(*) filter (where pos.encounter_date <= current_date - 30) as n_assessable,
           count(*) filter (where pos.encounter_date <= current_date - 30 and pos.first_attended - pos.encounter_date <= 30) as n_linked,
           count(*) filter (where pos.encounter_date <= current_date - 30 and pos.first_art - pos.encounter_date <= 30) as n_art,
           count(*) filter (where pos.ltfu) as n_ltfu,
           (percentile_cont(0.5) within group (order by (pos.first_attended - pos.encounter_date)::double precision)
              filter (where pos.first_attended is not null))::numeric as med_days
      from pos group by pos.gk
  )
  select agg.gk,
         case p_group
           when 'overall' then 'All encounters'
           when 'month' then agg.gk
           when 'site' then coalesce((select f.name from testing_sites s join facilities f on f.id = s.facility_id where s.id::text = agg.gk), 'Unassigned site')
           else coalesce((select coalesce(u.full_name, u.email) from users u where u.id::text = agg.gk), 'Unassigned counselor')
         end,
         agg.n_tests, agg.n_pos, agg.n_neg, agg.n_ind, agg.n_pend, agg.n_risk, agg.n_prep,
         coalesce(lk.n_assessable, 0), coalesce(lk.n_linked, 0), coalesce(lk.n_art, 0), coalesce(lk.n_ltfu, 0), lk.med_days
    from agg left join lk on lk.gk = agg.gk
   order by case when p_group = 'month' then agg.gk end, agg.n_tests desc, agg.gk;
end
$fn$;

revoke execute on function public.hiv_performance(uuid, date, date, text) from public, anon;
grant execute on function public.hiv_performance(uuid, date, date, text) to authenticated;
