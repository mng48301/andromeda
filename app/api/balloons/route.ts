import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const response = await fetch('https://a.windbornesystems.com/treasure/00.json');
        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching balloon data:', error);
        return NextResponse.json({ error: 'Failed to fetch balloon data' }, { status: 500 });
    }
}