import { useEffect, useState } from 'react';
import {
  addProvider,
  deleteProvider,
  getToken,
  listConfiguredProviders,
  listProviderCatalog,
  updateProvider,
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  listWorkflowPresets,
  listWorkflows,
  createWorkflow,
  createWorkflowFromPreset,
  updateWorkflow,
  deleteWorkflow,
  listRuns,
  getRun,
  listCustomTools,
  createCustomTool,
  deleteCustomTool,
  listBuiltinTools,
  listKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  createApiKey,
  listApiKeys,
  runAgent,
  streamRun,
} from '../api';
import { useProviderModels } from '../hooks/useProviderModels';
import './Dashboard.css';

const AGENT_PROMPT_ROLES = [
  ['router', 'Router', 'Classifies a request and can choose among routing options when a workflow includes a router step.'],
  ['direct', 'Direct responder', 'Handles a request in one focused response when the workflow routes work to this role.'],
  ['planner', 'Planner', 'Turns the information provided to this step into a plan; it does not perform the planned work.'],
  ['executor', 'Executor', 'Carries out the task assigned to this step using only its mapped inputs and enabled tools.'],
  ['controller', 'Workflow controller', 'Chooses among the outgoing workflow connections configured for this controller step.'],
  ['reviewer', 'Reviewer', 'Checks work against the criteria and evidence supplied to this step. It runs only when the workflow reaches it.'],
  ['finalizer', 'Final answer writer', 'Presents the completed workflow result in the requested format.'],
];

const WORKFLOW_ROLES = ['planner', 'executor', 'reviewer', 'finalizer', 'direct', 'router', 'controller'];

function JsonObjectField({ label, value, onChange, rows = 3 }) {
  const [draft, setDraft] = useState(JSON.stringify(value || {}, null, 2));
  const [error, setError] = useState('');
  useEffect(() => { setDraft(JSON.stringify(value || {}, null, 2)); }, [value]);
  return <div>
    <label className="field-label">{label}</label>
    <textarea className="key-input" rows={rows} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => {
      try { const parsed = JSON.parse(draft); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Enter a JSON object.'); onChange(parsed); setError(''); }
      catch { setError('Enter valid JSON object syntax before saving.'); }
    }} />
    {error && <span className="field-hint" style={{ color: '#b42318' }}>{error}</span>}
  </div>;
}

function workflowNode(id, name, role) {
  return {
    id, name, role, type: 'agent', instructions: `Describe what the ${name.toLowerCase()} step should do.`,
    input_mapping: { request: '$.request' }, output_schema: { response: 'string' }, tools: [], max_attempts: 1,
  };
}

