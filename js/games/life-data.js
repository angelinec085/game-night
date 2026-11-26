// This file holds the editable board, careers, event cards, and number-wheel data for Life Path.
(function () {
  "use strict";

  // To add an event card, copy one object below, give it a unique id, and add two or three choices.
  const mainTypes = [
    "start", "event", "payday", "activity", "event", "milestone", "event", "event",
    "quiet", "activity", "event", "payday", "event", "career-check", "milestone",
    "event", "quiet", "payday", "activity", "event", "milestone", "payday",
    "event", "activity", "quiet", "event", "midlife", "payday", "event",
    "milestone", "activity", "event", "payday", "quiet", "event", "milestone",
    "event", "activity", "payday", "retirement"
  ];

  const spaces = mainTypes.map(function (type, index) {
    const row = Math.floor(index / 8);
    const columnInRow = index % 8;
    const column = row % 2 === 0 ? columnInRow : 7 - columnInRow;
    return {
      id: "m" + index,
      x: 60 + column * 100,
      y: 58 + row * 100,
      type: type,
      next: index === 0 ? ["m1", "c1"] : (index < 39 ? "m" + (index + 1) : null)
    };
  });

  const collegeSpaces = Array.from({ length: 5 }, function (_, index) {
    const number = index + 1;
    return {
      id: "c" + number,
      x: 60 + index * 100,
      y: 140,
      type: number === 5 ? "graduation" : "college",
      next: number === 5 ? "m6" : "c" + (number + 1)
    };
  });

  const eventCards = [
    {
      id: "e01", title: "A Little Free Library", text: "You find a tiny book box on your walk.",
      choices: [
        { id: "take-book", label: "Take home a mystery book", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 1 } },
        { id: "add-book", label: "Add a book for someone else", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e02", title: "Garden Surprise", text: "A neighbor offers you extra seedlings.",
      choices: [
        { id: "plant", label: "Plant a little garden", effects: { cash: -20, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "share", label: "Split the seedlings", effects: { cash: 10, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e03", title: "Rainy Day Recipe", text: "A friend shares a cozy soup recipe.",
      choices: [
        { id: "cook", label: "Cook it for everyone", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "trade", label: "Trade recipes", effects: { cash: 10, wealth: 0, happiness: 0, knowledge: 2 } }
      ]
    },
    {
      id: "e04", title: "The Lost Scarf", text: "You spot a colorful scarf on a park bench.",
      choices: [
        { id: "return", label: "Find its owner", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "notice", label: "Leave a kind note", effects: { cash: 10, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e05", title: "Craft Fair", text: "Your handmade bookmarks catch someone's eye.",
      choices: [
        { id: "sell", label: "Sell a few", effects: { cash: 30, wealth: 1, happiness: 0, knowledge: 0 } },
        { id: "gift", label: "Give them away", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e06", title: "A Friendly Class", text: "The community center has a one-day workshop.",
      choices: [
        { id: "learn", label: "Try pottery", effects: { cash: -20, wealth: 0, happiness: 1, knowledge: 2 } },
        { id: "help", label: "Help set up instead", effects: { cash: 10, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e07", title: "Surprise Picnic", text: "Your friends planned an afternoon outside.",
      choices: [
        { id: "bring-food", label: "Bring a big basket", effects: { cash: -30, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "bring-game", label: "Bring a clever game", effects: { cash: -10, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e08", title: "Old Camera", text: "A relative offers you a box of vintage cameras.",
      choices: [
        { id: "repair", label: "Repair one and keep it", effects: { cash: -20, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "sell-camera", label: "Sell the spare parts", effects: { cash: 20, wealth: 0, happiness: 0, knowledge: 1 } }
      ]
    },
    {
      id: "e09", title: "Neighborhood Cleanup", text: "The block is tidying the little park.",
      choices: [
        { id: "join", label: "Join the cleanup", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "organize", label: "Make a useful sign", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    },
    {
      id: "e10", title: "A Tiny Invention", text: "You figure out a handy way to reuse jars.",
      choices: [
        { id: "market", label: "Sell a few at the market", effects: { cash: 30, wealth: 1, happiness: 0, knowledge: 0 } },
        { id: "teach", label: "Show your friends", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    },
    {
      id: "e11", title: "Cloud Watching", text: "The clouds look like boats, rabbits, and teapots.",
      choices: [
        { id: "draw", label: "Sketch what you see", effects: { cash: 0, wealth: 0, happiness: 2, knowledge: 1 } },
        { id: "nap", label: "Take a quiet nap", effects: { cash: 10, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e12", title: "A Helpful Neighbor", text: "Someone offers to trade a favor with you.",
      choices: [
        { id: "fix-bike", label: "Help fix their bike", effects: { cash: -10, wealth: 0, happiness: 1, knowledge: 2 } },
        { id: "swap-books", label: "Swap favorite books", effects: { cash: 10, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e13", title: "Warm Bread", text: "The bakery has a little end-of-day surplus.",
      choices: [
        { id: "buy-bread", label: "Buy a loaf for home", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "share-bread", label: "Share it with a neighbor", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 1 } }
      ]
    },
    {
      id: "e14", title: "A New Trail", text: "You discover a path through a patch of woods.",
      choices: [
        { id: "map-trail", label: "Map it for others", effects: { cash: -10, wealth: 0, happiness: 1, knowledge: 2 } },
        { id: "take-photos", label: "Take a few photos", effects: { cash: 20, wealth: 0, happiness: 1, knowledge: 0 } }
      ]
    },
    {
      id: "e15", title: "Mended Sweater", text: "A button falls off your favorite sweater.",
      choices: [
        { id: "mend", label: "Learn to mend it", effects: { cash: -10, wealth: 1, happiness: 1, knowledge: 1 } },
        { id: "tailor", label: "Ask a local tailor", effects: { cash: -30, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e16", title: "Starry Evening", text: "A neighbor invites you to a rooftop stargazing night.",
      choices: [
        { id: "telescope", label: "Borrow a telescope", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } },
        { id: "blanket", label: "Bring snacks and blankets", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e17", title: "A Lucky Find", text: "You find a forgotten ten-dollar note in an old coat.",
      choices: [
        { id: "save-find", label: "Put it away for later", effects: { cash: 10, wealth: 1, happiness: 0, knowledge: 0 } },
        { id: "treat", label: "Buy a treat for a friend", effects: { cash: 0, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e18", title: "Community Garden", text: "The garden needs one more pair of hands.",
      choices: [
        { id: "water", label: "Water the new beds", effects: { cash: -10, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "label", label: "Make plant labels", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    },
    {
      id: "e19", title: "A Cozy Concert", text: "A friend is playing music in a small cafe.",
      choices: [
        { id: "ticket", label: "Buy a ticket", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "poster", label: "Help make the poster", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e20", title: "Rain Barrel", text: "You can collect rainwater for the garden.",
      choices: [
        { id: "install", label: "Install a sturdy barrel", effects: { cash: -30, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "share-plan", label: "Share a simple plan", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    },
    {
      id: "e21", title: "Family Recipe Box", text: "You inherit a box of handwritten recipes.",
      choices: [
        { id: "cook-together", label: "Cook one with family", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 1 } },
        { id: "copy", label: "Copy the recipes neatly", effects: { cash: 10, wealth: 0, happiness: 0, knowledge: 2 } }
      ]
    },
    {
      id: "e22", title: "A Small Repair", text: "A wobbly chair could use a little attention.",
      choices: [
        { id: "repair-chair", label: "Fix it yourself", effects: { cash: -10, wealth: 1, happiness: 0, knowledge: 2 } },
        { id: "craftsperson", label: "Hire a local craftsperson", effects: { cash: -40, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e23", title: "Weekend Swap", text: "The neighbors are swapping useful things.",
      choices: [
        { id: "swap-mug", label: "Trade for a favorite mug", effects: { cash: 0, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "swap-lesson", label: "Trade someone a lesson", effects: { cash: 10, wealth: 0, happiness: 0, knowledge: 2 } }
      ]
    },
    {
      id: "e24", title: "A Long Walk Home", text: "The bus is late, but the evening is lovely.",
      choices: [
        { id: "walk", label: "Walk the scenic route", effects: { cash: 0, wealth: 0, happiness: 2, knowledge: 1 } },
        { id: "rideshare", label: "Share a ride with a friend", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    }
  ];

  window.LifePathData = {
    minPlayers: 2,
    maxPlayers: 6,
    startingCash: 200,
    playerColors: ["#d87567", "#6487bd", "#7d9d59", "#a477b0", "#d19a42", "#4d9d94"],
    spaces: spaces.concat(collegeSpaces),
    mainStart: "m0",
    collegeStart: "c1",
    collegeMerge: "m6",
    rules: {
      collegeCost: 100,
      standardCareerChoices: 2,
      degreeCareerChoices: 3,
      paydayLandingBonus: 50,
      quietHappiness: 1,
      marriageHappiness: 2,
      marriagePayment: 10,
      maximumChildren: 2,
      babyCost: 20,
      babyHappiness: 2,
      babyKnowledge: 1,
      careerCheckRaise: 10,
      careerSwitchChoices: 2,
      midlifePromotion: 15,
      sabbaticalCost: 20,
      sabbaticalHappiness: 2,
      sabbaticalKnowledge: 1,
      investmentCost: 30,
      investmentWealth: 2
    },
    collegeKnowledgePerSpace: 1,
    collegeGraduationBonus: 2,
    spaceTypes: {
      start: { label: "Start", emoji: "🏁", color: "#b9d8a8" },
      payday: { label: "Payday", emoji: "💰", color: "#b9dfa9" },
      event: { label: "Event", emoji: "✉️", color: "#f4df9b" },
      activity: { label: "Activity", emoji: "🎡", color: "#a9d8e6" },
      milestone: { label: "Milestone", emoji: "🌷", color: "#efbad1" },
      quiet: { label: "Quiet", emoji: "🍃", color: "#d3e6cf" },
      "career-check": { label: "Career Check", emoji: "💼", color: "#e7b5b2" },
      midlife: { label: "Mid-life", emoji: "🌻", color: "#e7b5b2" },
      retirement: { label: "Retirement", emoji: "🏡", color: "#e7b5b2" },
      college: { label: "College", emoji: "📖", color: "#c7d7f0" },
      graduation: { label: "Graduation", emoji: "🎓", color: "#d8bee9" }
    },
    spinNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    wheelColors: ["#e9b5b2", "#f0d48d", "#a9d4bd", "#a9d8e6", "#c5b7df", "#e7bdd1", "#b9d8a8", "#f0c49b", "#afc8e7", "#d9dca0"],
    luckySpinResults: [
      { min: 1, max: 2, effects: { cash: -10, wealth: 0, happiness: 0, knowledge: 0 } },
      { min: 3, max: 5, effects: { cash: 10, wealth: 0, happiness: 0, knowledge: 0 } },
      { min: 6, max: 8, effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 0 } },
      { min: 9, max: 9, effects: { cash: 0, wealth: 0, happiness: 0, knowledge: 1 } },
      { min: 10, max: 10, effects: { cash: 0, wealth: 1, happiness: 0, knowledge: 0 } }
    ],
    careers: [
      { id: "garden-tender", name: "Garden Tender", emoji: "🌱", salary: 40, kind: "standard" },
      { id: "library-helper", name: "Library Helper", emoji: "📚", salary: 45, kind: "standard" },
      { id: "village-baker", name: "Village Baker", emoji: "🥖", salary: 50, kind: "standard" },
      { id: "park-ranger", name: "Park Ranger", emoji: "🐿️", salary: 60, kind: "standard" },
      { id: "wildlife-biologist", name: "Wildlife Biologist", emoji: "🦉", salary: 70, kind: "degree" },
      { id: "kind-architect", name: "Kindness Architect", emoji: "🏡", salary: 80, kind: "degree" },
      { id: "planetarium-guide", name: "Planetarium Guide", emoji: "🌙", salary: 90, kind: "degree" },
      { id: "community-researcher", name: "Community Researcher", emoji: "💛", salary: 110, kind: "degree" }
    ],
    eventCards: eventCards,
    retirementBonuses: [400, 300, 200, 100, 50, 50],
    tokenBonus: 400,
    pointsPerToken: 20
  };
}());
