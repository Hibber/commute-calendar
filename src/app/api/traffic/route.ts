import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Home and work addresses, and the live commute time between them, are not
  // public information.
  const session = await requireUser();
  if (!session.ok) return session.response;

  try {
    const apiKey = process.env.TOMTOM_API_KEY;
    const homeAddress = process.env.HOME_ADDRESS;
    const workAddress = process.env.WORK_ADDRESS;

    if (!apiKey || !homeAddress || !workAddress) {
      return NextResponse.json({ error: 'Missing Configuration' }, { status: 500 });
    }

    // 1. Geocode Home Address
    const homeGeocodeUrl = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(homeAddress)}.json?key=${apiKey}&limit=1`;
    const homeRes = await fetch(homeGeocodeUrl);
    const homeData = await homeRes.json();
    if (!homeData.results || homeData.results.length === 0) {
       return NextResponse.json({ error: 'Could not find home address' }, { status: 400 });
    }
    const homePos = homeData.results[0].position;

    // 2. Geocode Work Address
    const workGeocodeUrl = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(workAddress)}.json?key=${apiKey}&limit=1`;
    const workRes = await fetch(workGeocodeUrl);
    const workData = await workRes.json();
    if (!workData.results || workData.results.length === 0) {
       return NextResponse.json({ error: 'Could not find work address' }, { status: 400 });
    }
    const workPos = workData.results[0].position;

    // 3. Calculate Route (Live Traffic)
    const locations = `${homePos.lat},${homePos.lon}:${workPos.lat},${workPos.lon}`;
    const routeUrl = `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?key=${apiKey}&departAt=now&traffic=true`;
    
    const routeRes = await fetch(routeUrl);
    const routeData = await routeRes.json();
    
    if (!routeData.routes || routeData.routes.length === 0) {
       return NextResponse.json({ error: 'Could not calculate route' }, { status: 400 });
    }

    const summary = routeData.routes[0].summary;
    const travelTimeInSeconds = summary.travelTimeInSeconds;
    const historicTravelTimeInSeconds = summary.historicTravelTimeInSeconds;
    
    // Live traffic delay
    const delayInSeconds = summary.trafficDelayInSeconds || (travelTimeInSeconds - historicTravelTimeInSeconds);
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

    return NextResponse.json({
      success: true,
      totalMinutes,
      delayMinutes,
      trafficCondition,
      color,
      distanceMiles: (summary.lengthInMeters * 0.000621371).toFixed(1)
    });
  } catch (error) {
    console.error('Traffic API Error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
