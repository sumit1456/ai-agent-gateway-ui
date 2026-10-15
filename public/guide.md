# Agent Gateway Integration Guide

This guide explains how a caller starts an agent run, provides request data and conversation identity, receives the run result on its backend, and relays updates to its frontend.

## Request flow

```text
Caller frontend
  -> Caller backend: application JSON + caller's normal user authentication
  -> Agent Gateway: POST /v1/agents/{agent_id}/run (JSON + gateway auth + end-user identity)
  <- Agent Gateway: 202 Accepted with run_id and gateway session_id
  -> Caller backend: GET /v1/runs/{run_id}/stream (SSE, gateway auth)
  <- Agent Gateway: progress events and terminal result
  -> Caller frontend: caller backend relays SSE using its own user authentication
```

The browser should call your backend. Keep the gateway API token on the server; never embed it in browser code.

## Start a run

Send a JSON object to:

```http
POST {GATEWAY_URL}/v1/agents/{AGENT_ID}/run
Authorization: Bearer {AGENT_GATEWAY_TOKEN}
X-End-User-ID: {VERIFIED_CALLER_USER_ID}
Content-Type: application/json
```

Example body:

```json
{
  "input": {
    "message": "Summarize this document",
    "documentId": "doc-456",
    "sessionId": "conversation-789",
    "preferences": { "style": "brief" }
  },
  "external_session_id": "conversation-789",
  "variables": { "locale": "en" }
}
```

### Request fields and identity metadata

| Field | Where it goes | Purpose |
| --- | --- | --- |
| `input` | JSON body | The caller's request data. Prefer an object so workflows can use its fields. A plain string is also accepted. The gateway passes this value to the workflow as its request input. |
| `external_session_id` | JSON body; `X-Session-ID` header is also supported | Caller-owned conversation key. Reuse the same value for every turn in one conversation. This lets the gateway find the same internal session and conversation history. |
| `X-End-User-ID` | HTTP header | Stable ID of the authenticated end user in your application. Set it in your backend from verified authentication, not from an untrusted browser field. The gateway scopes sessions by agent, end-user ID, and external session ID. |
| `variables` | JSON body | Optional agent template/context variables. Keep these separate from the caller's main request object in `input`. |

`external_session_id` is not the gateway's internal `session_id`. The gateway creates its own session and returns that ID in the start response. Keep using your stable external ID on later requests; you usually do not need to send the internal ID back.

If you omit `external_session_id`, requests for the same agent and end user use the gateway's default session. Supply different external IDs for separate conversations. Always set `X-End-User-ID` in a multi-user integration so users do not share the same default session.

### Accepted input forms

Object input (recommended):

```json
{ "input": { "message": "Find the invoice total", "invoiceId": "inv-42" } }
```

String input:

```json
{ "input": "Find the invoice total for invoice inv-42" }
```

When your app receives a body such as `{ "message": "...", "documentId": "..." }`, forward the complete body as `input`; do not extract only `message` unless that is intentional. Put the session key in the separate `external_session_id` field as well. The gateway preserves object input for workflow steps and stores a JSON representation in run/history records.

### Start response

The start endpoint returns immediately with HTTP `202 Accepted`; it does not wait for the agent's final answer.

```json
{
  "run_id": "...",
  "session_id": "...",
  "status": "running",
  "message": "Run accepted. Subscribe to the authenticated run event stream for progress and the result."
}
```

Keep `run_id` on your backend. Use it to open the run event stream and to query the polling endpoint if needed.

## Stream the result to your backend with SSE

After starting the run, your backend opens:

```http
GET {GATEWAY_URL}/v1/runs/{RUN_ID}/stream
Authorization: Bearer {AGENT_GATEWAY_TOKEN}
Accept: text/event-stream
```

Use the same gateway token that started the run. The stream is authenticated and checks that the run belongs to the gateway account. Redis must be configured and reachable for SSE. If streaming is unavailable, poll `GET {GATEWAY_URL}/v1/runs/{RUN_ID}` until the status is terminal.

An SSE message is separated by a blank line. It can contain an event name, an optional replay ID, and JSON data:

```text
id: 1740000000000-0
event: workflow_step_completed
data: {"node_id":"answer","output":{"response":"..."}}

```

Events can include:

| Event | Meaning |
| --- | --- |
| `connected` | Stream opened; includes the run ID and current status. |
| `progress_snapshot` | Current run status and a snapshot of available steps. |
| `workflow_step_started` / `workflow_step_completed` / `workflow_step_failed` | Workflow step lifecycle and output or error. |
| `answer.delta` | An incremental answer text chunk when the active model path streams answer tokens. |
| `run_completed` | Terminal success; includes status and result. |
| `run_failed` | Terminal failure; includes status and failure details. |
| `timeout` / `error` | Stream-level timeout or error. Reconnect or use polling to determine final run status. |

