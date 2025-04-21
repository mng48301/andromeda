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
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setLoadingStatus('Fetching balloon data...');
        const data = await fetchLast24Hours();
        
        // Still show map even with partial data
        if (data.length > 0) {
          setBalloonData(data);
          setError(null);
        } else {
          setError('Unable to fetch balloon data. Retrying...');
          // Retry once after a delay
          setTimeout(async () => {
            setLoadingStatus('Retrying data fetch...');
            const retryData = await fetchLast24Hours();
            if (retryData.length > 0) {
              setBalloonData(retryData);
              setError(null);
            } else {
              setError('No balloon data available. Please try again later.');
            }
            setIsLoading(false);
          }, 5000);
          return;
        }
      } catch (err) {
        setError('Failed to fetch balloon data');
        console.error(err);
      } finally {
        setIsLoading(false);
        setLoadingStatus('');
      }
    };

    fetchData();
    // Fetch new data every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-lg mb-4">{loadingStatus || 'Loading...'}</p>
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  // Show map even with error, as we might have partial data
  return (
    <main className="min-h-screen">
      <Map balloonData={balloonData} />
      {error && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white p-4 rounded shadow">
          {error}
        </div>
      )}
    </main>
  );
}
