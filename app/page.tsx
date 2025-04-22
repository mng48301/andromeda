'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Balloon } from './types';
import { fetchCurrentBalloons } from './utils/balloonUtils';

// Dynamically import the Map component to avoid SSR issues with Leaflet
const Map = dynamic(() => import('./components/Map'), {
  ssr: false,
  loading: () => <div>Loading map...</div>
});

export default function Home() {
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchCurrentBalloons();
        setBalloons(data);
      } catch (err) {
        setError('Failed to fetch balloon data');
        console.error(err);
      }
    };

    fetchData();
    // Refresh data every minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen relative">
      <Map balloons={balloons} />
    </main>
  );
}
