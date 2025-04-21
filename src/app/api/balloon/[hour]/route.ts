import { NextResponse } from 'next/server';

type Coordinate = [number, number, number]; // [longitude, latitude, altitude]
type BalloonData = Coordinate[];

function isValidCoordinate(coord: unknown): coord is Coordinate {
  if (!Array.isArray(coord) || coord.length !== 3) return false;
  const [lng, lat, alt] = coord;
  return (
    typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180 &&
    typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90 &&
    typeof alt === 'number' && !isNaN(alt)
  );
}

export async function GET(
  request: Request,
  { params }: { params: { hour: string } }
): Promise<NextResponse<BalloonData | { error: string }>> {
  try {
    const hour = params.hour.padStart(2, '0');
    const response = await fetch(`https://a.windbornesystems.com/treasure/${hour}.json`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
      next: { revalidate: 0 }
    });

    if (!response.ok) {
      console.error(`API Error: ${response.status} for hour ${hour}`);
      return NextResponse.json({ error: `HTTP error! status: ${response.status}` }, { status: response.status });
    }

    const text = await response.text();
    console.log(`API received data for hour ${hour}: ${text.substring(0, 100)}...`);
    
    try {
      const data = JSON.parse(text.trim());
      
      if (Array.isArray(data)) {
        // Filter out invalid coordinates
        const validData = data.filter(isValidCoordinate);
        if (validData.length === 0) {
          console.warn(`No valid coordinates found for hour ${hour}`);
        }
        return NextResponse.json(validData);
      }
      
      return NextResponse.json([]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError, 'Response text:', text);
      return NextResponse.json({ error: 'Invalid JSON response' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error fetching balloon data:', error);
    return NextResponse.json({ error: 'Failed to fetch balloon data' }, { status: 500 });
  }
}