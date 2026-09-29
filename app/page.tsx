'use client';

import { useEffect, useState } from 'react';
import { Camera, Cloud, ExternalLink, Mountain, RefreshCw } from 'lucide-react';

type Weather = { current: { time: string; temperature_2m: number; relative_humidity_2m: number; precipitation: number; cloud_cover: number; wind_speed_10m: number }; hourly: { time: string[]; cloud_cover: number[]; precipitation_probability: number[] } };

export default function Home() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [loadingWeather, setLoadingWeather] = useState(false);

  async function loadWeather() {
    setLoadingWeather(true); setWeatherError('');
    try {
      const response = await fetch('/api/weather');
      if (!response.ok) throw new Error();
      setWeather(await response.json());
    } catch { setWeatherError('기상 자료를 불러오지 못했습니다. 다시 시도해주세요.'); }
    finally { setLoadingWeather(false); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadWeather(); }, []);

  // eslint-disable-next-line react-hooks/purity
  const hours = weather?.hourly.time.map((time, i) => ({ time, cloud: weather.hourly.cloud_cover[i], rain: weather.hourly.precipitation_probability[i] })).filter(row => new Date(row.time).getTime() >= Date.now() - 60 * 60 * 1000).slice(0, 8) || [];

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Mountain size={23} strokeWidth={1.8}/></span><div><strong>FUJI NOW</strong><small>후지산 관측 노트</small></div></div><span className="region">JAPAN · KAWAGUCHIKO</span></header>
    <section className="intro"><div><p className="eyebrow">LAKE KAWAGUCHI · LIVE CONDITIONS</p><h1>지금, 후지산이<br/>보일까?</h1><p className="subcopy">가와구치코의 기상과 카메라를 확인하세요.</p></div><div className="time-badge">관측 기준 <strong>일본 현지 시각</strong><span>예보는 참고용</span></div></section>
    <div className="columns"><div className="main-column">
      <section className="panel weather-panel"><div className="section-heading"><div><p className="eyebrow">WEATHER / 가와구치코</p><h2>현재 기상</h2></div><button className="icon-button" onClick={loadWeather} disabled={loadingWeather} aria-label="기상 새로고침"><RefreshCw size={18} className={loadingWeather ? 'spin' : ''}/></button></div>
        {weatherError ? <div className="notice">{weatherError}</div> : weather ? <><div className="weather-hero"><div><span className="main-number">{Math.round(weather.current.temperature_2m)}<sup>°C</sup></span><p>관측 모델 시각 {weather.current.time.slice(11,16)} JST</p></div><Cloud size={73} strokeWidth={1.1} className="hero-icon"/></div><div className="metric-grid"><div><span>운량</span><strong>{weather.current.cloud_cover}%</strong></div><div><span>강수</span><strong>{weather.current.precipitation} mm</strong></div><div><span>습도</span><strong>{weather.current.relative_humidity_2m}%</strong></div><div><span>바람</span><strong>{weather.current.wind_speed_10m} km/h</strong></div></div></> : <div className="loading">기상 자료를 불러오는 중...</div>}
      </section>
      <section className="panel outlook"><div className="section-heading"><div><p className="eyebrow">HOURLY OUTLOOK</p><h2>앞으로의 운량</h2></div><span className="muted">수치예보 · 후지산 가시성 아님</span></div>{hours.length ? <div className="hour-list">{hours.map(row => <div className="hour" key={row.time}><span>{row.time.slice(11,16)}</span><div className="bar-track"><div className="bar-fill" style={{width: `${row.cloud}%`}}/></div><strong>{row.cloud}%</strong><small>강수 {row.rain}%</small></div>)}</div> : <p className="muted">기상 자료를 기다리는 중입니다.</p>}</section>
    </div><div className="side-column">
      <section className="panel camera-panel"><div className="section-heading"><div><p className="eyebrow">CAMERA SOURCES</p><h2>실제 화면 확인</h2></div><Camera size={21}/></div><p>카메라 운영 사이트에서 최신 화면을 직접 확인하세요.</p><div className="camera-links"><a href="https://www.fujisan-climb.jp/en/livecamera/" target="_blank" rel="noopener noreferrer">후지산 공식 라이브카메라 목록 <ExternalLink size={15}/></a><a href="https://www.fujigoko.tv/" target="_blank" rel="noopener noreferrer">Fujigoko.TV 카메라 <ExternalLink size={15}/></a></div></section>
    </div></div>
    <footer>기상 자료: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> (CC BY 4.0) · 기상 수치는 관측값이 아닌 모델 기반 현재값입니다.</footer>
  </main>;
}
