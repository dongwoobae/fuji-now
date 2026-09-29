export const runtime = 'edge';

export async function GET() {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', '35.504');
  url.searchParams.set('longitude', '138.761');
  url.searchParams.set('timezone', 'Asia/Tokyo');
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,precipitation,cloud_cover,wind_speed_10m');
  url.searchParams.set('hourly', 'cloud_cover,precipitation_probability');
  url.searchParams.set('forecast_hours', '12');
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cf: { cacheTtl: 600, cacheEverything: true } } as RequestInit);
    if (!response.ok) throw new Error(`Weather upstream ${response.status}`);
    return Response.json(await response.json(), { headers: { 'Cache-Control': 'public, max-age=600' } });
  } catch (error) {
    console.error('Weather request failed', error);
    return Response.json({ error: '기상 자료를 불러오지 못했습니다.' }, { status: 502 });
  }
}
