import BlackholeGargantua from '../components/BlackholeGargantua';
import BlackHoleParticleField from '../components/BlackHoleParticleField';
import Footer from '../components/Footer';
import Reveal from '../components/Reveal';


const API_LINES = [
  [{ t: 'c', v: '// 1. create an agent' }],
  [{ t: 'k', v: 'POST' }, { v: ' /v1/agents' }],
  [{ v: '{' }],
  [
    { v: '  ' },
    { t: 's', v: '"name"' },
    { v: ': ' },
    { t: 's', v: '"pdf-editor"' },
    { v: ',' },
  ],
  [
    { v: '  ' },
    { t: 's', v: '"template"' },
    { v: ': ' },
    { t: 's', v: '"document-editing"' },
    { v: ',' },
  ],
  [
    { v: '  ' },
    { t: 's', v: '"prompt_config"' },
    { v: ': ' },
    { t: 's', v: '"Edit PDFs. Be concise."' },
    { v: ',' },
  ],
  [
    { v: '  ' },
    { t: 's', v: '"tools"' },
    { v: ': [' },
    { t: 's', v: '"gateway.ocr"' },
    { v: ', ' },
    { t: 's', v: '"my_app.save_file"' },
    { v: ']' },
  ],
  [{ v: '}' }],
  [{ v: '' }],
  [{ t: 'c', v: '// 2. run it' }],
  [{ t: 'k', v: 'POST' }, { v: ' /v1/agents/pdf-editor/run' }],
  [{ v: '{ ' }, { t: 's', v: '"input"' }, { v: ': ' }, { t: 's', v: '"Merge pages 2-4 and rotate"' }, { v: ' }' }],
];

const RUN_STAGES = [
  { num: "01", title: "Send a request", text: "Your application sends input to an agent through the gateway API, with session context for the conversation." },
  { num: "02", title: "Orchestrate the work", text: "The gateway runs the configured agent or workflow, routes work between steps, and gives each step its assigned tools." },
  { num: "03", title: "Follow the result", text: "Stream step progress and the final result, then inspect inputs, outputs, timing, and token usage in Runs." },
];

export default function Landing() {
  return (
    <>
      <header className="hero">
        <BlackholeGargantua
          className="hero-blackhole"
        />
        <div className="wrap hero-layout">
          <div className="hero-copy">
            <span className="tag"><i /> Agent Gateway <b>·</b> Early Access</span>
            <h1>
              Send your agents <span>past the event horizon.</span>
            </h1>
            <p className="sub">
              One API for agent workflows, tools, and run visibility. Bring your models and product logic;
              let the gateway handle orchestration.
            </p>
            <div className="cta">
              <a className="btn p" href="/register">
                Get early access <span aria-hidden="true">↗</span>
              </a>
              <a className="btn g" href="#api">
                Explore the API
              </a>
            </div>
            <div className="hero-capabilities" aria-label="Gateway capabilities">
              <span><i /> Workflow control</span>
              <span><i /> Your tools and models</span>
              <span><i /> Inspectable runs</span>
            </div>
          </div>
          <div className="hero-art-label"><span className="hero-art-dot" /> ORCHESTRATION, IN MOTION</div>
          <a className="hero-scroll" href="#how"><span /> Scroll to explore</a>
        </div>
      </header>

      <section id="run-lifecycle">
        <div className="wrap">
          <Reveal>
            <span className="eyebrow">Inside a run</span>
            <h2>From request to result, with every step in view.</h2>
            <p className="lead">
              Your app sends the task. The gateway manages execution and returns progress you can follow.
            </p>
          </Reveal>
          <BlackHoleParticleField className="section-blackhole" />
          <div className="grid g3">
            {RUN_STAGES.map((s) => (
              <Reveal className="card" key={s.num}>
                <span className="num">{s.num}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="api">
        <div className="wrap split">
          <Reveal>
            <span className="eyebrow">Developer API</span>
            <h2>One endpoint. Whole agent.</h2>
            <p className="lead" style={{ marginBottom: 0 }}>
              Define the agent once, then talk to it from anywhere in your stack.
            </p>
            <ul className="checks">
              <li>Your tools + our tools in one config</li>
              <li>Initial prompt config per agent</li>
              <li>Pipeline handled server-side</li>
            </ul>
          </Reveal>
          <BlackHoleParticleField className="section-blackhole" />
          <Reveal className="code">
            <div className="bar">
              <b />
              <b />
              <b />
            </div>
            <pre>
              {API_LINES.map((line, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <span key={i}>
                  {line.map((tok, j) =>
                    tok.t ? (
                      // eslint-disable-next-line react/no-array-index-key
                      <span key={j} className={tok.t}>
                        {tok.v}
                      </span>
                    ) : (
                      tok.v
                    )
                  )}
                  {'\n'}
                </span>
              ))}
            </pre>
          </Reveal>
        </div>
      </section>

      <section className="final" id="join">
        <div className="wrap">
          <Reveal>
            <h2>Ready to cross the horizon?</h2>
            <p>Join the early access list and build your first agent on the gateway.</p>
            <a className="btn p" href="/register">
              Request access
            </a>
          </Reveal>
        </div>
      </section>

      <Footer />
    </>
  );
}
