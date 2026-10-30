export default function Nav({ loggedIn, user, onLogin, onLogout }) {
  return (
    <nav className="global-nav">
      <div className="wrap">
        <a className="logo" href="/">
          <i />
          Horizon
        </a>
        <div className="links">
          <a href="/">Home</a>
          <a href="/how-it-works">How it works</a>
          <a href="/features">Features</a>
          <a href="/integration-guide">Integration guide</a>
          <a href="/#api">API</a>
          {loggedIn ? (
            <>
              <a href="/dashboard">Dashboard</a>
              <a href="/" onClick={onLogout} className="btn g">
                Log out
              </a>
            </>
          ) : (
            <>
              <a href="/login">Log in</a>
              <a className="btn g" href="/register">
                Get access
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
