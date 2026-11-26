// This file keeps the animal choices in one place for the whole game site.
(function () {
  "use strict";

  const animals = [
    { id: "fox", emoji: "🦊", name: "Fox" },
    { id: "frog", emoji: "🐸", name: "Frog" },
    { id: "panda", emoji: "🐼", name: "Panda" },
    { id: "octopus", emoji: "🐙", name: "Octopus" },
    { id: "owl", emoji: "🦉", name: "Owl" },
    { id: "bunny", emoji: "🐰", name: "Bunny" },
    { id: "cat", emoji: "🐱", name: "Cat" },
    { id: "dog", emoji: "🐶", name: "Dog" },
    { id: "bear", emoji: "🐻", name: "Bear" },
    { id: "penguin", emoji: "🐧", name: "Penguin" },
    { id: "lion", emoji: "🦁", name: "Lion" },
    { id: "koala", emoji: "🐨", name: "Koala" },
    { id: "turtle", emoji: "🐢", name: "Turtle" },
    { id: "butterfly", emoji: "🦋", name: "Butterfly" },
    { id: "bee", emoji: "🐝", name: "Bee" },
    { id: "hedgehog", emoji: "🦔", name: "Hedgehog" }
  ];

  function getAvatar(id) {
    const animal = animals.find(function (entry) {
      return entry.id === id;
    });
    return animal ? animal.emoji : "";
  }

  window.GameNightAvatars = {
    animals: animals,
    getAvatar: getAvatar
  };
}());
