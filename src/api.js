const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const USER_KEY = 'agentgateway_user';

async function request(path, { method = 'GET', body, auth = false, headers: extraHeaders = {} } = {}) {
  const headers = {};
  Object.assign(headers, extraHeaders);
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
        : data.detail && typeof data.detail === 'object'
        ? [data.detail.message, ...(data.detail.errors || [])].filter(Boolean).join(': ')
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

export function generateConfigurationDraft(payload) {
  return request('/v1/workflows/generate-draft', { method: 'POST', auth: true, body: payload });
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

export async function streamRun(runId, onEvent, lastEventId) {
  let cursor = lastEventId;
  let reconnects = 0;
  while (reconnects <= 8) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cursor) headers['Last-Event-ID'] = cursor;

    let response;
    try {
      response = await fetch(`${API_BASE}/v1/runs/${encodeURIComponent(runId)}/stream`, { headers });
    } catch (error) {
      if (reconnects >= 8) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(250 * (2 ** reconnects), 3000)));
      reconnects += 1;
      continue;
    }
    if (!response.ok) {
      let detail = `Request failed (${response.status})`;
      try {
        const data = await response.json();
        if (typeof data.detail === 'string') detail = data.detail;
      } catch { /* Keep the status-based message. */ }
      throw new Error(detail);
    }
    if (!response.body) throw new Error('This browser does not support streaming run updates.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let event = { type: 'message', data: '' };
    let terminal = false;
    const dispatch = () => {
      if (event.data) {
        let data;
        try { data = JSON.parse(event.data); } catch { data = event.data; }
        if (event.id) cursor = event.id;
        onEvent({ type: event.type, data, id: event.id });
        if (event.type === 'run_completed' || event.type === 'run_failed') terminal = true;
      }
      event = { type: 'message', data: '' };
    };
    const consume = (line) => {
      if (!line) { dispatch(); return; }
      if (line.startsWith(':')) return;
      const separator = line.indexOf(':');
      const field = separator < 0 ? line : line.slice(0, separator);
      const valueText = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
      if (field === 'event') event.type = valueText;
      else if (field === 'data') event.data += `${event.data ? '\n' : ''}${valueText}`;
      else if (field === 'id') event.id = valueText;
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(consume);
        if (done) break;
      }
      if (buffer) buffer.split(/\r?\n/).forEach(consume);
      dispatch();
    } catch (error) {
      if (reconnects >= 8) throw error;
    }
    if (terminal) return;
    if (reconnects >= 8) throw new Error('Run event stream disconnected before completion.');
    await new Promise((resolve) => window.setTimeout(resolve, Math.min(250 * (2 ** reconnects), 3000)));
    reconnects += 1;
  }
}

export function runAgent(agentId, input, endUserId, sessionId) {
  const headers = {};
  if (endUserId) headers['X-End-User-ID'] = endUserId;
  if (sessionId) headers['X-Session-ID'] = sessionId;
  return request(`/v1/agents/${encodeURIComponent(agentId)}/run`, {
    method: 'POST', auth: true, headers, body: { input },
  });
}

export function listCustomTools() {
  return request('/v1/tools/', { auth: true });
}

export function createCustomTool(payload) {
  const query = new URLSearchParams({
    name: payload.name,
    description: payload.description,
    kind: payload.kind,
    endpoint_url: payload.endpoint_url,
    timeout_ms: String(payload.timeout_ms),
  });
  return request(`/v1/tools/register?${query.toString()}`, {
    method: 'POST', auth: true, body: { input_schema: payload.input_schema || {}, auth_token: payload.auth_token || null },
  });
}

export function updateCustomTool(toolId, payload) {
  const query = new URLSearchParams({
    name: payload.name,
    description: payload.description,
    endpoint_url: payload.endpoint_url,
    timeout_ms: String(payload.timeout_ms),
  });
  return request(`/v1/tools/${encodeURIComponent(toolId)}?${query.toString()}`, {
    method: 'PUT', auth: true, body: { input_schema: payload.input_schema || {}, auth_token: payload.auth_token || null },
  });
}

export function testCustomTool(payload) {
  return request('/v1/tools/test', {
    method: 'POST', auth: true, body: payload,
  });
}

export function deleteCustomTool(toolId) {
  return request(`/v1/tools/${encodeURIComponent(toolId)}`, { method: 'DELETE', auth: true });
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
