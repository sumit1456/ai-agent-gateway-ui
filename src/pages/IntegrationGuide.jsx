import Footer from '../components/Footer';
import './IntegrationGuide.css';

const requestExample = `{
  "input": "What is in this picture?",
  "images": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...complete-base64-data..."
  ],
  "external_session_id": "conversation-123"
}`;

const modelMessageExample = `[
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "What is in this picture?" },
      {
        "type": "image_url",
        "image_url": {
          "url": "data:image/jpeg;base64,<complete-base64-data>"
        }
      }
    ]
  }
]`;

const backendExample = [
  "const response = await fetch(`${GATEWAY_URL}/v1/agents/${AGENT_ID}/run`,",
  "  {",
  "    method: 'POST',",
  "    headers: {",
  "      Authorization: `Bearer ${process.env.AGENT_GATEWAY_TOKEN}`,",
  "      'Content-Type': 'application/json',",
  "      'X-End-User-ID': verifiedUserId,",
  "    },",
  "    body: JSON.stringify({",
  "      input: 'What is in this picture?',",
  "      images: [imageDataUrl],",
  "      external_session_id: 'conversation-123',",
  "    }),",
  "  },",
  ");",
  "const run = await response.json(); // 202 Accepted; subscribe to its run stream",
].join(String.fromCharCode(10));

function Code({ children }) {
  return <pre className="integration-guide-code"><code>{children}</code></pre>;
}

export default function IntegrationGuide() {
  return (
    <main className="integration-guide-page">
      <header className="integration-guide-hero">
        <div className="wrap">
          <span className="eyebrow">Developer guide</span>
          <h1>Connect your app to an agent.</h1>
          <p className="lead">Send text, images, and conversation identity to the gateway from your backend. Read the final answer and live progress through the run API.</p>
          <a className="btn p" href="#image-input">Image request format</a>
        </div>
      </header>

      <div className="wrap integration-guide-layout">
        <aside className="integration-guide-toc" aria-label="Guide contents">
          <strong>On this page</strong>
          <a href="#request">Start a run</a>
          <a href="#image-input">Send an image</a>
          <a href="#model-format">What the model receives</a>
          <a href="#response">Read the result</a>
          <a href="#security">Security and limits</a>
        </aside>

        <article className="integration-guide-content">
          <section id="request">
            <span className="eyebrow">01 · Request</span>
            <h2>Start a run from your backend</h2>
            <p>Call <code>POST /v1/agents/{'{agent_id}'}/run</code> with your gateway API key. Keep that key on your server. Set <code>X-End-User-ID</code> from the authenticated user in your application, and reuse an <code>external_session_id</code> to continue a conversation.</p>
            <Code>{`POST {GATEWAY_URL}/v1/agents/{AGENT_ID}/run
Authorization: Bearer {AGENT_GATEWAY_TOKEN}
X-End-User-ID: {VERIFIED_USER_ID}
Content-Type: application/json`}</Code>
          </section>

          <section id="image-input">
            <span className="eyebrow">02 · Text and image</span>
            <h2>Send the image in the request</h2>
            <p>Send the user’s prompt in <code>input</code> and one or more full image URLs or base64 data URLs in the top-level <code>images</code> array. The example abbreviates the base64 bytes; replace it with the entire data URL produced from the selected image.</p>
            <Code>{requestExample}</Code>
            <p>In a browser, read the selected file as a data URL, then send that string to your own backend with the prompt. Your backend forwards it to the gateway together with its gateway token. The dashboard playground already performs this conversion when you choose an image.</p>
            <Code>{`const imageDataUrl = await new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// Send { message, image: imageDataUrl } to your authenticated app backend.`}</Code>
            <p>Example backend request:</p>
            <Code>{backendExample}</Code>
          </section>

          <section id="model-format">
            <span className="eyebrow">03 · Model message</span>
            <h2>The gateway builds the multimodal message</h2>
            <p>Your application sends JSON with an <code>images</code> array. The gateway converts it to a text and image content message for the configured chat model. You do not call the model endpoint or manually build its provider-specific payload; LangChain and the provider integration serialize the message for that API.</p>
            <Code>{modelMessageExample}</Code>
            <p>The selected model must support image input. The gateway forwards images to the model but does not currently detect vision capability in advance, so a text-only model may reject the request.</p>
          </section>

          <section id="response">
            <span className="eyebrow">04 · Result</span>
            <h2>Follow the run to completion</h2>
            <p>The start endpoint returns <code>202 Accepted</code> with a <code>run_id</code>. Your backend can subscribe to the authenticated server-sent event stream using the same gateway token:</p>
            <Code>{`GET {GATEWAY_URL}/v1/runs/{RUN_ID}/stream
Authorization: Bearer {AGENT_GATEWAY_TOKEN}
Accept: text/event-stream`}</Code>
            <p>Relay events to your frontend over your own authenticated backend connection. If streaming is unavailable, poll <code>GET /v1/runs/{'{run_id}'}</code> until the run is complete.</p>
          </section>

          <section id="security">
            <span className="eyebrow">05 · Limits and safety</span>
            <h2>Keep credentials and inputs controlled</h2>
            <ul>
              <li>Up to 4 images per request; each image can be up to 5 MB.</li>
              <li>Accepted image types: PNG, JPEG, WEBP, and GIF.</li>
              <li>Use an HTTPS URL or a base64 data URL. Remote URLs must be accessible to the model provider.</li>
              <li>Only vision-capable models can interpret images; support depends on the specific model and provider.</li>
              <li>Image bytes are held for the run and omitted from detailed traces; run history records that images were attached, not their bytes.</li>
              <li>PDF and document extraction are not part of image input.</li>
              <li>Keep the gateway token server-side, authorize run access in your backend, and derive end-user identity from trusted authentication.</li>
            </ul>
          </section>
          <p className="integration-guide-download"><a href="/guide.md" download="agent-gateway-integration-guide.md">Download the full integration guide as Markdown</a></p>
        </article>
      </div>
      <Footer />
    </main>
  );
}
