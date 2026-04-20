// ─── Shared weather fetch via wttr.in JSON API ───

const WEATHER_EMOJI = {
  113: '☀️',    // Sunny / Clear
  116: '⛅',    // Partly cloudy
  119: '☁️',    // Cloudy
  122: '☁️',    // Overcast
  143: '🌫️',   // Mist
  176: '🌦️',   // Patchy rain
  179: '🌨️',   // Patchy snow
  182: '🌧️',   // Patchy sleet
  185: '🌧️',   // Patchy freezing drizzle
  200: '⛈️',   // Thundery outbreaks
  227: '🌨️',   // Blowing snow
  230: '❄️',    // Blizzard
  248: '🌫️',   // Fog
  260: '🌫️',   // Freezing fog
  263: '🌦️',   // Patchy light drizzle
  266: '🌧️',   // Light drizzle
  281: '🌧️',   // Freezing drizzle
  284: '🌧️',   // Heavy freezing drizzle
  293: '🌦️',   // Patchy light rain
  296: '🌧️',   // Light rain
  299: '🌧️',   // Moderate rain at times
  302: '🌧️',   // Moderate rain
  305: '🌧️',   // Heavy rain at times
  308: '🌧️',   // Heavy rain
  311: '🌧️',   // Light freezing rain
  314: '🌧️',   // Moderate or heavy freezing rain
  317: '🌨️',   // Light sleet
  320: '🌨️',   // Moderate or heavy sleet
  323: '🌨️',   // Patchy light snow
  326: '🌨️',   // Light snow
  329: '❄️',    // Patchy moderate snow
  332: '❄️',    // Moderate snow
  335: '❄️',    // Patchy heavy snow
  338: '❄️',    // Heavy snow
  350: '🌧️',   // Ice pellets
  353: '🌦️',   // Light rain shower
  356: '🌧️',   // Moderate or heavy rain shower
  359: '🌧️',   // Torrential rain shower
  362: '🌨️',   // Light sleet showers
  365: '🌨️',   // Moderate or heavy sleet showers
  368: '🌨️',   // Light snow showers
  371: '❄️',    // Moderate or heavy snow showers
  374: '🌧️',   // Light showers of ice pellets
  377: '🌧️',   // Moderate or heavy showers of ice pellets
  386: '⛈️',   // Patchy light rain with thunder
  389: '⛈️',   // Moderate or heavy rain with thunder
  392: '⛈️',   // Patchy light snow with thunder
  395: '⛈️',   // Moderate or heavy snow with thunder
};

export function fetchWeather(timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch('https://wttr.in/Seattle?format=j1', { signal: controller.signal })
    .then((res) => {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then((data) => {
      const w = data?.current_condition?.[0];
      if (!w) return null;
      const code = parseInt(w.weatherCode, 10);
      return {
        emoji: WEATHER_EMOJI[code] || '🌡️',
        desc: w.weatherDesc?.[0]?.value || '',
        f: w.temp_F,
        c: w.temp_C,
        wind: `${w.winddir16Point} ${w.windspeedMiles}mph`,
        humidity: `${w.humidity}%`,
      };
    })
    .finally(() => clearTimeout(timeoutId));
}
