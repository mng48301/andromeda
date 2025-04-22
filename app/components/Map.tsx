'use client';

import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Balloon, WeatherData } from '../types';
import { fetchWeatherData, fetchBalloonHistory, checkDangerConditions, predictNextPosition, isInDangerousArea } from '../utils/balloonUtils';

// Create custom warning icon
const warningIcon = new L.Icon({
    iconUrl: '/warning.svg',
    iconSize: [32, 32],
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
const DEFAULT_CENTER: [number, number] = [58, -70];
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
                        <li><strong>Warning symbols</strong> (⚠️) appear above balloons in dangerous conditions (high altitude, extreme cold, etc)</li>
                        <li>Click on a balloon or warning symbol to see <strong>detailed weather information</strong></li>
                    </ul>
                    <div className="mt-4 p-2 bg-gray-100 rounded">
                        <p className="font-semibold">Keyboard Shortcuts:</p>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>/ - Search Balloons</div>
                            <div>h - Toggle Heatmap</div>
                            <div>Esc - Close Panels</div>
                        </div>
                    </div>
                    <div className="mt-4 p-2 bg-gray-100 rounded">
                        <p className="font-semibold">Legend:</p>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>🎈 Active Balloon</div>
                            <div>⚠️ Warning Condition</div>
                            <div>━━ Historical Path</div>
                            <div>┈ ┈ Predicted Path</div>
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-gray-500">
                        Use the stats panel and search feature for quick balloon analysis.
                    </div>
                </div>
            )}
        </div>
    );
}

// Controls Panel Component for temperature toggle only
const ControlsPanel = memo(function ControlsPanel({ showHeatmap, setShowHeatmap }: { showHeatmap: boolean; setShowHeatmap: (show: boolean) => void }) {
    return (
        <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            className="bg-white px-4 py-2 rounded-lg shadow-lg hover:bg-gray-50 transition-colors w-full"
        >
            {showHeatmap ? 'Hide Temperature' : 'Show Temperature'}
        </button>
    );
});

