import { useState } from 'react';
import Footer from '../components/Footer';
import Particles from '../components/Particles';
import { register } from '../api';
import './Register.css';

export default function Register({ loggedIn, user, onLogin }) {
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    organization: '',
    password: '',
    confirmPassword: '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setMessage({ kind: 'error', text: 'Passwords do not match.' });
      return;
    }
    setBusy(true);
    setMessage(null);

    try {
      const data = await register({
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        organization: form.organization.trim() || null,
        password: form.password,
      });
      setMessage({ kind: 'success', text: 'Account created! Redirecting to login...' });
      setForm({ name: '', username: '', email: '', organization: '', password: '', confirmPassword: '' });
      // Redirect to login page
      setTimeout(() => {
        window.location.hash = '#/login';
      }, 1500);
    } catch (err) {
      setMessage({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: select the text */
    }
  }

  return (
    <>
      <section className="auth-page reg-page">
        <Particles />

        <div className="auth-card reg-card">
          {/* Header */}
          <div className="auth-header">
            <span className="auth-tag">Agent Gateway · Early Access</span>
            <h1 className="auth-title">Create your account</h1>
            <p className="auth-sub">Get started with the Agent Gateway API in minutes.</p>
          </div>

          {/* Message banner */}
          {message && (
            <div className={`auth-message ${message.kind}`} role="status">
              {message.kind === 'success' ? '✓' : '⚠'} {message.text}
            </div>
          )}

          {/* Form */}
          <form className="auth-form" onSubmit={onSubmit} noValidate>
            {/* Row 1: Name + Username */}
            <div className="field-row">
              <div className="field">
                <label htmlFor="reg-name">Full name</label>
                <input
                  id="reg-name"
                  type="text"
                  name="name"
                  required
                  autoComplete="name"
                  placeholder="Jane Smith"
                  value={form.name}
                  onChange={set('name')}
                />
              </div>
              <div className="field">
                <label htmlFor="reg-username">Username</label>
                <input
                  id="reg-username"
                  type="text"
                  name="username"
                  required
                  autoComplete="username"
                  placeholder="janesmith"
                  value={form.username}
                  onChange={set('username')}
                />
              </div>
            </div>

            {/* Email */}
            <div className="field">
              <label htmlFor="reg-email">Email address</label>
              <input
                id="reg-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="jane@example.com"
                value={form.email}
                onChange={set('email')}
              />
            </div>

            {/* Organization (optional) */}
            <div className="field">
              <label htmlFor="reg-org">
                Organization
                <span className="optional-badge">optional</span>
              </label>
              <input
                id="reg-org"
                type="text"
                name="organization"
                autoComplete="organization"
                placeholder="Acme Corp"
                value={form.organization}
                onChange={set('organization')}
              />
            </div>

            {/* Row 2: Password + Confirm */}
            <div className="field-row">
              <div className="field">
                <label htmlFor="reg-password">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  name="password"
                  required
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  minLength={8}
                  value={form.password}
                  onChange={set('password')}
                />
              </div>
              <div className="field">
                <label htmlFor="reg-confirm">Confirm password</label>
                <input
                  id="reg-confirm"
                  type="password"
                  name="confirmPassword"
                  required
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={set('confirmPassword')}
                />
              </div>
            </div>

            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? <span className="btn-spinner" /> : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account?{' '}
            <a href="#/login">Log in</a>
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
}