// This file runs Life Path on the host and shares the same visible life state with every player.
(function () {
  "use strict";

  const GAME_ID = "life-path";
  const DATA = window.LifePathData;
  const BOARD_WIDTH = 1600;
  const BOARD_HEIGHT = 1700;
  const FAST_PREFERENCE_KEY = "lifePathFastAnimations";
  const SPIN_TIME = 2800;
  const SPIN_RESULT_TIME = 800;
  const SPIN_FADE_TIME = 400;
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
  let boardGeometry = null;
  let sceneryMarkup = null;
  let legendOpen = false;
  let camera = { x: 0, y: 0, zoom: 1, autoFollowUntil: 0, followKey: null };
  let cameraResumeTimer = null;
  let keyHandler = null;
  let fastAnimations = false;
  let paceTimer = null;

  function hopDuration() {
    return fastAnimations ? 120 : HOP_TIME;
  }

  function readFastAnimations() {
    try {
      return window.localStorage.getItem(FAST_PREFERENCE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function saveFastAnimations() {
    try {
      window.localStorage.setItem(FAST_PREFERENCE_KEY, String(fastAnimations));
    } catch (error) {
      // Private browsing can block storage, but the toggle still works for this game.
    }
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

  function avatarEmoji(avatarId) {
    return window.GameNightAvatars.getAvatar(avatarId) || "🐾";
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
      items.push({ text: (changes.cash > 0 ? "+" : "") + changes.cash + "k", kind: changes.cash > 0 ? "good" : "cost" });
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

  function beginTurnTracking(player) {
    if (!player) return;
    state.turnBaseline = {
      playerId: player.id,
      cash: player.cash,
      salary: player.salary,
      tokens: {
        wealth: player.tokens.wealth,
        happiness: player.tokens.happiness,
        knowledge: player.tokens.knowledge
      }
    };
    state.turnProgress = { playerId: player.id, spins: [], landing: null };
  }

  function turnSummaryChanges(player) {
    const baseline = state.turnBaseline;
    if (!baseline || baseline.playerId !== player.id) return [];
    const changes = [];
    const cash = player.cash - baseline.cash;
    const salary = player.salary - baseline.salary;
    if (cash) changes.push({
      text: (cash > 0 ? "+" : "") + cash + "K",
      kind: cash > 0 ? "good" : "cost"
    });
    ["wealth", "happiness", "knowledge"].forEach(function (kind) {
      const difference = player.tokens[kind] - baseline.tokens[kind];
      if (!difference) return;
      const emoji = kind === "wealth" ? "🐷" : kind === "happiness" ? "❤️" : "📖";
      changes.push({
        text: (difference > 0 ? "+" : "") + difference + " " + emoji,
        kind: "token"
      });
    });
    if (salary) changes.push({
      text: "Salary " + (salary > 0 ? "+" : "") + salary + "K",
      kind: "good"
    });
    return changes;
  }

  function makeTurnSummary() {
    const player = activePlayer();
    if (!player) return null;
    const progress = state.turnProgress && state.turnProgress.playerId === player.id
      ? state.turnProgress
      : { spins: [], landing: null };
    const changes = turnSummaryChanges(player);
    const cashChange = state.turnBaseline && state.turnBaseline.playerId === player.id
      ? player.cash - state.turnBaseline.cash
      : 0;
    const spinText = progress.spins.length
      ? "spun a " + progress.spins.map(function (number) {
        return String(number);
      }).join(" and then a ")
      : "finished their path choice";
    let sentence = player.name + " " + spinText;
    if (progress.landing) sentence += ", landed on " + progress.landing;
    if (cashChange > 0) sentence += " and earned " + cashChange + "k";
    else if (cashChange < 0) sentence += " and spent " + Math.abs(cashChange) + "k";
    return {
      playerId: player.id,
      name: player.name,
      avatarId: player.avatarId,
      color: player.color,
      sentence: sentence + ".",
      changes: changes
    };
  }

  function clearPaceTimer() {
    if (paceTimer) clearTimeout(paceTimer);
    paceTimer = null;
  }

  function schedulePaceAdvance() {
    clearPaceTimer();
    if (!state || !currentContext || !currentContext.isHost ||
        state.phase !== "waiting-host" || state.pace === "manual") return;
    const duration = state.pace === "auto5" ? 5000 : 10000;
    const remaining = Math.max(0, duration - (Date.now() - state.countdownStartedAt));
    const step = state.advanceStep;
    paceTimer = setTimeout(function () {
      advanceLifeTurn(step, localPlayerId);
    }, remaining);
  }

  function waitForHost() {
    clearPaceTimer();
    state.phase = "waiting-host";
    state.turnSummary = makeTurnSummary();
    state.advanceStep += 1;
    const duration = state.pace === "auto5" ? 5000 :
      state.pace === "auto10" ? 10000 : 0;
    state.countdownStartedAt = duration ? Date.now() : null;
    state.countdownDuration = duration;
    publish();
    schedulePaceAdvance();
  }

  function advanceLifeTurn(step, senderId) {
    if (!state || !currentContext || !currentContext.isHost ||
        senderId !== localPlayerId || state.phase !== "waiting-host" ||
        !Number.isInteger(step) || step !== state.advanceStep) return;
    clearPaceTimer();
    state.advanceStep += 1;
    state.countdownStartedAt = null;
    state.countdownDuration = 0;
    state.turnSummary = null;
    state.phase = "advancing";
    prepareNextTurn();
  }

  function scheduleTurnSummary(version, delay) {
    setTimeout(function () {
      if (!state || state.phase === "finished" || version !== turnVersion) return;
      waitForHost();
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
      beginTurnTracking(player);
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
    clearPaceTimer();
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
        avatarId: player.avatarId,
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
      if (DATA.stopTypes.indexOf(destination.type) !== -1) {
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
      makeChoice("milestone", "A little life milestone", [
        { id: "happy", label: "+2 Happiness", detail: "Gain two ❤️ tokens." },
        { id: "knowledge-cash", label: "+1 Knowledge and +10K", detail: "Gain one 📖 token and 10K." }
      ], "next-turn");
      return;
    }
    if (space.type === "marriage") {
      const options = [];
      if (!player.married) {
        options.push({
          id: "marry",
          label: "Get married",
          detail: "+" + DATA.rules.marriageHappiness + " ❤️; every other connected player gives you " +
            DATA.rules.marriagePayment + "K."
        });
      }
      options.push({
        id: "stay-single",
        label: "Stay single",
        detail: "+" + DATA.rules.marriageStayKnowledge + " 📖 and +" +
          DATA.rules.marriageStayWealth + " 🐷."
      });
      makeChoice("marriage", "A wedding or your own path?", options, "bonus-spin");
      return;
    }
    if (space.type === "family") {
      makeChoice("family", "A new chapter", [
        { id: "family", label: "Start a family or adopt a pet", detail: "-" +
          DATA.rules.familyCost + "K, +" + DATA.rules.familyHappiness + " ❤️, +" +
          DATA.rules.familyKnowledge + " 📖." },
        { id: "adventure", label: "Keep adventuring", detail: "+" +
          DATA.rules.familyStayWealth + " 🐷 and +" + DATA.rules.familyStayCash + "K." }
      ], "bonus-spin");
      return;
    }
    if (space.type === "home") {
      makeChoice("home", "Choose a place to call home.", [
        {
          id: "apartment",
          label: "Cozy apartment",
          detail: "-" + DATA.rules.homeApartmentCost + "K, +" +
            DATA.rules.homeApartmentHappiness + " ❤️, +" + DATA.rules.homeApartmentWealth + " 🐷."
        },
        {
          id: "big-house",
          label: "Big house",
          detail: "-" + DATA.rules.homeHouseCost + "K, +" +
            DATA.rules.homeHouseHappiness + " ❤️, +" + DATA.rules.homeHouseWealth + " 🐷."
        },
        { id: "rent", label: "Keep renting", detail: "+" + DATA.rules.homeRentCash + "K." }
      ], "bonus-spin");
      return;
    }
    if (space.type === "second-chance") {
      makeChoice("second-chance", "A second chance", [
        { id: "raise", label: "Take a raise", detail: "+" + DATA.rules.secondChanceRaise + "K salary." },
        { id: "switch", label: "Switch careers", detail: "Choose a new career from the same field." },
        { id: "sabbatical", label: "Take a sabbatical", detail: "-" +
          DATA.rules.sabbaticalCost + "K, +" + DATA.rules.sabbaticalHappiness +
          " ❤️, +" + DATA.rules.sabbaticalKnowledge + " 📖." }
      ], "bonus-spin");
      return;
    }
    if (space.type === "bucket-list") {
      makeChoice("bucket-list", "Make room for a dream.", [
        {
          id: "adventure",
          label: "Big adventure",
          detail: "+" + DATA.rules.bucketAdventureHappiness + " ❤️, -" +
            DATA.rules.bucketAdventureCost + "K."
        },
        {
          id: "course",
          label: "Take a course",
          detail: "+" + DATA.rules.bucketCourseKnowledge + " 📖, -" +
            DATA.rules.bucketCourseCost + "K."
        },
        {
          id: "invest",
          label: "Invest",
          detail: "+" + DATA.rules.bucketInvestWealth + " 🐷, -" +
            DATA.rules.bucketInvestCost + "K."
        }
      ], "bonus-spin");
    }
  }

  function resolveLanding(player, space, version) {
    if (!space || version !== turnVersion || !isCurrentTurn(player.id)) return;
    if (state.turnProgress && state.turnProgress.playerId === player.id) {
      const legend = DATA.legendTypes[space.type];
      state.turnProgress.landing = legend ? legend.label : space.type;
    }
    if (space.type === "event" || space.type === "milestone" ||
        space.type === "marriage" || space.type === "family" ||
        space.type === "home" || space.type === "second-chance" ||
        space.type === "bucket-list") {
      createLandingChoice(player, space);
      publish();
      return;
    }
    if (space.type === "retirement") {
      retirePlayer(player);
      publish();
      scheduleTurnSummary(version, EFFECT_TIME);
      return;
    }
    if (space.type === "activity") {
      beginSpin(player.id, "lucky");
      return;
    }
    if (space.type === "opportunity") {
      const cash = player.career && player.career.kind === "degree" ? 30 : 20;
      player.cash += cash;
      state.phase = "resolving";
      setStatsAnimation([{ playerId: player.id, items: statsItems({ cash: cash }) }]);
      publish();
      scheduleTurnSummary(version, EFFECT_TIME);
      return;
    }
    if (space.type === "setback") {
      player.cash -= 20;
      state.phase = "resolving";
      setStatsAnimation([{ playerId: player.id, items: statsItems({ cash: -20 }) }]);
      publish();
      scheduleTurnSummary(version, EFFECT_TIME);
      return;
    }
    if (space.type === "boost") {
      state.phase = "moving";
      state.animation = null;
      publish();
      movePlayer(player, DATA.rules.boostSpaces, version);
      return;
    }
    state.phase = "resolving";
    state.animation = null;
    publish();
    scheduleTurnSummary(version, 100);
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
      scheduleTurnSummary(version, 100);
      return;
    }

    for (let index = 0; index < path.length; index += 1) {
      if (version !== turnVersion || !isCurrentTurn(player.id)) return;
      const destination = path[index];
      const previousPosition = player.position;
      player.position = destination.id;
      const changes = { cash: 0, wealth: 0, happiness: 0, knowledge: 0 };
      if (destination.type === "payday") {
        changes.cash = player.salary * DATA.PAYDAY_SCALE +
          (index === path.length - 1 ? DATA.rules.paydayLandingBonus : 0);
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
      await wait(hopDuration());
      if (version !== turnVersion || !isCurrentTurn(player.id)) return;
      if (DATA.stopTypes.indexOf(destination.type) !== -1) {
        resolveLanding(player, destination, version);
        return;
      }
    }
    resolveLanding(player, path[path.length - 1], version);
  }

  function wheelRotation(index, segmentCount) {
    const segmentCenter = -90 + (index + 0.5) * (360 / segmentCount);
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
    const spinNumbers = state.spinNumbers || DATA.gameLengths.standard.numbers;
    const segmentCount = kind === "lucky" ? DATA.luckySpinResults.length : spinNumbers.length;
    const resultIndex = Math.floor(Math.random() * segmentCount);
    const number = kind === "lucky" ? null : spinNumbers[resultIndex];
    if (kind !== "lucky" && state.turnProgress &&
        state.turnProgress.playerId === playerId) {
      state.turnProgress.spins.push(number);
    }
    state.phase = "spinning";
    state.bonusSpin = false;
    state.pendingDecision = null;
    state.currentSpin = {
      id: ++animationId,
      kind: kind,
      number: number,
      resultIndex: resultIndex,
      rotation: wheelRotation(resultIndex, segmentCount)
    };
    state.animation = null;
    locallyActed = false;
    publish();
    await wait(SPIN_TIME);
    if (version !== turnVersion || !isCurrentTurn(playerId)) return;

    const player = findPlayer(playerId);
    state.phase = "spin-result";
    publish();
    await wait(SPIN_RESULT_TIME);
    if (version !== turnVersion || !isCurrentTurn(playerId)) return;
    state.phase = "spin-fading";
    publish();
    await wait(SPIN_FADE_TIME);
    if (version !== turnVersion || !isCurrentTurn(playerId)) return;

    if (kind === "lucky") {
      const result = DATA.luckySpinResults[resultIndex];
      const items = applyEffects(player, result.effects);
      state.phase = "resolving";
      state.currentSpin = null;
      setStatsAnimation([{ playerId: player.id, items: items }]);
      publish();
      scheduleTurnSummary(version, EFFECT_TIME);
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
    const entrySteps = [];
    for (let index = 1; index <= DATA.collegeEntryIndex; index += 1) {
      entrySteps.push(DATA.spaces.find(function (space) {
        return space.id === "m" + index;
      }));
    }
    const route = entrySteps.concat(branch);
    for (let index = 0; index < route.length; index += 1) {
      if (version !== turnVersion || !isCurrentTurn(player.id)) return;
      const previousPosition = player.position;
      const space = route[index];
      player.position = space.id;
      let knowledge = 0;
      if (space.type === "college") {
        knowledge = DATA.collegeKnowledgePerSpace;
        player.tokens.knowledge += knowledge;
      }
      if (space.type === "graduation") {
        knowledge = DATA.collegeGraduationBonus;
        player.tokens.knowledge += knowledge;
      }
      state.phase = "moving";
      state.animation = {
        id: ++animationId,
        type: "hop",
        playerId: player.id,
        from: previousPosition,
        to: space.id,
        entries: knowledge
          ? [{ playerId: player.id, items: statsItems({ knowledge: knowledge }) }]
          : []
      };
      publish();
      await wait(hopDuration());
    }
    if (version !== turnVersion || !isCurrentTurn(player.id)) return;
    if (state.turnProgress && state.turnProgress.playerId === player.id) {
      state.turnProgress.landing = "Graduation";
    }
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
        state.bonusSpin = true;
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
      const effects = id === "happy"
        ? { happiness: 2 }
        : { cash: 10, knowledge: 1 };
      entries.push({ playerId: player.id, items: applyEffects(player, effects) });
    } else if (decision.kind === "marriage") {
      if (id === "marry" && !player.married) {
        player.married = true;
        const gifts = state.players.filter(function (otherPlayer) {
          return otherPlayer.id !== player.id && !otherPlayer.isLeft;
        }).length * DATA.rules.marriagePayment;
        entries.push({ playerId: player.id, items: applyEffects(player, {
          cash: gifts,
          happiness: DATA.rules.marriageHappiness
        }) });
        state.players.forEach(function (otherPlayer) {
          if (otherPlayer.id === player.id || otherPlayer.isLeft) return;
          otherPlayer.cash -= DATA.rules.marriagePayment;
          entries.push({ playerId: otherPlayer.id, items: statsItems({ cash: -DATA.rules.marriagePayment }) });
        });
      } else {
        entries.push({ playerId: player.id, items: applyEffects(player, {
          knowledge: DATA.rules.marriageStayKnowledge,
          wealth: DATA.rules.marriageStayWealth
        }) });
      }
      setBonusSpin(entries);
      return;
    } else if (decision.kind === "family") {
      const effects = id === "family"
        ? {
          cash: -DATA.rules.familyCost,
          happiness: DATA.rules.familyHappiness,
          knowledge: DATA.rules.familyKnowledge
        }
        : { cash: DATA.rules.familyStayCash, wealth: DATA.rules.familyStayWealth };
      entries.push({ playerId: player.id, items: applyEffects(player, effects) });
      setBonusSpin(entries);
      return;
    } else if (decision.kind === "home") {
      const effects = id === "apartment"
        ? {
          cash: -DATA.rules.homeApartmentCost,
          happiness: DATA.rules.homeApartmentHappiness,
          wealth: DATA.rules.homeApartmentWealth
        }
        : id === "big-house"
          ? {
            cash: -DATA.rules.homeHouseCost,
            happiness: DATA.rules.homeHouseHappiness,
            wealth: DATA.rules.homeHouseWealth
          }
          : { cash: DATA.rules.homeRentCash };
      entries.push({ playerId: player.id, items: applyEffects(player, effects) });
      setBonusSpin(entries);
      return;
    } else if (decision.kind === "second-chance") {
      if (id === "raise") {
        player.salary += DATA.rules.secondChanceRaise;
        entries.push({ playerId: player.id, items: statsItems({ salary: DATA.rules.secondChanceRaise }) });
        setBonusSpin(entries);
        return;
      }
      if (id === "switch") {
        const availableCareers = DATA.careers.filter(function (career) {
          return career.kind === player.career.kind && career.id !== player.career.id;
        });
        const careers = shuffle(availableCareers).slice(0, DATA.rules.careerSwitchChoices);
        makeChoice("career-pick", "Choose a new career.", careerOptions(careers, "career"), "career-switch");
        publish();
        return;
      }
      entries.push({ playerId: player.id, items: applyEffects(player, {
        cash: -DATA.rules.sabbaticalCost,
        happiness: DATA.rules.sabbaticalHappiness,
        knowledge: DATA.rules.sabbaticalKnowledge
      }) });
      setBonusSpin(entries);
      return;
    } else if (decision.kind === "bucket-list") {
      const effects = id === "adventure"
        ? { cash: -DATA.rules.bucketAdventureCost, happiness: DATA.rules.bucketAdventureHappiness }
        : id === "course"
          ? { cash: -DATA.rules.bucketCourseCost, knowledge: DATA.rules.bucketCourseKnowledge }
          : { cash: -DATA.rules.bucketInvestCost, wealth: DATA.rules.bucketInvestWealth };
      entries.push({ playerId: player.id, items: applyEffects(player, effects) });
      setBonusSpin(entries);
      return;
    }

    setStatsAnimation(entries);
    publish();
    scheduleTurnSummary(turnVersion, EFFECT_TIME);
  }

  function catmullRomPath(points) {
    if (points.length < 2) return "";
    let path = "M " + points[0][0] + " " + points[0][1];
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[Math.max(0, index - 1)];
      const start = points[index];
      const end = points[index + 1];
      const next = points[Math.min(points.length - 1, index + 2)];
      const firstControl = [
        start[0] + (end[0] - previous[0]) / 6,
        start[1] + (end[1] - previous[1]) / 6
      ];
      const secondControl = [
        end[0] - (next[0] - start[0]) / 6,
        end[1] - (next[1] - start[1]) / 6
      ];
      path += " C " + firstControl[0].toFixed(2) + " " + firstControl[1].toFixed(2) +
        " " + secondControl[0].toFixed(2) + " " + secondControl[1].toFixed(2) +
        " " + end[0] + " " + end[1];
    }
    return path;
  }

  function pointAt(path, distance) {
    const point = path.getPointAtLength(distance);
    return { x: point.x, y: point.y };
  }

  function segmentsCross(firstStart, firstEnd, secondStart, secondEnd) {
    function direction(start, end, point) {
      return (end.x - start.x) * (point.y - start.y) -
        (end.y - start.y) * (point.x - start.x);
    }
    return direction(firstStart, firstEnd, secondStart) *
      direction(firstStart, firstEnd, secondEnd) < 0 &&
      direction(secondStart, secondEnd, firstStart) *
      direction(secondStart, secondEnd, firstEnd) < 0;
  }

  function sampledSegments(path) {
    const length = path.getTotalLength();
    const count = Math.ceil(length / 18);
    const points = [];
    for (let index = 0; index <= count; index += 1) {
      points.push(pointAt(path, length * index / count));
    }
    return points.slice(1).map(function (point, index) {
      return { start: points[index], end: point };
    });
  }

  function checkBoardSpacing(mainPath, collegePath) {
    const mainSpaces = DATA.spaces.filter(function (space) {
      return space.id.charAt(0) === "m";
    });
    for (let first = 0; first < mainSpaces.length; first += 1) {
      for (let second = first + 2; second < mainSpaces.length; second += 1) {
        const dx = mainSpaces[first].x - mainSpaces[second].x;
        const dy = mainSpaces[first].y - mainSpaces[second].y;
        if (Math.sqrt(dx * dx + dy * dy) < 45) {
          console.warn("Life Path tiles " + first + " and " + second + " are too close.");
        }
      }
    }
    const branchSpaces = DATA.spaces.filter(function (space) {
      return space.id.charAt(0) === "c";
    });
    for (let first = 0; first < branchSpaces.length; first += 1) {
      for (let second = first + 2; second < branchSpaces.length; second += 1) {
        const dx = branchSpaces[first].x - branchSpaces[second].x;
        const dy = branchSpaces[first].y - branchSpaces[second].y;
        if (Math.sqrt(dx * dx + dy * dy) < 45) {
          console.warn("Life Path college tiles " + (first + 1) + " and " + (second + 1) + " are too close.");
        }
      }
    }
    branchSpaces.forEach(function (branchSpace, branchIndex) {
      mainSpaces.forEach(function (mainSpace, mainIndex) {
        if (mainIndex >= DATA.collegeEntryIndex - 1 && mainIndex <= DATA.collegeEntryIndex + 1) return;
        if (mainIndex >= DATA.collegeMergeIndex - 1 && mainIndex <= DATA.collegeMergeIndex + 1) return;
        const dx = branchSpace.x - mainSpace.x;
        const dy = branchSpace.y - mainSpace.y;
        if (Math.sqrt(dx * dx + dy * dy) < 45) {
          console.warn("Life Path college tile " + branchIndex + " is too close to main tile " + mainIndex + ".");
        }
      });
    });
    const mainSegments = sampledSegments(mainPath);
    const branchSegments = sampledSegments(collegePath);
    for (let first = 0; first < mainSegments.length; first += 1) {
      for (let second = first + 2; second < mainSegments.length; second += 1) {
        if (segmentsCross(mainSegments[first].start, mainSegments[first].end,
          mainSegments[second].start, mainSegments[second].end)) {
          console.warn("The Life Path main track crosses itself.");
          return;
        }
      }
    }
    for (let first = 0; first < branchSegments.length; first += 1) {
      if (first < 4 || first > branchSegments.length - 5) continue;
      for (let second = first + 2; second < branchSegments.length; second += 1) {
        if (segmentsCross(branchSegments[first].start, branchSegments[first].end,
          branchSegments[second].start, branchSegments[second].end)) {
          console.warn("The Life Path college branch crosses itself.");
          return;
        }
      }
      for (let mainIndex = 0; mainIndex < mainSegments.length; mainIndex += 1) {
        const fraction = (mainIndex + 0.5) / mainSegments.length;
        const nearJoin = Math.abs(fraction - DATA.collegeEntryIndex / (DATA.tileCodes.length - 1)) < 0.06 ||
          Math.abs(fraction - DATA.collegeMergeIndex / (DATA.tileCodes.length - 1)) < 0.06;
        if (nearJoin) continue;
        if (segmentsCross(branchSegments[first].start, branchSegments[first].end,
          mainSegments[mainIndex].start, mainSegments[mainIndex].end)) {
          console.warn("The Life Path college branch crosses the main track.");
          return;
        }
      }
    }
  }

  function measureBoardGeometry(container) {
    if (boardGeometry) return false;
    const mainPath = container.querySelector("[data-main-track]");
    const collegePath = container.querySelector("[data-college-track]");
    if (!mainPath || !collegePath || !mainPath.getTotalLength) return false;
    const mainLength = mainPath.getTotalLength();
    const mainSpaces = DATA.spaces.filter(function (space) {
      return space.id.charAt(0) === "m";
    });
    mainSpaces.forEach(function (space, index) {
      const distance = mainLength * index / (mainSpaces.length - 1);
      const before = pointAt(mainPath, Math.max(0, distance - 1));
      const after = pointAt(mainPath, Math.min(mainLength, distance + 1));
      const point = pointAt(mainPath, distance);
      space.x = point.x;
      space.y = point.y;
      space.angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
    });

    const entry = mainSpaces[DATA.collegeEntryIndex];
    const merge = mainSpaces[DATA.collegeMergeIndex];
    const collegeD = catmullRomPath([[entry.x, entry.y]].concat(DATA.collegeWaypoints, [[merge.x, merge.y]]));
    collegePath.setAttribute("d", collegeD);
    const collegeLength = collegePath.getTotalLength();
    const branchSpaces = DATA.spaces.filter(function (space) {
      return space.id.charAt(0) === "c";
    });
    branchSpaces.forEach(function (space, index) {
      const distance = collegeLength * (index + 1) / (branchSpaces.length + 1);
      const before = pointAt(collegePath, Math.max(0, distance - 1));
      const after = pointAt(collegePath, Math.min(collegeLength, distance + 1));
      const point = pointAt(collegePath, distance);
      space.x = point.x;
      space.y = point.y;
      space.angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
    });

    boardGeometry = {
      mainPath: catmullRomPath(DATA.mainWaypoints),
      collegePath: collegeD
    };
    checkBoardSpacing(mainPath, collegePath);
    sceneryMarkup = makeScenery();
    return true;
  }

  function seededRandom() {
    let seed = DATA.scenerySeed >>> 0;
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function makePropMarkup(prop) {
    const x = prop.x;
    const y = prop.y;
    if (prop.type === "tree-round") {
      return '<g transform="translate(' + x + ' ' + y + ')"><path d="M-4 19 L-2 0 L6 0 L8 19Z" fill="#a87555"/>' +
        '<circle cx="0" cy="-7" r="18" fill="#76a97e"/><circle cx="-12" cy="0" r="12" fill="#8cbd8e"/>' +
        '<circle cx="12" cy="0" r="12" fill="#689b73"/></g>';
    }
    if (prop.type === "tree-pointed") {
      return '<g transform="translate(' + x + ' ' + y + ')"><path d="M-3 19 L-1 0 L5 0 L7 19Z" fill="#a87555"/>' +
        '<path d="M0-29 L-20 1 L-9 1 L-24 16 L22 16 L8 1 L19 1Z" fill="#6c9d73" stroke="#8ebd8b" stroke-width="2"/></g>';
    }
    if (prop.type === "house") {
      return '<g transform="translate(' + x + ' ' + y + ')"><rect x="-18" y="-3" width="36" height="26" rx="4" fill="#fff3d4" stroke="#b37c68" stroke-width="2"/>' +
        '<path d="M-23-3 L0-22 L23-3Z" fill="#d98978" stroke="#b37c68" stroke-width="2"/>' +
        '<rect x="-5" y="7" width="10" height="16" rx="4" fill="#8baf91"/><rect x="-14" y="2" width="7" height="7" fill="#a9d8e6"/><rect x="7" y="2" width="7" height="7" fill="#a9d8e6"/></g>';
    }
    if (prop.type === "flowers") {
      return '<g transform="translate(' + x + ' ' + y + ')"><path d="M-20 8 Q0-3 21 9" fill="none" stroke="#6c9d73" stroke-width="3"/>' +
        '<circle cx="-11" cy="1" r="4" fill="#f3a5bf"/><circle cx="0" cy="-2" r="4" fill="#f5d365"/>' +
        '<circle cx="11" cy="2" r="4" fill="#c6a9e8"/><circle cx="-11" cy="1" r="1.5" fill="#fff8e9"/>' +
        '<circle cx="0" cy="-2" r="1.5" fill="#fff8e9"/><circle cx="11" cy="2" r="1.5" fill="#fff8e9"/></g>';
    }
    if (prop.type === "pond") {
      return '<g transform="translate(' + x + ' ' + y + ')"><ellipse rx="48" ry="25" fill="#9dd8df" stroke="#fff9e9" stroke-width="4"/>' +
        '<path d="M-27-4 Q-10-13 9-5 M-12 9 Q7 1 27 8" fill="none" stroke="#d8f3ec" stroke-width="3" stroke-linecap="round"/>' +
        '<ellipse cx="22" cy="-5" rx="7" ry="4" fill="#7ba988"/></g>';
    }
    if (prop.type === "windmill") {
      return '<g transform="translate(' + x + ' ' + y + ')"><path d="M-13 22 L-8-12 L8-12 L13 22Z" fill="#fff1d2" stroke="#b17f66" stroke-width="2"/>' +
        '<path d="M-17-12 L0-27 L17-12Z" fill="#d98978" stroke="#b17f66" stroke-width="2"/>' +
        '<circle r="4" fill="#8baf91"/><path d="M0-27V-4 M-18-12L-3-3 M18-12L3-3 M0 12L0 2" stroke="#8baf91" stroke-width="3" stroke-linecap="round"/></g>';
    }
    return '<g transform="translate(' + x + ' ' + y + ')"><ellipse cx="-5" cy="3" rx="13" ry="9" fill="#a9aba0"/>' +
      '<ellipse cx="7" cy="0" rx="12" ry="8" fill="#c2c2b5"/><path d="M-9-1Q-3-10 3-2" fill="none" stroke="#e9e9dc" stroke-width="2"/></g>';
  }

  function makeScenery() {
    const random = seededRandom();
    const placed = [];
    const occupied = DATA.spaces.map(function (space) {
      return { x: space.x, y: space.y, radius: 65 };
    });
    function place(type, count) {
      for (let item = 0; item < count; item += 1) {
        for (let attempt = 0; attempt < 1600; attempt += 1) {
          const prop = {
            type: type,
            x: 85 + random() * 1430,
            y: 75 + random() * 1550
          };
          if (prop.y > 615 && prop.y < 735) continue;
          const tooClose = occupied.some(function (other) {
            const dx = prop.x - other.x;
            const dy = prop.y - other.y;
            return Math.sqrt(dx * dx + dy * dy) < Math.max(48, other.radius);
          });
          if (tooClose) continue;
          placed.push(prop);
          occupied.push({ x: prop.x, y: prop.y, radius: 43 });
          break;
        }
      }
    }
    place("tree-round", Math.ceil(DATA.scenery.treeCount / 2));
    place("tree-pointed", Math.floor(DATA.scenery.treeCount / 2));
    place("house", DATA.scenery.houseCount);
    place("flowers", DATA.scenery.flowerCount);
    place("rock", DATA.scenery.rockCount);
    place("pond", DATA.scenery.pondCount);
    place("windmill", DATA.scenery.windmillCount);
    return placed.map(makePropMarkup).join("");
  }

  function renderLandmark(space) {
    const angle = (space.angle + 90) * Math.PI / 180;
    const x = space.x + Math.cos(angle) * 102;
    const y = space.y + Math.sin(angle) * 102;
    if (space.type === "marriage") {
      return '<g class="life-landmark" transform="translate(' + x + ' ' + y + ')"><path d="M-31 22V-4Q0-45 31-4V22" fill="none" stroke="#bd8193" stroke-width="8" stroke-linecap="round"/>' +
        '<circle cx="-23" cy="-14" r="6" fill="#f4a6c6"/><circle cx="0" cy="-36" r="6" fill="#f6d365"/><circle cx="23" cy="-14" r="6" fill="#f4a6c6"/>' +
        '<text x="0" y="42" text-anchor="middle" class="life-landmark-label">WEDDING ARCH</text></g>';
    }
    if (space.type === "family" || space.type === "home" ||
        space.type === "retirement") {
      const cabin = space.type === "retirement";
      const home = space.type === "home";
      return '<g class="life-landmark" transform="translate(' + x + ' ' + y + ')"><rect x="-28" y="-7" width="56" height="39" rx="5" fill="' +
        (cabin ? "#dfc19a" : home ? "#f5e1b8" : "#fff0ce") + '" stroke="#9e765b" stroke-width="3"/><path d="M-35-7L0-35L35-7Z" fill="' +
        (cabin ? "#a9755d" : home ? "#78a987" : "#d98978") + '" stroke="#9e765b" stroke-width="3"/><rect x="-7" y="7" width="14" height="25" rx="5" fill="#8eaa8b"/>' +
        (cabin ? '<path d="M-48-25H-17" stroke="#9a6e57" stroke-width="3"/><path d="M-48-25L-43-35L-38-25L-33-35L-28-25L-23-35L-18-25" fill="#d87567"/>' :
          home ? '<rect x="-22" y="1" width="10" height="10" fill="#a9d8e6"/><rect x="12" y="1" width="10" height="10" fill="#a9d8e6"/>' :
            '<circle cx="-42" cy="20" r="7" fill="#f4a6c6"/><circle cx="42" cy="18" r="7" fill="#f6d365"/>') +
        '<text x="0" y="47" text-anchor="middle" class="life-landmark-label">' +
        (cabin ? "PENNANT CABIN" : home ? "LITTLE HOME" : "GARDEN COTTAGE") + '</text></g>';
    }
    if (space.type === "second-chance") {
      return '<g class="life-landmark" transform="translate(' + x + ' ' + y + ')"><path d="M-26-16Q-24-45 0-48Q24-45 26-16L13-1H-13Z" fill="#f1b1a2" stroke="#fff6e8" stroke-width="3"/>' +
        '<path d="M-16-18H16 M-10-31H10" stroke="#fff4dd" stroke-width="4"/><path d="M-12-1L-6 14H6L12-1" fill="none" stroke="#8b765d" stroke-width="2"/>' +
        '<rect x="-8" y="14" width="16" height="13" rx="2" fill="#c99a68"/><text x="0" y="46" text-anchor="middle" class="life-landmark-label">FRESH START</text></g>';
    }
    if (space.type === "bucket-list") {
      return '<g class="life-landmark" transform="translate(' + x + ' ' + y + ')">' +
        '<path d="M-44 20L-18-20L8 20Z M-18-20L8 20L37-19L54 20Z" fill="#f3d9ae" stroke="#9b775e" stroke-width="3"/>' +
        '<path d="M-20 20V-3L-2 20 M10 20L36-12V20" fill="#d58c75" stroke="#9b775e" stroke-width="2"/>' +
        '<rect x="43" y="9" width="18" height="25" rx="4" fill="#bd8193" stroke="#fff4e5" stroke-width="2"/>' +
        '<path d="M47 9V3Q52-3 57 3V9" fill="none" stroke="#765c54" stroke-width="3"/>' +
        '<text x="0" y="48" text-anchor="middle" class="life-landmark-label">PACK YOUR BAG</text></g>';
    }
    return '<g class="life-landmark" transform="translate(' + x + ' ' + y + ')"><rect x="-36" y="-12" width="72" height="42" rx="5" fill="#fff0ce" stroke="#977f6b" stroke-width="3"/>' +
      '<path d="M-44-12L0-40L44-12Z" fill="#bd8193" stroke="#977f6b" stroke-width="3"/><rect x="-6" y="4" width="12" height="26" fill="#8eaa8b"/>' +
      '<rect x="-26" y="-2" width="9" height="10" fill="#a9d8e6"/><rect x="17" y="-2" width="9" height="10" fill="#a9d8e6"/>' +
      '<text x="0" y="46" text-anchor="middle" class="life-landmark-label">LITTLE SCHOOL</text></g>';
  }

  function renderTile(space) {
    const type = DATA.legendTypes[space.type];
    const start = space.type === "start";
    const rotation = Number(space.angle || 0).toFixed(2);
    const tile = start
      ? '<rect x="-43" y="-31" width="86" height="62" rx="17" fill="#f6d365" stroke="#fff" stroke-width="4"/>' +
        '<path d="M-31-23H31" stroke="#fff9dc" stroke-width="3" stroke-linecap="round"/>' +
        '<text x="0" y="6" text-anchor="middle" class="life-start-label">START</text>'
      : '<rect x="-26" y="-23" width="52" height="52" rx="14" fill="' + type.color +
        '" stroke="#fff" stroke-width="3"/><path d="M-16-16H16" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".72"/>' +
        '<text x="0" y="8" text-anchor="middle" class="life-tile-icon">' + escapeHTML(type.emoji) + '</text>';
    return '<g class="life-tile" transform="translate(' + space.x.toFixed(2) + ' ' +
      space.y.toFixed(2) + ') rotate(' + rotation + ')"><rect x="-26" y="-18" width="52" height="52" rx="13" fill="#456648" opacity=".2"/>' +
      tile + '</g>' + (DATA.stopTypes.indexOf(space.type) !== -1 ? renderStopSign(space) : "");
  }

  function renderStopSign(space) {
    const type = DATA.legendTypes[space.type];
    if (space.type === "retirement") {
      return '<g class="life-retirement-flag" transform="translate(' + space.x.toFixed(2) + ' ' +
        space.y.toFixed(2) + ')"><rect x="-57" y="-69" width="114" height="36" rx="5" fill="#fff" stroke="#e46c6c" stroke-width="3"/>' +
        '<rect x="-50" y="-62" width="100" height="18" fill="url(#life-checkers)"/>' +
        '<text x="0" y="-18" text-anchor="middle" class="life-stop-icon">🏁</text><text x="0" y="46" text-anchor="middle" class="life-stop-label">RETIREMENT</text></g>';
    }
    const points = "-40,-28 -28,-40 28,-40 40,-28 40,28 28,40 -28,40 -40,28";
    const label = space.type === "second-chance"
      ? "SECOND CHANCE"
      : space.type === "home"
        ? "HOME"
        : space.type === "bucket-list"
          ? "BUCKET LIST"
          : type.label.toUpperCase();
    return '<g class="life-stop-sign" transform="translate(' + space.x.toFixed(2) + ' ' +
      space.y.toFixed(2) + ')"><polygon points="' + points +
      '" fill="' + DATA.stopSignColor + '" stroke="#fff" stroke-width="4"/><text x="0" y="9" text-anchor="middle" class="life-stop-icon">' +
      escapeHTML(type.emoji) + '</text><text x="0" y="55" text-anchor="middle" class="life-stop-label">' +
      escapeHTML(label) + '</text></g>';
  }

  function renderMarker(player) {
    const space = DATA.spaces.find(function (entry) {
      return entry.id === player.position;
    });
    if (!space) return "";
    const sameSpace = state.players.filter(function (other) {
      return other.position === player.position;
    });
    const seat = sameSpace.indexOf(player);
    const offsetX = (seat - (sameSpace.length - 1) / 2) * 28;
    const isActive = player.id === state.currentPlayerId && !player.isLeft && !player.retired;
    const animation = state.animation && state.animation.type === "hop" &&
      state.animation.playerId === player.id ? state.animation : null;
    const from = animation && DATA.spaces.find(function (entry) {
      return entry.id === animation.from;
    });
    const startX = (from ? from.x : space.x) + offsetX;
    const startY = (from ? from.y : space.y) + 1;
    const moveX = space.x - (from ? from.x : space.x);
    const moveY = space.y - (from ? from.y : space.y);
    const move = animation
      ? '<animateTransform attributeName="transform" type="translate" from="0 0" to="' +
        moveX.toFixed(2) + ' ' + moveY.toFixed(2) + '" dur="' + hopDuration() +
        'ms" additive="sum" fill="freeze"/>'
      : "";
    const avatar = avatarEmoji(player.avatarId);
    return '<g class="life-marker' + (isActive ? " is-active" : "") +
      (player.isLeft ? " is-left" : "") + (player.retired ? " is-retired" : "") +
      '" style="--marker-color:' + escapeHTML(player.color) + '" transform="translate(' +
      startX.toFixed(2) + ' ' + startY.toFixed(2) + ')">' +
      move + '<g class="life-marker-bob"><ellipse cx="0" cy="1" rx="27" ry="8" fill="#405b45" opacity=".22"/>' +
      '<polygon points="-13,-28 13,-28 0,-3" fill="' + escapeHTML(player.color) + '"/>' +
      (isActive ? '<circle cx="0" cy="-61" r="39" fill="none" stroke="#fff0a8" stroke-width="5" opacity=".9"/>' : "") +
      '<g transform="scale(' + (isActive ? "1.08" : "1") + ')"><rect x="-32" y="-93" width="64" height="64" rx="19" fill="' + escapeHTML(player.color) +
      '" stroke="#fff" stroke-width="4"/><rect x="-27" y="-88" width="54" height="54" rx="15" fill="#fff" stroke="#fff" stroke-width="3"/>' +
      '<text x="0" y="-51" text-anchor="middle" dominant-baseline="middle" class="life-marker-avatar">' +
      escapeHTML(avatar) + '</text></g><text x="0" y="23" text-anchor="middle" class="life-marker-name">' +
      escapeHTML(player.name) + '</text></g></g>';
  }

  function renderBoard() {
    const path = catmullRomPath(DATA.mainWaypoints);
    const collegePath = boardGeometry ? boardGeometry.collegePath : "";
    const tiles = boardGeometry ? DATA.spaces.map(renderTile).join("") : "";
    const landmarks = boardGeometry ? DATA.spaces.filter(function (space) {
      return DATA.stopTypes.indexOf(space.type) !== -1;
    }).map(renderLandmark).join("") : "";
    const markers = boardGeometry ? state.players.map(renderMarker).join("") : "";
    const river = catmullRomPath(DATA.scenery.riverWaypoints);
    const board = '<svg class="life-board-svg" viewBox="' + DATA.viewBox +
      '" role="img" aria-label="Life Path illustrated winding board" data-life-board>' +
      '<defs><linearGradient id="life-island" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6d6a6"/><stop offset="1" stop-color="#83b784"/></linearGradient>' +
      '<linearGradient id="life-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8e3df"/><stop offset="1" stop-color="#91d1d1"/></linearGradient>' +
      '<pattern id="life-checkers" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#e46c6c"/><rect x="6" y="6" width="6" height="6" fill="#e46c6c"/></pattern>' +
      '</defs><g class="life-camera-layer" transform="translate(' + camera.x.toFixed(2) + ' ' +
      camera.y.toFixed(2) + ') scale(' + camera.zoom.toFixed(3) + ')">' +
      '<rect class="life-water-backdrop" x="0" y="0" width="' + BOARD_WIDTH + '" height="' + BOARD_HEIGHT + '" fill="url(#life-water)"/>' +
      '<rect class="life-island" x="21" y="20" width="1558" height="1660" rx="118" fill="url(#life-island)" stroke="#668f70" stroke-width="17"/>' +
      '<rect x="33" y="32" width="1534" height="1636" rx="108" fill="none" stroke="#d5e7c7" stroke-width="4" opacity=".85"/>' +
      '<path d="' + river + '" class="life-river"/><path d="' + river + '" class="life-river-shine"/>' +
      '<g class="life-props">' + (sceneryMarkup || "") + '</g>' +
      '<g class="life-bridge" transform="translate(1480 650) rotate(-45)"><rect x="-71" y="-19" width="142" height="38" rx="7" fill="#9a704f" stroke="#fff0d3" stroke-width="4"/>' +
      '<path d="M-55-15V15 M-32-15V15 M-9-15V15 M14-15V15 M37-15V15 M60-15V15" stroke="#d4aa75" stroke-width="5"/>' +
      '<path d="M-69-22H69 M-69 22H69" stroke="#76563f" stroke-width="5"/></g>' +
      landmarks + '<path d="' + path + '" class="life-track-shadow"/><path d="' + path +
      '" class="life-track-road"/><path d="' + path + '" class="life-track-center"/>' +
      '<path d="' + collegePath + '" class="life-track-shadow"/><path d="' + collegePath +
      '" class="life-track-road"/><path d="' + collegePath + '" class="life-track-center"/>' +
      '<path d="' + path + '" fill="none" stroke="transparent" stroke-width="1" data-main-track/>' +
      '<path d="' + collegePath + '" fill="none" stroke="transparent" stroke-width="1" data-college-track/>' +
      '<g class="life-tiles">' + tiles + '</g><g class="life-markers">' + markers + '</g></g></svg>';
    const legend = legendOpen
      ? '<div class="life-legend-backdrop"><section class="life-legend" role="dialog" aria-modal="true">' +
        '<button type="button" class="life-legend-close" data-legend-close aria-label="Close legend">×</button>' +
        '<h3>Board guide</h3><div class="life-legend-list">' +
        Object.keys(DATA.legendTypes).map(function (key) {
          const item = DATA.legendTypes[key];
          return '<div class="life-legend-item"><span style="--legend-color:' + item.color + '">' +
            escapeHTML(item.emoji) + '</span><div><strong>' + escapeHTML(item.label) +
            '</strong><small>' + escapeHTML(item.description) + '</small></div></div>';
        }).join("") + '</div></section></div>'
      : "";
    return '<div class="life-board-column"><div class="life-board-canvas">' + board +
      renderHud() + renderMinimap() +
      '<div class="life-camera-controls"><button type="button" data-zoom-out aria-label="Zoom out">−</button>' +
      '<button type="button" data-zoom-in aria-label="Zoom in">+</button>' +
      '<button type="button" data-camera-fit>Fit board</button></div>' +
      '<button class="life-legend-button" type="button" data-legend-open aria-label="Show board legend">?</button>' +
      (state.phase !== "choosing-length" && currentContext && currentContext.isHost &&
        window.location.hash === "#debug" ? renderDebugPanel() : "") +
      (state.phase === "choosing" ? renderChoicePopup(activePlayer(), activePlayer() &&
        activePlayer().id === localPlayerId) : "") +
      renderTurnBanner() + legend + '</div></div>';
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
      (!canChoose ? '<p class="life-watch-note">' + escapeHTML(player ? player.name : "Player") + ' is choosing…</p>' : "") +
      '<div class="life-choice-list">' + options + '</div></section></div>';
  }

  function formatMoney(value) {
    return value + "k";
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

  function tokenLeaders() {
    const leaders = { wealth: [], happiness: [], knowledge: [] };
    const connected = state.players.filter(function (player) {
      return !player.isLeft;
    });
    ["wealth", "happiness", "knowledge"].forEach(function (kind) {
      const maximum = connected.reduce(function (current, player) {
        return Math.max(current, player.tokens[kind]);
      }, 0);
      if (maximum < 1) return;
      leaders[kind] = connected.filter(function (player) {
        return player.tokens[kind] === maximum;
      }).map(function (player) {
        return player.id;
      });
    });
    return leaders;
  }

  function renderPlayerCard(player, index, leaders) {
    const active = player.id === state.currentPlayerId && !player.isLeft && !player.retired;
    const tag = player.isLeft
      ? "Left"
      : player.retired ? "Retired #" + player.finishPlace : "";
    function chip(kind, emoji) {
      return '<span class="life-token-chip">' + emoji + ' ' + player.tokens[kind] +
        (leaders[kind].indexOf(player.id) !== -1 ? ' <b aria-label="Most tokens">👑</b>' : "") + '</span>';
    }
    const career = player.career ? player.career.name : "Choosing a path";
    return '<article class="life-player-card' + (active ? " is-active" : "") +
      (player.isLeft ? " is-left" : "") + (player.retired ? " is-retired" : "") +
      '" style="--player-color:' + escapeHTML(player.color) + '"><div class="life-player-card-inner">' +
      '<div class="life-hud-heading"><span class="life-avatar">' + avatarEmoji(player.avatarId) +
      '</span><strong>' + escapeHTML(player.name) + '</strong>' +
      (tag ? '<small class="life-player-tag">' + escapeHTML(tag) + '</small>' : "") + '</div>' +
      '<div class="life-hud-career">💼 ' + escapeHTML(career) + '</div>' +
      '<div class="life-hud-cash">💵 <strong>' + formatMoney(player.cash) + '</strong></div>' +
      '<div class="life-hud-chips">' + chip("happiness", "❤️") + chip("knowledge", "📖") +
      chip("wealth", "🐷") + '</div></div>' + renderFloats(player.id) + '</article>';
  }

  function renderHud() {
    const leaders = tokenLeaders();
    return '<div class="life-hud" aria-label="Player cards">' +
      state.players.map(function (player, index) {
        return renderPlayerCard(player, index, leaders);
      }).join("") + '</div>';
  }

  function cameraBounds() {
    const zoom = Math.max(0.5, Math.min(2.5, camera.zoom));
    const width = BOARD_WIDTH / zoom;
    const height = BOARD_HEIGHT / zoom;
    return {
      x: -camera.x / zoom,
      y: -camera.y / zoom,
      width: width,
      height: height
    };
  }

  function renderMinimap() {
    if (!boardGeometry) return "";
    const dots = state.players.map(function (player) {
      const space = DATA.spaces.find(function (entry) {
        return entry.id === player.position;
      });
      if (!space) return "";
      const together = state.players.filter(function (other) {
        return other.position === player.position;
      });
      const seat = together.indexOf(player);
      const angle = seat / together.length * Math.PI * 2;
      const offset = together.length > 1 ? 34 : 0;
      const x = space.x + Math.cos(angle) * offset;
      const y = space.y + Math.sin(angle) * offset;
      return '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) +
        '" r="16" fill="' + escapeHTML(player.color) + '" stroke="#fff" stroke-width="7"' +
        (player.isLeft ? ' opacity=".45"' : "") + '/><text x="' + x.toFixed(2) +
        '" y="' + y.toFixed(2) + '" text-anchor="middle" dominant-baseline="central" font-size="34">' +
        escapeHTML(avatarEmoji(player.avatarId)) + '</text>';
    }).join("");
    const bounds = cameraBounds();
    return '<button class="life-minimap" type="button" data-life-minimap aria-label="Jump the board camera using the minimap">' +
      '<svg viewBox="0 0 ' + BOARD_WIDTH + ' ' + BOARD_HEIGHT + '" aria-hidden="true">' +
      '<rect width="' + BOARD_WIDTH + '" height="' + BOARD_HEIGHT + '" rx="90" fill="#d4e6cc"/>' +
      '<path d="' + boardGeometry.mainPath + '" fill="none" stroke="#f0dfb6" stroke-width="78" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + boardGeometry.collegePath + '" fill="none" stroke="#c5b7df" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>' +
      dots + '<rect data-minimap-view x="' + bounds.x.toFixed(2) + '" y="' +
      bounds.y.toFixed(2) + '" width="' + bounds.width.toFixed(2) + '" height="' +
      bounds.height.toFixed(2) + '" fill="#fff" fill-opacity=".12" stroke="#446f53" stroke-width="12" rx="18"/>' +
      '</svg></button>';
  }

  function updateMinimap(container) {
    const rect = container.querySelector("[data-minimap-view]");
    if (!rect) return;
    const bounds = cameraBounds();
    rect.setAttribute("x", bounds.x.toFixed(2));
    rect.setAttribute("y", bounds.y.toFixed(2));
    rect.setAttribute("width", bounds.width.toFixed(2));
    rect.setAttribute("height", bounds.height.toFixed(2));
  }

  function renderTurnBanner() {
    const player = activePlayer();
    if (state.phase === "finished") return "";
    const localTurn = Boolean(player && player.id === localPlayerId && !player.isLeft && !player.retired);
    const text = localTurn
      ? "Your turn!"
      : player && ["spinning", "spin-result", "spin-fading"].indexOf(state.phase) !== -1
        ? player.name + " is spinning…"
        : player && state.phase === "choosing"
          ? player.name + " is choosing…"
          : player
            ? player.name + " is taking a turn"
            : "Life Path";
    return '<div class="life-turn-banner' + (localTurn ? " is-your-turn" : "") +
      '">' + escapeHTML(text) + '</div>';
  }

  function spinWheel({ title, segments, resultIndex, rotation, phase, canSpin, buttonLabel, resultLabel }) {
    const center = 100;
    const radius = 94;
    const segmentAngle = 360 / segments.length;
    const slices = segments.map(function (segment, index) {
      const startAngle = (-90 + index * segmentAngle) * Math.PI / 180;
      const endAngle = (-90 + (index + 1) * segmentAngle) * Math.PI / 180;
      const midAngle = (startAngle + endAngle) / 2;
      const x1 = center + Math.cos(startAngle) * radius;
      const y1 = center + Math.sin(startAngle) * radius;
      const x2 = center + Math.cos(endAngle) * radius;
      const y2 = center + Math.sin(endAngle) * radius;
      const labelX = center + Math.cos(midAngle) * 62;
      const labelY = center + Math.sin(midAngle) * 62;
      const winning = resultIndex === index &&
        (phase === "spin-result" || phase === "spin-fading");
      return '<g class="' + (winning ? "is-winning" : "") + '"><path d="M ' + center + ' ' +
        center + ' L ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A ' + radius + ' ' +
        radius + ' 0 0 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z" fill="' +
        escapeHTML(segment.color) + '" stroke="#fff9e9" stroke-width="2"/><text x="' +
        labelX.toFixed(2) + '" y="' + labelY.toFixed(2) +
        '" text-anchor="middle" dominant-baseline="middle">' + escapeHTML(segment.label) + '</text></g>';
    }).join("");
    const isSpinning = phase === "spinning";
    const isFading = phase === "spin-fading";
    const button = phase === "awaiting-spin"
      ? '<button type="button" class="life-wheel-button" data-spin' +
        (canSpin ? "" : " disabled") + '>' + escapeHTML(buttonLabel) + '</button>'
      : "";
    const result = resultIndex === null || resultIndex === undefined
      ? ""
      : '<div class="life-wheel-result' + (phase === "spin-result" ? " is-visible" : "") +
        '">' + escapeHTML(resultLabel) + '</div>';
    return '<div class="life-spin-overlay"><section class="life-wheel-screen" role="dialog" aria-modal="true">' +
      '<div class="life-wheel-heading"><span>' + escapeHTML(title.avatar) + '</span><strong>' +
      escapeHTML(title.text) + '</strong></div><div class="life-wheel-shell' +
      (isFading ? " is-fading" : "") + '"><span class="life-wheel-pointer' +
      (isSpinning ? " is-ticking" : "") + '">▼</span><svg class="life-wheel-svg' +
      (isSpinning ? " is-spinning" : "") + '" style="--wheel-turn:' + Number(rotation || 0) +
      'deg" viewBox="0 0 200 200" role="img" aria-label="' + escapeHTML(title.description) +
      '">' + slices + '<circle cx="100" cy="100" r="14" fill="#fffaf0" stroke="#718c70" stroke-width="3"/></svg>' +
      button + result + '</div><p class="life-wheel-caption">' +
      (phase === "awaiting-spin" ? "Tap the wheel or press Space" : escapeHTML(title.caption)) +
      '</p></section></div>';
  }

  function renderSpinner(canAct) {
    const spinning = ["spinning", "spin-result", "spin-fading"].indexOf(state.phase) !== -1;
    const spin = state.currentSpin;
    const kind = spin ? spin.kind : "normal";
    const segments = kind === "lucky"
      ? DATA.luckySpinResults.map(function (result, index) {
        return { label: result.label, color: DATA.wheelColors[index % DATA.wheelColors.length] };
      })
      : (state.spinNumbers || DATA.gameLengths.standard.numbers).map(function (number, index) {
        return { label: String(number), color: DATA.wheelColors[index % DATA.wheelColors.length] };
      });
    const player = activePlayer();
    const playerIndex = Math.max(0, state.players.indexOf(player));
    const titleText = canAct
      ? "Your turn!"
      : player && spinning
        ? player.name + " is spinning…"
        : player
          ? player.name + " is about to spin…"
          : "The wheel is ready";
    const phase = spinning ? state.phase : "awaiting-spin";
    const resultLabel = spin
      ? kind === "lucky"
        ? DATA.luckySpinResults[spin.resultIndex].label
        : String(spin.number)
      : "";
    return spinWheel({
      title: {
        text: titleText,
        avatar: avatarEmoji(player.avatarId),
        description: kind === "lucky" ? "Lucky Spin reward wheel" : "Number wheel",
        caption: kind === "lucky" ? "An activity reward is on its way!" : "The number moves you along the path."
      },
      segments: segments,
      resultIndex: spin ? spin.resultIndex : null,
      rotation: spin ? spin.rotation : 0,
      phase: phase,
      canSpin: canAct && state.phase === "awaiting-spin" && !locallyActed,
      buttonLabel: "SPIN",
      resultLabel: resultLabel
    });
  }

  function renderDebugPanel() {
    return '<div class="life-debug-panel"><label>Tile # <input type="number" min="0" max="99" value="0" data-debug-tile></label>' +
      '<button type="button" data-debug-next-stop>Jump to next Stop</button>' +
      '<button type="button" data-debug-jump>Jump active player to tile #</button>' +
      '<button type="button" data-debug-cash>Give active player 100K</button></div>';
  }

  function renderGameLengthChoice(isHost) {
    if (!isHost) {
      return '<div class="life-length-overlay"><section class="life-length-card">' +
        '<p>The host is choosing the game length...</p></section></div>';
    }
    const choices = Object.keys(DATA.gameLengths).map(function (key) {
      const option = DATA.gameLengths[key];
      return '<button type="button" class="life-length-choice' +
        (key === "standard" ? " is-default" : "") + '" data-game-length="' +
        escapeHTML(key) + '"><strong>' + escapeHTML(option.label) +
        '</strong><small>Wheel: 1 to ' + option.numbers.length + '</small>' +
        (key === "standard" ? '<em>Default</em>' : "") + '</button>';
    }).join("");
    return '<div class="life-length-overlay"><section class="life-length-card" role="dialog" aria-modal="true">' +
      '<p class="life-popup-eyebrow">Game setup</p><h3>How long should the game be?</h3>' +
      '<div class="life-length-choices">' + choices + '</div></section></div>';
  }

  function renderPaceControl() {
    const pace = state.pace || "manual";
    if (!currentContext || !currentContext.isHost) {
      const label = pace === "auto5" ? "Auto 5s" : pace === "auto10" ? "Auto 10s" : "Manual";
      return '<span class="life-pace-tag">Pace: ' + label + '</span>';
    }
    return '<label class="life-pace-control"><span>PACE</span><select data-life-pace>' +
      '<option value="manual"' + (pace === "manual" ? " selected" : "") + '>Manual</option>' +
      '<option value="auto5"' + (pace === "auto5" ? " selected" : "") + '>Auto 5s</option>' +
      '<option value="auto10"' + (pace === "auto10" ? " selected" : "") + '>Auto 10s</option>' +
      '</select></label>';
  }

  function renderTurnSummary() {
    const summary = state.turnSummary;
    if (state.phase !== "waiting-host" || !summary) return "";
    const chips = summary.changes.length
      ? summary.changes.map(function (change) {
        return '<span class="life-summary-chip is-' + escapeHTML(change.kind) + '">' +
          escapeHTML(change.text) + '</span>';
      }).join("")
      : '<span class="life-summary-no-change">No stat changes this turn.</span>';
    const isHost = Boolean(currentContext && currentContext.isHost);
    const duration = state.countdownDuration || 0;
    const elapsed = state.countdownStartedAt
      ? Math.min(duration, Math.max(0, Date.now() - state.countdownStartedAt))
      : 0;
    const countdown = duration
      ? '<div class="life-summary-countdown" role="progressbar" aria-label="Time until next turn" ' +
        'aria-valuemin="0" aria-valuemax="' + duration + '" aria-valuenow="' + elapsed + '">' +
        '<span style="--countdown-duration:' + duration + 'ms;--countdown-delay:-' +
        elapsed + 'ms"></span></div>'
      : "";
    return '<section class="life-turn-summary" style="--player-color:' +
      escapeHTML(summary.color) + '"><div class="life-summary-player"><span>' +
      escapeHTML(avatarEmoji(summary.avatarId)) + '</span><strong>' +
      escapeHTML(summary.name) + '</strong></div><p>' + escapeHTML(summary.sentence) +
      '</p><div class="life-summary-chips">' + chips + '</div>' + countdown +
      (isHost
        ? '<button type="button" class="life-next-turn" data-next-turn="' +
          state.advanceStep + '">Next turn</button>'
        : '<small class="life-summary-waiting">Waiting for the host...</small>') +
      '</section>';
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
        '<strong>' + escapeHTML(avatarEmoji(result.avatarId)) + ' ' + escapeHTML(result.name) + '</strong>' +
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
    const spinner = state.phase === "awaiting-spin" ||
      ["spinning", "spin-result", "spin-fading"].indexOf(state.phase) !== -1
      ? renderSpinner(canAct)
      : "";
    return '<div class="life-game' + (fastAnimations ? " is-fast-animations" : "") +
      '"><div class="life-topbar"><div>' +
      '<p class="life-eyebrow">A cozy game of choices</p><h3>Life Path</h3></div>' +
      '<div class="life-topbar-tools">' +
      (state.gameLength ? '<span class="life-length-tag">' +
        escapeHTML(DATA.gameLengths[state.gameLength].label) + '</span>' : "") +
      renderPaceControl() +
      '<button class="life-fast-toggle" type="button" data-fast-toggle aria-pressed="' +
      String(fastAnimations) + '">Fast animations: ' + (fastAnimations ? "On" : "Off") +
      '</button></div></div>' +
      '<div class="life-layout">' + renderBoard() + '</div>' + spinner +
      renderTurnSummary() +
      (state.phase === "choosing-length"
        ? renderGameLengthChoice(Boolean(currentContext && currentContext.isHost))
        : "") +
      (state.phase === "choosing" && player && !canAct
        ? '<p class="life-choice-waiting">' + escapeHTML(player.name) + ' is choosing…</p>'
        : "") +
      (state.phase === "finished" ? renderResults() : "") + '</div>';
  }

  function applyCamera(container) {
    camera.zoom = Math.max(0.5, Math.min(2.5, camera.zoom));
    if (camera.zoom >= 1) {
      camera.x = Math.max(BOARD_WIDTH * (1 - camera.zoom), Math.min(0, camera.x));
      camera.y = Math.max(BOARD_HEIGHT * (1 - camera.zoom), Math.min(0, camera.y));
    } else {
      camera.x = BOARD_WIDTH * (1 - camera.zoom) / 2;
      camera.y = BOARD_HEIGHT * (1 - camera.zoom) / 2;
    }
    const layer = container.querySelector(".life-camera-layer");
    if (layer) {
      layer.setAttribute("transform", "translate(" + camera.x.toFixed(2) + " " +
        camera.y.toFixed(2) + ") scale(" + camera.zoom.toFixed(3) + ")");
    }
    updateMinimap(container);
  }

  function centerCameraOn(space) {
    if (!space) return;
    camera.zoom = 1.6;
    camera.x = BOARD_WIDTH / 2 - space.x * camera.zoom;
    camera.y = BOARD_HEIGHT / 2 - space.y * camera.zoom;
    const board = document.querySelector("[data-life-board]");
    if (board) applyCamera(board.parentNode);
  }

  function pauseAutoFollow() {
    camera.autoFollowUntil = Date.now() + 5000;
    if (cameraResumeTimer) clearTimeout(cameraResumeTimer);
    cameraResumeTimer = setTimeout(function () {
      cameraResumeTimer = null;
      const player = activePlayer();
      if (player) centerCameraOn(DATA.spaces.find(function (space) {
        return space.id === player.position;
      }));
    }, 5000);
  }

  function svgPoint(svg, event) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }

  function clampZoom(value) {
    return Math.max(0.5, Math.min(2.5, value));
  }

  function zoomAt(svg, point, nextZoom) {
    const zoom = clampZoom(nextZoom);
    const anchorX = (point.x - camera.x) / camera.zoom;
    const anchorY = (point.y - camera.y) / camera.zoom;
    camera.zoom = zoom;
    camera.x = point.x - anchorX * zoom;
    camera.y = point.y - anchorY * zoom;
  }

  function installCamera(container) {
    const svg = container.querySelector("[data-life-board]");
    if (!svg) return;
    const pointers = new Map();
    let gesture = null;
    function pointForPointer(pointer) {
      return svgPoint(svg, pointer);
    }
    function midpoint(first, second) {
      return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    }
    function distance(first, second) {
      const dx = first.x - second.x;
      const dy = first.y - second.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    svg.addEventListener("pointerdown", function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (pointers.size === 1) {
        const point = svgPoint(svg, event);
        gesture = { type: "pan", point: point, x: camera.x, y: camera.y };
      } else if (pointers.size === 2) {
        const points = Array.from(pointers.values()).map(pointForPointer);
        const middle = midpoint(points[0], points[1]);
        gesture = {
          type: "pinch",
          distance: distance(points[0], points[1]),
          zoom: camera.zoom,
          anchorX: (middle.x - camera.x) / camera.zoom,
          anchorY: (middle.y - camera.y) / camera.zoom
        };
      }
    });
    svg.addEventListener("pointermove", function (event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      if (pointers.size === 1 && gesture && gesture.type === "pan") {
        const point = svgPoint(svg, event);
        camera.x = gesture.x + point.x - gesture.point.x;
        camera.y = gesture.y + point.y - gesture.point.y;
        pauseAutoFollow();
      } else if (pointers.size >= 2 && gesture && gesture.type === "pinch") {
        const points = Array.from(pointers.values()).slice(0, 2).map(pointForPointer);
        const middle = midpoint(points[0], points[1]);
        camera.zoom = clampZoom(gesture.zoom * distance(points[0], points[1]) / gesture.distance);
        camera.x = middle.x - gesture.anchorX * camera.zoom;
        camera.y = middle.y - gesture.anchorY * camera.zoom;
        pauseAutoFollow();
      }
      applyCamera(container);
    });
    function endPointer(event) {
      pointers.delete(event.pointerId);
      gesture = null;
      if (pointers.size === 1) {
        const remaining = Array.from(pointers.values())[0];
        const point = svgPoint(svg, remaining);
        gesture = { type: "pan", point: point, x: camera.x, y: camera.y };
      }
    }
    svg.addEventListener("pointerup", endPointer);
    svg.addEventListener("pointercancel", endPointer);
    svg.addEventListener("wheel", function (event) {
      event.preventDefault();
      zoomAt(svg, svgPoint(svg, event), camera.zoom * (event.deltaY < 0 ? 1.12 : 0.89));
      pauseAutoFollow();
      applyCamera(container);
    }, { passive: false });

    container.querySelectorAll("[data-zoom-in], [data-zoom-out]").forEach(function (button) {
      button.addEventListener("click", function () {
        const factor = button.hasAttribute("data-zoom-in") ? 1.2 : 1 / 1.2;
        zoomAt(svg, { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 }, camera.zoom * factor);
        pauseAutoFollow();
        applyCamera(container);
      });
    });
    container.querySelector("[data-camera-fit]").addEventListener("click", function () {
      camera.x = 0;
      camera.y = 0;
      camera.zoom = 1;
      pauseAutoFollow();
      applyCamera(container);
    });
    const minimap = container.querySelector("[data-life-minimap]");
    if (minimap) {
      minimap.addEventListener("click", function (event) {
        const svg = minimap.querySelector("svg");
        const point = svgPoint(svg, event);
        camera.x = BOARD_WIDTH / 2 - point.x * camera.zoom;
        camera.y = BOARD_HEIGHT / 2 - point.y * camera.zoom;
        pauseAutoFollow();
        applyCamera(container);
      });
    }

    const player = activePlayer();
    const key = player ? player.id + ":" + player.position : "";
    if (key && key !== camera.followKey) {
      camera.followKey = key;
      if (Date.now() >= camera.autoFollowUntil) {
        centerCameraOn(DATA.spaces.find(function (space) {
          return space.id === player.position;
        }));
      }
    }
  }

  function installKeyboardSpin() {
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    keyHandler = function (event) {
      if (event.code !== "Space" || event.repeat || !document.querySelector(".life-game") || !state ||
          state.phase !== "awaiting-spin" || !isCurrentTurn(localPlayerId) ||
          event.target.closest("button, input, textarea, select")) return;
      const button = document.querySelector("[data-spin]");
      if (button && !button.disabled) {
        event.preventDefault();
        button.click();
      }
    };
    document.addEventListener("keydown", keyHandler);
  }

  function installDebugControls(container, context) {
    if (window.location.hash !== "#debug" || !context.isHost || !state.gameLength) return;
    const jump = container.querySelector("[data-debug-jump]");
    const giveCash = container.querySelector("[data-debug-cash]");
    const nextStop = container.querySelector("[data-debug-next-stop]");
    const tileInput = container.querySelector("[data-debug-tile]");
    if (!jump || !giveCash || !nextStop || !tileInput) return;
    jump.addEventListener("click", function () {
      if (window.location.hash !== "#debug" || !context.isHost) return;
      const tile = Number(tileInput.value);
      const player = activePlayer();
      if (!player || state.phase === "finished" || !Number.isInteger(tile) ||
          tile < 0 || tile >= DATA.tileCodes.length) return;
      turnVersion += 1;
      player.position = "m" + tile;
      state.currentSpin = null;
      state.animation = null;
      if (player.started) {
        state.phase = "awaiting-spin";
        state.pendingDecision = null;
      } else {
        makeFirstChoice(player);
      }
      publish();
    });
    nextStop.addEventListener("click", function () {
      if (window.location.hash !== "#debug" || !context.isHost ||
          !state.gameLength || state.phase === "finished") return;
      const player = activePlayer();
      if (!player || player.isLeft || player.retired) return;
      const currentIndex = player.position.charAt(0) === "m"
        ? Number(player.position.slice(1))
        : -1;
      const mainStops = DATA.spaces.filter(function (space) {
        return space.id.charAt(0) === "m" && DATA.stopTypes.indexOf(space.type) !== -1;
      });
      const destination = mainStops.find(function (space) {
        return Number(space.id.slice(1)) > currentIndex;
      }) || mainStops[0];
      turnVersion += 1;
      player.position = destination.id;
      state.currentSpin = null;
      state.pendingDecision = null;
      state.animation = null;
      state.phase = "moving";
      resolveLanding(player, destination, turnVersion);
    });
    giveCash.addEventListener("click", function () {
      if (window.location.hash !== "#debug" || !context.isHost) return;
      const player = activePlayer();
      if (!player) return;
      player.cash += 100;
      setStatsAnimation([{ playerId: player.id, items: statsItems({ cash: 100 }) }]);
      publish();
    });
  }

  function animateResultTotals(container) {
    if (resultsCounted || !container.querySelector(".life-results")) return;
    resultsCounted = true;
    const totals = container.querySelectorAll("[data-total]");
    const start = Date.now();
    const duration = fastAnimations ? 475 : 950;
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
    if (measureBoardGeometry(container)) {
      context.render();
      return;
    }
    animateResultTotals(container);
    installCamera(container);
    installKeyboardSpin();
    installDebugControls(container, context);
    const lengthButtons = container.querySelectorAll("[data-game-length]");
    lengthButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        if (!context.isHost || state.phase !== "choosing-length") return;
        const length = button.getAttribute("data-game-length");
        if (!Object.prototype.hasOwnProperty.call(DATA.gameLengths, length)) return;
        state.gameLength = length;
        state.spinNumbers = DATA.gameLengths[length].numbers.slice();
        state.phase = "choosing";
        makeFirstChoice(activePlayer());
        publish();
      });
    });
    const fastToggle = container.querySelector("[data-fast-toggle]");
    if (fastToggle) {
      fastToggle.addEventListener("click", function () {
        fastAnimations = !fastAnimations;
        saveFastAnimations();
        context.render();
      });
    }
    const paceSelect = container.querySelector("[data-life-pace]");
    if (paceSelect) {
      paceSelect.addEventListener("change", function () {
        if (!context.isHost) return;
        context.sendAction({ type: "pace", pace: paceSelect.value });
      });
    }
    container.querySelectorAll("[data-next-turn]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!context.isHost || !state || state.phase !== "waiting-host") return;
        context.sendAction({
          type: "next-turn",
          step: Number(button.getAttribute("data-next-turn"))
        });
      });
    });
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
    const showLegend = container.querySelector("[data-legend-open]");
    if (showLegend) {
      showLegend.addEventListener("click", function () {
        legendOpen = true;
        context.render();
      });
    }
    const closeLegend = container.querySelector("[data-legend-close]");
    if (closeLegend) {
      closeLegend.addEventListener("click", function () {
        legendOpen = false;
        context.render();
      });
    }
  }

  function handleAction(action, senderId) {
    if (!state || state.phase === "finished") return;
    if (action && action.type === "next-turn") {
      advanceLifeTurn(action.step, senderId);
      return;
    }
    if (action && action.type === "pace") {
      if (!currentContext || !currentContext.isHost || senderId !== localPlayerId ||
          ["manual", "auto5", "auto10"].indexOf(action.pace) === -1) return;
      state.pace = action.pace;
      if (state.phase === "waiting-host") {
        const duration = state.pace === "auto5" ? 5000 :
          state.pace === "auto10" ? 10000 : 0;
        state.countdownStartedAt = duration ? Date.now() : null;
        state.countdownDuration = duration;
      }
      publish();
      schedulePaceAdvance();
      return;
    }
    // Never trust a guest action unless that player owns the current turn and decision.
    if (!isCurrentTurn(senderId)) return;
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

    if (state.phase === "waiting-host") {
      publish();
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
        phase: "choosing-length",
        players: validPlayers.map(function (player, index) {
          return {
            id: player.id,
            name: player.name,
            avatarId: player.avatarId,
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
        advanceStep: 0,
        pace: "manual",
        turnBaseline: null,
        turnProgress: null,
        turnSummary: null,
        countdownStartedAt: null,
        countdownDuration: 0,
        gameLength: null,
        spinNumbers: null,
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
      beginTurnTracking(activePlayer());
      clearPaceTimer();
      turnVersion = 0;
      animationId = 0;
      resultReported = false;
      locallyActed = false;
      resultsCounted = false;
      camera = { x: 0, y: 0, zoom: 1, autoFollowUntil: 0, followKey: null };
      legendOpen = false;
      if (cameraResumeTimer) clearTimeout(cameraResumeTimer);
      cameraResumeTimer = null;
      if (floatTimer) clearTimeout(floatTimer);
      floatTimer = null;
      return { state: state };
    },
    initialize: function (publicState, privateState, context) {
      clearPaceTimer();
      state = publicState;
      currentContext = context;
      localPlayerId = context.playerId;
      fastAnimations = readFastAnimations();
      turnVersion = 0;
      locallyActed = false;
      resultsCounted = false;
      resultReported = state.phase === "finished";
      camera = { x: 0, y: 0, zoom: 1, autoFollowUntil: 0, followKey: null };
      legendOpen = false;
      if (cameraResumeTimer) clearTimeout(cameraResumeTimer);
      cameraResumeTimer = null;
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
