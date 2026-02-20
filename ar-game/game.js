(function () {
  "use strict";

  const GAME_DURATION_SECONDS = 45;
  const SPAWN_INTERVAL_MS = 850;
  const TARGET_LIFETIME_MS = 4200;
  const MAX_ACTIVE_TARGETS = 6;
  const TARGET_SCORE = 120;
  const HIT_POINTS = 10;
  const MISS_PENALTY = 5;

  const COLORS = [
    "#22d3ee",
    "#f97316",
    "#a78bfa",
    "#34d399",
    "#f43f5e",
    "#facc15"
  ];
  const SHAPES = ["octahedron", "tetrahedron", "icosahedron", "dodecahedron"];

  const markerEl = document.getElementById("hiroMarker");
  const gameRootEl = document.getElementById("gameRoot");
  const scoreValueEl = document.getElementById("scoreValue");
  const timeValueEl = document.getElementById("timeValue");
  const goalValueEl = document.getElementById("goalValue");
  const statusMessageEl = document.getElementById("statusMessage");
  const startButtonEl = document.getElementById("startButton");

  if (
    !markerEl ||
    !gameRootEl ||
    !scoreValueEl ||
    !timeValueEl ||
    !goalValueEl ||
    !statusMessageEl ||
    !startButtonEl
  ) {
    return;
  }

  const state = {
    running: false,
    markerVisible: false,
    score: 0,
    timeLeft: GAME_DURATION_SECONDS,
    nextTargetId: 1,
    clockIntervalId: null,
    spawnIntervalId: null,
    activeTargets: new Map()
  };

  goalValueEl.textContent = String(TARGET_SCORE);

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  function updateHud() {
    scoreValueEl.textContent = String(state.score);
    timeValueEl.textContent = String(state.timeLeft) + "s";
  }

  function setStatus(message, tone) {
    statusMessageEl.textContent = message;
    statusMessageEl.classList.remove("good", "warn");
    if (tone === "good" || tone === "warn") {
      statusMessageEl.classList.add(tone);
    }
  }

  function buildSpawnPosition() {
    const angle = randomInRange(0, Math.PI * 2);
    const radius = randomInRange(0.15, 0.7);
    const x = Number((Math.cos(angle) * radius).toFixed(2));
    const y = Number(randomInRange(0.2, 0.72).toFixed(2));
    const z = Number((Math.sin(angle) * radius).toFixed(2));
    return { x, y, z };
  }

  function removeTarget(targetId, withAnimation) {
    const target = state.activeTargets.get(targetId);
    if (!target) {
      return;
    }

    state.activeTargets.delete(targetId);
    window.clearTimeout(target.despawnTimeoutId);
    target.el.removeEventListener("click", target.onClick);
    target.el.classList.remove("target");

    if (withAnimation) {
      target.el.setAttribute(
        "animation__shrink",
        "property: scale; to: 0.02 0.02 0.02; dur: 220; easing: easeInBack"
      );
      target.el.setAttribute(
        "animation__fade",
        "property: material.opacity; to: 0; dur: 220; easing: linear"
      );
      window.setTimeout(function () {
        target.el.remove();
      }, 230);
      return;
    }

    target.el.remove();
  }

  function handleTargetHit(targetId) {
    if (!state.running) {
      return;
    }
    if (!state.activeTargets.has(targetId)) {
      return;
    }

    removeTarget(targetId, true);
    state.score += HIT_POINTS;
    updateHud();
    setStatus("Great catch! +" + String(HIT_POINTS) + " points.", "good");
  }

  function handleTargetMiss(targetId) {
    if (!state.running) {
      return;
    }
    if (!state.activeTargets.has(targetId)) {
      return;
    }

    removeTarget(targetId, true);
    state.score = Math.max(0, state.score - MISS_PENALTY);
    updateHud();
    setStatus("Missed one! -" + String(MISS_PENALTY) + " points.", "warn");
  }

  function spawnTarget() {
    if (!state.running || !state.markerVisible) {
      return;
    }
    if (state.activeTargets.size >= MAX_ACTIVE_TARGETS) {
      return;
    }

    const { x, y, z } = buildSpawnPosition();
    const primitive = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const targetId = state.nextTargetId;
    state.nextTargetId += 1;

    const targetEl = document.createElement("a-entity");
    targetEl.setAttribute("class", "target");
    targetEl.setAttribute("geometry", "primitive: " + primitive + "; radius: 0.085");
    targetEl.setAttribute(
      "material",
      "color: " +
        color +
        "; emissive: " +
        color +
        "; emissiveIntensity: 0.35; roughness: 0.4; metalness: 0.2; opacity: 0.95"
    );
    targetEl.setAttribute("position", x + " " + y + " " + z);
    targetEl.setAttribute(
      "rotation",
      Math.floor(randomInRange(0, 360)) +
        " " +
        Math.floor(randomInRange(0, 360)) +
        " " +
        Math.floor(randomInRange(0, 360))
    );
    targetEl.setAttribute(
      "animation__spin",
      "property: rotation; to: 360 360 360; loop: true; dur: 1600; easing: linear"
    );
    targetEl.setAttribute(
      "animation__bob",
      "property: position; dir: alternate; loop: true; dur: 780; easing: easeInOutSine; to: " +
        x +
        " " +
        (y + 0.12).toFixed(2) +
        " " +
        z
    );

    const onClick = function () {
      handleTargetHit(targetId);
    };

    targetEl.addEventListener("click", onClick, { once: true });
    gameRootEl.appendChild(targetEl);

    const despawnTimeoutId = window.setTimeout(function () {
      handleTargetMiss(targetId);
    }, TARGET_LIFETIME_MS);

    state.activeTargets.set(targetId, {
      el: targetEl,
      onClick,
      despawnTimeoutId
    });
  }

  function clearAllTargets() {
    for (const targetId of state.activeTargets.keys()) {
      removeTarget(targetId, false);
    }
  }

  function clearLoopTimers() {
    if (state.clockIntervalId !== null) {
      window.clearInterval(state.clockIntervalId);
      state.clockIntervalId = null;
    }
    if (state.spawnIntervalId !== null) {
      window.clearInterval(state.spawnIntervalId);
      state.spawnIntervalId = null;
    }
  }

  function stopGame() {
    state.running = false;
    clearLoopTimers();
    clearAllTargets();

    const didWin = state.score >= TARGET_SCORE;
    if (didWin) {
      setStatus(
        "You win with " + String(state.score) + " points. Press Play Again!",
        "good"
      );
    } else {
      setStatus(
        "Time is up at " +
          String(state.score) +
          " points. Reach " +
          String(TARGET_SCORE) +
          " next round.",
        "warn"
      );
    }

    startButtonEl.textContent = "Play Again";
    startButtonEl.disabled = false;
  }

  function gameTick() {
    if (!state.running) {
      return;
    }

    if (!state.markerVisible) {
      return;
    }

    state.timeLeft -= 1;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateHud();
      stopGame();
      return;
    }

    updateHud();
    if (state.timeLeft <= 10) {
      setStatus("Final seconds! Catch as many as you can.", "warn");
    }
  }

  function startGame() {
    state.running = true;
    state.score = 0;
    state.timeLeft = GAME_DURATION_SECONDS;
    state.nextTargetId = 1;

    clearAllTargets();
    clearLoopTimers();
    updateHud();

    startButtonEl.textContent = "Game Running";
    startButtonEl.disabled = true;

    setStatus("Catch glowing critters before time runs out!", "good");

    spawnTarget();
    state.spawnIntervalId = window.setInterval(spawnTarget, SPAWN_INTERVAL_MS);
    state.clockIntervalId = window.setInterval(gameTick, 1000);
  }

  markerEl.addEventListener("markerFound", function () {
    state.markerVisible = true;
    if (!state.running) {
      setStatus("Marker found. Press Start Game to begin.", "good");
      return;
    }
    setStatus("Marker reacquired. Keep catching critters!", "good");
  });

  markerEl.addEventListener("markerLost", function () {
    state.markerVisible = false;
    if (!state.running) {
      setStatus("Marker lost. Point camera at the Hiro marker.", "warn");
      return;
    }
    setStatus("Marker lost. Recenter the marker to continue.", "warn");
  });

  startButtonEl.addEventListener("click", function () {
    if (state.running) {
      return;
    }
    if (!state.markerVisible) {
      setStatus("Show a Hiro marker to the camera before starting.", "warn");
      return;
    }
    startGame();
  });

  updateHud();
})();