Treat `event.data` as JSON. Do not assume every run emits `answer.delta`; some workflow steps return their output only when the step completes. Stop consuming once `run_completed` or `run_failed` arrives.

The gateway supports event replay using the `Last-Event-ID` request header. If your backend reconnects upstream, forward the last received SSE ID so the gateway can continue after that event. The initial `connected` and `progress_snapshot` messages may not have an event ID.

## Relay updates from your backend to your frontend

The frontend should not connect directly to the gateway because the gateway token must remain secret. Instead:

1. Frontend posts the caller's input to your authenticated backend.
2. Backend authenticates the caller and starts the gateway run.
3. Backend returns the `run_id` to the frontend.
4. Frontend opens an SSE connection to your backend, for example `/api/runs/{run_id}/stream`.
5. Backend verifies the caller may access that run, opens the authenticated gateway SSE stream, and forwards each SSE frame without buffering.
6. Frontend handles progress events and renders the final result on `run_completed`.

Native browser `EventSource` does not let you set an arbitrary `Authorization` header. A same-origin backend SSE route authenticated by your normal secure cookie/session is a good fit. If you use `fetch` streaming instead, authenticate it with your app's normal session mechanism and parse SSE frames incrementally.

### Backend relay sketch (Node.js)

This shows the relay shape; adapt authentication, run ownership checks, error handling, and cancellation to your server framework:

```js
app.get('/api/runs/:runId/stream', requireYourUserAuth, async (req, res) => {
  // Check that this authenticated caller is allowed to view req.params.runId.
  const upstream = await fetch(
    `${GATEWAY_URL}/v1/runs/${encodeURIComponent(req.params.runId)}/stream`,
    {
      headers: {
        Authorization: `Bearer ${process.env.AGENT_GATEWAY_TOKEN}`,
        Accept: 'text/event-stream',
        ...(req.get('Last-Event-ID')
          ? { 'Last-Event-ID': req.get('Last-Event-ID') }
          : {}),
      },
      signal: AbortSignal.timeout(5 * 60 * 1000),
    },
  );

  if (!upstream.ok || !upstream.body) {
    return res.status(upstream.status || 502).end();
  }

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  try {
    for await (const chunk of upstream.body) {
      if (res.destroyed) break;
      if (!res.write(Buffer.from(chunk))) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
  } finally {
    res.end();
  }
});
```

The run-creation route should return only the accepted run metadata to the frontend, for example `{ "runId": "...", "sessionId": "...", "status": "running" }`. Do not send the gateway token to the browser.

### Frontend relay sketch

```js
const events = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`);

events.addEventListener('workflow_step_completed', (event) => {
  const data = JSON.parse(event.data);
  renderStep(data.node_id, data.output);
});

events.addEventListener('answer.delta', (event) => {
  const data = JSON.parse(event.data);
  appendAnswerChunk(data.text ?? data);
});

events.addEventListener('run_completed', (event) => {
  const data = JSON.parse(event.data);
  renderFinalResult(data.output ?? data.result);
  events.close();
});

events.addEventListener('run_failed', (event) => {
  const data = JSON.parse(event.data);
  showRunError(data.error || data.result);
  events.close();
});

events.onerror = () => {
  // EventSource reconnects automatically. Close it when your own run state
  // endpoint confirms the run is done or failed.
};
```

`EventSource` reconnects automatically, but it cannot attach `Last-Event-ID` manually when opening a new instance. The browser sends its last event ID on automatic reconnects to the same connection. For a new connection or a custom reconnect flow, use a fetch-based SSE client if you need to set the replay header yourself.

## Security and reliability notes

- Store the gateway token in a backend secret manager or environment variable.
- Derive `X-End-User-ID` from verified app authentication. Never trust a browser-provided identity value.
- Authorize access to a run in your own backend before relaying its stream to a frontend caller.
- Use a stable `external_session_id` per conversation, and a distinct one for each separate conversation belonging to the same user and agent.
- Do not expose another user's session ID or run ID as authorization. IDs are identifiers; access still needs authentication and authorization.
- Set SSE proxy timeouts and buffering configuration so the stream remains open and frames are delivered as they arrive.
- If SSE cannot connect, poll `GET /v1/runs/{run_id}`. The run detail response contains status, result, and workflow step information.

## Minimal end-to-end checklist

1. Configure the agent and select a workflow.
2. Register tools and assign the needed tools to workflow steps.
3. Caller frontend sends its request object and session key to your backend.
4. Caller backend verifies the user, adds `X-End-User-ID`, gateway bearer auth, and `external_session_id`, then posts to the agent run endpoint.
5. Save the returned `run_id`; use it to open the gateway SSE stream from your backend.
6. Relay SSE through a caller-authenticated backend route; render step progress and the terminal result in the frontend.
