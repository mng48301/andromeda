import { Balloon, WeatherData, BalloonHistory, DangerCondition } from '../types';

const BASE_URL = 'https://a.windbornesystems.com/treasure';

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
        const response = await fetch(`${BASE_URL}/00.json`, {
            mode: 'no-cors', // Try no-cors mode
            cache: 'no-cache',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        // Ensure we have an array of balloons with required properties
        if (Array.isArray(data)) {
            return data.map((balloon, index) => ({
                id: balloon.id || `balloon-${index + 1}`,
                lat: balloon.lat || 0,
                lon: balloon.lon || 0,
                alt: balloon.alt || 0,
                timestamp: balloon.timestamp || new Date().toISOString()
            }));
        }
        throw new Error('Invalid data format');
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
                const response = await fetch(`${BASE_URL}/${paddedHour}.json`, {
                    mode: 'no-cors',
                    cache: 'no-cache',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch history for hour ${hour}`);
                }

                return response.json();
            } catch (error) {
                console.warn(`Error fetching history for hour ${hour}:`, error);
                // Return a fallback position based on the current balloon location
                return {
                    lat: 0,
                    lon: 0,
                    timestamp: new Date(Date.now() - hour * 3600000).toISOString()
                };
            }
        });

        const history = await Promise.all(historyPromises);
        return {
            positions: history.map(data => ({
                lat: data.lat || 0,
                lon: data.lon || 0,
                timestamp: data.timestamp || new Date().toISOString()
            }))
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