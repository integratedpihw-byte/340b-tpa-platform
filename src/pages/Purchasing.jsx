import React, { useEffect, useState } from 'react';
import { Plus, ShoppingCart, X, Trash2 } from 'lucide-react';
import { fetchPurchaseOrders, fetchCoveredEntities, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder } from '../lib/api';

const emptyForm = { covered_entity_id: '', ndc: '', drug_name: '', quantity_ordered: '', unit_cost: '', status: 'draft', ordered_at: '' };

function StatusBadge({ status }) {
  const cls = status === 'received' ? 'badge-good' : status === 'cancelled' ? 'badge-bad' : status === 'submitted' ? 'badge-warn' : 'badge-neutral';
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function Purchasing({ org }) {
  const [rows, setRows] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [po, e] = await Promise.all([fetchPurchaseOrders(org.id), fetchCoveredEntities(org.id)]);
      setRows(po);
      setEntities(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [org.id]);

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm, covered_entity_id: entities[0]?.id || '' });
    setError('');
    setShowForm(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      covered_entity_id: row.covered_entity_id,
      ndc: row.ndc || '',
      drug_name: row.drug_name,
      quantity_ordered: row.quantity_ordered ?? '',
      unit_cost: row.unit_cost ?? '',
      status: row.status,
      ordered_at: row.ordered_at ? row.ordered_at.slice(0, 10) : '',
    });
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.covered_entity_id) { setError('Select a covered entity first.'); return; }
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        quantity_ordered: form.quantity_ordered === '' ? null : Number(form.quantity_ordered),
        unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
        ordered_at: form.ordered_at || null,
        received_at: form.status === 'received' ? new Date().toISOString() : (editing?.received_at || null),
      };
      if (editing) await updatePurchaseOrder(editing.id, payload);
      else await createPurchaseOrder({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete purchase order for ${row.drug_name}?`)) return;
    await deletePurchaseOrder(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Purchasing</h2>
          <div className="toolbar-sub">340B purchase orders by covered entity.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New purchase order
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart size={28} />
              <p>No purchase orders yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Qty ordered</th>
                  <th>Unit cost</th>
                  <th>Status</th>
                  <th>Ordered</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{row.drug_name}</td>
                    <td>{row.quantity_ordered ?? '—'}</td>
                    <td>{row.unit_cost != null ? `$${Number(row.unit_cost).toFixed(2)}` : '—'}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>{row.ordered_at ? new Date(row.ordered_at).toLocaleDateString() : '—'}</td>
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
              <h3>{editing ? 'Edit purchase order' : 'New purchase order'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error">{error}</div>}
                <div className="field">
                  <label>Covered entity</label>
                  <select value={form.covered_entity_id} onChange={(e) => setForm({ ...form, covered_entity_id: e.target.value })}>
                    <option value="">Select one…</option>
                    {entities.map((ent) => <option key={ent.id} value={ent.id}>{ent.opais_id || ent.entity_type.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Drug name</label>
                    <input required value={form.drug_name} onChange={(e) => setForm({ ...form, drug_name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>NDC</label>
                    <input value={form.ndc} onChange={(e) => setForm({ ...form, ndc: e.target.value })} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Quantity ordered</label>
                    <input type="number" step="any" value={form.quantity_ordered} onChange={(e) => setForm({ ...form, quantity_ordered: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Unit cost ($)</label>
                    <input type="number" step="any" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
                  </div>
                </div>
                <div className="inline-form">
                  <div className="field">
                    <label>Ordered on</label>
                    <input type="date" value={form.ordered_at} onChange={(e) => setForm({ ...form, ordered_at: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                      <option value="draft">Draft</option>
                      <option value="submitted">Submitted</option>
                      <option value="received">Received</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
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
