'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { BalloonData, fetchLast24Hours } from '@/services/balloonService';

// Dynamically import the Map component to avoid SSR issues with mapbox-gl
const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <p className="text-lg">Loading map...</p>
    </div>
  ),
});

export default function Home() {
  const [balloonData, setBalloonData] = useState<BalloonData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchLast24Hours();
        setBalloonData(data);
      } catch (err) {
        setError('Failed to fetch balloon data');
        console.error(err);
      }
    };

    fetchData();
    // Fetch new data every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
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
    <main className="min-h-screen">
      {balloonData.length > 0 ? (
        <Map balloonData={balloonData} />
      ) : (
        <div className="flex items-center justify-center h-screen">
          <p>Loading balloon data...</p>
        </div>
      )}
    </main>
  );
}
