import { Resend } from 'resend';
import { listRecipients } from './auth';
import { sendPushNotification } from './push';

// Vercel build will crash if this is undefined during static analysis, so we provide a fallback
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

const SITE_URL = 'https://schedule.triddle.dev';
const FROM = 'Commute Calendar <notifications@triddle.dev>';

/**
 * Who a notification goes to, by role rather than by name:
 *
 * - `admins`  -- whoever manages the schedule (shift choices, coverage alerts)
 * - `members` -- everyone else (new shifts to respond to)
 * - `all`     -- the whole carpool (comments)
 *
 * The actual people are resolved from Clerk when the notification is sent.
 * Nothing here names an individual, so membership changes never require a code
 * change -- which is how the old system rotted: it pushed to hardcoded first
 * names and emailed hardcoded addresses, and anyone whose Clerk name did not
 * exactly match got nothing.
 */
export type Audience = 'admins' | 'members' | 'all';

export interface Notification {
  /** Push notification title, and the email subject unless one is given. */
  title: string;
  /** Push notification body. */
  body: string;
  /** Email subject; falls back to `title`. */
  subject?: string;
  /**
   * Email body HTML. When omitted, no email is sent -- some notifications
   * (comments) are worth a buzz but not an inbox entry.
   */
  html?: string;
  /**
   * Display name of the person who caused the notification. They are excluded
   * from delivery; nobody needs a push about their own action.
   */
  actor?: string;
}

/** A link back to the site, appended to every email body. */
export function emailFooter(): string {
  return `<p>Check the <a href="${SITE_URL}">Commute Calendar</a> for details.</p>`;
}

/**
 * Deliver a notification to an audience, by push and (optionally) email.
 *
 * Failures are logged and swallowed. Notifying is always a side effect of an
 * action that already succeeded, and must never turn that success into an
 * error -- this is also why callers do not await anything about the outcome.
 */
export async function notify(audience: Audience, notification: Notification): Promise<void> {
  try {
    const everyone = await listRecipients();
    const recipients = everyone.filter((r) => {
      if (notification.actor && r.displayName === notification.actor) return false;
      if (audience === 'admins') return r.isAdmin;
      if (audience === 'members') return !r.isAdmin;
      return true;
    });

    if (recipients.length === 0) return;

    const pushTargets = [...new Set(recipients.map((r) => r.displayName))];
    const pushPromise = sendPushNotification(pushTargets, {
      title: notification.title,
      body: notification.body,
      url: SITE_URL,
    });

    let emailPromise: Promise<unknown> = Promise.resolve();
    const emails = recipients
      .map((r) => r.email)
      .filter((e): e is string => e !== null);
    if (notification.html && emails.length > 0) {
      emailPromise = resend.emails
        .send({
          from: FROM,
          to: emails,
          subject: notification.subject ?? notification.title,
          html: notification.html,
        })
        .then(({ error }) => {
          if (error) console.error('Resend API Error:', error);
        });
    }

    await Promise.all([pushPromise, emailPromise]);
  } catch (error) {
    console.error('Failed to notify:', error);
  }
}
