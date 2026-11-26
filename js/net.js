// This file connects players with PeerJS and lets the host share public room updates.
(function () {
  "use strict";

  const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const MAX_PLAYERS = 16;

  function isKnownAvatar(avatarId) {
    return Boolean(window.GameNightAvatars && window.GameNightAvatars.animals.some(function (animal) {
      return animal.id === avatarId;
    }));
  }

  function makeRoomCode() {
    let code = "";
    for (let i = 0; i < 4; i += 1) {
      code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
    return code;
  }

  function reportError(handlers, message) {
    if (handlers.onError) handlers.onError(message);
  }

  function createRoom(name, avatarId, handlers) {
    const callbacks = handlers || {};
    let attempts = 0;

    return new Promise(function (resolve, reject) {
      function tryCode() {
        attempts += 1;
        const code = makeRoomCode();
        const peer = new Peer(code);
        const players = [{ id: code, name: name, avatarId: avatarId, isHost: true }];
        const connections = new Map();
        const reservedAnimals = new Map();
        let currentGame = null;
        let currentPrivateStates = Object.create(null);
        let selectedGameId = null;
        let settled = false;

        function broadcast(message) {
          connections.forEach(function (connection) {
            if (connection.open) connection.send(message);
          });
        }

        function takenAnimals() {
          const taken = new Map();
          players.forEach(function (player) {
            if (player.avatarId) {
              taken.set(player.avatarId, {
                avatarId: player.avatarId,
                name: player.name,
                playerId: player.id
              });
            }
          });
          reservedAnimals.forEach(function (animal) {
            if (!taken.has(animal.avatarId)) taken.set(animal.avatarId, animal);
          });
          return Array.from(taken.values());
        }

        function avatarIsFree(avatarId, ownerId) {
          return isKnownAvatar(avatarId) && !takenAnimals().some(function (animal) {
            return animal.avatarId === avatarId && animal.playerId !== ownerId;
          });
        }

        function publishPlayers() {
          const occupied = takenAnimals();
          if (callbacks.onPlayers) callbacks.onPlayers(players.slice(), occupied);
          broadcast({ type: "players", players: players, takenAnimals: occupied });
        }

        function sendPrivateStates(privateStates) {
          currentPrivateStates = privateStates || Object.create(null);
          connections.forEach(function (connection, playerId) {
            if (connection.open && Object.prototype.hasOwnProperty.call(currentPrivateStates, playerId)) {
              connection.send({ type: "game-private", data: currentPrivateStates[playerId] });
            }
          });
        }

        peer.on("connection", function (connection) {
          connections.set(connection.peer, connection);

          connection.on("data", function (message) {
            if (!message || typeof message !== "object") return;

            if (message.type === "room-info") {
              connection.send({
                type: "room-info",
                takenAnimals: takenAnimals(),
                playerCount: players.length,
                maxPlayers: MAX_PLAYERS
              });
              return;
            }

            if (message.type === "hello") {
              const playerName = String(message.nickname || "Guest").trim().slice(0, 20) || "Guest";
              const requestedAvatarId = message.avatarId;
              const existing = players.find(function (player) {
                return player.id === connection.peer;
              });
              const returning = existing || (!currentGame && players.find(function (player) {
                return !player.isHost && player.name === playerName &&
                  player.avatarId === requestedAvatarId;
              }));
              const ownerId = returning ? returning.id : connection.peer;
              const rejection = !isKnownAvatar(requestedAvatarId)
                ? "animal"
                : !returning && players.length >= MAX_PLAYERS
                  ? "full"
                  : !avatarIsFree(requestedAvatarId, ownerId)
                    ? "animal-taken"
                    : null;

              if (rejection) {
                connection.send({
                  type: "rejected",
                  reason: rejection,
                  takenAnimals: takenAnimals(),
                  playerCount: players.length,
                  maxPlayers: MAX_PLAYERS
                });
                return;
              }

              if (returning) {
                returning.id = connection.peer;
                returning.name = playerName;
                returning.avatarId = requestedAvatarId;
              } else {
                players.push({
                  id: connection.peer,
                  name: playerName,
                  avatarId: requestedAvatarId,
                  isHost: false
                });
              }

              connection.send({
                type: "welcome",
                roomCode: code,
                players: players,
                takenAnimals: takenAnimals(),
                game: currentGame,
                selectedGameId: selectedGameId
              });
              if (Object.prototype.hasOwnProperty.call(currentPrivateStates, connection.peer)) {
                connection.send({ type: "game-private", data: currentPrivateStates[connection.peer] });
              }
              publishPlayers();
              return;
            }

            if (message.type === "avatar-change") {
              if (currentGame) {
                connection.send({
                  type: "avatar-rejected",
                  reason: "game-running",
                  takenAnimals: takenAnimals()
                });
                return;
              }
              const player = players.find(function (entry) {
                return entry.id === connection.peer;
              });
              if (!player || !avatarIsFree(message.avatarId, player.id)) {
                connection.send({
                  type: "avatar-rejected",
                  reason: "animal-taken",
                  takenAnimals: takenAnimals()
                });
                return;
              }
              player.avatarId = message.avatarId;
              publishPlayers();
              return;
            }

            if (message.type === "action" && callbacks.onAction) {
              callbacks.onAction(message.action, connection.peer);
            }
          });

          connection.on("close", function () {
            connections.delete(connection.peer);
            const index = players.findIndex(function (player) {
              return player.id === connection.peer;
            });
            if (index !== -1) {
              const departed = players[index];
              if (currentGame && departed.avatarId) {
                reservedAnimals.set(departed.id, {
                  avatarId: departed.avatarId,
                  name: departed.name,
                  playerId: departed.id
                });
              }
              players.splice(index, 1);
              publishPlayers();
            }
          });
        });

        peer.on("error", function (error) {
          if (!settled && error.type === "unavailable-id" && attempts < 8) {
            settled = true;
            peer.destroy();
            tryCode();
            return;
          }

          const message = error.type === "unavailable-id"
            ? "Couldn't find an unused room code. Please try again."
            : "Couldn't connect to PeerJS. Check your internet connection and try again.";
          reportError(callbacks, message);
          if (!settled) {
            settled = true;
            peer.destroy();
            reject(new Error(message));
          }
        });

        peer.on("open", function () {
          if (settled) return;
          settled = true;
          if (callbacks.onPlayers) callbacks.onPlayers(players.slice(), takenAnimals());
          resolve({
            code: code,
            isHost: true,
            playerId: code,
            selectGame: function (gameId) {
              selectedGameId = gameId;
              broadcast({ type: "game-selected", gameId: gameId });
            },
            startGame: function (game, privateStates) {
              currentGame = game;
              selectedGameId = game.id;
              broadcast({ type: "game-started", game: game });
              sendPrivateStates(privateStates);
            },
            updateGame: function (game, privateStates) {
              currentGame = game;
              broadcast({ type: "game-updated", game: game });
              sendPrivateStates(privateStates);
            },
            returnToLobby: function () {
              currentGame = null;
              currentPrivateStates = Object.create(null);
              reservedAnimals.clear();
              broadcast({ type: "lobby-returned" });
              publishPlayers();
            },
            changeAvatar: function (nextAvatarId) {
              const host = players.find(function (entry) {
                return entry.id === code;
              });
              if (currentGame || !host || !avatarIsFree(nextAvatarId, code)) return false;
              host.avatarId = nextAvatarId;
              publishPlayers();
              return true;
            },
            sendAction: function (action) {
              if (callbacks.onAction) callbacks.onAction(action, code);
            },
            close: function () {
              peer.destroy();
            }
          });
        });
      }

      tryCode();
    });
  }

  function getRoomInfo(code) {
    return new Promise(function (resolve, reject) {
      const peer = new Peer();
      let connection;
      let settled = false;

      function fail(message) {
        if (settled) return;
        settled = true;
        peer.destroy();
        reject(new Error(message));
      }

      peer.on("open", function () {
        connection = peer.connect(code, { reliable: true });
        connection.on("open", function () {
          connection.send({ type: "room-info" });
        });
        connection.on("data", function (message) {
          if (!message || message.type !== "room-info" || settled) return;
          settled = true;
          resolve(message);
          peer.destroy();
        });
        connection.on("error", function () {
          fail("Couldn't check that room.");
        });
        connection.on("close", function () {
          if (!settled) fail("Couldn't check that room.");
        });
      });

      peer.on("error", function (error) {
        fail(error.type === "peer-unavailable"
          ? "That room wasn't found."
          : "Couldn't check that room.");
      });
    });
  }

  function joinRoom(code, name, avatarId, handlers) {
    const callbacks = handlers || {};

    return new Promise(function (resolve, reject) {
      const peer = new Peer();
      let connection;
      let settled = false;
      let intentionallyClosed = false;

      peer.on("open", function () {
        connection = peer.connect(code, { reliable: true });

        connection.on("open", function () {
          connection.send({ type: "hello", nickname: name, avatarId: avatarId });
        });

        connection.on("data", function (message) {
          if (!message || typeof message !== "object") return;

          if (message.type === "rejected") {
            if (callbacks.onJoinRejected) callbacks.onJoinRejected(message);
            if (!settled) {
              settled = true;
              intentionallyClosed = true;
              peer.destroy();
              const reason = message.reason === "full"
                ? "This room is full (16 players maximum)."
                : message.reason === "animal-taken"
                  ? "Someone just took that one, pick another."
                  : "Please pick one of the available animals.";
              reject(new Error(reason));
            }
            return;
          }

          if (message.type === "welcome") {
            if (callbacks.onPlayers) callbacks.onPlayers(message.players || [], message.takenAnimals || []);
            if (callbacks.onGameSelected) {
              callbacks.onGameSelected(message.selectedGameId || (message.game && message.game.id) || null);
            }
            if (message.game && callbacks.onGameStarted) {
              callbacks.onGameStarted(message.game);
            }
            if (!settled) {
              settled = true;
              resolve({
                code: message.roomCode,
                isHost: false,
                playerId: peer.id,
                changeAvatar: function (nextAvatarId) {
                  if (connection && connection.open) {
                    connection.send({ type: "avatar-change", avatarId: nextAvatarId });
                  }
                },
                sendAction: function (action) {
                  if (connection && connection.open) {
                    connection.send({ type: "action", action: action });
                  }
                },
                close: function () {
                  intentionallyClosed = true;
                  peer.destroy();
                }
              });
            }
            return;
          }

          if (message.type === "players" && callbacks.onPlayers) {
            callbacks.onPlayers(message.players || [], message.takenAnimals || []);
          } else if (message.type === "game-selected" && callbacks.onGameSelected) {
            callbacks.onGameSelected(message.gameId);
          } else if (message.type === "game-started" && callbacks.onGameStarted) {
            callbacks.onGameStarted(message.game);
          } else if (message.type === "game-updated" && callbacks.onGameUpdated) {
            callbacks.onGameUpdated(message.game);
          } else if (message.type === "game-private" && callbacks.onGamePrivate) {
            callbacks.onGamePrivate(message.data);
          } else if (message.type === "avatar-rejected" && callbacks.onAvatarRejected) {
            callbacks.onAvatarRejected(message);
          } else if (message.type === "lobby-returned" && callbacks.onLobbyReturned) {
            callbacks.onLobbyReturned();
          }
        });

        connection.on("error", function () {
          const message = "Couldn't join that room. Check the code and try again.";
          reportError(callbacks, message);
          if (!settled) {
            settled = true;
            peer.destroy();
            reject(new Error(message));
          }
        });

        connection.on("close", function () {
          if (!settled) {
            const message = "Couldn't join that room. Check the code and try again.";
            reportError(callbacks, message);
            settled = true;
            peer.destroy();
            reject(new Error(message));
          } else if (!intentionallyClosed && callbacks.onHostLeft) {
            callbacks.onHostLeft();
          }
        });
      });

      peer.on("error", function (error) {
        const message = error.type === "peer-unavailable"
          ? "That room wasn't found. Check the code and try again."
          : "Couldn't connect to PeerJS. Check your internet connection and try again.";
        reportError(callbacks, message);
        if (!settled) {
          settled = true;
          peer.destroy();
          reject(new Error(message));
        }
      });

      peer.on("disconnected", function () {
        if (!intentionallyClosed && callbacks.onDisconnected) {
          callbacks.onDisconnected("Your connection to PeerJS was lost.");
        }
      });
    });
  }

  window.GameNet = {
    createRoom: createRoom,
    joinRoom: joinRoom,
    getRoomInfo: getRoomInfo
  };
}());
