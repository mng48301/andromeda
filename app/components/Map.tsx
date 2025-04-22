'use client';

import { useEffect, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
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
                        <li><strong>Click</strong> on any <strong>balloon cluster</strong> to view individual balloons</li>
                        <li><strong>Select</strong> any balloon to view its <strong>historical flight path</strong> (green line) and <strong>predicted trajectory</strong> (purple dashed line)</li>
                        <li><strong>Warning symbols</strong> (⚠️) appear above balloons in dangerous conditions</li>
                        <li>Click on a balloon or warning symbol to see <strong>detailed weather information</strong></li>
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

function WeatherRadar() {
    const map = useMap();
    const [opacity, setOpacity] = useState(0.5);

    useEffect(() => {
        if (!process.env.NEXT_PUBLIC_WEATHER_API_KEY) return;

        const weatherLayer = L.tileLayer(
            `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${process.env.NEXT_PUBLIC_WEATHER_API_KEY}`,
            {
                opacity: opacity
            }
        ).addTo(map);

        return () => {
            map.removeLayer(weatherLayer);
        };
    }, [map, opacity]);

    return (
        <div className="absolute bottom-4 right-4 z-[1000] bg-white p-2 rounded-lg shadow-lg">
            <label className="block text-sm font-medium text-gray-700">
                Radar Opacity
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full"
                />
            </label>
        </div>
    );
}

function WindIndicator({ lat, lon, weather }: { lat: number; lon: number; weather: WeatherData }) {
    const windDirection = weather.windDeg || 0;
    const windSpeed = weather.windSpeed || 0;

    return (
        <div
            className="absolute w-6 h-6 transform -translate-x-1/2 -translate-y-1/2"
            style={{
                transform: `rotate(${windDirection}deg)`
            }}
        >
            <div className="w-0 h-0 border-l-8 border-r-8 border-b-[16px] border-transparent border-b-blue-500 opacity-70" />
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 text-xs whitespace-nowrap">
                {windSpeed.toFixed(1)} m/s
            </div>
        </div>
    );
}

// Animated Balloon Marker Component
function AnimatedBalloonMarker({ 
    balloon, 
    weather, 
    isDangerous, 
    flightPath, 
    onBalloonClick 
}: { 
    balloon: Balloon;
    weather: WeatherData | undefined;
    isDangerous: boolean;
    flightPath: { past: [number, number][]; predicted: [number, number][] } | undefined;
    onBalloonClick: (balloon: Balloon) => void;
}) {
    const [position, setPosition] = useState<[number, number]>([balloon.lat, balloon.lon]);

    useEffect(() => {
        const steps = 30;
        const duration = 1000;
        const stepTime = duration / steps;
        
        let step = 0;
        const startLat = position[0];
        const startLon = position[1];
        const latDiff = balloon.lat - startLat;
        const lonDiff = balloon.lon - startLon;

        const interval = setInterval(() => {
            step++;
            if (step <= steps) {
                const progress = step / steps;
                setPosition([
                    startLat + latDiff * progress,
                    startLon + lonDiff * progress
                ]);
            } else {
                clearInterval(interval);
            }
        }, stepTime);

        return () => clearInterval(interval);
    }, [balloon.lat, balloon.lon]);

    return (
        <>
            {isDangerous && (
                <Marker
                    position={[balloon.lat + 0.1, balloon.lon]}
                    icon={warningIcon}
                >
                    <Popup>
                        Warning: {checkDangerConditions(weather!).reason}
                    </Popup>
                </Marker>
            )}
            <Marker
                position={position}
                icon={balloonIcon}
                eventHandlers={{
                    click: () => onBalloonClick(balloon)
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
                                {weather.windSpeed && (
                                    <p>Wind: {weather.windSpeed.toFixed(1)} m/s at {weather.windDeg}°</p>
                                )}
                            </>
                        )}
                    </div>
                </Popup>
            </Marker>
            {weather && weather.windSpeed && (
                <WindIndicator
                    lat={balloon.lat}
                    lon={balloon.lon}
                    weather={weather}
                />
            )}
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
        </>
    );
}

export default function Map({ balloons }: MapProps) {
    const [selectedBalloon, setSelectedBalloon] = useState<string | null>(null);
    const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
    const [flightPaths, setFlightPaths] = useState<Record<string, { past: [number, number][], predicted: [number, number][] }>>({});
    const [mapBounds, setMapBounds] = useState<L.LatLngBoundsExpression | null>(null);

    // Add new state for layer visibility
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [showRadar, setShowRadar] = useState(true);

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
            <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="OpenStreetMap">
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                </LayersControl.BaseLayer>
                
                <LayersControl.BaseLayer name="Satellite">
                    <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                    />
                </LayersControl.BaseLayer>

                <LayersControl.Overlay checked={showRadar} name="Weather Radar">
                    {showRadar && <WeatherRadar />}
                </LayersControl.Overlay>

                <LayersControl.Overlay checked={showHeatmap} name="Temperature Heatmap">
                    {showHeatmap && (
                        <TileLayer
                            url={`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${process.env.NEXT_PUBLIC_WEATHER_API_KEY}`}
                            opacity={0.5}
                        />
                    )}
                </LayersControl.Overlay>
            </LayersControl>

            <BoundsFitter bounds={mapBounds} />
            <InstructionsPanel />

            <MarkerClusterGroup>
                {balloons.map((balloon) => {
                    const weather = weatherData[balloon.id];
                    const isDangerous = weather && checkDangerConditions(weather).isDangerous;
                    const flightPath = flightPaths[balloon.id];

                    return (
                        <AnimatedBalloonMarker
                            key={balloon.id}
                            balloon={balloon}
                            weather={weather}
                            isDangerous={isDangerous}
                            flightPath={flightPath}
                            onBalloonClick={handleBalloonClick}
                        />
                    );
                })}
            </MarkerClusterGroup>
        </MapContainer>
    );
}