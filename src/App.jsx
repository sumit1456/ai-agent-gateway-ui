import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import './App.css';
import Landing from './pages/Landing';
import Login    from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Nav from './components/Nav';
import { useAuthUser } from './hooks/useAuth';

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (raw.startsWith('/')) return { route: raw, anchor: '' };
  return { route: '/', anchor: raw };
}

function App() {
  const [route, setRoute] = useState(() => parseHash().route);
  const { data: user, isLoading: authLoading } = useAuthUser();
  const queryClient = useQueryClient();
  const loggedIn = !!user;

  // Redirect authenticated users away from auth pages
  useEffect(() => {
    if (loggedIn && (route === '/login' || route === '/register')) {
      window.location.hash = '#/';
    }
  }, [loggedIn, route]);

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

  const handleLogout = async () => {
    // Clear session storage
    window.sessionStorage.removeItem('agentgateway_user');
    // Clear all queries from cache
    await queryClient.invalidateQueries();
    queryClient.clear();
    // Redirect to home
    window.location.hash = '#/';
  };

  // Show loading state while checking auth
  if (authLoading) {
    return <div className="auth-loading">Loading...</div>;
  }

  return (
    <>
      {/* Show the global nav on all pages */}
      <Nav loggedIn={loggedIn} user={user} onLogout={handleLogout} />

      {route.startsWith('/dashboard') ? (
        <Dashboard loggedIn={loggedIn} user={user} onLogout={handleLogout} />
      ) : route.startsWith('/register') ? (
        <Register loggedIn={loggedIn} user={user} />
      ) : route.startsWith('/login') ? (
        <Login loggedIn={loggedIn} user={user} />
      ) : (
        <Landing />
      )}
    </>
  );
}

export default App;
