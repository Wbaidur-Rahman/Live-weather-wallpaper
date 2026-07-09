const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_LOCATION = {
  latitude: 23.8103,
  longitude: 90.4125,
  name: "Dhaka, Bangladesh"
};

const el = {
  temperature: document.getElementById("temperature"),
  condition: document.getElementById("condition"),
  place: document.getElementById("place")
};

const weatherCodes = new Map([
  [0, ["Clear sky", "clear"]],
  [1, ["Mainly clear", "clear"]],
  [2, ["Partly cloudy", "cloudy"]],
  [3, ["Overcast", "cloudy"]],
  [45, ["Fog", "fog"]],
  [48, ["Fog", "fog"]],
  [51, ["Light drizzle", "rain"]],
  [53, ["Drizzle", "rain"]],
  [55, ["Heavy drizzle", "rain"]],
  [56, ["Freezing drizzle", "rain"]],
  [57, ["Freezing drizzle", "rain"]],
  [61, ["Light rain", "rain"]],
  [63, ["Rain", "rain"]],
  [65, ["Heavy rain", "rain"]],
  [66, ["Freezing rain", "rain"]],
  [67, ["Freezing rain", "rain"]],
  [71, ["Light snow", "fog"]],
  [73, ["Snow", "fog"]],
  [75, ["Heavy snow", "fog"]],
  [77, ["Snow grains", "fog"]],
  [80, ["Light showers", "rain"]],
  [81, ["Showers", "rain"]],
  [82, ["Heavy showers", "storm"]],
  [85, ["Snow showers", "fog"]],
  [86, ["Heavy snow showers", "fog"]],
  [95, ["Thunderstorm", "storm"]],
  [96, ["Thunderstorm with hail", "storm"]],
  [99, ["Severe thunderstorm", "storm"]]
]);

const weatherLocation = getLocationFromQuery() || DEFAULT_LOCATION;
const debugWeather = getDebugWeatherFromQuery();

init();

async function init() {
  el.place.textContent = weatherLocation.name;
  await refreshWeather();
  window.setInterval(refreshWeather, UPDATE_INTERVAL_MS);
}

function getLocationFromQuery() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("lat") || !params.has("lon")) return null;

  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    latitude,
    longitude,
    name: params.get("name") || `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`
  };
}

async function refreshWeather() {
  if (debugWeather) {
    applyWeather(debugWeather);
    return;
  }

  try {
    const url = new URL(WEATHER_ENDPOINT);
    url.searchParams.set("latitude", weatherLocation.latitude);
    url.searchParams.set("longitude", weatherLocation.longitude);
    url.searchParams.set("current", "temperature_2m,is_day,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m");
    url.searchParams.set("timezone", "auto");

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);

    const data = await response.json();
    localStorage.setItem("bengal-weather-current", JSON.stringify(data.current));
    applyWeather(data.current);
  } catch {
    const cached = readCachedWeather();
    if (cached) {
      applyWeather(cached);
      el.condition.textContent = `${el.condition.textContent} (cached)`;
      return;
    }

    document.body.dataset.weather = "cloudy";
    el.temperature.textContent = "--";
    el.condition.textContent = "Weather unavailable";
    el.place.textContent = weatherLocation.name;
  }
}

function getDebugWeatherFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const scene = params.get("debugScene");
  if (!scene) return null;

  const codeByScene = {
    clear: 0,
    cloudy: 3,
    rain: 61,
    storm: 95,
    fog: 45
  };
  const code = codeByScene[scene] ?? 0;
  const fallbackCover = scene === "clear" ? 0 : scene === "cloudy" ? 70 : scene === "fog" ? 45 : 88;

  return {
    temperature_2m: Number(params.get("debugTemp") || 28),
    is_day: params.get("debugNight") === "1" ? 0 : 1,
    precipitation: scene === "storm" ? 6 : scene === "rain" ? 1.4 : 0,
    rain: scene === "storm" ? 6 : scene === "rain" ? 1.4 : 0,
    showers: 0,
    weather_code: code,
    cloud_cover: Number(params.get("debugCloud") || fallbackCover),
    wind_speed_10m: Number(params.get("debugWind") || 14),
    wind_direction_10m: Number(params.get("debugDirection") || 270)
  };
}

function readCachedWeather() {
  try {
    return JSON.parse(localStorage.getItem("bengal-weather-current"));
  } catch {
    return null;
  }
}

function applyWeather(current) {
  const code = Number(current.weather_code);
  const [description, baseScene] = weatherCodes.get(code) || ["Current weather", "cloudy"];
  const precipitation = Number(current.precipitation || current.rain || current.showers || 0);
  const cloudCover = Number(current.cloud_cover || 0);
  const windSpeed = Number(current.wind_speed_10m || 0);
  const windDirection = Number.isFinite(Number(current.wind_direction_10m)) ? Number(current.wind_direction_10m) : 270;
  const isDay = Number(current.is_day) === 1;
  const scene = chooseScene(baseScene, precipitation, cloudCover);

  document.body.dataset.weather = scene;
  document.body.dataset.daylight = isDay ? "day" : "night";

  el.temperature.textContent = `${Math.round(Number(current.temperature_2m))}\u00b0`;
  el.condition.textContent = `${description} - ${Math.round(windSpeed)} km/h wind`;
  el.place.textContent = weatherLocation.name;
  publishWeatherState({ scene, windSpeed, windDirection, cloudCover, precipitation, isDay });
}

function chooseScene(baseScene, precipitation, cloudCover) {
  if (baseScene === "storm" || precipitation >= 5) return "storm";
  if (baseScene === "rain" || precipitation > 0) return "rain";
  if (baseScene === "fog") return "fog";
  if (baseScene === "cloudy" || cloudCover >= 58) return "cloudy";
  return "clear";
}

function publishWeatherState(detail) {
  window.__bengalWeather = detail;
  window.dispatchEvent(new CustomEvent("bengal-weather", { detail }));
}
