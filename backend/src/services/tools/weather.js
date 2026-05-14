export async function getWeather({ location } = {}) {
  const loc = location || 'Hồ Chí Minh';
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=3&language=vi&format=json`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!geoRes.ok) return 'Không thể tìm vị trí.';
    const geoData = await geoRes.json();
    const first = geoData.results?.[0];
    if (!first) return `Không tìm thấy địa điểm: ${location}`;
    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!wRes.ok) return 'Không thể lấy thời tiết.';
    const w = await wRes.json();
    const conditions = {
      0: 'Trời quang', 1: 'Ít mây', 2: 'Nhiều mây', 3: 'U ám',
      45: 'Sương mù', 48: 'Sương mù đóng băng',
      51: 'Mưa phùn nhẹ', 53: 'Mưa phùn', 55: 'Mưa phùn nặng hạt',
      61: 'Mưa nhẹ', 63: 'Mưa vừa', 65: 'Mưa nặng hạt',
      80: 'Mưa rào nhẹ', 81: 'Mưa rào vừa', 82: 'Mưa rào nặng hạt',
      95: 'Giông bão', 96: 'Giông bão kèm mưa đá', 99: 'Giông bão mạnh kèm mưa đá',
    };
    const name = [first.name, first.admin1, first.country].filter(Boolean).join(', ');
    return [
      `🌤 Thời tiết tại **${name}**:`,
      `- Nhiệt độ: ${w.current.temperature_2m}°C (cảm giác: ${w.current.apparent_temperature}°C)`,
      `- Độ ẩm: ${w.current.relative_humidity_2m}%`,
      `- Gió: ${w.current.wind_speed_10m} km/h`,
      `- ${conditions[w.current.weather_code] || `Mã ${w.current.weather_code}`}`,
      `- Cao nhất: ${w.daily.temperature_2m_max[0]}°C, Thấp nhất: ${w.daily.temperature_2m_min[0]}°C`,
      `- Lượng mưa: ${w.daily.precipitation_sum[0]} mm`,
    ].join('\n');
  } catch {
    return 'Không thể lấy thông tin thời tiết.';
  }
}