function WorkflowsTab() {
  const [presets, setPresets] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [availableTools, setAvailableTools] = useState([]);
  const [editing, setEditing] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [jsonDraft, setJsonDraft] = useState('');
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [presetRows, workflowRows, customTools, builtinTools] = await Promise.all([listWorkflowPresets(), listWorkflows(), listCustomTools(), listBuiltinTools()]);
      setPresets(presetRows);
      setWorkflows(workflowRows);
      setAvailableTools([...builtinTools.builtin_tools.map((tool) => tool.name), ...customTools.map((tool) => tool.name)]);
    } catch (err) {
      setNotice({ message: err.message, kind: 'error' });
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function startCustom() {
    const definition = {
      schema_version: 1, start_node: 'step_1',
      nodes: [workflowNode('step_1', 'Step 1', 'executor')], edges: [],
      limits: { max_steps: 20, max_retries_per_step: 1 },
    };
    setEditing({ name: 'My workflow', description: '', definition });
    setJsonDraft(JSON.stringify(definition, null, 2));
    setAdvanced(false);
  }
  async function choosePreset(preset) {
    try {
      const workflow = await createWorkflowFromPreset(preset.id);
      await load();
      setEditing(workflow);
      setJsonDraft(JSON.stringify(workflow.definition, null, 2));
    } catch (err) { setNotice({ message: err.message, kind: 'error' }); }
  }
  function updateNode(index, patch) {
    const definition = { ...editing.definition, nodes: [...editing.definition.nodes] };
    definition.nodes[index] = { ...definition.nodes[index], ...patch };
    setEditing({ ...editing, definition });
    setJsonDraft(JSON.stringify(definition, null, 2));
  }
  function addStep() {
    const nodes = [...editing.definition.nodes];
    const id = `step_${Date.now()}`;
    const newNode = workflowNode(id, `Step ${nodes.length + 1}`, 'executor');
    const edges = [...editing.definition.edges];
    const terminal = nodes.find((node) => !edges.some((edge) => edge.from === node.id));
    if (terminal) edges.push({ from: terminal.id, to: id });
    const definition = { ...editing.definition, nodes: [...nodes, newNode], edges };
    setEditing({ ...editing, definition });
    setJsonDraft(JSON.stringify(definition, null, 2));
  }
  function removeFinalStep() {
    if (editing.definition.nodes.length <= 1) return;
    const terminal = [...editing.definition.nodes].reverse().find((node) => !editing.definition.edges.some((edge) => edge.from === node.id));
    if (!terminal || terminal.id === editing.definition.start_node) return;
    const definition = {
      ...editing.definition,
      nodes: editing.definition.nodes.filter((node) => node.id !== terminal.id),
      edges: editing.definition.edges.filter((edge) => edge.from !== terminal.id && edge.to !== terminal.id),
    };
    setEditing({ ...editing, definition });
    setJsonDraft(JSON.stringify(definition, null, 2));
  }
  async function saveWorkflow(event) {
    event.preventDefault();
    setSaving(true);
    try {
      let definition = editing.definition;
      if (advanced) definition = JSON.parse(jsonDraft);
      const payload = { name: editing.name, description: editing.description, definition };
      const saved = editing.version_id
        ? await updateWorkflow(editing.id, payload)
        : await createWorkflow(payload);
      setEditing(saved);
      setJsonDraft(JSON.stringify(saved.definition, null, 2));
      await load();
      setNotice({ message: 'Workflow saved as a new version.', kind: 'success' });
    } catch (err) { setNotice({ message: err.message, kind: 'error' }); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="providers-status">Loading workflows…</div>;
  return <>
    {notice && <div className={`tab-notice ${notice.kind}`}>{notice.message}</div>}
    {editing ? (
      <form onSubmit={saveWorkflow}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div><h3 style={{ margin: 0 }}>Workflow editor</h3><p className="field-hint">The workflow controls which steps run and what runs next. Each step prompt controls only that step.</p><p className="field-hint">Planner steps always receive up to six recent conversation messages (three exchanges). Dynamic controllers and direct responders receive this context too. Planners see descriptions of workflow-assigned tools; each step can call only its own assigned tools.</p></div>
          <button type="button" className="btn g" onClick={() => setEditing(null)}>Close</button>
        </div>
        <label className="field-label">Workflow name</label>
        <input className="key-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
        <label className="field-label" style={{ marginTop: '0.75rem' }}>Description</label>
        <input className="key-input" value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
        <div style={{ display: 'grid', gap: '0.75rem', margin: '1rem 0' }}>
          {editing.definition.nodes.map((node, index) => <section key={node.id} style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '1rem' }}>
            <strong>{index + 1}. {node.name || node.id}</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div><label className="field-label">Step name</label><input className="key-input" value={node.name || ''} onChange={(e) => updateNode(index, { name: e.target.value })} /></div>
              <div><label className="field-label">Role behavior</label><select className="default-select" value={node.role} onChange={(e) => updateNode(index, { role: e.target.value })}>{WORKFLOW_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></div>
            </div>
            <label className="field-label" style={{ marginTop: '0.75rem' }}>Instructions for this step</label>
            <textarea className="key-input" rows={3} value={node.instructions || ''} onChange={(e) => updateNode(index, { instructions: e.target.value })} />
            <label className="field-label" style={{ marginTop: '0.5rem' }}>Maximum attempts</label><input className="key-input" type="number" min="1" max="3" value={node.max_attempts || 1} onChange={(e) => updateNode(index, { max_attempts: Math.min(3, Math.max(1, Number(e.target.value) || 1)) })} />
            <details style={{ marginTop: '0.5rem' }}><summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Step inputs and outputs</summary>
              <JsonObjectField label="Input mapping (JSON)" value={node.input_mapping} onChange={(input_mapping) => updateNode(index, { input_mapping })} rows={2} />
              <JsonObjectField label="Output keys and expected types (JSON)" value={node.output_schema} onChange={(output_schema) => updateNode(index, { output_schema })} rows={2} />
              <label className="field-label">Tools this step may call (comma-separated)</label><input className="key-input" value={(node.tools || []).join(', ')} onChange={(e) => updateNode(index, { tools: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="e.g. semantic_search, get_conversation_history" />
              <span className="field-hint">Use $.request, $.variables, or $.steps.&lt;step-id&gt;.output.&lt;key&gt; to pass earlier results. Available tools: {availableTools.join(', ') || 'none configured'}.</span>
            </details>
          </section>)}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button type="button" className="btn g" onClick={addStep}>+ Add step</button>
          <button type="button" className="btn g" onClick={removeFinalStep} disabled={editing.definition.nodes.length <= 1}>Remove final step</button>
          <button type="button" className="btn g" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Hide JSON editor' : 'Edit workflow JSON'}</button>
        </div>
        {advanced && <div style={{ marginBottom: '1rem' }}><label className="field-label">Workflow definition</label><textarea className="key-input" rows={18} value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)} /></div>}
        <div style={{ padding: '0.75rem', background: 'var(--surface-muted, #f7f7f8)', borderRadius: 6, fontSize: '0.85rem', marginBottom: '1rem' }}>
          Steps run along the connections in this workflow. For branching, edit the JSON to add edges with a `when` condition that matches a structured output key, such as {`{"passed": true}`}. The runtime only permits configured transitions and enforces step and retry limits.
        </div>
        <button type="submit" className="btn p" disabled={saving}>{saving ? 'Saving…' : 'Save new workflow version'}</button>
      </form>
    ) : <>
      <p className="providers-intro">Pick a starter workflow or build your own. Fixed workflows continue through their configured steps in order. Choose Dynamic for general-purpose requests: its first agent selects a configured path, then the workflow continues through that path to completion. To answer from your own documents, attach a knowledge base to the agent and let an executor step use semantic_search. The standard planner/executor workflows include it as an optional tool; it is usable only when a knowledge base is attached. Presets are copied into your account so you can customize them.</p>
      <button className="btn p" onClick={startCustom} style={{ marginBottom: '1rem' }}>+ Create custom workflow</button>
      <h3>Starter workflows</h3>
      <div className="provider-grid">{presets.map((preset) => <article key={preset.id} className="provider-card">
        <h4>{preset.name}</h4><p>{preset.description}</p><button className="btn g small" onClick={() => choosePreset(preset)}>Use this workflow</button>
      </article>)}</div>
      <h3 style={{ marginTop: '2rem' }}>Your workflows</h3>
      {!workflows.length ? <p>No saved workflows yet.</p> : <div className="provider-grid">{workflows.map((workflow) => <article key={workflow.id} className="provider-card">
        <h4>{workflow.name}</h4><p>{workflow.description}</p><small>Version {workflow.version} · {workflow.definition.nodes.length} steps</small>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}><button className="btn g small" onClick={() => { setEditing(workflow); setJsonDraft(JSON.stringify(workflow.definition, null, 2)); }}>Edit</button><button className="btn g small" onClick={async () => { if (window.confirm('Delete this workflow? Agents currently using it will be reassigned to your Dynamic default workflow. Existing run history and its workflow snapshot will be kept.')) { try { const result = await deleteWorkflow(workflow.id); await load(); setNotice({ kind: 'success', message: result.agents_reassigned ? `${result.agents_reassigned} agent(s) reassigned to ${result.default_workflow_name}. Run history was preserved.` : 'Workflow deleted. Run history was preserved.' }); } catch (err) { setNotice({ message: err.message, kind: 'error' }); } } }}>Delete</button></div>
      </article>)}</div>}
    </>}
  </>;
}

function RunsTab() {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    listRuns().then((data) => setRuns(data.runs || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);
  async function openRun(runId) {
    try { setSelectedRun(await getRun(runId)); setError(''); }
    catch (err) { setError(err.message); }
  }
  if (loading) return <div className="providers-status">Loading runs…</div>;
  return <>
    <p className="providers-intro">Inspect how a workflow ran, including step inputs and outputs, failures, and timing.</p>
    {error && <div className="tab-notice error">{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(0, 2fr)', gap: '1rem' }}>
      <div style={{ display: 'grid', alignContent: 'start', gap: '0.5rem' }}>
        {!runs.length && <p>No runs found.</p>}
        {runs.map((run) => <button key={run.id} className="btn g" onClick={() => openRun(run.id)} style={{ textAlign: 'left' }}>
          <strong>{run.status}</strong><br /><small>{new Date(run.created_at).toLocaleString()} · {run.id.slice(0, 8)}</small>
        </button>)}
      </div>
      {selectedRun ? <section style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '1rem', minWidth: 0 }}>
        <h3 style={{ marginTop: 0 }}>Run details</h3>
        <p><strong>Status:</strong> {selectedRun.status} · <strong>Tokens:</strong> {selectedRun.tokens_used} · <strong>Duration:</strong> {selectedRun.duration_ms} ms</p>
        <p><strong>Request</strong></p><pre style={{ whiteSpace: 'pre-wrap' }}>{selectedRun.input}</pre>
        <h4>Executed workflow steps</h4>
        {(selectedRun.workflow_transitions || []).length > 0 && <ol>{selectedRun.workflow_transitions.map((transition, index) => <li key={`${transition.from}-${index}`}>{transition.from} → {transition.to}{transition.condition ? ` when ${JSON.stringify(transition.condition)}` : ''}</li>)}</ol>}
        {(selectedRun.workflow_steps || []).map((step) => <details key={step.id} open style={{ borderTop: '1px solid var(--border, #ddd)', padding: '0.75rem 0' }}>
          <summary style={{ cursor: 'pointer' }}><strong>{step.node_id}</strong> · attempt {step.attempt} · {step.status}</summary>
          {step.error && <p style={{ color: '#b42318' }}>{step.error}</p>}
          <strong>Input</strong><pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{JSON.stringify(step.input, null, 2)}</pre>
          <strong>Output</strong><pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{JSON.stringify(step.output, null, 2)}</pre>
        </details>)}
        <h4>Final result</h4><pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{JSON.stringify(selectedRun.result, null, 2)}</pre>
      </section> : <div className="empty-state"><h3>Select a run</h3><p>Choose a run to inspect the path it took.</p></div>}
    </div>
  </>;
}

const PROVIDER_COLORS = {
  nvidia: '#76b900',
  anthropic: '#d97757',
  openai: '#10a37f',
  google: '#4285f4',
  groq: '#f55036',
  openrouter: '#6467f2',
  together: '#0ea5e9',
  cerebras: '#f97316',
  mistral: '#ff7000',
  fireworks: '#e11d48',
  replicate: '#a855f7',
  cohere: '#39a96d',
};

function providerColor(providerId) {
  return PROVIDER_COLORS[providerId] || '#8b8bff';
}

function providerInitials(name) {
  const words = String(name).trim().split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0].slice(0, 2).toUpperCase();
}

function ProvidersTab() {
  const [catalog, setCatalog] = useState([]);
  const [configured, setConfigured] = useState({});
  const [status, setStatus] = useState('loading'); // loading | ready | error | anon
  const [error, setError] = useState(null);
  const [activeProvider, setActiveProvider] = useState(null);
  const [notice, setNotice] = useState(null);

  async function load() {
    if (!getToken()) {
      setStatus('anon');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const [cat, conf] = await Promise.all([
        listProviderCatalog(),
        listConfiguredProviders(),
      ]);
      setCatalog(cat);
      const map = {};
      conf.forEach((row) => {
        map[row.provider_id] = row;
      });
      setConfigured(map);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(message, kind = 'success') {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 4000);
  }

  if (status === 'anon') {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔑</div>
        <h3>Log in to configure providers</h3>
        <p>Providers are tied to your account. Log in to add API keys and pick models.</p>
        <a className="btn p" href="#/login">Log in</a>
      </div>
    );
  }

  if (status === 'loading') {
    return <div className="providers-status">Loading providers…</div>;
  }

  if (status === 'error') {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <h3>Could not load providers</h3>
        <p>{error}</p>
        <button className="btn p" onClick={load}>Retry</button>
      </div>
    );
  }

  const active = catalog.find((p) => p.provider_id === activeProvider);

  return (
    <>
      {notice && (
        <div className={`tab-notice ${notice.kind}`} role="status">
          {notice.kind === 'success' ? '✓' : '⚠'} {notice.message}
        </div>
      )}

      <p className="providers-intro">
        Pick a provider, paste your API key, then choose the models you want to use.
        Keys are verified live and stored encrypted.
      </p>

      <div className="provider-grid">
        {catalog.map((p) => {
          const conf = configured[p.provider_id];
          const modelCount = conf ? (conf.enabled_models || []).length : 0;
          return (
            <button
              key={p.provider_id}
              type="button"
              className={`provider-card ${conf ? 'configured' : ''}`}
              onClick={() => setActiveProvider(p.provider_id)}
            >
              <span
                className="provider-logo"
                style={{ background: providerColor(p.provider_id) }}
              >
                {providerInitials(p.display_name)}
              </span>
              <span className="provider-name">{p.display_name}</span>
              <span className={`provider-badge ${conf ? 'ok' : ''}`}>
                {conf
                  ? conf.default_model
                    ? conf.default_model
                    : modelCount
                    ? `${modelCount} model${modelCount === 1 ? '' : 's'} selected`
                    : 'Configured'
                  : 'Not configured'}
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <ProviderModal
          provider={active}
          existing={configured[active.provider_id] || null}
          onClose={() => setActiveProvider(null)}
          onKeySaved={(row) => {
            setConfigured((prev) => ({ ...prev, [row.provider_id]: row }));
          }}
          onSaved={(row, message) => {
            setConfigured((prev) => ({ ...prev, [row.provider_id]: row }));
            setActiveProvider(null);
            flash(message);
          }}
          onDeleted={(providerId) => {
            setConfigured((prev) => {
              const next = { ...prev };
              delete next[providerId];
              return next;
            });
            setActiveProvider(null);
            flash(`Provider ${providerId} and dependent agents/knowledge bases removed.`);
          }}
        />
      )}
    </>
  );
}

function ProviderModal({ provider, existing, onKeySaved, onClose, onSaved, onDeleted }) {
  const isConfigured = Boolean(existing);
  const [step, setStep] = useState(isConfigured ? 'models' : 'key');
  const [apiKey, setApiKey] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState(null);
  const [keyStored, setKeyStored] = useState(isConfigured);

  const [query, setQuery] = useState('');
  const [manualId, setManualId] = useState('');

  const [selected, setSelected] = useState(
    () => new Set((existing && existing.enabled_models) || [])
  );
  const [defaultModel, setDefaultModel] = useState(
    (existing && existing.default_model) || null
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const modelsQuery = useProviderModels(provider.provider_id, {
    enabled: step === 'models' && keyStored,
  });
  const models = modelsQuery.data ?? null;
  const modelsError = modelsQuery.error;
  const modelsLoading = modelsQuery.isLoading || modelsQuery.isFetching;

  async function verifyAndContinue(e) {
    e.preventDefault();
    setKeyBusy(true);
    setKeyError(null);
    try {
      const row = await addProvider({
        provider_id: provider.provider_id,
        api_key: apiKey.trim(),
      });
      setKeyStored(true);
      onKeySaved(row);
      setStep('models');
      setApiKey('');
    } catch (err) {
      setKeyError(err.message);
    } finally {
      setKeyBusy(false);
    }
  }

  function toggleModel(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (defaultModel === id) setDefaultModel(next.values().next().value || null);
      } else {
        next.add(id);
        if (!defaultModel) setDefaultModel(id);
      }
      return next;
    });
  }

  function addManualModel() {
    const id = manualId.trim();
    if (!id) return;
    setSelected((prev) => new Set(prev).add(id));
    if (!defaultModel) setDefaultModel(id);
    setManualId('');
  }

  async function save(e) {
    if (e) e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const enabled = Array.from(selected);
      let fallbackDefault = defaultModel;
      if (fallbackDefault && !enabled.includes(fallbackDefault)) fallbackDefault = null;
      if (!fallbackDefault && enabled.length) fallbackDefault = enabled[0];
      const payload = {
        enabled_models: enabled.length ? enabled : null,
        default_model: fallbackDefault,
      };
      if (!keyStored) {
        if (!apiKey.trim()) {
          setSaveError('API key required — go back and enter it.');
          return;
        }
        const row = await addProvider({
          provider_id: provider.provider_id,
          api_key: apiKey.trim(),
          ...payload,
        });
        onSaved(row, `${provider.display_name} configured`);
        return;
      }
      const row = await updateProvider(provider.provider_id, payload);
      onSaved(row, `${provider.display_name} updated`);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const confirmMsg =
      `⚠️ WARNING: Deleting ${provider.display_name} will permanently remove:\n` +
      `- The stored API key\n` +
      `- ALL Agents using this provider\n` +
      `- ALL Sessions, Runs, and Artifacts for those agents\n` +
      `- ALL Knowledge Bases relying on this provider for embeddings\n\n` +
      `Are you sure you want to permanently delete this provider and its dependents?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await deleteProvider(provider.provider_id);
      onDeleted(provider.provider_id);
    } catch (err) {
      setSaveError(err.message);
    }
  }

  const filtered =
    models === null
      ? []
      : query
      ? models.filter((m) => m.toLowerCase().includes(query.toLowerCase()))
      : models;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="provider-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span
            className="provider-logo"
            style={{ background: providerColor(provider.provider_id) }}
          >
            {providerInitials(provider.display_name)}
          </span>
          <div>
            <h3>{provider.display_name}</h3>
            <span className="modal-step">
              {step === 'key' ? 'Step 1 · API key' : 'Step 2 · Models'}
            </span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {step === 'key' && (
          <form className="modal-body" onSubmit={verifyAndContinue}>
            <label className="field-label" htmlFor="provider-key">
              API key
            </label>
            <p className="field-hint">
              Paste your {provider.display_name} API key. It will be verified with a live test
              call before saving, then stored encrypted.
            </p>
            <input
              id="provider-key"
              type="password"
              className="key-input"
              placeholder="sk-…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
              required
            />
            {keyError && <div className="modal-error">{keyError}</div>}
            <div className="modal-actions">
              <button type="button" className="btn g" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn p"
                disabled={keyBusy || !apiKey.trim()}
              >
                {keyBusy ? 'Verifying…' : 'Verify & continue'}
              </button>
            </div>
          </form>
        )}

        {step === 'models' && (
          <form className="modal-body" onSubmit={save}>
            <div className="models-toolbar">
              <input
                type="search"
                className="model-search"
                placeholder="Search models…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="btn g small"
                onClick={() => modelsQuery.refetch()}
                disabled={modelsLoading}
              >
                {modelsLoading ? 'Loading…' : 'Refresh list'}
              </button>
            </div>

            {modelsError && (
              <div className="modal-error">
                Couldn’t fetch the model list ({modelsError.message}). You can still add model IDs
                manually below.
              </div>
            )}

            <div className="model-list">
              {modelsLoading && models === null && (
                <div className="models-status">Fetching available models…</div>
              )}
              {!modelsLoading && models && models.length === 0 && !modelsError && (
                <div className="models-status">No models returned by this provider.</div>
              )}
              {filtered.map((id) => (
                <label key={id} className={`model-row ${selected.has(id) ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggleModel(id)}
                  />
                  <span className="model-id">{id}</span>
                  {defaultModel === id && <span className="model-default-tag">default</span>}
                </label>
              ))}
            </div>

            <div className="manual-add">
              <input
                type="text"
                placeholder="Add model ID manually…"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addManualModel();
                  }
                }}
              />
              <button
                type="button"
                className="btn g small"
                onClick={addManualModel}
                disabled={!manualId.trim()}
              >
                Add
              </button>
            </div>

            <label className="field-label" htmlFor="default-model">
              Default model
            </label>
            <select
              id="default-model"
              className="default-select"
              value={defaultModel || ''}
              onChange={(e) => setDefaultModel(e.target.value || null)}
            >
              <option value="">
                {selected.size ? 'Select a default…' : 'Select models first…'}
              </option>
              {Array.from(selected).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>

            <div className="selection-summary">
              {selected.size} model{selected.size === 1 ? '' : 's'} selected
            </div>

            {saveError && <div className="modal-error">{saveError}</div>}

            {isConfigured && (
              <div
                style={{
                  margin: '1rem 0',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  fontSize: '0.8rem',
                  lineHeight: '1.4',
                }}
              >
                ⚠️ <strong>Cascade Deletion Notice:</strong> Removing this provider will permanently delete all configured agents, chat sessions, runs, artifacts, and knowledge bases connected to it.
              </div>
            )}

            <div className="modal-actions">
              {isConfigured ? (
                <button type="button" className="btn danger" onClick={remove}>
                  Remove
                </button>
              ) : (
                <span className="key-saved-note">✓ API key saved</span>
              )}
              <div className="modal-actions-right">
                <button type="button" className="btn g" onClick={onClose}>
                  {keyStored ? 'Close' : 'Skip for now'}
                </button>
                <button type="submit" className="btn p" disabled={saving}>
                  {saving ? 'Saving…' : 'Save selection'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AgentsTab() {
  const [agents, setAgents] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [providers, setProviders] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [status, setStatus] = useState('loading');
  const [isCreating, setIsCreating] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [notice, setNotice] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    provider_id: '',
    planner: '',
    executor: '',
    reviewer: '',
    workflow_version_id: '',
    knowledge_base_ids: [],
    system_prompt: 'You are a helpful assistant.',
    // Custom prompts (optional)
    router_prompt: '',
    planner_prompt: '',
    executor_prompt: '',
    reviewer_prompt: '',
    direct_prompt: '',
    finalizer_prompt: '',
    controller_prompt: '',
    role_prompt_presets: {},
    role_instructions: {},
  });
  const selectedProvider = providers.find((p) => p.id === formData.provider_id);
  const providerModelsQuery = useProviderModels(selectedProvider?.provider_id, {
    enabled: isCreating && Boolean(selectedProvider),
  });
  const providerModels = Array.from(new Set([
    ...(selectedProvider?.enabled_models || []),
    ...(providerModelsQuery.data || []),
    formData.planner,
    formData.executor,
    formData.reviewer,
  ].filter(Boolean)));
  const modelsLoading = providerModelsQuery.isLoading || providerModelsQuery.isFetching;
  const modelsError = providerModelsQuery.error?.message;
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [defaultPrompts, setDefaultPrompts] = useState(null);
  const [rolePresets, setRolePresets] = useState({});

  useEffect(() => {
    if (!selectedProvider || !providerModels.length) return;
    const defaultModel = selectedProvider.default_model || providerModels[0];
    setFormData((prev) => ({
      ...prev,
      planner: prev.planner || defaultModel,
      executor: prev.executor || defaultModel,
      reviewer: prev.reviewer || defaultModel,
    }));
  }, [providerModelsQuery.data, selectedProvider?.default_model]);

  async function load() {
    if (!getToken()) {
      setStatus('anon');
      return;
    }
    setStatus('loading');
    try {
      const [agentsData, providersData, kbData, workflowData] = await Promise.all([
        listAgents(),
        listConfiguredProviders(),
        listKnowledgeBases(),
        listWorkflows(),
      ]);
      setAgents(agentsData);
      setProviders(providersData);
      setKnowledgeBases(kbData || []);
      setWorkflows(workflowData || []);
      setStatus('ready');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }
  
  async function loadDefaultPrompts() {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/v1/agents/default-prompts`.replace(/\/$/, ''));
      const data = await response.json();
      setDefaultPrompts(data.default_prompts);
      setRolePresets(data.role_presets || {});
    } catch (err) {
      console.error('Failed to load default prompts:', err);
    }
  }

  useEffect(() => {
    load();
    loadDefaultPrompts();
  }, []);

  function flash(message, kind = 'success') {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 4000);
  }

  function handleProviderSelect(providerId) {
    setFormData((prev) => ({
      ...prev,
      provider_id: providerId,
      planner: '',
      executor: '',
      reviewer: '',
    }));
  }

  function openAgentForm(agent = null) {
    setEditingAgent(agent);
    const config = agent?.config || {};
    const models = config.models || {};
    setFormData({
      name: agent?.name || '',
      provider_id: agent?.provider_id || '',
      planner: models.planner || '',
      executor: models.executor || '',
      reviewer: models.reviewer || '',
      workflow_version_id: config.workflow_version_id || '',
      context_window_tokens: config.context_window_tokens ?? 4096,
      knowledge_base_ids: config.knowledge_base_ids || [],
      system_prompt: config.system_prompt || 'You are a helpful assistant.',
      router_prompt: config.router_prompt || '',
      planner_prompt: config.planner_prompt || '',
      executor_prompt: config.executor_prompt || '',
      reviewer_prompt: config.reviewer_prompt || '',
      direct_prompt: config.direct_prompt || '',
      finalizer_prompt: config.finalizer_prompt || '',
      controller_prompt: config.controller_prompt || '',
      role_prompt_presets: config.role_prompt_presets || {},
      role_instructions: config.role_instructions || {},
    });
    setShowAdvanced(Boolean(agent && [
      config.router_prompt, config.planner_prompt, config.executor_prompt,
      config.reviewer_prompt, config.direct_prompt, config.finalizer_prompt,
      config.controller_prompt,
    ].some(Boolean)));
    setIsCreating(true);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.provider_id) {
      flash('Please select a provider.', 'error');
      return;
    }
    if (!formData.workflow_version_id) {
      flash('Choose a workflow before saving this agent. Create one from a preset or build a custom workflow in the Workflows section.', 'error');
      return;
    }
    if (!formData.planner || !formData.executor || !formData.reviewer) {
      flash('Please select models for planner, executor, and reviewer.', 'error');
      return;
    }
    try {
      const payload = {
        ...(editingAgent?.config || {}),
        name: formData.name || 'New Agent',
        provider_id: formData.provider_id,
        workflow_version_id: formData.workflow_version_id || null,
        models: {
          planner: formData.planner,
          executor: formData.executor,
          reviewer: formData.reviewer,
        },
        context_window_tokens: formData.context_window_tokens === 'none'
          ? null
          : Number(formData.context_window_tokens) || 4096,
        knowledge_base_ids: formData.knowledge_base_ids,
        system_prompt: formData.system_prompt,
        router_prompt: formData.router_prompt || null,
        planner_prompt: formData.planner_prompt || null,
        executor_prompt: formData.executor_prompt || null,
        reviewer_prompt: formData.reviewer_prompt || null,
        direct_prompt: formData.direct_prompt || null,
        finalizer_prompt: formData.finalizer_prompt || null,
        controller_prompt: formData.controller_prompt || null,
        role_prompt_presets: formData.role_prompt_presets || {},
        role_instructions: formData.role_instructions || {},
      };
      if (editingAgent) await updateAgent(editingAgent.id, payload);
      else await createAgent(payload);
      setIsCreating(false);
      setEditingAgent(null);
      setFormData({
        name: '',
        provider_id: '',
        planner: '',
        executor: '',
        reviewer: '',
        workflow_version_id: '',
        context_window_tokens: 4096,
        knowledge_base_ids: [],
        system_prompt: 'You are a helpful assistant.',
        role_prompt_presets: {},
        role_instructions: {},
      });
      flash(editingAgent ? 'Agent updated successfully!' : 'Agent created successfully!');
      load();
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this agent?')) return;
    try {
      await deleteAgent(id);
      flash('Agent deleted.');
      load();
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  if (status === 'loading') return <div>Loading agents...</div>;
  if (status === 'error') return <div>Error loading agents.</div>;

  if (isCreating) {
    return (
      <div className="agent-create-form">
        <h3>{editingAgent ? 'Edit Agent' : 'Create New Agent'}</h3>
        {notice && <div className={`tab-notice ${notice.kind}`}>{notice.message}</div>}
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Agent Name</label>
            <input
              className="key-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. PDF Assistant"
              required
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Provider</label>
            <select
              className="default-select"
              value={formData.provider_id}
              onChange={(e) => handleProviderSelect(e.target.value)}
              required
            >
              <option value="">Select a configured provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.provider_id}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Workflow</label>
            <select className="default-select" required value={formData.workflow_version_id || ''} onChange={(e) => setFormData({ ...formData, workflow_version_id: e.target.value })}>
              <option value="">Select a workflow…</option>
              {workflows.map((workflow) => <option key={workflow.version_id} value={workflow.version_id}>{workflow.name} · v{workflow.version}</option>)}
            </select>
            <span className="field-hint">Choose a saved workflow. This workflow decides which steps run and in what order. Create or customize workflows in the Workflows section.</span>
          </div>
          {selectedProvider && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #888)' }}>
                  {modelsLoading
                    ? 'Fetching available models from provider...'
                    : `${providerModels.length} models available`}
                </span>
                <button
                  type="button"
                  className="btn g small"
                  onClick={() => providerModelsQuery.refetch()}
                  disabled={modelsLoading}
                >
                  {modelsLoading ? 'Loading…' : 'Refresh list'}
                </button>
              </div>

              {modelsError && (
                <div className="modal-error" style={{ marginBottom: '1rem' }}>
                  Could not fetch models live ({modelsError}). You can still pick configured models below.
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label className="field-label">Planner Model</label>
                <select
                  className="default-select"
                  value={formData.planner}
                  onChange={(e) => setFormData({ ...formData, planner: e.target.value })}
                  required
                >
                  <option value="">Select planner model...</option>
                  {providerModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className="field-label">Executor Model</label>
                <select
                  className="default-select"
                  value={formData.executor}
                  onChange={(e) => setFormData({ ...formData, executor: e.target.value })}
                  required
                >
                  <option value="">Select executor model...</option>
                  {providerModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className="field-label">Reviewer Model</label>
                <select
                  className="default-select"
                  value={formData.reviewer}
                  onChange={(e) => setFormData({ ...formData, reviewer: e.target.value })}
                  required
                >
                  <option value="">Select reviewer model...</option>
                  {providerModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Context Budget (tokens)</label>
            <select
              className="default-select"
              value={formData.context_window_tokens ?? 'none'}
              onChange={(e) => setFormData({ ...formData, context_window_tokens: e.target.value === 'none' ? 'none' : Number(e.target.value) })}
            >
              <option value="2048">2,048 tokens</option>
              <option value="4096">4,096 tokens (default)</option>
              <option value="8192">8,192 tokens</option>
              <option value="16384">16,384 tokens</option>
              <option value="32768">32,768 tokens</option>
              <option value="65536">65,536 tokens</option>
              <option value="128000">128,000 tokens</option>
              <option value="none">No limit</option>
            </select>
            <span className="field-hint">Sets the approximate prompt budget per model call. “No limit” disables this app’s prompt cap; the selected model and provider still enforce their own context limit.</span>
          </div>

          {knowledgeBases.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label className="field-label">Knowledge Bases (Vector Retrieval / BYOD)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {knowledgeBases.map((kb) => (
                  <label key={kb.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={formData.knowledge_base_ids.includes(kb.id)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData((prev) => ({
                          ...prev,
                          knowledge_base_ids: checked
                            ? [...prev.knowledge_base_ids, kb.id]
                            : prev.knowledge_base_ids.filter((id) => id !== kb.id),
                        }));
                      }}
                    />
                    <span>{kb.name} <small style={{ opacity: 0.7 }}>({kb.embedding_model})</small></span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">System Prompt</label>
            <textarea
              className="key-input"
              rows={4}
              value={formData.system_prompt}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: '1rem', border: '1px solid var(--border, #e5e7eb)', borderRadius: '8px', padding: '1rem' }}>
            <label className="field-label">How workflow roles are used</label>
            <div style={{ fontSize: '0.85rem', color: '#555', lineHeight: 1.55, margin: '0.35rem 0 1rem' }}>
              <p style={{ margin: '0 0 0.5rem' }}><strong>The selected workflow defines the path.</strong> Fixed workflows continue through their configured steps in order. The Dynamic workflow starts with a routing decision, then continues through the selected configured path to completion. Workflows can also include conditional branches.</p>
              <p style={{ margin: '0 0 0.5rem' }}>Each step selects a role such as Planner, Executor, Reviewer, or Final answer writer. That role’s prompt settings apply only when a step using that role runs; a Reviewer prompt does not cause a review step to be added.</p>
              <p style={{ margin: 0 }}>The shared System Prompt is included with each step. The workflow step’s instructions and mapped inputs tell that role what to do for this particular task.</p>
            </div>
            <label className="field-label">Customize role behavior</label>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0.25rem 0 1rem' }}>
              Choose a behavior preset and add optional guidance for roles used by this agent’s workflow. Add or remove workflow steps in the Workflows section.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {AGENT_PROMPT_ROLES.map(([role, label, description]) => {
                const presets = rolePresets[role] || [
                  { id: 'balanced', name: 'Balanced', description: 'Use the built-in role behavior.' },
                ];
                const selectedPreset = formData.role_prompt_presets?.[role] || 'balanced';
                const selectedInfo = presets.find((preset) => preset.id === selectedPreset);
                return (
                  <div key={role} style={{ padding: '0.75rem', border: '1px solid var(--border, #e5e7eb)', borderRadius: '6px' }}>
                    <label className="field-label" htmlFor={`role-preset-${role}`}>{label}</label>
                    <p style={{ fontSize: '0.78rem', color: '#666', lineHeight: 1.45, minHeight: '3.4em', margin: '0.15rem 0 0.5rem' }}>{description}</p>
                    <select
                      id={`role-preset-${role}`}
                      className="default-select"
                      value={selectedPreset}
                      onChange={(e) => setFormData((prev) => ({
                        ...prev,
                        role_prompt_presets: { ...(prev.role_prompt_presets || {}), [role]: e.target.value },
                      }))}
                    >
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                      ))}
                    </select>
                    <span className="field-hint">{selectedInfo?.description || 'Uses the balanced built-in role behavior.'}</span>
                    <textarea
                      className="key-input"
                      rows={2}
                      style={{ marginTop: '0.5rem' }}
                      value={formData.role_instructions?.[role] || ''}
                      onChange={(e) => setFormData((prev) => ({
                        ...prev,
                        role_instructions: { ...(prev.role_instructions || {}), [role]: e.target.value },
                      }))}
                      placeholder={`Additional ${label.toLowerCase()} guidance (optional)`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Custom Prompts Section */}
          <div style={{ marginBottom: '1rem', border: '1px solid var(--border, #e5e7eb)', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <label className="field-label" style={{ margin: 0 }}>
                Full prompt overrides <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 'normal' }}>(Optional - Advanced)</span>
              </label>
              <button
                type="button"
                className="btn g small"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? 'Hide' : 'Show'}
              </button>
            </div>
            
            {showAdvanced && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#666', margin: 0 }}>
                  These advanced fields replace the built-in role prompt and its selected preset. Clear an override to restore the built-in prompt plus role behavior settings.
                </p>
                
                {/* Router Prompt */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Router Prompt</label>
                    {defaultPrompts?.router && (
                      <button
                        type="button"
                        style={{
                          fontSize: '0.75rem',
                          color: '#888',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                        onClick={() => setFormData(prev => ({...prev, router_prompt: ''}))}
                      >
                        Clear override
                      </button>
                    )}
                  </div>
                  <textarea
                    className="key-input"
                    rows={3}
                    value={formData.router_prompt}
                    onChange={(e) => setFormData({ ...formData, router_prompt: e.target.value })}
                    placeholder="Decides whether to use direct or plan mode (leave blank for default)"
                  />
                </div>
                
                {/* Planner Prompt */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Planner Prompt</label>
                    {defaultPrompts?.planner && (
                      <button
                        type="button"
                        style={{
                          fontSize: '0.75rem',
                          color: '#888',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                        onClick={() => setFormData(prev => ({...prev, planner_prompt: ''}))}
                      >
                        Clear override
                      </button>
                    )}
                  </div>
                  <textarea
                    className="key-input"
                    rows={3}
                    value={formData.planner_prompt}
                    onChange={(e) => setFormData({ ...formData, planner_prompt: e.target.value })}
                    placeholder="Breaks down complex tasks into steps (leave blank for default)"
                  />
                </div>
                
                {/* Executor Prompt */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Executor Prompt</label>
                    {defaultPrompts?.executor && (
                      <button
                        type="button"
                        style={{
                          fontSize: '0.75rem',
                          color: '#888',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                        onClick={() => setFormData(prev => ({...prev, executor_prompt: ''}))}
                      >
                        Clear override
                      </button>
                    )}
                  </div>
                  <textarea
                    className="key-input"
                    rows={3}
                    value={formData.executor_prompt}
                    onChange={(e) => setFormData({ ...formData, executor_prompt: e.target.value })}
                    placeholder="Executes individual steps (leave blank for default)"
                  />
                </div>
                
                {/* Reviewer Prompt */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Reviewer Prompt</label>
                    {defaultPrompts?.reviewer && (
                      <button
                        type="button"
                        style={{
                          fontSize: '0.75rem',
                          color: '#888',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                        onClick={() => setFormData(prev => ({...prev, reviewer_prompt: ''}))}
                      >
                        Clear override
                      </button>
                    )}
                  </div>
                  <textarea
                    className="key-input"
                    rows={3}
                    value={formData.reviewer_prompt}
                    onChange={(e) => setFormData({ ...formData, reviewer_prompt: e.target.value })}
                    placeholder="Reviews completed steps (leave blank for default)"
                  />
                </div>
                
                {/* Controller Prompt */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Workflow Controller Override</label>
                    {defaultPrompts?.controller && (
                      <button
                        type="button"
                        style={{ fontSize: '0.75rem', color: '#888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => setFormData(prev => ({ ...prev, controller_prompt: '' }))}
                      >Clear override</button>
                    )}
                  </div>
                  <textarea
                    className="key-input"
                    rows={3}
                    value={formData.controller_prompt}
                    onChange={(e) => setFormData({ ...formData, controller_prompt: e.target.value })}
                    placeholder="Replace the built-in controller instructions (advanced)"
                  />
                </div>

                {/* Direct Prompt */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Direct Prompt</label>
                    {defaultPrompts?.direct && (
                      <button
                        type="button"
                        style={{
                          fontSize: '0.75rem',
                          color: '#888',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                        onClick={() => setFormData(prev => ({...prev, direct_prompt: ''}))}
                      >
                        Clear override
                      </button>
                    )}
                  </div>
                  <textarea
                    className="key-input"
                    rows={3}
                    value={formData.direct_prompt}
                    onChange={(e) => setFormData({ ...formData, direct_prompt: e.target.value })}
                    placeholder="Handles simple queries in a single pass (leave blank for default)"
                  />
                </div>
                
                {/* Finalizer Prompt */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: '500' }}>Finalizer Prompt</label>
                    {defaultPrompts?.finalizer && (
                      <button
                        type="button"
                        style={{
                          fontSize: '0.75rem',
                          color: '#888',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                        onClick={() => setFormData(prev => ({...prev, finalizer_prompt: ''}))}
                      >
                        Clear override
                      </button>
                    )}
                  </div>
                  <textarea
                    className="key-input"
                    rows={3}
                    value={formData.finalizer_prompt}
                    onChange={(e) => setFormData({ ...formData, finalizer_prompt: e.target.value })}
                    placeholder="Composes the final answer (leave blank for default)"
                  />
                </div>
                
                <div style={{ fontSize: '0.8rem', color: '#666', padding: '0.5rem', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
                  💡 <strong>Tip:</strong> Built-in tools include get_conversation_history and semantic_search (when a knowledge base is attached), plus store_kv and others.
                  Mention them in your custom prompts to guide the agent's behavior.
                </div>
              </div>
            )}
          </div>
          
          <div className="modal-actions">
            <button type="button" className="btn g" onClick={() => { setIsCreating(false); setEditingAgent(null); }}>
              Cancel
            </button>
            <button type="submit" className="btn p">
              {editingAgent ? 'Save Changes' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      {notice && <div className={`tab-notice ${notice.kind}`}>{notice.message}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <p className="providers-intro">Manage your intelligent agents and their pipelines.</p>
        <button className="btn p" onClick={() => openAgentForm()}>
          + Create Agent
        </button>
      </div>
      
      {agents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🤖</div>
          <h3>No agents yet</h3>
          <p>Get started by creating your first agent.</p>
          <button className="btn p" onClick={() => openAgentForm()}>Create Agent</button>
        </div>
      ) : (
        <div className="provider-grid">
          {agents.map((agent) => {
            const agentProv = providers.find((p) => p.id === agent.provider_id);
            const providerName = agentProv ? agentProv.provider_id : agent.provider_id;
            const models = agent.config && agent.config.models;
            const kbIds = (agent.config && agent.config.knowledge_base_ids) || [];
            return (
              <div key={agent.id} className="provider-card configured" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span className="provider-logo" style={{ background: '#6467f2' }}>
                    AG
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="provider-name" style={{ fontWeight: 600 }}>{agent.name}</div>
                    <span className="provider-badge ok">Provider: {providerName}</span>
                  </div>
                </div>
                <div className="agent-id-row"><strong>Agent ID</strong><code>{agent.id}</code><button className="btn g small" type="button" onClick={() => navigator.clipboard.writeText(agent.id)}>Copy</button></div>
                {models && (
                  <div style={{ fontSize: '0.8rem', opacity: 0.85, width: '100%', display: 'flex', flexDirection: 'column', gap: '0.2rem', margin: '0.5rem 0' }}>
                    <div><strong>Planner:</strong> {models.planner}</div>
                    <div><strong>Executor:</strong> {models.executor}</div>
                    <div><strong>Reviewer:</strong> {models.reviewer}</div>
                  </div>
                )}
                {kbIds.length > 0 && (
                  <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '0.25rem' }}>
                    <strong>Attached KBs:</strong> {kbIds.length} connected
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignSelf: 'flex-end' }}>
                <button
                  className="btn g small"
                  onClick={() => openAgentForm(agent)}
                >
                  Edit
                </button>
                <button 
                  className="btn danger small" 
                  onClick={() => handleDelete(agent.id)}
                >
                  Delete
                </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const INTEGRATION_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

function IntegrationTab() {
  const [agents, setAgents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [template, setTemplate] = useState('react');
  const [endUserId, setEndUserId] = useState('demo-user-123');
  const [sessionId, setSessionId] = useState('demo-conversation-123');
  const [prompt, setPrompt] = useState('What can you help me with?');
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    listAgents().then((rows) => {
      setAgents(rows || []);
      setSelectedId(rows?.[0]?.id || '');
    }).catch((err) => setError(err.message)).finally(() => setLoadingAgents(false));
  }, []);


  const examples = {
    react: `// React component: call YOUR backend, never the gateway token from the browser.\nimport { useState } from 'react';\n\nexport function AgentChat() {\n  const [answer, setAnswer] = useState('');\n  const [busy, setBusy] = useState(false);\n\n  async function send(message) {\n    setBusy(true);\n    try {\n      // Your backend authenticates the signed-in user and supplies their trusted ID.\n      const response = await fetch('/api/agent-chat', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ message, sessionId: 'conversation-123' }),\n        credentials: 'include',\n      });\n      const data = await response.json();\n      if (!response.ok) throw new Error(data.error || 'Request failed');\n      setAnswer('Run started: ' + data.runId + '. Read progress and the result from the authenticated event stream.');\n    } finally { setBusy(false); }\n  }\n\n  return <section>\n    <button disabled={busy} onClick={() => send('Hello!')}>Ask agent</button>\n    <p>{answer}</p>\n  </section>;\n}`,
    node: `// Node.js / Express backend. Keep AGENT_GATEWAY_TOKEN in server environment.\nimport express from 'express';\n\nconst app = express();\napp.use(express.json());\napp.post('/api/agent-chat', requireYourUserAuth, async (req, res) => {\n  const userId = req.user.id; // Set by your verified authentication middleware\n  const gateway = await fetch('${INTEGRATION_BASE_URL}/v1/agents/${selectedId || '<AGENT_ID>'}/run', {\n    method: 'POST',\n    headers: {\n      Authorization: \`Bearer \${process.env.AGENT_GATEWAY_TOKEN}\`,\n      'Content-Type': 'application/json',\n      'X-End-User-ID': String(userId),\n      'X-Session-ID': req.body.sessionId, // optional; reuse to continue a conversation\n    },\n    body: JSON.stringify({ input: req.body.message }),\n  });\n  const run = await gateway.json();\n  if (!gateway.ok) return res.status(gateway.status).json({ error: run.detail || 'Gateway request failed' });\n  // Read /v1/runs/{run_id}/stream with the same bearer token to receive progress and the result.\n  res.status(202).json({ runId: run.run_id, sessionId: run.session_id, status: run.status });\n});`,
    python: `# Python / FastAPI backend. Keep AGENT_GATEWAY_TOKEN in server environment.\nimport os\nimport httpx\nfrom fastapi import FastAPI, Depends\n\napp = FastAPI()\nGATEWAY = '${INTEGRATION_BASE_URL}'\nAGENT_ID = '${selectedId || '<AGENT_ID>'}'\n\n@app.post('/api/agent-chat')\nasync def agent_chat(body: dict, user=Depends(require_your_user_auth)):\n    # user.id comes from your verified authentication middleware.\n    async with httpx.AsyncClient() as client:\n        response = await client.post(\n            f'{GATEWAY}/v1/agents/{AGENT_ID}/run',\n            headers={\n                'Authorization': f"Bearer {os.environ['AGENT_GATEWAY_TOKEN']}",\n                'X-End-User-ID': str(user.id),\n                'X-Session-ID': body.get('sessionId', ''),\n            },\n            json={'input': body['message']},\n        )\n        response.raise_for_status()\n        return response.json() # use run_id to subscribe to /v1/runs/{run_id}/stream with the same token\n`,
  };

  async function execute() {
    if (!selectedId || !prompt.trim()) return;
    setRunning(true); setError(''); setRunOutput('Starting run…');
    try {
      const started = await runAgent(selectedId, prompt, endUserId.trim(), sessionId.trim());
      const steps = [];
      let terminal = null;
      const showProgress = () => setRunOutput(JSON.stringify({
        run_id: started.run_id,
        session_id: started.session_id,
        status: terminal?.status || 'running',
        steps,
        result: terminal?.result,
      }, null, 2));
      setRunOutput(JSON.stringify({ run_id: started.run_id, session_id: started.session_id, status: 'running', steps }, null, 2));
      try {
        await streamRun(started.run_id, ({ type, data }) => {
          if (type === 'workflow_step_started') {
            steps.push({ node_id: data.node_id, name: data.name, role: data.role, attempt: data.attempt, status: 'running' });
            showProgress();
          } else if (type === 'workflow_step_completed' || type === 'workflow_step_failed') {
            const step = [...steps].reverse().find((item) => item.node_id === data.node_id && item.status === 'running');
            if (step) {
              step.status = type === 'workflow_step_completed' ? 'succeeded' : 'failed';
              if (type === 'workflow_step_completed') step.output = data.output;
              else step.error = data.error;
            }
            showProgress();
          } else if (type === 'run_completed' || type === 'run_failed') {
            terminal = { status: data.status || (type === 'run_completed' ? 'done' : 'failed'), result: data.result || data.output };
            showProgress();
          }
        });
      } catch (streamError) {
        // Retain the existing polling path when Redis/SSE is unavailable.
        setRunOutput(JSON.stringify({ run_id: started.run_id, status: 'running', stream_notice: streamError.message, steps }, null, 2));
      }
      if (!terminal) {
        let latest;
        for (let attempt = 0; attempt < 90; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          latest = await getRun(started.run_id);
          if (['done', 'failed', 'cancelled'].includes(latest.status)) break;
        }
        terminal = { status: latest?.status || 'still_running', result: latest?.result };
        setRunOutput(JSON.stringify({ run_id: started.run_id, session_id: started.session_id, ...terminal, steps, error: latest?.error_message }, null, 2));
      }
    } catch (err) { setError(err.message); setRunOutput(''); }
    finally { setRunning(false); }
  }

  async function copyExample() {
    try { await navigator.clipboard.writeText(examples[template]); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setError('Could not copy the example.'); }
  }

  return <div className="integration-page">
    <section className="integration-intro">
      <p className="field-hint">Connect your app to an agent with these starter examples, then try a request in the playground.</p>
      <div className="integration-warning"><strong>Protect your gateway token.</strong> Use it only on your server, stored in an environment variable. Never put it in React/browser code. Authenticate each end user in your own backend and derive <code>X-End-User-ID</code> from that verified identity; do not trust an ID sent by the browser.</div>
    </section>

    <section className="integration-panel">
      <h3>Run updates with server-sent events</h3>
      <p className="field-hint">Start a run, then subscribe to <code>GET /v1/runs/{'{run_id}'}/stream</code> with the same <code>Authorization: Bearer [your gateway token]</code> used to start it. The authenticated SSE stream reports progress and the final result. No callback URL or separate signing token is needed.</p>
      <p className="field-hint">Keep the gateway token on your server. Your backend can read the SSE stream and relay progress to your app over your own authenticated connection. Redis must be configured and reachable for streaming; <code>GET /v1/runs/{'{run_id}'}</code> remains available as a polling fallback.</p>
      <pre className="integration-code"><code>{`curl --no-buffer \\
  -H "Authorization: Bearer $AGENT_GATEWAY_TOKEN" \\
  "${INTEGRATION_BASE_URL}/v1/runs/$RUN_ID/stream"`}</code></pre>
    </section>

    <section className="integration-panel">
      <h3>Your agents</h3>
      {loadingAgents ? <p className="field-hint">Loading agents…</p> : agents.length ? <div className="integration-agent-list">{agents.map((agent) => <div className="integration-agent" key={agent.id}><div><strong>{agent.name}</strong><code>{agent.id}</code></div><button className="btn g small" onClick={() => { setSelectedId(agent.id); navigator.clipboard.writeText(agent.id); }}>Use ID</button></div>)}</div> : <p className="field-hint">No agents found. Create an agent first in the Agents section.</p>}
    </section>

    <section className="integration-panel">
      <h3>Integration templates</h3>
      <div className="integration-meta"><span><strong>Gateway URL</strong><code>{INTEGRATION_BASE_URL}</code></span><span><strong>Selected agent</strong><code>{selectedId || 'Select an agent above'}</code></span></div>
      <div className="integration-template-tabs">{[['react', 'React UI'], ['node', 'Node.js backend'], ['python', 'Python backend']].map(([id, label]) => <button key={id} className={`btn ${template === id ? 'p' : 'g'}`} onClick={() => setTemplate(id)}>{label}</button>)}</div>
      <pre className="integration-code"><code>{examples[template]}</code></pre>
      <button className="btn g" onClick={copyExample}>{copied ? 'Copied' : 'Copy example'}</button>
      <p className="field-hint">The browser example calls your app backend. Your backend authenticates the user, then adds the gateway token and trusted end-user ID.</p>
    </section>

    <section className="integration-panel">
      <h3>Try an agent</h3>
      <p className="field-hint">This playground sends requests as your signed-in gateway account. End-user ID here is for testing; production apps should set it server-side from authenticated identity.</p>
      <label className="field-label">Agent</label><select className="default-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} — {agent.id}</option>)}</select>
      <div className="integration-form-grid"><div><label className="field-label">Test end-user ID</label><input className="key-input" value={endUserId} onChange={(event) => setEndUserId(event.target.value)} /></div><div><label className="field-label">Session ID (reuse to continue)</label><input className="key-input" value={sessionId} onChange={(event) => setSessionId(event.target.value)} /></div></div>
      <label className="field-label">Message</label><textarea className="key-input" rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <button className="btn p" disabled={running || !selectedId || !prompt.trim()} onClick={execute}>{running ? 'Running…' : 'Run agent'}</button>
      {error && <div className="tab-notice error">{error}</div>}
      {runOutput && <pre className="integration-code"><code>{runOutput}</code></pre>}
    </section>
  </div>;
}

function ToolsTab() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', endpoint_url: '', auth_token: '',
    timeout_ms: 10000, input_schema: '{\n  "type": "object",\n  "properties": {\n    "page_number": { "type": "integer", "description": "Page to inspect" }\n  },\n  "required": ["page_number"]\n}',
  });

  async function load() {
    setLoading(true);
    try { setTools(await listCustomTools()); }
    catch (err) { setNotice({ kind: 'error', message: err.message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function register(event) {
    event.preventDefault();
    let inputSchema;
    try {
      inputSchema = JSON.parse(form.input_schema || '{}');
      if (!inputSchema || Array.isArray(inputSchema) || typeof inputSchema !== 'object') throw new Error();
    } catch {
      setNotice({ kind: 'error', message: 'Input schema must be a valid JSON object.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await createCustomTool({
        name: form.name.trim(), description: form.description.trim(), kind: 'webhook',
        endpoint_url: form.endpoint_url.trim(),
        auth_token: form.auth_token.trim() || undefined,
        timeout_ms: Number(form.timeout_ms) || 10000, input_schema: inputSchema,
      });
      setForm({ name: '', description: '', endpoint_url: '', auth_token: '', timeout_ms: 10000, input_schema: '{\n  "type": "object",\n  "properties": {\n    "page_number": { "type": "integer", "description": "Page to inspect" }\n  },\n  "required": ["page_number"]\n}' });
      setShowForm(false);
      setNotice({ kind: 'success', message: 'Tool registered.' });
      await load();
    } catch (err) { setNotice({ kind: 'error', message: err.message }); }
    finally { setSaving(false); }
  }

  async function remove(tool) {
    if (!window.confirm(`Delete the tool “${tool.name}”?`)) return;
    try {
      await deleteCustomTool(tool.id);
      setTools((current) => current.filter((item) => item.id !== tool.id));
      setNotice({ kind: 'success', message: `Deleted ${tool.name}.` });
    } catch (err) { setNotice({ kind: 'error', message: err.message }); }
  }

  return <div className="tab-content">
    {notice && <div className={`tab-notice ${notice.kind}`} role="status">{notice.message}</div>}
    <section className="tools-panel">
      <div className="tools-panel-header"><div><h3>Custom tools</h3><p className="field-hint">Webhook tools send the agent’s arguments to your endpoint as a JSON POST.</p></div>
        <button className="btn p" onClick={() => setShowForm((visible) => !visible)}>{showForm ? 'Cancel' : 'Register Tool'}</button>
      </div>
      {showForm && <form onSubmit={register} className="tools-form">
        <div><label className="field-label">Tool name</label><input className="key-input" required pattern="[A-Za-z0-9_]+" title="Use letters, numbers, and underscores." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="get_layout" /></div>
        <div><label className="field-label">Type</label><input className="key-input" value="Webhook (HTTP endpoint)" disabled /></div>
        <div className="tools-form-full"><label className="field-label">Description</label><textarea className="key-input" rows={2} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe when the agent should call this tool." /></div>
        <div className="tools-form-full"><label className="field-label">Endpoint URL</label><input className="key-input" type="url" required value={form.endpoint_url} onChange={(e) => setForm({ ...form, endpoint_url: e.target.value })} placeholder="https://pdf-editor-backend.com/tool/get_layout" /></div>
        <div><label className="field-label">Authorization token (optional)</label><input className="key-input" type="password" autoComplete="new-password" value={form.auth_token} onChange={(e) => setForm({ ...form, auth_token: e.target.value })} placeholder="Bearer token" /><span className="field-hint">Sent in the Authorization header to the endpoint.</span></div>
        <div><label className="field-label">Timeout (milliseconds)</label><input className="key-input" type="number" min="1" max="120000" value={form.timeout_ms} onChange={(e) => setForm({ ...form, timeout_ms: e.target.value })} /></div>
        <div className="tools-form-full"><label className="field-label">Input schema (JSON Schema)</label><textarea className="key-input" rows={8} value={form.input_schema} onChange={(e) => setForm({ ...form, input_schema: e.target.value })} spellCheck="false" /><span className="field-hint">Define properties and required fields here. These fields tell the agent which arguments it can send.</span></div>
        <div className="tools-form-full"><button className="btn p" type="submit" disabled={saving}>{saving ? 'Registering…' : 'Save Tool'}</button></div>
      </form>}
      {loading ? <p>Loading tools…</p> : tools.length === 0 ? <p>No custom tools registered yet.</p> : <div className="tools-list">{tools.map((tool) => <div className="tools-list-item" key={tool.id}><div><strong>{tool.name}</strong><div className="tools-kind">{tool.kind}</div></div><div>{tool.description}</div><div>{tool.endpoint_url || 'Client executed'}</div><button className="btn danger" onClick={() => remove(tool)}>Delete</button></div>)}</div>}
    </section>
  </div>;
}

function KnowledgeTab() {
  const [kbs, setKbs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [isCreating, setIsCreating] = useState(false);
  const [editingKb, setEditingKb] = useState(null);
  const [notice, setNotice] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    provider_id: '',
    embedding_model: '',
    use_custom_vector_db: true,
    vector_api_key: '',
    vector_index_host: '',
    rerank_model: 'bge-reranker-v2-m3',
  });
  const selectedProvider = providers.find((p) => p.id === formData.provider_id);
  const providerModelsQuery = useProviderModels(selectedProvider?.provider_id, {
    enabled: isCreating && Boolean(selectedProvider),
  });
  const embeddingModels = Array.from(new Set([
    ...(providerModelsQuery.data || []).filter((model) => /embed|bge|voyage/i.test(model)),
    formData.embedding_model,
  ].filter(Boolean)));
  const modelsLoading = providerModelsQuery.isLoading || providerModelsQuery.isFetching;

  async function load() {
    if (!getToken()) {
      setStatus('anon');
      return;
    }
    setStatus('loading');
    try {
      const [kbsData, providersData] = await Promise.all([
        listKnowledgeBases(),
        listConfiguredProviders(),
      ]);
      setKbs(kbsData);
      setProviders(providersData);
      setStatus('ready');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  useEffect(() => {
    load();
  }, []);

  function flash(message, kind = 'success') {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 4000);
  }

  function openKnowledgeBaseForm(kb = null) {
    setEditingKb(kb);
    setFormData({
      name: kb?.name || '',
      provider_id: kb?.provider_id || '',
      embedding_model: kb?.embedding_model || '',
      use_custom_vector_db: kb ? Boolean(kb.has_custom_vector_db) : true,
      vector_api_key: '',
      vector_index_host: '',
      rerank_model: kb?.rerank_model || 'bge-reranker-v2-m3',
    });
    setIsCreating(true);
  }

  function handleProviderSelect(providerId) {
    setFormData((prev) => ({ ...prev, provider_id: providerId, embedding_model: '' }));
  }

  useEffect(() => {
    if (!formData.embedding_model && embeddingModels.length) {
      setFormData((prev) => prev.embedding_model ? prev : { ...prev, embedding_model: embeddingModels[0] });
    }
  }, [providerModelsQuery.data, formData.embedding_model]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.provider_id || !formData.embedding_model) {
      flash('Please select an embedding provider and model.', 'error');
      return;
    }
    if (formData.use_custom_vector_db && !editingKb) {
      if (!formData.vector_api_key.trim() || !formData.vector_index_host.trim()) {
        flash('Please provide both Pinecone API key and Index Host, or uncheck custom vector DB.', 'error');
        return;
      }
    }
    if (formData.use_custom_vector_db && (formData.vector_api_key.trim() || formData.vector_index_host.trim()) &&
        (!formData.vector_api_key.trim() || !formData.vector_index_host.trim())) {
      flash('To rotate Pinecone credentials, provide both the API key and Index Host.', 'error');
      return;
    }
    try {
      const payload = {
        name: formData.name || 'New Knowledge Base',
        provider_id: formData.provider_id,
        embedding_model: formData.embedding_model,
        rerank_model: formData.rerank_model || 'bge-reranker-v2-m3',
      };
      if (editingKb) {
        if (!formData.use_custom_vector_db) payload.clear_custom_vector_db = true;
        else if (formData.vector_api_key.trim() && formData.vector_index_host.trim()) {
          payload.vector_api_key = formData.vector_api_key.trim();
          payload.vector_index_host = formData.vector_index_host.trim();
        }
        await updateKnowledgeBase(editingKb.id, payload);
      } else {
        payload.vector_api_key = formData.use_custom_vector_db ? formData.vector_api_key.trim() : null;
        payload.vector_index_host = formData.use_custom_vector_db ? formData.vector_index_host.trim() : null;
        await createKnowledgeBase(payload);
      }
      setIsCreating(false);
      setEditingKb(null);
      setFormData({
        name: '',
        provider_id: '',
        embedding_model: '',
        use_custom_vector_db: true,
        vector_api_key: '',
        vector_index_host: '',
        rerank_model: 'bge-reranker-v2-m3',
      });
      flash(editingKb ? 'Knowledge Base updated successfully!' : 'Knowledge Base created successfully!');
      load();
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this knowledge base?')) return;
    try {
      await deleteKnowledgeBase(id);
      flash('Knowledge base deleted.');
      load();
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  if (status === 'loading') return <div>Loading knowledge bases...</div>;
  if (status === 'error') return <div>Error loading knowledge bases.</div>;

  if (isCreating) {
    return (
      <div className="agent-create-form">
        <h3>{editingKb ? 'Edit Knowledge Base' : 'Create New Knowledge Base'}</h3>
        {notice && <div className={`tab-notice ${notice.kind}`}>{notice.message}</div>}
        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Knowledge Base Name</label>
            <input
              className="key-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Product Documentation"
              required
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Embedding Provider</label>
            <select
              className="default-select"
              value={formData.provider_id}
              onChange={(e) => handleProviderSelect(e.target.value)}
              required
            >
              <option value="">Select a configured provider...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.provider_id}
                </option>
              ))}
            </select>
          </div>

          {selectedProvider && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="field-label">Embedding Model</label>
                <button
                  type="button"
                  className="btn g small"
                  onClick={() => providerModelsQuery.refetch()}
                  disabled={modelsLoading}
                >
                  {modelsLoading ? 'Loading…' : 'Refresh list'}
                </button>
              </div>
              {modelsLoading && <div className="models-status">Loading provider models…</div>}
              {embeddingModels.length > 0 ? (
                <select
                  className="default-select"
                  value={formData.embedding_model}
                  onChange={(e) => setFormData({ ...formData, embedding_model: e.target.value })}
                  required
                >
                  <option value="">Select embedding model...</option>
                  {embeddingModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="key-input"
                  value={formData.embedding_model}
                  onChange={(e) => setFormData({ ...formData, embedding_model: e.target.value })}
                  placeholder="No embedding models returned; enter a model ID"
                  required
                />
              )}
              {providerModelsQuery.error && (
                <div className="field-hint">Could not load model list ({providerModelsQuery.error.message}); enter an embedding model ID.</div>
              )}
            </div>
          )}

          <div style={{ marginBottom: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <label style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.use_custom_vector_db}
                  onChange={(e) => setFormData({ ...formData, use_custom_vector_db: e.target.checked })}
                />
              Bring Your Own Vector DB (Pinecone)
              </label>
              <span className="provider-badge ok">BYOD Secured</span>
            </div>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Vectors will reside inside your Pinecone account. Credentials are encrypted at rest.
              {editingKb && formData.use_custom_vector_db && ' Leave both credential fields blank to keep the current credentials.'}
            </p>

            {formData.use_custom_vector_db && (
              <>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="field-label">Pinecone API Key</label>
                  <input
                    type="password"
                    className="key-input"
                    placeholder={editingKb ? 'Leave blank to keep current key' : 'pcsk_...'}
                    value={formData.vector_api_key}
                    onChange={(e) => setFormData({ ...formData, vector_api_key: e.target.value })}
                    required={formData.use_custom_vector_db && !editingKb}
                  />
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="field-label">Pinecone Index Host URL</label>
                  <input
                    type="text"
                    className="key-input"
                    placeholder={editingKb ? (editingKb.vector_index_host || 'Leave blank to keep current host') : 'https://your-index-name-xxx.svc.pinecone.io'}
                    value={formData.vector_index_host}
                    onChange={(e) => setFormData({ ...formData, vector_index_host: e.target.value })}
                    required={formData.use_custom_vector_db && !editingKb}
                  />
                </div>
              </>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Reranker Model</label>
            <input
              type="text"
              className="key-input"
              list="pinecone-reranker-models"
              value={formData.rerank_model}
              onChange={(e) => setFormData({ ...formData, rerank_model: e.target.value })}
              placeholder="bge-reranker-v2-m3"
            />
            <datalist id="pinecone-reranker-models">
              <option value="bge-reranker-v2-m3" />
              {formData.rerank_model && formData.rerank_model !== 'bge-reranker-v2-m3' && (
                <option value={formData.rerank_model} />
              )}
            </datalist>
            <span className="field-hint">Choose the built-in reranker or enter a custom Pinecone reranker model ID.</span>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn g" onClick={() => { setIsCreating(false); setEditingKb(null); }}>
              Cancel
            </button>
            <button type="submit" className="btn p">
              {editingKb ? 'Save Changes' : 'Create Knowledge Base'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      {notice && <div className={`tab-notice ${notice.kind}`}>{notice.message}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <p className="providers-intro">Configure your vector knowledge bases and custom Pinecone endpoints.</p>
        <button className="btn p" onClick={() => openKnowledgeBaseForm()}>
          + Create Knowledge Base
        </button>
      </div>

      {kbs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>No knowledge bases yet</h3>
          <p>Bring your own vector database and connect your documents to your agents.</p>
          <button className="btn p" onClick={() => openKnowledgeBaseForm()}>Create Knowledge Base</button>
        </div>
      ) : (
        <div className="provider-grid">
          {kbs.map((kb) => {
            const kbProv = providers.find((p) => p.id === kb.provider_id);
            const providerName = kbProv ? kbProv.provider_id : kb.provider_id;
            return (
              <div key={kb.id} className="provider-card configured" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span className="provider-logo" style={{ background: '#0ea5e9' }}>
                    KB
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="provider-name" style={{ fontWeight: 600 }}>{kb.name}</div>
                    <span className="provider-badge ok">Provider: {providerName}</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.85, width: '100%', display: 'flex', flexDirection: 'column', gap: '0.2rem', margin: '0.5rem 0' }}>
                  <div><strong>Embedding:</strong> {kb.embedding_model}</div>
                  <div><strong>Vector DB:</strong> {kb.has_custom_vector_db ? 'BYOD (Pinecone)' : 'Default Gateway DB'}</div>
                  {kb.vector_index_host && (
                    <div style={{ wordBreak: 'break-all' }}><strong>Host:</strong> {kb.vector_index_host}</div>
                  )}
                  {kb.rerank_model && <div><strong>Reranker:</strong> {kb.rerank_model}</div>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignSelf: 'flex-end' }}>
                <button
                  className="btn g small"
                  onClick={() => openKnowledgeBaseForm(kb)}
                >
                  Edit
                </button>
                <button
                  className="btn danger small"
                  onClick={() => handleDelete(kb.id)}
                >
                  Delete
                </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function ApiKeysTab() {
  const [apiKeys, setApiKeys] = useState([]);
  const [status, setStatus] = useState('loading');
  const [notice, setNotice] = useState(null);
  const [newKey, setNewKey] = useState(null);
  const [generating, setGenerating] = useState(false);

  async function load() {
    if (!getToken()) {
      setStatus('anon');
      return;
    }
    setStatus('loading');
    try {
      const data = await listApiKeys();
      setApiKeys(data.keys || []);
      setStatus('ready');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  useEffect(() => {
    load();
  }, []);

  function flash(message, kind = 'success') {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 4000);
  }

  async function handleGenerateKey() {
    setGenerating(true);
    setNewKey(null);
    try {
      const data = await createApiKey();
      setNewKey({
        key: data.api_key,
        prefix: data.prefix,
      });
      
      // Store the API key in sessionStorage so authenticated requests work
      const stored = window.sessionStorage.getItem('agentgateway_user');
      if (stored) {
        const userData = JSON.parse(stored);
        userData.api_key = data.api_key;
        window.sessionStorage.setItem('agentgateway_user', JSON.stringify(userData));
      }
      
      flash('API key generated successfully!');
      load(); // Reload the key list
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      flash('API key copied to clipboard!');
    }).catch(() => {
      flash('Failed to copy to clipboard', 'error');
    });
  }

  if (status === 'anon') {
    return (
      <div className="empty-state">
        <div className="empty-icon">🔑</div>
        <h3>Log in to manage API keys</h3>
        <p>API keys are used to authenticate your requests to the gateway.</p>
        <a className="btn p" href="#/login">Log in</a>
      </div>
    );
  }

  if (status === 'loading') {
    return <div className="providers-status">Loading API keys…</div>;
  }

  if (status === 'error') {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <h3>Could not load API keys</h3>
        <button className="btn p" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <>
      {notice && (
        <div className={`tab-notice ${notice.kind}`} role="status">
          {notice.kind === 'success' ? '✓' : '⚠'} {notice.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <p className="providers-intro">
          Generate and manage API keys for authenticating with the AI Agent Gateway.
        </p>
        <button 
          className="btn p" 
          onClick={handleGenerateKey}
          disabled={generating}
        >
          {generating ? 'Generating...' : '+ Generate New API Key'}
        </button>
      </div>

      {newKey && (
        <div style={{
          padding: '1.5rem',
          borderRadius: '8px',
          backgroundColor: 'rgba(100, 103, 242, 0.1)',
          border: '2px solid rgba(100, 103, 242, 0.3)',
          marginBottom: '2rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🎉</span>
            <strong style={{ fontSize: '1.1rem', color: '#6467f2' }}>New API Key Generated!</strong>
          </div>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem', opacity: 0.9 }}>
            <strong>Important:</strong> This key will only be shown once. Copy it now and store it securely.
          </p>
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem', 
            alignItems: 'center',
            padding: '0.75rem',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '0.95rem',
            wordBreak: 'break-all',
          }}>
            <code style={{ flex: 1 }}>{newKey.key}</code>
            <button 
              className="btn g small"
              onClick={() => copyToClipboard(newKey.key)}
              title="Copy to clipboard"
            >
              📋 Copy
            </button>
          </div>
        </div>
      )}

      {apiKeys.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔑</div>
          <h3>No API keys yet</h3>
          <p>Generate your first API key to start using the AI Agent Gateway.</p>
          <button 
            className="btn p" 
            onClick={handleGenerateKey}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Generate API Key'}
          </button>
        </div>
      ) : (
        <div>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem', opacity: 0.85 }}>
            Your API Keys ({apiKeys.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {apiKeys.map((key, index) => (
              <div 
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem 1.25rem',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <code style={{ 
                    fontFamily: 'monospace', 
                    fontSize: '0.95rem',
                    color: '#6467f2',
                  }}>
                    {key.prefix}••••••••••••••••••••••••
                  </code>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                    Created: {new Date(key.created_at).toLocaleDateString()} at {new Date(key.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span className="provider-badge ok">Active</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: '1.5rem',
            padding: '1rem',
            borderRadius: '6px',
            backgroundColor: 'rgba(255, 193, 7, 0.1)',
            border: '1px solid rgba(255, 193, 7, 0.3)',
            fontSize: '0.85rem',
            lineHeight: '1.5',
          }}>
            <strong>💡 Note:</strong> Only the 10 most recent API keys are retained per user. Older keys are automatically deleted.
          </div>
        </div>
      )}
    </>
  );
}

export default function Dashboard({ loggedIn, user, onLogout }) {
  // Check URL for tab parameter
  const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
  const initialTab = urlParams.get('tab') || 'agents';
  
  const [activeTab, setActiveTab] = useState(initialTab);

  // In a real app, these would be fetched from the backend using the API key
  const [stats, setStats] = useState({
    agentsCount: 0,
    providersCount: 0,
    toolsCount: 0,
    runsCount: 0
  });

  return (
    <div className="dashboard-page">
      <div className="dashboard-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="logo-small">
              <i />
              Agent Gateway
            </div>
            {loggedIn && user && (
              <div className="user-greeting">
                Hello, {user.name || user.email || 'User'}
              </div>
            )}
          </div>

          <nav className="sidebar-nav">
            <button
              className={`nav-item ${activeTab === 'agents' ? 'active' : ''}`}
              onClick={() => setActiveTab('agents')}
            >
              Agents
            </button>
            <button
              className={`nav-item ${activeTab === 'integration' ? 'active' : ''}`}
              onClick={() => setActiveTab('integration')}
            >
              Integration Guide
            </button>
            <button
              className={`nav-item ${activeTab === 'workflows' ? 'active' : ''}`}
              onClick={() => setActiveTab('workflows')}
            >
              Workflows
            </button>
            <button
              className={`nav-item ${activeTab === 'runs' ? 'active' : ''}`}
              onClick={() => setActiveTab('runs')}
            >
              Runs
            </button>
            <button
              className={`nav-item ${activeTab === 'providers' ? 'active' : ''}`}
              onClick={() => setActiveTab('providers')}
            >
              Providers
            </button>
            <button
              className={`nav-item ${activeTab === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveTab('tools')}
            >
              Tools
            </button>
            <button
              className={`nav-item ${activeTab === 'knowledge' ? 'active' : ''}`}
              onClick={() => setActiveTab('knowledge')}
            >
              Knowledge Bases
            </button>
            <button
              className={`nav-item ${activeTab === 'api-keys' ? 'active' : ''}`}
              onClick={() => setActiveTab('api-keys')}
            >
              API Keys
            </button>
          </nav>

          <div className="sidebar-footer">
            <button className="nav-item logout" onClick={onLogout}>
              Log out
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          <header className="main-header">
            <h2>{activeTab === 'knowledge' ? 'Knowledge Bases' : activeTab === 'api-keys' ? 'API Keys' : activeTab === 'integration' ? 'Integration Guide' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
          </header>

          <div className="content-area">
            {activeTab === 'providers' ? (
              <ProvidersTab />
            ) : activeTab === 'agents' ? (
              <AgentsTab />
            ) : activeTab === 'integration' ? (
              <IntegrationTab />
            ) : activeTab === 'workflows' ? (
              <WorkflowsTab />
            ) : activeTab === 'runs' ? (
              <RunsTab />
            ) : activeTab === 'knowledge' ? (
              <KnowledgeTab />
            ) : activeTab === 'api-keys' ? (
              <ApiKeysTab />
            ) : activeTab === 'tools' ? (
              <ToolsTab />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🛠️</div>
                <h3>No tools yet</h3>
                <p>Register custom webhooks or client tools.</p>
                <button className="btn p">Register Tool</button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
