// This file runs Card Auction on the host and keeps each player's hand private.
(function () {
  "use strict";

  const GAME_ID = "card-auction";
  const CARD_VALUES = Array.from({ length: 13 }, function (_, index) {
    return index + 1;
  });
  const PLAYER_COLORS = ["#d87567", "#6487bd", "#7d9d59", "#a477b0", "#d19a42", "#4d9d94"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const RPS_CHOICES = ["rock", "paper", "scissors"];
  const UP_DOWN_CHOICES = ["up", "down"];

  let state = null;
  let middleDeck = [];
  let privateByPlayer = Object.create(null);
  let betsByPlayer = Object.create(null);
  let tieChoices = Object.create(null);
  let playerId = null;
  let myPrivateState = null;
  let currentContext = null;
  let selectedCard = null;
  let locallyLocked = false;
  let resultReported = false;
  let recentlyUsedCard = null;
  let removalTimer = null;
  let activeRevealKey = null;
  let activeRevealUntil = 0;
  let revealTimer = null;
  let advanceKeyHandler = null;

  function shuffle(cards) {
    const shuffled = cards.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const card = shuffled[index];
      shuffled[index] = shuffled[swapIndex];
      shuffled[swapIndex] = card;
    }
    return shuffled;
  }

  function cardName(value) {
    return RANKS[value - 1] || String(value);
  }

  function avatarEmoji(avatarId) {
    return window.GameNightAvatars.getAvatar(avatarId) || "🐾";
  }

  function playerLabel(player) {
    return avatarEmoji(player.avatarId) + " " + player.name;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  function playerFor(id) {
    return state.players.find(function (player) {
      return player.id === id;
    });
  }

  function isActive(id) {
    const player = playerFor(id);
    return Boolean(player && !player.isLeft && state.activeIds.indexOf(id) !== -1);
  }

  function publicState() {
    // Shared snapshots show card counts and lock status, but hide scores and secret cards.
    return {
      round: state.round,
      totalRounds: 13,
      middleCard: state.middleCard,
      pot: state.pot,
      phase: state.phase,
      remainingMiddle: middleDeck.length,
      tieBreaker: state.tieBreaker ? {
        type: state.tieBreaker.type,
        attempt: state.tieBreaker.attempt,
        lockedBy: state.activeIds.filter(function (id) {
          return Object.prototype.hasOwnProperty.call(tieChoices, id);
        })
      } : null,
      advanceStep: state.advanceStep,
      activeIds: state.activeIds.slice(),
      players: state.players.map(function (player) {
        const publicPlayer = {
          id: player.id,
          name: player.name,
          avatarId: player.avatarId,
          color: player.color,
          isLeft: player.isLeft,
          locked: player.locked,
          remainingCards: privateByPlayer[player.id] ? privateByPlayer[player.id].hand.length : 0
        };
        return publicPlayer;
      }),
      finalResults: state.phase === "finished" ? state.players.map(function (player) {
        return {
          id: player.id,
          name: player.name,
          avatarId: player.avatarId,
          color: player.color,
          isLeft: player.isLeft,
          score: player.score
        };
      }) : null,
      lastReveal: state.lastReveal,
      log: state.log.slice(-6),
      finalWinners: state.finalWinners
    };
  }

  function privateStates() {
    // The host keeps all hands, then the network sends each entry only to its matching player.
    const states = Object.create(null);
    Object.keys(privateByPlayer).forEach(function (id) {
      const player = playerFor(id);
      if (!player || player.isLeft) return;
      const hand = privateByPlayer[id];
      states[id] = {
        hand: hand.hand.slice(),
        used: hand.used.slice(),
        lockedCard: hand.lockedCard
      };
    });
    return states;
  }

  function addLog(message) {
    state.log.push(message);
    if (state.log.length > 12) state.log.shift();
  }

  function publish() {
    if (currentContext && currentContext.isHost) {
      const currentPrivateStates = privateStates();
      if (currentPrivateStates[playerId]) {
        updateMyPrivateState(currentPrivateStates[playerId]);
      }
      currentContext.publish(publicState(), currentPrivateStates);
    }
  }

  function updateMyPrivateState(nextPrivateState) {
    if (myPrivateState && nextPrivateState) {
      const usedCard = nextPrivateState.used.find(function (value) {
        return myPrivateState.used.indexOf(value) === -1;
      });
      if (usedCard !== undefined) {
        recentlyUsedCard = usedCard;
        if (removalTimer) clearTimeout(removalTimer);
        removalTimer = setTimeout(function () {
          recentlyUsedCard = null;
          removalTimer = null;
          if (currentContext) currentContext.render();
        }, 360);
      }
    }
    myPrivateState = nextPrivateState;
  }

  function clearLocks() {
    state.players.forEach(function (player) {
      player.locked = false;
      const hand = privateByPlayer[player.id];
      if (hand) hand.lockedCard = null;
    });
    betsByPlayer = Object.create(null);
    tieChoices = Object.create(null);
    selectedCard = null;
    locallyLocked = false;
  }

  function waitForHost(nextAction) {
    state.phase = "waiting-host";
    state.pendingAdvance = nextAction;
    state.advanceStep += 1;
  }

  function advanceAfterHost(action, senderId) {
    if (!action || senderId !== playerId || state.phase !== "waiting-host" ||
        !Number.isInteger(action.step) || action.step !== state.advanceStep) return;
    const nextAction = state.pendingAdvance;
    if (["finish", "next-round", "tied-round", "begin-tiebreaker", "retry-tiebreaker"]
        .indexOf(nextAction) === -1) return;
    state.advanceStep += 1;
    state.pendingAdvance = null;
    state.phase = "advancing";

    if (nextAction === "finish") {
      finishGame();
    } else if (nextAction === "next-round") {
      if (state.players.some(function (player) {
        return !player.isLeft;
      })) {
        startNextRound(false);
      } else {
        finishGame();
      }
    } else if (nextAction === "tied-round") {
      if (state.activeIds.filter(isActive).length < 2) {
        beginTieBreaker();
      } else {
        startNextRound(true);
      }
    } else if (nextAction === "begin-tiebreaker") {
      beginTieBreaker();
    } else if (nextAction === "retry-tiebreaker") {
      retryTieBreaker();
    } else {
      return;
    }
    publish();
  }

  function startNextRound(carryPot) {
    if (middleDeck.length === 0) {
      finishGame();
      return;
    }

    state.round += 1;
    state.middleCard = middleDeck.shift();
    state.pot += state.middleCard;
    state.phase = "betting";
    state.pendingAdvance = null;
    state.tieBreaker = null;
    if (!carryPot) {
      state.activeIds = state.players.filter(function (player) {
        return !player.isLeft;
      }).map(function (player) {
        return player.id;
      });
    }
    clearLocks();
  }

  function allActivePlayersLocked(locks) {
    return state.activeIds.length > 0 && state.activeIds.every(function (id) {
      const player = playerFor(id);
      return !player || player.isLeft || Object.prototype.hasOwnProperty.call(locks, id);
    });
  }

  function revealBets() {
    // Cards are removed and their values become public only after every active player locks in.
    const revealed = state.activeIds.filter(function (id) {
      return Object.prototype.hasOwnProperty.call(betsByPlayer, id) && isActive(id);
    }).map(function (id) {
      const player = playerFor(id);
      const value = betsByPlayer[id];
      const hand = privateByPlayer[id];
      const cardIndex = hand.hand.indexOf(value);
      if (cardIndex !== -1) hand.hand.splice(cardIndex, 1);
      if (hand.used.indexOf(value) === -1) hand.used.push(value);
      hand.lockedCard = null;
      return { id: id, name: player.name, avatarId: player.avatarId, value: value };
    });

    state.lastReveal = {
      kind: "bets",
      round: state.round,
      bets: revealed,
      pot: state.pot
    };

    const highest = Math.max.apply(null, revealed.map(function (bet) {
      return bet.value;
    }));
    const tiedBets = revealed.filter(function (bet) {
      return bet.value === highest;
    });

    if (tiedBets.length === 1) {
      const winner = playerFor(tiedBets[0].id);
      const won = state.pot;
      winner.score += won;
      state.lastReveal.winnerId = winner.id;
      addLog("Round " + state.round + ": " + winner.name + " won the pot.");
      state.pot = 0;
      state.tieStreak = 0;
      state.activeIds = state.players.filter(function (player) {
        return !player.isLeft;
      }).map(function (player) {
        return player.id;
      });
      waitForHost(middleDeck.length === 0 ? "finish" : "next-round");
      return;
    }

    state.activeIds = tiedBets.map(function (bet) {
      return bet.id;
    });
    state.tieStreak += 1;
    addLog("Round " + state.round + ": " + tiedBets.map(function (bet) {
      return bet.name;
    }).join(" and ") + " tied; the pot carries over.");

    waitForHost(state.tieStreak >= 3 || middleDeck.length === 0
      ? "begin-tiebreaker"
      : "tied-round");
  }

  function beginTieBreaker() {
    const activeCount = state.activeIds.filter(isActive).length;
    if (activeCount === 1) {
      awardTieBreakerPot(state.activeIds.find(isActive), "after the other tied players left");
      return;
    }
    if (activeCount < 2) {
      finishGame();
      return;
    }

    // Two tied players use RPS; larger ties use the odd pick in Up or Down.
    state.phase = "tiebreak";
    state.tieBreaker = {
      type: activeCount === 2 ? "rps" : "up-down",
      attempt: 1
    };
    clearLocks();
    addLog(activeCount === 2
      ? "The tied players will settle the pot with Rock, Paper, Scissors."
      : "The tied players will settle the pot with Up or Down.");
  }

  function resolveTieBreaker() {
    const activeChoices = state.activeIds.filter(isActive).map(function (id) {
      return {
        id: id,
        name: playerFor(id).name,
        avatarId: playerFor(id).avatarId,
        choice: tieChoices[id]
      };
    });
    const revealedChoices = activeChoices.map(function (entry) {
      return {
        id: entry.id,
        name: entry.name,
        avatarId: entry.avatarId,
        choice: entry.choice
      };
    });

    if (state.tieBreaker.type === "rps") {
      const first = activeChoices[0];
      const second = activeChoices[1];
      const beats = { rock: "scissors", paper: "rock", scissors: "paper" };
      if (first.choice === second.choice) {
        state.lastReveal = { kind: "rps-draw", pot: state.pot, choices: revealedChoices };
        addLog("Rock, Paper, Scissors was a draw. The tied players try again.");
        waitForHost("retry-tiebreaker");
        return;
      }

      const winner = beats[first.choice] === second.choice ? first : second;
      state.lastReveal = {
        kind: "tiebreak",
        tiebreakType: "rps",
        pot: state.pot,
        choices: revealedChoices,
        winnerId: winner.id
      };
      awardTieBreakerPot(winner.id, "with " + titleCase(winner.choice));
      return;
    }

    const upChoices = activeChoices.filter(function (entry) {
      return entry.choice === "up";
    });
    const downChoices = activeChoices.filter(function (entry) {
      return entry.choice === "down";
    });
    const oddChoice = upChoices.length === 1 ? upChoices[0] : (downChoices.length === 1 ? downChoices[0] : null);
    state.lastReveal = {
      kind: oddChoice ? "tiebreak" : "up-down-draw",
      tiebreakType: "up-down",
      pot: state.pot,
      choices: revealedChoices,
      winnerId: oddChoice ? oddChoice.id : null
    };

    if (!oddChoice) {
      addLog("Up or Down had no single odd pick. The tied players try again.");
      waitForHost("retry-tiebreaker");
      return;
    }

    awardTieBreakerPot(oddChoice.id, "as the odd pick in Up or Down");
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function retryTieBreaker() {
    tieChoices = Object.create(null);
    state.tieBreaker.attempt += 1;
    state.phase = "tiebreak";
    state.players.forEach(function (player) {
      player.locked = false;
    });
    locallyLocked = false;
  }

  function awardTieBreakerPot(winnerId, reason) {
    const winner = playerFor(winnerId);
    if (!winner) {
      finishGame();
      return;
    }

    const won = state.pot;
    winner.score += won;
    addLog(winner.name + " won the pot " + reason + ".");
    if (state.lastReveal) {
      state.lastReveal.winnerId = winner.id;
      state.lastReveal.pot = won;
    }
    state.pot = 0;
    state.tieStreak = 0;
    state.tieBreaker = null;
    state.activeIds = state.players.filter(function (player) {
      return !player.isLeft;
    }).map(function (player) {
      return player.id;
    });

    waitForHost(middleDeck.length === 0 ? "finish" : "next-round");
  }

  function finishGame() {
    clearLocks();
    state.phase = "finished";
    state.pendingAdvance = null;
    state.tieBreaker = null;
    state.activeIds = [];
    const highestScore = Math.max.apply(null, state.players.map(function (player) {
      return player.score;
    }));
    state.finalWinners = state.players.filter(function (player) {
      return player.score === highestScore;
    }).map(function (player) {
      return player.id;
    });

    if (!resultReported && currentContext && currentContext.isHost) {
      resultReported = true;
      currentContext.reportGameResult(GAME_ID, state.finalWinners.map(function (id) {
        return playerFor(id).name;
      }));
    }
  }

  function validCardAction(action, id) {
    const hand = privateByPlayer[id];
    return Boolean(
      action &&
      Number.isInteger(action.card) &&
      hand &&
      hand.hand.indexOf(action.card) !== -1 &&
      !Object.prototype.hasOwnProperty.call(betsByPlayer, id)
    );
  }

  function handleBet(action, id) {
    if (state.phase !== "betting" || !isActive(id) || !validCardAction(action, id)) return;

    betsByPlayer[id] = action.card;
    playerFor(id).locked = true;
    privateByPlayer[id].lockedCard = action.card;
    locallyLocked = id === playerId;
    if (allActivePlayersLocked(betsByPlayer)) {
      revealBets();
    }
    publish();
  }

  function handleTieBreakerChoice(action, id) {
    if (state.phase !== "tiebreak" || !isActive(id) ||
        Object.prototype.hasOwnProperty.call(tieChoices, id)) return;

    const allowed = state.tieBreaker.type === "rps" ? RPS_CHOICES : UP_DOWN_CHOICES;
    if (!action || allowed.indexOf(action.choice) === -1) return;

    tieChoices[id] = action.choice;
    playerFor(id).locked = true;
    locallyLocked = id === playerId;
    if (allActivePlayersLocked(tieChoices)) {
      resolveTieBreaker();
    }
    publish();
  }

  function escapeAttribute(value) {
    return escapeHTML(value);
  }

  function renderFinalResults(publicData) {
    const results = (publicData.finalResults || []).slice().sort(function (first, second) {
      return second.score - first.score;
    });
    const rows = results.map(function (player) {
      const winner = publicData.finalWinners.indexOf(player.id) !== -1;
      return '<div class="ca-result-row' + (winner ? " is-winner" : "") +
        (player.isLeft ? " is-left" : "") + '" style="--player-color:' +
        escapeAttribute(player.color) + '">' +
        '<span class="ca-result-name"><i></i><span class="ca-result-animal">' +
        escapeHTML(avatarEmoji(player.avatarId)) + '</span>' + escapeHTML(player.name) +
        (player.isLeft ? ' <small>(left)</small>' : "") + '</span>' +
        '<strong>' + player.score + '</strong></div>';
    }).join("");
    const heading = publicData.finalWinners.length > 1 ? "Joint winners!" : "Final scores";
    return '<section class="ca-final-results"><h3>' + heading + '</h3>' +
      '<p>The winner is highlighted below.</p><div class="ca-results">' + rows + '</div></section>';
  }

  function revealKey(reveal) {
    return reveal ? JSON.stringify(reveal) : null;
  }

  function revealIsVisible(reveal) {
    const key = revealKey(reveal);
    if (!key) return false;
    if (key !== activeRevealKey) {
      activeRevealKey = key;
      activeRevealUntil = Date.now() + 1500;
    }
    return Date.now() < activeRevealUntil;
  }

  function renderPlayerSeat(player, position, publicData, showReveal) {
    const active = publicData.activeIds.indexOf(player.id) !== -1;
    const isLocal = player.id === playerId;
    const locked = player.locked && active &&
      (publicData.phase === "betting" || publicData.phase === "tiebreak");
    const orientation = position === "left" || position === "right" ? " is-vertical" : "";
    const backs = isLocal ? "" : Array.from({ length: player.remainingCards }, function () {
      return '<i class="ca-card-back" aria-hidden="true"></i>';
    }).join("");
    const bet = showReveal && publicData.lastReveal && publicData.lastReveal.kind === "bets"
      ? publicData.lastReveal.bets.find(function (entry) {
        return entry.id === player.id;
      })
      : null;
    const betCard = bet
      ? '<span class="ca-bet-card is-revealed' +
        (publicData.lastReveal.winnerId === player.id ? " is-winner" : "") +
        '"><strong>' + cardName(bet.value) + '</strong></span>'
      : locked && publicData.phase === "betting"
        ? '<span class="ca-bet-card is-hidden" aria-label="Bet locked face down"><i></i></span>'
        : "";
    const positionStyle = position.indexOf("ring:") === 0
      ? ' style="--player-color:' + escapeAttribute(player.color) + ";" + position.slice(5) + '"'
      : ' style="--player-color:' + escapeAttribute(player.color) + '"';

    return '<div class="ca-seat ca-seat-' + (position.indexOf("ring:") === 0 ? "ring" : position) +
      (isLocal ? " is-local" : "") + (player.isLeft ? " is-left" : "") +
      (locked ? " is-locked" : "") + '"' + positionStyle + '>' +
      '<div class="ca-seat-name"><i></i><span class="ca-seat-animal">' +
      escapeHTML(avatarEmoji(player.avatarId)) + '</span><strong>' + escapeHTML(player.name) + '</strong>' +
      (player.isLeft ? '<small>left</small>' : "") +
      (locked ? '<span class="ca-lock-badge" aria-label="Locked in">✓</span>' : "") + '</div>' +
      (backs ? '<div class="ca-card-stack' + orientation + '" aria-label="' +
        player.remainingCards + ' cards remaining">' + backs + '</div>' : "") +
      betCard + '</div>';
  }

  function renderSeats(publicData, showReveal) {
    const localPlayer = publicData.players.find(function (player) {
      return player.id === playerId;
    });
    const opponents = publicData.players.filter(function (player) {
      return player.id !== playerId;
    });
    let seats = "";

    opponents.forEach(function (player, index) {
      let position;
      if (opponents.length === 1) {
        position = "top";
      } else if (publicData.players.length === 3) {
        position = index === 0 ? "left" : "right";
      } else if (publicData.players.length === 4) {
        position = ["left", "top", "right"][index];
      } else {
        // Keep opponents in room order as they travel clockwise from the local seat.
        const angle = (90 + (360 * (index + 1) / publicData.players.length)) * Math.PI / 180;
        const x = 50 + Math.cos(angle) * 44;
        const y = 50 + Math.sin(angle) * 39;
        position = "ring:--seat-x:" + x.toFixed(2) + "%;--seat-y:" + y.toFixed(2) + "%";
      }
      seats += renderPlayerSeat(player, position, publicData, showReveal);
    });

    if (localPlayer) {
      seats += renderPlayerSeat(localPlayer, "bottom", publicData, showReveal);
    }
    return seats;
  }

  function renderTieBreaker(publicData, activePlayer, locked) {
    if (publicData.phase !== "tiebreak" || !publicData.tieBreaker) return "";
    const rps = publicData.tieBreaker.type === "rps";
    const options = rps ? RPS_CHOICES : UP_DOWN_CHOICES;
    const title = rps ? "Rock, Paper, Scissors" : "Up or Down?";
    const lockedIds = publicData.tieBreaker.lockedBy;
    const optionButtons = options.map(function (choice) {
      return '<button class="ca-choice" type="button" data-choice="' + choice + '"' +
        (activePlayer && !locked ? "" : " disabled") + '>' + titleCase(choice) + '</button>';
    }).join("");
    const status = !activePlayer
      ? "Watch the tied players choose."
      : locked
        ? "Your secret choice is locked in. Waiting for the others."
        : "Pick secretly, then lock in your choice.";

    return '<div class="ca-modal-backdrop"><section class="ca-modal" role="dialog" aria-modal="true" aria-label="' +
      title + ' tiebreaker"><h3>' + title + '</h3><p>' + status + '</p><div class="ca-choice-list">' +
      optionButtons + '</div><small>' + lockedIds.length + " of " + publicData.activeIds.length +
      " tied players locked in</small></section></div>";
  }

  function renderRoundResult(publicData) {
    const reveal = publicData.lastReveal;
    if (!reveal) return "";
    let summary = "";
    let details = "";
    if (reveal.kind === "bets") {
      if (reveal.winnerId) {
        const winner = publicData.players.find(function (player) {
          return player.id === reveal.winnerId;
        });
        const winningBet = reveal.bets.find(function (bet) {
          return bet.id === reveal.winnerId;
        });
        summary = winner
          ? playerLabel(winner) + " won the pot (" + reveal.pot + ") with a " +
            cardName(winningBet.value)
          : "";
      } else {
        const highest = Math.max.apply(null, reveal.bets.map(function (bet) {
          return bet.value;
        }));
        const tied = reveal.bets.filter(function (bet) {
          return bet.value === highest;
        });
        summary = tied.map(function (bet) {
          return avatarEmoji(bet.avatarId) + " " + bet.name;
        }).join(" and ") + " tied; the pot is now " + reveal.pot + ".";
      }
    } else {
      details = (reveal.choices || []).map(function (choice) {
        return avatarEmoji(choice.avatarId) + " " + escapeHTML(choice.name) + ": " +
          titleCase(choice.choice);
      }).join(" · ");
      if (reveal.kind === "rps-draw" || reveal.kind === "up-down-draw") {
        summary = (reveal.kind === "rps-draw" ? "Rock, Paper, Scissors" : "Up or Down") +
          " was a draw; the pot remains " + reveal.pot + ".";
      } else {
        const winner = publicData.players.find(function (player) {
          return player.id === reveal.winnerId;
        });
        summary = winner
          ? playerLabel(winner) + " won the pot (" + reveal.pot + ") in " +
            (reveal.tiebreakType === "rps" ? "Rock, Paper, Scissors." :
              reveal.tiebreakType === "up-down" ? "Up or Down." : "a walkover.")
          : "";
      }
    }
    return '<div class="ca-round-result"><strong>' + escapeHTML(summary) + '</strong>' +
      (details ? '<small>' + details + '</small>' : "") + '</div>';
  }

  function render(publicData) {
    if (!publicData) return '<p class="ca-hand-note">Preparing the auction…</p>';

    const myPlayer = publicData.players.find(function (player) {
      return player.id === playerId;
    });
    const active = Boolean(myPlayer && !myPlayer.isLeft && publicData.activeIds.indexOf(playerId) !== -1);
    const betting = publicData.phase === "betting";
    const locked = Boolean(myPlayer && myPlayer.locked) || locallyLocked;
    const canBet = betting && active && !locked;
    const hand = myPrivateState ? myPrivateState.hand : [];
    const canShowCards = Boolean(myPrivateState);
    const showReveal = publicData.phase === "waiting-host" ||
      revealIsVisible(publicData.lastReveal);
    const cardButtons = hand.map(function (value) {
      const isSelected = selectedCard === value;
      const disabled = !canBet || !canShowCards;
      return '<button class="ca-card' + (isSelected ? " is-selected" : "") +
        '" type="button" data-card="' + value + '"' + (disabled ? " disabled" : "") + '>' +
        '<strong>' + cardName(value) + '</strong><small>' + value + '</small></button>';
    }).join("");
    const departingCard = recentlyUsedCard !== null && hand.indexOf(recentlyUsedCard) === -1
      ? '<span class="ca-card is-removing" aria-hidden="true"><strong>' +
        cardName(recentlyUsedCard) + '</strong><small>' + recentlyUsedCard + '</small></span>'
      : "";

    const recentLog = publicData.log.slice().reverse().map(function (line) {
      return "<li>" + escapeHTML(line) + "</li>";
    }).join("");
    const handLabel = publicData.phase === "finished"
      ? "Auction complete"
      : active
        ? (locked ? "Your card is locked in" : "Choose one card from your hand")
        : "Your hand";
    const lockButton = canBet && selectedCard !== null
      ? '<button class="ca-lock-button" type="button" data-lock-bet>Lock in ' + cardName(selectedCard) + '</button>'
      : "";
    const tieBreaker = renderTieBreaker(publicData, active, locked);
    const winner = showReveal && publicData.lastReveal && publicData.lastReveal.winnerId
      ? publicData.players.find(function (player) {
        return player.id === publicData.lastReveal.winnerId;
      })
      : null;
    const potTransfer = winner && publicData.lastReveal.kind !== "walkover"
      ? '<div class="ca-pot-transfer">Pot to ' + escapeHTML(playerLabel(winner)) + '</div>'
      : "";
    const roundResult = showReveal ? renderRoundResult(publicData) : "";
    const continueArea = publicData.phase === "waiting-host"
      ? '<div class="ca-continue-area">' +
        (currentContext && currentContext.isHost
          ? '<button class="ca-lock-button" type="button" data-continue>Continue</button><small>Press Enter</small>'
          : '<p>Waiting for the host to continue...</p>') + '</div>'
      : "";

    return '<div class="ca-game">' +
      '<div class="ca-table" aria-label="Card Auction table">' +
        renderSeats(publicData, showReveal) +
        '<section class="ca-center">' +
          '<span class="ca-round-label">Round ' + publicData.round + ' / ' + publicData.totalRounds + '</span>' +
          '<div class="ca-center-card">' + (publicData.middleCard
            ? '<strong>' + cardName(publicData.middleCard) + '</strong><small>' + publicData.middleCard + ' points</small>'
            : '<small>Not revealed</small>') + '</div>' +
          '<div class="ca-pot"><small>Pot</small><strong>' + publicData.pot + '</strong></div>' +
          '<small class="ca-cards-left">' + publicData.remainingMiddle + ' cards left</small>' +
        '</section>' +
        potTransfer + roundResult + continueArea +
        '<section class="ca-hand-area">' +
          '<div class="ca-hand-heading"><strong>' + handLabel + '</strong>' +
            (active && locked && publicData.phase !== "finished"
              ? '<span class="ca-lock-badge">✓ locked in</span>' : "") +
          '</div>' +
          (publicData.phase !== "finished" && canShowCards
            ? '<div class="ca-hand" style="--player-color:' + escapeAttribute(myPlayer.color) + '">' +
              departingCard + cardButtons + '</div>'
            : publicData.phase !== "finished"
              ? '<p class="ca-hand-note">Your private hand is loading…</p>'
              : '<p class="ca-hand-note">All of your cards have been played.</p>') +
          (active && locked && publicData.phase !== "finished"
            ? '<p class="ca-hand-note">Waiting for the other active players.</p>' : "") +
          lockButton +
        '</section>' +
        tieBreaker +
      '</div>' +
      (publicData.phase === "finished" ? renderFinalResults(publicData) : "") +
      '<section class="ca-log"><strong>Recent rounds</strong><ul>' +
        (recentLog || "<li>The auction is ready to begin.</li>") + '</ul></section>' +
      '</div>';
  }

  function afterRender(container, context) {
    currentContext = context;
    if (advanceKeyHandler) document.removeEventListener("keydown", advanceKeyHandler);
    advanceKeyHandler = function (event) {
      if (event.key !== "Enter" || event.repeat || !context.isHost ||
          !state || state.phase !== "waiting-host" ||
          !document.querySelector(".ca-game") ||
          event.target.closest("button, input, textarea, select")) return;
      event.preventDefault();
      context.sendAction({ type: "continue", step: state.advanceStep });
    };
    document.addEventListener("keydown", advanceKeyHandler);
    if (activeRevealUntil > Date.now() && !revealTimer) {
      revealTimer = setTimeout(function () {
        revealTimer = null;
        if (currentContext) currentContext.render();
      }, activeRevealUntil - Date.now());
    }
    container.querySelectorAll("[data-card]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.disabled || locallyLocked) return;
        selectedCard = Number(button.getAttribute("data-card"));
        context.render();
      });
    });

    const lockButton = container.querySelector("[data-lock-bet]");
    if (lockButton) {
      lockButton.addEventListener("click", function () {
        if (selectedCard === null || locallyLocked) return;
        locallyLocked = true;
        context.sendAction({ type: "lock-bet", card: selectedCard });
      });
    }

    container.querySelectorAll("[data-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.disabled || locallyLocked) return;
        locallyLocked = true;
        context.sendAction({
          type: "tiebreak-choice",
          choice: button.getAttribute("data-choice")
        });
      });
    });

    const continueButton = container.querySelector("[data-continue]");
    if (continueButton) {
      continueButton.addEventListener("click", function () {
        if (!context.isHost || !state || state.phase !== "waiting-host") return;
        context.sendAction({ type: "continue", step: state.advanceStep });
      });
    }
  }

  const cardAuction = {
    id: GAME_ID,
    name: "Card Auction",
    minPlayers: 2,
    description: "Secretly bid cards to win the growing pot.",
    start: function (players) {
      state = {
        round: 0,
        middleCard: null,
        pot: 0,
        phase: "betting",
        tieStreak: 0,
        tieBreaker: null,
        advanceStep: 0,
        pendingAdvance: null,
        activeIds: players.map(function (player) {
          return player.id;
        }),
        players: players.map(function (player, index) {
          return {
            id: player.id,
            name: player.name,
            avatarId: player.avatarId,
            score: 0,
            color: PLAYER_COLORS[index % PLAYER_COLORS.length],
            isLeft: false,
            locked: false
          };
        }),
        lastReveal: null,
        log: [],
        finalWinners: []
      };
      middleDeck = shuffle(CARD_VALUES);
      privateByPlayer = Object.create(null);
      betsByPlayer = Object.create(null);
      tieChoices = Object.create(null);
      resultReported = false;
      selectedCard = null;
      locallyLocked = false;
      recentlyUsedCard = null;
      activeRevealKey = null;
      activeRevealUntil = 0;
      if (removalTimer) clearTimeout(removalTimer);
      if (revealTimer) clearTimeout(revealTimer);
      removalTimer = null;
      revealTimer = null;
      if (advanceKeyHandler) document.removeEventListener("keydown", advanceKeyHandler);
      advanceKeyHandler = null;

      players.forEach(function (player) {
        privateByPlayer[player.id] = {
          hand: CARD_VALUES.slice(),
          used: [],
          lockedCard: null
        };
      });
      startNextRound(false);
      return {
        state: publicState(),
        privateStates: privateStates()
      };
    },
    initialize: function (publicData, privateState, context) {
      if (!context.isHost) state = publicData;
      currentContext = context;
      playerId = context.playerId;
      myPrivateState = null;
      if (privateState) updateMyPrivateState(privateState);
      selectedCard = null;
      locallyLocked = false;
      activeRevealKey = null;
      activeRevealUntil = 0;
      resultReported = publicData.phase === "finished";
    },
    receiveState: function (publicData) {
      state = publicData;
      const myPlayer = playerFor(playerId);
      if (myPlayer && myPlayer.locked) locallyLocked = true;
    },
    receivePrivateState: function (privateState, context) {
      currentContext = context;
      const handWasChanged = myPrivateState && privateState &&
        myPrivateState.used.length !== privateState.used.length;
      const betWasCleared = myPrivateState && myPrivateState.lockedCard !== null &&
        privateState && privateState.lockedCard === null;
      updateMyPrivateState(privateState);
      locallyLocked = Boolean(privateState && privateState.lockedCard !== null);
      if (handWasChanged || betWasCleared) selectedCard = null;
    },
    onMessage: function (action, id, context) {
      if (!state || !context.isHost || state.phase === "finished") return;
      currentContext = context;
      if (action && action.type === "continue") {
        advanceAfterHost(action, id);
      } else if (action && action.type === "lock-bet") {
        handleBet(action, id);
      } else if (action && action.type === "tiebreak-choice") {
        handleTieBreakerChoice(action, id);
      }
    },
    onPlayersChanged: function (players, context) {
      // Remove disconnected players from the waiting list so one missing player cannot stall a round.
      if (!state || !context.isHost || state.phase === "finished") return;
      currentContext = context;
      const connectedIds = new Set(players.map(function (player) {
        return player.id;
      }));
      const departed = state.players.filter(function (player) {
        return !player.isLeft && !connectedIds.has(player.id);
      });
      if (departed.length === 0) return;

      departed.forEach(function (player) {
        player.isLeft = true;
        player.locked = false;
        delete betsByPlayer[player.id];
        delete tieChoices[player.id];
      });
      state.activeIds = state.activeIds.filter(function (id) {
        return connectedIds.has(id);
      });
      addLog(departed.map(function (player) {
        return player.name + " left the game.";
      }).join(" "));

      if (state.phase === "waiting-host") {
        publish();
        return;
      }

      if (state.activeIds.length === 0) {
        state.activeIds = state.players.filter(function (player) {
          return !player.isLeft;
        }).map(function (player) {
          return player.id;
        });
        if (state.activeIds.length === 0) {
          finishGame();
        } else if (middleDeck.length > 0) {
          state.tieBreaker = null;
          state.tieStreak = 0;
          addLog("The remaining players take over the carried pot.");
          startNextRound(true);
        } else {
          beginTieBreaker();
        }
      } else if (state.phase === "tiebreak" && state.activeIds.length === 1) {
        const remainingId = state.activeIds[0];
        state.lastReveal = {
          kind: "walkover",
          winnerId: remainingId
        };
        awardTieBreakerPot(remainingId, "won the pot after the other tied players left");
      } else if (state.phase === "tiebreak") {
        const newType = state.activeIds.length === 2 ? "rps" : "up-down";
        if (state.tieBreaker.type !== newType) {
          tieChoices = Object.create(null);
          state.players.forEach(function (player) {
            player.locked = false;
          });
          state.tieBreaker = { type: newType, attempt: 1 };
          locallyLocked = false;
        } else if (allActivePlayersLocked(tieChoices)) {
          resolveTieBreaker();
          publish();
          return;
        }
      } else if (state.phase === "betting" && allActivePlayersLocked(betsByPlayer)) {
        revealBets();
      }

      publish();
    },
    render: render,
    afterRender: afterRender
  };

  window.GameNightGames = window.GameNightGames || [];
  window.GameNightGames.push(cardAuction);
}());
