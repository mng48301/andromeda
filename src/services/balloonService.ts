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

// Calculate predicted position based on current position and weather conditions
export function predictNextPosition(
  position: [number, number, number],
  weatherData: { wind: { speed: number; deg: number } }
): [number, number, number] {
  const [lng, lat, alt] = position;
  const { speed, deg } = weatherData.wind;
  
  // Convert wind direction to radians
  const windRad = (deg * Math.PI) / 180;
  
  // Calculate displacement based on wind speed (simplified model)
  // Using a scale factor to convert wind speed to coordinate changes
  const scale = 0.001; // Adjust this value to control prediction distance
  const dLng = Math.sin(windRad) * speed * scale;
  const dLat = Math.cos(windRad) * speed * scale;
  
  // Simple altitude change based on current height
  const altChange = alt > 5 ? -0.1 : 0.1; // Go up below 5km, down above 5km
  const newAlt = Math.max(0.1, Math.min(10, alt + altChange)); // Keep altitude between 0.1 and 10 km
  
  return [lng + dLng, lat + dLat, newAlt];
}

async function fetchWithRetry(hour: string, retries = 3): Promise<BalloonData> {
  for (let i = 0; i < retries; i++) {
    try {
      // Use the Next.js API route instead of fetching directly
      const response = await fetch(`/api/balloon/${hour}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch hour ${hour}, status: ${response.status}, body: ${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
      console.warn(`No valid data received for hour ${hour}`);
      return [];
    } catch (error) {
      console.error(`Attempt ${i + 1}/${retries} failed for hour ${hour}:`, error);
      if (i === retries - 1) throw error;
      await delay(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
  return [];
}

export async function fetchBalloonData(hour: number): Promise<BalloonData> {
  const paddedHour = hour.toString().padStart(2, '0');
  try {
    return await fetchWithRetry(paddedHour);
  } catch (error) {
    console.error(`Error fetching balloon data for hour ${paddedHour}:`, error);
    return [];
  }
}

export async function fetchLast24Hours(): Promise<BalloonData[]> {
  // Try fetching most recent data first (hour 0)
  try {
    const currentData = await fetchBalloonData(0);
    if (currentData.length > 0) {
      console.log('Successfully fetched current balloon data');
      
      // Then fetch the rest in parallel
      const promises = Array.from({ length: 23 }, (_, i) => fetchBalloonData(i + 1));
      const results = await Promise.allSettled(promises);
      
      return [
        currentData,
        ...results
          .filter((result): result is PromiseFulfilledResult<BalloonData> => 
            result.status === 'fulfilled'
          )
          .map(result => result.value)
      ];
    }
  } catch (error) {
    console.error('Error fetching current balloon data:', error);
  }

  // Fallback to fetching all hours if current data fails
  const promises = Array.from({ length: 24 }, (_, i) => fetchBalloonData(i));
  const results = await Promise.allSettled(promises);
  
  return results
    .filter((result): result is PromiseFulfilledResult<BalloonData> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value);
}