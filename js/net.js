// This file connects players with PeerJS and lets the host share public room updates.
(function () {
  "use strict";

  const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

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

  function createRoom(name, handlers) {
    const callbacks = handlers || {};
    let attempts = 0;

    return new Promise(function (resolve, reject) {
      function tryCode() {
        attempts += 1;
        const code = makeRoomCode();
        const peer = new Peer(code);
        const players = [{ id: code, name: name, isHost: true }];
        const connections = new Map();
        let currentGame = null;
        let currentPrivateStates = Object.create(null);
        let selectedGameId = null;
        let settled = false;

        function broadcast(message) {
          connections.forEach(function (connection) {
            if (connection.open) connection.send(message);
          });
        }

        function publishPlayers() {
          if (callbacks.onPlayers) callbacks.onPlayers(players.slice());
          broadcast({ type: "players", players: players });
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

            if (message.type === "hello") {
              const playerName = String(message.name || "Guest").trim().slice(0, 20) || "Guest";
              const existing = players.find(function (player) {
                return player.id === connection.peer;
              });

              if (!existing) {
                players.push({ id: connection.peer, name: playerName, isHost: false });
              } else {
                existing.name = playerName;
              }

              connection.send({
                type: "welcome",
                roomCode: code,
                players: players,
                game: currentGame,
                selectedGameId: selectedGameId
              });
              if (Object.prototype.hasOwnProperty.call(currentPrivateStates, connection.peer)) {
                connection.send({ type: "game-private", data: currentPrivateStates[connection.peer] });
              }
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
          if (callbacks.onPlayers) callbacks.onPlayers(players.slice());
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
              broadcast({ type: "lobby-returned" });
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

  function joinRoom(code, name, handlers) {
    const callbacks = handlers || {};

    return new Promise(function (resolve, reject) {
      const peer = new Peer();
      let connection;
      let settled = false;
      let intentionallyClosed = false;

      peer.on("open", function () {
        connection = peer.connect(code, { reliable: true });

        connection.on("open", function () {
          connection.send({ type: "hello", name: name });
        });

        connection.on("data", function (message) {
          if (!message || typeof message !== "object") return;

          if (message.type === "welcome") {
            if (callbacks.onPlayers) callbacks.onPlayers(message.players || []);
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
            callbacks.onPlayers(message.players || []);
          } else if (message.type === "game-selected" && callbacks.onGameSelected) {
            callbacks.onGameSelected(message.gameId);
          } else if (message.type === "game-started" && callbacks.onGameStarted) {
            callbacks.onGameStarted(message.game);
          } else if (message.type === "game-updated" && callbacks.onGameUpdated) {
            callbacks.onGameUpdated(message.game);
          } else if (message.type === "game-private" && callbacks.onGamePrivate) {
            callbacks.onGamePrivate(message.data);
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
    joinRoom: joinRoom
  };
}());
