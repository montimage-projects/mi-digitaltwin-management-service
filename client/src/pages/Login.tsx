import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { authApi } from '@/lib/api';
import { LOGO_SRC, LOGO_ALT, LOGO_BACKDROP, ORG_NAME } from '@/lib/branding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandPanel } from '@/components/login/BrandPanel';
import '@/components/login/login.css';

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
      <BrandPanel />

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
            <p>
              {ORG_NAME} &copy; {new Date().getFullYear()}
            </p>
            <p className="login-footer-sub">Funded by the European Union</p>
          </div>
        </div>
      </div>
    </div>
  );
}
