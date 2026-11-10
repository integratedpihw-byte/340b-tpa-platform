import React, { useEffect, useState } from 'react';
import { Plus, FileStack, X, Trash2 } from 'lucide-react';
import { fetchDocuments, fetchCoveredEntities, fetchFacilities, createDocument, updateDocument, deleteDocument } from '../lib/api';

const DOCUMENT_TYPES = ['hrsa_audit_report', 'policy_procedure', 'contract', 'mou', 'certification', 'other'];

const emptyForm = {
  covered_entity_id: '', facility_id: '', document_type: 'policy_procedure', title: '', file_url: '', expires_at: '',
};

export default function Documents({ org }) {
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [d, e, f] = await Promise.all([fetchDocuments(org.id), fetchCoveredEntities(org.id), fetchFacilities(org.id)]);
      setRows(d);
      setEntities(e);
      setFacilities(f);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      covered_entity_id: row.covered_entity_id || '',
      facility_id: row.facility_id || '',
      document_type: row.document_type,
      title: row.title,
      file_url: row.file_url || '',
      expires_at: row.expires_at || '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title) { setError('A title is required.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        covered_entity_id: form.covered_entity_id || null,
        facility_id: form.facility_id || null,
        expires_at: form.expires_at || null,
      };
      if (editing) await updateDocument(editing.id, payload);
      else await createDocument({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm('Delete this document record?')) return;
    await deleteDocument(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Documents</h2>
          <div className="toolbar-sub">Policies, contracts, certifications, and audit records.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> Add document
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <FileStack size={28} />
              <p>No documents on file yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Uploaded</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>
                      {row.file_url ? <a href={row.file_url} target="_blank" rel="noreferrer">{row.title}</a> : row.title}
                    </td>
                    <td>{row.document_type.replace(/_/g, ' ')}</td>
                    <td>{row.covered_entities?.name || row.facilities?.name || '—'}</td>
                    <td>{row.uploaded_at ? row.uploaded_at.slice(0, 10) : '—'}</td>
                    <td>{row.expires_at || '—'}</td>
                    <td className="row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit document' : 'Add document'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Title</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="field">
                  <label>Document type</label>
                  <select value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })}>
                    {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Covered entity (optional)</label>
                  <select value={form.covered_entity_id} onChange={(e) => setForm({ ...form, covered_entity_id: e.target.value })}>
                    <option value="">—</option>
                    {entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Facility (optional)</label>
                  <select value={form.facility_id} onChange={(e) => setForm({ ...form, facility_id: e.target.value })}>
                    <option value="">—</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>File URL</label>
                  <input value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://…" />
                </div>
                <div className="field">
                  <label>Expires on (optional)</label>
                  <input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={busy}>
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
