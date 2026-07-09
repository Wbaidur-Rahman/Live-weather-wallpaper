# Bengal Weather Wallpaper

A lightweight Windows live wallpaper for Lively Wallpaper that shows a rural Bengal field reacting to live weather. It uses Open-Meteo weather data, a still rural field background, and canvas animation for moving clouds, rain, mist, dark storm shade, wind-driven greenery, and glass-like rain droplets.

## Features

- Real-time weather from Open-Meteo, no API key required
- Rural Bengal field background with paddy/grass/jute greenery
- Weather-aware sky states: clear, cloudy, fog, rain, and thunderstorm
- Moving cloud objects that follow wind direction
- Darker storm sky with heavier black cloud cover
- Wind-reactive field and foreground grass motion, faster when wind speed is high
- Rain streaks, mist, limited visibility, wet field sheen, and storm darkening
- Glass-pane rain droplets during rain and thunderstorm
- Low-power canvas rendering for systems without a dedicated GPU
- Lively Wallpaper metadata included

## Requirements

- Windows
- [Lively Wallpaper](https://www.rocksdanister.com/lively/)
- Internet connection for live weather updates
- A browser/WebView runtime, provided by Lively

The wallpaper uses Open-Meteo directly from the browser. No server and no weather API key are needed.

## Install In Lively Wallpaper

1. Download or clone this repository.
2. Open Lively Wallpaper.
3. Add a new wallpaper from `index.html`.
4. Select the folder `bengal-weather-wallpaper`.

Lively should read `LivelyInfo.json` automatically.

## Fixed Location

By default, the wallpaper uses Dhaka, Bangladesh. You can set a fixed location with query parameters:

```text
index.html?lat=23.8103&lon=90.4125&name=Dhaka
```

Use your own latitude, longitude, and display name for another place.

## Debug Weather Modes

For testing visuals without waiting for real weather, open the wallpaper with:

```text
index.html?debugScene=clear
index.html?debugScene=cloudy
index.html?debugScene=rain
index.html?debugScene=storm
index.html?debugScene=fog
```

Optional debug parameters:

```text
debugCloud=95
debugWind=30
debugDirection=245
debugNight=1
debugTemp=28
```

Example:

```text
index.html?debugScene=storm&debugCloud=98&debugWind=28&debugDirection=245
```

## Project Structure

```text
bengal-weather-wallpaper/
  index.html                 Main wallpaper page
  styles.css                 Layout and static background styling
  weather-wallpaper.js       Weather API, scene selection, and UI text
  scene-effects.js           Canvas animation effects
  LivelyInfo.json            Lively Wallpaper metadata
  assets/                    Runtime background and cloud assets
  tools/                     Asset processing helper scripts
```

## Performance Notes

The wallpaper is designed to stay light:

- Canvas is capped around 20 FPS.
- Device pixel ratio is capped for lower GPU/CPU cost.
- Clouds are image sprites instead of procedural heavy effects.
- Grass, rain, mist, and glass droplets reuse small fixed object pools.
- No WebGL, no video, and no full-screen refraction shader.

If performance is still high on your PC, reduce active wallpapers in Lively, enable pause-on-fullscreen, or use Windows power mode settings.

## Weather Data

Weather data is fetched from:

```text
https://api.open-meteo.com/v1/forecast
```

Current fields used include temperature, day/night, precipitation, weather code, cloud cover, wind speed, and wind direction.

## Assets And Credits

- Cloud sprites are derived from "Clouds with Transparency" by Vladimir Chopine / GeekatPlay Studio, CC0/public domain. See `assets/clouds/README.md`.
- The rural Bengal field background and processed sky/background variants are included as runtime assets for this wallpaper.
- The large original cloud source ZIP/folder is intentionally ignored; the processed runtime cloud sprites are included.

## License

Personal-use project unless you replace or verify all included visual assets for your intended distribution.
