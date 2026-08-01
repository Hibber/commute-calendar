import webpush from 'web-push';
import { sql } from '@vercel/postgres';
import type { PersonRef } from './identity';

/** What the push service worker in `worker/index.ts` knows how to display. */
export interface PushPayload {
  title: string;
  body: string;
  /** Where a tap on the notification takes the user. */
  url?: string;
}

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Deliver a push notification to every device these people have registered.
 *
 * Subscriptions are matched by Clerk id, falling back to the display name for
 * device registrations made before the identity migration. That fallback is why
 * a rename no longer silences someone: the id keeps matching even once the name
 * it was registered under is gone.
 *
 * Expired subscriptions are pruned as they are discovered. Failures are logged
 * and swallowed: a notification is never worth failing the action it describes.
 */
export async function sendPushNotification(
  targets: PersonRef[],
  payload: PushPayload,
): Promise<void> {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      console.warn('VAPID keys not configured. Skipping push notification.');
      return;
    }

    webpush.setVapidDetails('mailto:notifications@triddle.dev', publicKey, privateKey);

    if (targets.length === 0) return;

    // The name arm is scoped to rows with no id, so a subscription that has been
    // backfilled is only ever matched by id -- a name later reused by another
    // member cannot pull someone else's devices into the delivery.
    const { rows: subscriptions } = await sql.query<SubscriptionRow>(
      `SELECT * FROM subscriptions
       WHERE user_id = ANY($1)
          OR (user_id IS NULL AND user_name = ANY($2))`,
      [targets.map((t) => t.userId), targets.map((t) => t.displayName)],
    );

    if (subscriptions.length === 0) return;

    const payloadString = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };

        try {
          await webpush.sendNotification(pushSubscription, payloadString);
        } catch (e) {
          const statusCode = (e as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // The push service says this device is gone for good.
            await sql`DELETE FROM subscriptions WHERE endpoint = ${sub.endpoint}`;
          } else {
            console.error('Error sending push:', e);
          }
        }
      }),
    );
  } catch (error) {
    console.error('Failed to send push notification:', error);
  }
}
