import { Balloon, WeatherData, BalloonHistory, DangerCondition } from '../types';

const EXTERNAL_BASE_URL = 'https://a.windbornesystems.com/treasure';
const LOCAL_API_URL = '/api/balloons';

// Sample data for development/fallback
const SAMPLE_BALLOONS: Balloon[] = [
    {
        id: 'balloon-1',
        lat: 40.7128,
        lon: -74.0060,
        alt: 30000,
        timestamp: new Date().toISOString()
    },
    {
        id: 'balloon-2',
        lat: 34.0522,
        lon: -118.2437,
        alt: 25000,
        timestamp: new Date().toISOString()
    }
];

export async function fetchCurrentBalloons(): Promise<Balloon[]> {
    try {
        console.log('Fetching balloon data...');
        const response = await fetch(LOCAL_API_URL);

        if (!response.ok) {
            console.error('Response not OK:', response.status, response.statusText);
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        console.log('Raw API data:', data);
        
        // Data should be an array of [lat, lon, alt] arrays
        if (!Array.isArray(data)) {
            console.error('Data is not an array:', data);
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
        
        console.log('Processed balloons:', balloons);
        if (balloons.length === 0) {
            console.warn('No valid balloons found in data');
            return SAMPLE_BALLOONS;
        }
        return balloons;
    } catch (error) {
        console.warn('Error fetching balloon data, using sample data:', error);
        return SAMPLE_BALLOONS;
    }
}

export async function fetchBalloonHistory(hours: number[]): Promise<BalloonHistory> {
    try {
        const historyPromises = hours.map(async (hour) => {
            try {
                const paddedHour = hour.toString().padStart(2, '0');
                const response = await fetch(`${EXTERNAL_BASE_URL}/${paddedHour}.json`, {
                    headers: {
                        'Accept': 'application/json'
                    },
                    cache: 'no-cache'
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch history for hour ${hour}`);
                }

                const data = await response.json();
                // Find matching balloon in historical data
                if (Array.isArray(data)) {
                    return data.map((pos) => ({
                        lat: Number(pos[0]) || 0,
                        lon: Number(pos[1]) || 0,
                        timestamp: new Date(Date.now() - hour * 3600000).toISOString()
                    }));
                }
                throw new Error('Invalid historical data format');
            } catch (error) {
                console.warn(`Error fetching history for hour ${hour}:`, error);
                return [];
            }
        });

        const historyArrays = await Promise.all(historyPromises);
        // Flatten all positions into a single array
        return {
            positions: historyArrays.flat()
        };
    } catch (error) {
        console.error('Error fetching balloon history:', error);
        return { positions: [] };
    }
}

export async function fetchWeatherData(lat: number, lon: number): Promise<WeatherData> {
    try {
        const API_KEY = process.env.NEXT_PUBLIC_WEATHER_API_KEY;
        if (!API_KEY) {
            throw new Error('Weather API key is not configured');
        }

        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
        );

        if (!response.ok) {
            throw new Error('Weather API request failed');
        }

        const data = await response.json();
        
        // Ensure we have the required properties
        if (!data.main || typeof data.main.temp === 'undefined' || typeof data.main.pressure === 'undefined') {
            throw new Error('Invalid weather data format');
        }

        return {
            temperature: data.main.temp,
            pressure: data.main.pressure
        };
    } catch (error) {
        console.error('Error fetching weather data:', error);
        // Return safe default values
        return {
            temperature: 20,
            pressure: 1013
        };
    }
}

export function checkDangerConditions(weather: WeatherData): DangerCondition {
    const dangerousTemp = -40; // Celsius
    const dangerousPressure = 300; // hPa

    if (weather.temperature < dangerousTemp) {
        return { isDangerous: true, reason: 'Extreme cold temperature' };
    }
    if (weather.pressure < dangerousPressure) {
        return { isDangerous: true, reason: 'Dangerously low pressure' };
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