export type BalloonData = [number, number, number][]; // [longitude, latitude, altitude][]

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isValidCoordinate(coord: number[]): boolean {
  if (!Array.isArray(coord) || coord.length !== 3) return false;
  const [lng, lat, alt] = coord;
  return (
    typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180 &&
    typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90 &&
    typeof alt === 'number' && !isNaN(alt)
  );
}

async function fetchWithRetry(url: string, retries = 3): Promise<BalloonData> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Validate and filter coordinates
      if (Array.isArray(data)) {
        return data.filter(isValidCoordinate);
      }
      return [];
    } catch (error) {
      if (i === retries - 1) throw error;
      await delay(1000 * (i + 1)); // Exponential backoff
    }
  }
  return [];
}

export async function fetchBalloonData(hour: number): Promise<BalloonData> {
  const paddedHour = hour.toString().padStart(2, '0');
  try {
    return await fetchWithRetry(`/api/balloon/${paddedHour}`);
  } catch (error) {
    console.error(`Error fetching balloon data for hour ${hour}:`, error);
    return [];
  }
}

export async function fetchLast24Hours(): Promise<BalloonData[]> {
  const promises = Array.from({ length: 24 }, (_, i) => fetchBalloonData(i));
  const results = await Promise.allSettled(promises);
  
  return results
    .filter((result): result is PromiseFulfilledResult<BalloonData> => 
      result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length > 0
    )
    .map(result => result.value);
}