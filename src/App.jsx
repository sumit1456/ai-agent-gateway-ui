import { useEffect, useState } from 'react';
import './App.css';
import Landing from './pages/Landing';
import Login    from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Nav from './components/Nav';

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (raw.startsWith('/')) return { route: raw, anchor: '' };
  return { route: '/', anchor: raw };
}

function App() {
  const [route, setRoute] = useState(() => parseHash().route);
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState(null);

  // Check session storage on mount
  useEffect(() => {
    const stored = window.sessionStorage.getItem('agentgateway_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setLoggedIn(true);
        // If logged in and on auth pages, redirect to home
        if (route === '/login' || route === '/register') {
          window.location.hash = '#/';
        }
      } catch (e) {
        console.error('Failed to parse session user', e);
        window.sessionStorage.clear();
      }
    }
  }, []); // Only check on mount - don't override user's navigation to dashboard etc.

  useEffect(() => {
    document.documentElement.classList.add('js');

    const onHashChange = () => {
      const { route: next, anchor } = parseHash();
      setRoute(next);
      if (anchor) {
        window.setTimeout(() => {
          const el = document.getElementById(anchor);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 0);
      } else {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setLoggedIn(true);
    window.sessionStorage.setItem('agentgateway_user', JSON.stringify(userData));
    // Optionally redirect to home after login
    if (route !== '/') {
      window.location.hash = '#/';
    }
  };

  const handleLogout = () => {
    setUser(null);
    setLoggedIn(false);
    window.sessionStorage.clear();
    // Redirect to home after logout
    window.location.hash = '#/';
  };

  return (
    <>
      {/* Show the global nav on all pages */}
      <Nav loggedIn={loggedIn} user={user} onLogin={handleLogin} onLogout={handleLogout} />

      {route.startsWith('/dashboard') ? (
        <Dashboard loggedIn={loggedIn} user={user} onLogout={handleLogout} />
      ) : route.startsWith('/register') ? (
        <Register loggedIn={loggedIn} user={user} onLogin={handleLogin} />
      ) : route.startsWith('/login') ? (
        <Login loggedIn={loggedIn} user={user} onLogin={handleLogin} />
      ) : (
        <Landing />
      )}
    </>
  );
}

export default App;
