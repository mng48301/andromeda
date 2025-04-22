'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Balloon, WeatherData } from '../types';
import { fetchWeatherData, fetchBalloonHistory, checkDangerConditions, predictNextPosition } from '../utils/balloonUtils';

// Initialize default icon settings for Leaflet
const DefaultIcon = L.Icon.Default;
L.Icon.Default.imagePath = '/';

// Create custom warning icon
const warningIcon = new L.Icon({
    iconUrl: '/warning.svg',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -12],
});

// Create balloon icon
const balloonIcon = new L.Icon({
    iconUrl: '/globe.svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
});

interface MapProps {
    balloons: Balloon[];
}

export default function Map({ balloons }: MapProps) {
    const [selectedBalloon, setSelectedBalloon] = useState<string | null>(null);
    const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
    const [flightPaths, setFlightPaths] = useState<Record<string, { past: [number, number][], predicted: [number, number][] }>>({});

    // Fetch weather data for balloons
    useEffect(() => {
        const fetchWeather = async () => {
            const weatherPromises = balloons.map(async (balloon) => {
                try {
                    const data = await fetchWeatherData(balloon.lat, balloon.lon);
                    return [balloon.id, data] as const;
                } catch (error) {
                    console.warn('Weather data unavailable for balloon:', balloon.id);
                    return [balloon.id, { temperature: 20, pressure: 1013 }] as const;
                }
            });

            const results = await Promise.all(weatherPromises);
            const newWeatherData: Record<string, WeatherData> = {};
            results.forEach(([id, data]) => {
                newWeatherData[id] = data;
            });
            setWeatherData(newWeatherData);
        };

        if (balloons.length > 0) {
            fetchWeather();
        }
    }, [balloons]);

    // Handle balloon selection and fetch historical data
    const handleBalloonClick = async (balloon: Balloon) => {
        try {
            if (selectedBalloon === balloon.id) {
                setSelectedBalloon(null);
                const updatedPaths = { ...flightPaths };
                delete updatedPaths[balloon.id];
                setFlightPaths(updatedPaths);
                return;
            }

            setSelectedBalloon(balloon.id);
            
            // Generate hours array for last 6 hours
            const hours = Array.from({length: 6}, (_, i) => i + 1);
            const history = await fetchBalloonHistory(hours);
            
            if (history.positions.length > 0) {
                const pastPath = history.positions.map(pos => [pos.lat, pos.lon] as [number, number]);
                pastPath.unshift([balloon.lat, balloon.lon]); // Add current position
                
                // Calculate predicted position
                const prediction = predictNextPosition([...history.positions, balloon]);
                const predictedPath = prediction ? [[balloon.lat, balloon.lon], [prediction.lat, prediction.lon]] as [number, number][] : [];
                
                setFlightPaths({
                    ...flightPaths,
                    [balloon.id]: {
                        past: pastPath,
                        predicted: predictedPath
                    }
                });
            }
        } catch (error) {
            console.error('Error handling balloon click:', error);
        }
    };

    if (!balloons || balloons.length === 0) {
        return (
            <MapContainer
                center={[0, 0]}
                zoom={2}
                style={{ height: '100vh', width: '100%' }}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
            </MapContainer>
        );
    }

    // Calculate map center based on balloon positions
    const center: [number, number] = balloons.length > 0
        ? [balloons[0].lat, balloons[0].lon]
        : [0, 0];

    return (
        <MapContainer
            center={center}
            zoom={4}
            style={{ height: '100vh', width: '100%' }}
        >
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {balloons.map((balloon) => {
                const weather = weatherData[balloon.id];
                const isDangerous = weather && checkDangerConditions(weather).isDangerous;
                const flightPath = flightPaths[balloon.id];

                return (
                    <div key={balloon.id}>
                        {isDangerous && (
                            <Marker
                                position={[balloon.lat + 0.1, balloon.lon]}
                                icon={warningIcon}
                            >
                                <Popup>
                                    Warning: {checkDangerConditions(weather).reason}
                                </Popup>
                            </Marker>
                        )}
                        <Marker
                            position={[balloon.lat, balloon.lon]}
                            icon={balloonIcon}
                            eventHandlers={{
                                click: () => handleBalloonClick(balloon)
                            }}
                        >
                            <Popup>
                                <div className="p-2">
                                    <h3 className="font-bold">Balloon {balloon.id}</h3>
                                    <p>Altitude: {balloon.alt.toFixed(0)}m</p>
                                    {weather && (
                                        <>
                                            <p>Temperature: {weather.temperature.toFixed(1)}°C</p>
                                            <p>Pressure: {weather.pressure} hPa</p>
                                        </>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                        {flightPath && (
                            <>
                                <Polyline
                                    positions={flightPath.past}
                                    color="green"
                                    weight={3}
                                />
                                <Polyline
                                    positions={flightPath.predicted}
                                    color="purple"
                                    weight={3}
                                    dashArray="5, 10"
                                />
                            </>
                        )}
                    </div>
                );
            })}
        </MapContainer>
    );
}