// Stats Panel Component
const StatsPanel = memo(function StatsPanel({ balloons, weatherData }: { balloons: Balloon[]; weatherData: Record<string, WeatherData> }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const stats = useMemo(() => {
        return {
            totalBalloons: balloons.length,
            avgAltitude: balloons.reduce((sum, b) => sum + b.alt, 0) / balloons.length,
            avgTemp: Object.values(weatherData).reduce((sum, w) => sum + (w.temperature || 0), 0) / Object.values(weatherData).length,
            dangerCount: balloons.reduce((count, balloon) => {
                const weather = weatherData[balloon.id];
                const weatherDanger = weather ? checkDangerConditions(weather).isDangerous : false;
                const locationDanger = isInDangerousArea(balloon.lat, balloon.lon, balloon.alt).isDangerous;
                return count + (weatherDanger || locationDanger ? 1 : 0);
            }, 0)
        };
    }, [balloons, weatherData]);

    return (
        <div className="relative">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600 transition-colors w-full"
            >
                {isExpanded ? 'Hide Stats' : 'Show Stats'}
            </button>
            
            {isExpanded && (
                <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-lg p-4 w-64 z-20">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-sm text-gray-600">Total Balloons</div>
                                <div className="text-xl font-semibold">{stats.totalBalloons}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">In Danger</div>
                                <div className="text-xl font-semibold text-red-500">{stats.dangerCount}</div>
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">Average Altitude</div>
                            <div className="text-xl font-semibold">{stats.avgAltitude.toFixed(0)}m</div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                                <div 
                                    className="bg-blue-500 rounded-full h-2" 
                                    style={{ width: `${Math.min((stats.avgAltitude / 15000) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">Average Temperature</div>
                            <div className="text-xl font-semibold">{stats.avgTemp.toFixed(1)}°C</div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                                <div 
                                    className={`rounded-full h-2 ${stats.avgTemp < 0 ? 'bg-blue-500' : 'bg-red-500'}`}
                                    style={{ width: `${Math.min(Math.abs(stats.avgTemp / 40) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

// Search Panel Component
const SearchPanel = memo(function SearchPanel({ 
    balloons, 
    onBalloonSelect 
}: { 
    balloons: Balloon[]; 
    onBalloonSelect: (balloon: Balloon) => void;
}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [isExpanded, setIsExpanded] = useState(false);

    const filteredBalloons = useMemo(() => {
        if (!searchQuery) return [];
        const query = searchQuery.toLowerCase();
        return balloons.filter(b => 
            b.id.toLowerCase().includes(query) || 
            b.alt.toString().includes(query) ||
            b.lat.toString().includes(query) ||
            b.lon.toString().includes(query)
        );
    }, [balloons, searchQuery]);

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key === "/" && !isExpanded) {
                e.preventDefault();
                setIsExpanded(true);
            } else if (e.key === "Escape" && isExpanded) {
                setIsExpanded(false);
            }
        };

        document.addEventListener("keydown", handleKeyPress as any);
        return () => document.removeEventListener("keydown", handleKeyPress as any);
    }, [isExpanded]);

    return (
        <div className="relative">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-white px-4 py-2 rounded-lg shadow-lg hover:bg-gray-50 transition-colors w-full flex items-center justify-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search (Press "/")
            </button>
            
            {isExpanded && (
                <div className="absolute top-full mt-2 right-0 bg-white rounded-lg shadow-lg p-4 w-80 z-10">
                    <div className="flex items-center gap-2 mb-4">
                        <input
                            type="text"
                            placeholder="Search balloons..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                        />
                    </div>
                    {filteredBalloons.length > 0 ? (
                        <div className="space-y-2 max-h-60 overflow-auto">
                            {filteredBalloons.map(balloon => (
                                <button
                                    key={balloon.id}
                                    onClick={() => {
                                        onBalloonSelect(balloon);
                                        setSearchQuery("");
                                    }}
                                    className="w-full p-2 text-left hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <div className="font-semibold">Balloon {balloon.id}</div>
                                    <div className="text-sm text-gray-600">
                                        Alt: {balloon.alt.toFixed(0)}m | Lat: {balloon.lat.toFixed(2)} | Lon: {balloon.lon.toFixed(2)}
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : searchQuery && (
                        <div className="text-gray-500 text-center py-4">
                            No balloons found matching "{searchQuery}"
                        </div>
                    )}
                    <div className="mt-4 text-xs text-gray-500">
                        Press "Esc" to close
                    </div>
                </div>
            )}
        </div>
    );
});

// Animated Balloon Marker Component
const AnimatedBalloonMarker = memo(function AnimatedBalloonMarker({ 
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
    const locationDanger = isInDangerousArea(balloon.lat, balloon.lon, balloon.alt);
    const showWarning = isDangerous || locationDanger.isDangerous;
    const warningReason = locationDanger.isDangerous ? locationDanger.reason : (weather ? checkDangerConditions(weather).reason : undefined);

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
            {showWarning && (
                <Marker
                    position={[balloon.lat + 0.1, balloon.lon]}
                    icon={warningIcon}
                >
                    <Popup>
                        <div className="p-2">
                            <h3 className="font-bold text-red-500">Warning</h3>
                            <p>{warningReason}</p>
                        </div>
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
});

export default function Map({ balloons }: MapProps) {
    const [selectedBalloon, setSelectedBalloon] = useState<string | null>(null);
    const [weatherData, setWeatherData] = useState<Record<string, WeatherData>>({});
    const [flightPaths, setFlightPaths] = useState<Record<string, { past: [number, number][], predicted: [number, number][] }>>({});
    const [mapBounds, setMapBounds] = useState<L.LatLngBoundsExpression | null>(null);
    const [showHeatmap, setShowHeatmap] = useState(false);

    const memoizedWeatherData = useMemo(() => {
        return Object.entries(weatherData).reduce((acc, [id, data]) => ({
            ...acc,
            [id]: {
                ...data,
                isDangerous: checkDangerConditions(data).isDangerous
            }
        }), {});
    }, [weatherData]);

    const memoizedFlightPaths = useMemo(() => flightPaths, [flightPaths]);

    // Fetch weather data for balloons
    useEffect(() => {
        const fetchWeather = async () => {
            const weatherPromises = balloons.map(async (balloon) => {
                try {
                    const data = await fetchWeatherData(balloon.lat, balloon.lon);
                    return [balloon.id, data] as const;
                } catch {
                    console.warn('Weather data unavailable for balloon:', balloon.id);
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
            
            const currentPosition: [number, number, number] = [balloon.lat, balloon.lon, balloon.alt];
            const hours = Array.from({ length: 6 }, (_, i) => i + 1);
            console.log('Fetching history for balloon:', balloon.id, currentPosition);
            
            const history = await fetchBalloonHistory(hours, currentPosition);
            console.log('Received history:', history);

            if (history.positions && history.positions.length > 0) {
                const pastPath = [[balloon.lat, balloon.lon] as [number, number]];
                history.positions.forEach(pos => {
                    pastPath.unshift([pos.lat, pos.lon]);
                });

                const prediction = predictNextPosition([
                    ...history.positions.slice(-2),
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

                const allPoints = [...pastPath, ...predictedPath];
                if (allPoints.length > 0) {
                    const bounds = L.latLngBounds(allPoints.map(([lat, lon]) => [lat, lon]));
                    bounds.extend([balloon.lat, balloon.lon]);
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

                {showHeatmap && (
                    <LayersControl.Overlay checked name="Temperature">
                        <TileLayer
                            url={`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${process.env.NEXT_PUBLIC_WEATHER_API_KEY}`}
                            opacity={0.5}
                        />
                    </LayersControl.Overlay>
                )}
            </LayersControl>

            <BoundsFitter bounds={mapBounds} />
            <InstructionsPanel />
            <div className="absolute top-24 right-4 z-[1000] flex flex-col gap-2 w-[200px]">
                <SearchPanel balloons={balloons} onBalloonSelect={handleBalloonClick} />
                <StatsPanel balloons={balloons} weatherData={memoizedWeatherData} />
                <ControlsPanel showHeatmap={showHeatmap} setShowHeatmap={setShowHeatmap} />
            </div>
            <MarkerClusterGroup>
                {balloons.map((balloon) => {
                    const weather = memoizedWeatherData[balloon.id];
                    const weatherDanger = weather?.isDangerous || false;
                    const flightPath = memoizedFlightPaths[balloon.id];

                    return (
                        <AnimatedBalloonMarker
                            key={balloon.id}
                            balloon={balloon}
                            weather={weather}
                            isDangerous={weatherDanger}
                            flightPath={flightPath}
                            onBalloonClick={handleBalloonClick}
                        />
                    );
                })}
            </MarkerClusterGroup>
        </MapContainer>
    );
}