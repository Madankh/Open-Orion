'use client';

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginStart, loginSuccess, loginFailure } from '../../components/redux/userRedux';
import type { RootState } from '../../components/redux/store';
import { nodeUrl } from "../../apiurl"
// Define proper types for the debug information
interface AuthResponse {
  success?: boolean;
  user?: {
    id?: string;
    _id?: string;
    username?: string;
    name?: string;
    displayName?: string;
    email?: string;
    profile?: string;
  };
  userData?: {
    id?: string;
    _id?: string;
    username?: string;
    name?: string;
    displayName?: string;
    email?: string;
    profile?: string;
  };
  accessToken?: string;
  token?: string;
  access_token?: string;
  [key: string]: unknown;
}

const Login: React.FC = () => {
  const dispatch = useDispatch();
  const router = useRouter();
  
  const { isFetching, error, currentUser } = useSelector((state: RootState) => state.user);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [debugInfo, setDebugInfo] = useState<AuthResponse | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (currentUser) {
      router.push('/canvas');
      return;
    }

    if (hasCheckedAuth) return;

    const checkLoginStatus = async () => {
      try {
        const response = await fetch(`http://localhost:5000/api/auth/login/success`, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data: AuthResponse = await response.json();
          setDebugInfo(data);

          const user = data.user || data.userData || data;
          const token = data.accessToken || data.token || data.access_token || 'dummy-token';

          if (user && (user.id || user._id)) {
            const normalizedUser = {
              id: String(user.id || user._id || ''),
              username: String(user.username || user.name || user.displayName || 'Unknown'),
              email: String(user.email || 'unknown@email.com'),
              profile: String(user?.profile)
            };

            dispatch(loginSuccess({ user: normalizedUser, accessToken: token }));
            setTimeout(() => {
              router.push('/canvas');
            }, 100);
          } else {
            dispatch(loginFailure("Invalid user data received"));
          }
        }
      } catch (err) {
        console.error("Login check error:", err);
        dispatch(loginFailure(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`));
      } finally {
        setHasCheckedAuth(true);
      }
    };

    checkLoginStatus();
  }, [currentUser, hasCheckedAuth, dispatch, router]);

  const handleGoogleLogin = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    dispatch(loginStart());
    window.location.href = `http://localhost:5000/api/auth/login/google`;
  };

  if (currentUser) {
    return (
      <div className="auth-container">
        <div className="auth-card loading">
          <div className="spinner"></div>
          <h2>Welcome back</h2>
          <p>Redirecting you to the dashboard...</p>
        </div>
        <style jsx>{`
          .auth-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: #f3f4f6;
          }
          .auth-card {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          .spinner {
            width: 30px;
            height: 30px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            margin: 0 auto 1rem;
            animation: spin 1s linear infinite;
          }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        
        {/* Header */}
        <div className="auth-header">
          <div className="icon-badge">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
          </div>
          <h1>Welcome</h1>
          <p className="subtitle">Log in or Sign up with one click</p>
        </div>

        {/* Main Content */}
        <div className="auth-body">
          <button
            onClick={handleGoogleLogin}
            disabled={isFetching || !hasCheckedAuth}
            className="google-btn"
            type="button"
          >
            <svg className="google-icon" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="btn-text">
              {isFetching ? 'Connecting...' : !hasCheckedAuth ? 'Loading...' : 'Continue with Google'}
            </span>
          </button>
          
          {error && (
            <div className="error-alert">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="auth-footer">
          By continuing, you agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy-policy">Privacy Policy</Link>.
        </div>

        {/* Debug Info (Hidden behind toggle) */}
        {debugInfo && (
          <div className="debug-container">
            <button onClick={() => setShowDebug(!showDebug)} className="debug-toggle">
              {showDebug ? 'Hide Dev Info' : 'Show Dev Info'}
            </button>
            {showDebug && (
              <pre className="debug-code">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        /* --- RESET & LAYOUT --- */
        .auth-wrapper {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #f8fafc; /* Light Slate bg */
          background-image: radial-gradient(#e2e8f0 1px, transparent 1px);
          background-size: 20px 20px;
          padding: 1rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        /* --- CARD DESIGN --- */
        .auth-card {
          width: 100%;
          max-width: 400px;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          padding: 2.5rem 2rem;
          border: 1px solid #f1f5f9;
        }

        /* --- HEADER --- */
        .auth-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .icon-badge {
          width: 48px;
          height: 48px;
          background: #eff6ff;
          color: #2563eb;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
        }
        
        .icon-badge svg {
          width: 24px;
          height: 24px;
        }

        h1 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
          margin: 0 0 0.5rem 0;
        }

        .subtitle {
          color: #64748b;
          font-size: 0.95rem;
          margin: 0;
        }

        /* --- BUTTON --- */
        .google-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
          gap: 12px;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }

        .google-btn:hover:not(:disabled) {
          background-color: #f8fafc;
          border-color: #cbd5e1;
          transform: translateY(-1px);
        }

        .google-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .google-icon {
          width: 20px;
          height: 20px;
        }

        .btn-text {
          font-weight: 600;
          color: #334155;
          font-size: 1rem;
        }

        /* --- INFO BADGE --- */
        .info-badge {
          margin-top: 1.5rem;
          background-color: #f0f9ff;
          border: 1px solid #e0f2fe;
          border-radius: 8px;
          padding: 0.75rem;
          font-size: 0.8rem;
          color: #0c4a6e;
          display: flex;
          gap: 0.5rem;
          align-items: flex-start;
          line-height: 1.4;
        }

        .error-alert {
          margin-top: 1rem;
          background-color: #fef2f2;
          border: 1px solid #fee2e2;
          color: #991b1b;
          padding: 0.75rem;
          border-radius: 8px;
          font-size: 0.85rem;
          text-align: center;
        }

        /* --- FOOTER --- */
        .auth-footer {
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid #f1f5f9;
          text-align: center;
          font-size: 0.75rem;
          color: #94a3b8;
          line-height: 1.5;
        }

        .auth-footer :global(a) {
          color: #2563eb;
          text-decoration: none;
          font-weight: 500;
        }
        
        .auth-footer :global(a:hover) {
          text-decoration: underline;
        }

        /* --- DEBUG --- */
        .debug-container {
          margin-top: 1rem;
          text-align: center;
        }
        
        .debug-toggle {
          background: none;
          border: none;
          font-size: 10px;
          color: #ccc;
          cursor: pointer;
        }

        .debug-code {
          text-align: left;
          background: #1e293b;
          color: #10b981;
          padding: 10px;
          border-radius: 6px;
          font-size: 10px;
          margin-top: 5px;
          overflow: auto;
          max-height: 150px;
        }
      `}</style>
    </div>
  );
};

export default Login;