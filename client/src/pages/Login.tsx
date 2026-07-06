import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Loader2, Shield, Network, Lock } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { authApi } from '@/lib/api';
import { APP_NAME, LOGO_SRC, LOGO_ALT, LOGO_BACKDROP } from '@/lib/branding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LoginForm = {
  username: string;
  password: string;
};

export function Login() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await authApi.login(data.username, data.password);
      login(response.token, response.user);
      navigate('/');
    } catch {
      setError('Invalid username or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Animated background grid */}
      <div className="login-grid-bg" />

      {/* Left Panel - Branding */}
      <div className="login-brand-panel">
        <div className="login-brand-content">
          {/* Floating geometric shapes */}
          <div className="login-shape login-shape-1" />
          <div className="login-shape login-shape-2" />
          <div className="login-shape login-shape-3" />

          {/* Logo */}
          <div className="login-logo-wrapper">
            <img
              src={LOGO_SRC}
              alt={LOGO_ALT}
              className="login-logo"
              style={
                LOGO_BACKDROP
                  ? { background: '#fff', borderRadius: 4, padding: '2px 6px' }
                  : undefined
              }
            />
          </div>

          {/* Tagline */}
          <div className="login-tagline">
            <h2 className="login-tagline-title">{APP_NAME}</h2>
            <p className="login-tagline-subtitle">
              Secure infrastructure modeling for critical systems
            </p>
          </div>

          {/* Features */}
          <div className="login-features">
            <div className="login-feature">
              <div className="login-feature-icon">
                <Shield className="w-5 h-5" />
              </div>
              <div className="login-feature-text">
                <span className="login-feature-title">Cybersecurity Services</span>
                <span className="login-feature-desc">Comprehensive security catalog</span>
              </div>
            </div>
            <div className="login-feature">
              <div className="login-feature-icon">
                <Network className="w-5 h-5" />
              </div>
              <div className="login-feature-text">
                <span className="login-feature-title">Topology Modeling</span>
                <span className="login-feature-desc">Visual infrastructure design</span>
              </div>
            </div>
            <div className="login-feature">
              <div className="login-feature-icon">
                <Lock className="w-5 h-5" />
              </div>
              <div className="login-feature-text">
                <span className="login-feature-title">Scenario Analysis</span>
                <span className="login-feature-desc">Attack simulation & defense</span>
              </div>
            </div>
          </div>
        </div>

        {/* EU Project badge */}
        <div className="login-eu-badge">
          <span>EU Horizon Europe Project</span>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="login-form-panel">
        <div className="login-form-wrapper">
          {/* Mobile logo */}
          <div className="login-mobile-logo">
            <img
              src={LOGO_SRC}
              alt={LOGO_ALT}
              style={
                LOGO_BACKDROP
                  ? { background: '#fff', borderRadius: 4, padding: '2px 6px' }
                  : undefined
              }
            />
          </div>

          <div className="login-form-header">
            <h1 className="login-form-title">Welcome back</h1>
            <p className="login-form-subtitle">Sign in to access your digital twin workspace</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="login-form">
            {error && (
              <div className="login-error">
                <div className="login-error-icon">!</div>
                <span>{error}</span>
              </div>
            )}

            <div className="login-field">
              <Label htmlFor="username" className="login-label">
                Username
              </Label>
              <div className="login-input-wrapper">
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  disabled={isLoading}
                  className="login-input"
                  {...register('username', { required: 'Username is required' })}
                />
              </div>
              {errors.username && <p className="login-field-error">{errors.username.message}</p>}
            </div>

            <div className="login-field">
              <Label htmlFor="password" className="login-label">
                Password
              </Label>
              <div className="login-input-wrapper">
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  disabled={isLoading}
                  className="login-input"
                  {...register('password', { required: 'Password is required' })}
                />
              </div>
              {errors.password && <p className="login-field-error">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="login-submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Sign in to Platform</span>
              )}
            </Button>
          </form>

          <div className="login-footer">
            <p>INTACT Consortium &copy; {new Date().getFullYear()}</p>
            <p className="login-footer-sub">Funded by the European Union</p>
          </div>
        </div>
      </div>

      {/* Inline styles for the login page */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@400;500&display=swap');

        .login-container {
          display: flex;
          min-height: 100vh;
          background: #0a0a0b;
          position: relative;
          overflow: hidden;
        }

        /* Animated grid background */
        .login-grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridMove 20s linear infinite;
        }

        @keyframes gridMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(60px, 60px); }
        }

        /* Left Brand Panel */
        .login-brand-panel {
          display: none;
          width: 50%;
          background: linear-gradient(135deg, #0f0f11 0%, #1a1a1f 50%, #0f0f11 100%);
          padding: 3rem;
          position: relative;
          overflow: hidden;
          border-right: 1px solid rgba(255,255,255,0.06);
        }

        @media (min-width: 1024px) {
          .login-brand-panel {
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
        }

        .login-brand-content {
          position: relative;
          z-index: 10;
          max-width: 480px;
          margin: 0 auto;
        }

        /* Floating shapes */
        .login-shape {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.4;
          animation: float 8s ease-in-out infinite;
        }

        .login-shape-1 {
          width: 300px;
          height: 300px;
          background: #dc2626;
          top: 10%;
          right: 10%;
          animation-delay: 0s;
        }

        .login-shape-2 {
          width: 200px;
          height: 200px;
          background: #1e40af;
          bottom: 20%;
          left: 10%;
          animation-delay: -3s;
        }

        .login-shape-3 {
          width: 150px;
          height: 150px;
          background: #dc2626;
          bottom: 40%;
          right: 20%;
          animation-delay: -5s;
          opacity: 0.2;
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }

        /* Logo */
        .login-logo-wrapper {
          margin-bottom: 3rem;
          animation: fadeSlideUp 0.8s ease-out;
        }

        .login-logo {
          height: 56px;
          width: auto;
          max-width: 220px;
          object-fit: contain;
        }

        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Tagline */
        .login-tagline {
          margin-bottom: 3rem;
          animation: fadeSlideUp 0.8s ease-out 0.1s both;
        }

        .login-tagline-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.75rem;
          font-weight: 600;
          color: #ffffff;
          margin: 0 0 0.75rem 0;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .login-tagline-subtitle {
          font-family: 'DM Sans', sans-serif;
          font-size: 1rem;
          color: rgba(255,255,255,0.5);
          margin: 0;
          line-height: 1.5;
        }

        /* Features */
        .login-features {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .login-feature {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px;
          transition: all 0.3s ease;
          animation: fadeSlideUp 0.8s ease-out both;
        }

        .login-feature:nth-child(1) { animation-delay: 0.2s; }
        .login-feature:nth-child(2) { animation-delay: 0.3s; }
        .login-feature:nth-child(3) { animation-delay: 0.4s; }

        .login-feature:hover {
          background: rgba(255,255,255,0.05);
          border-color: rgba(220,38,38,0.3);
          transform: translateX(4px);
        }

        .login-feature-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(220,38,38,0.1);
          border: 1px solid rgba(220,38,38,0.2);
          border-radius: 10px;
          color: #dc2626;
          flex-shrink: 0;
        }

        .login-feature-text {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .login-feature-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: #ffffff;
        }

        .login-feature-desc {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.4);
        }

        /* EU Badge */
        .login-eu-badge {
          position: absolute;
          bottom: 2rem;
          left: 3rem;
          right: 3rem;
          text-align: center;
          animation: fadeSlideUp 0.8s ease-out 0.5s both;
        }

        .login-eu-badge span {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          color: rgba(255,255,255,0.3);
          text-transform: uppercase;
          letter-spacing: 0.15em;
          padding: 0.5rem 1rem;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 100px;
          display: inline-block;
        }

        /* Right Form Panel */
        .login-form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          position: relative;
          z-index: 10;
        }

        @media (min-width: 1024px) {
          .login-form-panel {
            width: 50%;
            padding: 3rem;
          }
        }

        .login-form-wrapper {
          width: 100%;
          max-width: 400px;
          animation: fadeSlideUp 0.8s ease-out;
        }

        /* Mobile logo */
        .login-mobile-logo {
          display: block;
          margin-bottom: 2.5rem;
          text-align: center;
        }

        .login-mobile-logo img {
          height: 40px;
          width: auto;
          max-width: 200px;
          object-fit: contain;
        }

        @media (min-width: 1024px) {
          .login-mobile-logo {
            display: none;
          }
        }

        /* Form header */
        .login-form-header {
          margin-bottom: 2rem;
          text-align: center;
        }

        @media (min-width: 1024px) {
          .login-form-header {
            text-align: left;
          }
        }

        .login-form-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.75rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0 0 0.5rem 0;
          letter-spacing: -0.02em;
        }

        .login-form-subtitle {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.95rem;
          color: rgba(255,255,255,0.5);
          margin: 0;
        }

        /* Form */
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* Error message */
        .login-error {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          background: rgba(220,38,38,0.1);
          border: 1px solid rgba(220,38,38,0.2);
          border-radius: 10px;
          animation: shake 0.5s ease-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-5px); }
          40%, 80% { transform: translateX(5px); }
        }

        .login-error-icon {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #dc2626;
          border-radius: 50%;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.75rem;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
        }

        .login-error span {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.875rem;
          color: #fca5a5;
        }

        /* Fields */
        .login-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .login-label {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.875rem;
          font-weight: 500;
          color: rgba(255,255,255,0.7);
        }

        .login-input-wrapper {
          position: relative;
        }

        .login-input {
          width: 100%;
          height: 48px;
          padding: 0 1rem;
          background: rgba(255,255,255,0.03) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 10px !important;
          font-family: 'DM Sans', sans-serif !important;
          font-size: 0.95rem !important;
          color: #ffffff !important;
          transition: all 0.2s ease !important;
        }

        .login-input::placeholder {
          color: rgba(255,255,255,0.3) !important;
        }

        .login-input:focus {
          outline: none !important;
          background: rgba(255,255,255,0.05) !important;
          border-color: rgba(220,38,38,0.5) !important;
          box-shadow: 0 0 0 3px rgba(220,38,38,0.1) !important;
        }

        .login-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .login-field-error {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.8rem;
          color: #fca5a5;
          margin: 0;
        }

        /* Submit button */
        .login-submit {
          width: 100%;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%) !important;
          border: none !important;
          border-radius: 10px !important;
          font-family: 'DM Sans', sans-serif !important;
          font-size: 0.95rem !important;
          font-weight: 600 !important;
          color: #ffffff !important;
          cursor: pointer;
          transition: all 0.2s ease !important;
          margin-top: 0.5rem;
        }

        .login-submit:hover:not(:disabled) {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(220,38,38,0.4) !important;
        }

        .login-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        /* Footer */
        .login-footer {
          margin-top: 3rem;
          text-align: center;
          animation: fadeSlideUp 0.8s ease-out 0.2s both;
        }

        .login-footer p {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.3);
          margin: 0;
        }

        .login-footer-sub {
          margin-top: 0.25rem !important;
          font-size: 0.7rem !important;
          color: rgba(255,255,255,0.2) !important;
        }
      `}</style>
    </div>
  );
}
