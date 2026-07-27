import webpush from 'web-push';
import { sql } from '@vercel/postgres';

webpush.setVapidDetails(
  'mailto:travis.riddlexx@gmail.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
  process.env.VAPID_PRIVATE_KEY as string
);

export async function sendPushNotification(targetUser: string | 'all', payload: any) {
  try {
    let subscriptions;
    
    if (targetUser === 'all') {
      const { rows } = await sql`SELECT * FROM subscriptions`;
      subscriptions = rows;
    } else {
      const { rows } = await sql`SELECT * FROM subscriptions WHERE user_name = ${targetUser}`;
      subscriptions = rows;
    }

    if (!subscriptions || subscriptions.length === 0) return;

    const payloadString = JSON.stringify(payload);

    const promises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, payloadString);
      } catch (e: any) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          console.log('Subscription has expired or is no longer valid, removing from DB.');
          await sql`DELETE FROM subscriptions WHERE endpoint = ${sub.endpoint}`;
        } else {
          console.error('Error sending push:', e);
        }
      }
    });

    await Promise.all(promises);
  } catch (error) {
    console.error('Failed to send push notification:', error);
  }
}
