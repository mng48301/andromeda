export interface WeatherData {
  main: {
    temp: number;
    pressure: number;
    humidity: number;
  };
  wind: {
    speed: number;
    deg: number;
  };
  weather: Array<{
    main: string;
    description: string;
  }>;
}

export async function fetchWeatherByCoordinates(lat: number, lon: number): Promise<WeatherData | null> {
  const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('Error fetching weather data:', error);
    return null;
  }
}