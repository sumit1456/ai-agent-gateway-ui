import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import './App.css';
import Landing from './pages/Landing';
import Login    from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import HowItWorks from './pages/HowItWorks';
import Features from './pages/Features';
import Nav from './components/Nav';
import { useAuthUser } from './hooks/useAuth';

function parseLocation() {
  const route = window.location.pathname || '/';
  const anchor = window.location.hash.replace(/^#/, '');
  return { route, anchor: anchor.startsWith('/') ? '' : anchor };
}

function App() {
  const [route, setRoute] = useState(() => parseLocation().route);
  const { data: user, isLoading: authLoading } = useAuthUser();
  const queryClient = useQueryClient();
  const loggedIn = !!user;

  // Redirect authenticated users away from auth pages
  useEffect(() => {
    if (loggedIn && (route === '/login' || route === '/register')) {
      window.location.assign('/');
    }
  }, [loggedIn, route]);

  useEffect(() => {
    document.documentElement.classList.add('js');

    const onLocationChange = () => {
      const { route: next, anchor } = parseLocation();
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

    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('hashchange', onLocationChange);
    return () => {
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('hashchange', onLocationChange);
    };
  }, []);

  const handleLogout = async () => {
    // Clear session storage
    window.sessionStorage.removeItem('agentgateway_user');
    // Clear all queries from cache
    await queryClient.invalidateQueries();
    queryClient.clear();
    // Redirect to home
    window.location.assign('/');
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
      ) : route.startsWith('/how-it-works') ? (
        <HowItWorks />
      ) : route.startsWith('/features') ? (
        <Features />
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
