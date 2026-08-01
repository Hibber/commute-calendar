/**
 * Live commute time from TomTom.
 *
 * Extracted from the `/api/traffic` route so the departure cron can ask the
 * same question the dashboard does, and get the same answer.
 */

export interface CommuteTraffic {
  totalMinutes: number;
  delayMinutes: number;
  trafficCondition: string;
  color: string;
  distanceMiles: string;
}

interface Position {
  lat: number;
  lon: number;
}

/**
 * Geocoded endpoints, cached for the life of the process.
 *
 * The addresses come from env vars and so never change between invocations,
 * while geocoding them costs two of the three TomTom calls each request. Keyed
 * by the addresses themselves so a config change is still picked up.
 */
let geocodeCache: { key: string; home: Position; work: Position } | null = null;

async function geocode(address: string, apiKey: string): Promise<Position | null> {
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(address)}.json?key=${apiKey}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.results?.[0]?.position ?? null;
}

/**
 * Current driving time from home to work, or null when it cannot be determined.
 *
 * Null covers every failure -- missing config, an address that will not
 * geocode, no route, TomTom being down -- because every caller does the same
 * thing with them: nothing at all.
 */
export async function getCommuteTraffic(): Promise<CommuteTraffic | null> {
  const apiKey = process.env.TOMTOM_API_KEY;
  const homeAddress = process.env.HOME_ADDRESS;
  const workAddress = process.env.WORK_ADDRESS;

  if (!apiKey || !homeAddress || !workAddress) return null;

  const cacheKey = `${homeAddress}|${workAddress}`;
  if (!geocodeCache || geocodeCache.key !== cacheKey) {
    const [home, work] = await Promise.all([
      geocode(homeAddress, apiKey),
      geocode(workAddress, apiKey),
    ]);
    if (!home || !work) return null;
    geocodeCache = { key: cacheKey, home, work };
  }
  const { home, work } = geocodeCache;

  const locations = `${home.lat},${home.lon}:${work.lat},${work.lon}`;
  const routeUrl = `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?key=${apiKey}&departAt=now&traffic=true`;
  const routeRes = await fetch(routeUrl);
  if (!routeRes.ok) return null;

  const routeData = await routeRes.json();
  const summary = routeData?.routes?.[0]?.summary;
  if (!summary || typeof summary.travelTimeInSeconds !== 'number') return null;

  const travelTimeInSeconds: number = summary.travelTimeInSeconds;
  // Either field may be absent depending on the route; falling back to the
  // subtraction unguarded used to yield NaN, which serialised as null.
  const historic = summary.historicTravelTimeInSeconds;
  const delayInSeconds =
    typeof summary.trafficDelayInSeconds === 'number'
      ? summary.trafficDelayInSeconds
      : typeof historic === 'number'
        ? travelTimeInSeconds - historic
        : 0;

  const totalMinutes = Math.ceil(travelTimeInSeconds / 60);
  const delayMinutes = Math.ceil(delayInSeconds / 60);

  let trafficCondition = 'Normal Traffic';
  let color = '#4caf50'; // Green
  if (delayMinutes > 15) {
    trafficCondition = 'Heavy Traffic';
    color = '#f44336'; // Red
  } else if (delayMinutes > 5) {
    trafficCondition = 'Moderate Traffic';
    color = '#ff9800'; // Orange
  }

  const meters = typeof summary.lengthInMeters === 'number' ? summary.lengthInMeters : 0;

  return {
    totalMinutes,
    delayMinutes,
    trafficCondition,
    color,
    distanceMiles: (meters * 0.000621371).toFixed(1),
  };
}
