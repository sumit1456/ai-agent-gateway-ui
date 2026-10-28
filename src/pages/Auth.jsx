import { useState } from 'react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import Particles from '../components/Particles';
import { login, register } from '../api';

export default function Auth({ mode = 'register' }) {
  const isLogin = mode === 'login';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [apiKey, setApiKey] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setApiKey('');
    try {
      if (isLogin) {
        const data = await login(email.trim(), password);
        setMessage({
          kind: 'success',
          text: `Logged in as ${data.email}. Use your API key (prefix ${data.api_key_prefix}) to authenticate.`,
        });
      } else {
        const data = await register(email.trim(), password);
        setMessage({ kind: 'success', text: 'Registration successful! Save your API key securely.' });
        setApiKey(data.api_key || '');
      }
      setEmail('');
      setPassword('');
    } catch (err) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Nav showAnchors={false} />

      <section className="hero auth-hero">
        <Particles />
        <div className="wrap">
          <span className="tag">Agent Gateway · Early Access</span>
          <h1>{isLogin ? 'Welcome back' : 'Register your agent'}</h1>
          <p className="sub">
            {isLogin
              ? 'Log in to manage your agents and API keys.'
              : 'Create an account to get started with the Agent Gateway API.'}
          </p>
          <div className="cta">
            <div className="form-container">
              {message && (
                <div className={`message ${message.kind}`} role="status">
                  {message.text}
                </div>
              )}
              <form onSubmit={onSubmit}>
                <div className="form-group">
                  <label htmlFor="email">Email address</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    placeholder={isLogin ? 'Enter your password' : 'Choose a password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="submit-btn" disabled={busy}>
                  {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
                </button>
              </form>

              <p className="auth-switch">
                {isLogin ? (
                  <>
                    Don&apos;t have an account? <a href="/register">Register</a>
                  </>
                ) : (
                  <>
                    Already have an account? <a href="/login">Log in</a>
                  </>
                )}
              </p>

              {apiKey && <div className="api-key-display">API Key: {apiKey}</div>}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
