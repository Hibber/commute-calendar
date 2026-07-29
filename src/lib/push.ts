import webpush from 'web-push';
import { sql } from '@vercel/postgres';

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
 * Deliver a push notification to every device the named users have registered.
 *
 * Targets are display names -- the key subscriptions are stored under. Expired
 * subscriptions are pruned as they are discovered. Failures are logged and
 * swallowed: a notification is never worth failing the action it describes.
 */
export async function sendPushNotification(
  target: string | string[] | 'all',
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

    let subscriptions: SubscriptionRow[];
    if (target === 'all') {
      const { rows } = await sql<SubscriptionRow>`SELECT * FROM subscriptions`;
      subscriptions = rows;
    } else {
      const names = Array.isArray(target) ? target : [target];
      if (names.length === 0) return;
      const { rows } = await sql.query<SubscriptionRow>(
        'SELECT * FROM subscriptions WHERE user_name = ANY($1)',
        [names],
      );
      subscriptions = rows;
    }

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
