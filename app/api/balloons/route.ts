import { NextResponse } from 'next/server';

const BASE_URL = 'https://a.windbornesystems.com/treasure';

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const hour = url.searchParams.get('hour') || '00';
        
        console.log(`Fetching balloon data for hour: ${hour}`);
        const response = await fetch(`${BASE_URL}/${hour}.json`);
        
        if (!response.ok) {
            console.error(`Failed to fetch data for hour ${hour}:`, response.status);
            return NextResponse.json({ error: `Failed to fetch balloon data for hour ${hour}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching balloon data:', error);
        return NextResponse.json({ error: 'Failed to fetch balloon data' }, { status: 500 });
    }
}