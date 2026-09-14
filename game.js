"use strict";

(() => {
  const ROUND_LENGTH_SECONDS = 60;
  const STARTING_LIVES = 5;
  const BASE_SPAWN_INTERVAL_MS = 850;
  const MAX_ORBS_ON_SCREEN = 12;
  const ORB_COLORS = ["#4ef2ff", "#ffc95f", "#95ff7c", "#eaa5ff", "#ff817a"];

  const camera = document.getElementById("camera");
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayText = document.getElementById("overlay-text");
  const startButton = document.getElementById("start-button");
  const statusText = document.getElementById("status-text");
  const scoreValue = document.getElementById("score-value");
  const livesValue = document.getElementById("lives-value");
  const timeValue = document.getElementById("time-value");
  const modeValue = document.getElementById("mode-value");
  const comboValue = document.getElementById("combo-value");

  let audioContext = null;
  let cameraStream = null;
  let orbIdCounter = 0;
  let hasOrientationSupport = false;
  let orientationAllowed = false;
  let orientationX = 0;
  let orientationY = 0;
  let pointerX = 0;
  let pointerY = 0;

  const state = {
    running: false,
    score: 0,
    lives: STARTING_LIVES,
    combo: 0,
    maxCombo: 0,
    remainingTime: ROUND_LENGTH_SECONDS,
    orbs: [],
    lastFrameMs: 0,
    lastSpawnMs: 0,
    modeLabel: "Ready",
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function updateHud() {
    scoreValue.textContent = String(state.score);
    livesValue.textContent = String(state.lives);
    timeValue.textContent = state.remainingTime.toFixed(1);
    modeValue.textContent = state.modeLabel;
    comboValue.textContent = String(state.combo);
  }

  function showStatus(message) {
    statusText.textContent = message;
  }

  function ensureAudioContext() {
    if (audioContext) {
      return audioContext;
    }

    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }

    audioContext = new AudioCtor();
    return audioContext;
  }

  function playTone({ frequency, durationMs, gain, type }) {
    const ctxAudio = ensureAudioContext();
    if (!ctxAudio) {
      return;
    }

    if (ctxAudio.state === "suspended") {
      ctxAudio.resume().catch(() => {});
    }

    const oscillator = ctxAudio.createOscillator();
    const gainNode = ctxAudio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.value = gain;
    oscillator.connect(gainNode);
    gainNode.connect(ctxAudio.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      ctxAudio.currentTime + durationMs / 1000
    );
    oscillator.stop(ctxAudio.currentTime + durationMs / 1000);
  }

  function playHitSound(combo) {
    const lift = Math.min(combo, 12) * 18;
    playTone({
      frequency: 310 + lift,
      durationMs: 90,
      gain: 0.03,
      type: "triangle",
    });
  }

  function playMissSound() {
    playTone({
      frequency: 150,
      durationMs: 130,
      gain: 0.035,
      type: "sawtooth",
    });
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      state.modeLabel = "Simulation (no camera API)";
      showStatus("Camera API unavailable, running simulated AR mode.");
      return;
    }

    if (cameraStream) {
      state.modeLabel = "Live Camera AR";
      return;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      camera.srcObject = cameraStream;
      await camera.play();
      state.modeLabel = "Live Camera AR";
      showStatus("Camera connected. Move around and tap the orbs.");
    } catch (error) {
      state.modeLabel = "Simulation (camera denied)";
      showStatus("Camera permission denied, running simulated AR mode.");
    }
  }

  async function requestMotionControls() {
    hasOrientationSupport = "DeviceOrientationEvent" in window;
    if (!hasOrientationSupport) {
      showStatus("Motion sensors unavailable; pointer aiming enabled.");
      return;
    }

    try {
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        const permission = await DeviceOrientationEvent.requestPermission();
        orientationAllowed = permission === "granted";
      } else {
        orientationAllowed = true;
      }
    } catch (error) {
      orientationAllowed = false;
    }

    if (!orientationAllowed) {
      showStatus("Motion permission not granted; pointer aiming enabled.");
      return;
    }

    window.addEventListener("deviceorientation", onDeviceOrientation, true);
  }

  function onDeviceOrientation(event) {
    const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
    const beta = Number.isFinite(event.beta) ? event.beta : 0;
    orientationX = clamp(gamma / 45, -1, 1);
    orientationY = clamp((beta - 25) / 55, -1, 1);
  }

  function spawnOrb(nowMs) {
    if (state.orbs.length >= MAX_ORBS_ON_SCREEN) {
      return;
    }

    const depth = Math.random();
    const speedFactor = 0.8 + Math.random() * 1.25;
    const lifetime = 3300 + Math.random() * 2500;

    state.orbs.push({
      id: orbIdCounter++,
      x: canvas.width * (0.15 + Math.random() * 0.7),
      y: canvas.height * (0.2 + Math.random() * 0.6),
      vx: (Math.random() * 2 - 1) * 75 * speedFactor,
      vy: (Math.random() * 2 - 1) * 75 * speedFactor,
      wobble: 18 + Math.random() * 40,
      hue: ORB_COLORS[Math.floor(Math.random() * ORB_COLORS.length)],
      depth,
      ageMs: 0,
      lifeMs: lifetime,
      phase: Math.random() * Math.PI * 2,
      baseRadius: 15 + (1 - depth) * 30,
      bornMs: nowMs,
    });
  }

  function getSpawnInterval() {
    const difficultyLift = Math.min(state.score, 350);
    return Math.max(260, BASE_SPAWN_INTERVAL_MS - difficultyLift * 1.1);
  }

  function applyMissPenalty() {
    state.lives = Math.max(0, state.lives - 1);
    state.combo = 0;
    playMissSound();
  }

  function updateOrbs(deltaMs, nowMs) {
    const pointerFactorX = (pointerX - 0.5) * 2;
    const pointerFactorY = (pointerY - 0.5) * 2;
    const lookX = orientationAllowed ? orientationX : pointerFactorX;
    const lookY = orientationAllowed ? orientationY : pointerFactorY;
    const parallaxX = lookX * 45;
    const parallaxY = lookY * 45;

    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const orb = state.orbs[i];
      orb.ageMs += deltaMs;

      const driftScale = 1 + (1 - orb.depth) * 0.5;
      const wobbleX = Math.cos(nowMs / 390 + orb.phase) * orb.wobble;
      const wobbleY = Math.sin(nowMs / 430 + orb.phase) * orb.wobble;
      orb.x += (orb.vx + wobbleX) * (deltaMs / 1000) * driftScale - parallaxX * 0.02;
      orb.y += (orb.vy + wobbleY) * (deltaMs / 1000) * driftScale - parallaxY * 0.02;

      const margin = 80;
      if (orb.x < -margin || orb.x > canvas.width + margin || orb.y < -margin || orb.y > canvas.height + margin) {
        state.orbs.splice(i, 1);
        applyMissPenalty();
        continue;
      }

      if (orb.ageMs >= orb.lifeMs) {
        state.orbs.splice(i, 1);
        applyMissPenalty();
      }
    }
  }

  function drawOrb(orb, nowMs) {
    const lifeRatio = clamp(1 - orb.ageMs / orb.lifeMs, 0, 1);
    const pulse = 1 + Math.sin((nowMs - orb.bornMs) / 150 + orb.phase) * 0.12;
    const radius = orb.baseRadius * pulse;
    orb.drawRadius = radius;

    const gradient = ctx.createRadialGradient(orb.x, orb.y, radius * 0.1, orb.x, orb.y, radius * 1.5);
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.35, orb.hue);
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.globalAlpha = 0.35 + lifeRatio * 0.6;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, radius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, Math.max(2, radius * 0.25), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawScene(nowMs) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const vignette = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      Math.min(canvas.width, canvas.height) * 0.2,
      canvas.width / 2,
      canvas.height / 2,
      Math.max(canvas.width, canvas.height) * 0.7
    );
    vignette.addColorStop(0, "rgba(0, 18, 30, 0.02)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.35)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const orb of state.orbs) {
      drawOrb(orb, nowMs);
    }
  }

  function detectHit(x, y) {
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const orb = state.orbs[i];
      const radius = orb.drawRadius || orb.baseRadius;
      const dx = x - orb.x;
      const dy = y - orb.y;
      if (dx * dx + dy * dy <= radius * radius * 1.25) {
        return i;
      }
    }
    return -1;
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointerX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    pointerY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  }

  function onPointerDown(event) {
    if (!state.running) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hitIndex = detectHit(x, y);

    if (hitIndex === -1) {
      applyMissPenalty();
      return;
    }

    state.orbs.splice(hitIndex, 1);
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    const points = 8 + Math.min(24, state.combo * 2);
    state.score += points;
    playHitSound(state.combo);
  }

  function resetRound() {
    state.running = true;
    state.score = 0;
    state.lives = STARTING_LIVES;
    state.combo = 0;
    state.maxCombo = 0;
    state.remainingTime = ROUND_LENGTH_SECONDS;
    state.orbs.length = 0;
    state.lastFrameMs = 0;
    state.lastSpawnMs = 0;
  }

  function stopRound(victory) {
    state.running = false;
    overlay.classList.remove("hidden");

    if (victory) {
      overlayTitle.textContent = "Victory!";
      overlayText.textContent =
        "You survived the full round. Keep pushing your score with bigger combos.";
    } else {
      overlayTitle.textContent = "Round Over";
      overlayText.textContent = "You ran out of lives. Try a steadier aim and avoid misses.";
    }

    showStatus(
      `Final score: ${state.score} | Best combo: ${state.maxCombo}x | Mode: ${state.modeLabel}`
    );
    startButton.textContent = "Play Again";
  }

  function gameLoop(nowMs) {
    if (!state.running) {
      return;
    }

    if (!state.lastFrameMs) {
      state.lastFrameMs = nowMs;
      state.lastSpawnMs = nowMs;
    }

    const deltaMs = Math.min(42, nowMs - state.lastFrameMs);
    state.lastFrameMs = nowMs;
    state.remainingTime = Math.max(0, state.remainingTime - deltaMs / 1000);

    if (nowMs - state.lastSpawnMs >= getSpawnInterval()) {
      spawnOrb(nowMs);
      state.lastSpawnMs = nowMs;
    }

    updateOrbs(deltaMs, nowMs);
    drawScene(nowMs);
    updateHud();

    if (state.lives <= 0) {
      stopRound(false);
      return;
    }

    if (state.remainingTime <= 0) {
      stopRound(true);
      return;
    }

    window.requestAnimationFrame(gameLoop);
  }

  async function startRound() {
    startButton.disabled = true;
    showStatus("Preparing camera and controls...");

    await startCamera();
    await requestMotionControls();

    overlay.classList.add("hidden");
    resetRound();
    updateHud();
    startButton.disabled = false;
    window.requestAnimationFrame(gameLoop);
  }

  function bindEvents() {
    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    startButton.addEventListener("click", () => {
      if (!state.running) {
        startRound().catch((error) => {
          showStatus(`Unable to start round: ${error.message}`);
          startButton.disabled = false;
        });
      }
    });
    window.addEventListener("beforeunload", () => {
      if (!cameraStream) {
        return;
      }
      for (const track of cameraStream.getTracks()) {
        track.stop();
      }
    });
  }

  function init() {
    resizeCanvas();
    pointerX = 0.5;
    pointerY = 0.5;
    updateHud();
    bindEvents();
    drawScene(performance.now());
    showStatus("Tap Start AR Round to begin.");
  }

  init();
})();
