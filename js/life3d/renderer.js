// This file connects the procedural scene to the small interface used by Life Path.
(function () {
  "use strict";

  function makeCar(THREE, player, quality) {
    const root = new THREE.Group();
    const color = new THREE.Color(player.color || "#4fd0d8");
    const Material = quality === "lite" ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    const bodyMaterial = new Material({
      color: color,
      roughness: 0.65,
      flatShading: true
    });
    const darkMaterial = new Material({ color: "#39484d", roughness: 0.8 });
    const glassMaterial = new Material({
      color: color.clone().lerp(new THREE.Color("#ffffff"), 0.55),
      roughness: 0.25,
      metalness: 0.1
    });
    const lampMaterial = new Material({
      color: "#fff2bd",
      emissive: "#fff0a8",
      emissiveIntensity: 0.4
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.72, 3.6), bodyMaterial);
    body.position.y = 0.72;
    body.castShadow = true;
    root.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.82, 1.65), glassMaterial);
    cabin.position.set(0, 1.36, -0.15);
    cabin.castShadow = true;
    root.add(cabin);
    const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 0.28), darkMaterial);
    bumperFront.position.set(0, 0.48, 1.84);
    root.add(bumperFront);
    const bumperBack = bumperFront.clone();
    bumperBack.position.z = -1.84;
    root.add(bumperBack);
    const wheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.3, 10);
    const wheelMaterial = new Material({ color: "#30383d", roughness: 0.92 });
    const wheels = [];
    [[-1.08, 0.48, -1.12], [1.08, 0.48, -1.12], [-1.08, 0.48, 1.12], [1.08, 0.48, 1.12]]
      .forEach(function (position) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(position[0], position[1], position[2]);
        wheel.castShadow = true;
        root.add(wheel);
        wheels.push(wheel);
      });
    const headGeometry = new THREE.SphereGeometry(0.22, 8, 6);
    [-0.62, 0.62].forEach(function (x) {
      const headlight = new THREE.Mesh(headGeometry, lampMaterial);
      headlight.position.set(x, 0.95, 1.78);
      root.add(headlight);
    });
    const passengerCount = Math.max(0, Number(player.babies) || 0) +
      (player.married ? 1 : 0);
    for (let index = 0; index < passengerCount; index += 1) {
      const passenger = new THREE.Group();
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 6),
        new Material({ color: index ? "#f6b6c8" : "#ffd78a", flatShading: true })
      );
      head.position.y = 1.9;
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.55, 6), darkMaterial);
      seat.position.y = 1.45;
      passenger.add(head, seat);
      passenger.position.set(index ? 0.42 : -0.42, 0, -0.2);
      root.add(passenger);
    }
    return {
      root: root,
      wheels: wheels,
      materials: [bodyMaterial, darkMaterial, glassMaterial, lampMaterial, wheelMaterial],
      geometries: [body.geometry, cabin.geometry, bumperFront.geometry, wheelGeometry, headGeometry]
    };
  }

  function makeBadge(stage, player, local) {
    const badge = document.createElement("div");
    badge.className = "life3d-badge" + (local ? " is-local" : "");
    badge.style.setProperty("--badge-color", player.color || "#4fd0d8");
    const animal = document.createElement("span");
    animal.className = "life3d-badge-animal";
    animal.textContent = window.GameNightAvatars.getAvatar(player.avatarId) || "🐾";
    const name = document.createElement("span");
    name.className = "life3d-badge-name";
    name.textContent = player.name;
    badge.append(animal, name);
    stage.appendChild(badge);
    return badge;
  }

  function reportBuildFailure(stage, step, error) {
    console.error("Life Path 3D " + step + " setup failed.", error);
    if (window.location.hash !== "#debug") return;
    const status = stage.parentElement &&
      stage.parentElement.querySelector("[data-life3d-debug-status]");
    if (status) {
      status.textContent = "3D failed at " + step;
      status.dataset.failed = "true";
      status.hidden = false;
    }
  }

  function buildStep(stage, name, create, fallback) {
    try {
      return create();
    } catch (error) {
      reportBuildFailure(stage, name, error);
      return fallback;
    }
  }

  function create(stage, boardData, initialPlayers, options) {
    const THREE = window.THREE;
    const timing = options.timing;
    const quality = options.quality || "high";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#cfeaff");
    scene.fog = new THREE.Fog("#cfeaff", quality === "lite" ? 95 : 140, quality === "lite" ? 300 : 420);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 700);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = quality === "high";
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "Three dimensional Life Path board");
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.style.touchAction = "none";
    stage.appendChild(renderer.domElement);

    const emptyTrackData = {
      mainSpaces: [],
      collegeSpaces: [],
      samples: [],
      branchSamples: [],
      tileCenters: new Map()
    };
    const trackData = buildStep(stage, "board path", function () {
      return window.Life3DTrack.makeData(THREE, boardData);
    }, emptyTrackData);
    const emptyWorld = {
      sampleHeight: function () { return 0; },
      followShadows: function () {},
      update: function () {},
      dispose: function () {}
    };
    const world = buildStep(stage, "terrain and sky", function () {
      return window.Life3DWorld.create(THREE, scene, boardData, trackData, quality);
    }, emptyWorld);
    const emptyTrack = {
      tileMeshes: new Map(),
      dispose: function () {}
    };
    const track = buildStep(stage, "road and tiles", function () {
      return window.Life3DTrack.create(
        THREE, scene, boardData, trackData, world.sampleHeight, quality
      );
    }, emptyTrack);
    const emptyProps = { update: function () {}, dispose: function () {} };
    const props = buildStep(stage, "scenery", function () {
      return window.Life3DProps.create(
        THREE, scene, boardData, trackData, world.sampleHeight, quality
      );
    }, emptyProps);
    const actors = new Map();
    const movements = new Map();
    const floaters = [];
    const tileEffects = [];
    const coinGeometry = new THREE.TorusGeometry(0.28, 0.1, 4, 8);
    const coinMaterial = quality === "lite"
      ? new THREE.MeshBasicMaterial({ color: "#f6c84f", transparent: true })
      : new THREE.MeshStandardMaterial({ color: "#f6c84f", metalness: 0.45, roughness: 0.38, transparent: true });
    const coins = [];
    for (let coinIndex = 0; coinIndex < 12; coinIndex += 1) {
      const coin = new THREE.Mesh(coinGeometry, coinMaterial);
      coin.visible = false;
      scene.add(coin);
      coins.push(coin);
    }
    let coinEffect = null;
    let activePlayers = initialPlayers.slice();
    let focusId = activePlayers[0] ? activePlayers[0].id : null;
    let animationFrame = null;
    let lastFrameTime = 0;
    let resizeObserver = null;
    let dprMediaQuery = null;
    let dprChangeHandler = null;
    let destroyed = false;
    let overview = true;
    let pinnedOverview = false;
    let manualUntil = 0;
    let fastAnimations = false;
    const reducedMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drag = null;
    const activePointers = new Map();
    let pinchDistance = null;
    let pinchCenter = null;
    let yaw = 0;
    let pitch = 0.68;
    let distance = 120;
    let target = new THREE.Vector3(0, 0, 0);

    const canvas = renderer.domElement;

    function pointForTile(tileId, laneOffset, forwardOffset) {
      const point = trackData.tileCenters.get(tileId);
      if (!point) return null;
      const angle = point.angle * Math.PI / 180;
      const offset = laneOffset || 0;
      const forward = forwardOffset || 0;
      const x = point.x - Math.sin(angle) * offset + Math.cos(angle) * forward;
      const z = point.z + Math.cos(angle) * offset + Math.sin(angle) * forward;
      return new THREE.Vector3(x, world.sampleHeight(x, z) + 0.65, z);
    }

    function findActor(playerId) {
      return actors.get(playerId);
    }

    function refreshActorBadge(actor, player) {
      actor.player = player;
      actor.badge.classList.toggle("is-left", Boolean(player.isLeft));
      actor.badge.classList.toggle("is-retired", Boolean(player.retired));
      actor.badge.style.setProperty("--badge-color", player.color || "#4fd0d8");
      actor.badge.querySelector(".life3d-badge-animal").textContent =
        window.GameNightAvatars.getAvatar(player.avatarId) || "🐾";
      actor.badge.querySelector(".life3d-badge-name").textContent = player.name;
    }

    function addActor(player) {
      try {
        const car = makeCar(THREE, player, quality);
        const badge = makeBadge(stage, player, player.id === (options.localPlayerId || null));
        scene.add(car.root);
        const actor = {
          root: car.root,
          wheels: car.wheels,
          badge: badge,
          player: player,
          position: player.position,
          laneOffset: 0,
          forwardOffset: 0,
          carAssets: car
        };
        actors.set(player.id, actor);
        const point = pointForTile(player.position);
        if (point) car.root.position.copy(point);
        refreshActorBadge(actor, player);
        return actor;
      } catch (error) {
        reportBuildFailure(stage, "player car", error);
        return null;
      }
    }

    function setPlayers(nextPlayers) {
      activePlayers = nextPlayers.slice();
      activePlayers.forEach(function (player, index) {
        const sameTile = activePlayers.filter(function (other) {
          return other.position === player.position;
        });
        const seatIndex = sameTile.findIndex(function (other) {
          return other.id === player.id;
        });
        const columns = Math.min(3, sameTile.length);
        const laneOffset = (seatIndex % columns - (columns - 1) / 2) * 3.4;
        const forwardOffset = Math.floor(seatIndex / 3) * 3.2;
        let actor = actors.get(player.id);
        if (!actor) actor = addActor(player);
        if (!actor) return;
        actor.laneOffset = laneOffset;
        actor.forwardOffset = forwardOffset;
        refreshActorBadge(actor, player);
        actor.badge.classList.toggle("is-local", player.id === options.localPlayerId);
        actor.badge.style.setProperty("--badge-order", String(index));
        if (!movements.has(player.id) && actor.position !== player.position) {
          const point = pointForTile(player.position, actor.laneOffset, actor.forwardOffset);
          if (point) actor.root.position.copy(point);
          actor.position = player.position;
        } else if (!movements.has(player.id)) {
          const point = pointForTile(player.position, actor.laneOffset, actor.forwardOffset);
          if (point) actor.root.position.copy(point);
        }
      });
    }

    function finishMovement(playerId) {
      const movement = movements.get(playerId);
      if (!movement) return;
      const actor = findActor(playerId);
      if (actor) {
        actor.root.position.copy(movement.to);
        actor.position = movement.toTile;
      }
      movements.delete(playerId);
      movement.resolve();
    }

    function movePlayerAlongTiles(playerId, tileIds, moveOptions) {
      finishMovement(playerId);
      const actor = findActor(playerId);
      const destinations = tileIds.map(function (tileId) {
        return pointForTile(
          tileId,
          actor ? actor.laneOffset : 0,
          actor ? actor.forwardOffset : 0
        );
      }).filter(Boolean);
      if (!actor || destinations.length === 0) return Promise.resolve();
      const from = actor.root.position.clone();
      const to = destinations[destinations.length - 1].clone();
      const toTile = tileIds[tileIds.length - 1];
      const points = [from].concat(destinations);
      const duration = reducedMotion
        ? 1
        : moveOptions.fast || fastAnimations
          ? timing.fastMovement
          : timing.movement;
      const movement = {
        from: from,
        to: to,
        curve: new THREE.CatmullRomCurve3(points, false, "centripetal"),
        toTile: toTile,
        started: performance.now(),
        duration: Math.max(1, duration),
        resolve: null
      };
      const promise = new Promise(function (resolve) {
        movement.resolve = resolve;
      });
      movements.set(playerId, movement);
      return promise;
    }

    function focusPlayer(playerId) {
      focusId = playerId;
      overview = false;
      pinnedOverview = false;
    }

    function updateCamera(delta, now) {
      if (overview && !pinnedOverview && now >= manualUntil) overview = false;
      if (!overview) {
        const actor = findActor(focusId);
        if (actor) {
          world.followShadows(actor.root.position);
          const forwardX = Math.sin(actor.root.rotation.y);
          const forwardZ = Math.cos(actor.root.rotation.y);
          const desiredTarget = actor.root.position.clone();
          desiredTarget.x += forwardX * 5;
          desiredTarget.z += forwardZ * 5;
          target.lerp(desiredTarget, Math.min(1, delta * 2.8));
          const desiredPosition = actor.root.position.clone();
          desiredPosition.x -= forwardX * 24;
          desiredPosition.z -= forwardZ * 24;
          desiredPosition.y += 14;
          camera.position.lerp(desiredPosition, Math.min(1, delta * 2.5));
          camera.lookAt(target);
        }
      } else {
        const desired = new THREE.Vector3(
          target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
          target.y + Math.sin(pitch) * distance,
          target.z + Math.cos(yaw) * Math.cos(pitch) * distance
        );
        camera.position.lerp(desired, Math.min(1, delta * 2.2));
        const ground = world.sampleHeight(camera.position.x, camera.position.z);
        camera.position.y = Math.max(camera.position.y, ground + 4);
        camera.lookAt(target);
      }
      const ground = world.sampleHeight(camera.position.x, camera.position.z);
      camera.position.y = Math.max(camera.position.y, ground + 4);
      camera.lookAt(target);
    }

    function resize() {
      const sizeContainer = stage.parentElement || stage;
      const width = Math.max(1, sizeContainer.clientWidth);
      const height = Math.max(1, sizeContainer.clientHeight);
      const weakDevice = navigator.hardwareConcurrency > 0 &&
        navigator.hardwareConcurrency <= 2;
      const pixelRatio = quality === "lite" && weakDevice
        ? 1
        : Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      updateDebugStatus();
    }

    function updateDebugStatus() {
      const debugStatus = stage.parentElement &&
        stage.parentElement.querySelector("[data-life3d-debug-status]");
      if (!debugStatus) return;
      if (window.location.hash !== "#debug") {
        debugStatus.hidden = true;
        return;
      }
      if (debugStatus.dataset.failed === "true") return;
      debugStatus.textContent = "3D OK, " + scene.children.length + " objects, " +
        canvas.clientWidth + " x " + canvas.clientHeight + " @ " +
        renderer.getPixelRatio() + " DPR";
      debugStatus.hidden = false;
    }

    function watchDevicePixelRatio() {
      if (dprMediaQuery && dprChangeHandler) {
        if (dprMediaQuery.removeEventListener) {
          dprMediaQuery.removeEventListener("change", dprChangeHandler);
        } else if (dprMediaQuery.removeListener) {
          dprMediaQuery.removeListener(dprChangeHandler);
        }
      }
      if (!window.matchMedia) return;
      dprMediaQuery = window.matchMedia(
        "(resolution: " + (window.devicePixelRatio || 1) + "dppx)"
      );
      dprChangeHandler = function () {
        resize();
        watchDevicePixelRatio();
      };
      if (dprMediaQuery.addEventListener) {
        dprMediaQuery.addEventListener("change", dprChangeHandler);
      } else if (dprMediaQuery.addListener) {
        dprMediaQuery.addListener(dprChangeHandler);
      }
    }

    function setInitialHeroCamera() {
      const actor = findActor(focusId);
      if (!actor) return;
      const forwardX = Math.sin(actor.root.rotation.y);
      const forwardZ = Math.cos(actor.root.rotation.y);
      target.copy(actor.root.position);
      target.x += forwardX * 4;
      target.z += forwardZ * 4;
      camera.position.set(
        actor.root.position.x - forwardX * 24,
        actor.root.position.y + 14,
        actor.root.position.z - forwardZ * 24
      );
      camera.lookAt(target);
      overview = false;
      pinnedOverview = false;
    }

    function positionBadges(now) {
      const bounds = canvas.getBoundingClientRect();
      actors.forEach(function (actor) {
        const anchor = actor.root.position.clone();
        anchor.y += 3.3 + Math.sin(now * 0.003 + actor.player.id.length) * 0.12;
        anchor.project(camera);
        const visible = anchor.z >= -1 && anchor.z <= 1;
        actor.badge.hidden = !visible;
        if (!visible) return;
        const x = (anchor.x * 0.5 + 0.5) * bounds.width;
        const y = (-anchor.y * 0.5 + 0.5) * bounds.height;
        actor.badge.style.transform = "translate(-50%, -100%) translate(" +
          x.toFixed(1) + "px, " + y.toFixed(1) + "px)";
      });
    }

    function updateMovements(now) {
      movements.forEach(function (movement, playerId) {
        const actor = findActor(playerId);
        if (!actor) {
          finishMovement(playerId);
          return;
        }
        const progress = Math.min(1, (now - movement.started) / movement.duration);
        const eased = progress * progress * (3 - 2 * progress);
        actor.root.position.copy(movement.curve.getPointAt(eased));
        const tangent = movement.curve.getTangentAt(eased);
        actor.root.rotation.y = Math.atan2(tangent.x, tangent.z);
        actor.root.rotation.z = -Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z));
        actor.wheels.forEach(function (wheel) {
          wheel.rotation.x -= 0.22 * (1 - progress);
        });
        if (progress >= 1) finishMovement(playerId);
      });
    }

    function updateEffects(delta) {
      for (let index = tileEffects.length - 1; index >= 0; index -= 1) {
        const effect = tileEffects[index];
        effect.age += delta;
        const progress = Math.min(1, effect.age / (timing.effect / 1000));
        effect.mesh.scale.setScalar(1 + progress * 0.55);
        effect.mesh.material.opacity = 1 - progress;
        if (effect.tile) {
          effect.tile.scale.copy(effect.baseScale).multiplyScalar(
            1 + Math.sin(progress * Math.PI) * 0.12
          );
        }
        if (progress >= 1) {
          if (effect.tile) effect.tile.scale.copy(effect.baseScale);
          scene.remove(effect.mesh);
          effect.mesh.geometry.dispose();
          effect.mesh.material.dispose();
          tileEffects.splice(index, 1);
        }
      }
      if (coinEffect) {
        coinEffect.age += delta;
        const progress = Math.min(1, coinEffect.age / (timing.effect / 1000));
        coins.forEach(function (coin, index) {
          const angle = index * Math.PI * 2 / coins.length;
          const radius = progress * 3.2;
          coin.visible = progress < 1;
          coin.position.set(
            coinEffect.point.x + Math.cos(angle) * radius,
            coinEffect.point.y + Math.sin(progress * Math.PI) * 4 + progress * 1.5,
            coinEffect.point.z + Math.sin(angle) * radius
          );
          coin.rotation.set(progress * 7, angle, progress * 9);
        });
        coinMaterial.opacity = 1 - progress;
        if (progress >= 1) {
          coins.forEach(function (coin) { coin.visible = false; });
          coinEffect = null;
        }
      }
      for (let index = floaters.length - 1; index >= 0; index -= 1) {
        const floater = floaters[index];
        floater.age += delta;
        const duration = timing.floatingText / 1000;
        floater.element.style.opacity = String(Math.max(0, 1 - floater.age / duration));
        if (floater.age > duration) {
          floater.element.remove();
          floaters.splice(index, 1);
        }
      }
      updateFloaterPositions();
    }

    function renderFrame(now) {
      if (destroyed) return;
      const deltaMilliseconds = lastFrameTime ? now - lastFrameTime : 16;
      const delta = Math.min(0.05, deltaMilliseconds / 1000);
      lastFrameTime = now;
      updateMovements(now);
      world.update(reducedMotion ? 0 : delta);
      props.update(reducedMotion ? 0 : delta);
      updateEffects(delta);
      updateCamera(delta, now);
      positionBadges(now);
      renderer.render(scene, camera);
      updateDebugStatus();
      const debugStats = stage.parentElement &&
        stage.parentElement.querySelector("[data-life3d-debug-stats]");
      if (debugStats) {
        debugStats.textContent = "FPS " + Math.round(1000 / Math.max(1, deltaMilliseconds)) +
          " · Calls " + renderer.info.render.calls +
          " · Triangles " + renderer.info.render.triangles;
      }
      options.onFrame(deltaMilliseconds);
      if (!destroyed) animationFrame = window.requestAnimationFrame(renderFrame);
    }

    function handlePointerDown(event) {
      if (event.button !== undefined && event.button !== 0 && event.button !== 2) return;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      drag = {
        x: event.clientX,
        y: event.clientY,
        yaw: yaw,
        pitch: pitch,
        target: target.clone(),
        mode: event.button === 2 ? "pan" : "orbit",
        pointerId: event.pointerId
      };
      overview = true;
      pinnedOverview = false;
      manualUntil = performance.now() + timing.cameraPause;
      if (activePointers.size === 2) {
        const points = Array.from(activePointers.values());
        pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        pinchCenter = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2
        };
      }
      canvas.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event) {
      const previous = activePointers.get(event.pointerId);
      if (!previous) return;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size >= 2) {
        const points = Array.from(activePointers.values());
        const center = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2
        };
        const currentDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (pinchDistance && currentDistance) {
          distance = Math.max(12, Math.min(120, distance * pinchDistance / currentDistance));
        }
        if (pinchCenter) {
          target.x -= (center.x - pinchCenter.x) * distance / 700;
          target.z += (center.y - pinchCenter.y) * distance / 700;
        }
        pinchDistance = currentDistance;
        pinchCenter = center;
        return;
      }
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      if (drag.mode === "pan") {
        target.copy(drag.target);
        target.x -= deltaX * distance / 700;
        target.z += deltaY * distance / 700;
      } else {
        yaw = drag.yaw - deltaX * 0.006;
        pitch = Math.max(0.12, Math.min(1.25, drag.pitch + deltaY * 0.004));
      }
    }

    function handlePointerUp(event) {
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) {
        pinchDistance = null;
        pinchCenter = null;
      }
      if (drag && drag.pointerId === event.pointerId) {
        if (activePointers.size === 1) {
          const entry = Array.from(activePointers.entries())[0];
          drag = {
            x: entry[1].x,
            y: entry[1].y,
            yaw: yaw,
            pitch: pitch,
            target: target.clone(),
            mode: "orbit",
            pointerId: entry[0]
          };
        } else {
          drag = null;
        }
      }
    }

    function handleWheel(event) {
      event.preventDefault();
      overview = true;
      distance = Math.max(12, Math.min(120, distance * (event.deltaY > 0 ? 1.08 : 0.92)));
      pinnedOverview = false;
      manualUntil = performance.now() + timing.cameraPause;
    }

    function preventContextMenu(event) {
      event.preventDefault();
    }

    function handleVisibility() {
      if (document.hidden) {
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      } else if (animationFrame === null && !destroyed) {
        lastFrameTime = 0;
        animationFrame = window.requestAnimationFrame(renderFrame);
      }
    }

    function mount(nextStage) {
      stage = nextStage;
      stage.appendChild(canvas);
      actors.forEach(function (actor) {
        stage.appendChild(actor.badge);
      });
      resize();
    }

    function updateStats() {}

    function showTileEffect(tileId, type) {
      const point = pointForTile(tileId);
      if (!point) return;
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(2.6, 0.12, 6, 28),
        new THREE.MeshBasicMaterial({
          color: {
            payday: "#f6c84f",
            boost: "#3fd6b8",
            setback: "#e8352b",
            milestone: "#ff8fbd"
          }[type] || "#fff4a8",
          transparent: true
        })
      );
      mesh.position.copy(point);
      mesh.position.y += 0.3;
      mesh.rotation.x = Math.PI / 2;
      scene.add(mesh);
      const tile = track.tileMeshes.get(tileId);
      tileEffects.push({
        mesh: mesh,
        tile: tile || null,
        baseScale: tile ? tile.scale.clone() : null,
        age: 0
      });
      if (type === "payday") {
        coinEffect = { point: point.clone(), age: 0 };
        coinMaterial.opacity = 1;
        coins.forEach(function (coin) { coin.visible = true; });
      }
    }

    function floatText(playerId, text) {
      const actor = findActor(playerId);
      if (!actor) return;
      const element = document.createElement("span");
      element.className = "life3d-float-text";
      element.textContent = text;
      stage.appendChild(element);
      floaters.push({ element: element, actor: actor, age: 0 });
    }

    function updateFloaterPositions() {
      floaters.forEach(function (floater) {
        const point = floater.actor.root.position.clone();
        point.y += 4.3 + floater.age * (timing.frameEffectRise / 1000);
        point.project(camera);
        const rect = canvas.getBoundingClientRect();
        floater.element.style.left = ((point.x * 0.5 + 0.5) * rect.width) + "px";
        floater.element.style.top = ((-point.y * 0.5 + 0.5) * rect.height) + "px";
      });
    }

    function playerRetired(playerId) {
      const actor = findActor(playerId);
      const retirement = pointForTile("m" + (boardData.tileCodes.length - 1));
      if (!actor || !retirement) return;
      finishMovement(playerId);
      actor.root.position.set(retirement.x + 7, retirement.y, retirement.z - 5);
      actor.position = "retired";
    }

    function finishAnimations() {
      Array.from(movements.keys()).forEach(finishMovement);
      tileEffects.forEach(function (effect) {
        if (effect.tile) effect.tile.scale.copy(effect.baseScale);
        scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
      });
      tileEffects.length = 0;
      coins.forEach(function (coin) { coin.visible = false; });
      coinMaterial.opacity = 1;
      coinEffect = null;
      floaters.forEach(function (floater) {
        floater.element.remove();
      });
      floaters.length = 0;
    }

    function gameEnded() {
      overview = true;
      pinnedOverview = true;
      target.set(0, 0, 0);
      pitch = 1.25;
      distance = 260;
    }

    function setFastAnimations(enabled) {
      fastAnimations = Boolean(enabled);
    }

    function setOverview() {
      overview = true;
      pinnedOverview = true;
      target.set(0, 0, 0);
      pitch = 1.25;
      distance = 260;
    }

    function zoom(factor) {
      overview = true;
      pinnedOverview = false;
      manualUntil = performance.now() + timing.cameraPause;
      distance = Math.max(12, Math.min(120, distance * factor));
    }

    function init() {
      mount(stage);
      setPlayers(activePlayers);
      resize();
      setInitialHeroCamera();
      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerup", handlePointerUp);
      canvas.addEventListener("pointercancel", handlePointerUp);
      canvas.addEventListener("wheel", handleWheel, { passive: false });
      canvas.addEventListener("contextmenu", preventContextMenu);
      document.addEventListener("visibilitychange", handleVisibility);
      if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(stage.parentElement || stage);
      }
      window.addEventListener("resize", resize);
      watchDevicePixelRatio();
      animationFrame = window.requestAnimationFrame(renderFrame);
    }

    function disposeScene() {
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      scene.traverse(function (object) {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) {
          const objectMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          objectMaterials.forEach(function (material) {
            materials.add(material);
            if (material.map) textures.add(material.map);
          });
        }
      });
      geometries.forEach(function (geometry) { geometry.dispose(); });
      materials.forEach(function (material) { material.dispose(); });
      textures.forEach(function (texture) { texture.dispose(); });
      scene.clear();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      if (dprMediaQuery && dprChangeHandler) {
        if (dprMediaQuery.removeEventListener) {
          dprMediaQuery.removeEventListener("change", dprChangeHandler);
        } else if (dprMediaQuery.removeListener) {
          dprMediaQuery.removeListener(dprChangeHandler);
        }
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("contextmenu", preventContextMenu);
      movements.forEach(function (movement) { movement.resolve(); });
      movements.clear();
      actors.forEach(function (actor) {
        actor.badge.remove();
      });
      disposeScene();
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    return {
      init: init,
      mount: mount,
      setPlayers: setPlayers,
      updateStats: updateStats,
      movePlayerAlongTiles: movePlayerAlongTiles,
      focusPlayer: focusPlayer,
      showTileEffect: showTileEffect,
      floatText: floatText,
      playerRetired: playerRetired,
      gameEnded: gameEnded,
      setFastAnimations: setFastAnimations,
      setOverview: setOverview,
      zoom: zoom,
      finishAnimations: finishAnimations,
      destroy: destroy
    };
  }

  window.Life3DView = { create: create };
}());
