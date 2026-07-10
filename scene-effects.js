(function () {
  const canvas = document.getElementById("scene-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const refractionCanvas = document.createElement("canvas");
  const refractionCtx = refractionCanvas.getContext("2d", { alpha: true });
  const weather = {
    scene: "clear",
    windSpeed: 8,
    windDirection: 270,
    cloudCover: 0,
    precipitation: 0,
    isDay: true
  };

  const cloudSource = {
    light: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    grey: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    dark: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  };

  const cloudImages = {
    light: new Map(),
    grey: new Map(),
    dark: new Map()
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastFrame = 0;
  let fieldImage = null;
  let fieldReady = false;
  let clouds = [];
  let cloudKey = "";
  let drops = [];
  let glassDrops = [];

  const frameMs = 1000 / 20;

  loadCloudImages();

  window.addEventListener("resize", resize);
  window.addEventListener("bengal-weather", (event) => {
    Object.assign(weather, event.detail || {});
    refreshClouds();
  });

  if (window.__bengalWeather) {
    Object.assign(weather, window.__bengalWeather);
  }

  fieldImage = new Image();
  fieldImage.onload = () => {
    fieldReady = true;
  };
  fieldImage.src = "assets/rural-bengal-field.png";

  resize();
  requestAnimationFrame(render);

  function loadCloudImages() {
    for (const variant of Object.keys(cloudSource)) {
      for (const id of cloudSource[variant]) {
        const image = new Image();
        image.decoding = "async";
        image.src = `assets/clouds/cloud-${variant}-${String(id).padStart(2, "0")}.png`;
        cloudImages[variant].set(id, image);
      }
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refractionCanvas.width = width;
    refractionCanvas.height = height;

    drops = createRainDrops();
    glassDrops = createGlassDrops();
    refreshClouds(true);
  }

  function render(now) {
    requestAnimationFrame(render);
    if (now - lastFrame < frameMs) return;
    lastFrame = now;

    const time = now / 1000;
    ctx.clearRect(0, 0, width, height);

    drawWeatherTint();
    drawWeatherShade("before");
    drawSunGlow(time);
    drawClouds(time);
    drawStormCeiling(time);
    drawMist();
    drawFieldShimmer(time);
    drawDepthMist(time);
    drawFieldWeather(time);
    drawRain(time);
    drawWeatherShade("after");
    drawGlassDrops(time);
  }

  function refreshClouds(force) {
    const mode = getCloudMode();
    const coverBucket = Math.round(clamp(weather.cloudCover, 0, 100) / 18);
    const directionBucket = Math.round(normalizeDegrees(weather.windDirection) / 45);
    const key = `${mode}-${coverBucket}-${directionBucket}-${width}x${height}`;
    if (!force && key === cloudKey) return;

    cloudKey = key;
    clouds = createClouds(mode);
  }

  function getCloudMode() {
    if (weather.scene === "storm") return "storm";
    if (weather.scene === "rain") return "rain";
    if (weather.scene === "fog") return "fog";
    if (weather.scene === "clear" || weather.cloudCover < 28) return "clear";
    return "cloudy";
  }

  function createClouds(mode) {
    if (mode === "clear" || mode === "fog") return [];

    const cover = clamp(weather.cloudCover, 0, 100);
    const count = mode === "cloudy" ? (cover > 74 ? 5 : 4) : mode === "storm" ? 10 : 6;
    const rng = random(7801 + Math.round(cover) * 11 + count * 37 + Math.round(normalizeDegrees(weather.windDirection)));
    const result = [];

    for (let i = 0; i < count; i += 1) {
      const nearRain = mode === "rain" && i === 0;
      const stormCloud = mode === "storm";
      const stormDark = stormCloud && i < 4;
      const midStorm = stormCloud && i >= 4;
      const midRain = mode === "rain" && i === 1;
      const midWeather = stormDark || midStorm || midRain;
      const far = !nearRain && !midWeather;
      const variant = stormCloud || nearRain ? "dark" : mode === "rain" || midRain ? "grey" : "light";
      const assetId = chooseCloudId(variant, rng, nearRain || stormDark, far);
      const baseWidth = getCloudWidth(mode, nearRain, midWeather, rng);
      const lane = (i + 0.5) / count;
      const spread = stormCloud ? 0.98 : 0.84;
      const edge = stormCloud ? 0.01 : 0.08;
      const x = clamp(edge + lane * spread + (rng() - 0.5) * (stormCloud ? 0.16 : 0.1), -0.08, 1.08) * width;
      const y = getCloudY(mode, nearRain, midWeather, rng);
      const cloudSpeed = stormDark
        ? 0.9 + rng() * 0.28
        : midStorm
          ? 0.68 + rng() * 0.22
          : nearRain
            ? 1.08
            : midRain
              ? 0.66
              : 0.38 + rng() * 0.18;

      result.push({
        variant,
        assetId,
        x,
        y,
        width: baseWidth,
        heightScale: stormCloud ? 0.98 : nearRain ? 0.86 : midRain ? 0.8 : 0.72 + rng() * 0.14,
        speed: cloudSpeed,
        alpha: stormDark ? 0.96 : midStorm ? 0.84 : nearRain ? 0.9 : midRain ? 0.66 : mode === "cloudy" ? 0.66 + rng() * 0.16 : 0.58,
        layer: stormDark || nearRain ? 2 : midStorm || midRain ? 1 : 0,
        phase: rng() * Math.PI * 2,
        flip: rng() > 0.5
      });
    }

    return result;
  }

  function chooseCloudId(variant, rng, nearRain, far) {
    const dense = nearRain ? [1, 2, 3, 4, 10] : far ? [1, 2, 4, 7, 8] : cloudSource[variant];
    return dense[Math.floor(rng() * dense.length)];
  }

  function getCloudWidth(mode, nearRain, midStorm, rng) {
    if (mode === "storm") return width * (0.38 + rng() * 0.24);
    if (nearRain) return width * (mode === "storm" ? 0.42 + rng() * 0.08 : 0.26 + rng() * 0.07);
    if (midStorm) return width * (0.28 + rng() * 0.07);
    if (mode === "cloudy") return width * (0.18 + rng() * 0.08);
    return width * (0.16 + rng() * 0.06);
  }

  function getCloudY(mode, nearRain, midStorm, rng) {
    if (mode === "storm") return height * (0.07 + rng() * 0.2);
    if (nearRain) return height * (mode === "storm" ? 0.16 + rng() * 0.08 : 0.21 + rng() * 0.08);
    if (midStorm) return height * (0.13 + rng() * 0.08);
    return height * (0.1 + rng() * 0.18);
  }

  function drawWeatherTint() {
    const skyDepth = weather.scene === "rain" || weather.scene === "storm" ? height : height * 0.58;
    if (weather.scene === "clear") {
      const clean = ctx.createLinearGradient(0, 0, 0, skyDepth);
      clean.addColorStop(0, "rgba(80, 180, 232, 0.05)");
      clean.addColorStop(1, "rgba(255, 241, 198, 0.03)");
      ctx.fillStyle = clean;
      ctx.fillRect(0, 0, width, skyDepth);
      return;
    }

    const cloud = clamp(weather.cloudCover / 100, 0, 1);
    const rainStrength = getRainStrength();
    const grayAlpha = weather.scene === "storm" ? 0.66 : weather.scene === "rain" ? 0.54 + rainStrength * 0.12 : 0.08 + cloud * 0.09;
    const tint = ctx.createLinearGradient(0, 0, 0, skyDepth);
    tint.addColorStop(0, `rgba(30, 41, 48, ${grayAlpha})`);
    tint.addColorStop(0.42, `rgba(70, 84, 88, ${grayAlpha * 0.82})`);
    if (weather.scene === "rain" || weather.scene === "storm") {
      tint.addColorStop(0.68, `rgba(78, 93, 91, ${grayAlpha * 0.34})`);
      tint.addColorStop(0.88, `rgba(48, 62, 57, ${grayAlpha * 0.08})`);
      tint.addColorStop(1, "rgba(48, 62, 57, 0)");
    } else {
      tint.addColorStop(1, "rgba(160, 181, 170, 0)");
    }
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, width, skyDepth);
  }

  function drawWeatherShade(stage) {
    if (weather.scene !== "rain" && weather.scene !== "storm") return;

    const rainStrength = getRainStrength();
    const isStorm = weather.scene === "storm";

    if (stage === "before") {
      const skyShade = ctx.createLinearGradient(0, 0, 0, height);
      const topAlpha = isStorm ? 0.48 : 0.2 + rainStrength * 0.12;
      const midAlpha = isStorm ? 0.34 : 0.13 + rainStrength * 0.08;

      skyShade.addColorStop(0, `rgba(5, 12, 17, ${topAlpha})`);
      skyShade.addColorStop(0.24, `rgba(5, 12, 17, ${topAlpha * 0.96})`);
      skyShade.addColorStop(0.54, `rgba(7, 16, 17, ${midAlpha})`);
      skyShade.addColorStop(0.78, `rgba(7, 16, 17, ${midAlpha * 0.24})`);
      skyShade.addColorStop(1, "rgba(7, 16, 17, 0)");
      ctx.fillStyle = skyShade;
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const groundShade = ctx.createLinearGradient(0, 0, 0, height);
    const groundAlpha = isStorm ? 0.38 : 0.13 + rainStrength * 0.12;

    groundShade.addColorStop(0, "rgba(4, 12, 10, 0)");
    groundShade.addColorStop(0.34, "rgba(4, 12, 10, 0)");
    groundShade.addColorStop(0.52, `rgba(5, 18, 13, ${groundAlpha * 0.14})`);
    groundShade.addColorStop(0.72, `rgba(5, 18, 13, ${groundAlpha * 0.5})`);
    groundShade.addColorStop(1, `rgba(4, 13, 9, ${groundAlpha})`);
    ctx.fillStyle = groundShade;
    ctx.fillRect(0, 0, width, height);
  }

  function drawSunGlow(time) {
    if (!weather.isDay) return;

    const rainStrength = getRainStrength();
    const precipitation = Number(weather.precipitation) || 0;
    const cloudFade = weather.scene === "clear"
      ? 1
      : weather.scene === "rain"
        ? (precipitation <= 0.25 && weather.cloudCover < 45 ? 0.12 : 0)
      : weather.scene === "storm"
        ? clamp(0.14 - rainStrength * 0.1, 0, 0.08)
          : clamp(1 - weather.cloudCover / 145, 0.22, 0.68);
    if (cloudFade <= 0.01) return;

    const x = width * 0.78 + Math.sin(time / 55) * 8;
    const y = height * 0.13 + Math.sin(time / 42) * 4;
    const radius = Math.min(width, height) * 0.17;
    const glow = ctx.createRadialGradient(x, y, 3, x, y, radius);

    glow.addColorStop(0, `rgba(255, 248, 204, ${0.5 * cloudFade})`);
    glow.addColorStop(0.35, `rgba(255, 218, 115, ${0.2 * cloudFade})`);
    glow.addColorStop(1, "rgba(255, 218, 115, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    if (weather.scene === "storm") return;

    const discRadius = Math.max(14, Math.min(width, height) * 0.035);
    const disc = ctx.createRadialGradient(x, y, 1, x, y, discRadius);
    disc.addColorStop(0, `rgba(255, 250, 212, ${0.66 * cloudFade})`);
    disc.addColorStop(0.65, `rgba(255, 232, 150, ${0.44 * cloudFade})`);
    disc.addColorStop(1, "rgba(255, 232, 150, 0)");
    ctx.fillStyle = disc;
    ctx.fillRect(x - discRadius, y - discRadius, discRadius * 2, discRadius * 2);
  }

  function drawClouds(time) {
    refreshClouds();
    if (clouds.length === 0) return;

    const wind = getWindVector();
    const speedBase = 4 + clamp(weather.windSpeed, 1, 48) * 0.28;

    const orderedClouds = clouds.slice().sort((a, b) => a.layer - b.layer || a.y - b.y);
    for (const cloud of orderedClouds) {
      const image = cloudImages[cloud.variant].get(cloud.assetId);
      if (!image || !image.complete || image.naturalWidth <= 0) continue;

      const aspect = image.naturalWidth / image.naturalHeight;
      const drawWidth = cloud.width * (1 + Math.sin(time * 0.08 + cloud.phase) * 0.004);
      const drawHeight = (drawWidth / aspect) * cloud.heightScale;
      const drift = time * speedBase * cloud.speed;
      const x = wrap(cloud.x + wind.x * drift, -drawWidth * 1.2, width + drawWidth);
      const y = clamp(cloud.y + wind.y * drift * 0.2 + Math.sin(time * 0.06 + cloud.phase) * 3, height * 0.06, height * 0.38);
      const travelX = width + drawWidth * 2.2;

      drawCloudImage(cloud, image, x, y, drawWidth, drawHeight);

      if (x > width - drawWidth * 0.3 && wind.x > 0.05) {
        drawCloudImage(cloud, image, x - travelX, y, drawWidth, drawHeight);
      } else if (x < drawWidth * 0.3 && wind.x < -0.05) {
        drawCloudImage(cloud, image, x + travelX, y, drawWidth, drawHeight);
      }
    }
  }

  function drawStormCeiling(time) {
    if (weather.scene !== "storm") return;

    const wind = getWindVector();
    const speedBase = 2.4 + clamp(weather.windSpeed, 1, 48) * 0.18;
    const ceiling = [
      { id: 1, x: 0.08, y: 0.04, width: 0.72, alpha: 0.58, speed: 0.56, flip: false },
      { id: 2, x: 0.42, y: 0.02, width: 0.78, alpha: 0.54, speed: 0.48, flip: true },
      { id: 4, x: 0.76, y: 0.06, width: 0.7, alpha: 0.5, speed: 0.52, flip: false },
      { id: 3, x: 0.54, y: 0.22, width: 0.58, alpha: 0.36, speed: 0.36, flip: true },
      { id: 6, x: 0.24, y: 0.24, width: 0.5, alpha: 0.3, speed: 0.42, flip: false }
    ];

    for (const layer of ceiling) {
      const image = cloudImages.dark.get(layer.id);
      if (!image || !image.complete || image.naturalWidth <= 0) continue;

      const drawWidth = width * layer.width;
      const aspect = image.naturalWidth / image.naturalHeight;
      const drawHeight = (drawWidth / aspect) * 1.05;
      const drift = time * speedBase * layer.speed;
      const x = wrap(width * layer.x + wind.x * drift, -drawWidth * 0.8, width + drawWidth * 0.8);
      const y = height * layer.y + wind.y * drift * 0.08;

      ctx.save();
      ctx.globalAlpha = layer.alpha;
      ctx.translate(x, y);
      ctx.scale(layer.flip ? -1 : 1, 1);
      ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();

      if (x < width * 0.2) {
        drawStormCeilingCopy(image, x + width + drawWidth * 0.2, y, drawWidth, drawHeight, layer);
      } else if (x > width * 0.8) {
        drawStormCeilingCopy(image, x - width - drawWidth * 0.2, y, drawWidth, drawHeight, layer);
      }
    }
  }

  function drawStormCeilingCopy(image, x, y, drawWidth, drawHeight, layer) {
    ctx.save();
    ctx.globalAlpha = layer.alpha;
    ctx.translate(x, y);
    ctx.scale(layer.flip ? -1 : 1, 1);
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function drawCloudImage(cloud, image, x, y, drawWidth, drawHeight) {
    ctx.save();
    ctx.globalAlpha = cloud.alpha;
    ctx.translate(x, y);
    ctx.scale(cloud.flip ? -1 : 1, 1);
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();

  }

  function drawFieldShimmer(time) {
    if (!fieldReady) return;

    const wind = clamp(weather.windSpeed, 2, 42);
    const fieldTop = height * 0.49;
    const fieldHeight = height - fieldTop;
    const crop = coverCrop(fieldImage.width, fieldImage.height, width, height);
    const slices = 26;
    const strength = weather.scene === "storm" ? 1.65 : weather.scene === "rain" ? 1.28 : 0.9;
    const windVector = getWindVector();
    const windCurve = clamp(wind / 30, 0.12, 1.55);

    ctx.save();
    ctx.globalAlpha = weather.scene === "storm" ? 0.22 : weather.scene === "rain" ? 0.2 : 0.16;

    for (let i = 0; i < slices; i += 1) {
      const t = i / (slices - 1);
      const dy = fieldTop + t * fieldHeight;
      const dh = fieldHeight / slices + 2;
      const sy = crop.sy + (dy / height) * crop.sh;
      const sh = (dh / height) * crop.sh;
      const depth = 0.12 + t * 1.45;
      const closeBoost = t * t;
      const waveSpeed = 0.9 + wind * 0.026 + closeBoost * (0.75 + wind * 0.035);
      const gustSpeed = 0.36 + wind * 0.011 + closeBoost * (0.34 + wind * 0.018);
      const wave = Math.sin(time * waveSpeed + i * 0.72) * (0.72 + wind * 0.1 + closeBoost * wind * 0.05) * depth * strength;
      const gust = Math.sin(time * gustSpeed + i * 0.33) * (0.42 + wind * 0.048 + closeBoost * wind * 0.035) * depth * strength;
      const rainPush = getRainStrength() * Math.sin(time * (1.7 + windCurve * 0.8 + closeBoost * 0.9) + i * 0.9) * depth * 1.6;
      const dx = (wave + gust + rainPush) * (0.55 + Math.abs(windVector.x));

      ctx.drawImage(fieldImage, crop.sx, sy, crop.sw, sh, dx - 3, dy, width + 6, dh);
    }

    ctx.globalCompositeOperation = weather.scene === "storm" ? "multiply" : "source-over";
    ctx.globalAlpha = weather.scene === "clear" ? 0.055 : weather.scene === "rain" ? 0.105 : weather.scene === "storm" ? 0.24 : 0.09;
    ctx.fillStyle = weather.scene === "storm" ? "rgba(8, 36, 18, 0.74)" : "rgba(44, 94, 28, 0.48)";
    ctx.fillRect(0, fieldTop, width, fieldHeight);
    ctx.restore();
  }

  function drawFieldWeather(time) {
    const fieldTop = height * 0.5;
    const fieldHeight = height - fieldTop;
    const wind = clamp(weather.windSpeed, 2, 42);
    const windVector = getWindVector();
    const rainStrength = getRainStrength();
    const gustStrength = weather.scene === "storm" ? 0.9 : weather.scene === "rain" ? 0.72 : 0.46;

    drawPaddyWindWaves(time, fieldTop, fieldHeight, wind, windVector, rainStrength);
    drawFieldGustBands(time, fieldTop, fieldHeight, wind, windVector, gustStrength);
    if (rainStrength > 0.02) {
      drawWetFieldSheen(time, fieldTop, fieldHeight, windVector, rainStrength);
    }
    drawForegroundGrassSway(time, wind, windVector, rainStrength);
  }

  function drawPaddyWindWaves(time, fieldTop, fieldHeight, wind, windVector, rainStrength) {
    const windCurve = clamp(wind / 28, 0.18, 1.8);
    const waveCount = weather.scene === "storm" ? 12 : weather.scene === "rain" ? 11 : 10;
    const direction = Math.sign(windVector.x || 1);
    const travel = width * 1.65;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    for (let i = 0; i < waveCount; i += 1) {
      const t = i / Math.max(1, waveCount - 1);
      const closeBoost = t * t;
      const y = fieldTop + fieldHeight * (0.08 + t * 0.88) + Math.sin(time * (0.5 + windCurve * 0.28) + i * 1.3) * height * (0.006 + closeBoost * 0.016);
      const waveHeight = height * (0.046 + closeBoost * 0.07);
      const waveWidth = width * (0.62 + closeBoost * 0.34);
      const speed = (0.03 + wind * 0.0035) * (0.78 + closeBoost * 1.7);
      const x = wrap(width * (i * 0.21) + direction * time * speed * travel, -waveWidth, width + waveWidth);
      const lean = windVector.x * width * (0.1 + closeBoost * 0.1);
      const alpha = (0.09 + closeBoost * 0.13) * windCurve * (weather.scene === "storm" ? 0.86 : 1);
      const shineAlpha = alpha * (weather.scene === "storm" ? 0.18 : rainStrength > 0.02 ? 0.38 : 0.62);

      const shade = ctx.createLinearGradient(0, y - waveHeight, 0, y + waveHeight);
      shade.addColorStop(0, "rgba(7, 38, 16, 0)");
      shade.addColorStop(0.34, `rgba(7, 44, 15, ${alpha * 0.72})`);
      shade.addColorStop(0.48, `rgba(12, 56, 20, ${alpha})`);
      shade.addColorStop(0.58, `rgba(205, 238, 118, ${shineAlpha})`);
      shade.addColorStop(0.78, `rgba(65, 112, 34, ${alpha * 0.28})`);
      shade.addColorStop(1, "rgba(205, 238, 118, 0)");

      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(x - waveWidth * 0.5, y - waveHeight * 0.25);
      ctx.bezierCurveTo(
        x - waveWidth * 0.18 + lean,
        y - waveHeight * 0.95,
        x + waveWidth * 0.18 + lean,
        y + waveHeight * 0.95,
        x + waveWidth * 0.55,
        y + waveHeight * 0.18
      );
      ctx.lineTo(x + waveWidth * 0.48, y + waveHeight * 0.88);
      ctx.bezierCurveTo(
        x + waveWidth * 0.16 + lean,
        y + waveHeight * 0.35,
        x - waveWidth * 0.2 + lean,
        y - waveHeight * 0.35,
        x - waveWidth * 0.56,
        y + waveHeight * 0.2
      );
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = `rgba(218, 247, 130, ${shineAlpha * 0.72})`;
      ctx.lineWidth = Math.max(1, height * (0.001 + closeBoost * 0.002));
      ctx.beginPath();
      ctx.moveTo(x - waveWidth * 0.42, y - waveHeight * 0.1);
      ctx.bezierCurveTo(
        x - waveWidth * 0.14 + lean,
        y - waveHeight * 0.72,
        x + waveWidth * 0.16 + lean,
        y + waveHeight * 0.46,
        x + waveWidth * 0.42,
        y + waveHeight * 0.08
      );
      ctx.stroke();
      ctx.restore();

      if (x < waveWidth * 0.15) {
        drawPaddyWaveCopy(x + width + waveWidth * 0.25, y, waveWidth, waveHeight, lean, shade);
      } else if (x > width - waveWidth * 0.15) {
        drawPaddyWaveCopy(x - width - waveWidth * 0.25, y, waveWidth, waveHeight, lean, shade);
      }
    }

    ctx.restore();
  }

  function drawPaddyWaveCopy(x, y, waveWidth, waveHeight, lean, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(x - waveWidth * 0.5, y - waveHeight * 0.25);
    ctx.bezierCurveTo(x - waveWidth * 0.18 + lean, y - waveHeight * 0.95, x + waveWidth * 0.18 + lean, y + waveHeight * 0.95, x + waveWidth * 0.55, y + waveHeight * 0.18);
    ctx.lineTo(x + waveWidth * 0.48, y + waveHeight * 0.88);
    ctx.bezierCurveTo(x + waveWidth * 0.16 + lean, y + waveHeight * 0.35, x - waveWidth * 0.2 + lean, y - waveHeight * 0.35, x - waveWidth * 0.56, y + waveHeight * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  function drawFieldGustBands(time, fieldTop, fieldHeight, wind, windVector, strength) {
    const bandCount = weather.scene === "storm" ? 9 : weather.scene === "rain" ? 8 : 6;
    const windCurve = clamp(wind / 30, 0.12, 1.55);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    for (let i = 0; i < bandCount; i += 1) {
      const t = i / Math.max(1, bandCount - 1);
      const closeBoost = t * t;
      const bandWidth = width * (0.38 + t * 0.22);
      const bandHeight = height * (0.035 + t * 0.035);
      const travel = width + bandWidth * 2;
      const bandSpeed = (0.012 + wind * 0.0024) * (0.42 + Math.abs(windVector.x)) * (0.7 + windCurve * 0.55 + closeBoost * 1.35);
      const baseX = ((i * 0.29 + time * bandSpeed) % 1) * travel - bandWidth;
      const x = windVector.x < 0 ? width - baseX : baseX;
      const y = fieldTop + fieldHeight * (0.12 + t * 0.78) + Math.sin(time * (0.38 + windCurve * 0.28 + closeBoost * 0.6) + i) * height * (0.008 + closeBoost * 0.012);
      const alpha = strength * (0.05 + t * 0.045 + closeBoost * windCurve * 0.025);
      const shade = ctx.createLinearGradient(0, y - bandHeight / 2, 0, y + bandHeight / 2);

      shade.addColorStop(0, "rgba(22, 58, 25, 0)");
      shade.addColorStop(0.45, weather.scene === "storm" ? `rgba(7, 32, 18, ${alpha * 1.15})` : `rgba(21, 62, 26, ${alpha})`);
      shade.addColorStop(0.5, weather.scene === "storm" ? `rgba(74, 110, 58, ${alpha * 0.25})` : `rgba(197, 238, 143, ${alpha * 0.42})`);
      shade.addColorStop(1, weather.scene === "storm" ? "rgba(20, 42, 25, 0)" : "rgba(197, 238, 143, 0)");

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((windVector.x || 0.2) * 0.05);
      ctx.fillStyle = shade;
      ctx.fillRect(-bandWidth / 2, -bandHeight / 2, bandWidth, bandHeight);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawWetFieldSheen(time, fieldTop, fieldHeight, windVector, rainStrength) {
    const streakCount = weather.scene === "storm" ? 26 : 18;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineWidth = weather.scene === "storm" ? 1.25 : 0.9;
    ctx.strokeStyle = `rgba(190, 220, 190, ${0.06 + rainStrength * 0.1})`;

    for (let i = 0; i < streakCount; i += 1) {
      const t = i / Math.max(1, streakCount - 1);
      const y = fieldTop + fieldHeight * (0.18 + t * 0.78);
      const x = wrap(i * width * 0.17 + time * (38 + rainStrength * 52) * (windVector.x || 0.35), -width * 0.2, width * 1.2);
      const length = width * (0.035 + t * 0.035);
      const slope = height * (0.004 + t * 0.01);

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length * Math.sign(windVector.x || 1), y + slope);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "multiply";
    const wet = ctx.createLinearGradient(0, fieldTop, 0, height);
    wet.addColorStop(0, "rgba(20, 45, 36, 0)");
    wet.addColorStop(0.48, `rgba(22, 49, 35, ${0.05 + rainStrength * 0.08})`);
    wet.addColorStop(1, `rgba(15, 38, 28, ${0.08 + rainStrength * 0.1})`);
    ctx.fillStyle = wet;
    ctx.fillRect(0, fieldTop, width, fieldHeight);
    ctx.restore();
  }

  function drawForegroundGrassSway(time, wind, windVector, rainStrength) {
    const rng = random(5417);
    const count = 58;
    const windCurve = clamp(wind / 30, 0.12, 1.65);
    const windForce = clamp(wind / 24, 0.18, 1.85);
    const rainLean = rainStrength * 8;

    ctx.save();
    ctx.lineCap = "round";

    for (let i = 0; i < count; i += 1) {
      const x = rng() * width;
      const y = height * (0.68 + rng() * 0.3);
      const length = height * (0.025 + rng() * 0.045);
      const phase = rng() * Math.PI * 2;
      const depth = clamp((y / height - 0.68) / 0.3, 0, 1);
      const closeBoost = depth * depth;
      const speed = 0.95 + wind * 0.028 + closeBoost * (1.45 + wind * 0.07);
      const fastTip = Math.sin(time * (2.4 + wind * 0.055 + closeBoost * 1.8) + phase * 1.7) * length * (0.08 + closeBoost * 0.13) * windCurve;
      const sway = (Math.sin(time * speed + phase) * length * (0.14 + closeBoost * 0.44) + fastTip) * windForce;
      const lean = (windVector.x || 0.25) * length * (0.22 + windForce * (0.15 + closeBoost * 0.16)) + rainLean * (0.55 + closeBoost);
      const topX = x + sway + lean;
      const topY = y - length;
      const alpha = (0.04 + rng() * 0.04 + closeBoost * 0.035) * (rainStrength > 0 ? 1.25 : 1);

      ctx.lineWidth = 0.7 + rng() * 0.9 + closeBoost * 1.1;
      ctx.strokeStyle = weather.scene === "storm"
        ? `rgba(72, 118, 68, ${alpha * 1.15})`
        : rainStrength > 0
          ? `rgba(176, 218, 155, ${alpha})`
          : `rgba(184, 234, 108, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 0.42 + sway * (0.28 + closeBoost * 0.18), y - length * 0.48, topX, topY);
      ctx.stroke();

      if (rainStrength > 0.02 && i % 3 === 0) {
        ctx.strokeStyle = weather.scene === "storm"
          ? `rgba(130, 160, 130, ${0.025 + rainStrength * 0.025})`
          : `rgba(220, 242, 218, ${0.035 + rainStrength * 0.035})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x + 1, y - length * 0.14);
        ctx.lineTo(topX + 1, topY + length * 0.18);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawMist() {
    const rainStrength = getRainStrength();
    const strength = weather.scene === "fog" ? 0.22 : weather.scene === "rain" ? clamp(0.2 + rainStrength * 0.22, 0.24, 0.36) : weather.scene === "storm" ? 0.24 : 0;
    if (strength <= 0) return;

    const mist = ctx.createLinearGradient(0, height * 0.08, 0, height * 0.92);
    mist.addColorStop(0, `rgba(126, 146, 150, ${strength * 0.5})`);
    mist.addColorStop(0.36, `rgba(168, 184, 183, ${strength})`);
    mist.addColorStop(0.54, `rgba(178, 191, 186, ${strength * 0.44})`);
    mist.addColorStop(0.72, `rgba(178, 191, 186, ${strength * 0.1})`);
    mist.addColorStop(1, "rgba(178, 191, 186, 0)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, 0, width, height);

  }

  function drawDepthMist(time) {
    const rainStrength = getRainStrength();
    const active = weather.scene === "rain" || weather.scene === "storm" || weather.scene === "fog";
    if (!active) return;

    const farStrength = weather.scene === "storm"
      ? 0.34
      : weather.scene === "fog"
        ? 0.32
        : clamp(0.26 + rainStrength * 0.2, 0.3, 0.42);
    const yTop = height * 0.28;
    const yBottom = height * 0.86;
    const depth = ctx.createLinearGradient(0, yTop, 0, yBottom);

    depth.addColorStop(0, "rgba(152, 170, 170, 0)");
    depth.addColorStop(0.2, `rgba(164, 181, 179, ${farStrength})`);
    depth.addColorStop(0.38, `rgba(171, 186, 181, ${farStrength * 0.78})`);
    depth.addColorStop(0.62, `rgba(169, 182, 175, ${farStrength * 0.24})`);
    depth.addColorStop(1, "rgba(166, 178, 170, 0)");

    ctx.fillStyle = depth;
    ctx.fillRect(0, yTop, width, yBottom - yTop);
    drawGroundMistBands(time, farStrength * 0.42);
  }

  function drawGroundMistBands(time, strength) {
    const wind = getWindVector();
    const bands = 5;
    const baseY = height * 0.43;

    ctx.save();
    for (let i = 0; i < bands; i += 1) {
      const y = baseY + i * height * 0.045 + Math.sin(time * 0.18 + i) * height * 0.008;
      const bandHeight = height * (0.08 + i * 0.016);
      const drift = wrap(time * (8 + i * 2) * wind.x, -width, width);
      const fog = ctx.createLinearGradient(0, y - bandHeight / 2, 0, y + bandHeight / 2);
      const depthFade = 1 - i / bands;
      const alpha = strength * (0.22 * depthFade + 0.035);

      fog.addColorStop(0, "rgba(170, 185, 180, 0)");
      fog.addColorStop(0.5, `rgba(170, 185, 180, ${alpha})`);
      fog.addColorStop(1, "rgba(170, 185, 180, 0)");
      ctx.fillStyle = fog;
      ctx.fillRect(drift - width, y - bandHeight / 2, width * 3, bandHeight);
    }
    ctx.restore();
  }

  function drawRain(time) {
    const rainStrength = getRainStrength();
    if (rainStrength <= 0.02) return;

    const wind = clamp(weather.windSpeed, 3, 46);
    const windVector = getWindVector();
    ctx.lineCap = "round";
    ctx.lineWidth = rainStrength > 0.55 ? 1.05 : 0.78;
    ctx.strokeStyle = `rgba(170, 196, 205, ${0.16 + rainStrength * 0.2})`;

    for (const drop of drops) {
      const speed = (450 + wind * 10) * drop.speed;
      const x = wrap(drop.x + time * wind * 18 * drop.sway * windVector.x, -160, width + 160);
      const y = wrap(drop.y + time * speed, -140, height + 180);
      const length = drop.length * (0.7 + rainStrength);
      const slant = length * (0.1 + Math.abs(windVector.x) * 0.28) * Math.sign(windVector.x || 1);

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - slant, y + length);
      ctx.stroke();
    }
  }

  function createRainDrops() {
    const rng = random(9929);
    const result = [];
    for (let i = 0; i < 130; i += 1) {
      result.push({
        x: rng() * (width + 320) - 160,
        y: rng() * (height + 260) - 160,
        speed: 0.62 + rng() * 0.9,
        length: 14 + rng() * 30,
        sway: 0.5 + rng() * 0.9
      });
    }
    return result;
  }

  function drawGlassDrops(time) {
    const rainStrength = getRainStrength();
    if (rainStrength <= 0.03) return;

    const storm = weather.scene === "storm";
    const windVector = getWindVector();
    const count = storm ? 128 : Math.round(88 + rainStrength * 34);
    const paneAlpha = storm ? 0.1 : 0.052 + rainStrength * 0.038;
    const pane = ctx.createLinearGradient(0, 0, width, height);

    captureRefractionScene();

    pane.addColorStop(0, `rgba(190, 216, 224, ${paneAlpha})`);
    pane.addColorStop(0.42, "rgba(190, 216, 224, 0)");
    pane.addColorStop(1, `rgba(150, 185, 190, ${paneAlpha * 0.45})`);

    ctx.save();
    ctx.fillStyle = pane;
    ctx.fillRect(0, 0, width, height);

    ctx.lineCap = "round";
    for (let i = 0; i < count && i < glassDrops.length; i += 1) {
      drawGlassDrop(glassDrops[i], time, rainStrength, windVector, storm);
    }
    ctx.restore();
  }

  function drawGlassDrop(drop, time, rainStrength, windVector, storm) {
    const baseRadius = drop.radius * (storm ? 1.22 : 1.02 + rainStrength * 0.18);
    const sizeBoost = clamp((baseRadius - 1.4) / 5.4, 0, 1.35);
    const mergeCycle = (time * (0.1 + drop.mergeSpeed * 0.08) + drop.mergePhase) % 1;
    const mergeProgress = smoothstep(0.2, 0.82, mergeCycle);
    const merging = drop.childRadius > 0 && mergeCycle > 0.16 && mergeCycle < 0.92;
    const mergedBoost = merging ? smoothstep(0.62, 0.88, mergeCycle) * drop.childRadius * 0.24 : 0;
    const radius = baseRadius + mergedBoost;
    const speed = ((storm ? 18 : 9) + rainStrength * 28) * (0.18 + sizeBoost * 2.45);
    const slide = time * speed * drop.speed;
    const wiggle = Math.sin(time * (0.45 + drop.wiggle * 0.22) + drop.phase) * radius * 0.18;
    const x = wrap(drop.x + windVector.x * slide * 0.32 + wiggle, -drop.radius * 4, width + drop.radius * 4);
    const y = wrap(drop.y + slide, -height * 0.2, height + drop.trail + drop.radius * 4);
    const stretch = 1 + drop.stretch * 0.14 + sizeBoost * 0.24;
    const trailLength = drop.trail * (0.65 + rainStrength * 0.6) * (0.35 + sizeBoost);
    const alpha = (0.46 + drop.alpha * 0.42) * (storm ? 1.16 : 1);

    drawGlassBeadTrail(drop, x, y, radius, trailLength, alpha, windVector, sizeBoost);

    if (merging && drop.childRadius > 1.2) {
      const childT = mergeProgress;
      const childAlpha = alpha * (1 - smoothstep(0.72, 0.92, mergeCycle)) * 0.8;
      const startX = x + drop.mergeOffsetX * radius;
      const startY = y + drop.mergeOffsetY * radius;
      const childX = startX + (x - startX) * childT;
      const childY = startY + (y - startY) * childT;
      const neckAlpha = childAlpha * smoothstep(0.28, 0.72, mergeCycle);

      ctx.strokeStyle = `rgba(88, 135, 145, ${neckAlpha * 0.42})`;
      ctx.lineWidth = Math.max(0.9, drop.childRadius * 0.42);
      ctx.beginPath();
      ctx.moveTo(childX, childY);
      ctx.quadraticCurveTo((childX + x) / 2 + windVector.x * radius * 0.16, (childY + y) / 2, x, y);
      ctx.stroke();
      drawRoundGlassBead(childX, childY, drop.childRadius * (1 - childT * 0.38), 0.98, childAlpha, 0, false);
    }

    const contactFlatness = clamp(sizeBoost * 0.36 + rainStrength * 0.08, 0, 0.5);
    drawRoundGlassBead(x, y, radius, stretch, alpha, contactFlatness, radius > 3.7);
  }

  function drawGlassBeadTrail(drop, x, y, radius, trailLength, alpha, windVector, sizeBoost) {
    if (trailLength <= radius * 1.2) return;

    const trailTopY = y - trailLength;
    const trailTopX = x - windVector.x * radius * 0.45;
    const trail = ctx.createLinearGradient(x, y - radius * 0.45, trailTopX, trailTopY);
    trail.addColorStop(0, `rgba(145, 188, 198, ${alpha * 0.16 * sizeBoost})`);
    trail.addColorStop(0.5, `rgba(80, 118, 126, ${alpha * 0.08 * sizeBoost})`);
    trail.addColorStop(1, "rgba(80, 118, 126, 0)");
    ctx.strokeStyle = trail;
    ctx.lineWidth = Math.max(0.55, radius * 0.13);
    ctx.beginPath();
    ctx.moveTo(x, y - radius * 0.62);
    ctx.bezierCurveTo(
      x - windVector.x * radius * 0.36,
      y - trailLength * 0.28,
      x + Math.sin(drop.phase) * radius * 0.2,
      y - trailLength * 0.68,
      trailTopX,
      trailTopY
    );
    ctx.stroke();

    const beadCount = 3 + Math.floor(drop.trailDots * 6);
    for (let i = 0; i < beadCount; i += 1) {
      const t = (i + 0.35) / beadCount;
      const beadY = y - trailLength * t;
      const beadX = x - windVector.x * radius * 0.42 * t + Math.sin(drop.phase + i * 1.7) * radius * 0.16;
      const beadR = Math.max(0.45, radius * (0.12 + (1 - t) * 0.05) * (0.7 + drop.trailDots * 0.5));
      const beadAlpha = alpha * (0.22 + (1 - t) * 0.18);

      ctx.fillStyle = `rgba(225, 244, 248, ${beadAlpha})`;
      ctx.beginPath();
      ctx.ellipse(beadX, beadY, beadR * 0.8, beadR, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(26, 54, 62, ${beadAlpha * 0.5})`;
      ctx.lineWidth = Math.max(0.45, beadR * 0.35);
      ctx.beginPath();
      ctx.ellipse(beadX, beadY, beadR * 0.8, beadR, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawRoundGlassBead(x, y, radius, stretch, alpha, flatness, refract) {
    const rx = radius * (0.94 + (stretch - 1) * 0.08 + flatness * 0.18);
    const ry = radius * (stretch - flatness * 0.12);
    if (refract) {
      drawDropRefraction(x, y, rx, ry, flatness, alpha);
    }

    const fill = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.42, radius * 0.08, x, y, radius * 1.4);
    fill.addColorStop(0, `rgba(236, 249, 251, ${alpha * 0.26})`);
    fill.addColorStop(0.32, `rgba(142, 194, 205, ${alpha * 0.15})`);
    fill.addColorStop(0.72, `rgba(36, 78, 88, ${alpha * 0.18})`);
    fill.addColorStop(1, `rgba(3, 18, 23, ${alpha * 0.4})`);
    ctx.fillStyle = fill;
    ctx.beginPath();
    drawFlattenedBeadPath(x, y, rx, ry, flatness);
    ctx.fill();

    ctx.strokeStyle = `rgba(4, 20, 25, ${alpha * 0.5})`;
    ctx.lineWidth = Math.max(0.6, radius * 0.18);
    ctx.beginPath();
    drawFlattenedBeadPath(x, y, rx, ry, flatness);
    ctx.stroke();

    ctx.strokeStyle = `rgba(220, 240, 244, ${alpha * 0.78})`;
    ctx.lineWidth = Math.max(0.65, radius * 0.16);
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.34, y - ry * 0.36);
    ctx.quadraticCurveTo(x - rx * 0.08, y - ry * 0.62, x + rx * 0.26, y - ry * 0.36);
    ctx.stroke();

    ctx.fillStyle = `rgba(235, 250, 252, ${alpha * 0.52})`;
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.28, y - ry * 0.3, Math.max(0.75, radius * 0.14), Math.max(0.55, radius * 0.08), -0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(42, 78, 86, ${alpha * 0.42})`;
    ctx.lineWidth = Math.max(0.8, radius * 0.14);
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.42, y + ry * 0.32);
    ctx.quadraticCurveTo(x - rx * 0.08, y + ry * 0.62, x + rx * 0.34, y + ry * 0.46);
    ctx.stroke();

    if (flatness > 0.04) {
      ctx.strokeStyle = `rgba(7, 22, 27, ${alpha * 0.32 * flatness})`;
      ctx.lineWidth = Math.max(0.8, radius * 0.18);
      ctx.beginPath();
      ctx.moveTo(x - rx * (0.46 + flatness * 0.1), y + ry * (0.5 + flatness * 0.16));
      ctx.quadraticCurveTo(x, y + ry * (0.68 + flatness * 0.08), x + rx * (0.46 + flatness * 0.1), y + ry * (0.5 + flatness * 0.16));
      ctx.stroke();
    }
  }

  function captureRefractionScene() {
    if (!refractionCtx || width <= 0 || height <= 0) return;
    if (refractionCanvas.width !== width) refractionCanvas.width = width;
    if (refractionCanvas.height !== height) refractionCanvas.height = height;

    refractionCtx.setTransform(1, 0, 0, 1, 0, 0);
    refractionCtx.clearRect(0, 0, width, height);
    refractionCtx.drawImage(canvas, 0, 0, width, height);
  }

  function drawDropRefraction(x, y, rx, ry, flatness, alpha) {
    if (!refractionCtx || refractionCanvas.width <= 0 || refractionCanvas.height <= 0 || width <= 0 || height <= 0) return;

    const sampleW = Math.max(2, rx * 2.35);
    const sampleH = Math.max(2, ry * 2.35);
    const sourceScale = 0.68;
    const lensOffsetX = rx * 0.2;
    const lensOffsetY = -ry * 0.18;
    const sw = Math.min(width, sampleW * sourceScale);
    const sh = Math.min(height, sampleH * sourceScale);
    const sx = clamp(x - sw * 0.5 + lensOffsetX, 0, Math.max(0, width - sw));
    const sy = clamp(y - sh * 0.5 + lensOffsetY, 0, Math.max(0, height - sh));

    ctx.save();
    ctx.beginPath();
    drawFlattenedBeadPath(x, y, rx, ry, flatness);
    ctx.clip();
    ctx.globalAlpha = clamp(alpha * 0.56, 0.34, 0.66);
    ctx.drawImage(refractionCanvas, sx, sy, sw, sh, x - rx * 1.1, y - ry * 1.1, rx * 2.2, ry * 2.2);

    const caustic = ctx.createLinearGradient(x, y - ry, x, y + ry);
    caustic.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.08})`);
    caustic.addColorStop(0.56, "rgba(255, 255, 255, 0)");
    caustic.addColorStop(1, `rgba(2, 14, 18, ${alpha * 0.28})`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = caustic;
    ctx.fillRect(x - rx * 1.1, y - ry * 1.1, rx * 2.2, ry * 2.2);
    ctx.restore();
  }

  function drawFlattenedBeadPath(x, y, rx, ry, flatness) {
    if (flatness <= 0.02) {
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      return;
    }

    const topY = y - ry;
    const bottomY = y + ry * (0.72 - flatness * 0.08);
    const sideY = y + ry * (0.18 + flatness * 0.08);
    const bottomHalf = rx * (0.52 + flatness * 0.16);

    ctx.moveTo(x, topY);
    ctx.bezierCurveTo(x + rx * 0.72, topY, x + rx, y - ry * 0.2, x + rx * 0.92, sideY);
    ctx.bezierCurveTo(x + rx * 0.84, y + ry * 0.54, x + bottomHalf, bottomY, x + bottomHalf * 0.68, bottomY);
    ctx.quadraticCurveTo(x, bottomY + ry * 0.08 * flatness, x - bottomHalf * 0.68, bottomY);
    ctx.bezierCurveTo(x - bottomHalf, bottomY, x - rx * 0.84, y + ry * 0.54, x - rx * 0.92, sideY);
    ctx.bezierCurveTo(x - rx, y - ry * 0.2, x - rx * 0.72, topY, x, topY);
    ctx.closePath();
  }

  function createGlassDrops() {
    const rng = random(42403);
    const result = [];
    for (let i = 0; i < 146; i += 1) {
      const big = rng() > 0.78;
      result.push({
        x: rng() * width,
        y: rng() * height,
        radius: big ? 4.6 + rng() * 4.6 : 1.4 + rng() * 3.4,
        stretch: rng(),
        trail: height * (0.045 + rng() * 0.16),
        speed: big ? 1.15 + rng() * 1.45 : 0.62 + rng() * 1.05,
        alpha: rng(),
        wiggle: rng(),
        phase: rng() * Math.PI * 2,
        mergePhase: rng(),
        mergeSpeed: rng(),
        mergeOffsetX: (rng() - 0.5) * 3.6,
        mergeOffsetY: -1.2 - rng() * 2.4,
        trailDots: rng(),
        childRadius: rng() > 0.28 ? 0.55 + rng() * 1.45 : 0
      });
    }
    return result;
  }

  function coverCrop(imageWidth, imageHeight, targetWidth, targetHeight) {
    const imageRatio = imageWidth / imageHeight;
    const targetRatio = targetWidth / targetHeight;
    let sw = imageWidth;
    let sh = imageHeight;
    let sx = 0;
    let sy = 0;

    if (imageRatio > targetRatio) {
      sw = imageHeight * targetRatio;
      sx = (imageWidth - sw) / 2;
    } else {
      sh = imageWidth / targetRatio;
      sy = (imageHeight - sh) / 2;
    }

    return { sx, sy, sw, sh };
  }

  function getRainStrength() {
    if (weather.scene === "storm") return 0.82;
    if (weather.scene === "rain") return clamp(0.34 + weather.precipitation / 14, 0.34, 0.68);
    return 0;
  }

  function getWindVector() {
    const fromDegrees = normalizeDegrees(weather.windDirection);
    const toRadians = ((fromDegrees + 180) * Math.PI) / 180;
    return {
      x: Math.sin(toRadians),
      y: -Math.cos(toRadians) * 0.55
    };
  }

  function normalizeDegrees(value) {
    const degrees = Number.isFinite(Number(value)) ? Number(value) : 270;
    return ((degrees % 360) + 360) % 360;
  }

  function wrap(value, min, max) {
    const range = max - min;
    return ((((value - min) % range) + range) % range) + min;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(edge0, edge1, value) {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function random(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
})();
