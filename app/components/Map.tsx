'use client';

import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Balloon, WeatherData } from '../types';
import { fetchWeatherData, fetchBalloonHistory, checkDangerConditions, predictNextPosition } from '../utils/balloonUtils';

// Create custom warning icon
const warningIcon = new L.Icon({
    iconUrl: '/warning.svg',
    iconSize: [32, 32], // Made larger for better visibility
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
});

// Create balloon icon
const balloonIcon = new L.Icon({
    iconUrl: '/globe.svg',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
});

// Default map settings
const DEFAULT_CENTER: [number, number] = [58, -70]; // Centered over Northern Canada
const DEFAULT_ZOOM = 4;

interface MapProps {
    balloons: Balloon[];
}

// Component to fit bounds when trajectories are shown
function BoundsFitter({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
    const map = useMap();
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [map, bounds]);
    return null;
}

// Instructions Panel Component
function InstructionsPanel() {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="absolute top-4 left-4 z-[1000] bg-white rounded-lg shadow-lg max-w-md">
            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-4 py-2 text-left font-semibold bg-blue-500 text-white rounded-t-lg hover:bg-blue-600 transition-colors flex items-center justify-between"
            >
                <span><strong>Maxim Glisky</strong></span>
                <span className="text-xl">{isExpanded ? '−' : '+'}</span>
            </button>
            {isExpanded && (
                <div className="p-4 space-y-2 text-sm">
                    <h3 className="font-bold text-lg mb-2">Instructions (windborne project):</h3>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>Each marker represents a high-altitude balloon in real-time</li>
                        <li>Click on any balloon to view its historical flight path (green line) and predicted trajectory (purple dashed line)</li>
                        <li>Warning symbols (⚠️) appear above balloons in dangerous conditions</li>
                        <li>Click on a balloon or warning symbol to see detailed weather information</li>
                        <li>Click on an active balloon again to hide its flight path</li>
                    </ul>
                    <div className="mt-4 p-2 bg-gray-100 rounded">
                        <p className="font-semibold">Legend:</p>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>🎈 Active Balloon</div>
                            <div>⚠️ Warning Condition</div>
                            <div>━━ Historical Path</div>
                            <div>┈ ┈ Predicted Path</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Map({ balloons }: MapProps) {
    const [selectedBalloon, setSelectedBalloon] = useState<string | null>(null);
    const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
    const [flightPaths, setFlightPaths] = useState<Record<string, { past: [number, number][], predicted: [number, number][] }>>({});
    const [mapBounds, setMapBounds] = useState<L.LatLngBoundsExpression | null>(null);

    // Fetch weather data for balloons
    useEffect(() => {
        const fetchWeather = async () => {
            const weatherPromises = balloons.map(async (balloon) => {
                try {
                    const data = await fetchWeatherData(balloon.lat, balloon.lon);
                    return [balloon.id, data] as const;
                } catch {
                    console.warn('Weather data unavailable for balloon:', balloon.id);
                    // Use more realistic default values for high-altitude conditions
                    return [balloon.id, { temperature: -20, pressure: 500 }] as const;
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

    const handleBalloonClick = useCallback(async (balloon: Balloon) => {
        try {
            if (selectedBalloon === balloon.id) {
                setSelectedBalloon(null);
                setFlightPaths(prev => {
                    const updated = { ...prev };
                    delete updated[balloon.id];
                    return updated;
                });
                setMapBounds(null);
                return;
            }

            setSelectedBalloon(balloon.id);
            
            // Current balloon position for historical tracking
            const currentPosition: [number, number, number] = [balloon.lat, balloon.lon, balloon.alt];
            
            // Generate hours array for last 6 hours
            const hours = Array.from({ length: 6 }, (_, i) => i + 1);
            console.log('Fetching history for balloon:', balloon.id, currentPosition);
            
            const history = await fetchBalloonHistory(hours, currentPosition);
            console.log('Received history:', history);

            if (history.positions && history.positions.length > 0) {
                // Create past path starting with current position
                const pastPath = [[balloon.lat, balloon.lon] as [number, number]];
                history.positions.forEach(pos => {
                    pastPath.unshift([pos.lat, pos.lon]); // unshift to add older positions at the start
                });

                // Calculate predicted position using the most recent positions
                const prediction = predictNextPosition([
                    ...history.positions.slice(-2), // Take last two historical positions
                    { lat: balloon.lat, lon: balloon.lon, timestamp: new Date().toISOString() }
                ]);

                const predictedPath = prediction 
                    ? [[balloon.lat, balloon.lon], [prediction.lat, prediction.lon]] as [number, number][]
                    : [];

                console.log('Setting flight paths:', {
                    balloon: balloon.id,
                    past: pastPath,
                    predicted: predictedPath
                });

                setFlightPaths(prev => ({
                    ...prev,
                    [balloon.id]: {
                        past: pastPath,
                        predicted: predictedPath
                    }
                }));

                // Calculate bounds to include all points
                const allPoints = [...pastPath, ...predictedPath];
                if (allPoints.length > 0) {
                    const bounds = L.latLngBounds(allPoints.map(([lat, lon]) => [lat, lon]));
                    bounds.extend([balloon.lat, balloon.lon]); // Include current position
                    setMapBounds(bounds);
                }
            } else {
                console.warn('No historical positions found for balloon:', balloon.id);
            }
        } catch (err) {
            console.error('Failed to process balloon click:', err);
        }
    }, [selectedBalloon]);

    if (!balloons || balloons.length === 0) {
        return (
            <MapContainer
                center={DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                style={{ height: '100vh', width: '100%' }}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <InstructionsPanel />
            </MapContainer>
        );
    }

    return (
        <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: '100vh', width: '100%' }}
        >
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <BoundsFitter bounds={mapBounds} />
            <InstructionsPanel />
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
                                {flightPath.predicted.length > 0 && (
                                    <Polyline
                                        positions={flightPath.predicted}
                                        color="purple"
                                        weight={3}
                                        dashArray="5, 10"
                                    />
                                )}
                            </>
                        )}
                    </div>
                );
            })}
        </MapContainer>
    );
}