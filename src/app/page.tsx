import { Show, SignInButton } from '@clerk/nextjs';
import Dashboard from '../components/Dashboard';

export default function HomePage() {
  return (
    <>
      <Show when="signed-out">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-main)' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', padding: '4rem 2rem' }}>
            <h1 style={{ fontSize: '3.5rem', margin: 0, color: 'var(--black)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Commute Calendar
            </h1>
            <p style={{ margin: '1.5rem auto', color: 'var(--text-muted)', fontSize: '1.2rem', maxWidth: '600px', lineHeight: 1.6 }}>
              An internal tool designed to effortlessly coordinate carpool schedules, manage driver availability blocks, and ensure seamless transportation coverage for our team.
            </p>

            <div style={{ margin: '2rem auto', padding: '1.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: '12px', border: 'var(--border-light)', maxWidth: '700px', textAlign: 'left' }}>
              <h2 style={{ fontSize: '1.1rem', marginTop: 0, marginBottom: '0.5rem', color: 'var(--black)' }}>How we use your data</h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>
                Commute Calendar allows you to sign in with Google to securely authenticate you. We only request your basic profile information (name and email address) to create your account, identify you to your carpool group, and send scheduling notifications. We do not access your calendar, contacts, or any other sensitive data.
              </p>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2.5rem' }}>
              <SignInButton mode="modal">
                <button className="editorial-btn editorial-btn-primary" style={{ padding: '12px 24px', fontSize: '1.1rem', borderRadius: '8px', cursor: 'pointer' }}>
                  Sign In to Access Schedule
                </button>
              </SignInButton>
            </div>
          </div>
          
          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: '2rem', padding: '2rem', borderTop: 'var(--border-light)', width: '100%', fontSize: '0.9rem' }}>
            <a href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Terms of Service</a>
          </div>
        </div>
      </Show>

      <Show when="signed-in">
        <Dashboard />
      </Show>
    </>
  );
}
