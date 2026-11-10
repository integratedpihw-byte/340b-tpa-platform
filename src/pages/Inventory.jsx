import React, { useEffect, useState } from 'react';
import { Plus, Boxes, X, Trash2, AlertTriangle } from 'lucide-react';
import { fetchInventoryItems, fetchCoveredEntities, createInventoryItem, updateInventoryItem, deleteInventoryItem } from '../lib/api';

const emptyForm = { covered_entity_id: '', ndc: '', drug_name: '', quantity_on_hand: '', unit_cost: '', reorder_threshold: '' };

export default function Inventory({ org }) {
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
      const [i, e] = await Promise.all([fetchInventoryItems(org.id), fetchCoveredEntities(org.id)]);
      setRows(i);
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
      quantity_on_hand: row.quantity_on_hand ?? '',
      unit_cost: row.unit_cost ?? '',
      reorder_threshold: row.reorder_threshold ?? '',
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
        quantity_on_hand: form.quantity_on_hand === '' ? 0 : Number(form.quantity_on_hand),
        unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
        reorder_threshold: form.reorder_threshold === '' ? null : Number(form.reorder_threshold),
      };
      if (editing) await updateInventoryItem(editing.id, payload);
      else await createInventoryItem({ ...payload, org_id: org.id });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete inventory item "${row.drug_name}"?`)) return;
    await deleteInventoryItem(row.id);
    await load();
  }

  return (
    <div>
      <div className="toolbar">
        <div>
          <h2>Inventory</h2>
          <div className="toolbar-sub">On-hand 340B stock by covered entity.</div>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openNew}>
          <Plus size={15} /> New inventory item
        </button>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {!loading && rows.length === 0 ? (
            <div className="empty-state">
              <Boxes size={28} />
              <p>No inventory items yet.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>NDC</th>
                  <th>On hand</th>
                  <th>Unit cost</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const low = row.reorder_threshold != null && row.quantity_on_hand <= row.reorder_threshold;
                  return (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>{row.drug_name}</td>
                      <td>{row.ndc || '—'}</td>
                      <td>{row.quantity_on_hand}</td>
                      <td>{row.unit_cost != null ? `$${Number(row.unit_cost).toFixed(2)}` : '—'}</td>
                      <td>{low && <span className="badge badge-warn"><AlertTriangle size={11} /> Reorder</span>}</td>
                      <td className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit inventory item' : 'New inventory item'}</h3>
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
                    <label>Quantity on hand</label>
                    <input type="number" step="any" value={form.quantity_on_hand} onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Unit cost ($)</label>
                    <input type="number" step="any" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Reorder threshold</label>
                    <input type="number" step="any" value={form.reorder_threshold} onChange={(e) => setForm({ ...form, reorder_threshold: e.target.value })} />
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
