import Footer from '../components/Footer';
import './Features.css';

const FEATURES = [
  {
    number: '01',
    title: 'Configure model providers',
    description: 'Connect supported model providers, add credentials, choose available models, and set a default model for your agents.',
    area: 'Providers',
  },
  {
    number: '02',
    title: 'Create agents for your use case',
    description: 'Give each agent its own instructions, execution mode, model configuration, token limits, and attached knowledge bases.',
    area: 'Agents',
  },
  {
    number: '03',
    title: 'Build multi-step workflows',
    description: 'Create workflows from presets or define steps with roles, instructions, input mappings, output formats, assigned tools, and retry limits.',
    area: 'Workflows',
  },
  {
    number: '04',
    title: 'Extend agents with tools',
    description: 'Use gateway built-in tools or register custom tools and webhook endpoints. Test custom tool calls and select which tools each workflow step can use.',
    area: 'Tools',
  },
  {
    number: '05',
    title: 'Ground answers with knowledge',
    description: 'Configure knowledge bases with embedding models and connect a Pinecone vector database when you want vectors to stay in your account.',
    area: 'Knowledge bases',
  },
  {
    number: '06',
    title: 'Integrate through the API',
    description: 'Generate gateway API keys and call agent run endpoints from your backend. The integration guide includes React, Node.js, and Python examples, with guidance for keeping credentials server-side.',
    area: 'API keys · Integration guide',
  },
  {
    number: '07',
    title: 'Stream and inspect runs',
    description: 'Follow run progress with server-sent events, then inspect status, token use, duration, workflow transitions, and each step’s inputs, outputs, and errors in the Runs dashboard.',
    area: 'Runs',
  },
];

export default function Features() {
  return (
    <main className="features-page">
      <header className="features-hero">
        <div className="wrap">
          <span className="eyebrow">Platform features</span>
          <h1>The tools to configure, run, and understand your agents.</h1>
          <p className="lead">Manage providers, agents, workflows, tools, and run visibility from one dashboard, then connect your application through the gateway API.</p>
        </div>
      </header>

      <section className="features-list-section">
        <div className="wrap">
          <div className="features-list">
            {FEATURES.map((feature) => (
              <article className="features-card card" key={feature.number}>
                <span className="num">{feature.number}</span>
                <div>
                  <h2>{feature.title}</h2>
                  <p>{feature.description}</p>
                  <span className="features-area">{feature.area}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="features-cta">
        <div className="wrap">
          <h2>See the workflow from setup through execution.</h2>
          <p className="lead">Learn how the dashboard pieces fit together on the How it works page.</p>
          <a className="btn p" href="/how-it-works">How it works</a>
        </div>
      </section>
      <Footer />
    </main>
  );
}
