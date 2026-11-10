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
