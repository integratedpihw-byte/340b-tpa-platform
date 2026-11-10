import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard, Building2, ShieldCheck, MapPinned, Users as UsersIcon, ScrollText, LogOut,
  FileText, PackageCheck, Boxes, ShoppingCart, Handshake, Landmark, Stethoscope, GitCompare, AlertOctagon,
  TestTube, ClipboardList, HeartPulse, UserCog,
  ShieldAlert, Gauge, PiggyBank, Lightbulb, FileStack,
  Radar, TrendingUp, Plug, History,
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
import Prescriptions from './pages/Prescriptions';
import Dispensing from './pages/Dispensing';
import Inventory from './pages/Inventory';
import Purchasing from './pages/Purchasing';
import PharmacyContracts from './pages/PharmacyContracts';
import MedicaidEnrollments from './pages/MedicaidEnrollments';
import MedicareClaims from './pages/MedicareClaims';
import PayerReconciliations from './pages/PayerReconciliations';
import ClaimsExceptions from './pages/ClaimsExceptions';
import TestingSites from './pages/TestingSites';
import TestingEncounters from './pages/TestingEncounters';
import LinkageToCare from './pages/LinkageToCare';
import CounselorAssignments from './pages/CounselorAssignments';
import ComplianceFindings from './pages/ComplianceFindings';
import RiskAssessments from './pages/RiskAssessments';
import SavingsSummaries from './pages/SavingsSummaries';
import Opportunities from './pages/Opportunities';
import Documents from './pages/Documents';
import RiskScores from './pages/RiskScores';
import Forecasts from './pages/Forecasts';
import IntegrationConnections from './pages/IntegrationConnections';
import SyncLogs from './pages/SyncLogs';

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

  const navGroups = [
    {
      label: 'Workspace',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        ...(isPlatformAdmin ? [{ key: 'organizations', label: 'Organizations', icon: Building2 }] : []),
      ],
    },
    {
      label: 'Covered Entity',
      items: [
        { key: 'entities', label: 'Covered Entities', icon: ShieldCheck },
        { key: 'facilities', label: 'Facilities', icon: MapPinned },
      ],
    },
    {
      label: '340B Operations',
      items: [
        { key: 'prescriptions', label: 'Prescriptions', icon: FileText },
        { key: 'dispensing', label: 'Dispensing', icon: PackageCheck },
        { key: 'inventory', label: 'Inventory', icon: Boxes },
        { key: 'purchasing', label: 'Purchasing', icon: ShoppingCart },
        { key: 'contracts', label: 'Contract Pharmacies', icon: Handshake },
      ],
    },
    {
      label: 'Payer Management',
      items: [
        { key: 'medicaid', label: 'Medicaid Enrollments', icon: Landmark },
        { key: 'medicare', label: 'Medicare Claims', icon: Stethoscope },
        { key: 'reconciliations', label: 'Payer Reconciliations', icon: GitCompare },
        { key: 'exceptions', label: 'Claims Exceptions', icon: AlertOctagon },
      ],
    },
    {
      label: 'HIV Program',
      items: [
        { key: 'testing-sites', label: 'Testing Sites', icon: TestTube },
        { key: 'testing-encounters', label: 'Testing Encounters', icon: ClipboardList },
        { key: 'linkage', label: 'Linkage to Care', icon: HeartPulse },
        { key: 'counselor-assignments', label: 'Counselor Assignments', icon: UserCog },
      ],
    },
    {
      label: 'Compliance & Finance',
      items: [
        { key: 'compliance-findings', label: 'Compliance Findings', icon: ShieldAlert },
        { key: 'risk-assessments', label: 'Risk Assessments', icon: Gauge },
        { key: 'savings-summaries', label: 'Savings Summaries', icon: PiggyBank },
        { key: 'opportunities', label: 'Opportunities', icon: Lightbulb },
        { key: 'documents', label: 'Documents', icon: FileStack },
      ],
    },
    {
      label: 'Advanced Intelligence',
      items: [
        { key: 'risk-scores', label: 'Risk Scores', icon: Radar },
        { key: 'forecasts', label: 'Forecasts', icon: TrendingUp },
      ],
    },
    {
      label: 'Enterprise Deployment',
      items: [
        { key: 'integration-connections', label: 'Integration Connections', icon: Plug },
        { key: 'sync-logs', label: 'Sync Logs', icon: History },
      ],
    },
    {
      label: 'Admin',
      items: [
        { key: 'users', label: 'Users', icon: UsersIcon },
        { key: 'audit', label: 'Audit Log', icon: ScrollText },
      ],
    },
  ];
  const navItems = navGroups.flatMap((g) => g.items);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">TPA</div>
          <div className="sidebar-brand-text">
            340B TPA Platform
            <small>Phase 1-7 &middot; Complete Enterprise Platform</small>
          </div>
        </div>

        {navGroups.map((group) => (
          <div className="sidebar-section" key={group.label}>
            <div className="sidebar-section-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${view === item.key ? 'active' : ''}`}
                onClick={() => setView(item.key)}
              >
                <item.icon size={16} /> {item.label}
              </button>
            ))}
          </div>
        ))}

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
          {view === 'prescriptions' && org && <Prescriptions org={org} />}
          {view === 'dispensing' && org && <Dispensing org={org} />}
          {view === 'inventory' && org && <Inventory org={org} />}
          {view === 'purchasing' && org && <Purchasing org={org} />}
          {view === 'contracts' && org && <PharmacyContracts org={org} />}
          {view === 'medicaid' && org && <MedicaidEnrollments org={org} />}
          {view === 'medicare' && org && <MedicareClaims org={org} />}
          {view === 'reconciliations' && org && <PayerReconciliations org={org} />}
          {view === 'exceptions' && org && <ClaimsExceptions org={org} />}
          {view === 'testing-sites' && org && <TestingSites org={org} />}
          {view === 'testing-encounters' && org && <TestingEncounters org={org} />}
          {view === 'linkage' && org && <LinkageToCare org={org} />}
          {view === 'counselor-assignments' && org && <CounselorAssignments org={org} />}
          {view === 'compliance-findings' && org && <ComplianceFindings org={org} />}
          {view === 'risk-assessments' && org && <RiskAssessments org={org} />}
          {view === 'savings-summaries' && org && <SavingsSummaries org={org} />}
          {view === 'opportunities' && org && <Opportunities org={org} />}
          {view === 'documents' && org && <Documents org={org} />}
          {view === 'risk-scores' && org && <RiskScores org={org} />}
          {view === 'forecasts' && org && <Forecasts org={org} />}
          {view === 'integration-connections' && org && <IntegrationConnections org={org} />}
          {view === 'sync-logs' && org && <SyncLogs org={org} />}
          {view === 'users' && org && <UsersPage org={org} />}
          {view === 'audit' && org && <AuditLog org={org} />}
        </div>
      </div>
    </div>
  );
}
