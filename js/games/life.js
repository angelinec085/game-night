// This file runs Life Path on the host and shares the same visible life state with every player.
(function () {
  "use strict";

  const GAME_ID = "life-path";
  const DATA = window.LifePathData;
  const SPIN_TIME = 2500;
  const HOP_TIME = 250;
  const EFFECT_TIME = 750;

  let state = null;
  let currentContext = null;
  let localPlayerId = null;
  let turnVersion = 0;
  let animationId = 0;
  let resultReported = false;
  let locallyActed = false;
  let resultsCounted = false;
  let floatTimer = null;

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

  function shuffle(items) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      const item = result[index];
      result[index] = result[swap];
      result[swap] = item;
    }
    return result;
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) {
      setTimeout(resolve, milliseconds);
    });
  }

  function findPlayer(id) {
    return state.players.find(function (player) {
      return player.id === id;
    });
  }

  function findSpace(id) {
    return DATA.spaces.find(function (space) {
      return space.id === id;
    });
  }

  function publish() {
    // Only the host changes Life Path state; guests receive the complete public snapshot.
    if (currentContext && currentContext.isHost && state) {
      currentContext.publish(state, {});
    }
  }

  function activePlayer() {
    return findPlayer(state.currentPlayerId);
  }

  function isCurrentTurn(id) {
    const player = findPlayer(id);
    return Boolean(
      player &&
      !player.isLeft &&
      !player.retired &&
      state.currentPlayerId === id
    );
  }

  function makeChoice(kind, prompt, options, after, details) {
    state.phase = "choosing";
    state.pendingDecision = {
      kind: kind,
      prompt: prompt,
      options: options,
      after: after || null,
      details: details || null
    };
    state.animation = null;
    locallyActed = false;
  }

  function makeFirstChoice(player) {
    makeChoice("first-path", "Choose how your life begins.", [
      { id: "career", label: "Start a career", detail: "Pick one of two cozy careers." },
      { id: "college", label: "Go to college", detail: "Pay 100K, learn along the branch, then choose a degree career." }
    ]);
  }

  function drawCareers(kind, count) {
    const pool = DATA.careers.filter(function (career) {
      return career.kind === kind;
    });
    return shuffle(pool).slice(0, count);
  }

  function careerOptions(careers, prefix) {
    return careers.map(function (career) {
      return {
        id: prefix + ":" + career.id,
        label: career.emoji + " " + career.name,
        detail: "Salary " + career.salary + "K",
        career: career
      };
    });
  }

  function beginCareerPick(player, kind, count, after) {
    const careers = drawCareers(kind, count);
    makeChoice(
      "career-pick",
      kind === "degree" ? "Choose your degree career." : "Choose your career.",
      careerOptions(careers, "career"),
      after
    );
    publish();
  }

  function setPlayerCareer(player, career) {
    player.career = {
      id: career.id,
      name: career.name,
      emoji: career.emoji,
      kind: career.kind
    };
    player.salary = career.salary;
  }

  function statsItems(changes) {
    const items = [];
    if (changes.cash) {
      items.push({ text: (changes.cash > 0 ? "+" : "") + changes.cash + "K", kind: changes.cash > 0 ? "good" : "cost" });
    }
    if (changes.wealth) {
      items.push({ text: (changes.wealth > 0 ? "+" : "") + changes.wealth + " 🐷", kind: "token" });
    }
    if (changes.happiness) {
      items.push({ text: (changes.happiness > 0 ? "+" : "") + changes.happiness + " ❤️", kind: "token" });
    }
    if (changes.knowledge) {
      items.push({ text: (changes.knowledge > 0 ? "+" : "") + changes.knowledge + " 📖", kind: "token" });
    }
    if (changes.salary) {
      items.push({ text: "Salary +" + changes.salary + "K", kind: "good" });
    }
    return items;
  }

  function setStatsAnimation(entries) {
    state.animation = {
      id: ++animationId,
      type: "stats",
      entries: entries.filter(function (entry) {
        return entry.items && entry.items.length > 0;
      })
    };
    const thisAnimationId = state.animation.id;
    if (floatTimer) clearTimeout(floatTimer);
    floatTimer = setTimeout(function () {
      floatTimer = null;
      if (state && state.animation && state.animation.id === thisAnimationId) {
        state.animation = null;
        publish();
      }
    }, 1400);
  }

  function applyEffects(player, effects) {
    player.cash += effects.cash || 0;
    player.tokens.wealth += effects.wealth || 0;
    player.tokens.happiness += effects.happiness || 0;
    player.tokens.knowledge += effects.knowledge || 0;
    return statsItems(effects);
  }

  function scheduleTurnAdvance(version, delay) {
    setTimeout(function () {
      if (!state || state.phase === "finished" || version !== turnVersion) return;
      prepareNextTurn();
    }, delay);
  }

  function prepareNextTurn() {
    // Skip retired or disconnected players while preserving the original room order.
    if (!state || state.phase === "finished") return;
    const connected = state.players.filter(function (player) {
      return !player.isLeft;
    });
    if (connected.length <= 1 || connected.every(function (player) {
      return player.retired;
    })) {
      finishGame();
      return;
    }

    for (let offset = 1; offset <= state.players.length; offset += 1) {
      const index = (state.turnIndex + offset) % state.players.length;
      const player = state.players[index];
      if (player.isLeft || player.retired) continue;

      turnVersion += 1;
      state.turnIndex = index;
      state.currentPlayerId = player.id;
      state.bonusSpin = false;
      state.currentSpin = null;
      state.pendingDecision = null;
      state.animation = null;
      locallyActed = false;
      if (player.started) {
        state.phase = "awaiting-spin";
      } else {
        makeFirstChoice(player);
      }
      publish();
      return;
    }
    finishGame();
  }

  function finishGame() {
    if (!state || state.phase === "finished") return;
    state.phase = "finished";
    state.pendingDecision = null;
    state.currentSpin = null;
    state.animation = { id: ++animationId, type: "confetti" };
    state.finalResults = calculateFinalResults();
    state.finalWinners = state.finalResults.filter(function (result) {
      return !result.isLeft && result.isWinner;
    }).map(function (result) {
      return result.id;
    });
    if (!resultReported && currentContext && currentContext.isHost) {
      resultReported = true;
      currentContext.reportGameResult(GAME_ID, state.finalResults.filter(function (result) {
        return state.finalWinners.indexOf(result.id) !== -1;
      }).map(function (result) {
        return result.name;
      }));
    }
    publish();
  }

  function calculateFinalResults() {
    // Left players keep their totals but are excluded from category bonuses and winning.
    const connected = state.players.filter(function (player) {
      return !player.isLeft;
    });
    const bonuses = Object.create(null);
    connected.forEach(function (player) {
      bonuses[player.id] = { wealth: 0, happiness: 0, knowledge: 0 };
    });
    ["wealth", "happiness", "knowledge"].forEach(function (kind) {
      const highest = connected.reduce(function (maximum, player) {
        return Math.max(maximum, player.tokens[kind]);
      }, 0);
      if (highest < 1) return;
      connected.filter(function (player) {
        return player.tokens[kind] === highest;
      }).forEach(function (player) {
        bonuses[player.id][kind] = DATA.tokenBonus;
      });
    });

    const results = state.players.map(function (player) {
      const categoryBonuses = bonuses[player.id] || { wealth: 0, happiness: 0, knowledge: 0 };
      const tokenPoints = (player.tokens.wealth + player.tokens.happiness + player.tokens.knowledge) * DATA.pointsPerToken;
      const bonusPoints = categoryBonuses.wealth + categoryBonuses.happiness + categoryBonuses.knowledge;
      return {
        id: player.id,
        name: player.name,
        color: player.color,
        isLeft: player.isLeft,
        cash: player.cash,
        cashPoints: player.cash,
        tokens: {
          wealth: player.tokens.wealth,
          happiness: player.tokens.happiness,
          knowledge: player.tokens.knowledge
        },
        career: player.career,
        salary: player.salary,
        tokenPoints: tokenPoints,
        bonuses: categoryBonuses,
        bonusPoints: bonusPoints,
        total: player.cash + tokenPoints + bonusPoints
      };
    });
    const highestTotal = results.filter(function (result) {
      return !result.isLeft;
    }).reduce(function (maximum, result) {
      return Math.max(maximum, result.total);
    }, -Infinity);
    results.forEach(function (result) {
      result.isWinner = !result.isLeft && result.total === highestTotal;
    });
    return results;
  }

  function nextId(space) {
    if (Array.isArray(space.next)) return space.next[0] || null;
    return space.next;
  }

  function pathForSpin(player, steps) {
    const path = [];
    let cursor = findSpace(player.position);
    for (let step = 0; step < steps && cursor; step += 1) {
      const destination = findSpace(nextId(cursor));
      if (!destination) break;
      path.push(destination);
      cursor = destination;
      if (destination.type === "career-check" || destination.type === "midlife" ||
          destination.type === "retirement" || destination.type === "graduation") {
        break;
      }
    }
    return path;
  }

  function createLandingChoice(player, space) {
    if (space.type === "event") {
      if (state.eventDeck.length === 0) {
        state.eventDeck = shuffle(DATA.eventCards.map(function (eventCard) {
          return eventCard.id;
        }));
      }
      const cardId = state.eventDeck.shift();
      const eventCard = DATA.eventCards.find(function (entry) {
        return entry.id === cardId;
      });
      state.eventDiscard.push(cardId);
      makeChoice("event", eventCard.title, eventCard.choices.map(function (choice) {
        return {
          id: choice.id,
          label: choice.label,
          detail: "Cash " + (choice.effects.cash > 0 ? "+" : "") + choice.effects.cash +
            "K · 🐷 " + (choice.effects.wealth > 0 ? "+" : "") + choice.effects.wealth +
            " · ❤️ " + (choice.effects.happiness > 0 ? "+" : "") + choice.effects.happiness +
            " · 📖 " + (choice.effects.knowledge > 0 ? "+" : "") + choice.effects.knowledge,
          effects: choice.effects
        };
      }), "next-turn", { text: eventCard.text });
      return;
    }
    if (space.type === "milestone") {
      const options = [];
      if (!player.married) {
        options.push({
          id: "marry",
          label: "Get married",
          detail: "+" + DATA.rules.marriageHappiness + " ❤️; each other player pays you " +
            DATA.rules.marriagePayment + "K."
        });
      }
      if (player.babies < DATA.rules.maximumChildren) {
        options.push({
          id: "baby",
          label: "Have a baby or adopt a pet",
          detail: "-" + DATA.rules.babyCost + "K, +" + DATA.rules.babyHappiness +
            " ❤️, +" + DATA.rules.babyKnowledge + " 📖."
        });
      }
      options.push({ id: "pass", label: "Pass this time", detail: "Keep your plans as they are." });
      makeChoice("milestone", "A little life milestone", options, "next-turn");
      return;
    }
    if (space.type === "career-check") {
      makeChoice("career-check", "Career Check", [
        { id: "keep", label: "Keep your job", detail: "Get a " + DATA.rules.careerCheckRaise + "K salary raise." },
        { id: "switch", label: "Try a new career", detail: "Choose one of " +
          DATA.rules.careerSwitchChoices + " careers in the same field." }
      ], "bonus-spin");
      return;
    }
    if (space.type === "midlife") {
      makeChoice("midlife", "Mid-life moment", [
        { id: "promotion", label: "Take a promotion", detail: "+" + DATA.rules.midlifePromotion + "K salary." },
        { id: "sabbatical", label: "Take a sabbatical", detail: "-" + DATA.rules.sabbaticalCost +
          "K, +" + DATA.rules.sabbaticalHappiness + " ❤️, +" + DATA.rules.sabbaticalKnowledge + " 📖." },
        { id: "invest", label: "Invest in a cozy idea", detail: "-" + DATA.rules.investmentCost +
          "K, +" + DATA.rules.investmentWealth + " 🐷." }
      ], "bonus-spin");
    }
  }

  function resolveLanding(player, space, version) {
    if (!space || version !== turnVersion || !isCurrentTurn(player.id)) return;
    if (space.type === "career-check" || space.type === "midlife" ||
        space.type === "event" || space.type === "milestone") {
      createLandingChoice(player, space);
      publish();
      return;
    }
    if (space.type === "retirement") {
      retirePlayer(player);
      publish();
      if (allConnectedPlayersRetired()) finishGame();
      else prepareNextTurn();
      return;
    }
    if (space.type === "activity") {
      beginSpin(player.id, "lucky");
      return;
    }
    if (space.type === "quiet") {
      player.tokens.happiness += DATA.rules.quietHappiness;
      state.phase = "resolving";
      setStatsAnimation([{ playerId: player.id, items: statsItems({ happiness: DATA.rules.quietHappiness }) }]);
      publish();
      scheduleTurnAdvance(version, EFFECT_TIME);
      return;
    }
    state.phase = "resolving";
    state.animation = null;
    publish();
    scheduleTurnAdvance(version, 100);
  }

  function allConnectedPlayersRetired() {
    const connected = state.players.filter(function (player) {
      return !player.isLeft;
    });
    return connected.length > 0 && connected.every(function (player) {
      return player.retired;
    });
  }

  function retirePlayer(player) {
    player.retired = true;
    player.finishPlace = state.retirementOrder.length + 1;
    state.retirementOrder.push(player.id);
    const bonus = DATA.retirementBonuses[player.finishPlace - 1] ||
      DATA.retirementBonuses[DATA.retirementBonuses.length - 1];
    player.cash += bonus;
    state.currentPlayerId = player.id;
    state.phase = "resolving";
    setStatsAnimation([{ playerId: player.id, items: statsItems({ cash: bonus }) }]);
  }

  async function movePlayer(player, steps, version) {
    // Build the route first so a Payday knows whether it was passed or landed on.
    if (version !== turnVersion || !isCurrentTurn(player.id)) return;
    const path = pathForSpin(player, steps);
    state.phase = "moving";
    state.currentSpin = null;
    state.pendingDecision = null;
    publish();
    if (path.length === 0) {
      prepareNextTurn();
      return;
    }

    for (let index = 0; index < path.length; index += 1) {
      if (version !== turnVersion || !isCurrentTurn(player.id)) return;
      const destination = path[index];
      const previousPosition = player.position;
      player.position = destination.id;
      const changes = { cash: 0, wealth: 0, happiness: 0, knowledge: 0 };
      if (destination.type === "payday") {
        changes.cash = player.salary + (index === path.length - 1 ? DATA.rules.paydayLandingBonus : 0);
        player.cash += changes.cash;
      }
      state.animation = {
        id: ++animationId,
        type: "hop",
        playerId: player.id,
        from: previousPosition,
        to: destination.id,
        entries: statsItems(changes).length
          ? [{ playerId: player.id, items: statsItems(changes) }]
          : []
      };
      publish();
      await wait(HOP_TIME);
      if (version !== turnVersion || !isCurrentTurn(player.id)) return;
      if (destination.type === "career-check" || destination.type === "midlife" ||
          destination.type === "retirement") {
        resolveLanding(player, destination, version);
        return;
      }
    }
    resolveLanding(player, path[path.length - 1], version);
  }

  function randomSpin() {
    return DATA.spinNumbers[Math.floor(Math.random() * DATA.spinNumbers.length)];
  }

  function wheelRotation(number) {
    const index = DATA.spinNumbers.indexOf(number);
    const segmentCenter = -90 + (index + 0.5) * (360 / DATA.spinNumbers.length);
    const finalTurn = ((-90 - segmentCenter) % 360 + 360) % 360;
    return 360 * 5 + finalTurn;
  }

  async function beginSpin(playerId, kind) {
    // The host chooses the result before publishing the shared wheel animation.
    const correctPhase = kind === "lucky"
      ? state && state.phase === "moving"
      : state && state.phase === "awaiting-spin";
    if (!state || !isCurrentTurn(playerId) || !correctPhase) return;
    const version = turnVersion;
    const number = randomSpin();
    state.phase = "spinning";
    state.bonusSpin = false;
    state.pendingDecision = null;
    state.currentSpin = {
      id: ++animationId,
      kind: kind,
      number: number,
      rotation: wheelRotation(number)
    };
    state.animation = null;
    locallyActed = false;
    publish();
    await wait(SPIN_TIME);
    if (version !== turnVersion || !isCurrentTurn(playerId)) return;

    const player = findPlayer(playerId);
    if (kind === "lucky") {
      const result = DATA.luckySpinResults.find(function (entry) {
        return number >= entry.min && number <= entry.max;
      });
      const items = applyEffects(player, result.effects);
      state.phase = "resolving";
      state.currentSpin = null;
      setStatsAnimation([{ playerId: player.id, items: items }]);
      publish();
      scheduleTurnAdvance(version, EFFECT_TIME);
      return;
    }
    await movePlayer(player, number, version);
  }

  async function moveCollegeBranch(player, version) {
    const branch = DATA.spaces.filter(function (space) {
      return space.id.charAt(0) === "c";
    }).sort(function (first, second) {
      return Number(first.id.slice(1)) - Number(second.id.slice(1));
    });
    for (let index = 0; index < branch.length; index += 1) {
      if (version !== turnVersion || !isCurrentTurn(player.id)) return;
      const previousPosition = player.position;
      const space = branch[index];
      player.position = space.id;
      let knowledge = DATA.collegeKnowledgePerSpace;
      player.tokens.knowledge += knowledge;
      if (space.type === "graduation") {
        knowledge += DATA.collegeGraduationBonus;
        player.tokens.knowledge += DATA.collegeGraduationBonus;
      }
      state.phase = "moving";
      state.animation = {
        id: ++animationId,
        type: "hop",
        playerId: player.id,
        from: previousPosition,
        to: space.id,
        entries: [{ playerId: player.id, items: statsItems({ knowledge: knowledge }) }]
      };
      publish();
      await wait(HOP_TIME);
    }
    if (version !== turnVersion || !isCurrentTurn(player.id)) return;
    beginCareerPick(player, "degree", DATA.rules.degreeCareerChoices, "college-career");
  }

  function setBonusSpin(entries) {
    state.phase = "awaiting-spin";
    state.pendingDecision = null;
    state.bonusSpin = true;
    state.currentSpin = null;
    if (entries && entries.length) {
      setStatsAnimation(entries);
    } else {
      state.animation = null;
    }
    locallyActed = false;
    publish();
  }

  function handleCareerPick(player, option, decision) {
    setPlayerCareer(player, option.career);
    state.pendingDecision = null;
    if (decision.after === "college-career") {
      const oldPosition = player.position;
      player.position = DATA.collegeMerge;
      player.started = true;
      state.phase = "moving";
      state.animation = {
        id: ++animationId,
        type: "hop",
        playerId: player.id,
        from: oldPosition,
        to: player.position,
        entries: []
      };
      publish();
      const version = turnVersion;
      setTimeout(function () {
        if (version !== turnVersion || !isCurrentTurn(player.id)) return;
        state.phase = "awaiting-spin";
        state.bonusSpin = false;
        state.animation = null;
        locallyActed = false;
        publish();
      }, HOP_TIME);
      return;
    } else if (decision.after === "career-switch") {
      setBonusSpin();
      return;
    } else {
      player.started = true;
      state.phase = "awaiting-spin";
      state.bonusSpin = false;
    }
    state.animation = null;
    locallyActed = false;
    publish();
  }

  function applyChoice(id, playerId) {
    if (!state || state.phase !== "choosing" || !state.pendingDecision || !isCurrentTurn(playerId)) return;
    const decision = state.pendingDecision;
    const option = decision.options.find(function (entry) {
      return entry.id === id;
    });
    if (!option) return;
    const player = findPlayer(playerId);
    state.pendingDecision = null;
    locallyActed = false;

    if (decision.kind === "first-path") {
      if (id === "career") {
        beginCareerPick(player, "standard", DATA.rules.standardCareerChoices, "first-career");
        return;
      }
      player.cash -= DATA.rules.collegeCost;
      state.phase = "moving";
      setStatsAnimation([{ playerId: player.id, items: statsItems({ cash: -DATA.rules.collegeCost }) }]);
      publish();
      moveCollegeBranch(player, turnVersion);
      return;
    }

    if (decision.kind === "career-pick") {
      handleCareerPick(player, option, decision);
      return;
    }

    const entries = [];
    if (decision.kind === "event") {
      entries.push({ playerId: player.id, items: applyEffects(player, option.effects) });
    } else if (decision.kind === "milestone") {
      if (id === "marry" && !player.married) {
        player.married = true;
        player.tokens.happiness += DATA.rules.marriageHappiness;
        entries.push({ playerId: player.id, items: statsItems({ happiness: DATA.rules.marriageHappiness }) });
        state.players.forEach(function (otherPlayer) {
          if (otherPlayer.id === player.id) return;
          otherPlayer.cash -= DATA.rules.marriagePayment;
          entries.push({ playerId: otherPlayer.id, items: statsItems({ cash: -DATA.rules.marriagePayment }) });
        });
      } else if (id === "baby" && player.babies < DATA.rules.maximumChildren) {
        player.babies += 1;
        entries.push({ playerId: player.id, items: applyEffects(player, {
          cash: -DATA.rules.babyCost,
          happiness: DATA.rules.babyHappiness,
          knowledge: DATA.rules.babyKnowledge
        }) });
      }
    } else if (decision.kind === "career-check") {
      if (id === "keep") {
        player.salary += DATA.rules.careerCheckRaise;
        entries.push({ playerId: player.id, items: statsItems({ salary: DATA.rules.careerCheckRaise }) });
        setBonusSpin(entries);
        return;
      }
      const availableCareers = DATA.careers.filter(function (career) {
        return career.kind === player.career.kind && career.id !== player.career.id;
      });
      const careers = shuffle(availableCareers).slice(0, DATA.rules.careerSwitchChoices);
      makeChoice("career-pick", "Choose a new career.", careerOptions(careers, "career"), "career-switch");
      publish();
      return;
    } else if (decision.kind === "midlife") {
      if (id === "promotion") {
        player.salary += DATA.rules.midlifePromotion;
        entries.push({ playerId: player.id, items: statsItems({ salary: DATA.rules.midlifePromotion }) });
      } else if (id === "sabbatical") {
        entries.push({ playerId: player.id, items: applyEffects(player, {
          cash: -DATA.rules.sabbaticalCost,
          happiness: DATA.rules.sabbaticalHappiness,
          knowledge: DATA.rules.sabbaticalKnowledge
        }) });
      } else if (id === "invest") {
        entries.push({ playerId: player.id, items: applyEffects(player, {
          cash: -DATA.rules.investmentCost,
          wealth: DATA.rules.investmentWealth
        }) });
      }
      setBonusSpin(entries);
      return;
    }

    setStatsAnimation(entries);
    publish();
    scheduleTurnAdvance(turnVersion, EFFECT_TIME);
  }

  function renderWheel(spin) {
    const center = 100;
    const radius = 94;
    const segmentAngle = 360 / DATA.spinNumbers.length;
    const slices = DATA.spinNumbers.map(function (number, index) {
      const startAngle = (-90 + index * segmentAngle) * Math.PI / 180;
      const endAngle = (-90 + (index + 1) * segmentAngle) * Math.PI / 180;
      const midAngle = (startAngle + endAngle) / 2;
      const x1 = center + Math.cos(startAngle) * radius;
      const y1 = center + Math.sin(startAngle) * radius;
      const x2 = center + Math.cos(endAngle) * radius;
      const y2 = center + Math.sin(endAngle) * radius;
      const labelX = center + Math.cos(midAngle) * 62;
      const labelY = center + Math.sin(midAngle) * 62;
      return '<path d="M ' + center + ' ' + center + ' L ' + x1.toFixed(2) + ' ' +
        y1.toFixed(2) + ' A ' + radius + ' ' + radius + ' 0 0 1 ' +
        x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z" fill="' +
        escapeHTML(DATA.wheelColors[index % DATA.wheelColors.length]) +
        '" stroke="#fff9e9" stroke-width="2"></path><text x="' +
        labelX.toFixed(2) + '" y="' + labelY.toFixed(2) +
        '" text-anchor="middle" dominant-baseline="middle">' + number + '</text>';
    }).join("");
    return '<div class="life-wheel-shell"><span class="life-wheel-pointer">▼</span>' +
      '<svg class="life-wheel-svg is-spinning" style="--wheel-turn:' + spin.rotation +
      'deg" viewBox="0 0 200 200" role="img" aria-label="Wheel landing on ' +
      spin.number + '">' + slices + '<circle cx="100" cy="100" r="13" fill="#fffaf0" stroke="#718c70" stroke-width="3"></circle></svg>' +
      '<p>' + (spin.kind === "lucky" ? "Lucky Spin" : "The wheel is spinning…") +
      '<strong> ' + spin.number + '</strong></p></div>';
  }

  function renderBoard() {
    const byId = Object.create(null);
    DATA.spaces.forEach(function (space) {
      byId[space.id] = space;
    });
    const paths = [];
    DATA.spaces.forEach(function (space) {
      const destinations = Array.isArray(space.next) ? space.next : [space.next];
      destinations.filter(Boolean).forEach(function (id) {
        const destination = byId[id];
        if (destination) {
          paths.push('<line x1="' + space.x + '" y1="' + space.y + '" x2="' +
            destination.x + '" y2="' + destination.y + '" class="life-track-line"></line>');
        }
      });
    });

    const tiles = DATA.spaces.map(function (space) {
      const type = DATA.spaceTypes[space.type];
      const label = space.type === "career-check" ? "Career Check" : type.label;
      return '<g class="life-tile" transform="translate(' + space.x + ' ' + space.y + ')">' +
        '<rect x="-34" y="-24" width="68" height="48" rx="13" fill="' +
        escapeHTML(type.color) + '" stroke="#fffaf0" stroke-width="2"></rect>' +
        '<text x="0" y="-3" text-anchor="middle" class="life-tile-emoji">' +
        escapeHTML(type.emoji) + '</text><text x="0" y="15" text-anchor="middle" class="life-tile-label">' +
        escapeHTML(label) + '</text></g>';
    }).join("");

    const tokens = state.players.map(function (player) {
      const space = byId[player.position];
      if (!space) return "";
      const sameSpace = state.players.filter(function (other) {
        return other.position === player.position;
      });
      const tokenIndex = sameSpace.indexOf(player);
      const offsetX = (tokenIndex - (sameSpace.length - 1) / 2) * 13;
      const offsetY = Math.floor(tokenIndex / 3) * 9;
      const isActive = player.id === state.currentPlayerId && !player.isLeft && !player.retired;
      const isMoving = state.animation && state.animation.type === "hop" &&
        state.animation.playerId === player.id;
      return '<g class="life-token' + (isActive ? " is-active" : "") +
        (isMoving ? " is-moving" : "") +
        (player.isLeft ? " is-left" : "") + '" transform="translate(' +
        (space.x + offsetX) + ' ' + (space.y + 8 + offsetY) + ')">' +
        '<circle class="life-token-halo" r="14" fill="' + escapeHTML(player.color) + '"></circle>' +
        '<path d="M-12 3 L-9 -4 L-4 -8 L5 -8 L10 -3 L13 3 Z" fill="' +
        escapeHTML(player.color) + '" stroke="#fffaf0" stroke-width="1.5"></path>' +
        '<path d="M-5 -5 L-3 -8 L4 -8 L7 -4 Z" fill="#fffaf0" opacity=".8"></path>' +
        '<circle cx="-7" cy="4" r="2.2" fill="#405347"></circle><circle cx="8" cy="4" r="2.2" fill="#405347"></circle>' +
        '<text x="0" y="18" text-anchor="middle" class="life-token-label">' +
        escapeHTML(player.name) + '</text></g>';
    }).join("");
    return '<div class="life-board-scroll"><svg class="life-board-svg" viewBox="0 0 840 540" role="img" aria-label="Life Path winding game board">' +
      '<g>' + paths.join("") + '</g><g>' + tiles + '</g><g>' + tokens + '</g></svg></div>';
  }

  function renderChoicePopup(player, canChoose) {
    const decision = state.pendingDecision;
    if (!decision) return "";
    const options = decision.options.map(function (option) {
      const disabled = !canChoose || locallyActed;
      return '<button class="life-choice-card" type="button" data-choice="' +
        escapeHTML(option.id) + '"' + (disabled ? " disabled" : "") + '>' +
        '<strong>' + escapeHTML(option.label) + '</strong>' +
        (option.detail ? '<small>' + escapeHTML(option.detail) + '</small>' : "") +
        '</button>';
    }).join("");
    const extra = decision.details && decision.details.text
      ? '<p class="life-choice-story">' + escapeHTML(decision.details.text) + '</p>'
      : "";
    return '<div class="life-choice-overlay"><section class="life-choice-popup" role="dialog" aria-modal="true">' +
      '<p class="life-popup-eyebrow">' + escapeHTML(player ? player.name : "Player") + '</p>' +
      '<h3>' + escapeHTML(decision.prompt) + '</h3>' + extra +
      (!canChoose ? '<p class="life-watch-note">' + escapeHTML(player.name) + ' is choosing…</p>' : "") +
      '<div class="life-choice-list">' + options + '</div></section></div>';
  }

  function formatMoney(value) {
    return value + "K";
  }

  function renderFloats(playerId) {
    if (!state.animation || !state.animation.entries) return "";
    const entry = state.animation.entries.find(function (item) {
      return item.playerId === playerId;
    });
    if (!entry) return "";
    return '<div class="life-floats">' + entry.items.map(function (item) {
      return '<span class="life-float is-' + escapeHTML(item.kind) + '">' +
        escapeHTML(item.text) + '</span>';
    }).join("") + '</div>';
  }

  function renderPlayerPanel(player) {
    const active = player.id === state.currentPlayerId && !player.retired && !player.isLeft;
    const career = player.career
      ? player.career.emoji + " " + player.career.name
      : "Career not chosen";
    return '<article class="life-player-panel' + (active ? " is-active" : "") +
      (player.isLeft ? " is-left" : "") + (player.retired ? " is-retired" : "") +
      '" style="--player-color:' + escapeHTML(player.color) + '">' +
      '<div class="life-panel-heading"><span class="life-player-dot"></span><strong>' +
      escapeHTML(player.name) + '</strong>' +
      (player.isLeft ? '<small>left</small>' : player.retired ? '<small>retired</small>' : "") +
      '</div><div class="life-stat-line"><span>Cash</span><strong>' +
      formatMoney(player.cash) + '</strong></div>' +
      '<div class="life-token-line"><span>🐷 ' + player.tokens.wealth +
      '</span><span>❤️ ' + player.tokens.happiness + '</span><span>📖 ' +
      player.tokens.knowledge + '</span></div>' +
      '<div class="life-career-line"><span>' + escapeHTML(career) +
      '</span><strong>' + (player.salary ? player.salary + "K salary" : "No salary yet") +
      '</strong></div>' + renderFloats(player.id) + '</article>';
  }

  function renderResults() {
    const results = (state.finalResults || []).slice().sort(function (first, second) {
      if (first.isLeft !== second.isLeft) return first.isLeft ? 1 : -1;
      return second.total - first.total;
    });
    const lines = results.map(function (result) {
      return '<article class="life-result-row' + (result.isWinner ? " is-winner" : "") +
        (result.isLeft ? " is-left" : "") + '" style="--player-color:' +
        escapeHTML(result.color) + '"><div class="life-result-player"><span class="life-player-dot"></span>' +
        '<strong>' + escapeHTML(result.name) + '</strong>' +
        (result.isLeft ? '<small>left · cannot win</small>' : result.isWinner ? '<small>winner</small>' : "") +
        '</div><div class="life-result-breakdown"><span>Cash ' + result.cashPoints +
        '</span><span>Tokens ' + result.tokenPoints + '</span><span>Wealth +' +
        result.bonuses.wealth + '</span><span>Happiness +' + result.bonuses.happiness +
        '</span><span>Knowledge +' + result.bonuses.knowledge + '</span></div>' +
        '<strong class="life-result-total" data-total="' + result.total + '">0</strong></article>';
    }).join("");
    return '<section class="life-results"><div class="life-confetti" aria-hidden="true"></div>' +
      '<h3>' + (state.finalWinners.length > 1 ? "A lovely joint win!" : "Your life stories are complete!") + '</h3>' +
      '<p>Final points: 1 point per 1K cash, 20 per token, plus the category bonuses.</p>' +
      '<div class="life-results-list">' + lines + '</div></section>';
  }

  function render(publicState) {
    if (!publicState) return '<p>Preparing Life Path…</p>';
    state = publicState;
    const player = activePlayer();
    const canAct = Boolean(player && player.id === localPlayerId && !player.isLeft && !player.retired);
    const title = state.phase === "finished"
      ? "The journey is complete"
      : state.phase === "choosing" && player && !canAct
        ? player.name + " is choosing…"
        : canAct
          ? "Your turn!"
          : player
            ? player.name + " is taking a turn"
            : "Life Path";
    const spinButton = state.phase === "awaiting-spin" && canAct
      ? '<button class="life-spin-button" type="button" data-spin' +
        (locallyActed ? " disabled" : "") + '>Spin' + (state.bonusSpin ? " again" : "") + '</button>'
      : "";
    const wheel = state.phase === "spinning" && state.currentSpin
      ? '<div class="life-spin-overlay">' + renderWheel(state.currentSpin) + '</div>'
      : "";
    const finalResults = state.phase === "finished" ? renderResults() : "";
    const orderedPlayers = state.players.slice().sort(function (first, second) {
      return Number(first.isLeft) - Number(second.isLeft);
    });
    return '<div class="life-game">' +
      '<div class="life-topbar"><div><p class="life-eyebrow">A cozy game of choices</p>' +
      '<h3>Life Path</h3></div><div class="life-turn-banner' +
      (canAct ? " is-your-turn" : "") + '">' + escapeHTML(title) + spinButton + '</div></div>' +
      '<div class="life-layout"><div class="life-board-column">' +
      renderBoard() + wheel +
      (state.phase === "choosing" ? renderChoicePopup(player, canAct) : "") +
      '</div><aside class="life-stats-panel"><h3>Everyone’s journey</h3>' +
      orderedPlayers.map(renderPlayerPanel).join("") + '</aside></div>' +
      finalResults + '</div>';
  }

  function animateResultTotals(container) {
    if (resultsCounted || !container.querySelector(".life-results")) return;
    resultsCounted = true;
    const totals = container.querySelectorAll("[data-total]");
    const start = Date.now();
    const duration = 950;
    function tick() {
      const progress = Math.min(1, (Date.now() - start) / duration);
      totals.forEach(function (element) {
        const target = Number(element.getAttribute("data-total"));
        element.textContent = String(Math.round(target * progress));
      });
      if (progress < 1) window.requestAnimationFrame(tick);
    }
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      totals.forEach(function (element) {
        element.textContent = element.getAttribute("data-total");
      });
    } else {
      window.requestAnimationFrame(tick);
    }
  }

  function afterRender(container, context) {
    currentContext = context;
    animateResultTotals(container);
    container.querySelectorAll("[data-spin]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.disabled || locallyActed) return;
        locallyActed = true;
        context.render();
        context.sendAction({ type: "spin" });
      });
    });
    container.querySelectorAll("[data-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.disabled || locallyActed) return;
        locallyActed = true;
        context.render();
        context.sendAction({ type: "choice", id: button.getAttribute("data-choice") });
      });
    });
  }

  function handleAction(action, senderId) {
    // Never trust a guest action unless that player owns the current turn and decision.
    if (!state || state.phase === "finished" || !isCurrentTurn(senderId)) return;
    if (action && action.type === "spin") {
      if (state.phase !== "awaiting-spin") return;
      beginSpin(senderId, "normal");
      return;
    }
    if (action && action.type === "choice" && typeof action.id === "string" &&
        state.phase === "choosing" && state.pendingDecision &&
        state.pendingDecision.options.some(function (option) {
          return option.id === action.id;
        })) {
      applyChoice(action.id, senderId);
    }
  }

  function onPlayersChanged(players, context) {
    // A departed active player is skipped immediately so nobody waits for a missing guest.
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
    });

    const connected = state.players.filter(function (player) {
      return !player.isLeft;
    });
    if (connected.length <= 1) {
      turnVersion += 1;
      finishGame();
      return;
    }

    if (departed.some(function (player) {
      return player.id === state.currentPlayerId;
    })) {
      turnVersion += 1;
      state.currentSpin = null;
      state.pendingDecision = null;
      state.animation = null;
      prepareNextTurn();
      return;
    }
    publish();
  }

  const lifePath = {
    id: GAME_ID,
    name: "Life Path",
    description: "Spin, choose your path, and build a life.",
    minPlayers: DATA.minPlayers,
    maxPlayers: DATA.maxPlayers,
    start: function (players) {
      const validPlayers = players.slice(0, DATA.maxPlayers);
      state = {
        phase: "choosing",
        players: validPlayers.map(function (player, index) {
          return {
            id: player.id,
            name: player.name,
            color: DATA.playerColors[index % DATA.playerColors.length],
            cash: DATA.startingCash,
            tokens: { wealth: 0, happiness: 0, knowledge: 0 },
            career: null,
            salary: 0,
            position: DATA.mainStart,
            started: false,
            married: false,
            babies: 0,
            retired: false,
            isLeft: false,
            finishPlace: null
          };
        }),
        turnIndex: 0,
        currentPlayerId: validPlayers[0] ? validPlayers[0].id : null,
        pendingDecision: null,
        currentSpin: null,
        bonusSpin: false,
        eventDeck: shuffle(DATA.eventCards.map(function (eventCard) {
          return eventCard.id;
        })),
        eventDiscard: [],
        retirementOrder: [],
        animation: null,
        finalResults: null,
        finalWinners: []
      };
      if (validPlayers[0]) makeFirstChoice(state.players[0]);
      turnVersion = 0;
      animationId = 0;
      resultReported = false;
      locallyActed = false;
      resultsCounted = false;
      if (floatTimer) clearTimeout(floatTimer);
      floatTimer = null;
      return { state: state };
    },
    initialize: function (publicState, privateState, context) {
      state = publicState;
      currentContext = context;
      localPlayerId = context.playerId;
      turnVersion = 0;
      locallyActed = false;
      resultsCounted = false;
      resultReported = state.phase === "finished";
    },
    receiveState: function (publicState) {
      const previousPlayer = state && state.currentPlayerId;
      const previousPhase = state && state.phase;
      const previousDecision = state && state.pendingDecision
        ? state.pendingDecision.kind + ":" + state.pendingDecision.prompt
        : "";
      state = publicState;
      const nextDecision = state.pendingDecision
        ? state.pendingDecision.kind + ":" + state.pendingDecision.prompt
        : "";
      if (state.currentPlayerId !== previousPlayer || state.phase !== previousPhase ||
          nextDecision !== previousDecision) {
        locallyActed = false;
      }
      if (state.phase === "finished" && previousPhase !== "finished") resultsCounted = false;
    },
    onMessage: handleAction,
    onPlayersChanged: onPlayersChanged,
    render: render,
    afterRender: afterRender
  };

  window.GameNightGames = window.GameNightGames || [];
  window.GameNightGames.push(lifePath);
}());
