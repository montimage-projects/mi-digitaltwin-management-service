import { Shield, Network, Lock } from 'lucide-react';
import { APP_NAME, LOGO_SRC, LOGO_ALT } from '@/lib/branding';

export function BrandPanel() {
  return (
    <div className="login-brand-panel">
      <div className="login-brand-content">
        {/* Floating geometric shapes */}
        <div className="login-shape login-shape-1" />
        <div className="login-shape login-shape-2" />
        <div className="login-shape login-shape-3" />

        {/* Logo */}
        <div className="login-logo-wrapper">
          <img src={LOGO_SRC} alt={LOGO_ALT} className="login-logo login-logo-backdrop" />
        </div>

        {/* Tagline */}
        <div className="login-tagline">
          <h2 className="login-tagline-title">{APP_NAME}</h2>
          <p className="login-tagline-subtitle">
            Security simulation and digital twin management for critical infrastructure
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
  );
}
