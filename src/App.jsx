import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard, Building2, ShieldCheck, MapPinned, Users as UsersIcon, ScrollText, LogOut,
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import { fetchIsPlatformAdmin, fetchMyProfile, fetchOrganizations, signOut } from './lib/api';
import AuthScreen from './pages/AuthScreen';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Organizations from './pages/Organizations';
import CoveredEntities from './pages/CoveredEntities';
import Facilities from './pages/Facilities';
import UsersPage from './pages/UsersPage';
import AuditLog from './pages/AuditLog';

function initials(email) {
  if (!email) return '?';
  return email.slice(0, 2).toUpperCase();
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [profile, setProfile] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [view, setView] = useState('dashboard');
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const loadWorkspace = useCallback(async (currentUser) => {
    setLoadingWorkspace(true);
    try {
      const [admin, prof, orgs] = await Promise.all([
        fetchIsPlatformAdmin(currentUser.id),
        fetchMyProfile(currentUser.id),
        fetchOrganizations(),
      ]);
      setIsPlatformAdmin(admin);
      setProfile(prof);
      setOrganizations(orgs);
      setSelectedOrgId((prev) => {
        if (prev && orgs.some((o) => o.id === prev)) return prev;
        if (prof?.org_id && orgs.some((o) => o.id === prof.org_id)) return prof.org_id;
        return orgs[0]?.id || '';
      });
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const sessionUser = data.session?.user || null;
      setUser(sessionUser);
      setBooting(false);
      if (sessionUser) loadWorkspace(sessionUser);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user || null;
      setUser(sessionUser);
      if (sessionUser) {
        loadWorkspace(sessionUser);
      } else {
        setProfile(null);
        setOrganizations([]);
        setSelectedOrgId('');
        setIsPlatformAdmin(false);
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadWorkspace]);

  if (booting) {
    return <div className="center-screen">Loading…</div>;
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (loadingWorkspace && organizations.length === 0) {
    return <div className="center-screen">Setting up your workspace…</div>;
  }

  if (organizations.length === 0) {
    return (
      <Onboarding
        user={user}
        isPlatformAdmin={isPlatformAdmin}
        onDone={(orgId) => { setSelectedOrgId(orgId); loadWorkspace(user); }}
      />
    );
  }

  const org = organizations.find((o) => o.id === selectedOrgId) || organizations[0];

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ...(isPlatformAdmin ? [{ key: 'organizations', label: 'Organizations', icon: Building2 }] : []),
    { key: 'entities', label: 'Covered Entities', icon: ShieldCheck },
    { key: 'facilities', label: 'Facilities', icon: MapPinned },
    { key: 'users', label: 'Users', icon: UsersIcon },
    { key: 'audit', label: 'Audit Log', icon: ScrollText },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">TPA</div>
          <div className="sidebar-brand-text">
            340B TPA Platform
            <small>Phase 1 · Core Infrastructure</small>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Workspace</div>
          {navItems.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${view === item.key ? 'active' : ''}`}
              onClick={() => setView(item.key)}
            >
              <item.icon size={16} /> {item.label}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials(user.email)}</div>
            <div className="sidebar-user-info">
              <div>{user.email}</div>
              <div>{isPlatformAdmin ? 'Platform admin' : 'Org member'}</div>
            </div>
          </div>
          <button className="sidebar-signout" onClick={() => signOut()}>
            <LogOut size={13} style={{ marginRight: 6, verticalAlign: -2 }} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div>
            <h1>{navItems.find((n) => n.key === view)?.label}</h1>
            <div className="topbar-sub">{org ? org.name : 'No organization selected'}</div>
          </div>
          {organizations.length > 1 && (
            <div className="org-select">
              <select value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)}>
                {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="content">
          {view === 'dashboard' && <Dashboard org={org} />}
          {view === 'organizations' && isPlatformAdmin && (
            <Organizations
              organizations={organizations}
              onRefresh={() => loadWorkspace(user)}
              onSelect={(id) => { setSelectedOrgId(id); setView('dashboard'); }}
            />
          )}
          {view === 'entities' && org && <CoveredEntities org={org} />}
          {view === 'facilities' && org && <Facilities org={org} />}
          {view === 'users' && org && <UsersPage org={org} />}
          {view === 'audit' && org && <AuditLog org={org} />}
        </div>
      </div>
    </div>
  );
}
