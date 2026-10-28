import Footer from '../components/Footer';
import './HowItWorks.css';

const SETUP_STEPS = [
  {
    number: '01',
    title: 'Connect a model provider',
    description: 'Add a provider in the dashboard, save its API credentials, and choose the models your agents can use. Provider settings supply the model configuration for agent runs.',
    detail: 'Providers',
  },
  {
    number: '02',
    title: 'Give your agent its capabilities',
    description: 'Create an agent with a name, model provider, and execution mode. Add instructions, select registered tools, and attach knowledge bases when the agent needs grounded information.',
    detail: 'Agents · Tools · Knowledge bases',
  },
  {
    number: '03',
    title: 'Shape the workflow',
    description: 'Use a single agent for a direct request, or define a workflow with planner, executor, reviewer, and other role-based steps. Map JSON inputs between steps and specify the output each step must return.',
    detail: 'Workflows',
  },
  {
    number: '04',
    title: 'Connect your application',
    description: 'Create an API key and call the agent run endpoint from your backend. Keep gateway credentials server-side, pass request data as input, and use a session ID to group turns in a conversation.',
    detail: 'API keys · Integration guide',
  },
  {
    number: '05',
    title: 'Follow every run',
    description: 'Subscribe to the authenticated server-sent event stream for live step updates and the final result. The Runs view lets you inspect status, timing, token use, workflow transitions, and each step’s input and output.',
    detail: 'Runs',
  },
];

const CAPABILITIES = [
  ['Tools that fit your stack', 'Register custom tools and webhooks alongside gateway-provided tools. Each workflow step can be assigned the tools it needs.'],
  ['Context from your data', 'Connect a knowledge base to an agent so requests can use retrieved information from your configured vector database.'],
  ['Runs you can understand', 'Review step-by-step execution details, failures, outputs, token usage, and duration from the dashboard.'],
];

export default function HowItWorks() {
  return (
    <main className="how-page">
      <header className="how-hero">
        <div className="wrap">
          <span className="eyebrow">How it works</span>
          <h1>From model setup to an observable agent run.</h1>
          <p className="lead">AI Agent Gateway brings model configuration, tools, workflow orchestration, and run visibility together behind one API.</p>
          <a className="btn p" href="/register">Get started <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      <section className="how-steps-section">
        <div className="wrap">
          <div className="how-section-heading">
            <span className="eyebrow">The dashboard workflow</span>
            <h2>Build it, connect it, inspect it.</h2>
            <p className="lead">Each stage maps to a section you can manage in the dashboard.</p>
          </div>
          <div className="how-steps">
            {SETUP_STEPS.map((step) => (
              <article className="how-step card" key={step.number}>
                <span className="num">{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                  <span className="how-step-detail">{step.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="how-capabilities-section">
        <div className="wrap">
          <span className="eyebrow">What the gateway handles</span>
          <h2>One place for the moving parts.</h2>
          <div className="grid g3 how-capabilities">
            {CAPABILITIES.map(([title, description]) => (
              <article className="card" key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="how-cta-section">
        <div className="wrap">
          <span className="eyebrow">Ready to build?</span>
          <h2>Start with an agent. Add the workflow as you grow.</h2>
          <p className="lead">Configure a provider, create an agent, and try a run from the dashboard.</p>
          <a className="btn p" href="/register">Get access</a>
        </div>
      </section>
      <Footer />
    </main>
  );
}
