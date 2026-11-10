import { supabase } from './supabaseClient';

// ---------- auth ----------

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ---------- my profile / admin status ----------

export async function fetchIsPlatformAdmin(userId) {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function fetchMyProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*, roles(*)')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function joinOrganization(userId, email, orgId) {
  const { data, error } = await supabase
    .from('users')
    .insert({ id: userId, org_id: orgId, email, status: 'active' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- organizations ----------

export async function fetchOrganizations() {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createOrganization(fields) {
  const { data, error } = await supabase
    .from('organizations')
    .insert(fields)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOrganization(id, patch) {
  const { data, error } = await supabase
    .from('organizations')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- covered entities ----------

export async function fetchCoveredEntities(orgId) {
  const { data, error } = await supabase
    .from('covered_entities')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCoveredEntity(fields) {
  const { data, error } = await supabase
    .from('covered_entities')
    .insert(fields)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCoveredEntity(id, patch) {
  const { data, error } = await supabase
    .from('covered_entities')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCoveredEntity(id) {
  const { error } = await supabase.from('covered_entities').delete().eq('id', id);
  if (error) throw error;
}

// ---------- facilities ----------

export async function fetchFacilities(orgId) {
  const { data, error } = await supabase
    .from('facilities')
    .select('*, covered_entities(name:id)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createFacility(fields) {
  const { data, error } = await supabase
    .from('facilities')
    .insert(fields)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFacility(id, patch) {
  const { data, error } = await supabase
    .from('facilities')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFacility(id) {
  const { error } = await supabase.from('facilities').delete().eq('id', id);
  if (error) throw error;
}

// ---------- roles ----------

export async function fetchRoles(orgId) {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order('is_system_role', { ascending: false });
  if (error) throw error;
  return data;
}

// ---------- users ----------

export async function fetchOrgUsers(orgId) {
  const { data, error } = await supabase
    .from('users')
    .select('*, roles(name), facilities(name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateUser(id, patch) {
  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- prescriptions ----------

export async function fetchPrescriptions(orgId) {
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, covered_entities(entity_type, opais_id), facilities(name)')
    .eq('org_id', orgId)
    .order('prescribed_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createPrescription(fields) {
  const { data, error } = await supabase.from('prescriptions').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updatePrescription(id, patch) {
  const { data, error } = await supabase.from('prescriptions').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePrescription(id) {
  const { error } = await supabase.from('prescriptions').delete().eq('id', id);
  if (error) throw error;
}

// ---------- dispensing records ----------

export async function fetchDispensingRecords(orgId) {
  const { data, error } = await supabase
    .from('dispensing_records')
    .select('*, prescriptions(drug_name, patient_ref), facilities(name)')
    .eq('org_id', orgId)
    .order('dispensed_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createDispensingRecord(fields) {
  const { data, error } = await supabase.from('dispensing_records').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateDispensingRecord(id, patch) {
  const { data, error } = await supabase.from('dispensing_records').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDispensingRecord(id) {
  const { error } = await supabase.from('dispensing_records').delete().eq('id', id);
  if (error) throw error;
}

// ---------- inventory ----------

export async function fetchInventoryItems(orgId) {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*, covered_entities(entity_type, opais_id)')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createInventoryItem(fields) {
  const { data, error } = await supabase.from('inventory_items').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateInventoryItem(id, patch) {
  const { data, error } = await supabase
    .from('inventory_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteInventoryItem(id) {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id);
  if (error) throw error;
}

// ---------- purchase orders ----------

export async function fetchPurchaseOrders(orgId) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, covered_entities(entity_type, opais_id)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createPurchaseOrder(fields) {
  const { data, error } = await supabase.from('purchase_orders').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updatePurchaseOrder(id, patch) {
  const { data, error } = await supabase.from('purchase_orders').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePurchaseOrder(id) {
  const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
  if (error) throw error;
}

// ---------- pharmacy contracts ----------

export async function fetchPharmacyContracts(orgId) {
  const { data, error } = await supabase
    .from('pharmacy_contracts')
    .select('*, covered_entities(entity_type, opais_id), facilities(name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createPharmacyContract(fields) {
  const { data, error } = await supabase.from('pharmacy_contracts').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updatePharmacyContract(id, patch) {
  const { data, error } = await supabase.from('pharmacy_contracts').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePharmacyContract(id) {
  const { error } = await supabase.from('pharmacy_contracts').delete().eq('id', id);
  if (error) throw error;
}

// ---------- medicaid enrollments ----------

export async function fetchMedicaidEnrollments(orgId) {
  const { data, error } = await supabase
    .from('medicaid_enrollments')
    .select('*, covered_entities(entity_type, opais_id)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createMedicaidEnrollment(fields) {
  const { data, error } = await supabase.from('medicaid_enrollments').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateMedicaidEnrollment(id, patch) {
  const { data, error } = await supabase.from('medicaid_enrollments').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMedicaidEnrollment(id) {
  const { error } = await supabase.from('medicaid_enrollments').delete().eq('id', id);
  if (error) throw error;
}

// ---------- medicare claims ----------

export async function fetchMedicareClaims(orgId) {
  const { data, error } = await supabase
    .from('medicare_claims')
    .select('*, covered_entities(entity_type, opais_id)')
    .eq('org_id', orgId)
    .order('claim_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createMedicareClaim(fields) {
  const { data, error } = await supabase.from('medicare_claims').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateMedicareClaim(id, patch) {
  const { data, error } = await supabase.from('medicare_claims').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteMedicareClaim(id) {
  const { error } = await supabase.from('medicare_claims').delete().eq('id', id);
  if (error) throw error;
}

// ---------- payer reconciliations ----------

export async function fetchPayerReconciliations(orgId) {
  const { data, error } = await supabase
    .from('payer_reconciliations')
    .select('*, covered_entities(entity_type, opais_id)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createPayerReconciliation(fields) {
  const { data, error } = await supabase.from('payer_reconciliations').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updatePayerReconciliation(id, patch) {
  const { data, error } = await supabase.from('payer_reconciliations').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePayerReconciliation(id) {
  const { error } = await supabase.from('payer_reconciliations').delete().eq('id', id);
  if (error) throw error;
}

// ---------- claims exceptions ----------

export async function fetchClaimsExceptions(orgId) {
  const { data, error } = await supabase
    .from('claims_exceptions')
    .select('*, payer_reconciliations(payer_type), medicare_claims(claim_number, drug_name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createClaimsException(fields) {
  const { data, error } = await supabase.from('claims_exceptions').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateClaimsException(id, patch) {
  const { data, error } = await supabase.from('claims_exceptions').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteClaimsException(id) {
  const { error } = await supabase.from('claims_exceptions').delete().eq('id', id);
  if (error) throw error;
}

// ---------- testing sites ----------

export async function fetchTestingSites(orgId) {
  const { data, error } = await supabase
    .from('testing_sites')
    .select('*, facilities(name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTestingSite(fields) {
  const { data, error } = await supabase.from('testing_sites').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateTestingSite(id, patch) {
  const { data, error } = await supabase
    .from('testing_sites')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTestingSite(id) {
  const { error } = await supabase.from('testing_sites').delete().eq('id', id);
  if (error) throw error;
}

// ---------- testing encounters ----------

export async function fetchTestingEncounters(orgId) {
  const { data, error } = await supabase
    .from('testing_encounters')
    .select('*, testing_sites(facility_id, facilities(name)), users(email)')
    .eq('org_id', orgId)
    .order('encounter_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTestingEncounter(fields) {
  const { data, error } = await supabase.from('testing_encounters').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateTestingEncounter(id, patch) {
  const { data, error } = await supabase.from('testing_encounters').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTestingEncounter(id) {
  const { error } = await supabase.from('testing_encounters').delete().eq('id', id);
  if (error) throw error;
}

// ---------- linkage to care events ----------

export async function fetchLinkageEvents(orgId) {
  const { data, error } = await supabase
    .from('linkage_to_care_events')
    .select('*, testing_encounters(client_ref, test_type), facilities(name)')
    .eq('org_id', orgId)
    .order('event_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLinkageEvent(fields) {
  const { data, error } = await supabase.from('linkage_to_care_events').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateLinkageEvent(id, patch) {
  const { data, error } = await supabase.from('linkage_to_care_events').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteLinkageEvent(id) {
  const { error } = await supabase.from('linkage_to_care_events').delete().eq('id', id);
  if (error) throw error;
}

// ---------- counselor assignments ----------

export async function fetchCounselorAssignments(orgId) {
  const { data, error } = await supabase
    .from('counselor_assignments')
    .select('*, users(email), testing_sites(facility_id, facilities(name))')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCounselorAssignment(fields) {
  const { data, error } = await supabase.from('counselor_assignments').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateCounselorAssignment(id, patch) {
  const { data, error } = await supabase.from('counselor_assignments').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCounselorAssignment(id) {
  const { error } = await supabase.from('counselor_assignments').delete().eq('id', id);
  if (error) throw error;
}

// ---------- audit log ----------

export async function fetchAuditLog(orgId, { action, limit = 100 } = {}) {
  let query = supabase
    .from('audit_log')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (action) query = query.ilike('action', `%${action}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
