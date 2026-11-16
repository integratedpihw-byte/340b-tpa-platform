-- NDCs are compared by digits only, so 11111-111-11 and 1111111111 are the same drug.
create or replace view public.engine_finding_candidates with (security_invoker = true) as
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
   where d.ndc is not null and p.ndc is not null and regexp_replace(d.ndc, '\D', '', 'g') <> regexp_replace(p.ndc, '\D', '', 'g')
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
    from (select g.org_id, g.covered_entity_id, g.ndc, g.dispensed,
                 coalesce((select sum(po.quantity_ordered) from public.purchase_orders po
                            where po.covered_entity_id = g.covered_entity_id
                              and regexp_replace(po.ndc, '\D', '', 'g') = g.ndc and po.status = 'received'), 0) as purchased
            from (select p.org_id, p.covered_entity_id, regexp_replace(d.ndc, '\D', '', 'g') as ndc, sum(d.quantity_dispensed) as dispensed
                    from public.dispensing_records d join public.prescriptions p on p.id = d.prescription_id
                   where d.pricing_tier = '340b' and d.ndc is not null and d.quantity_dispensed is not null
                   group by p.org_id, p.covered_entity_id, regexp_replace(d.ndc, '\D', '', 'g')) g) x
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
