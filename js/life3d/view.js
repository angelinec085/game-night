// This file chooses the Life Path view and keeps the existing 2D board as its fallback.
(function () {
  "use strict";

  const MODE_KEY = "lifePathViewMode";
  const QUALITY_KEY = "lifePath3DQuality";
  let container = null;
  let boardData = null;
  let players = [];
  let previousPlayers = new Map();
  let legacyHooks = {};
  let adapter = null;
  let stage = null;
  let mode = "3d";
  let initialized = false;
  let quality = null;
  let focusedPlayerId = null;
  let fastAnimations = false;
  let toastTimer = null;
  let lowFrameSince = null;
  let contextLossHandler = null;

  function readMode() {
    try {
      return window.localStorage.getItem(MODE_KEY) === "2d" ? "2d" : "3d";
    } catch (error) {
      return "3d";
    }
  }

  function saveMode(value) {
    try {
      window.localStorage.setItem(MODE_KEY, value);
    } catch (error) {
      // The selected view still works when browser storage is unavailable.
    }
  }

  function defaultQuality() {
    return window.innerWidth < 700 ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
      ? "lite"
      : "high";
  }

  function readQuality() {
    try {
      const saved = window.localStorage.getItem(QUALITY_KEY);
      return saved === "high" || saved === "lite" ? saved : defaultQuality();
    } catch (error) {
      return defaultQuality();
    }
  }

  function saveQuality(value) {
    try {
      window.localStorage.setItem(QUALITY_KEY, value);
    } catch (error) {
      // The selected quality still works when browser storage is unavailable.
    }
  }

  function prepareMarkup(markup) {
    const stageMarkup = '<div class="life-3d-stage" data-life-3d-stage aria-hidden="true"></div>' +
      '<p class="life-view-toast" data-life-view-toast role="status" hidden></p>';
    return markup.replace('<div class="life-board-canvas">',
      '<div class="life-board-canvas" data-life-view-mode="' + mode + '">' + stageMarkup);
  }

  function updateModeClass() {
    if (!container) return;
    container.querySelectorAll(".life-board-canvas").forEach(function (canvas) {
      canvas.setAttribute("data-life-view-mode", mode);
      canvas.classList.toggle("is-3d-ready", Boolean(adapter && mode === "3d"));
    });
  }

  function showFallbackToast() {
    const toast = container && container.querySelector("[data-life-view-toast]");
    if (!toast) return;
    toast.textContent = "Switched to simple view";
    toast.hidden = false;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.hidden = true;
      toastTimer = null;
    }, window.LIFE_TIMING.fallbackToast);
  }

  function removeContextLossListener() {
    if (stage && contextLossHandler) {
      const canvas = stage.querySelector("canvas");
      if (canvas) canvas.removeEventListener("webglcontextlost", contextLossHandler);
    }
    contextLossHandler = null;
  }

  function stopAdapter() {
    removeContextLossListener();
    if (adapter && typeof adapter.destroy === "function") adapter.destroy();
    adapter = null;
    lowFrameSince = null;
    updateModeClass();
  }

  function switchToFallback() {
    stopAdapter();
    mode = "2d";
    updateModeClass();
    showFallbackToast();
  }

  function reportFrame(frameDuration) {
    if (mode !== "3d" || !adapter) return;
    if (frameDuration > 1000 / window.LIFE_TIMING.minimumFrameRate) {
      if (lowFrameSince === null) lowFrameSince = Date.now();
      if (Date.now() - lowFrameSince >= window.LIFE_TIMING.frameRateCheck) {
        switchToFallback();
      }
    } else {
      lowFrameSince = null;
    }
  }

  function installContextLossHandler() {
    removeContextLossListener();
    const canvas = stage && stage.querySelector("canvas");
    if (!canvas) return;
    contextLossHandler = function (event) {
      event.preventDefault();
      switchToFallback();
    };
    canvas.addEventListener("webglcontextlost", contextLossHandler, false);
  }

  function activate3D() {
    if (!container || !stage || mode !== "3d") return;
    if (adapter) {
      if (typeof adapter.mount === "function") adapter.mount(stage);
      updateModeClass();
      installContextLossHandler();
      return;
    }
    if (!window.WebGLRenderingContext || !window.Life3DView) {
      switchToFallback();
      return;
    }
    try {
      adapter = window.Life3DView.create(stage, boardData, players, {
        timing: window.LIFE_TIMING,
        localPlayerId: legacyHooks.localPlayerId || null,
        quality: quality || defaultQuality(),
        onFrame: reportFrame,
        onFailure: switchToFallback
      });
      if (!adapter || typeof adapter.init !== "function") {
        throw new Error("The Life Path 3D view could not be created.");
      }
      adapter.init();
      if (!stage.querySelector("canvas")) {
        throw new Error("The Life Path 3D view did not create a canvas.");
      }
      updateModeClass();
      installContextLossHandler();
      adapter.setPlayers(players);
      if (typeof adapter.setFastAnimations === "function") {
        adapter.setFastAnimations(fastAnimations);
      }
      if (focusedPlayerId) adapter.focusPlayer(focusedPlayerId);
    } catch (error) {
      console.warn("Life Path 3D view could not start; using the 2D board.", error);
      stopAdapter();
      switchToFallback();
    }
  }

  function init(root, data, initialPlayers, hooks) {
    container = root;
    boardData = data;
    players = (initialPlayers || []).slice();
    legacyHooks = hooks || {};
    stage = container && container.querySelector("[data-life-3d-stage]");
    if (!stage) return;
    if (adapter && mode === "3d") {
      if (typeof adapter.mount === "function") adapter.mount(stage);
      updateModeClass();
      installContextLossHandler();
      adapter.setPlayers(players);
      if (typeof adapter.setFastAnimations === "function") {
        adapter.setFastAnimations(fastAnimations);
      }
      if (focusedPlayerId) adapter.focusPlayer(focusedPlayerId);
      return;
    }
    if (!initialized) {
      mode = readMode();
      quality = readQuality();
      initialized = true;
    }
    updateModeClass();
    if (mode === "3d") activate3D();
  }

  function setPlayers(nextPlayers) {
    const next = (nextPlayers || []).slice();
    const changed = [];
    if (adapter && typeof adapter.finishAnimations === "function") {
      adapter.finishAnimations();
    }
    next.forEach(function (player) {
      const previous = previousPlayers.get(player.id);
      if (previous && previous.position !== player.position && !player.isLeft && !player.retired) {
        changed.push({ player: player, from: previous.position, to: player.position });
      }
      if (previous && !previous.retired && player.retired) {
        playerRetired(player.id);
      }
    });
    players = next;
    changed.forEach(function (move) {
      movePlayerAlongTiles(move.player.id, [move.from, move.to], { fast: fastAnimations });
      const space = boardData.spaces.find(function (entry) {
        return entry.id === move.to;
      });
      if (space) showTileEffect(space.id, space.type);
    });
    previousPlayers = new Map(next.map(function (player) {
      return [player.id, {
        position: player.position,
        retired: Boolean(player.retired)
      }];
    }));
    if (adapter) adapter.setPlayers(players);
  }

  function movePlayerAlongTiles(playerId, tileIds, options) {
    if (adapter) return adapter.movePlayerAlongTiles(playerId, tileIds, options || {});
    return Promise.resolve();
  }

  function updateStats(playerId, stats) {
    if (adapter && typeof adapter.updateStats === "function") {
      adapter.updateStats(playerId, stats);
    }
  }

  function focusPlayer(playerId) {
    focusedPlayerId = playerId;
    if (adapter && typeof adapter.focusPlayer === "function") {
      adapter.focusPlayer(playerId);
    } else if (legacyHooks.focusPlayer) {
      legacyHooks.focusPlayer(playerId);
    }
  }

  function setFastAnimations(enabled) {
    fastAnimations = Boolean(enabled);
    if (adapter && typeof adapter.setFastAnimations === "function") {
      adapter.setFastAnimations(fastAnimations);
    }
  }

  function showTileEffect(tileId, type) {
    if (adapter && typeof adapter.showTileEffect === "function") {
      adapter.showTileEffect(tileId, type);
    } else if (legacyHooks.showTileEffect) {
      legacyHooks.showTileEffect(tileId, type);
    }
  }

  function floatText(playerId, text) {
    if (adapter && typeof adapter.floatText === "function") {
      adapter.floatText(playerId, text);
    } else if (legacyHooks.floatText) {
      legacyHooks.floatText(playerId, text);
    }
  }

  function playerRetired(playerId) {
    if (adapter && typeof adapter.playerRetired === "function") {
      adapter.playerRetired(playerId);
    } else if (legacyHooks.playerRetired) {
      legacyHooks.playerRetired(playerId);
    }
  }

  function gameEnded(winnerIds) {
    if (adapter && typeof adapter.gameEnded === "function") {
      adapter.gameEnded(winnerIds);
    } else if (legacyHooks.gameEnded) {
      legacyHooks.gameEnded(winnerIds);
    }
  }

  function setViewMode(value) {
    if (value !== "3d" && value !== "2d") return;
    saveMode(value);
    if (value === "2d") {
      stopAdapter();
      mode = "2d";
      updateModeClass();
      return;
    }
    mode = "3d";
    updateModeClass();
    activate3D();
  }

  function setQuality(value) {
    if (value !== "high" && value !== "lite") return;
    quality = value;
    saveQuality(value);
    if (mode === "3d" && container && stage) {
      stopAdapter();
      activate3D();
    }
  }

  function overview() {
    if (adapter && typeof adapter.setOverview === "function") {
      adapter.setOverview();
    } else if (legacyHooks.overview) {
      legacyHooks.overview();
    }
  }

  function zoom(factor) {
    if (adapter && typeof adapter.zoom === "function") adapter.zoom(factor);
  }

  function destroy() {
    stopAdapter();
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
    container = null;
    boardData = null;
    stage = null;
    players = [];
    previousPlayers.clear();
    legacyHooks = {};
    mode = "3d";
    initialized = false;
    quality = null;
    focusedPlayerId = null;
  }

  window.LifeView = {
    init: init,
    renderMarkup: prepareMarkup,
    setPlayers: setPlayers,
    updateStats: updateStats,
    movePlayerAlongTiles: movePlayerAlongTiles,
    focusPlayer: focusPlayer,
    showTileEffect: showTileEffect,
    floatText: floatText,
    playerRetired: playerRetired,
    gameEnded: gameEnded,
    setViewMode: setViewMode,
    getViewMode: function () { return initialized ? mode : readMode(); },
    getQuality: function () { return initialized ? quality || defaultQuality() : readQuality(); },
    setFastAnimations: setFastAnimations,
    setQuality: setQuality,
    overview: overview,
    zoom: zoom,
    destroy: destroy
  };
}());
