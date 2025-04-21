import { NextResponse } from 'next/server';

function isValidCoordinate(coord: any): boolean {
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
) {
  try {
    const hour = await Promise.resolve(params.hour);
    const response = await fetch(`https://a.windbornesystems.com/treasure/${hour}.json`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text.trim());
      
      if (Array.isArray(data)) {
        // Filter out invalid coordinates
        const validData = data.filter(isValidCoordinate);
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