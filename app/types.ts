export interface Balloon {
    id: string;
    lat: number;
    lon: number;
    alt: number;
    timestamp: string;
}

export interface WeatherData {
    temperature: number;
    pressure: number;
    windSpeed?: number;
    windDeg?: number;
}

export interface BalloonHistory {
    positions: {
        lat: number;
        lon: number;
        timestamp: string;
    }[];
}

export interface DangerCondition {
    isDangerous: boolean;
    reason?: string;
}