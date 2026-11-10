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
