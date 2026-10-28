import { useEffect, useState } from 'react';
import {
  getToken,
  getRun,
  runAgent,
  streamRun,
} from '../api';
import { useProviderModels } from '../hooks/useProviderModels';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAgents,
  useWorkflows,
  useWorkflowPresets,
  useProviders,
  useProviderCatalog,
  useRuns,
  useRun,
  useCustomTools,
  useBuiltinTools,
  useKnowledgeBases,
  useApiKeys,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useCreateWorkflowFromPreset,
  useGenerateWorkflowDraft,
  useAddProvider,
  useUpdateProvider,
  useDeleteProvider,
  useCreateCustomTool,
  useUpdateCustomTool,
  useDeleteCustomTool,
  useTestCustomTool,
  useCreateApiKey,
  useCreateKnowledgeBase,
  useUpdateKnowledgeBase,
  useDeleteKnowledgeBase,
} from '../hooks/useApi';
import { usePageState } from '../hooks/usePaginationState';
import './Dashboard.css';

const WORKFLOW_ROLES = ['planner', 'executor', 'reviewer', 'finalizer', 'direct', 'router', 'controller'];
const WORKFLOW_ROLE_LABELS = {
  planner: 'Planner', executor: 'Executor', reviewer: 'Reviewer', finalizer: 'Finalizer',
  direct: 'Direct', router: 'Router', controller: 'Controller',
};

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

const OUTPUT_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array'];

function InputMappingJsonField({ value, previousNodes = [], onChange }) {
  const previous = previousNodes.at(-1);
  const suggested = previous ? { input: `$.steps.${previous.id}.output` } : { input: '$.request' };
  return <div>
    <label className="field-label">Input JSON mapping</label>
    <span className="field-hint">Enter JSON whose keys are shown to the agent and whose values are source paths. Use <code>$.request</code> for the user message. {previous ? <>The previous step is <strong>{previous.name || previous.id}</strong>; use <code>$.steps.{previous.id}.output</code> for its complete output.</> : <>The first step usually receives the user message as <code>input</code>.</>}</span>
    <JsonObjectField label="Input mapping JSON" value={value} onChange={onChange} rows={6} />
    <span className="field-hint">Suggested mapping: <code>{JSON.stringify(suggested, null, 2)}</code></span>
  </div>;
}

function OutputContractField({ value, onChange }) {
  return <div>
    <label className="field-label">Output JSON format</label>
    <span className="field-hint">Write the JSON shape the model must return. Values are expected types. Use a type array for nullable fields, e.g. <code>{'{"rejection_reason":["string","null"]}'}</code>. This is a format, not an output value.</span>
    <JsonObjectField label="Output format JSON" value={value} onChange={onChange} rows={5} />
  </div>;
}

function ToolSchemaField({ value, onChange }) {
  let schema;
  let parseError = '';
  try {
    schema = JSON.parse(value || '{}');
    if (!schema || Array.isArray(schema) || typeof schema !== 'object') throw new Error();
  } catch {
    schema = { type: 'object', properties: {}, required: [] };
    parseError = 'The schema JSON is invalid. Repair it in Advanced JSON before adding fields.';
  }
  const properties = schema.properties || {};
  const required = schema.required || [];
  function save(nextProperties, nextRequired = required) {
    onChange(JSON.stringify({ ...schema, type: 'object', properties: nextProperties, required: nextRequired.filter((name) => name in nextProperties) }, null, 2));
  }
  return <div>
    <label className="field-label">Arguments the agent can send</label>
    <span className="field-hint">Add the argument names your endpoint expects. The model will choose values from its step input, and the test below checks that the sample matches.</span>
    {parseError && <div className="field-hint" style={{ color: '#b42318' }}>{parseError}</div>}
    {!parseError && <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.5rem' }}>
      {Object.entries(properties).map(([name, definition], index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 0.8fr) minmax(110px, 0.7fr) minmax(140px, 1fr) auto auto', gap: '0.35rem', alignItems: 'center' }}>
        <input className="key-input" aria-label="Argument name" value={name} onChange={(event) => {
          const nextName = event.target.value.trim();
          const next = { ...properties };
          delete next[name];
          if (nextName) next[nextName] = definition;
          save(next, required.map((item) => item === name ? nextName : item));
        }} />
        <select className="default-select" aria-label={`Type for ${name}`} value={definition?.type || 'string'} onChange={(event) => save({ ...properties, [name]: { ...definition, type: event.target.value } })}>
          {OUTPUT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <input className="key-input" aria-label={`Description for ${name}`} value={definition?.description || ''} placeholder="What this argument means" onChange={(event) => save({ ...properties, [name]: { ...definition, description: event.target.value } })} />
        <label className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}><input type="checkbox" checked={required.includes(name)} onChange={(event) => save(properties, event.target.checked ? [...required, name] : required.filter((item) => item !== name))} />Required</label>
        <button type="button" className="btn g small" onClick={() => { const next = { ...properties }; delete next[name]; save(next); }}>Remove</button>
      </div>)}
      <button type="button" className="btn g small" style={{ justifySelf: 'start' }} onClick={() => {
        let name = 'argument';
        let suffix = 2;
        while (Object.hasOwn(properties, name)) name = `argument_${suffix++}`;
        save({ ...properties, [name]: { type: 'string', description: '' } });
      }}>+ Add argument</button>
    </div>}
    <details style={{ marginTop: '0.5rem' }}><summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>Advanced: edit JSON Schema</summary>
      <textarea className="key-input" rows={7} value={value} onChange={(event) => onChange(event.target.value)} spellCheck="false" />
    </details>
  </div>;
}

function workflowNode(id, name, role) {
  return {
    id, name, role, type: 'agent', instructions: 'Read the JSON input for this step and complete the task described here. Treat values copied from an earlier step as context and continue from that result. Use only tools assigned to this step, with arguments matching their schemas. Return one JSON object matching the Output JSON format below. Do not include markdown or extra text.',
    input_mapping: { input: '$.request' }, output_schema: { response: 'string' }, tools: [], max_attempts: 1,
  };
}

function normalizeWorkflowAttempts(definition) {
  return {
    ...definition,
    nodes: (definition.nodes || []).map((node) => {
      const requested = Number(node.max_attempts);
      const maxAttempts = Number.isFinite(requested) ? Math.floor(requested) : 1;
      return { ...node, max_attempts: Math.min(3, Math.max(1, maxAttempts)) };
    }),
  };
}

function buildWorkflowLlmInstructions(availableTools) { return `Create a workflow definition for AI Agent Gateway. Return only one valid JSON object for the workflow definition (no Markdown fences or extra commentary), so I can paste it into the workflow JSON editor.

The gateway executes this definition itself; do not write Python/JavaScript code or invent an AgentState object. The runtime builds the state and passes each node only the fields specified by input_mapping. Use this exact schema:
{
  "schema_version": 1,
  "start_node": "first_node_id",
  "nodes": [
    {
      "id": "unique_snake_case_id",
      "type": "agent",
      "name": "Readable step name",
      "role": "executor",
      "instructions": "Specific task and expected behavior for this step",
      "input_mapping": { "request": "$.request" },
      "output_schema": { "response": "string" },
      "tools": [],
      "max_attempts": 1
    }
  ],
  "edges": [{ "from": "first_node_id", "to": "next_node_id" }],
  "limits": { "max_steps": 20, "max_retries_per_step": 1 }
}

Rules:
- Supported roles: router, planner, executor, reviewer, direct, finalizer, controller. Use type "agent" for every node.
- Every node needs a unique non-empty id, non-empty instructions, input_mapping and output_schema objects, a tools array, and max_attempts from 1 to 3. A node may set max_tokens (1–200000) only to override the agent's limits.max_tokens_per_node; omit it to inherit that agent default. Keep schema_version at 1 and max_steps between 1 and 100.
- input_mapping keys are the exact JSON input field names the node will receive; values must be supported paths: "$.request" (user request string), "$.variables" (variables object), "$.steps" (prior outputs), "$.steps.NODE_ID.output", "$.steps.NODE_ID.output.FIELD", or "$.steps.NODE_ID.status". The first node may map only "$.request" and/or "$.variables". Later nodes may map only original request/variables or outputs/status from nodes that can run before them. Map every field used in the instructions; unmapped values are not available automatically.
- output_schema is a required JSON output contract, not an example. Every listed key must be returned. Use exactly these datatypes: "string", "number", "integer", "boolean", "object", or "array". For a required value that may be absent, use a type array such as ["string","null"] or ["integer","null"]; the key itself is still required. Example: {"passed":"boolean","feedback":"string","rejection_reason":["string","null"]}. Define the exact nested keys and expected datatypes for every object and array item in that node's instructions, because runtime validation checks the declared top-level types. Return exactly one JSON object with all contract keys; no Markdown, code fences, preamble, prose outside the object, or omitted keys. Use actual JSON null for nullable values, never the string "null". Put explanatory prose inside string fields. Do not put input paths or example output values in output_schema.
- Follow the working Simple workflow pattern: planner output (for example {"steps":"array"}) is explicitly mapped to executor input via "$.steps.PLAN_NODE.output.steps", and the finalizer maps the executor output via "$.steps.EXECUTOR_NODE.output". Follow Reviewed for a review node that receives the plan and work and returns fields such as {"passed":"boolean","feedback":"string"}. Follow Dynamic for controller branching: include "next":"string", choose only from allowed_next, and make each edge's when.next match a returned value.
- Use only tool names from this available registered tool list: ${availableTools.length ? availableTools.join(', ') : '(none provided)'}. Put a tool name in a node's tools array only when that step needs it. Otherwise use []. Never invent tools. If a needed tool is missing, leave tools empty and do not add unsupported fields to the workflow; I can document the setup requirement separately.
- Edges must reference existing node ids. Every node must be reachable from start_node, and the graph must have at least one terminal node. For branching, add edges with "when" matching output fields, e.g. {"from":"route","to":"answer","when":{"next":"answer"}}. A controller's output must include the selected field (commonly {"next":"answer"}) and the outgoing conditions must agree with those values.
- If I request N retries after review, model the first review plus exactly N explicit revise-and-review stages, then finish with a final response whether the last review passes or fails. Do not depend only on max_steps or max_attempts to end a retry loop; the runtime does not automatically route to a final node when a limit is reached.
- Keep each node prompt self-contained: state the exact input field names it receives, what to do with each mapped input, and the exact output keys and datatypes it must return, including nested object properties and array-item fields. Use the exact earlier node ids and output keys in paths. If a field can be null, declare the nullable type in output_schema and instruct the node when to return actual JSON null. Set max_attempts from 1 to 3. Do not claim the workflow has been saved or tested.`; }

function findStepReferences(mapping) {
  return [...new Set(Object.values(mapping || {}).flatMap((path) =>
    typeof path === 'string' ? [...path.matchAll(/\$\.steps\.([^.]+)/g)].map((match) => match[1]) : [],
  ))];
}

