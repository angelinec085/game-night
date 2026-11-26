// This file registers a tiny placeholder game that displays a shared start message.
(function () {
  "use strict";

  const testGame = {
    id: "test-game",
    name: "Test Game",
    minPlayers: 2,
    start: function () {
      return { started: true };
    },
    onMessage: function (state) {
      return state;
    },
    render: function () {
      return '<p class="game-started">Game started!</p>';
    }
  };

  window.GameNightGames = window.GameNightGames || [];
  window.GameNightGames.push(testGame);
}());
