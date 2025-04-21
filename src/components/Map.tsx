'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { BalloonData, predictNextPosition } from '@/services/balloonService';
import { WeatherData, fetchWeatherByCoordinates } from '@/services/weatherService';
import type { Feature, LineString } from 'geojson';
import * as turf from '@turf/turf';

interface MapProps {
  balloonData: BalloonData[];
}

interface WeatherWarning {
  type: 'storm' | 'temperature' | 'wind';
  severity: 'low' | 'medium' | 'high';
  message: string;
}

interface WeatherLayerState {
  radar: boolean;
  temperature: boolean;
  clouds: boolean;
}

const Map = ({ balloonData }: MapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const animationFrame = useRef<number | null>(null);
  const [selectedBalloon, setSelectedBalloon] = useState<[number, number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [weatherLayers, setWeatherLayers] = useState<WeatherLayerState>({
    radar: true,
    temperature: false,
    clouds: true
  });

  const [currentWeatherInfo, setCurrentWeatherInfo] = useState<{
    data: WeatherData | null;
    warnings: WeatherWarning[];
  }>({
    data: null,
    warnings: []
  });

  const [predictedPath, setPredictedPath] = useState<Feature<LineString> | null>(null);

  const getMap = () => {
    if (!map.current) {
      throw new Error('Map not initialized');
    }
    return map.current;
  };

  const createWarningSymbol = () => {
    const warningSymbol = document.createElement('div');
    warningSymbol.className = 'warning-symbol';
    warningSymbol.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2L2 28H30L16 2Z" fill="#FF0000"/>
        <path d="M16 12V20" stroke="white" stroke-width="3" stroke-linecap="round"/>
        <circle cx="16" cy="24" r="2" fill="white"/>
      </svg>
    `;
    warningSymbol.style.position = 'absolute';
    warningSymbol.style.top = '-36px';
    warningSymbol.style.left = '-16px';
    warningSymbol.style.animation = 'warning-bounce 1s ease-in-out infinite';
    warningSymbol.style.pointerEvents = 'none';
    warningSymbol.style.zIndex = '10';
    return warningSymbol;
  };

  const createMarker = (position: [number, number, number]) => {
    const [lng, lat, altitude] = position;
    
    const markerContainer = document.createElement('div');
    markerContainer.className = 'marker-container';
    markerContainer.style.cssText = `
      position: relative;
      width: 0;
      height: 0;
    `;

    const markerEl = document.createElement('div');
    markerEl.className = 'custom-marker';
    markerEl.style.cssText = `
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid white;
      background-color: #ff0000;
      cursor: pointer;
      position: absolute;
      transform: translate(-50%, -50%);
      transform-origin: center;
    `;
    markerContainer.appendChild(markerEl);

    const marker = new mapboxgl.Marker({
      element: markerContainer,
      rotationAlignment: 'map',
      pitchAlignment: 'map'
    })
      .setLngLat([lng, lat])
      .setPopup(
        new mapboxgl.Popup({ 
          offset: 25,
          anchor: 'bottom',
          closeButton: true,
          closeOnClick: false
        })
          .setHTML(`
            <div class="p-2">
              <h3 class="font-bold mb-2">Balloon</h3>
              <p class="mb-2">Altitude: ${altitude.toFixed(2)} km</p>
            </div>
          `)
      );

    return { marker, markerEl, markerContainer };
  };

  const animateFlightPath = (path: [number, number, number][]) => {
    if (!map.current || path.length < 2) return;
    setIsAnimating(true);

    const line: Feature<LineString> = {
      type: 'Feature',
      properties: { pathType: 'historical' },
      geometry: {
        type: 'LineString',
        coordinates: path.map(([lng, lat]) => [lng, lat])
      }
    };

    // Initialize with first two points to ensure valid LineString
    const animatedLine = turf.lineString([
      [path[0][0], path[0][1]],
      [path[1][0], path[1][1]]
    ]);
    let step = 0;
    const steps = 100;
    
    const animate = () => {
      const portion = path.slice(0, Math.ceil((step / steps) * path.length));
      if (portion.length < 2) {
        setIsAnimating(false);
        return;
      }

      animatedLine.geometry.coordinates = portion.map(([lng, lat]) => [lng, lat]);
      
      if (map.current) {
        const source = map.current.getSource('flightPaths');
        if (source && 'setData' in source) {
          source.setData({
            type: 'FeatureCollection',
            features: [line]
          });
        }
      }

      step++;
      if (step <= steps) {
        animationFrame.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    animate();
  };

  const findBalloonHistory = (position: [number, number, number]): [number, number, number][] => {
    const [targetLng, targetLat] = position;
    return balloonData
      .map(hourData => 
        hourData.find(([lng, lat]) => 
          Math.abs(lng - targetLng) < 0.0001 && Math.abs(lat - targetLat) < 0.0001
        )
      )
      .filter((pos): pos is [number, number, number] => pos !== undefined);
  };

  const createPredictedPath = async (
    position: [number, number, number], 
    weatherData: any
  ): Promise<Feature<LineString>> => {
    const steps = 20; // Number of prediction steps
    const predictions: [number, number, number][] = [position];
    
    let currentPos = position;
    for (let i = 0; i < steps; i++) {
      currentPos = predictNextPosition(currentPos, weatherData);
      predictions.push(currentPos);
    }
    
    return {
      type: 'Feature',
      properties: { pathType: 'predicted' },
      geometry: {
        type: 'LineString',
        coordinates: predictions.map(([lng, lat]) => [lng, lat])
      }
    };
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    try {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      if (!token) {
        setError('Mapbox token is not configured');
        return;
      }

      mapboxgl.accessToken = token;

      const newMap = new mapboxgl.Map({
        container: mapContainer.current as HTMLElement,
        style: 'mapbox://styles/mapbox/satellite-v9',
        center: [-80, 75],
        zoom: 2.8
      });

      map.current = newMap;

      newMap.on('load', () => {
        newMap.addSource('weather-radar', {
          type: 'raster',
          tiles: [
            `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY}`
          ],
          tileSize: 256,
          maxzoom: 12
        });

        newMap.addLayer({
          id: 'weather-radar',
          type: 'raster',
          source: 'weather-radar',
          paint: {
            'raster-opacity': 0.6
          },
          layout: {
            visibility: 'visible'
          }
        });

        newMap.addSource('weather-temp', {
          type: 'raster',
          tiles: [
            `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY}`
          ],
          tileSize: 256,
          maxzoom: 12
        });

        newMap.addLayer({
          id: 'weather-temp',
          type: 'raster',
          source: 'weather-temp',
          paint: {
            'raster-opacity': 0.4
          },
          layout: {
            visibility: 'none'
          }
        });

        newMap.addSource('weather-clouds', {
          type: 'raster',
          tiles: [
            `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY}`
          ],
          tileSize: 256,
          maxzoom: 12
        });

        newMap.addLayer({
          id: 'weather-clouds',
          type: 'raster',
          source: 'weather-clouds',
          paint: {
            'raster-opacity': 0.5
          },
          layout: {
            visibility: 'visible'
          }
        });

        newMap.addSource('flightPaths', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        newMap.addSource('weatherOverlay', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        newMap.addLayer({
          id: 'flightPaths',
          type: 'line',
          source: 'flightPaths',
          paint: {
            'line-color': [
              'match',
              ['get', 'pathType'],
              'historical', '#00ff00',
              'predicted', '#ff9900',
              'animated', '#ff0000',
              '#00ff00'
            ],
            'line-width': [
              'match',
              ['get', 'pathType'],
              'predicted', 3,
              'historical', 3,
              'animated', 4,
              3
            ],
            'line-opacity': [
              'match',
              ['get', 'pathType'],
              'predicted', 0.9,
              'historical', 0.9,
              'animated', 1,
              0.9
            ],
            'line-dasharray': [
              'match',
              ['get', 'pathType'],
              'predicted', ['literal', [2, 2]],
              'animated', ['literal', [1, 1]],
              ['literal', [1]]
            ]
          }
        });

        newMap.addLayer({
          id: 'weatherOverlay',
          type: 'fill',
          source: 'weatherOverlay',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.3
          }
        });
      });

      return () => {
        if (animationFrame.current) {
          cancelAnimationFrame(animationFrame.current);
        }
        markersRef.current.forEach(marker => marker.remove());
        newMap.remove();
      };
    } catch (err) {
      setError('Failed to initialize map');
      console.error('Map initialization error:', err);
    }
  }, []);

  useEffect(() => {
    try {
      const loadData = async () => {
        if (!map.current) return;
        const currentMap = getMap();
        
        setIsLoading(true);

        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];
        
        const source = currentMap.getSource('flightPaths');
        if (source && 'setData' in source) {
          (source as mapboxgl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: []
          });
        }

        const currentPositions = balloonData.find(hourData => hourData && hourData.length > 0);
        if (!currentPositions || currentPositions.length === 0) {
          setError('No balloon data available');
          setIsLoading(false);
          return;
        }
        
        for (const position of currentPositions) {
          const { marker, markerEl, markerContainer } = createMarker(position);

          marker.addTo(currentMap);
          markersRef.current.push(marker);

          markerEl.addEventListener('click', async () => {
            setSelectedBalloon(position);
            setError(null);

            const balloonPath = findBalloonHistory(position);
            
            if (balloonPath.length >= 1) {
              const weatherData = await fetchWeatherByCoordinates(position[1], position[0]);
              
              if (weatherData) {
                const warnings = analyzeWeatherWarnings(weatherData);
                setCurrentWeatherInfo({ data: weatherData, warnings });

                const historicalRoute: Feature<LineString> = {
                  type: 'Feature',
                  properties: { pathType: 'historical' },
                  geometry: {
                    type: 'LineString',
                    coordinates: balloonPath.map(([lng, lat]) => [lng, lat])
                  }
                };

                const predictedRoute = await createPredictedPath(position, weatherData);
                setPredictedPath(predictedRoute);

                const source = map.current?.getSource('flightPaths');
                if (source && 'setData' in source) {
                  (source as mapboxgl.GeoJSONSource).setData({
                    type: 'FeatureCollection',
                    features: [historicalRoute, predictedRoute].filter(Boolean)
                  });
                }

                // Ensure the layer is visible
                if (map.current?.getLayer('flightPaths')) {
                  map.current.setLayoutProperty('flightPaths', 'visibility', 'visible');
                }

                const bounds = new mapboxgl.LngLatBounds();
                [...balloonPath, ...predictedRoute.geometry.coordinates].forEach(
                  ([lng, lat]) => bounds.extend([lng, lat] as [number, number])
                );
                
                map.current?.fitBounds(bounds, {
                  padding: 100,
                  duration: 2000
                });

                animateFlightPath(balloonPath);
              }
            }
          });

          const weatherData = await fetchWeatherByCoordinates(position[1], position[0]);
          if (weatherData) {
            const warnings = analyzeWeatherWarnings(weatherData);
            if (warnings.some(w => w.severity === 'high')) {
              const warningSymbol = createWarningSymbol();
              markerContainer.appendChild(warningSymbol);
              markerEl.style.boxShadow = '0 0 10px #ff0000';
            }
          }
        }
        setIsLoading(false);
      };

      loadData();
    } catch (err) {
      setError('Failed to update balloon positions');
      setIsLoading(false);
      console.error('Error updating balloon positions:', err);
    }
  }, [balloonData]);

  const toggleWeatherLayer = (layer: keyof WeatherLayerState) => {
    if (!map.current) return;

    const layerId = `weather-${layer}`;
    const currentVisibility = map.current.getLayoutProperty(layerId, 'visibility');
    const newVisibility = currentVisibility === 'visible' ? 'none' : 'visible';

    map.current.setLayoutProperty(layerId, 'visibility', newVisibility);
    setWeatherLayers(prev => ({
      ...prev,
      [layer]: newVisibility === 'visible'
    }));
  };

  const analyzeWeatherWarnings = (data: WeatherData): WeatherWarning[] => {
    const warnings: WeatherWarning[] = [];

    if (data.weather.some(w =>
      w.main.toLowerCase().includes('storm') ||
      w.main.toLowerCase().includes('thunder'))) {
      warnings.push({
        type: 'storm',
        severity: 'high',
        message: 'Severe storm in the area'
      });
    }

    if (data.main.temp < -20) {
      warnings.push({
        type: 'temperature',
        severity: 'high',
        message: 'Extreme cold temperature'
      });
    }

    if (data.wind.speed > 20) {
      warnings.push({
        type: 'wind',
        severity: 'high',
        message: 'High wind speeds'
      });
    }

    return warnings;
  };

  return (
    <div className="relative">
      <div ref={mapContainer} className="map-container" style={{ width: '100%', height: '100vh' }} />

      {isLoading && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-4 rounded shadow">
          <p className="text-lg">Loading map data...</p>
        </div>
      )}

      <div className="absolute top-4 left-4 bg-white p-4 rounded shadow">
        <h3 className="font-bold mb-2">Weather Layers</h3>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => toggleWeatherLayer('radar')}
            className={`px-3 py-1 rounded transition-colors ${
              weatherLayers.radar
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Precipitation Radar
          </button>
          <button
            onClick={() => toggleWeatherLayer('temperature')}
            className={`px-3 py-1 rounded transition-colors ${
              weatherLayers.temperature
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Temperature
          </button>
          <button
            onClick={() => toggleWeatherLayer('clouds')}
            className={`px-3 py-1 rounded transition-colors ${
              weatherLayers.clouds
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            Cloud Coverage
          </button>
        </div>

        <div className="mt-4">
          <button
            onClick={() => setIsDescriptionOpen(!isDescriptionOpen)}
            className="flex items-center justify-between w-full px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <span>Project Description</span>
            <span className={`transform transition-transform ${isDescriptionOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
          {isDescriptionOpen && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
              <p className="mb-2">This is <strong>Andromeda</strong>, a comprehensive dashboard that allows for you</p>
              <p className="mb-2">to track all Windborne balloons, along with global weather data and variations.</p>
              <p className="mb-2">Shows distribution patterns across regions, along with indications of <strong>endangered</strong></p>
              <p className="mb-2">balloons in harsh conditions. Try <strong>clicking</strong> on a balloon to show</p>
              <p className="mb-2"> <strong>flight trajectory</strong> predictions based on weather conditions, as well as previous flight paths. </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed top-4 left-4 bg-red-500 text-white p-4 rounded shadow">
          {error}
        </div>
      )}

      {selectedBalloon && currentWeatherInfo.data && (
        <div className="absolute top-4 right-4 bg-white p-4 rounded shadow max-w-sm">
          <h3 className="font-bold mb-2">Weather Information</h3>
          <p>Temperature: {currentWeatherInfo.data.main.temp}°C</p>
          <p>Wind Speed: {currentWeatherInfo.data.wind.speed} m/s</p>
          <p>Humidity: {currentWeatherInfo.data.main.humidity}%</p>
          <p>Conditions: {currentWeatherInfo.data.weather[0].main}</p>
          <p>Balloon Altitude: {selectedBalloon[2].toFixed(2)} km</p>
          {currentWeatherInfo.warnings.length > 0 && (
            <div className="mt-4">
              <h4 className="font-bold text-red-500">Weather Warnings</h4>
              {currentWeatherInfo.warnings.map((warning, index) => (
                <div
                  key={index}
                  className={`mt-2 p-2 rounded ${
                    warning.severity === 'high'
                      ? 'bg-red-100 text-red-700'
                      : warning.severity === 'medium'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {warning.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {predictedPath && (
        <div className="absolute bottom-4 right-4 bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Predicted Path</h3>
          <p>The predicted trajectory is displayed on the map.</p>
        </div>
      )}

      {isAnimating && (
        <div className="fixed bottom-4 left-4 bg-white p-2 rounded shadow">
          <p className="text-sm">Animating flight path...</p>
        </div>
      )}
    </div>
  );
};

export default Map;