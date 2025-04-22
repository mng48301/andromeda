import { Balloon, WeatherData, BalloonHistory, DangerCondition } from '../types';

export async function fetchCurrentBalloons(): Promise<Balloon[]> {
    try {
        console.log('Fetching current balloon data...');
        const response = await fetch('/api/balloons');

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        
        if (!Array.isArray(data)) {
            throw new Error('Invalid data format');
        }

        const balloons = data.map((balloon, index) => {
            if (!Array.isArray(balloon) || balloon.length < 3) {
                console.warn('Invalid balloon data entry:', balloon);
                return null;
            }
            const [lat, lon, alt] = balloon.map(Number);
            if (isNaN(lat) || isNaN(lon) || isNaN(alt)) {
                console.warn('Invalid numeric values in balloon data:', balloon);
                return null;
            }
            return {
                id: `balloon-${index + 1}`,
                lat,
                lon,
                alt,
                timestamp: new Date().toISOString()
            };
        }).filter((balloon): balloon is Balloon => balloon !== null);
        
        return balloons;
    } catch (error) {
        console.error('Error fetching balloon data:', error);
        throw error;
    }
}

export async function fetchBalloonHistory(hours: number[], currentPosition: [number, number, number]): Promise<BalloonHistory> {
    try {
        console.log('Fetching history for balloon at position:', currentPosition);
        const [currentLat, currentLon] = currentPosition;

        const historyPromises = hours.map(async (hour) => {
            try {
                const paddedHour = hour.toString().padStart(2, '0');
                console.log(`Fetching data for hour ${paddedHour}`);
                
                const response = await fetch(`/api/balloons?hour=${paddedHour}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch history for hour ${hour}`);
                }

                const data = await response.json();
                
                if (Array.isArray(data)) {
                    // Find the balloon position closest to the current position
                    let closestPosition = null;
                    let minDistance = Infinity;

                    for (const pos of data) {
                        if (Array.isArray(pos) && pos.length >= 2) {
                            const [lat, lon] = pos.map(Number);
                            if (!isNaN(lat) && !isNaN(lon)) {
                                const distance = Math.sqrt(
                                    Math.pow(lat - currentLat, 2) + 
                                    Math.pow(lon - currentLon, 2)
                                );
                                if (distance < minDistance) {
                                    minDistance = distance;
                                    closestPosition = { lat, lon };
                                }
                            }
                        }
                    }

                    // Only use positions within a reasonable distance (5 degrees)
                    if (closestPosition && minDistance < 5) {
                        return {
                            ...closestPosition,
                            timestamp: new Date(Date.now() - hour * 3600000).toISOString()
                        };
                    }
                }
                return null;
            } catch (error) {
                console.warn(`Error fetching history for hour ${hour}:`, error);
                return null;
            }
        });

        const historyPoints = (await Promise.all(historyPromises))
            .filter((point): point is NonNullable<typeof point> => point !== null)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        console.log('Processed history points:', historyPoints);
        return {
            positions: historyPoints
        };
    } catch (error) {
        console.error('Error in fetchBalloonHistory:', error);
        return { positions: [] };
    }
}

// Weather API rate limiting
const weatherRequestQueue: { [key: string]: number } = {};
const MIN_REQUEST_INTERVAL = 1000; // 1 second minimum between requests for the same location

export async function fetchWeatherData(lat: number, lon: number): Promise<WeatherData> {
    try {
        const API_KEY = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
        if (!API_KEY) {
            throw new Error('Weather API key is not configured');
        }

        // Round coordinates to 2 decimal places to reduce unique API calls
        const roundedLat = Math.round(lat * 100) / 100;
        const roundedLon = Math.round(lon * 100) / 100;
        const locationKey = `${roundedLat},${roundedLon}`;

        // Check if we need to wait before making another request
        const lastRequestTime = weatherRequestQueue[locationKey] || 0;
        const timeSinceLastRequest = Date.now() - lastRequestTime;
        if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
            await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
        }

        // Update the last request time
        weatherRequestQueue[locationKey] = Date.now();

        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${roundedLat}&lon=${roundedLon}&appid=${API_KEY}&units=metric`,
            {
                headers: {
                    'Accept': 'application/json'
                },
                cache: 'force-cache'
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Weather API error:', errorData);
            if (response.status === 429) {
                throw new Error('Weather API rate limit exceeded');
            }
            throw new Error(`Weather API request failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.main?.temp || !data.main?.pressure) {
            throw new Error('Invalid weather data format');
        }

        return {
            temperature: Number(data.main.temp),
            pressure: Number(data.main.pressure)
        };
    } catch (error) {
        console.error('Error fetching weather data:', error);
        return {
            temperature: 20,
            pressure: 1013
        };
    }
}

export function checkDangerConditions(weather: WeatherData): DangerCondition {
    const dangerousTemp = -30; // Celsius - Adjusted to catch more cold conditions
    const dangerousPressure = 500; // hPa - Adjusted for high altitude conditions

    if (weather.temperature < dangerousTemp) {
        return { isDangerous: true, reason: `Extreme cold temperature: ${weather.temperature.toFixed(1)}°C` };
    }
    if (weather.pressure < dangerousPressure) {
        return { isDangerous: true, reason: `Dangerously low pressure: ${weather.pressure} hPa` };
    }
    
    return { isDangerous: false };
}

export function predictNextPosition(positions: { lat: number; lon: number; timestamp: string }[]): { lat: number; lon: number } | undefined {
    if (positions.length < 2) return undefined;
    
    const last = positions[positions.length - 1];
    const secondLast = positions[positions.length - 2];
    
    const latDiff = last.lat - secondLast.lat;
    const lonDiff = last.lon - secondLast.lon;
    
    return {
        lat: last.lat + latDiff,
        lon: last.lon + lonDiff
    };
}