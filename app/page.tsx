'use client';

import { ChangeEvent, useEffect, useState } from 'react';
import { Camera, Cloud, ExternalLink, ImageUp, Mountain, RefreshCw, Wind } from 'lucide-react';

type Weather = { current: { time: string; temperature_2m: number; relative_humidity_2m: number; precipitation: number; cloud_cover: number; wind_speed_10m: number }; hourly: { time: string[]; cloud_cover: number[]; precipitation_probability: number[] } };
type Observation = { id?: number; observedAt: string; label: string; summitVisible: boolean; confidence: number; note: string };
const labels: Record<string, string> = { Perfect: '매우 선명', Clear: '선명', Cloudy: '일부 가림', Obscured: '대부분 가림', Bad: '판정 어려움' };

export default function Home() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [records, setRecords] = useState<Observation[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [analysisAvailable, setAnalysisAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Observation | null>(null);
  const [analysisError, setAnalysisError] = useState('');

  async function loadWeather() {
    setLoadingWeather(true); setWeatherError('');
    try {
      const response = await fetch('/api/weather');
      if (!response.ok) throw new Error();
      setWeather(await response.json());
    } catch { setWeatherError('기상 자료를 불러오지 못했습니다. 다시 시도해주세요.'); }
    finally { setLoadingWeather(false); }
  }
  async function loadRecords() {
    try { const response = await fetch('/api/observations'); if (response.ok) setRecords(await response.json()); } catch { /* The current weather remains useful without history. */ }
  }
  useEffect(() => {
    loadWeather(); loadRecords();
    fetch('/api/analyze').then(response => response.json()).then((data: unknown) => setAnalysisAvailable(Boolean((data as { available?: boolean }).available))).catch(() => setAnalysisAvailable(false));
  }, []);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] || null;
    setAnalysisError(''); setResult(null);
    if (next && (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 2_000_000)) {
      setFile(null); setAnalysisError('JPG, PNG, WebP 파일 중 2MB 이하로 선택해주세요.'); return;
    }
    setFile(next);
  }
  async function analyze() {
    if (!file) return;
    setBusy(true); setAnalysisError(''); setResult(null);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file);
      });
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, mimeType: file.type }) });
      const data = await response.json() as Observation & { error?: string };
      if (!response.ok) throw new Error(data.error || '판정 요청에 실패했습니다.');
      setResult(data); loadRecords();
    } catch (error) { setAnalysisError(error instanceof Error ? error.message : '판정 요청에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  const hours = weather?.hourly.time.map((time, i) => ({ time, cloud: weather.hourly.cloud_cover[i], rain: weather.hourly.precipitation_probability[i] })).filter(row => new Date(row.time).getTime() >= Date.now() - 60 * 60 * 1000).slice(0, 8) || [];
  const localTime = (value: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Mountain size={23} strokeWidth={1.8}/></span><div><strong>FUJI NOW</strong><small>후지산 관측 노트</small></div></div><span className="region">JAPAN · KAWAGUCHIKO</span></header>
    <section className="intro"><div><p className="eyebrow">LAKE KAWAGUCHI · LIVE CONDITIONS</p><h1>지금, 후지산이<br/>보일까?</h1><p className="subcopy">가와구치코의 기상과 카메라를 확인하고, 사진으로 실제 가시성을 판정해보세요.</p></div><div className="time-badge">관측 기준 <strong>일본 현지 시각</strong><span>예보는 참고용 · 사진 판정은 촬영 시점 기준</span></div></section>
    <div className="columns"><div className="main-column">
      <section className="panel weather-panel"><div className="section-heading"><div><p className="eyebrow">WEATHER / 가와구치코</p><h2>현재 기상</h2></div><button className="icon-button" onClick={loadWeather} disabled={loadingWeather} aria-label="기상 새로고침"><RefreshCw size={18} className={loadingWeather ? 'spin' : ''}/></button></div>
        {weatherError ? <div className="notice">{weatherError}</div> : weather ? <><div className="weather-hero"><div><span className="main-number">{Math.round(weather.current.temperature_2m)}<sup>°C</sup></span><p>관측 모델 시각 {weather.current.time.slice(11,16)} JST</p></div><Cloud size={73} strokeWidth={1.1} className="hero-icon"/></div><div className="metric-grid"><div><span>운량</span><strong>{weather.current.cloud_cover}%</strong></div><div><span>강수</span><strong>{weather.current.precipitation} mm</strong></div><div><span>습도</span><strong>{weather.current.relative_humidity_2m}%</strong></div><div><span>바람</span><strong>{weather.current.wind_speed_10m} km/h</strong></div></div></> : <div className="loading">기상 자료를 불러오는 중...</div>}
      </section>
      <section className="panel outlook"><div className="section-heading"><div><p className="eyebrow">HOURLY OUTLOOK</p><h2>앞으로의 운량</h2></div><span className="muted">수치예보 · 후지산 가시성 아님</span></div>{hours.length ? <div className="hour-list">{hours.map(row => <div className="hour" key={row.time}><span>{row.time.slice(11,16)}</span><div className="bar-track"><div className="bar-fill" style={{width: `${row.cloud}%`}}/></div><strong>{row.cloud}%</strong><small>강수 {row.rain}%</small></div>)}</div> : <p className="muted">기상 자료를 기다리는 중입니다.</p>}</section>
      <section className="panel camera-panel"><div className="section-heading"><div><p className="eyebrow">CAMERA SOURCES</p><h2>실제 화면 확인</h2></div><Camera size={21}/></div><p>카메라 운영 사이트에서 최신 화면을 직접 확인하세요. 촬영 시각과 방향을 확인한 뒤 필요한 장면을 저장해 판정할 수 있습니다.</p><div className="camera-links"><a href="https://www.fujisan-climb.jp/en/livecamera/" target="_blank" rel="noopener noreferrer">후지산 공식 라이브카메라 목록 <ExternalLink size={15}/></a><a href="https://www.fujigoko.tv/" target="_blank" rel="noopener noreferrer">Fujigoko.TV 카메라 <ExternalLink size={15}/></a></div><small>카메라 제공자의 이용 조건을 확인한 이미지에 한해 업로드하세요.</small></section>
    </div><div className="side-column"><section className="panel analyze-panel"><div className="section-heading"><div><p className="eyebrow">IMAGE CHECK</p><h2>사진 가시성 판정</h2></div><ImageUp size={22}/></div><p className="panel-description">카메라 캡처 또는 직접 촬영한 후지산 사진을 선택하세요. Gemini가 다섯 단계로 분류합니다.</p><label className={`upload ${preview ? 'has-image' : ''}`}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile}/>{preview ? <img src={preview} alt="선택한 판정 이미지"/> : <><ImageUp size={28}/><strong>사진 선택</strong><span>JPG · PNG · WebP / 2MB 이하</span></>}</label>{analysisAvailable ? <button className="primary-button" onClick={analyze} disabled={!file || busy}>{busy ? '사진 판정 중...' : '가시성 판정하기'}</button> : <div className="unavailable" role="status">사진 판정 기능을 준비 중입니다. 현재는 기상과 원본 카메라를 확인할 수 있습니다.</div>}{analysisError && <p role="alert" className="error">{analysisError}</p>}{result && <div className="result" aria-live="polite"><span>판정 결과</span><strong>{labels[result.label]} <em>{result.label}</em></strong><p>{result.note}</p><small>정상 확인: {result.summitVisible ? '예' : '아니요'} · AI 자체 확신 {Math.round(result.confidence * 100)}% · {localTime(result.observedAt)} JST</small></div>}<p className="fineprint">방문자에게 API 키를 요구하지 않습니다. 사진 원본은 서버에 저장하지 않고 판정 결과만 기록합니다. AI 판정은 참고용입니다.</p></section>
      <section className="panel history-panel"><div className="section-heading"><div><p className="eyebrow">RECENT CHECKS</p><h2>최근 판정</h2></div><Wind size={20}/></div>{records.length ? <div className="records">{records.slice(0, 6).map(row => <div className="record" key={row.id}><span>{localTime(row.observedAt)} JST</span><strong>{labels[row.label] || row.label}</strong></div>)}</div> : <p className="empty">아직 판정 기록이 없습니다. 사진을 판정하면 여기에 나타납니다.</p>}</section></div></div>
    <footer>기상 자료: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> (CC BY 4.0) · 기상 수치는 관측값이 아닌 모델 기반 현재값입니다.</footer>
  </main>;
}
