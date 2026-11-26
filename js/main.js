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
  const homeAnimalPicker = document.getElementById("home-animal-picker");
  const createRoomButton = document.getElementById("create-room-button");
  const joinRoomButton = document.getElementById("join-room-button");
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
  const myAnimalButton = document.getElementById("my-animal-button");
  const lobbyAnimalPicker = document.getElementById("lobby-animal-picker");
  const animalChangeMessage = document.getElementById("animal-change-message");
  const appElement = document.querySelector(".app");
  const games = window.GameNightGames || [];
  let room = null;
  let currentPlayers = [];
  let takenAnimals = [];
  let homeTakenAnimals = [];
  let selectedAvatarId = null;
  let rememberedAvatarId = readRememberedAvatar();
  let animalPickerOpen = false;
  let pendingAvatarId = null;
  let roomInfoRequest = 0;
  let roomInfoTimer = null;
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

  function readRememberedAvatar() {
    try {
      return window.localStorage.getItem("game-night-avatar") || null;
    } catch (error) {
      return null;
    }
  }

  function rememberAvatar(avatarId) {
    try {
      window.localStorage.setItem("game-night-avatar", avatarId);
    } catch (error) {
      // The current selection still works when browser storage is unavailable.
    }
  }

  function avatarEmoji(avatarId) {
    return window.GameNightAvatars.getAvatar(avatarId) || "🐾";
  }

  function takenAnimal(avatarId, ownerId, list) {
    return (list || takenAnimals).find(function (entry) {
      return entry.avatarId === avatarId && entry.playerId !== ownerId;
    }) || null;
  }

  function renderAnimalGrid(container, options) {
    container.replaceChildren();
    window.GameNightAvatars.animals.forEach(function (animal) {
      const owner = takenAnimal(animal.id, options.ownerId, options.taken);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "animal-choice" +
        (animal.id === options.selectedId ? " is-selected" : "") +
        (!options.selectedId && animal.id === options.rememberedId ? " is-remembered" : "") +
        (owner ? " is-taken" : "");
      button.disabled = Boolean(owner);
      button.setAttribute("aria-pressed", String(animal.id === options.selectedId));
      button.setAttribute("aria-label", owner
        ? animal.name + ", taken by " + owner.name
        : animal.name);

      const emoji = document.createElement("span");
      emoji.className = "animal-choice-emoji";
      emoji.textContent = animal.emoji;
      const name = document.createElement("span");
      name.className = "animal-choice-name";
      name.textContent = animal.name;
      button.appendChild(emoji);
      button.appendChild(name);
      if (owner) {
        const ownerName = document.createElement("small");
        ownerName.textContent = owner.name;
        button.appendChild(ownerName);
      } else {
        button.addEventListener("click", function () {
          options.onSelect(animal.id);
        });
      }
      container.appendChild(button);
    });
  }

  function updateHomeButtons() {
    const ready = Boolean(nicknameInput.value.trim() && selectedAvatarId &&
      !takenAnimal(selectedAvatarId, null, homeTakenAnimals));
    createRoomButton.disabled = !ready;
    joinRoomButton.disabled = !ready;
  }

  function renderHomeAnimalPicker() {
    renderAnimalGrid(homeAnimalPicker, {
      taken: homeTakenAnimals,
      selectedId: selectedAvatarId,
      rememberedId: rememberedAvatarId,
      ownerId: null,
      onSelect: function (avatarId) {
        selectedAvatarId = avatarId;
        rememberedAvatarId = avatarId;
        rememberAvatar(avatarId);
        homeMessage.textContent = "";
        renderHomeAnimalPicker();
      }
    });
    updateHomeButtons();
  }

  function checkHomeRoomAnimals() {
    if (roomInfoTimer) clearTimeout(roomInfoTimer);
    const request = ++roomInfoRequest;
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) {
      homeTakenAnimals = [];
      renderHomeAnimalPicker();
      return;
    }

    roomInfoTimer = setTimeout(function () {
      GameNet.getRoomInfo(code).then(function (info) {
        if (request !== roomInfoRequest || roomCodeInput.value !== code) return;
        homeTakenAnimals = (info.takenAnimals || []).slice();
        if (takenAnimal(selectedAvatarId, null, homeTakenAnimals)) {
          selectedAvatarId = null;
          homeMessage.textContent = "Someone just took that one, pick another.";
        } else if (info.playerCount >= info.maxPlayers) {
          homeMessage.textContent = "This room is full (16 players maximum).";
        } else if (homeMessage.textContent === "This room is full (16 players maximum).") {
          homeMessage.textContent = "";
        }
        renderHomeAnimalPicker();
      }).catch(function () {
        // The regular Join Room action will show a clear message if this lookup fails.
      });
    }, 350);
  }

  function renderMyAnimalControl() {
    const player = room && currentPlayers.find(function (entry) {
      return entry.id === room.playerId;
    });
    myAnimalButton.hidden = !player || Boolean(activeGame) || roomScreen.hidden;
    lobbyAnimalPicker.hidden = !animalPickerOpen || myAnimalButton.hidden;
    if (!player) return;

    myAnimalButton.textContent = avatarEmoji(player.avatarId) + " Change animal";
    myAnimalButton.setAttribute("aria-label", "Your animal is " +
      avatarEmoji(player.avatarId) + ". Change animal.");
    if (!lobbyAnimalPicker.hidden) {
      renderAnimalGrid(lobbyAnimalPicker, {
        taken: takenAnimals,
        selectedId: player.avatarId,
        rememberedId: null,
        ownerId: player.id,
        onSelect: function (avatarId) {
          if (!room || activeGame) return;
          pendingAvatarId = avatarId;
          animalChangeMessage.textContent = "";
          if (room.isHost) {
            if (!room.changeAvatar(avatarId)) {
              pendingAvatarId = null;
              animalChangeMessage.textContent = "That animal is already taken. Pick another.";
            }
          } else {
            room.changeAvatar(avatarId);
          }
        }
      });
    }
  }

  function showScreen(screen) {
    homeScreen.hidden = screen !== "home";
    roomScreen.hidden = screen !== "room";
    gameScreen.hidden = screen !== "game";
    closedScreen.hidden = screen !== "closed";
  }

  function saveGuestRoom(code, name, avatarId) {
    sessionStorage.setItem("game-night-room", JSON.stringify({
      code: code,
      name: name,
      avatarId: avatarId,
      role: "guest"
    }));
  }

  function clearSavedRoom() {
    sessionStorage.removeItem("game-night-room");
  }

  function renderPlayers(players, occupiedAnimals) {
    const previousPlayers = currentPlayers;
    currentPlayers = players.slice();
    takenAnimals = (occupiedAnimals || players.map(function (player) {
      return {
        avatarId: player.avatarId,
        name: player.name,
        playerId: player.id
      };
    })).slice();
    playerList.replaceChildren();
    playerCount.textContent = players.length + (players.length === 1 ? " player" : " players");

    players.forEach(function (player) {
      const item = document.createElement("li");
      const identity = document.createElement("span");
      identity.className = "player-identity";
      const avatar = document.createElement("span");
      avatar.className = "player-animal-badge";
      avatar.textContent = avatarEmoji(player.avatarId);
      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = player.name;
      identity.appendChild(avatar);
      identity.appendChild(name);
      item.appendChild(identity);

      if (player.isHost) {
        const badge = document.createElement("span");
        badge.className = "host-badge";
        badge.textContent = "Host";
        item.appendChild(badge);
      }

      playerList.appendChild(item);
    });

    renderGamePlayers(players);
    const ownPlayer = room && players.find(function (player) {
      return player.id === room.playerId;
    });
    if (pendingAvatarId) {
      if (ownPlayer && ownPlayer.avatarId === pendingAvatarId) {
        pendingAvatarId = null;
        animalPickerOpen = false;
        animalChangeMessage.textContent = "";
      }
    }
    if (ownPlayer) {
      rememberedAvatarId = ownPlayer.avatarId;
      rememberAvatar(ownPlayer.avatarId);
      if (!room.isHost) saveGuestRoom(room.code, ownPlayer.name, ownPlayer.avatarId);
    }
    renderMyAnimalControl();
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
      const identity = document.createElement("span");
      identity.className = "player-identity";
      const avatar = document.createElement("span");
      avatar.className = "player-animal-badge";
      avatar.textContent = avatarEmoji(player.avatarId);
      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = player.name;
      identity.appendChild(avatar);
      identity.appendChild(name);
      item.appendChild(identity);
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
    const enoughPlayers = game && currentPlayers.length >= game.minPlayers &&
      (!game.maxPlayers || currentPlayers.length <= game.maxPlayers);
    startButton.disabled = !enoughPlayers;
    startHelp.textContent = game
      ? (enoughPlayers
        ? "Everyone's here. Ready when you are!"
        : currentPlayers.length < game.minPlayers
          ? "At least " + game.minPlayers + " players are needed to start."
          : "This game supports up to " + game.maxPlayers + " players.")
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

  function destroyActiveGame() {
    if (activeGame && typeof activeGame.destroy === "function") {
      activeGame.destroy();
    }
  }

  function startGame(gameData, privateState) {
    const nextGame = games.find(function (game) {
      return game.id === gameData.id;
    });
    if (!nextGame) {
      roomMessage.textContent = "This game isn't available in this browser.";
      return;
    }
    destroyActiveGame();
    activeGame = nextGame;

    appElement.classList.toggle("has-card-auction", activeGame.id === "card-auction");
    appElement.classList.toggle("has-life-path", activeGame.id === "life-path");
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
    destroyActiveGame();
    activeGame = null;
    activeGameState = null;
    pendingGame = null;
    pendingPrivateState = null;
    currentGameContent.replaceChildren();
    appElement.classList.remove("has-card-auction");
    appElement.classList.remove("has-life-path");
    gameNotice.textContent = "";
    gameHostControls.hidden = true;
    gameGuestWaiting.hidden = true;
    roomMessage.textContent = room && !room.isHost ? "Waiting for the host to start a game." : "";
    guestWaiting.hidden = !room || room.isHost;
    showScreen("room");
    animalPickerOpen = false;
    renderMyAnimalControl();
  }

  function roomHandlers() {
    return {
      onPlayers: renderPlayers,
      onJoinRejected: function (message) {
        homeTakenAnimals = (message.takenAnimals || []).slice();
        if (takenAnimal(selectedAvatarId, null, homeTakenAnimals)) {
          selectedAvatarId = null;
        }
        homeMessage.textContent = message.reason === "full"
          ? "This room is full (16 players maximum)."
          : message.reason === "animal-taken"
            ? "Someone just took that one, pick another."
            : "Please pick one of the available animals.";
        renderHomeAnimalPicker();
      },
      onAvatarRejected: function (message) {
        takenAnimals = (message.takenAnimals || []).slice();
        pendingAvatarId = null;
        animalPickerOpen = true;
        animalChangeMessage.textContent = message.reason === "game-running"
          ? "Animal choices are locked while a game is running."
          : "Someone just took that one, pick another.";
        renderMyAnimalControl();
      },
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
        destroyActiveGame();
        clearSavedRoom();
        appElement.classList.remove("has-card-auction");
        appElement.classList.remove("has-life-path");
        homeMessage.textContent = message + " Please rejoin the room.";
        showScreen("home");
      },
      onHostLeft: function () {
        const disconnectedRoom = room;
        room = null;
        if (disconnectedRoom) disconnectedRoom.close();
        destroyActiveGame();
        activeGame = null;
        appElement.classList.remove("has-card-auction");
        appElement.classList.remove("has-life-path");
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

  function enterRoom(joinedRoom, name, avatarId) {
    room = joinedRoom;
    if (joinedRoom.isHost) {
      // New rooms start with Card Auction selected; other games remain host-selectable.
      selectedGameId = games.some(function (game) {
        return game.id === "card-auction";
      }) ? "card-auction" : null;
      if (selectedGameId) joinedRoom.selectGame(selectedGameId);
    }
    roomCodeHeading.textContent = joinedRoom.code;
    roomScreen.querySelector(".room-code").setAttribute("aria-label", "Room code " + joinedRoom.code);
    hostControls.hidden = !joinedRoom.isHost;
    guestWaiting.hidden = joinedRoom.isHost;
    roomMessage.textContent = "";
    animalPickerOpen = false;
    pendingAvatarId = null;
    showScreen("room");
    renderGamePicker();
    renderMyAnimalControl();

    if (!joinedRoom.isHost) {
      saveGuestRoom(joinedRoom.code, name, avatarId);
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
    if (!selectedAvatarId) {
      homeMessage.textContent = "Pick an animal first!";
      return;
    }
    if (!name) {
      homeMessage.textContent = "Please enter a nickname first.";
      return;
    }

    homeMessage.textContent = "Creating your room…";
    GameNet.createRoom(name, selectedAvatarId, roomHandlers()).then(function (createdRoom) {
      enterRoom(createdRoom, name, selectedAvatarId);
    }).catch(function () {
      // The network layer has already shown a clear error message.
    });
  });

  joinForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const name = nicknameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!selectedAvatarId) {
      homeMessage.textContent = "Pick an animal first!";
      return;
    }
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
    GameNet.joinRoom(code, name, selectedAvatarId, roomHandlers()).then(function (joinedRoom) {
      enterRoom(joinedRoom, name, selectedAvatarId);
    }).catch(function () {
      // The network layer has already shown a clear error message.
    });
  });

  roomCodeInput.addEventListener("input", function () {
    roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    checkHomeRoomAnimals();
  });

  nicknameInput.addEventListener("input", updateHomeButtons);

  myAnimalButton.addEventListener("click", function () {
    if (!room || activeGame || roomScreen.hidden) return;
    animalPickerOpen = !animalPickerOpen;
    animalChangeMessage.textContent = "";
    renderMyAnimalControl();
  });

  startButton.addEventListener("click", function () {
    const game = games.find(function (availableGame) {
      return availableGame.id === selectedGameId;
    });
    if (!room || !room.isHost || !game || currentPlayers.length < game.minPlayers ||
        (game.maxPlayers && currentPlayers.length > game.maxPlayers)) return;

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
    destroyActiveGame();
    activeGame = null;
    activeGameState = null;
    appElement.classList.remove("has-card-auction");
    appElement.classList.remove("has-life-path");
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
    selectedAvatarId = saved.avatarId || rememberedAvatarId;
    if (selectedAvatarId) {
      rememberedAvatarId = selectedAvatarId;
      rememberAvatar(selectedAvatarId);
    }
    renderHomeAnimalPicker();
    homeMessage.textContent = "Rejoining your room…";
    GameNet.joinRoom(saved.code, saved.name, selectedAvatarId, roomHandlers()).then(function (joinedRoom) {
      enterRoom(joinedRoom, saved.name, selectedAvatarId);
    }).catch(function () {
      clearSavedRoom();
    });
  }

  renderHomeAnimalPicker();
  tryRejoining();
}());
