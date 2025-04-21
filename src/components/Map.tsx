'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { BalloonData } from '@/services/balloonService';
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
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherWarnings, setWeatherWarnings] = useState<WeatherWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [weatherLayers, setWeatherLayers] = useState<WeatherLayerState>({
    radar: true,
    temperature: false,
    clouds: true
  });

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
    if (!map.current) return;
    setIsAnimating(true);

    // Create the complete path line
    const line: Feature<LineString> = {
      type: 'Feature',
      properties: { pathType: 'historical' },
      geometry: {
        type: 'LineString',
        coordinates: path.map(([lng, lat]) => [lng, lat])
      }
    };

    // Create the animated line that will grow
    const animatedLine = turf.lineString([]);
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
            features: [line]  // Keep only the complete path
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
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/satellite-v9',
        center: [-80, 75],
        zoom: 2.8
      });

      map.current = newMap;

      newMap.on('load', () => {
        // Add weather radar layer
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

        // Add temperature layer
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

        // Add clouds layer
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

        // Flight paths layer
        newMap.addSource('flightPaths', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: []
          }
        });

        // Weather overlay layer
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
            'line-width': 2,
            'line-opacity': 0.7,
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

  useEffect(() => {
    if (!map.current || !balloonData.length) return;

    try {
      // Add a slight delay to ensure smooth loading and visibility of warning signs
      const loadData = async () => {
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay

        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        const validData = balloonData.filter(hourData =>
          Array.isArray(hourData) &&
          hourData.every(coords =>
            Array.isArray(coords) &&
            coords.length === 3 &&
            coords.every(val => typeof val === 'number' && !isNaN(val))
          )
        );

        if (validData.length === 0) {
          setError('No valid balloon data available');
          setIsLoading(false);
          return;
        }

        const currentPositions = validData[0] || [];
        for (const position of currentPositions) {
          const { marker, markerEl, markerContainer } = createMarker(position);

          if (map.current) {
            marker.addTo(map.current);
            markersRef.current.push(marker);
          }

          markerEl.addEventListener('click', () => {
            setSelectedBalloon(position);
            setError(null);

            const balloonPath = validData.map(hour =>
              hour.find(([hlng, hlat]) => hlng === position[0] && hlat === position[1])
            ).filter((pos): pos is [number, number, number] => pos !== undefined);

            if (balloonPath.length >= 2) {
              if (map.current) {
                const coordinates = balloonPath.map(([lng, lat]) => [lng, lat]);
                const route: Feature<LineString> = {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: coordinates as [number, number][]
                  }
                };

                if (map.current.getSource('route')) {
                  (map.current.getSource('route') as mapboxgl.GeoJSONSource).setData(route);
                } else {
                  map.current.addSource('route', {
                    type: 'geojson',
                    data: route
                  });

                  map.current.addLayer({
                    id: 'route',
                    type: 'line',
                    source: 'route',
                    paint: {
                      'line-color': '#00ff00',
                      'line-width': 2
                    }
                  });
                }
              }
              animateFlightPath(balloonPath);
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
              <p className="mb-2">balloons in harsh conditions. Offers <strong>flight trajectory</strong> predictions as well. </p>
              <p className="mb-2">Try <strong>clicking</strong> on a balloon. </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed top-4 left-4 bg-red-500 text-white p-4 rounded shadow">
          {error}
        </div>
      )}

      {selectedBalloon && weatherData && (
        <div className="absolute top-4 right-4 bg-white p-4 rounded shadow max-w-sm">
          <h3 className="font-bold mb-2">Weather Information</h3>
          <p>Temperature: {weatherData.main.temp}°C</p>
          <p>Wind Speed: {weatherData.wind.speed} m/s</p>
          <p>Humidity: {weatherData.main.humidity}%</p>
          <p>Conditions: {weatherData.weather[0].main}</p>
          <p>Balloon Altitude: {selectedBalloon[2].toFixed(2)} km</p>
          {weatherWarnings.length > 0 && (
            <div className="mt-4">
              <h4 className="font-bold text-red-500">Weather Warnings</h4>
              {weatherWarnings.map((warning, index) => (
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

      {isAnimating && (
        <div className="fixed bottom-4 left-4 bg-white p-2 rounded shadow">
          <p className="text-sm">Animating flight path...</p>
        </div>
      )}
    </div>
  );
};

export default Map;