function GeneratedTestRunRequest({ request }) {
  const [copied, setCopied] = useState('');
  if (!request) return null;
  const requestJson = JSON.stringify(request, null, 2);
  async function copy(text, kind) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('');
    }
  }
  return <section className="workflow-draft-notes" aria-live="polite">
    <strong>Sample run request generated for the first workflow node</strong>
    <span>The server checked this request against the workflow’s start node. Save the workflow and agent before running it. The full JSON can be sent to <code>POST /v1/agents/&lt;agent_id&gt;/run</code>.</span>
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      <button type="button" className="btn g small" onClick={() => copy(requestJson, 'request')}>{copied === 'request' ? 'Copied run request' : 'Copy run request JSON'}</button>
      {typeof request.input === 'string' && <button type="button" className="btn g small" onClick={() => copy(request.input, 'input')}>{copied === 'input' ? 'Copied input text' : 'Copy input text'}</button>}
    </div>
    <details style={{ marginTop: '0.5rem' }}>
      <summary style={{ cursor: 'pointer' }}>Preview generated test request</summary>
      <pre className="integration-code" style={{ maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{requestJson}</pre>
    </details>
  </section>;
}

function WorkflowsTab() {
  // Use React Query hooks for automatic caching and refetching
  const { data: presets = [], isLoading: presetsLoading } = useWorkflowPresets();
  const { data: workflows = [], isLoading: workflowsLoading } = useWorkflows();
  const { data: customTools = [] } = useCustomTools();
  const { data: builtinToolsData } = useBuiltinTools();
  const { data: providers = [] } = useProviders();
  
  const builtinTools = builtinToolsData?.builtin_tools || [];
  
  // Compute available tools from custom and builtin tools
  const availableTools = [
    ...builtinTools.filter((tool) => tool.always_available || tool.name === 'semantic_search').map((tool) => tool.name),
    ...customTools.map((tool) => tool.name),
  ];
  const workflowLlmInstructions = buildWorkflowLlmInstructions(availableTools);
  
  // Mutation hooks for write operations
  const createWorkflowMutation = useCreateWorkflow();
  const updateWorkflowMutation = useUpdateWorkflow();
  const deleteWorkflowMutation = useDeleteWorkflow();
  const createFromPresetMutation = useCreateWorkflowFromPreset();
  const generateDraftMutation = useGenerateWorkflowDraft();
  
  const [editing, setEditing] = useState(null);
  const [advanced, setAdvanced] = useState(false);
  const [jsonDraft, setJsonDraft] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderBrief, setBuilderBrief] = useState('');
  const [builderProviderId, setBuilderProviderId] = useState('');
  const [builderModel, setBuilderModel] = useState('');
  const [builderMeta, setBuilderMeta] = useState(null);
  const [workflowInstructionsCopied, setWorkflowInstructionsCopied] = useState(false);
  const [generationLog, setGenerationLog] = useState([]);
  const [notice, setNotice] = useState(null);
  
  const loading = presetsLoading || workflowsLoading;
  const saving = createWorkflowMutation.isPending || updateWorkflowMutation.isPending;
  const builderBusy = generateDraftMutation.isPending;
  
  const builderProvider = providers.find((provider) => provider.id === builderProviderId);
  const builderModels = Array.from(new Set([...(builderProvider?.enabled_models || []), builderProvider?.default_model].filter(Boolean)));

  useEffect(() => {
    if (!builderProvider) return;
    setBuilderModel((current) => builderModels.includes(current) ? current : builderProvider.default_model || builderModels[0] || '');
  }, [builderProviderId, builderProvider?.default_model]);

  async function generateWorkflow(kind = 'workflow') {
    if (!builderBrief.trim() || !builderProviderId || !builderModel) return;
    setNotice(null);
    const startedAt = new Date().toLocaleTimeString();
    setGenerationLog([
      { stage: 'Request submitted', status: 'complete', time: startedAt, message: `Sent workflow brief to ${builderProvider?.provider_id || 'selected provider'} using ${builderModel}.` },
      { stage: 'Provider and server validation', status: 'running', time: startedAt, message: 'Waiting for workflow JSON and sample run request; the server will parse them, validate the graph, and check the first-node inputs.' },
    ]);
    generateDraftMutation.mutate(
      { kind, brief: builderBrief.trim(), provider_id: builderProviderId, model: builderModel },
      {
        onSuccess: (draft) => {
          const definition = normalizeWorkflowAttempts(draft.workflow);
          const generated = { name: draft.workflow_name, description: draft.workflow_description, definition };
          setEditing(generated);
          setJsonDraft(JSON.stringify(definition, null, 2));
          setAdvanced(false);
          setBuilderMeta(draft);
          const completedAt = new Date().toLocaleTimeString();
          setGenerationLog([
            { stage: 'Request submitted', status: 'complete', time: startedAt, message: `Sent workflow brief to ${builderProvider?.provider_id || 'selected provider'} using ${builderModel}.` },
            { stage: 'Provider response', status: 'complete', time: completedAt, message: 'Received and parsed workflow definition plus test_run_request.' },
            { stage: 'Workflow validation', status: 'complete', time: completedAt, message: `Validated ${definition.nodes.length} nodes and ${definition.edges.length} transitions.` },
            { stage: 'First-node test input', status: 'complete', time: completedAt, message: `Validated sample run request for start node “${definition.start_node}”.` },
            { stage: 'Draft ready', status: 'complete', time: completedAt, message: 'Review the draft below. Nothing has been saved yet.' },
          ]);
          setNotice({ kind: 'success', message: 'Generated the workflow and sample run request. The server validated the workflow structure and first-node inputs.' });
        },
        onError: (err) => {
          const errorTime = new Date().toLocaleTimeString();
          const failedStage = err.stage || 'request';
          setGenerationLog((current) => [
            ...current.filter((entry) => entry.status !== 'running'),
            { stage: failedStage, status: 'error', time: errorTime, message: err.message, details: err.details },
          ]);
          setNotice({ kind: 'error', message: err.message });
        }
      }
    );
  }

  async function copyWorkflowLlmInstructions() {
    try {
      await navigator.clipboard.writeText(workflowLlmInstructions);
      setWorkflowInstructionsCopied(true);
      window.setTimeout(() => setWorkflowInstructionsCopied(false), 1800);
    } catch {
      setNotice({ kind: 'error', message: 'Could not copy instructions. Open the section below and copy its text manually.' });
    }
  }

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
    createFromPresetMutation.mutate(preset.id, {
      onSuccess: (workflow) => {
        const definition = normalizeWorkflowAttempts({
          ...workflow.definition,
          nodes: workflow.definition.nodes.map((node) => ({ ...node, tools: [] })),
        });
        const editableWorkflow = { ...workflow, definition };
        setEditing(editableWorkflow);
        setJsonDraft(JSON.stringify(definition, null, 2));
      },
      onError: (err) => {
        setNotice({ message: err.message, kind: 'error' });
      }
    });
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
    const edges = [...editing.definition.edges];
    const terminal = nodes.find((node) => !edges.some((edge) => edge.from === node.id));
    const newNode = {
      ...workflowNode(id, `Step ${nodes.length + 1}`, 'executor'),
      input_mapping: terminal
        ? { input: `$.steps.${terminal.id}.output` }
        : { input: '$.request' },
    };
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
  function saveWorkflow(event) {
    event.preventDefault();
    setNotice(null);
    
    try {
      let definition = editing.definition;
      if (advanced) definition = JSON.parse(jsonDraft);
      const payload = { name: editing.name, description: editing.description, definition };
      
      const mutation = editing.version_id ? updateWorkflowMutation : createWorkflowMutation;
      const mutationPayload = editing.version_id 
        ? { workflowId: editing.id, payload }
        : payload;
      
      mutation.mutate(mutationPayload, {
        onSuccess: (saved) => {
          setEditing(saved);
          setJsonDraft(JSON.stringify(saved.definition, null, 2));
          setBuilderMeta(null);
          setNotice({ message: 'Workflow saved as a new version.', kind: 'success' });
        },
        onError: (err) => {
          setNotice({ message: err.message, kind: 'error' });
        }
      });
    } catch (err) {
      // JSON parse error
      setNotice({ message: err.message, kind: 'error' });
    }
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
        <details style={{ margin: '0.75rem 0' }}>
          <summary style={{ cursor: 'pointer' }}>Instructions for another LLM</summary>
          <p className="field-hint">Copy this prompt into your own LLM, describe the workflow you want, then paste its JSON definition into <strong>Edit workflow JSON</strong>.</p>
          <button type="button" className="btn g small" onClick={copyWorkflowLlmInstructions}>{workflowInstructionsCopied ? 'Copied' : 'Copy instructions'}</button>
          <pre className="integration-code" style={{ maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: '0.5rem' }}>{workflowLlmInstructions}</pre>
        </details>
        {builderMeta && <div className="workflow-draft-notes"><strong>AI generated draft — review and edit before saving</strong><span>Generated with {builderModel} via {builderProvider?.provider_id}. No workflow or agent has been saved yet. Workflow schema and sample first-node inputs passed server validation.</span>{builderMeta.agent && <span>Suggested agent: <strong>{builderMeta.agent.name}</strong> — {builderMeta.agent.purpose}</span>}{[...(builderMeta.assumptions || []), ...(builderMeta.questions || []), ...(builderMeta.setup_notes || [])].length > 0 && <ul>{[...(builderMeta.assumptions || []).map((item) => `Assumption: ${item}`), ...(builderMeta.questions || []).map((item) => `Question: ${item}`), ...(builderMeta.setup_notes || []).map((item) => `Setup: ${item}`)].map((item, index) => <li key={index}>{item}</li>)}</ul>}</div>}
        {builderMeta && <GeneratedTestRunRequest request={builderMeta.test_run_request} />}
        <div style={{ display: 'grid', gap: '0.75rem', margin: '1rem 0' }}>
          {editing.definition.nodes.map((node, index) => {
            const previousNodes = editing.definition.nodes.slice(0, index);
            const previousIds = new Set(previousNodes.map((previous) => previous.id));
            const unavailableRefs = findStepReferences(node.input_mapping).filter((id) => !previousIds.has(id));
            return <section key={node.id} style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <strong>{index + 1}. {node.name || node.id}</strong>
              <code title="Use this exact ID when mapping this step's output">ID: {node.id}</code>
              {node.id === editing.definition.start_node && <span className="provider-badge ok">Start step</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div><label className="field-label">Step name</label><input className="key-input" value={node.name || ''} onChange={(e) => updateNode(index, { name: e.target.value })} /></div>
              <div><label className="field-label">Role behavior</label><select className="default-select" value={node.role} onChange={(e) => updateNode(index, { role: e.target.value })}>{WORKFLOW_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></div>
            </div>
            <div className="workflow-step-tools">
              <label className="field-label">Tools enabled for this step ({(node.tools || []).length} selected)</label>
              <span className="field-hint">No tools are selected by default. Select only the registered tools this step needs. A checked tool can be called by this step; a cleared tool cannot.</span>
              {availableTools.length ? <>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.45rem' }}><button type="button" className="btn g small" onClick={() => updateNode(index, { tools: [...new Set([...(node.tools || []), ...availableTools])] })}>Select all</button><button type="button" className="btn g small" onClick={() => updateNode(index, { tools: [] })}>Clear</button></div>
                <div className="workflow-tool-options">{availableTools.map((tool) => <label key={tool}><input type="checkbox" checked={(node.tools || []).includes(tool)} onChange={(event) => updateNode(index, { tools: event.target.checked ? [...new Set([...(node.tools || []), tool])] : (node.tools || []).filter((name) => name !== tool) })} />{tool}</label>)}</div>
              </> : <p className="field-hint">No registered tools are available. Register and test tools in the Tools section first.</p>}
            </div>
            <label className="field-label" style={{ marginTop: '0.75rem' }}>Instructions for this step</label>
            <textarea className="key-input" rows={3} value={node.instructions || ''} onChange={(e) => updateNode(index, { instructions: e.target.value })} placeholder={'Task: describe what this step must do.\nExplain which input fields to use and how to use the result from the previous step.\nReturn only the JSON fields defined below.'} />
            <span className="field-hint">Write the task in everyday language: what to do, which input to use, and what result to produce. The JSON input and output format are provided separately. Tool argument schemas are provided automatically for selected tools.</span>
            {node.role === 'finalizer' && <div style={{ marginTop: '0.5rem' }}>
              <label className="field-label">Return mapped input directly (optional)</label>
              <input className="key-input" value={node.return_input || ''} onChange={(e) => updateNode(index, { return_input: e.target.value.trim() || undefined })} placeholder="work" />
              <span className="field-hint">Enter an input-mapping key, such as work, to skip the finalizer model call when that value is already final.</span>
            </div>}
            <label className="field-label" style={{ marginTop: '0.5rem' }}>Maximum attempts (1–3)</label><input className="key-input" type="number" min="1" max="3" value={Math.min(3, Math.max(1, Number(node.max_attempts) || 1))} onChange={(e) => updateNode(index, { max_attempts: Math.min(3, Math.max(1, Number(e.target.value) || 1)) })} />
            <label className="field-label" style={{ marginTop: '0.5rem' }}>Completion token cap (optional override)</label>
            <input className="key-input" type="number" min="1" max="200000" value={node.max_tokens ?? ''} placeholder="Use agent default" onChange={(e) => updateNode(index, { max_tokens: e.target.value ? Number(e.target.value) : undefined })} />
            <span className="field-hint">Leave blank to use this Agent’s default per-node cap.</span>
            <details style={{ marginTop: '0.5rem' }}><summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Step inputs and outputs</summary>
              <InputMappingJsonField value={node.input_mapping} previousNodes={previousNodes} onChange={(input_mapping) => updateNode(index, { input_mapping })} />
              <span className="field-hint" style={{ marginTop: '0.35rem' }}>A tool name is not a workflow step ID. Step IDs are shown above each step.</span>
              {previousNodes.length > 0 && unavailableRefs.length > 0 && <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0.4rem 0' }}>
                {unavailableRefs.length > 0 && <button type="button" className="btn g small" onClick={() => {
                  const previousId = previousNodes.at(-1).id;
                  const input_mapping = Object.fromEntries(Object.entries(node.input_mapping || {}).map(([key, path]) => [
                    key,
                    typeof path === 'string' && unavailableRefs.some((badId) => path.includes(`$.steps.${badId}.`))
                      ? path.replace(/\$\.steps\.[^.]+\./, `$.steps.${previousId}.`)
                      : path,
                  ]));
                  updateNode(index, { input_mapping });
                }}>Fix reference to use {previousNodes.at(-1).id}</button>}
              </div>}
              {unavailableRefs.length > 0 && <div className="field-hint" style={{ color: '#b42318' }}>
                {unavailableRefs.map((id) => `“${id}”`).join(', ')} {unavailableRefs.length === 1 ? 'is not an earlier workflow step ID' : 'are not earlier workflow step IDs'}. Available earlier IDs: {[...previousIds].join(', ') || 'none'}. A registered tool with the same name does not create a workflow step.
              </div>}
              <OutputContractField value={node.output_schema} onChange={(output_schema) => updateNode(index, { output_schema })} />
              <span className="field-hint">A later step receives this step's returned JSON automatically when you add it. You can change its input source if needed.</span>
              {Object.values(node.output_schema || {}).some((type) => typeof type === 'string' && type.startsWith('$.')) && <div className="field-hint" style={{ color: '#b42318' }}>
                This output contract contains a path. Put paths in the next step’s input mapping; use a type such as <code>object</code> here.{' '}
                <button type="button" className="btn g small" onClick={() => updateNode(index, { output_schema: Object.fromEntries(Object.entries(node.output_schema || {}).map(([key, type]) => [key, typeof type === 'string' && type.startsWith('$.') ? 'object' : type])) })}>Replace path values with object</button>
              </div>}
            </details>
          </section>;
          })}
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
      <ul className="providers-intro">
        <li>Choose a starter workflow or build your own.</li>
        <li>Fixed workflows follow their configured steps; Dynamic chooses a path for each request.</li>
        <li>For document answers, attach a knowledge base and enable <code>semantic_search</code> on an executor step.</li>
        <li>Starter workflows are copied to your account so you can customize them.</li>
      </ul>
      <button className="btn p" onClick={startCustom} style={{ marginBottom: '1rem' }}>+ Create custom workflow</button>
      <section style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div><strong>Creating with your own LLM?</strong><p className="field-hint" style={{ margin: '0.25rem 0 0' }}>Copy the workflow schema and state-mapping instructions, ask your LLM to create a definition, then paste it into the workflow JSON editor.</p></div>
          <button type="button" className="btn g small" onClick={copyWorkflowLlmInstructions}>{workflowInstructionsCopied ? 'Copied' : 'Copy LLM instructions'}</button>
        </div>
        <details style={{ marginTop: '0.5rem' }}>
          <summary style={{ cursor: 'pointer' }}>Preview the instructions</summary>
          <pre className="integration-code" style={{ maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: '0.5rem' }}>{workflowLlmInstructions}</pre>
        </details>
      </section>
      <section className="workflow-ai-builder">
        <div className="workflow-ai-builder-heading"><div><h3>Generate a workflow with AI</h3><p className="field-hint">Describe what you need. AI will fill this workflow editor with a draft you can change before saving.</p></div><button type="button" className="btn g" onClick={() => setBuilderOpen((open) => !open)}>{builderOpen ? 'Close' : 'Create from a brief'}</button></div>
        {builderOpen && <div className="workflow-ai-builder-form">
          {!providers.length ? <p className="field-hint">Configure a provider and select at least one model in Providers before generating a draft.</p> : <>
            <label className="field-label">Configured provider</label>
            <select className="default-select" value={builderProviderId} onChange={(event) => { setBuilderProviderId(event.target.value); setBuilderModel(''); }}><option value="">Choose provider</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.provider_id}</option>)}</select>
            {builderProvider && <><label className="field-label">Model to generate the draft</label><select className="default-select" value={builderModel} onChange={(event) => setBuilderModel(event.target.value)}><option value="">Choose model</option>{builderModels.map((model) => <option key={model} value={model}>{model}</option>)}</select></>}
            <label className="field-label">What should this workflow do?</label><textarea className="key-input" rows={5} value={builderBrief} onChange={(event) => setBuilderBrief(event.target.value)} placeholder="Describe the request it handles, steps it should take, tools it might need, and the final result you expect." />
            <p className="field-hint" aria-live="polite">{builderBusy ? `Sending the brief to ${builderProvider?.provider_id || 'selected provider'} (${builderModel}). Waiting for its workflow and test request; server validation runs before the draft is shown.` : 'The activity log below shows the provider, parsing, workflow validation, and first-node input check. Nothing is saved until you choose Save.'}</p>
            <button type="button" className="btn p" onClick={() => generateWorkflow('workflow')} disabled={builderBusy || !builderProviderId || !builderModel || builderBrief.trim().length < 10}>{builderBusy ? 'Generating workflow + test request…' : 'Generate workflow draft'}</button>
            {generationLog.length > 0 && <section className="workflow-draft-notes" role="log" aria-live="polite" aria-label="Workflow generation activity">
              <strong>Workflow generation activity</strong>
              <ol style={{ display: 'grid', gap: '0.45rem', margin: 0, paddingLeft: '1.35rem' }}>
                {generationLog.map((entry, index) => <li key={`${entry.stage}-${index}`}>
                  <strong>{entry.status === 'error' ? 'ERROR' : entry.status === 'running' ? 'IN PROGRESS' : 'DONE'} · {entry.stage}</strong> <span className="field-hint">{entry.time} · {entry.message}</span>
                  {entry.details?.length > 0 && <ul>{entry.details.map((detail, detailIndex) => <li key={detailIndex} className="field-hint">{typeof detail === 'string' ? detail : JSON.stringify(detail)}</li>)}</ul>}
                </li>)}
              </ol>
            </section>}
          </>}
        </div>}
      </section>
      <h3>Starter workflows</h3>
      <div className="provider-grid">{presets.map((preset) => <article key={preset.id} className="provider-card">
        <h4>{preset.name}</h4><p>{preset.description}</p>
        <details className="workflow-preset-prompts"><summary>View step prompts ({preset.definition.nodes.length})</summary>
          <div className="workflow-preset-prompt-list">{preset.definition.nodes.map((node, index) => <div className="workflow-preset-prompt" key={node.id}>
            <strong>{index + 1}. {node.name} <span>({node.role})</span></strong>
            <p>{node.instructions}</p>
          </div>)}</div>
          <span className="field-hint">To customize these prompts, use this workflow. Its step instructions will open in the editor before you save it.</span>
        </details>
        <button className="btn g small" onClick={() => choosePreset(preset)}>Use and configure prompts</button>
      </article>)}</div>
      <h3 style={{ marginTop: '2rem' }}>Your workflows</h3>
      {!workflows.length ? <p>No saved workflows yet.</p> : <div className="provider-grid">{workflows.map((workflow) => <article key={workflow.id} className="provider-card">
        <h4>{workflow.name}</h4><p>{workflow.description}</p><small>Version {workflow.version} · {workflow.definition.nodes.length} steps</small>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button className="btn g small" onClick={() => { const definition = normalizeWorkflowAttempts(workflow.definition); setEditing({ ...workflow, definition }); setJsonDraft(JSON.stringify(definition, null, 2)); }}>Edit</button>
          <button className="btn g small" onClick={() => { 
            if (window.confirm('Delete this workflow? Agents currently using it will be reassigned to your Dynamic default workflow. Existing run history and its workflow snapshot will be kept.')) { 
              deleteWorkflowMutation.mutate(workflow.id, {
                onSuccess: (result) => {
                  setNotice({ 
                    kind: 'success', 
                    message: result.agents_reassigned 
                      ? `${result.agents_reassigned} agent(s) reassigned to ${result.default_workflow_name}. Run history was preserved.` 
                      : 'Workflow deleted. Run history was preserved.' 
                  });
                },
                onError: (err) => {
                  setNotice({ message: err.message, kind: 'error' });
                }
              });
            } 
          }}>Delete</button>
        </div>
      </article>)}</div>}
    </>}
  </>;
}

