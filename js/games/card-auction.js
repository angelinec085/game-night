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
    // This shared snapshot contains scores and lock status, never hands or unrevealed bets.
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
      activeIds: state.activeIds.slice(),
      players: state.players.map(function (player) {
        return {
          id: player.id,
          name: player.name,
          score: player.score,
          color: player.color,
          isLeft: player.isLeft,
          locked: player.locked
        };
      }),
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
        myPrivateState = currentPrivateStates[playerId];
      }
      currentContext.publish(publicState(), currentPrivateStates);
    }
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

  function startNextRound(carryPot) {
    if (middleDeck.length === 0) {
      finishGame();
      return;
    }

    state.round += 1;
    state.middleCard = middleDeck.shift();
    state.pot += state.middleCard;
    state.phase = "betting";
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
      return { id: id, name: player.name, value: value };
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
      addLog("Round " + state.round + ": " + winner.name + " won " + won + " points with a " + cardName(tiedBets[0].value) + ".");
      state.pot = 0;
      state.tieStreak = 0;
      state.activeIds = state.players.filter(function (player) {
        return !player.isLeft;
      }).map(function (player) {
        return player.id;
      });
      if (middleDeck.length === 0) {
        finishGame();
      } else {
        startNextRound(false);
      }
      return;
    }

    state.activeIds = tiedBets.map(function (bet) {
      return bet.id;
    });
    state.tieStreak += 1;
    addLog("Round " + state.round + ": " + tiedBets.map(function (bet) {
      return bet.name;
    }).join(" and ") + " tied. The " + state.pot + "-point pot carries over.");

    if (state.tieStreak >= 3 || middleDeck.length === 0) {
      beginTieBreaker();
    } else {
      startNextRound(true);
    }
  }

  function beginTieBreaker() {
    const activeCount = state.activeIds.filter(isActive).length;
    if (activeCount === 1) {
      awardTieBreakerPot(state.activeIds.find(isActive), "won the pot after the other tied players left");
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
        choice: tieChoices[id]
      };
    });
    const revealedChoices = activeChoices.map(function (entry) {
      return { id: entry.id, name: entry.name, choice: entry.choice };
    });

    if (state.tieBreaker.type === "rps") {
      const first = activeChoices[0];
      const second = activeChoices[1];
      const beats = { rock: "scissors", paper: "rock", scissors: "paper" };
      if (first.choice === second.choice) {
        state.lastReveal = { kind: "rps-draw", choices: revealedChoices };
        addLog("Rock, Paper, Scissors was a draw. The tied players try again.");
        retryTieBreaker();
        return;
      }

      const winner = beats[first.choice] === second.choice ? first : second;
      state.lastReveal = { kind: "tiebreak", choices: revealedChoices, winnerId: winner.id };
      awardTieBreakerPot(winner.id, "won the pot with " + titleCase(winner.choice));
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
      choices: revealedChoices,
      winnerId: oddChoice ? oddChoice.id : null
    };

    if (!oddChoice) {
      addLog("Up or Down had no single odd pick. The tied players try again.");
      retryTieBreaker();
      return;
    }

    awardTieBreakerPot(oddChoice.id, "was the odd pick in Up or Down");
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function retryTieBreaker() {
    tieChoices = Object.create(null);
    state.tieBreaker.attempt += 1;
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
    addLog(winner.name + " " + reason + " and won " + won + " points.");
    state.pot = 0;
    state.tieStreak = 0;
    state.tieBreaker = null;
    state.activeIds = state.players.filter(function (player) {
      return !player.isLeft;
    }).map(function (player) {
      return player.id;
    });

    if (middleDeck.length === 0) {
      finishGame();
    } else {
      startNextRound(false);
    }
  }

  function finishGame() {
    clearLocks();
    state.phase = "finished";
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

  function renderScoreboard(publicData) {
    return publicData.players.slice().sort(function (first, second) {
      return second.score - first.score;
    }).map(function (player) {
      const active = publicData.activeIds.indexOf(player.id) !== -1;
      const winner = publicData.phase === "finished" && publicData.finalWinners.indexOf(player.id) !== -1;
      let status = "Watching";
      if (player.isLeft) {
        status = "Left";
      } else if (active && player.locked) {
        status = "Locked in ✓";
      } else if (active && publicData.phase === "betting") {
        status = "Not locked in";
      } else if (active && publicData.phase === "tiebreak") {
        status = "Not locked in";
      }

      return '<div class="ca-player' + (player.isLeft ? " ca-player-left" : "") +
        (winner ? " ca-final-winner" : "") + '" style="--player-color:' +
        escapeAttribute(player.color) + '">' +
        '<span class="ca-player-name"><i></i>' + escapeHTML(player.name) +
        (player.isLeft ? ' <small>(left)</small>' : "") + '</span>' +
        '<strong>' + player.score + '</strong>' +
        '<span class="ca-player-status">' + escapeHTML(status) + '</span></div>';
    }).join("");
  }

  function renderLastReveal(reveal, publicData) {
    if (!reveal) return "";
    if (reveal.kind === "bets") {
      return '<div class="ca-reveal"><strong>Revealed bets</strong><span>' +
        reveal.bets.map(function (bet) {
          const player = publicData.players.find(function (entry) {
            return entry.id === bet.id;
          });
          const color = player ? escapeAttribute(player.color) : "#527b5a";
          return '<span class="ca-revealed-bet" style="--player-color:' + color + '">' +
            escapeHTML(bet.name) + ': <strong>' + cardName(bet.value) + '</strong></span>';
        }).join("") + '</span></div>';
    }
    if (reveal.choices) {
      const label = reveal.kind === "rps-draw" || reveal.kind === "up-down-draw"
        ? "Tie-break draw"
        : "Tie-break revealed";
      return '<div class="ca-reveal"><strong>' + label + '</strong><span>' +
        reveal.choices.map(function (choice) {
          const player = publicData.players.find(function (entry) {
            return entry.id === choice.id;
          });
          const color = player ? escapeAttribute(player.color) : "#527b5a";
          return '<span class="ca-revealed-bet" style="--player-color:' + color + '">' +
            escapeHTML(choice.name) + ': <strong>' + titleCase(choice.choice) + '</strong></span>';
        }).join("") + '</span></div>';
    }
    return "";
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

  function addStyles() {
    if (document.getElementById("card-auction-styles")) return;
    const style = document.createElement("style");
    style.id = "card-auction-styles";
    style.textContent = [
      ".ca-game{color:#344b3b}",
      ".ca-top{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:10px;margin:18px 0}",
      ".ca-top-box{padding:12px;border-radius:14px;background:#f3f8f2;text-align:center}",
      ".ca-top-box small{display:block;color:#718174;font-size:.74rem}",
      ".ca-top-box strong{display:block;margin-top:3px;font-size:1.15rem}",
      ".ca-middle-card{display:inline-grid;min-width:50px;min-height:62px;margin-top:5px;place-content:center;border:1px solid #d6e4d4;border-radius:10px;background:#fff;box-shadow:0 3px 8px #344b3b18;font-size:1.35rem}",
      ".ca-middle-card small{font-size:.7rem}",
      ".ca-scoreboard{display:grid;gap:7px;margin:15px 0}",
      ".ca-player{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:9px 11px;border-left:4px solid var(--player-color);border-radius:10px;background:#f5f9f4}",
      ".ca-player-left{opacity:.62}",
      ".ca-player-name{min-width:0;overflow-wrap:anywhere;font-weight:700}",
      ".ca-player-name i{display:inline-block;width:9px;height:9px;margin-right:7px;border-radius:50%;background:var(--player-color)}",
      ".ca-player-name small,.ca-player-status{color:#718174;font-size:.74rem;font-weight:400}",
      ".ca-log{max-height:120px;overflow:auto;margin-top:15px;padding:11px 13px;border-radius:12px;background:#f7faf6;color:#596b5c;font-size:.8rem}",
      ".ca-log ul{display:grid;gap:5px;margin:7px 0 0;padding-left:17px}",
      ".ca-reveal{display:grid;gap:4px;margin:12px 0;padding:10px 12px;border-radius:11px;background:#edf5eb;font-size:.82rem}",
      ".ca-revealed-bet{display:inline-block;margin:3px 7px 3px 0;padding:4px 8px;border-left:3px solid var(--player-color);border-radius:5px;background:#fff}",
      ".ca-hand{display:flex;flex-wrap:wrap;gap:7px;margin:9px 0 12px}",
      ".ca-card{display:grid;min-width:43px;min-height:57px;place-content:center;gap:2px;border:1px solid #d8e5d6;border-top:3px solid var(--player-color,#8eae91);border-radius:9px;background:#fff;color:#3c5742;box-shadow:0 2px 6px #344b3b14;cursor:pointer;font:inherit}",
      ".ca-card strong{font-size:1.08rem}",
      ".ca-card small{text-align:center;color:#718174;font-size:.68rem}",
      ".ca-card.is-selected{border-color:#5d8a63;background:#eaf4e8;box-shadow:0 0 0 2px #5d8a6330}",
      ".ca-card.is-used{background:#e8eae7;color:#9aa19a;box-shadow:none;cursor:not-allowed}",
      ".ca-card:disabled:not(.is-used){opacity:.5;cursor:not-allowed}",
      ".ca-lock-button,.ca-choice{min-height:41px;padding:0 15px;border:0;border-radius:11px;background:#527b5a;color:#fff;font:inherit;font-weight:700;cursor:pointer}",
      ".ca-lock-button:disabled,.ca-choice:disabled{opacity:.5;cursor:not-allowed}",
      ".ca-hand-note{margin:0;color:#718174;font-size:.8rem}",
      ".ca-modal-backdrop{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:18px;background:#26352db8}",
      ".ca-modal{width:min(100%,390px);padding:24px;border:1px solid #d8e5d6;border-radius:20px;background:#fff;box-shadow:0 18px 55px #14201944;text-align:center}",
      ".ca-modal h3{margin:0;color:#36553d}",
      ".ca-modal p{color:#718174;line-height:1.45}",
      ".ca-choice-list{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:17px 0}",
      ".ca-choice{background:#e8f2e7;color:#3b6345}",
      ".ca-modal small{color:#718174}",
      ".ca-final{padding:13px;border-radius:13px;background:#edf5eb}",
      ".ca-final-winner{outline:2px solid #6f9a70;background:#eaf4e8}",
      "@media(max-width:480px){.ca-top{grid-template-columns:1fr 1fr}.ca-top-box:nth-child(2){grid-column:1/-1;grid-row:1}.ca-player{grid-template-columns:minmax(0,1fr) auto}.ca-player-status{grid-column:1/-1;padding-left:16px}.ca-card{min-width:39px}}"
    ].join("");
    document.head.appendChild(style);
  }

  function render(publicData) {
    addStyles();
    if (!publicData) return '<p class="ca-hand-note">Preparing the auction…</p>';

    const myPlayer = publicData.players.find(function (player) {
      return player.id === playerId;
    });
    const active = Boolean(myPlayer && !myPlayer.isLeft && publicData.activeIds.indexOf(playerId) !== -1);
    const betting = publicData.phase === "betting";
    const locked = Boolean(myPlayer && myPlayer.locked) || locallyLocked;
    const canBet = betting && active && !locked;
    const used = myPrivateState ? myPrivateState.used : [];
    const hand = myPrivateState ? myPrivateState.hand : [];
    const usedCards = new Set(used);
    const canShowCards = Boolean(myPrivateState);
    const cardButtons = CARD_VALUES.map(function (value) {
      const isUsed = usedCards.has(value);
      const isSelected = selectedCard === value;
      const disabled = isUsed || !canBet || !canShowCards || hand.indexOf(value) === -1;
      return '<button class="ca-card' + (isUsed ? " is-used" : "") + (isSelected ? " is-selected" : "") +
        '" type="button" data-card="' + value + '"' + (disabled ? " disabled" : "") + '>' +
        '<strong>' + cardName(value) + '</strong><small>' + value + '</small></button>';
    }).join("");

    const recentLog = publicData.log.slice().reverse().map(function (line) {
      return "<li>" + escapeHTML(line) + "</li>";
    }).join("");
    const winnerIds = publicData.finalWinners || [];
    const finalTitle = winnerIds.length > 1 ? "Joint win!" : "Game over!";
    const finalPanel = publicData.phase === "finished"
      ? '<section class="ca-final"><h3>' + finalTitle + '</h3></section>'
      : "";
    const reveal = renderLastReveal(publicData.lastReveal, publicData);
    const handLabel = publicData.phase === "finished"
      ? "Your cards"
      : active
        ? (locked ? "Your card is locked in" : "Choose one card from your hand")
        : "Your hand (watching this round)";
    const lockButton = canBet && selectedCard !== null
      ? '<button class="ca-lock-button" type="button" data-lock-bet>Lock in ' + cardName(selectedCard) + '</button>'
      : "";
    const tieBreaker = renderTieBreaker(publicData, active, locked);
    const roundLabel = publicData.round + " / " + publicData.totalRounds;
    const middle = publicData.middleCard
      ? '<span class="ca-middle-card"><strong>' + cardName(publicData.middleCard) +
        '</strong><small>' + publicData.middleCard + " points</small></span><p class=\"ca-hand-note\">" +
        publicData.remainingMiddle + " cards face down</p>"
      : '<span class="ca-hand-note">Not revealed</span>';
    const winnerNotice = winnerIds.length > 1
      ? "Joint winners: " + publicData.players.filter(function (player) {
        return winnerIds.indexOf(player.id) !== -1;
      }).map(function (player) {
        return player.name;
      }).join(", ")
      : winnerIds.length === 1
        ? "Winner: " + (publicData.players.find(function (player) {
          return player.id === winnerIds[0];
        }) || {}).name
        : "";

    return '<div class="ca-game">' +
      '<div class="ca-top">' +
        '<div class="ca-top-box"><small>Round</small><strong>' + roundLabel + '</strong></div>' +
        '<div class="ca-top-box"><small>Middle card</small>' + middle + '</div>' +
        '<div class="ca-top-box"><small>Pot</small><strong>' + publicData.pot + ' points</strong></div>' +
      '</div>' +
      (publicData.phase === "finished" && winnerNotice ? '<p class="ca-hand-note">' + escapeHTML(winnerNotice) + '</p>' : "") +
      finalPanel +
      '<h3>Scores</h3><div class="ca-scoreboard">' + renderScoreboard(publicData) + '</div>' +
      reveal +
      tieBreaker +
      (publicData.phase !== "finished" ? '<section><h3>' + handLabel + '</h3>' +
        (canShowCards
          ? '<div class="ca-hand" style="--player-color:' + escapeAttribute(myPlayer.color) + '">' + cardButtons + '</div>'
          : '<p class="ca-hand-note">Your private hand is loading…</p>') +
        (active && locked ? '<p class="ca-hand-note">Locked in. Waiting for the other active players.</p>' : "") +
        lockButton + '</section>'
        : "") +
      '<section class="ca-log"><strong>Recent results</strong><ul>' +
        (recentLog || "<li>The auction is ready to begin.</li>") + '</ul></section>' +
      '</div>';
  }

  function afterRender(container, context) {
    currentContext = context;
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
        activeIds: players.map(function (player) {
          return player.id;
        }),
        players: players.map(function (player, index) {
          return {
            id: player.id,
            name: player.name,
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
      myPrivateState = privateState || null;
      selectedCard = null;
      locallyLocked = false;
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
      myPrivateState = privateState;
      locallyLocked = Boolean(privateState && privateState.lockedCard !== null);
      if (handWasChanged || betWasCleared) selectedCard = null;
    },
    onMessage: function (action, id, context) {
      if (!state || !context.isHost || state.phase === "finished") return;
      currentContext = context;
      if (action && action.type === "lock-bet") {
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
