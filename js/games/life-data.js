// This file holds the editable board, careers, event cards, and number-wheel data for Life Path.
(function () {
  "use strict";

  // To add an event card, copy one object below, give it a unique id, and add two or three choices.
  const PAYDAY_SCALE = 0.7;
  const mainWaypoints = [
    [120, 1500], [260, 1460], [420, 1510], [580, 1460], [740, 1510],
    [900, 1460], [1060, 1510], [1220, 1460], [1360, 1480],
    [1470, 1410], [1480, 1300], [1400, 1210],
    [1250, 1160], [1100, 1200], [950, 1140], [800, 1190],
    [650, 1140], [500, 1190], [350, 1140], [230, 1090],
    [150, 1000], [190, 910], [330, 850],
    [480, 800], [630, 850], [780, 800], [930, 850],
    [1080, 800], [1230, 850], [1360, 830],
    [1470, 760], [1480, 650], [1400, 560],
    [1250, 510], [1100, 550], [950, 490], [800, 540],
    [650, 490], [500, 540], [350, 500], [230, 440],
    [150, 350], [200, 260],
    [330, 190], [480, 150], [630, 200], [780, 150],
    [930, 200], [1080, 150], [1230, 190], [1360, 140],
    [1460, 90]
  ];

  const collegeWaypoints = [[560, 1360], [700, 1330], [820, 1390]];
  const tileCodes = "sYYBGYOYPGYRYBGYAY1GYOYPGYBRYGYO2YGPYBAGYRYOGY3YBGYPYAGYRBYGYO4YGPYBRGYAYPGYOYBG5YRYGYPOBGYAYRGYPOG6";
  const codeTypes = {
    s: "start",
    Y: "event",
    G: "payday",
    B: "activity",
    P: "milestone",
    O: "opportunity",
    R: "setback",
    A: "boost",
    "1": "marriage",
    "2": "family",
    "3": "home",
    "4": "second-chance",
    "5": "bucket-list",
    "6": "retirement"
  };
  const spaces = Array.from(tileCodes).map(function (code, index) {
    return {
      id: "m" + index,
      type: codeTypes[code],
      next: index < tileCodes.length - 1 ? "m" + (index + 1) : null
    };
  });
  const collegeSpaces = Array.from({ length: 7 }, function (_, index) {
    const number = index + 1;
    return {
      id: "c" + number,
      type: number === 7 ? "graduation" : "college",
      next: number === 7 ? "m12" : "c" + (number + 1)
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
    },
    {
      id: "e25", title: "A Market Morning", text: "Your garden basket is full before breakfast.",
      choices: [
        { id: "sell-produce", label: "Sell the extra vegetables", effects: { cash: 30, wealth: 0, happiness: 0, knowledge: 1 } },
        { id: "share-produce", label: "Share a basket next door", effects: { cash: 10, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e26", title: "A Kitten at the Gate", text: "A tiny visitor curls up on your porch.",
      choices: [
        { id: "adopt-kitten", label: "Make a cozy home for it", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "find-kitten-home", label: "Help find its family", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e27", title: "The Town Recipe Book", text: "Neighbors are collecting favorite recipes.",
      choices: [
        { id: "submit-recipe", label: "Write down your family recipe", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } },
        { id: "print-recipe", label: "Help print the little book", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e28", title: "A Tiny Theater", text: "The community hall is putting on a play.",
      choices: [
        { id: "watch-play", label: "Buy a front-row seat", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "paint-play", label: "Paint the stage scenery", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e29", title: "A Bicycle Bell", text: "Your old bicycle could use a little care.",
      choices: [
        { id: "repair-bike", label: "Fix it with a neighbor", effects: { cash: -10, wealth: 1, happiness: 0, knowledge: 1 } },
        { id: "trade-bike", label: "Trade a tune-up for a lesson", effects: { cash: 10, wealth: 0, happiness: 1, knowledge: 0 } }
      ]
    },
    {
      id: "e30", title: "A Birdhouse Workshop", text: "The park is hosting a gentle woodworking class.",
      choices: [
        { id: "build-birdhouse", label: "Build one for your garden", effects: { cash: -20, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "teach-birdhouse", label: "Help a beginner learn", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    },
    {
      id: "e31", title: "A Rainy Garden", text: "A shower leaves the community garden sparkling.",
      choices: [
        { id: "collect-rain", label: "Save water for later", effects: { cash: 10, wealth: 1, happiness: 0, knowledge: 0 } },
        { id: "plant-rain", label: "Plant a few thirsty flowers", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e32", title: "A Postcard from a Friend", text: "A friend sends a sunny postcard from the coast.",
      choices: [
        { id: "write-postcard", label: "Send a thoughtful reply", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "map-postcard", label: "Look up their seaside town", effects: { cash: 0, wealth: 0, happiness: 0, knowledge: 2 } }
      ]
    },
    {
      id: "e33", title: "The Old Train Station", text: "The little station is reopening for weekend trips.",
      choices: [
        { id: "ride-train", label: "Take a short scenic ride", effects: { cash: -30, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "volunteer-train", label: "Help welcome visitors", effects: { cash: 10, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e34", title: "A Box of Buttons", text: "A neighbor shares a colorful tin of spare buttons.",
      choices: [
        { id: "sew-buttons", label: "Sew a bright patchwork", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 1 } },
        { id: "sort-buttons", label: "Sort them for the craft shelf", effects: { cash: 10, wealth: 1, happiness: 0, knowledge: 0 } }
      ]
    },
    {
      id: "e35", title: "A Hilltop Picnic", text: "The hill above town is perfect for lunch.",
      choices: [
        { id: "pack-picnic", label: "Pack everyone's favorite snacks", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "find-picnic", label: "Find a new walking trail", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    },
    {
      id: "e36", title: "The Little Free Pantry", text: "The pantry shelf is nearly empty this week.",
      choices: [
        { id: "stock-pantry", label: "Fill it with useful staples", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "organize-pantry", label: "Make a list of local growers", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    },
    {
      id: "e37", title: "A Puzzle Exchange", text: "Someone leaves a nearly finished puzzle at the cafe.",
      choices: [
        { id: "finish-puzzle", label: "Stay for one more piece", effects: { cash: 0, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "swap-puzzle", label: "Trade for a fresh puzzle", effects: { cash: -10, wealth: 1, happiness: 1, knowledge: 0 } }
      ]
    },
    {
      id: "e38", title: "A Porch Concert", text: "A neighbor plays gentle songs as the sun sets.",
      choices: [
        { id: "listen-porch", label: "Bring a blanket and listen", effects: { cash: 0, wealth: 0, happiness: 2, knowledge: 1 } },
        { id: "bring-tea", label: "Bring tea for the musicians", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e39", title: "A New Seed Catalog", text: "A colorful catalog arrives in the mail.",
      choices: [
        { id: "order-seeds", label: "Try a packet of unusual seeds", effects: { cash: -20, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "study-seeds", label: "Read about native plants", effects: { cash: 0, wealth: 0, happiness: 0, knowledge: 2 } }
      ]
    },
    {
      id: "e40", title: "A Warm Scarf", text: "The knitting circle has extra wool to share.",
      choices: [
        { id: "knit-scarf", label: "Make a scarf for someone", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 1 } },
        { id: "teach-knit", label: "Learn a new knitting stitch", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    },
    {
      id: "e41", title: "The Moonlit Pond", text: "The pond reflects a bright moon and a few stars.",
      choices: [
        { id: "sketch-pond", label: "Sketch the reflection", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } },
        { id: "share-pond", label: "Invite a friend to watch", effects: { cash: 0, wealth: 0, happiness: 2, knowledge: 1 } }
      ]
    },
    {
      id: "e42", title: "A Helpful Delivery", text: "A parcel lands on the wrong doorstep.",
      choices: [
        { id: "walk-parcel", label: "Walk it to the right home", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "call-parcel", label: "Help the courier find the address", effects: { cash: 10, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e43", title: "A Painted Mailbox", text: "The street is brightening up its mailboxes.",
      choices: [
        { id: "paint-mailbox", label: "Paint yours with flowers", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "design-mailbox", label: "Design a little number stencil", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    },
    {
      id: "e44", title: "A Quiet Museum", text: "The local museum has a new room of everyday treasures.",
      choices: [
        { id: "visit-museum", label: "Spend the afternoon exploring", effects: { cash: -10, wealth: 0, happiness: 1, knowledge: 2 } },
        { id: "help-museum", label: "Help label a few objects", effects: { cash: 10, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e45", title: "The Community Orchard", text: "The first apples of the season are ready.",
      choices: [
        { id: "pick-apples", label: "Pick a basket to take home", effects: { cash: -10, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "sell-apples", label: "Sell a few at the market", effects: { cash: 20, wealth: 0, happiness: 0, knowledge: 1 } }
      ]
    },
    {
      id: "e46", title: "A Friendly Board Game", text: "A friend brings a new game to game night.",
      choices: [
        { id: "learn-game", label: "Learn the clever rules", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } },
        { id: "host-game", label: "Bring snacks for everyone", effects: { cash: -20, wealth: 0, happiness: 2, knowledge: 0 } }
      ]
    },
    {
      id: "e47", title: "A Tiny Bookshop", text: "The bookshop is celebrating its first anniversary.",
      choices: [
        { id: "buy-bookshop", label: "Choose a well-loved book", effects: { cash: -20, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "help-bookshop", label: "Recommend a favorite to a reader", effects: { cash: 10, wealth: 0, happiness: 1, knowledge: 1 } }
      ]
    },
    {
      id: "e48", title: "A Blanket Fort", text: "Rain taps the windows while your friends visit.",
      choices: [
        { id: "build-fort", label: "Build a very grand fort", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 0 } },
        { id: "tell-fort", label: "Tell stories inside", effects: { cash: 0, wealth: 0, happiness: 2, knowledge: 1 } }
      ]
    },
    {
      id: "e49", title: "A Trail of Feathers", text: "Bright feathers lead you to a birdwatching group.",
      choices: [
        { id: "watch-birds", label: "Borrow a pair of binoculars", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } },
        { id: "join-birds", label: "Bring a thermos to share", effects: { cash: -10, wealth: 0, happiness: 2, knowledge: 1 } }
      ]
    },
    {
      id: "e50", title: "A Window Herb Box", text: "Your sunny windowsill is ready for something green.",
      choices: [
        { id: "plant-herbs", label: "Plant a few kitchen herbs", effects: { cash: -20, wealth: 1, happiness: 1, knowledge: 0 } },
        { id: "share-herbs", label: "Trade a cutting with a neighbor", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 2 } }
      ]
    }
  ];

  window.LifePathData = {
    minPlayers: 2,
    maxPlayers: 6,
    startingCash: 200,
    playerColors: ["#d87567", "#6487bd", "#7d9d59", "#a477b0", "#d19a42", "#4d9d94"],
    spaces: spaces.concat(collegeSpaces),
    viewBox: "0 0 1600 1700",
    mainWaypoints: mainWaypoints,
    collegeWaypoints: collegeWaypoints,
    tileCodes: tileCodes,
    collegeEntryIndex: 4,
    collegeMergeIndex: 12,
    mainStart: "m0",
    collegeStart: "c1",
    collegeMerge: "m12",
    stopTypes: ["marriage", "family", "home", "second-chance", "bucket-list", "retirement", "graduation"],
    scenerySeed: 782041,
    rules: {
      collegeCost: 100,
      standardCareerChoices: 2,
      degreeCareerChoices: 3,
      paydayLandingBonus: 50,
      marriageHappiness: 2,
      marriagePayment: 10,
      marriageStayKnowledge: 1,
      marriageStayWealth: 1,
      familyCost: 20,
      familyHappiness: 2,
      familyKnowledge: 1,
      familyStayWealth: 1,
      familyStayCash: 10,
      homeApartmentCost: 40,
      homeApartmentHappiness: 1,
      homeApartmentWealth: 1,
      homeHouseCost: 100,
      homeHouseHappiness: 2,
      homeHouseWealth: 2,
      homeRentCash: 10,
      bucketAdventureHappiness: 2,
      bucketAdventureCost: 30,
      bucketCourseKnowledge: 2,
      bucketCourseCost: 20,
      bucketInvestWealth: 2,
      bucketInvestCost: 30,
      secondChanceRaise: 15,
      careerSwitchChoices: 2,
      sabbaticalCost: 20,
      sabbaticalHappiness: 2,
      sabbaticalKnowledge: 1,
      boostSpaces: 3
    },
    collegeKnowledgePerSpace: 1,
    collegeGraduationBonus: 2,
    stopSignColor: "#e46c6c",
    legendTypes: {
      start: { label: "Start", emoji: "START", color: "#f6d365", description: "Choose a career or go to college." },
      payday: { label: "Payday", emoji: "$", color: "#7fc77f", description: "Earn your salary when you pass; landing pays an extra 50K." },
      event: { label: "Event", emoji: "?", color: "#f6d365", description: "Draw a cozy event card and choose an option." },
      activity: { label: "Activity", emoji: "🎡", color: "#7fb7e6", description: "Try the eight-part Lucky Spin." },
      milestone: { label: "Milestone", emoji: "💗", color: "#f4a6c6", description: "Choose a small happiness or knowledge reward." },
      opportunity: { label: "Opportunity", emoji: "🍀", color: "#f5a35c", description: "Gain 20K, or 30K with a degree career." },
      setback: { label: "Setback", emoji: "🌧️", color: "#e46c6c", description: "Pay 20K." },
      boost: { label: "Boost", emoji: "»", color: "#8fdcc9", description: "Move ahead three more spaces; stops still halt you." },
      college: { label: "Study", emoji: "📖", color: "#b9a6e8", description: "Gain one Knowledge token." },
      marriage: { label: "Marriage stop", emoji: "💍", color: "#e46c6c", description: "Get married and receive gifts, or stay single for tokens." },
      family: { label: "Family stop", emoji: "🏡", color: "#e46c6c", description: "Start a family or adopt a pet, or keep adventuring." },
      home: { label: "Home stop", emoji: "🏠", color: "#e46c6c", description: "Choose a cozy apartment, a big house, or keep renting." },
      "second-chance": { label: "Second Chance stop", emoji: "🔀", color: "#e46c6c", description: "Choose a raise, a new career, or a sabbatical." },
      "bucket-list": { label: "Bucket List stop", emoji: "🧳", color: "#e46c6c", description: "Choose an adventure, a course, or an investment." },
      graduation: { label: "Graduation stop", emoji: "🎓", color: "#e46c6c", description: "Gain Knowledge, choose a degree career, then take a bonus spin." },
      retirement: { label: "Retirement stop", emoji: "🏁", color: "#e46c6c", description: "Retire and collect your finishing-order bonus." }
    },
    scenery: {
      islandInset: 28,
      riverWaypoints: [[20, 680], [220, 650], [430, 690], [650, 650], [850, 690], [1080, 650], [1300, 690], [1580, 650]],
      treeCount: 42,
      houseCount: 7,
      flowerCount: 28,
      rockCount: 16,
      pondCount: 1,
      windmillCount: 1
    },
    spinNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    gameLengths: {
      quick: { label: "Quick", numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      standard: { label: "Standard", numbers: [1, 2, 3, 4, 5, 6, 7, 8] },
      long: { label: "Long", numbers: [1, 2, 3, 4, 5, 6] }
    },
    wheelColors: ["#e9b5b2", "#f0d48d", "#a9d4bd", "#a9d8e6", "#c5b7df", "#e7bdd1", "#b9d8a8", "#f0c49b", "#afc8e7", "#d9dca0"],
    luckySpinResults: [
      { label: "−10k", description: "Lose 10K", effects: { cash: -10, wealth: 0, happiness: 0, knowledge: 0 } },
      { label: "+10k", description: "Gain 10K", effects: { cash: 10, wealth: 0, happiness: 0, knowledge: 0 } },
      { label: "+20k", description: "Gain 20K", effects: { cash: 20, wealth: 0, happiness: 0, knowledge: 0 } },
      { label: "+1 ❤️", description: "Gain one Happiness", effects: { cash: 0, wealth: 0, happiness: 1, knowledge: 0 } },
      { label: "+1 📖", description: "Gain one Knowledge", effects: { cash: 0, wealth: 0, happiness: 0, knowledge: 1 } },
      { label: "+1 🐷", description: "Gain one Wealth", effects: { cash: 0, wealth: 1, happiness: 0, knowledge: 0 } },
      { label: "+10k + ❤️", description: "Gain 10K and one Happiness", effects: { cash: 10, wealth: 0, happiness: 1, knowledge: 0 } },
      { label: "Nothing", description: "Nothing this time", effects: { cash: 0, wealth: 0, happiness: 0, knowledge: 0 } }
    ],
    careers: [
      { id: "garden-tender", name: "Garden Tender", emoji: "🌱", salary: 40, kind: "standard" },
      { id: "library-helper", name: "Library Helper", emoji: "📚", salary: 45, kind: "standard" },
      { id: "village-baker", name: "Village Baker", emoji: "🥖", salary: 50, kind: "standard" },
      { id: "park-ranger", name: "Park Ranger", emoji: "🐿️", salary: 60, kind: "standard" },
      { id: "community-gardener", name: "Community Gardener", emoji: "🪴", salary: 42, kind: "standard" },
      { id: "bakery-decorator", name: "Bakery Decorator", emoji: "🧁", salary: 55, kind: "standard" },
      { id: "wildlife-biologist", name: "Wildlife Biologist", emoji: "🦉", salary: 70, kind: "degree" },
      { id: "kind-architect", name: "Kindness Architect", emoji: "🏡", salary: 80, kind: "degree" },
      { id: "planetarium-guide", name: "Planetarium Guide", emoji: "🌙", salary: 90, kind: "degree" },
      { id: "community-researcher", name: "Community Researcher", emoji: "💛", salary: 110, kind: "degree" },
      { id: "botanical-illustrator", name: "Botanical Illustrator", emoji: "🎨", salary: 75, kind: "degree" },
      { id: "coastal-ecologist", name: "Coastal Ecologist", emoji: "🦀", salary: 95, kind: "degree" }
    ],
    eventCards: eventCards,
    retirementBonuses: [400, 300, 200, 100, 50, 50],
    tokenBonus: 400,
    pointsPerToken: 20,
    PAYDAY_SCALE: PAYDAY_SCALE
  };
}());
