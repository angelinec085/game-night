// This file switches between the home and room screens and starts the registered game.
(function () {
  "use strict";

  const homeScreen = document.getElementById("home-screen");
  const roomScreen = document.getElementById("room-screen");
  const gameScreen = document.getElementById("game-screen");
  const closedScreen = document.getElementById("closed-screen");
  const createForm = document.getElementById("create-form");
  const joinForm = document.getElementById("join-form");
  const nicknameInput = document.getElementById("nickname");
  const roomCodeInput = document.getElementById("room-code-input");
  const homeMessage = document.getElementById("home-message");
  const roomMessage = document.getElementById("room-message");
  const roomCodeHeading = document.getElementById("room-title");
  const playerList = document.getElementById("player-list");
  const playerCount = document.getElementById("player-count");
  const hostControls = document.getElementById("host-controls");
  const startButton = document.getElementById("start-game");
  const startHelp = document.getElementById("start-help");
  const guestWaiting = document.getElementById("guest-waiting");
  const gamePicker = document.getElementById("game-picker");
  const currentGameContent = document.getElementById("game-content");
  const gameNotice = document.getElementById("game-notice");
  const gameHostControls = document.getElementById("game-host-controls");
  const gameGuestWaiting = document.getElementById("game-guest-waiting");
  const gamePlayerList = document.getElementById("game-player-list");
  const games = window.GameNightGames || [];
  let room = null;
  let currentPlayers = [];
  let activeGame = null;
  let activeGameState = null;
  let pendingGame = null;
  let pendingPrivateState = null;
  let selectedGameId = null;
  let lastGameResult = null;

  function reportGameResult(gameId, winnerNicknames) {
    lastGameResult = {
      gameId: gameId,
      winnerNicknames: winnerNicknames.slice()
    };
    console.log("Game result:", lastGameResult);
  }

  window.reportGameResult = reportGameResult;

  function showScreen(screen) {
    homeScreen.hidden = screen !== "home";
    roomScreen.hidden = screen !== "room";
    gameScreen.hidden = screen !== "game";
    closedScreen.hidden = screen !== "closed";
  }

  function saveGuestRoom(code, name) {
    sessionStorage.setItem("game-night-room", JSON.stringify({
      code: code,
      name: name,
      role: "guest"
    }));
  }

  function clearSavedRoom() {
    sessionStorage.removeItem("game-night-room");
  }

  function renderPlayers(players) {
    const previousPlayers = currentPlayers;
    currentPlayers = players.slice();
    playerList.replaceChildren();
    playerCount.textContent = players.length + (players.length === 1 ? " player" : " players");

    players.forEach(function (player) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = player.name;
      item.appendChild(name);

      if (player.isHost) {
        const badge = document.createElement("span");
        badge.className = "host-badge";
        badge.textContent = "Host";
        item.appendChild(badge);
      }

      playerList.appendChild(item);
    });

    renderGamePlayers(players);
    if (activeGame && !gameScreen.hidden) {
      const departed = previousPlayers.find(function (oldPlayer) {
        return !players.some(function (player) {
          return player.id === oldPlayer.id;
        });
      });
      if (departed) gameNotice.textContent = departed.name + " left the room.";
    }

    updateStartButton();
    if (activeGame && room && room.isHost && activeGame.onPlayersChanged) {
      activeGame.onPlayersChanged(currentPlayers, gameContext());
    }
  }

  function renderGamePlayers(players) {
    gamePlayerList.replaceChildren();
    players.forEach(function (player) {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.textContent = player.name;
      item.appendChild(name);
      if (player.isHost) {
        const badge = document.createElement("span");
        badge.className = "host-badge";
        badge.textContent = "Host";
        item.appendChild(badge);
      }
      gamePlayerList.appendChild(item);
    });
  }

  function renderGamePicker() {
    gamePicker.replaceChildren();
    games.forEach(function (game) {
      const isSelected = game.id === selectedGameId;
      const card = room && room.isHost
        ? document.createElement("button")
        : document.createElement("div");
      card.className = "game-card" + (isSelected ? " is-selected" : "");

      if (room && room.isHost) {
        card.type = "button";
        card.setAttribute("aria-pressed", String(isSelected));
        card.addEventListener("click", function () {
          if (!room || !room.isHost) return;
          selectedGameId = game.id;
          room.selectGame(game.id);
          renderGamePicker();
          updateStartButton();
        });
      }

      const title = document.createElement("span");
      title.className = "game-card-title";
      title.textContent = game.name;
      card.appendChild(title);

      const details = document.createElement("span");
      details.className = "game-card-details";
      details.textContent = game.description || (game.minPlayers + "+ players");
      card.appendChild(details);

      if (isSelected) {
        const selected = document.createElement("span");
        selected.className = "game-card-details";
        selected.textContent = "Selected";
        card.appendChild(selected);
      }

      gamePicker.appendChild(card);
    });

    if (games.length === 0) {
      const empty = document.createElement("p");
      empty.className = "field-help";
      empty.textContent = "No games are available yet.";
      gamePicker.appendChild(empty);
    }
  }

  function updateStartButton() {
    if (!room || !room.isHost) return;
    const game = games.find(function (availableGame) {
      return availableGame.id === selectedGameId;
    });
    const enoughPlayers = game && currentPlayers.length >= game.minPlayers;
    startButton.disabled = !enoughPlayers;
    startHelp.textContent = game
      ? (enoughPlayers ? "Everyone's here. Ready when you are!" : "At least " + game.minPlayers + " players are needed to start.")
      : "Choose a game to get started.";
  }

  function handleGameSelected(gameId) {
    selectedGameId = games.some(function (game) {
      return game.id === gameId;
    }) ? gameId : null;
    renderGamePicker();
    updateStartButton();
  }

  function gameContext() {
    return {
      isHost: Boolean(room && room.isHost),
      playerId: room ? room.playerId : null,
      players: currentPlayers.slice(),
      sendAction: function (action) {
        if (room) room.sendAction(action);
      },
      publish: function (state, privateStates) {
        if (!room || !room.isHost || !activeGame) return;
        activeGameState = state;
        room.updateGame({ id: activeGame.id, state: state }, privateStates || {});
        renderActiveGame(state);
      },
      render: function () {
        renderActiveGame(activeGameState);
      },
      reportGameResult: reportGameResult
    };
  }

  function renderActiveGame(state) {
    if (!activeGame) return;
    currentGameContent.innerHTML = activeGame.render(state);
    if (activeGame.afterRender) {
      activeGame.afterRender(currentGameContent, gameContext());
    }
  }

  function startGame(gameData, privateState) {
    activeGame = games.find(function (game) {
      return game.id === gameData.id;
    });
    if (!activeGame) {
      roomMessage.textContent = "This game isn't available in this browser.";
      return;
    }

    document.getElementById("game-title").textContent = activeGame.name;
    activeGameState = gameData.state;
    if (activeGame.initialize) {
      activeGame.initialize(gameData.state, privateState, gameContext());
    }
    renderActiveGame(gameData.state);
    gameNotice.textContent = "";
    gameHostControls.hidden = !room || !room.isHost;
    gameGuestWaiting.hidden = Boolean(room && room.isHost);
    showScreen("game");
  }

  function returnToLobby() {
    activeGame = null;
    activeGameState = null;
    pendingGame = null;
    pendingPrivateState = null;
    currentGameContent.replaceChildren();
    gameNotice.textContent = "";
    gameHostControls.hidden = true;
    gameGuestWaiting.hidden = true;
    roomMessage.textContent = room && !room.isHost ? "Waiting for the host to start a game." : "";
    guestWaiting.hidden = !room || room.isHost;
    showScreen("room");
  }

  function roomHandlers() {
    return {
      onPlayers: renderPlayers,
      onGameSelected: handleGameSelected,
      onGameStarted: function (gameData) {
        if (room) {
          startGame(gameData, pendingPrivateState);
          pendingPrivateState = null;
        } else {
          pendingGame = gameData;
        }
      },
      onGameUpdated: function (gameData) {
        if (!activeGame || activeGame.id !== gameData.id) return;
        activeGameState = gameData.state;
        if (activeGame.receiveState) activeGame.receiveState(gameData.state);
        renderActiveGame(gameData.state);
      },
      onGamePrivate: function (privateState) {
        if (!activeGame) {
          pendingPrivateState = privateState;
          return;
        }
        if (activeGame.receivePrivateState) {
          activeGame.receivePrivateState(privateState, gameContext());
          renderActiveGame(activeGameState);
        }
      },
      onLobbyReturned: returnToLobby,
      onDisconnected: function (message) {
        const disconnectedRoom = room;
        room = null;
        if (disconnectedRoom) disconnectedRoom.close();
        clearSavedRoom();
        homeMessage.textContent = message + " Please rejoin the room.";
        showScreen("home");
      },
      onHostLeft: function () {
        const disconnectedRoom = room;
        room = null;
        if (disconnectedRoom) disconnectedRoom.close();
        activeGame = null;
        pendingGame = null;
        clearSavedRoom();
        showScreen("closed");
      },
      onError: function (message) {
        homeMessage.textContent = message;
      },
      onAction: function (action, playerId) {
        if (activeGame && activeGame.onMessage) {
          activeGame.onMessage(action, playerId, gameContext());
        }
      }
    };
  }

  function enterRoom(joinedRoom, name) {
    room = joinedRoom;
    if (joinedRoom.isHost) {
      selectedGameId = null;
    }
    roomCodeHeading.textContent = joinedRoom.code;
    roomScreen.querySelector(".room-code").setAttribute("aria-label", "Room code " + joinedRoom.code);
    hostControls.hidden = !joinedRoom.isHost;
    guestWaiting.hidden = joinedRoom.isHost;
    roomMessage.textContent = "";
    showScreen("room");
    renderGamePicker();

    if (!joinedRoom.isHost) {
      saveGuestRoom(joinedRoom.code, name);
    } else {
      clearSavedRoom();
    }
    updateStartButton();
    if (pendingGame) {
      const gameToShow = pendingGame;
      pendingGame = null;
      startGame(gameToShow, pendingPrivateState);
      pendingPrivateState = null;
    }
  }

  createForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const name = nicknameInput.value.trim();
    if (!name) {
      homeMessage.textContent = "Please enter a nickname first.";
      return;
    }

    homeMessage.textContent = "Creating your room…";
    GameNet.createRoom(name, roomHandlers()).then(function (createdRoom) {
      enterRoom(createdRoom, name);
    }).catch(function () {
      // The network layer has already shown a clear error message.
    });
  });

  joinForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const name = nicknameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!name) {
      homeMessage.textContent = "Please enter a nickname first.";
      nicknameInput.focus();
      return;
    }
    if (!/^[A-Z]{4}$/.test(code)) {
      homeMessage.textContent = "Room codes have four letters.";
      roomCodeInput.focus();
      return;
    }

    homeMessage.textContent = "Joining room…";
    GameNet.joinRoom(code, name, roomHandlers()).then(function (joinedRoom) {
      enterRoom(joinedRoom, name);
    }).catch(function () {
      // The network layer has already shown a clear error message.
    });
  });

  roomCodeInput.addEventListener("input", function () {
    roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  });

  startButton.addEventListener("click", function () {
    const game = games.find(function (availableGame) {
      return availableGame.id === selectedGameId;
    });
    if (!room || !room.isHost || !game || currentPlayers.length < game.minPlayers) return;

    const result = game.start(currentPlayers);
    const state = result && Object.prototype.hasOwnProperty.call(result, "state")
      ? result.state
      : result;
    const privateStates = result && result.privateStates ? result.privateStates : {};
    const gameData = { id: game.id, state: state };
    startGame(gameData, privateStates[room.playerId]);
    room.startGame(gameData, privateStates);
  });

  document.getElementById("leave-room").addEventListener("click", function () {
    if (room) room.close();
    room = null;
    activeGame = null;
    activeGameState = null;
    clearSavedRoom();
    currentPlayers = [];
    showScreen("home");
    homeMessage.textContent = "";
  });

  document.getElementById("back-to-lobby").addEventListener("click", function () {
    if (!room || !room.isHost) return;
    room.returnToLobby();
    returnToLobby();
  });

  document.getElementById("closed-home").addEventListener("click", function () {
    showScreen("home");
    homeMessage.textContent = "";
  });

  function tryRejoining() {
    let saved;
    try {
      saved = JSON.parse(sessionStorage.getItem("game-night-room") || "null");
    } catch (error) {
      clearSavedRoom();
    }

    if (!saved || saved.role !== "guest" || !saved.code || !saved.name) return;

    nicknameInput.value = saved.name;
    roomCodeInput.value = saved.code;
    homeMessage.textContent = "Rejoining your room…";
    GameNet.joinRoom(saved.code, saved.name, roomHandlers()).then(function (joinedRoom) {
      enterRoom(joinedRoom, saved.name);
    }).catch(function () {
      clearSavedRoom();
    });
  }

  tryRejoining();
}());
