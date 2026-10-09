import { useState } from 'react';
import Footer from '../components/Footer';
import Particles from '../components/Particles';
import { login } from '../api';
import './Login.css';

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [message, setMessage]   = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const data = await login(email.trim(), password);
      // Store user data (with API key if provided)
      onLogin(data);
      
      const msg = data.is_new_key 
        ? 'Logged in successfully. Your first API key has been created.' 
        : 'Logged in successfully. A new session key has been generated.';
      
      setMessage({
        kind: 'success',
        text: msg,
      });
      setEmail('');
      setPassword('');
      setTimeout(() => {
        window.location.hash = '#/dashboard';
      }, 800);
    } catch (err) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="auth-page">
        <Particles />

        <div className="auth-card">
          <div className="auth-header">
            <span className="auth-tag">Agent Gateway · Early Access</span>
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-sub">Log in to manage your agents and API keys.</p>
          </div>

          {message && (
            <div className={`auth-message ${message.kind}`} role="status">
              {message.kind === 'success' ? '✓' : '⚠'} {message.text}
            </div>
          )}

          <form className="auth-form" onSubmit={onSubmit} noValidate>
            <div className="field">
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="login-password">
                Password
                <a className="forgot-link" href="#/forgot">Forgot?</a>
              </label>
              <input
                id="login-password"
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? <span className="btn-spinner" /> : 'Log in'}
            </button>
          </form>

          <p className="auth-switch">
            Don&apos;t have an account?{' '}
            <a href="#/register">Create one</a>
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
}
