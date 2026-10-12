const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const USER_KEY = 'agentgateway_user';

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (err) {
    data = {};
  }
  if (!res.ok) {
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
        ? data.detail.map((d) => d.msg || JSON.stringify(d)).join(', ')
        : `Request failed (${res.status})`;
    const error = new Error(detail);
    error.status = res.status;
    throw error;
  }
  return data;
}

function postJSON(path, body) {
  return request(path, { method: 'POST', body });
}

export function getToken() {
  try {
    const stored = window.sessionStorage.getItem(USER_KEY);
    if (stored) return JSON.parse(stored).api_key || null;
  } catch (err) {
    /* ignore */
  }
  return null;
}

export function register({ name, username, email, organization, password }) {
  return postJSON('/auth/register', { name, username, email, organization, password });
}

export function login(email, password) {
  return postJSON('/auth/login', { email, password });
}

export function createApiKey() {
  return request('/auth/create-api-key', { method: 'POST', auth: true });
}

export function listApiKeys() {
  return request('/auth/api-keys', { auth: true });
}

/* ---- Providers ---- */

export function listProviderCatalog() {
  return request('/v1/providers/');
}

export function listConfiguredProviders() {
  return request('/v1/providers/configured', { auth: true });
}

export function addProvider({ provider_id, api_key, enabled_models, default_model }) {
  return request('/v1/providers/', {
    method: 'POST',
    auth: true,
    body: { provider_id, api_key, enabled_models, default_model },
  });
}

export function updateProvider(provider_id, payload) {
  return request(`/v1/providers/${provider_id}`, {
    method: 'PUT',
    auth: true,
    body: payload,
  });
}

export function deleteProvider(provider_id) {
  return request(`/v1/providers/${provider_id}`, { method: 'DELETE', auth: true });
}

export function fetchProviderModels(provider_id) {
  return request(`/v1/providers/${provider_id}/models`, { auth: true });
}

/* ---- Agents ---- */

export function listAgents() {
  return request('/v1/agents/', { auth: true });
}

export function createAgent(payload) {
  return request('/v1/agents/', {
    method: 'POST',
    auth: true,
    body: payload,
  });
}

export function updateAgent(agent_id, payload) {
  return request(`/v1/agents/${agent_id}`, {
    method: 'PUT',
    auth: true,
    body: payload,
  });
}

export function deleteAgent(agent_id) {
  return request(`/v1/agents/${agent_id}`, { method: 'DELETE', auth: true });
}

/* ---- Workflows ---- */
export function listWorkflowPresets() {
  return request('/v1/workflows/presets');
}

export function listWorkflows() {
  return request('/v1/workflows/', { auth: true });
}

export function createWorkflow(payload) {
  return request('/v1/workflows/', { method: 'POST', auth: true, body: payload });
}

export function createWorkflowFromPreset(presetId) {
  return request(`/v1/workflows/from-preset/${encodeURIComponent(presetId)}`, { method: 'POST', auth: true });
}

export function updateWorkflow(workflowId, payload) {
  return request(`/v1/workflows/${workflowId}`, { method: 'PUT', auth: true, body: payload });
}

export function deleteWorkflow(workflowId) {
  return request(`/v1/workflows/${workflowId}`, { method: 'DELETE', auth: true });
}

export function listRuns(limit = 50) {
  return request(`/v1/runs?limit=${limit}`, { auth: true });
}

export function getRun(runId) {
  return request(`/v1/runs/${runId}`, { auth: true });
}

export function listCustomTools() {
  return request('/v1/tools/', { auth: true });
}

export function listBuiltinTools() {
  return request('/v1/builtin-tools');
}

/* ---- Knowledge Bases ---- */

export function listKnowledgeBases() {
  return request('/v1/knowledge-bases/', { auth: true });
}

export function createKnowledgeBase(payload) {
  return request('/v1/knowledge-bases/', {
    method: 'POST',
    auth: true,
    body: payload,
  });
}

export function updateKnowledgeBase(kb_id, payload) {
  return request(`/v1/knowledge-bases/${kb_id}`, {
    method: 'PUT',
    auth: true,
    body: payload,
  });
}

export function deleteKnowledgeBase(kb_id) {
  return request(`/v1/knowledge-bases/${kb_id}`, { method: 'DELETE', auth: true });
}
