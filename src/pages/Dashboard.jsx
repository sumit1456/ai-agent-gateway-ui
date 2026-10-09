import { useEffect, useState } from 'react';
import {
  addProvider,
  deleteProvider,
  fetchProviderModels,
  getToken,
  listConfiguredProviders,
  listProviderCatalog,
  updateProvider,
  listAgents,
  createAgent,
  deleteAgent,
  listKnowledgeBases,
  createKnowledgeBase,
  deleteKnowledgeBase,
  createApiKey,
  listApiKeys,
} from '../api';
import './Dashboard.css';

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

  const [models, setModels] = useState(null); // null = not loaded yet
  const [modelsError, setModelsError] = useState(null);
  const [modelsLoading, setModelsLoading] = useState(false);
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

  async function loadModels() {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const data = await fetchProviderModels(provider.provider_id);
      setModels(data.models || []);
    } catch (err) {
      setModelsError(err.message);
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }

  useEffect(() => {
    if (step === 'models' && models === null && isConfigured) loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
      loadModels();
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
                onClick={loadModels}
                disabled={modelsLoading}
              >
                {modelsLoading ? 'Loading…' : 'Refresh list'}
              </button>
            </div>

            {modelsError && (
              <div className="modal-error">
                Couldn’t fetch the model list ({modelsError}). You can still add model IDs
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
  const [providers, setProviders] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [status, setStatus] = useState('loading');
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState(null);

  const [providerModels, setProviderModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    provider_id: '',
    planner: '',
    executor: '',
    reviewer: '',
    knowledge_base_ids: [],
    system_prompt: 'You are a helpful assistant.',
    // Custom prompts (optional)
    router_prompt: '',
    planner_prompt: '',
    executor_prompt: '',
    reviewer_prompt: '',
    direct_prompt: '',
    finalizer_prompt: '',
  });
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [defaultPrompts, setDefaultPrompts] = useState(null);

  async function load() {
    if (!getToken()) {
      setStatus('anon');
      return;
    }
    setStatus('loading');
    try {
      const [agentsData, providersData, kbData] = await Promise.all([
        listAgents(),
        listConfiguredProviders(),
        listKnowledgeBases(),
      ]);
      setAgents(agentsData);
      setProviders(providersData);
      setKnowledgeBases(kbData || []);
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

  async function loadProviderModels(provider) {
    if (!provider) {
      setProviderModels([]);
      return;
    }
    setModelsLoading(true);
    setModelsError(null);

    const seedModels = provider.enabled_models && provider.enabled_models.length > 0
      ? [...provider.enabled_models]
      : [];
    setProviderModels(seedModels);

    try {
      const data = await fetchProviderModels(provider.provider_id);
      const fetched = data.models || [];
      const combined = Array.from(new Set([...seedModels, ...fetched]));
      setProviderModels(combined);

      const defaultMod = provider.default_model || combined[0] || '';
      setFormData((prev) => ({
        ...prev,
        planner: prev.planner || defaultMod,
        executor: prev.executor || defaultMod,
        reviewer: prev.reviewer || defaultMod,
      }));
    } catch (err) {
      setModelsError(err.message);
      if (seedModels.length > 0) {
        const defaultMod = provider.default_model || seedModels[0] || '';
        setFormData((prev) => ({
          ...prev,
          planner: prev.planner || defaultMod,
          executor: prev.executor || defaultMod,
          reviewer: prev.reviewer || defaultMod,
        }));
      }
    } finally {
      setModelsLoading(false);
    }
  }

  function handleProviderSelect(providerId) {
    const prov = providers.find((p) => p.id === providerId);
    setFormData((prev) => ({
      ...prev,
      provider_id: providerId,
      planner: '',
      executor: '',
      reviewer: '',
    }));
    if (prov) {
      loadProviderModels(prov);
    } else {
      setProviderModels([]);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.provider_id) {
      flash('Please select a provider.', 'error');
      return;
    }
    if (!formData.planner || !formData.executor || !formData.reviewer) {
      flash('Please select models for planner, executor, and reviewer.', 'error');
      return;
    }
    try {
      await createAgent({
        name: formData.name || 'New Agent',
        provider_id: formData.provider_id,
        models: {
          planner: formData.planner,
          executor: formData.executor,
          reviewer: formData.reviewer,
        },
        knowledge_base_ids: formData.knowledge_base_ids,
        system_prompt: formData.system_prompt,
        // Include custom prompts if provided
        ...(formData.router_prompt && { router_prompt: formData.router_prompt }),
        ...(formData.planner_prompt && { planner_prompt: formData.planner_prompt }),
        ...(formData.executor_prompt && { executor_prompt: formData.executor_prompt }),
        ...(formData.reviewer_prompt && { reviewer_prompt: formData.reviewer_prompt }),
        ...(formData.direct_prompt && { direct_prompt: formData.direct_prompt }),
        ...(formData.finalizer_prompt && { finalizer_prompt: formData.finalizer_prompt }),
      });
      setIsCreating(false);
      setFormData({
        name: '',
        provider_id: '',
        planner: '',
        executor: '',
        reviewer: '',
        knowledge_base_ids: [],
        system_prompt: 'You are a helpful assistant.',
      });
      flash('Agent created successfully!');
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

  const selectedProvider = providers.find((p) => p.id === formData.provider_id);

  if (isCreating) {
    return (
      <div className="agent-create-form">
        <h3>Create New Agent</h3>
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
                  onClick={() => loadProviderModels(selectedProvider)}
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
          
          {/* Custom Prompts Section */}
          <div style={{ marginBottom: '1rem', border: '1px solid var(--border, #e5e7eb)', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <label className="field-label" style={{ margin: 0 }}>
                Custom Prompts <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 'normal' }}>(Optional - Advanced)</span>
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
                  Customize how your agent processes requests. Leave blank to use defaults. 
                  {defaultPrompts && (
                    <button
                      type="button"
                      style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.85rem',
                        color: '#6467f2',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                      onClick={() => {
                        // Load all defaults
                        setFormData(prev => ({
                          ...prev,
                          router_prompt: defaultPrompts.router?.prompt || '',
                          planner_prompt: defaultPrompts.planner?.prompt || '',
                          executor_prompt: defaultPrompts.executor?.prompt || '',
                          reviewer_prompt: defaultPrompts.reviewer?.prompt || '',
                          direct_prompt: defaultPrompts.direct?.prompt || '',
                          finalizer_prompt: defaultPrompts.finalizer?.prompt || '',
                        }));
                      }}
                    >
                      Load all defaults
                    </button>
                  )}
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
                        onClick={() => setFormData(prev => ({...prev, router_prompt: defaultPrompts.router.prompt}))}
                      >
                        Use default
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
                        onClick={() => setFormData(prev => ({...prev, planner_prompt: defaultPrompts.planner.prompt}))}
                      >
                        Use default
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
                        onClick={() => setFormData(prev => ({...prev, executor_prompt: defaultPrompts.executor.prompt}))}
                      >
                        Use default
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
                        onClick={() => setFormData(prev => ({...prev, reviewer_prompt: defaultPrompts.reviewer.prompt}))}
                      >
                        Use default
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
                        onClick={() => setFormData(prev => ({...prev, direct_prompt: defaultPrompts.direct.prompt}))}
                      >
                        Use default
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
                        onClick={() => setFormData(prev => ({...prev, finalizer_prompt: defaultPrompts.finalizer.prompt}))}
                      >
                        Use default
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
                  💡 <strong>Tip:</strong> Built-in tools (get_conversation_history, store_kv, kb_search, etc.) are always available. 
                  Mention them in your custom prompts to guide the agent's behavior.
                </div>
              </div>
            )}
          </div>
          
          <div className="modal-actions">
            <button type="button" className="btn g" onClick={() => setIsCreating(false)}>
              Cancel
            </button>
            <button type="submit" className="btn p">
              Create Agent
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
        <button className="btn p" onClick={() => setIsCreating(true)}>
          + Create Agent
        </button>
      </div>
      
      {agents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🤖</div>
          <h3>No agents yet</h3>
          <p>Get started by creating your first agent.</p>
          <button className="btn p" onClick={() => setIsCreating(true)}>Create Agent</button>
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
                <button 
                  className="btn danger small" 
                  style={{ marginTop: '0.5rem', alignSelf: 'flex-end' }}
                  onClick={() => handleDelete(agent.id)}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function KnowledgeTab() {
  const [kbs, setKbs] = useState([]);
  const [providers, setProviders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState(null);

  const [availableModels, setAvailableModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    provider_id: '',
    embedding_model: '',
    use_custom_vector_db: true,
    vector_api_key: '',
    vector_index_host: '',
    rerank_model: 'bge-reranker-v2-m3',
  });

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

  async function handleProviderSelect(providerId) {
    const prov = providers.find((p) => p.id === providerId);
    setFormData((prev) => ({ ...prev, provider_id: providerId, embedding_model: '' }));
    if (!prov) {
      setAvailableModels([]);
      return;
    }

    setModelsLoading(true);
    const presets = prov.provider_id === 'nvidia'
      ? ['nvidia/nv-embedqa-e5-v5', 'nvidia/llama-3.2-nv-embedqa-1b-v1']
      : ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'];

    try {
      const data = await fetchProviderModels(prov.provider_id);
      const fetched = (data.models || []).filter((m) =>
        m.toLowerCase().includes('embed') || m.toLowerCase().includes('bge') || m.toLowerCase().includes('nv-embed')
      );
      const combined = Array.from(new Set([...presets, ...fetched]));
      setAvailableModels(combined);
      setFormData((prev) => ({ ...prev, embedding_model: combined[0] || '' }));
    } catch (err) {
      setAvailableModels(presets);
      setFormData((prev) => ({ ...prev, embedding_model: presets[0] || '' }));
    } finally {
      setModelsLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.provider_id || !formData.embedding_model) {
      flash('Please select an embedding provider and model.', 'error');
      return;
    }
    if (formData.use_custom_vector_db) {
      if (!formData.vector_api_key.trim() || !formData.vector_index_host.trim()) {
        flash('Please provide both Pinecone API key and Index Host, or uncheck custom vector DB.', 'error');
        return;
      }
    }
    try {
      await createKnowledgeBase({
        name: formData.name || 'New Knowledge Base',
        provider_id: formData.provider_id,
        embedding_model: formData.embedding_model,
        vector_api_key: formData.use_custom_vector_db ? formData.vector_api_key.trim() : null,
        vector_index_host: formData.use_custom_vector_db ? formData.vector_index_host.trim() : null,
        rerank_model: formData.rerank_model || 'bge-reranker-v2-m3',
      });
      setIsCreating(false);
      setFormData({
        name: '',
        provider_id: '',
        embedding_model: '',
        use_custom_vector_db: true,
        vector_api_key: '',
        vector_index_host: '',
        rerank_model: 'bge-reranker-v2-m3',
      });
      flash('Knowledge Base created successfully!');
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

  const selectedProvider = providers.find((p) => p.id === formData.provider_id);

  if (isCreating) {
    return (
      <div className="agent-create-form">
        <h3>Create New Knowledge Base</h3>
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
              <label className="field-label">Embedding Model</label>
              <select
                className="default-select"
                value={formData.embedding_model}
                onChange={(e) => setFormData({ ...formData, embedding_model: e.target.value })}
                required
              >
                <option value="">Select embedding model...</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
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
            </p>

            {formData.use_custom_vector_db && (
              <>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="field-label">Pinecone API Key</label>
                  <input
                    type="password"
                    className="key-input"
                    placeholder="pcsk_..."
                    value={formData.vector_api_key}
                    onChange={(e) => setFormData({ ...formData, vector_api_key: e.target.value })}
                    required={formData.use_custom_vector_db}
                  />
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="field-label">Pinecone Index Host URL</label>
                  <input
                    type="text"
                    className="key-input"
                    placeholder="https://your-index-name-xxx.svc.pinecone.io"
                    value={formData.vector_index_host}
                    onChange={(e) => setFormData({ ...formData, vector_index_host: e.target.value })}
                    required={formData.use_custom_vector_db}
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
              value={formData.rerank_model}
              onChange={(e) => setFormData({ ...formData, rerank_model: e.target.value })}
              placeholder="bge-reranker-v2-m3"
            />
            <span className="field-hint">Re-scores vector matches for enhanced retrieval precision.</span>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn g" onClick={() => setIsCreating(false)}>
              Cancel
            </button>
            <button type="submit" className="btn p">
              Create Knowledge Base
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
        <button className="btn p" onClick={() => setIsCreating(true)}>
          + Create Knowledge Base
        </button>
      </div>

      {kbs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>No knowledge bases yet</h3>
          <p>Bring your own vector database and connect your documents to your agents.</p>
          <button className="btn p" onClick={() => setIsCreating(true)}>Create Knowledge Base</button>
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
                <button
                  className="btn danger small"
                  style={{ marginTop: '0.5rem', alignSelf: 'flex-end' }}
                  onClick={() => handleDelete(kb.id)}
                >
                  Delete
                </button>
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
            <h2>{activeTab === 'knowledge' ? 'Knowledge Bases' : activeTab === 'api-keys' ? 'API Keys' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
          </header>

          <div className="content-area">
            {activeTab === 'providers' ? (
              <ProvidersTab />
            ) : activeTab === 'agents' ? (
              <AgentsTab />
            ) : activeTab === 'knowledge' ? (
              <KnowledgeTab />
            ) : activeTab === 'api-keys' ? (
              <ApiKeysTab />
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
