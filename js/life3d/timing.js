// This file keeps Life Path animation and waiting times in one easy-to-find list.
(function () {
  "use strict";

  const timing = {
    movement: 250,
    fastMovement: 120,
    spin: 2800,
    spinResult: 800,
    spinFade: 400,
    effect: 750,
    floatingText: 1400,
    frameEffectDuration: 700,
    frameEffectRise: 550,
    cloudDrift: 0.08,
    fountainCycle: 1300,
    waveDriftPrimary: 0.009,
    waveDriftSecondary: 0.005,
    fastUiTransition: 140,
    normalUiTransition: 160,
    turnTransition: 100,
    autoPaceShort: 5000,
    autoPaceLong: 10000,
    cameraPause: 5000,
    resultsCount: 950,
    fastResultsCount: 475,
    uiTransition: 180,
    cameraTransition: 650,
    markerBob: 1800,
    confetti: 5000,
    wheelTick: 110,
    winnerPulse: 420,
    popupEnter: 220,
    frameRateCheck: 3000,
    minimumFrameRate: 20,
    fallbackToast: 2600
  };

  window.LIFE_TIMING = timing;
  document.documentElement.style.setProperty("--life-movement-duration", timing.movement + "ms");
  document.documentElement.style.setProperty("--life-spin-duration", timing.spin + "ms");
  document.documentElement.style.setProperty("--life-spin-result-duration", timing.spinResult + "ms");
  document.documentElement.style.setProperty("--life-spin-fade-duration", timing.spinFade + "ms");
  document.documentElement.style.setProperty("--life-effect-duration", timing.effect + "ms");
  document.documentElement.style.setProperty("--life-floating-duration", timing.floatingText + "ms");
  document.documentElement.style.setProperty("--life-results-duration", timing.resultsCount + "ms");
  document.documentElement.style.setProperty("--life-ui-transition", timing.uiTransition + "ms");
  document.documentElement.style.setProperty("--life-camera-transition", timing.cameraTransition + "ms");
  document.documentElement.style.setProperty("--life-marker-bob-duration", timing.markerBob + "ms");
  document.documentElement.style.setProperty("--life-confetti-duration", timing.confetti + "ms");
  document.documentElement.style.setProperty("--life-wheel-tick-duration", timing.wheelTick + "ms");
  document.documentElement.style.setProperty("--life-winner-pulse-duration", timing.winnerPulse + "ms");
  document.documentElement.style.setProperty("--life-popup-enter-duration", timing.popupEnter + "ms");
}());