function RunsTab() {
  // Use React Query hooks for automatic caching and refetching
  const { data: runsData, isLoading, isFetching, error, refetch: refetchRuns } = useRuns(100);
  const runs = runsData?.runs || [];
  
  // Persist selected run ID across navigation
  const { state, setState } = usePageState('runs', {
    selectedRunId: null,
  });
  
  // Fetch selected run details (only when a run is selected)
  const { data: selectedRun, isLoading: runLoading, isFetching: runFetching, error: runError, refetch: refetchRun } = useRun(state.selectedRunId);
  
  function openRun(runId) {
    setState({ selectedRunId: runId });
  }

  function refreshRuns() {
    refetchRuns();
    if (state.selectedRunId) refetchRun();
  }
  
  if (isLoading) return <div className="providers-status">Loading runs…</div>;
  if (error) return <div className="tab-notice error">{error.message}</div>;
  
  return <>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
      <p className="providers-intro">Inspect workflow steps, inputs and outputs, failures, token usage, and timing for each run.</p>
      <button type="button" className="btn g small" onClick={refreshRuns} disabled={isFetching || runFetching}>{isFetching || runFetching ? 'Refreshing…' : 'Refresh runs'}</button>
    </div>
    {runError && <div className="tab-notice error" role="alert">Could not load this run: {runError.message} <button type="button" className="btn g small" onClick={() => refetchRun()}>Retry</button></div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(0, 2fr)', gap: '1rem' }}>
      <div style={{ display: 'grid', alignContent: 'start', gap: '0.5rem' }}>
        {!runs.length && <p>No runs found.</p>}
        {runs.map((run) => <button key={run.id} className="btn g" aria-pressed={state.selectedRunId === run.id} onClick={() => openRun(run.id)} style={{ textAlign: 'left', borderColor: state.selectedRunId === run.id ? 'var(--accent, #6467f2)' : undefined }}>
          <strong>{run.status}</strong><br /><small>{new Date(run.created_at).toLocaleString()} · {run.id.slice(0, 8)}</small>
          <br /><small>{run.tokens_used ?? '—'} tokens · {run.duration_ms == null ? '—' : `${run.duration_ms} ms`}</small>
        </button>)}
      </div>
      {runLoading ? <div className="empty-state"><h3>Loading run details…</h3></div> : selectedRun ? <section style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '1rem', minWidth: 0 }}>
        <h3 style={{ marginTop: 0 }}>Run details</h3>
        <p><strong>Status:</strong> {selectedRun.status}{runFetching && ' · Updating…'} · <strong>Tokens:</strong> {selectedRun.tokens_used ?? 'not recorded'} · <strong>Duration:</strong> {selectedRun.duration_ms == null ? 'not finished' : `${selectedRun.duration_ms} ms`}</p>
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
  // Use React Query hooks for automatic caching
  const { data: catalog = [], isLoading: catalogLoading, error: catalogError } = useProviderCatalog();
  const { data: configuredProviders = [], isLoading: providersLoading, error: providersError, refetch } = useProviders();
  
  const [activeProvider, setActiveProvider] = useState(null);
  const [notice, setNotice] = useState(null);
  
  // Convert providers array to object map for easy lookup
  const configured = {};
  configuredProviders.forEach((row) => {
    configured[row.provider_id] = row;
  });
  
  const status = !getToken() ? 'anon' : catalogLoading || providersLoading ? 'loading' : catalogError || providersError ? 'error' : 'ready';
  const error = catalogError?.message || providersError?.message;

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
        <a className="btn p" href="/login">Log in</a>
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
        <button className="btn p" onClick={() => refetch()}>Retry</button>
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
          onSaved={(_row, message) => {
            setActiveProvider(null);
            flash(message);
          }}
          onDeleted={(providerId) => {
            setActiveProvider(null);
            flash(`Provider ${providerId} and dependent agents/knowledge bases removed.`);
          }}
        />
      )}
    </>
  );
}

