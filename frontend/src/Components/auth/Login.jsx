import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './Login.css';

export const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, guestLogin, user, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Always redirect to home page after login instead of previous location
  const redirectTo = '/';

  useEffect(() => {
    if (location.state?.message) {
      setSuccess(location.state.message);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Add effect to handle authenticated users - redirect only real authenticated users
  useEffect(() => {
    if (user && !user.isGuest && !authLoading) {
      console.log('Login: Authenticated user detected, redirecting to home');
      navigate(redirectTo, { replace: true });
    }
  }, [user, authLoading, navigate, redirectTo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(username, password);
      // Navigation will be handled by the useEffect above
    } catch (err) {
      console.error('Login error:', err?.response?.data || err.message);
      setError(
        err.response?.data?.detail || 
        'Failed to login. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = () => {
    try {
      // First logout any existing user to clear auth state
      logout(false); // Pass false to prevent redirect from logout
      
      // Then set up guest mode
      guestLogin();
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Guest login error:', err);
      setError('Failed to start guest session');
    }
  };

  // Show loading state while auth is being checked
  if (authLoading) {
    return (
      <div className="container">
        <header>
          Hangout
        </header>
        <div className="card">
          <h2>Loading...</h2>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '2px solid transparent',
              borderTop: '2px solid #3B5998',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        Hangout
      </header>

      <div className="card">
        <h2>Welcome Back</h2>

        {success && <div className="success">{success}</div>}
        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p>
            Don't have an account?{' '}
            <Link to="/signup">Sign up here!</Link>
            <br></br>
            Want to just preview the app?{' '}
            <span 
              onClick={handleGuestLogin}
              className="guest-link"
            >
              Click Here!
            </span>
          </p>
        </form>
      </div>
    </div>
  );
};