import { redirect } from 'next/navigation';
import SignInCta from '../components/SignInCta';
import { getSessionUser } from '@/lib/auth';
import styles from './first-run.module.css';

/**
 * How it works, per design direction 2a. The emoji are decorative -- each one
 * restates its heading -- so they are hidden from assistive technology.
 */
const STEPS = [
  {
    icon: '🚗',
    tone: styles.stepRide,
    title: 'Claim a ride',
    body: 'Put your name down for any pickup or drop-off.',
  },
  {
    icon: '🔔',
    tone: styles.stepNotify,
    title: 'Get a nudge',
    body: 'A gentle heads-up when something needs covering.',
  },
  {
    icon: '👨‍👩‍👧',
    tone: styles.stepSync,
    title: 'Stay in sync',
    body: 'One calendar the whole crew can see and trust.',
  },
];

/**
 * The signed-out landing page, and only that.
 *
 * `/` and `/calendar` used to be the same URL serving two entirely different
 * documents depending on auth state, which is what let a cached signed-out
 * document masquerade as a valid response after signing in. Each state now has
 * its own address, so a cached landing page can only ever be a landing page.
 */
export default async function HomePage() {
  const session = await getSessionUser();
  if (session) redirect('/calendar');

  return (
    <main className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.brand}>Carpool Calendar</div>

        <h1 className={styles.title}>Whose turn is it to drive?</h1>
        <p className={styles.subtitle}>
          A cozy shared calendar for your family and friends — see who&apos;s driving,
          claim a ride, and never send another &ldquo;wait, who&apos;s picking up?&rdquo; text.
        </p>

        <div className={styles.steps}>
          {STEPS.map((step) => (
            <div key={step.title} className={styles.step}>
              <div className={`${styles.stepIcon} ${step.tone}`} aria-hidden="true">
                {step.icon}
              </div>
              <div className={styles.stepTitle}>{step.title}</div>
              <p className={styles.stepBody}>{step.body}</p>
            </div>
          ))}
        </div>

        <div className={styles.trust}>
          <span className={styles.trustIcon} aria-hidden="true">🔒</span>
          <div>
            <div className={styles.trustTitle}>Just enough to say hi</div>
            <p className={styles.trustBody}>
              We use Google sign-in only to know it&apos;s you — your name and email,
              nothing more. No calendar or contacts, ever.
            </p>
          </div>
        </div>

        <SignInCta className={styles.cta} />

        <nav className={styles.links}>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
        </nav>
      </div>
    </main>
  );
}