function ProviderModal({ provider, existing, onClose, onSaved, onDeleted }) {
  const queryClient = useQueryClient();
  const invalidateProviderModels = () => queryClient.invalidateQueries({ queryKey: ['provider-models'] });
  
  // Use React Query mutation hooks
  const addProviderMutation = useAddProvider();
  const updateProviderMutation = useUpdateProvider();
  const deleteProviderMutation = useDeleteProvider();
  
  const isConfigured = Boolean(existing);
  const [step, setStep] = useState(isConfigured ? 'models' : 'key');
  const [apiKey, setApiKey] = useState('');
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
  const [saveError, setSaveError] = useState(null);

  const modelsQuery = useProviderModels(provider.provider_id, {
    enabled: step === 'models' && keyStored,
  });
  const models = modelsQuery.data ?? null;
  const modelsError = modelsQuery.error;
  const modelsLoading = modelsQuery.isLoading || modelsQuery.isFetching;

  async function verifyAndContinue(e) {
    e.preventDefault();
    setKeyError(null);
    try {
      await addProviderMutation.mutateAsync({
        provider_id: provider.provider_id,
        api_key: apiKey.trim(),
      });
      await invalidateProviderModels();
      setKeyStored(true);
      setStep('models');
      setApiKey('');
    } catch (err) {
      setKeyError(err.message);
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
        const row = await addProviderMutation.mutateAsync({
          provider_id: provider.provider_id,
          api_key: apiKey.trim(),
          ...payload,
        });
        await invalidateProviderModels();
        onSaved(row, `${provider.display_name} configured`);
        return;
      }
      const row = await updateProviderMutation.mutateAsync({
        providerId: provider.provider_id,
        payload,
      });
      await invalidateProviderModels();
      onSaved(row, `${provider.display_name} updated`);
    } catch (err) {
      setSaveError(err.message);
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
      await deleteProviderMutation.mutateAsync(provider.provider_id);
      await invalidateProviderModels();
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
                disabled={addProviderMutation.isPending || !apiKey.trim()}
              >
                {addProviderMutation.isPending ? 'Verifying…' : 'Verify & continue'}
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
                <button type="submit" className="btn p" disabled={updateProviderMutation.isPending || addProviderMutation.isPending}>
                  {(updateProviderMutation.isPending || addProviderMutation.isPending) ? 'Saving…' : 'Save selection'}
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
  // Use React Query hooks for automatic caching
  const { data: agents = [], isLoading: agentsLoading, error: agentsError, refetch: refetchAgents } = useAgents();
  const { data: workflows = [], isLoading: workflowsLoading, error: workflowsError } = useWorkflows();
  const { data: providers = [], isLoading: providersLoading, error: providersError } = useProviders();
  const { data: knowledgeBases = [], isLoading: kbLoading, error: kbError } = useKnowledgeBases();
  const { data: customTools = [] } = useCustomTools();
  const { data: builtinToolsData } = useBuiltinTools();
  
  const builtinTools = builtinToolsData?.builtin_tools || [];
  const registeredTools = customTools || [];
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [notice, setNotice] = useState(null);
  const [expandedAgentId, setExpandedAgentId] = useState(null);
  const [agentBrief, setAgentBrief] = useState('');
  const [agentBuilderModel, setAgentBuilderModel] = useState('');
  const [generatingAgentDraft, setGeneratingAgentDraft] = useState(false);
  const [generatedWorkflowMeta, setGeneratedWorkflowMeta] = useState(null);
  const [generatedWorkflowName, setGeneratedWorkflowName] = useState('');
  const [generatedWorkflowDescription, setGeneratedWorkflowDescription] = useState('');
  const [savingGeneratedWorkflow, setSavingGeneratedWorkflow] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    provider_id: '',
    execution_mode: 'single',
    planner: '',
    executor: '',
    reviewer: '',
    router: '',
    direct: '',
    controller: '',
    finalizer: '',
    workflow_version_id: '',
    max_input_chars: 30000,
    max_tokens_per_run: 100000,
    max_tokens_per_node: 8192,
    knowledge_base_ids: [],
  });
  
  // Mutation hooks
  const createAgentMutation = useCreateAgent();
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();
  const createWorkflowMutation = useCreateWorkflow();
  const updateWorkflowMutation = useUpdateWorkflow();
  const generateWorkflowDraftMutation = useGenerateWorkflowDraft();
  
  const selectedProvider = providers.find((p) => p.id === formData.provider_id);
  const providerModelsQuery = useProviderModels(selectedProvider?.provider_id, {
    enabled: isCreating && Boolean(selectedProvider),
  });
  const providerModels = Array.from(new Set([
    ...(selectedProvider?.enabled_models || []),
    ...(providerModelsQuery.data || []),
    ...WORKFLOW_ROLES.map((role) => formData[role]),
  ].filter(Boolean)));
  const modelsLoading = providerModelsQuery.isLoading || providerModelsQuery.isFetching;
  const modelsError = providerModelsQuery.error?.message;
  const agentBuilderModels = Array.from(new Set([...(selectedProvider?.enabled_models || []), selectedProvider?.default_model].filter(Boolean)));
  
  const [workflowDraft, setWorkflowDraft] = useState(null);
  const [workflowEditError, setWorkflowEditError] = useState('');
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const selectedWorkflow = workflows.find((workflow) => workflow.version_id === formData.workflow_version_id);
  const workflowRoles = new Set((selectedWorkflow?.definition?.nodes || []).map((node) => node.role));

  useEffect(() => {
    if (!selectedProvider) return;
    setAgentBuilderModel((current) => agentBuilderModels.includes(current) ? current : selectedProvider.default_model || agentBuilderModels[0] || '');
  }, [formData.provider_id, selectedProvider?.default_model]);

  useEffect(() => {
    if (!selectedProvider || !providerModels.length) return;
    const defaultModel = selectedProvider.default_model || providerModels[0];
    setFormData((prev) => ({
      ...prev,
      ...Object.fromEntries(WORKFLOW_ROLES.map((role) => [role, prev[role] || defaultModel])),
    }));
  }, [providerModelsQuery.data, selectedProvider?.default_model]);

  const isLoading = agentsLoading || workflowsLoading || providersLoading || kbLoading;
  const loadError = agentsError || workflowsError || providersError || kbError;
  const status = isLoading ? 'loading' : loadError ? 'error' : 'ready';

  function flash(message, kind = 'success') {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 4000);
  }

  function handleProviderSelect(providerId) {
    setAgentBuilderModel('');
    setGeneratedWorkflowMeta(null);
    setGeneratedWorkflowName('');
    setGeneratedWorkflowDescription('');
    setFormData((prev) => ({
      ...prev,
      provider_id: providerId,
      ...Object.fromEntries(WORKFLOW_ROLES.map((role) => [role, ''])),
    }));
  }

  function openAgentForm(agent = null) {
    setEditingAgent(agent);
    const config = agent?.config || {};
    const models = config.models || {};
    setFormData({
      name: agent?.name || '',
      provider_id: agent?.provider_id || '',
      execution_mode: config.execution_mode || 'single',
      ...Object.fromEntries(WORKFLOW_ROLES.map((role) => [role, models[role] || ''])),
      workflow_version_id: config.workflow_version_id || '',
      max_input_chars: config.limits?.max_input_chars ?? 30000,
      max_tokens_per_run: config.limits?.max_tokens_per_run ?? 100000,
      max_tokens_per_node: config.limits?.max_tokens_per_node ?? 8192,
      context_window_tokens: config.context_window_tokens ?? 4096,
      knowledge_base_ids: config.knowledge_base_ids || [],
    });
    setWorkflowDraft(null);
    setWorkflowEditError('');
    setGeneratedWorkflowMeta(null);
    setGeneratedWorkflowName('');
    setGeneratedWorkflowDescription('');
    setAgentBrief('');
    setIsCreating(true);
  }

  async function saveWorkflowFromAgent() {
    if (!selectedWorkflow || workflowDraft === null) return;
    setSavingWorkflow(true);
    setWorkflowEditError('');
    try {
      const definition = JSON.parse(workflowDraft);
      const saved = await updateWorkflowMutation.mutateAsync({
        workflowId: selectedWorkflow.id,
        payload: {
          name: selectedWorkflow.name,
          description: selectedWorkflow.description || '',
          definition,
        },
      });
      setFormData((current) => ({ ...current, workflow_version_id: saved.version_id }));
      setEditingAgent((current) => current ? ({
        ...current,
        config: { ...(current.config || {}), workflow_version_id: saved.version_id },
      }) : current);
      setWorkflowDraft(null);
      flash('Workflow saved. This version is now selected for the agent.');
    } catch (err) {
      setWorkflowEditError(err instanceof SyntaxError ? 'Workflow JSON must be valid before saving.' : err.message);
    } finally {
      setSavingWorkflow(false);
    }
  }

  async function generateAgentConfiguration() {
    if (!formData.provider_id || !agentBuilderModel || agentBrief.trim().length < 10) return;
    setGeneratingAgentDraft(true);
    setWorkflowEditError('');
    try {
      const draft = await generateWorkflowDraftMutation.mutateAsync({
        kind: 'agent', brief: agentBrief.trim(), provider_id: formData.provider_id, model: agentBuilderModel,
      });
      setFormData((current) => ({ ...current, name: draft.agent.name, workflow_version_id: '' }));
      setWorkflowDraft(JSON.stringify(draft.workflow, null, 2));
      setGeneratedWorkflowMeta(draft);
      setGeneratedWorkflowName(draft.workflow_name);
      setGeneratedWorkflowDescription(draft.workflow_description || '');
      flash('Generated the Agent, workflow, and matching sample run request. The server validated the workflow and first-node inputs.');
    } catch (err) { flash(err.message, 'error'); }
    finally { setGeneratingAgentDraft(false); }
  }

  async function saveGeneratedWorkflow() {
    if (!generatedWorkflowMeta || workflowDraft === null) return;
    setSavingGeneratedWorkflow(true);
    setWorkflowEditError('');
    try {
      const definition = JSON.parse(workflowDraft);
      const saved = await createWorkflowMutation.mutateAsync({
        name: generatedWorkflowName,
        description: generatedWorkflowDescription,
        definition,
      });
      setFormData((current) => ({ ...current, workflow_version_id: saved.version_id }));
      setWorkflowDraft(null);
      setGeneratedWorkflowMeta(null);
      setGeneratedWorkflowName('');
      setGeneratedWorkflowDescription('');
      flash('Workflow saved and selected. Review the Agent models, then save the Agent.');
    } catch (err) {
      setWorkflowEditError(err instanceof SyntaxError ? 'Workflow JSON must be valid before saving.' : err.message);
    } finally { setSavingGeneratedWorkflow(false); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.provider_id) {
      flash('Please select a provider.', 'error');
      return;
    }
    if (formData.execution_mode === 'single' && !formData.workflow_version_id) {
      flash('Choose a workflow before saving this agent. Create one from a preset or build a custom workflow in the Workflows section.', 'error');
      return;
    }
    if (workflowDraft !== null) {
      flash('Save or discard your workflow edits before saving the agent.', 'error');
      return;
    }
    const missingRoleModels = [...workflowRoles].filter((role) => !formData[role]);
    if (missingRoleModels.length) {
      flash(`Choose a model for each role used by this workflow: ${missingRoleModels.join(', ')}.`, 'error');
      return;
    }
    try {
      const payload = {
        ...(editingAgent?.config || {}),
        name: formData.name || 'New Agent',
        provider_id: formData.provider_id,
        execution_mode: formData.execution_mode,
        workflow_version_id: formData.workflow_version_id,
        limits: {
          ...(editingAgent?.config?.limits || {}),
          max_input_chars: Number(formData.max_input_chars) || 30000,
          max_tokens_per_run: Number(formData.max_tokens_per_run) || 100000,
          max_tokens_per_node: Number(formData.max_tokens_per_node) || 8192,
        },
        models: Object.fromEntries(WORKFLOW_ROLES.map((role) => [role, formData[role] || null])),
        context_window_tokens: formData.context_window_tokens === 'none'
          ? null
          : Number(formData.context_window_tokens) || 4096,
        knowledge_base_ids: formData.knowledge_base_ids,
      };
      if (editingAgent) {
        await updateAgentMutation.mutateAsync({ agentId: editingAgent.id, payload });
      } else {
        await createAgentMutation.mutateAsync(payload);
      }
      setIsCreating(false);
      setEditingAgent(null);
      setFormData({
        name: '',
        provider_id: '',
        execution_mode: 'single',
        planner: '',
        executor: '',
        reviewer: '',
        router: '',
        direct: '',
        controller: '',
        finalizer: '',
        workflow_version_id: '',
        max_input_chars: 30000,
        max_tokens_per_run: 100000,
        max_tokens_per_node: 8192,
        context_window_tokens: 4096,
        knowledge_base_ids: [],
      });
      flash(editingAgent ? 'Agent updated successfully!' : 'Agent created successfully!');
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this agent?')) return;
    try {
      await deleteAgentMutation.mutateAsync(id);
      flash('Agent deleted.');
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  if (status === 'loading') return <div>Loading agents...</div>;
  if (status === 'error') return <div className="tab-notice error">Could not load Agents: {loadError.message}</div>;

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
          {!editingAgent && <section className="workflow-ai-builder" style={{ marginBottom: '1rem' }}>
            <div><h3>Generate this Agent from a brief</h3><p className="field-hint">Choose a configured provider above. This model drafts the Agent name and workflow; you review the workflow and choose the Agent’s runtime models below.</p></div>
            {selectedProvider && <>
              <label className="field-label">Model to generate the draft</label>
              <select className="default-select" value={agentBuilderModel} onChange={(event) => setAgentBuilderModel(event.target.value)}><option value="">Choose model</option>{agentBuilderModels.map((model) => <option key={model} value={model}>{model}</option>)}</select>
              <label className="field-label">Describe the Agent you need</label>
              <textarea className="key-input" rows={4} value={agentBrief} onChange={(event) => setAgentBrief(event.target.value)} placeholder="What should the Agent help with? Describe the kinds of requests it handles, the steps it should take, and the results it should return." />
              {generatingAgentDraft && <div className="workflow-draft-notes" role="status" aria-live="polite"><strong>Generating Agent, workflow, and test request</strong><span>Step 1/2: {selectedProvider?.provider_id || 'Selected provider'} is creating a workflow and realistic run input for its first node. Step 2/2: the server will validate node mappings and workflow structure before the draft appears.</span></div>}
              <button type="button" className="btn g" onClick={generateAgentConfiguration} disabled={generatingAgentDraft || !agentBuilderModel || agentBrief.trim().length < 10}>{generatingAgentDraft ? 'Generating Agent + workflow + test request…' : 'Generate Agent and workflow draft'}</button>
            </>}
            {!selectedProvider && <span className="field-hint">Select one of your configured providers to choose the model used for drafting.</span>}
          </section>}
          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Execution mode</label>
            <select className="default-select" value={formData.execution_mode} onChange={(e) => setFormData({ ...formData, execution_mode: e.target.value })}>
              <option value="single">Single orchestration (current flow)</option>
              <option value="multi_step">Multi-step (LangGraph)</option>
            </select>
            <span className="field-hint">
              {formData.execution_mode === 'single'
                ? 'Runs the selected workflow. This is the default and preserves the current orchestration path.'
                : 'Runs the built-in LangGraph router, planner, executor, and review loop. A workflow is optional; if selected, its assigned custom tools are made available to the graph.'}
            </span>
            <label className="field-label" style={{ marginTop: '0.75rem' }}>{formData.execution_mode === 'single' ? 'Workflow' : 'Workflow (optional in Multi-step mode)'}</label>
            <select className="default-select" required={formData.execution_mode === 'single'} value={formData.workflow_version_id || ''} onChange={(e) => { setFormData({ ...formData, workflow_version_id: e.target.value }); setWorkflowDraft(null); setWorkflowEditError(''); }}>
              <option value="">{formData.execution_mode === 'single' ? 'Select a workflow' : 'No workflow / built-in tools only'}</option>
              {workflows.map((workflow) => <option key={workflow.version_id} value={workflow.version_id}>{workflow.name} · v{workflow.version}</option>)}
            </select>
            <span className="field-hint">{formData.execution_mode === 'single'
              ? 'The selected workflow defines the nodes, prompts, transitions, outputs, and per-step tools.'
              : 'Multi-step mode does not execute workflow nodes. If selected, a workflow only exposes custom tools assigned to its nodes to the LangGraph.'} To make a registered tool callable, assign it to a workflow step and save a new workflow version.</span>
            {selectedWorkflow && <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn g small" onClick={() => { setWorkflowDraft(JSON.stringify(selectedWorkflow.definition, null, 2)); setWorkflowEditError(''); }}>Edit workflow here</button>
              {workflowDraft !== null && <button type="button" className="btn g small" onClick={() => { setWorkflowDraft(null); setWorkflowEditError(''); }}>Discard workflow edits</button>}
            </div>}
            {selectedWorkflow && <div style={{ marginTop: '0.75rem', border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '0.75rem' }}>
              <strong>{formData.execution_mode === 'single' ? `Workflow nodes (${selectedWorkflow.definition.nodes.length})` : 'Attached workflow (nodes are not run in Multi-step mode)'}</strong>
              <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.4rem' }}>{selectedWorkflow.definition.nodes.map((node) => <li key={node.id}><strong>{node.name || node.id}</strong> <span className="field-hint">({node.role}) · {node.id} · Tools: {(node.tools || []).join(', ') || 'none assigned'}</span></li>)}</ol>
            </div>}
            {workflowDraft !== null && <div style={{ marginTop: '0.75rem' }}>
              {generatedWorkflowMeta && <div className="workflow-draft-notes"><strong>AI generated draft — nothing is saved until you choose below</strong><span>Drafted with {agentBuilderModel} via {selectedProvider?.provider_id}. Workflow structure and the sample run request were validated by the server.</span><label className="field-label">Workflow name</label><input className="key-input" value={generatedWorkflowName} onChange={(event) => setGeneratedWorkflowName(event.target.value)} /><label className="field-label">Workflow description</label><input className="key-input" value={generatedWorkflowDescription} onChange={(event) => setGeneratedWorkflowDescription(event.target.value)} /><strong>Suggested Agent: {generatedWorkflowMeta.agent?.name}</strong><span>{generatedWorkflowMeta.agent?.purpose}</span>{[...(generatedWorkflowMeta.assumptions || []), ...(generatedWorkflowMeta.questions || []), ...(generatedWorkflowMeta.setup_notes || [])].length > 0 && <ul>{[...(generatedWorkflowMeta.assumptions || []).map((item) => `Assumption: ${item}`), ...(generatedWorkflowMeta.questions || []).map((item) => `Question: ${item}`), ...(generatedWorkflowMeta.setup_notes || []).map((item) => `Setup: ${item}`)].map((item, index) => <li key={index}>{item}</li>)}</ul>}</div>}
              {generatedWorkflowMeta && <GeneratedTestRunRequest request={generatedWorkflowMeta.test_run_request} />}
              <label className="field-label">Workflow definition (JSON)</label>
              <textarea className="key-input" rows={18} value={workflowDraft} onChange={(event) => setWorkflowDraft(event.target.value)} spellCheck={false} />
              <span className="field-hint">Edit every node’s role instructions, mapped inputs, output contract, tools, transitions, and limits here.</span>
              {workflowEditError && <div className="field-hint" style={{ color: '#b42318' }}>{workflowEditError}</div>}
              {generatedWorkflowMeta
                ? <button type="button" className="btn p" style={{ marginTop: '0.5rem' }} onClick={saveGeneratedWorkflow} disabled={savingGeneratedWorkflow || !generatedWorkflowName.trim()}>{savingGeneratedWorkflow ? 'Saving workflow…' : 'Save workflow and use for this Agent'}</button>
                : <button type="button" className="btn p" style={{ marginTop: '0.5rem' }} onClick={saveWorkflowFromAgent} disabled={savingWorkflow}>{savingWorkflow ? 'Saving workflow…' : 'Save workflow version'}</button>}
            </div>}
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

              {[...workflowRoles].map((role) => <div key={role} style={{ marginBottom: '1rem' }}>
                <label className="field-label">{WORKFLOW_ROLE_LABELS[role] || role} Model</label>
                <select
                  className="default-select"
                  value={formData[role] || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, [role]: event.target.value }))}
                  required
                >
                  <option value="">Select {role} model...</option>
                  {providerModels.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </div>)}
            </>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Maximum input length (characters)</label>
            <input
              className="key-input"
              type="number"
              min="1"
              max="200000"
              value={formData.max_input_chars}
              onChange={(event) => setFormData({ ...formData, max_input_chars: event.target.value })}
            />
            <span className="field-hint">Default: 30,000 characters. Set a limit from 1 to 200,000 for each run’s input.</span>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Maximum tokens per run</label>
            <input className="key-input" type="number" min="1" max="1000000" value={formData.max_tokens_per_run ?? 100000} onChange={(e) => setFormData({ ...formData, max_tokens_per_run: Number(e.target.value) || 100000 })} />
            <span className="field-hint">Total usage budget across every node and model call in one run. Default: 100,000.</span>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="field-label">Default completion tokens per node</label>
            <input className="key-input" type="number" min="1" max="200000" value={formData.max_tokens_per_node ?? 8192} onChange={(e) => setFormData({ ...formData, max_tokens_per_node: Number(e.target.value) || 8192 })} />
            <span className="field-hint">Workflow nodes inherit this output cap unless the node sets its own completion token override. Default: 8,192.</span>
          </div>

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

          <p className="field-hint" style={{ marginBottom: "1rem" }}>Execution mode selects the current single-orchestration workflow or the multi-step LangGraph. Workflow nodes own role instructions, tools, inputs, outputs, and transitions; Agent settings supply models, knowledge bases, and runtime limits.</p>

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
        <div className="provider-grid agent-grid">
          {agents.map((agent) => {
            const agentProv = providers.find((p) => p.id === agent.provider_id);
            const providerName = agentProv ? agentProv.provider_id : agent.provider_id;
            const models = agent.config && agent.config.models;
            const kbIds = (agent.config && agent.config.knowledge_base_ids) || [];
            const agentWorkflow = workflows.find((workflow) => workflow.version_id === agent.config?.workflow_version_id);
            const assignedToolNames = [...new Set((agentWorkflow?.definition?.nodes || []).flatMap((node) => node.tools || []))];
            const knownToolNames = new Set([
              ...registeredTools.map((tool) => tool.name),
              ...builtinTools.map((tool) => tool.name),
            ]);
            const fullAgentConfig = {
              agent: { id: agent.id, name: agent.name, provider_id: agent.provider_id },
              config: agent.config || {},
              role_models: agent.config?.models || {},
              workflow: agentWorkflow ? {
                id: agentWorkflow.id,
                name: agentWorkflow.name,
                version: agentWorkflow.version,
                version_id: agentWorkflow.version_id,
                definition: agentWorkflow.definition,
              } : { version_id: agent.config?.workflow_version_id || null, unavailable: true },
              assigned_tools: assignedToolNames.map((name) => registeredTools.find((tool) => tool.name === name)
                || builtinTools.find((tool) => tool.name === name)
                || { name, unavailable: true }),
              knowledge_bases: kbIds.map((id) => knowledgeBases.find((kb) => kb.id === id)
                || { id, unavailable: true }),
            };
            return (
              <div key={agent.id} className="provider-card configured" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span className="provider-logo" style={{ background: '#6467f2' }}>
                    AG
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="provider-name" style={{ fontWeight: 600 }}>{agent.name}</div>
                    <span className="provider-badge ok">Provider: {providerName}</span>
                    <span className="provider-badge">{agent.config?.execution_mode === 'multi_step' ? 'Multi-step (LangGraph)' : 'Single orchestration'}</span>
                  </div>
                </div>
                <div className="agent-id-row"><strong>Agent ID</strong><code>{agent.id}</code><button className="btn g small" type="button" onClick={() => navigator.clipboard.writeText(agent.id)}>Copy</button></div>
                <div className="agent-tools-summary">
                  <strong>{agent.config?.execution_mode === 'multi_step' ? 'Tools available to LangGraph' : 'Tools available to workflow steps'}</strong>
                  {agentWorkflow?.definition?.nodes?.some((node) => (node.tools || []).length > 0) ? agentWorkflow.definition.nodes.filter((node) => (node.tools || []).length > 0).map((node) => <div key={node.id} className="agent-tool-step"><span>{node.name || node.id} ({node.role})</span><span>{node.tools.map((name) => <span key={name} className={!knownToolNames.has(name) ? 'agent-tool-missing' : name === 'semantic_search' && !kbIds.length ? 'agent-tool-missing' : ''}>{name}{!knownToolNames.has(name) ? ' — not registered' : name === 'semantic_search' && !kbIds.length ? ' — no knowledge base attached' : ''}</span>)}</span></div>) : <span className="field-hint">No tools are assigned to this workflow. Registering tools alone does not make them callable; check the tools on the workflow step that needs them.</span>}
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
                <button type="button" className="btn g small" style={{ marginTop: '0.4rem' }} onClick={() => setExpandedAgentId((current) => current === agent.id ? null : agent.id)}>
                  {expandedAgentId === agent.id ? 'Hide full current config' : 'Show full current config'}
                </button>
                {expandedAgentId === agent.id && <pre className="integration-code" style={{ width: '100%', maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><code>{JSON.stringify(fullAgentConfig, null, 2)}</code></pre>}
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
  // Use React Query hook for automatic caching
  const { data: agents = [], isLoading: loadingAgents, error: loadError } = useAgents();
  
  const [selectedId, setSelectedId] = useState('');
  const [template, setTemplate] = useState('react');
  const [endUserId, setEndUserId] = useState('demo-user-123');
  const [sessionId, setSessionId] = useState('demo-conversation-123');
  const [prompt, setPrompt] = useState('What can you help me with?');
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Set the first agent as selected when agents load
  useEffect(() => {
    if (agents.length > 0 && !selectedId) {
      setSelectedId(agents[0].id);
    }
  }, [agents, selectedId]);


  const examples = {
    react: `// React component: call YOUR backend, never the gateway token from the browser.\nimport { useState } from 'react';\n\nexport function AgentChat() {\n  const [answer, setAnswer] = useState('');\n  const [busy, setBusy] = useState(false);\n\n  async function send(message) {\n    setBusy(true);\n    try {\n      // Your backend authenticates the signed-in user and supplies their trusted ID.\n      const response = await fetch('/api/agent-chat', {\n        method: 'POST',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ message, sessionId: 'conversation-123' }),\n        credentials: 'include',\n      });\n      const data = await response.json();\n      if (!response.ok) throw new Error(data.error || 'Request failed');\n      setAnswer('Run started: ' + data.runId + '. Read progress and the result from the authenticated event stream.');\n    } finally { setBusy(false); }\n  }\n\n  return <section>\n    <button disabled={busy} onClick={() => send('Hello!')}>Ask agent</button>\n    <p>{answer}</p>\n  </section>;\n}`,
    node: `// Node.js / Express backend. Keep AGENT_GATEWAY_TOKEN in server environment.\nimport express from 'express';\n\nconst app = express();\napp.use(express.json());\napp.post('/api/agent-chat', requireYourUserAuth, async (req, res) => {\n  const userId = req.user.id; // Set by your verified authentication middleware\n  const gateway = await fetch('${INTEGRATION_BASE_URL}/v1/agents/${selectedId || '<AGENT_ID>'}/run', {\n    method: 'POST',\n    headers: {\n      Authorization: \`Bearer \${process.env.AGENT_GATEWAY_TOKEN}\`,\n      'Content-Type': 'application/json',\n      'X-End-User-ID': String(userId),\n      // session ID is passed in the JSON body below\n    },\n    body: JSON.stringify({ input: req.body, external_session_id: req.body.sessionId }),\n  });\n  const run = await gateway.json();\n  if (!gateway.ok) return res.status(gateway.status).json({ error: run.detail || 'Gateway request failed' });\n  // Read /v1/runs/{run_id}/stream with the same bearer token to receive progress and the result.\n  res.status(202).json({ runId: run.run_id, sessionId: run.session_id, status: run.status });\n});`,
    python: `# Python / FastAPI backend. Keep AGENT_GATEWAY_TOKEN in server environment.\nimport os\nimport httpx\nfrom fastapi import FastAPI, Depends\n\napp = FastAPI()\nGATEWAY = '${INTEGRATION_BASE_URL}'\nAGENT_ID = '${selectedId || '<AGENT_ID>'}'\n\n@app.post('/api/agent-chat')\nasync def agent_chat(body: dict, user=Depends(require_your_user_auth)):\n    # user.id comes from your verified authentication middleware.\n    async with httpx.AsyncClient() as client:\n        response = await client.post(\n            f'{GATEWAY}/v1/agents/{AGENT_ID}/run',\n            headers={\n                'Authorization': f"Bearer {os.environ['AGENT_GATEWAY_TOKEN']}",\n                'X-End-User-ID': str(user.id),\n                # session ID is passed in the JSON body below\n            },\n            json={'input': body, 'external_session_id': body.get('sessionId')},\n        )\n        response.raise_for_status()\n        return response.json() # use run_id to subscribe to /v1/runs/{run_id}/stream with the same token\n`,
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
              else {
                step.error = data.error;
                if (step.output_repair) step.output_repair.status = 'repair failed';
              }
              if (type === 'workflow_step_completed' && step.output_repair) step.output_repair.status = 'repaired';
            }
            showProgress();
          } else if (type === 'workflow_step_output_repair') {
            const step = [...steps].reverse().find((item) => item.node_id === data.node_id && item.status === 'running');
            if (step) step.output_repair = { status: 'format repair requested', attempt: data.attempt, reason: data.reason };
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
      <p className="field-hint"><a href="/guide.md" target="_blank" rel="noreferrer">Open the detailed integration guide (guide.md)</a> · <a href="/guide.md" download="agent-gateway-integration-guide.md">Download Markdown</a></p>
      <p className="field-hint">Send the caller's complete data as an object in <code>input</code>. The gateway also accepts a plain string when that is all you have. Keep identity and conversation metadata at the request level: derive <code>X-End-User-ID</code> on your server from the authenticated user, and send the same <code>external_session_id</code> on every turn in that conversation. Do not trust an end-user ID supplied by the browser.</p>
      <pre className="integration-code"><code>{'{ "input": { "message": "Summarize this document", "documentId": "doc-456", "sessionId": "conversation-789" }, "external_session_id": "conversation-789", "variables": { "locale": "en" } }'}</code></pre>
      <p className="field-hint"><code>input</code> is the request data the workflow receives. <code>external_session_id</code> links turns to conversation history; <code>X-End-User-ID</code> scopes that session to the verified end user. <code>variables</code> is optional agent template/context data. Reuse the same end-user and session IDs across turns. If you omit the session ID, the gateway uses its default session for that agent and end user; supply different session IDs for separate conversations.</p>
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

function sampleToolArguments(schema) {
  const properties = schema?.properties || {};
  return Object.fromEntries(Object.entries(properties).map(([name, definition]) => {
    const type = definition?.type;
    const value = type === 'integer' || type === 'number' ? 1
      : type === 'boolean' ? false
        : type === 'object' ? {}
          : type === 'array' ? [] : `example_${name}`;
    return [name, value];
  }));
}

function ToolsTab() {
  // Use React Query hooks for automatic caching and refetching
  const { data: tools = [], isLoading: loading, error: loadError, refetch } = useCustomTools();
  
  // Mutation hooks for write operations
  const createToolMutation = useCreateCustomTool();
  const updateToolMutation = useUpdateCustomTool();
  const deleteToolMutation = useDeleteCustomTool();
  const testToolMutation = useTestCustomTool();
  
  const [deletingAll, setDeletingAll] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [testArguments, setTestArguments] = useState('{\n  "page_number": 1\n}');
  const [testResult, setTestResult] = useState(null);
  const [form, setForm] = useState({
    name: '', description: '', endpoint_url: '', auth_token: '',
    timeout_ms: 10000, input_schema: '{\n  "type": "object",\n  "properties": {\n    "page_number": { "type": "integer", "description": "Page to inspect" }\n  },\n  "required": ["page_number"]\n}',
  });

  const saving = createToolMutation.isPending || updateToolMutation.isPending;
  const testing = testToolMutation.isPending;

  // Show load error in notice if any
  useEffect(() => {
    if (loadError) {
      setNotice({ kind: 'error', message: loadError.message });
    }
  }, [loadError]);

  function sampleArguments() {
    try {
      const schema = JSON.parse(form.input_schema || '{}');
      setTestArguments(JSON.stringify(sampleToolArguments(schema), null, 2));
      setTestResult(null);
    } catch {
      setNotice({ kind: 'error', message: 'Fix the input schema JSON before generating sample arguments.' });
    }
  }

  function testTool() {
    let inputSchema;
    let argumentsObject;
    try {
      inputSchema = JSON.parse(form.input_schema || '{}');
      argumentsObject = JSON.parse(testArguments || '{}');
      if (!inputSchema || Array.isArray(inputSchema) || typeof inputSchema !== 'object') throw new Error('Input schema must be a JSON object.');
      if (!argumentsObject || Array.isArray(argumentsObject) || typeof argumentsObject !== 'object') throw new Error('Test arguments must be a JSON object.');
    } catch (err) {
      setTestResult({ ok: false, error: err.message || 'Schema and test arguments must be valid JSON objects.' });
      return;
    }
    
    setTestResult(null);
    testToolMutation.mutate({
      endpoint_url: form.endpoint_url.trim(),
      auth_token: form.auth_token || null,
      timeout_ms: Number(form.timeout_ms) || 10000,
      input_schema: inputSchema,
      arguments: argumentsObject,
      tool_id: editingTool?.id || null,
    }, {
      onSuccess: (result) => {
        setTestResult(result);
      },
      onError: (err) => {
        setTestResult({ ok: false, error: err.message });
      }
    });
  }

  function register(event) {
    event.preventDefault();
    let inputSchema;
    try {
      inputSchema = JSON.parse(form.input_schema || '{}');
      if (!inputSchema || Array.isArray(inputSchema) || typeof inputSchema !== 'object') throw new Error();
    } catch {
      setNotice({ kind: 'error', message: 'Input schema must be a valid JSON object.' });
      return;
    }
    
    setNotice(null);
    const payload = {
      name: form.name.trim(), description: form.description.trim(), kind: 'webhook',
      endpoint_url: form.endpoint_url.trim(),
      timeout_ms: Number(form.timeout_ms) || 10000, input_schema: inputSchema,
      auth_token: form.auth_token || undefined,
    };
    
    const mutation = editingTool ? updateToolMutation : createToolMutation;
    const mutationPayload = editingTool 
      ? { toolId: editingTool.id, payload }
      : payload;
    
    mutation.mutate(mutationPayload, {
      onSuccess: (saved) => {
        // Verify the tool is in the list
        const registered = tools.some((tool) => tool.id === saved.id || tool.name === payload.name);
        if (!registered) {
          // Refetch to get the latest list
          refetch();
        }
        
        setForm({ name: '', description: '', endpoint_url: '', auth_token: '', timeout_ms: 10000, input_schema: '{\n  "type": "object",\n  "properties": {\n    "page_number": { "type": "integer", "description": "Page to inspect" }\n  },\n  "required": ["page_number"]\n}' });
        setTestArguments('{\n  "page_number": 1\n}');
        setTestResult(null);
        setShowForm(false);
        setEditingTool(null);
        setNotice({ kind: 'success', message: editingTool ? 'Tool updated and confirmed in the registered tools list.' : 'Tool registered and confirmed available in workflow tool selectors.' });
      },
      onError: (err) => {
        setNotice({ kind: 'error', message: err.message });
      }
    });
  }

  function edit(tool) {
    setEditingTool(tool);
    setForm({
      name: tool.name, description: tool.description || '', endpoint_url: tool.endpoint_url || '',
      auth_token: '',
      timeout_ms: tool.timeout_ms || 10000,
      input_schema: JSON.stringify(tool.input_schema || { type: 'object', properties: {} }, null, 2),
    });
    setTestArguments(JSON.stringify(sampleToolArguments(tool.input_schema), null, 2));
    setTestResult(null);
    setShowForm(true);
  }

  async function importTools(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    let entries;
    try {
      const parsed = JSON.parse(await file.text());
      entries = Array.isArray(parsed) ? parsed : parsed?.tools;
      if (!Array.isArray(entries) || entries.length === 0) throw new Error('The file must contain a non-empty tools array.');
      if (entries.length > 100) throw new Error('Import up to 100 tools per file.');
      const names = new Set();
      entries = entries.map((tool, index) => {
        if (!tool || typeof tool !== 'object' || Array.isArray(tool)) throw new Error(`Tool ${index + 1} must be an object.`);
        const name = String(tool.name || '').trim();
        if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Tool ${index + 1} has an invalid name. Use letters, numbers, and underscores.`);
        if (names.has(name)) throw new Error(`The file contains the tool name "${name}" more than once.`);
        names.add(name);
        if (tool.kind && tool.kind !== 'webhook') throw new Error(`${name}: only webhook tools can be imported from this form.`);
        if (!String(tool.description || '').trim()) throw new Error(`${name}: description is required.`);
        let endpoint;
        try { endpoint = new URL(tool.endpoint_url); } catch { throw new Error(`${name}: endpoint_url must be a valid URL.`); }
        if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error(`${name}: endpoint_url must use HTTP or HTTPS.`);
        const schema = tool.input_schema ?? { type: 'object', properties: {} };
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error(`${name}: input_schema must be a JSON object.`);
        const timeout = Number(tool.timeout_ms ?? 10000);
        if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000) throw new Error(`${name}: timeout_ms must be an integer between 1 and 120000.`);
        return { name, description: tool.description.trim(), kind: 'webhook', endpoint_url: endpoint.href, timeout_ms: timeout, input_schema: schema };
      });
    } catch (err) {
      setNotice({ kind: 'error', message: `Could not import tools: ${err.message}` });
      return;
    }

    setImporting(true);
    setNotice(null);
    const failures = [];
    let imported = 0;
    
    // Import tools sequentially
    for (const tool of entries) {
      try { 
        await createToolMutation.mutateAsync(tool);
        imported += 1; 
      }
      catch (err) { 
        failures.push(`${tool.name}: ${err.message}`); 
      }
    }
    
    // Refetch the list after import
    await refetch();
    
    setNotice({
      kind: failures.length ? 'error' : 'success',
      message: failures.length
        ? `Imported ${imported} of ${entries.length} tools. ${failures.join(' | ')}`
        : `Imported ${imported} tools successfully.`,
    });
    setImporting(false);
  }

  function remove(tool) {
    if (deletingAll) return;
    if (!window.confirm(`Delete the tool “${tool.name}”?`)) return;
    deleteToolMutation.mutate(tool.id, {
      onSuccess: () => setNotice({ kind: 'success', message: `Deleted ${tool.name}.` }),
      onError: (err) => setNotice({ kind: 'error', message: err.message }),
    });
  }

  async function removeAll() {
    if (!tools.length || deletingAll) return;
    if (!window.confirm(`Delete all ${tools.length} custom tools? This cannot be undone.`)) return;
    setDeletingAll(true);
    setNotice(null);
    try {
      const results = await Promise.allSettled(tools.map((tool) => deleteToolMutation.mutateAsync(tool.id)));
      const deletedIds = new Set();
      const failures = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') deletedIds.add(tools[index].id);
        else failures.push(`${tools[index].name}: ${result.reason?.message || 'Delete failed'}`);
      });
      setNotice(failures.length
        ? { kind: 'error', message: `Deleted ${deletedIds.size} of ${tools.length} tools. ${failures.join(' | ')}` }
        : { kind: 'success', message: `Deleted all ${tools.length} custom tools.` });
    } finally {
      setDeletingAll(false);
    }
  }

  return <div className="tab-content">
    {notice && <div className={`tab-notice ${notice.kind}`} role="status">{notice.message}</div>}
    <section className="tools-panel">
      <div className="tools-panel-header"><div><h3>Custom tools</h3><p className="field-hint">Webhook tools send the agent’s arguments to your endpoint as a JSON POST.</p></div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {tools.length > 0 && <button className="btn danger" type="button" onClick={removeAll} disabled={deletingAll || loading}>{deletingAll ? 'Deleting all…' : 'Delete all'}</button>}
          <label className={`btn g ${importing ? 'disabled' : ''}`} style={{ cursor: importing ? 'wait' : 'pointer' }}>{importing ? 'Importing…' : 'Import JSON'}<input type="file" accept=".json,application/json" onChange={importTools} disabled={importing} style={{ display: 'none' }} /></label>
          <button className="btn p" type="button" onClick={() => { setShowForm((visible) => !visible); setEditingTool(null); }}>{showForm ? 'Cancel' : 'Register Tool'}</button>
        </div>
      </div>
      <details style={{ margin: '0.75rem 0' }}><summary style={{ cursor: 'pointer' }}>JSON import format and template</summary>
        <p className="field-hint">Import either a JSON array or an object containing a <code>tools</code> array. Each entry must define a name, description, webhook endpoint, and optional JSON Schema.</p>
        <pre className="integration-code"><code>{'{ "tools": [{ "name": "get_layout", "kind": "webhook", "description": "Get the current document layout", "endpoint_url": "https://your-app.example.com/tools/get_layout", "timeout_ms": 10000, "input_schema": { "type": "object", "properties": { "document_id": { "type": "string" } }, "required": ["document_id"] } }] }'}</code></pre>
        <a href="/tools-import-template.json" download="tools-import-template.json">Download JSON template</a>
      </details>
      {showForm && <form onSubmit={register} className="tools-form">
        <div><label className="field-label">Tool name</label><input className="key-input" required pattern="[A-Za-z0-9_]+" title="Use letters, numbers, and underscores." value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setTestResult(null); }} placeholder="get_layout" /></div>
        <div><label className="field-label">Type</label><input className="key-input" value="Webhook (HTTP endpoint)" disabled /></div>
        <div className="tools-form-full"><label className="field-label">Description</label><textarea className="key-input" rows={2} required value={form.description} onChange={(e) => { setForm({ ...form, description: e.target.value }); setTestResult(null); }} placeholder="Describe what the tool does and when the agent should call it." /></div>
        <div className="tools-form-full"><label className="field-label">Endpoint URL</label><input className="key-input" type="url" required value={form.endpoint_url} onChange={(e) => { setForm({ ...form, endpoint_url: e.target.value }); setTestResult(null); }} placeholder="https://your-app.example.com/tools/get_layout" /></div>
        <div className="tools-form-full"><label className="field-label">Authorization token (optional)</label><input className="key-input" type="password" autoComplete="new-password" value={form.auth_token} onChange={(e) => { setForm({ ...form, auth_token: e.target.value }); setTestResult(null); }} placeholder={editingTool ? 'Leave blank to keep the saved token' : 'Bearer token sent in the Authorization header'} /><span className="field-hint">The token is sent as the Authorization header when testing and calling this webhook.</span></div>
        <div><label className="field-label">Timeout (milliseconds)</label><input className="key-input" type="number" min="1" max="120000" value={form.timeout_ms} onChange={(e) => { setForm({ ...form, timeout_ms: e.target.value }); setTestResult(null); }} /></div>
        <div className="tools-form-full"><ToolSchemaField value={form.input_schema} onChange={(input_schema) => { setForm({ ...form, input_schema }); setTestResult(null); }} /></div>
        <div className="tools-form-full">
          <label className="field-label">Test arguments (JSON)</label>
          <textarea className="key-input" rows={5} value={testArguments} onChange={(event) => { setTestArguments(event.target.value); setTestResult(null); }} spellCheck="false" />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <button className="btn g small" type="button" onClick={sampleArguments}>Generate sample arguments</button>
            <button className="btn g small" type="button" onClick={testTool} disabled={testing || !form.endpoint_url.trim()}>{testing ? 'Testing endpoint…' : 'Test endpoint and arguments'}</button>
          </div>
          <span className="field-hint">Testing validates arguments against the tool schema, sends a real request to the webhook, then displays its response. Use a safe test endpoint.</span>
          {testResult && <div className={`tab-notice ${testResult.ok ? 'success' : 'error'}`} style={{ marginTop: '0.5rem' }}>
            <strong>{testResult.ok ? 'Test succeeded' : 'Test failed'}</strong>
            <pre className="integration-code" style={{ maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><code>{JSON.stringify(testResult.ok ? { arguments_sent: testResult.arguments_sent, output: testResult.output } : { error: testResult.detail || testResult.error }, null, 2)}</code></pre>
          </div>}
        </div>
        <div className="tools-form-full"><button className="btn p" type="submit" disabled={saving}>{saving ? 'Saving…' : editingTool ? 'Update Tool' : 'Save Tool'}</button></div>
      </form>}
      {loading ? <p>Loading tools…</p> : tools.length === 0 ? <p>No custom tools registered yet.</p> : <div className="tools-list">{tools.map((tool) => <div className="tools-list-item" key={tool.id}><div><strong>{tool.name}</strong><div className="tools-kind">{tool.kind}</div></div><div>{tool.description}</div><div>{tool.endpoint_url || 'Client executed'}</div><button className="btn p" onClick={() => { edit(tool); window.setTimeout(() => document.querySelector('.tools-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); }} disabled={deletingAll}>Test</button><button className="btn g" onClick={() => edit(tool)} disabled={deletingAll}>Edit</button><button className="btn danger" onClick={() => remove(tool)} disabled={deletingAll}>Delete</button></div>)}</div>}
    </section>
  </div>;
}

function KnowledgeTab() {
  // Use React Query hooks for automatic caching
  const { data: kbs = [], isLoading: kbsLoading, error: kbsError, refetch } = useKnowledgeBases();
  const { data: providers = [], isLoading: providersLoading, error: providersError } = useProviders();
  
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
  
  // Mutation hooks
  const createKbMutation = useCreateKnowledgeBase();
  const updateKbMutation = useUpdateKnowledgeBase();
  const deleteKbMutation = useDeleteKnowledgeBase();
  
  const selectedProvider = providers.find((p) => p.id === formData.provider_id);
  const providerModelsQuery = useProviderModels(selectedProvider?.provider_id, {
    enabled: isCreating && Boolean(selectedProvider),
  });
  const embeddingModels = Array.from(new Set([
    ...(providerModelsQuery.data || []).filter((model) => /embed|bge|voyage/i.test(model)),
    formData.embedding_model,
  ].filter(Boolean)));
  const modelsLoading = providerModelsQuery.isLoading || providerModelsQuery.isFetching;

  const isLoading = kbsLoading || providersLoading;
  const loadError = kbsError || providersError;

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
        await updateKbMutation.mutateAsync({ kbId: editingKb.id, payload });
      } else {
        payload.vector_api_key = formData.use_custom_vector_db ? formData.vector_api_key.trim() : null;
        payload.vector_index_host = formData.use_custom_vector_db ? formData.vector_index_host.trim() : null;
        await createKbMutation.mutateAsync(payload);
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
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this knowledge base?')) return;
    try {
      await deleteKbMutation.mutateAsync(id);
      flash('Knowledge base deleted.');
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  if (isLoading) return <div>Loading knowledge bases...</div>;
  if (loadError) return <div>Error loading knowledge bases.</div>;

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
  const [notice, setNotice] = useState(null);
  const [newKey, setNewKey] = useState(null);
  
  // Use React Query hooks for automatic caching
  const { data: apiKeysData, isLoading, error, refetch } = useApiKeys();
  const apiKeys = apiKeysData?.keys || [];
  const createKeyMutation = useCreateApiKey();
  
  const status = !getToken() ? 'anon' : isLoading ? 'loading' : error ? 'error' : 'ready';

  function flash(message, kind = 'success') {
    setNotice({ message, kind });
    window.setTimeout(() => setNotice(null), 4000);
  }

  async function handleGenerateKey() {
    setNewKey(null);
    try {
      const data = await createKeyMutation.mutateAsync();
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
    } catch (err) {
      flash(err.message, 'error');
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
        <a className="btn p" href="/login">Log in</a>
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
        <button className="btn p" onClick={() => refetch()}>Retry</button>
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
          disabled={createKeyMutation.isPending}
        >
          {createKeyMutation.isPending ? 'Generating...' : '+ Generate New API Key'}
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
            disabled={createKeyMutation.isPending}
          >
            {createKeyMutation.isPending ? 'Generating...' : 'Generate API Key'}
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
  const urlParams = new URLSearchParams(window.location.search);
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
