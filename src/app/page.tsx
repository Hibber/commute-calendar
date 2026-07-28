import { Show, SignInButton } from '@clerk/nextjs';
import Dashboard from '../components/Dashboard';
import styles from './first-run.module.css';

export default function HomePage() {
  return (
    <>
      <Show when="signed-out">
        <div className={styles.wrapper}>
          <div className={styles.card}>
            {/* Desktop Brand Panel */}
            <div className={styles.brandPanel}>
              <div>
                <div className={styles.eyebrow}>Carpool Calendar</div>
                <h1 className={styles.title}>The family carpool, finally organized.</h1>
                <p className={styles.subtitle}>
                  One shared calendar so everyone knows who&apos;s driving, who needs a ride, and what&apos;s still uncovered — no more group texts.
                </p>
              </div>
              <div className={styles.steps}>
                <div className={styles.step}>
                  <div className={`${styles.stepBadge} ${styles.step1}`}>1</div>
                  <div className={styles.stepText}>Sign in with your Google account</div>
                </div>
                <div className={styles.step}>
                  <div className={`${styles.stepBadge} ${styles.step2}`}>2</div>
                  <div className={styles.stepText}>Claim shifts on the shared calendar</div>
                </div>
                <div className={styles.step}>
                  <div className={`${styles.stepBadge} ${styles.step3}`}>3</div>
                  <div className={styles.stepText}>Get notified when plans change</div>
                </div>
              </div>
            </div>

            {/* Right / Main Sign-in Panel */}
            <div className={styles.signInPanel}>
              
              {/* Mobile Top Content (hidden on desktop) */}
              <div className={`${styles.mobileOnly} ${styles.mobileTopGroup}`}>
                <img src="/images/carpool_illustration.jpg" alt="Family carpool schedule" className={styles.mobileIllustration} />
                <div>
                  <h1 className={styles.mobileTitle}>You&apos;re all set to sign in</h1>
                  <p className={styles.mobileSubtitle}>
                    We&apos;ll only use your name and email to add you to the family calendar. Nothing else.
                  </p>
                </div>
              </div>

              {/* Desktop Sign-in Details (hidden on mobile) */}
              <div className={styles.desktopOnly}>
                <div>
                  <h2 className={styles.signInTitle}>Sign in to get started</h2>
                  <p className={styles.signInSubtitle}>Your group&apos;s schedule is waiting.</p>
                </div>
                <div className={styles.trustBox} style={{ marginTop: '28px' }}>
                  <div className={styles.trustBoxTitle}>How we use your data</div>
                  <p className={styles.trustBoxText}>
                    We only request your name and email to identify you to your group and send scheduling notifications. We never access your calendar or contacts.
                  </p>
                </div>
              </div>

              {/* Shared Action Area */}
              <div className={`${styles.mobileOnly} ${styles.mobileBottomGroup}`}>
                <div className={styles.dots}>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                  <div className={styles.dotActive}></div>
                </div>
                <SignInButton fallbackRedirectUrl="/">
                  <button className={`${styles.primaryBtn} ${styles.primaryBtnMobile}`}>
                    Continue with Google
                  </button>
                </SignInButton>
                <div className={`${styles.linksRow} ${styles.linksRowMobile}`}>
                  <a href="/privacy">Privacy</a>
                  <a href="/terms">Terms</a>
                </div>
              </div>

              {/* Desktop Action Area */}
              <div className={styles.desktopOnly} style={{ marginTop: '28px' }}>
                <SignInButton fallbackRedirectUrl="/">
                  <button className={styles.primaryBtn}>
                    Continue with Google
                  </button>
                </SignInButton>
                <div className={styles.linksRow}>
                  <a href="/privacy">Privacy Policy</a>
                  <a href="/terms">Terms of Service</a>
                </div>
              </div>

            </div>
          </div>
        </div>
      </Show>

      <Show when="signed-in">
        <Dashboard />
      </Show>
    </>
  );
}
