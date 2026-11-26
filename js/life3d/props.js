// This file places original low-poly trees, buildings, and landmarks around the board.
(function () {
  "use strict";

  function seededRandom(seed) {
    let value = seed >>> 0;
    return function () {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function material(THREE, color, quality, extra) {
    const Material = quality === "lite" ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    return new Material(Object.assign({
      color: color,
      flatShading: true,
      roughness: 0.9
    }, extra || {}));
  }

  function nearRoad(x, z, samples, minimum) {
    for (let index = 0; index < samples.length; index += 2) {
      const point = samples[index];
      if (Math.hypot(point.x - x, point.z - z) < minimum) return true;
    }
    return false;
  }

  function safePosition(random, samples, occupied) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const x = -76 + random() * 152;
      const z = -81 + random() * 162;
      if (nearRoad(x, z, samples, 7)) continue;
      if (occupied.some(function (point) {
        return Math.hypot(point.x - x, point.z - z) < 3.2;
      })) continue;
      occupied.push({ x: x, z: z });
      return { x: x, z: z };
    }
    return null;
  }

  function addTrees(THREE, scene, heightAt, random, samples, quality, occupied) {
    const count = quality === "lite" ? 75 : 150;
    const foliageColors = ["#4c9f58", "#69b85c", "#80bf68", "#e8a0aa", "#f2a04b"];
    const treePositions = [];
    for (let index = 0; index < count; index += 1) {
      const point = safePosition(random, samples, occupied);
      if (point) treePositions.push(Object.assign(point, {
        scale: 1.1 + random() * 1.7,
        color: index % 20 === 0 ? 3 + Math.floor(index / 20) % 2 : index % 4
      }));
    }
    const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.6, 2.4, 6);
    const leafGeometry = new THREE.IcosahedronGeometry(1.7, 1);
    const trunkMaterial = material(THREE, "#9a704e", quality);
    const trunkInstances = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treePositions.length);
    const leaves = foliageColors.map(function (color, colorIndex) {
      const chosen = treePositions.filter(function (tree) {
        return tree.color === colorIndex;
      });
      const leafMaterial = material(THREE, color, quality);
      const mesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, chosen.length);
      const dummy = new THREE.Object3D();
      chosen.forEach(function (tree, index) {
        const height = heightAt(tree.x, tree.z);
        dummy.position.set(tree.x, height + tree.scale * 2.1, tree.z);
        dummy.rotation.set(random() * 0.18, random() * Math.PI, random() * 0.12);
        dummy.scale.set(tree.scale, tree.scale * (0.8 + random() * 0.35), tree.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.castShadow = true;
      scene.add(mesh);
      return { mesh: mesh, material: leafMaterial };
    });
    const dummy = new THREE.Object3D();
    treePositions.forEach(function (tree, index) {
      const height = heightAt(tree.x, tree.z);
      dummy.position.set(tree.x, height + tree.scale * 0.72, tree.z);
      dummy.rotation.y = random() * Math.PI;
      dummy.scale.set(tree.scale * 0.55, tree.scale * 0.9, tree.scale * 0.55);
      dummy.updateMatrix();
      trunkInstances.setMatrixAt(index, dummy.matrix);
    });
    trunkInstances.castShadow = true;
    scene.add(trunkInstances);
    return {
      count: treePositions.length,
      materials: [trunkMaterial].concat(leaves.map(function (entry) {
        return entry.material;
      })),
      geometries: [trunkGeometry, leafGeometry]
    };
  }

  function addRocks(THREE, scene, heightAt, random, samples, quality, occupied) {
    const count = quality === "lite" ? 30 : 70;
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const stone = material(THREE, "#9d927c", quality);
    const rockMesh = new THREE.InstancedMesh(geometry, stone, count);
    const dummy = new THREE.Object3D();
    let placed = 0;
    for (let index = 0; index < count; index += 1) {
      const point = safePosition(random, samples, occupied);
      if (!point) continue;
      const scale = 0.5 + random() * 1.25;
      dummy.position.set(point.x, heightAt(point.x, point.z) + scale * 0.45, point.z);
      dummy.rotation.set(random(), random() * Math.PI, random());
      dummy.scale.set(scale * 1.4, scale, scale);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }
    rockMesh.count = placed;
    rockMesh.castShadow = true;
    scene.add(rockMesh);
    return { materials: [stone], geometries: [geometry] };
  }

  function addGrass(THREE, scene, heightAt, random, samples, quality, occupied) {
    if (quality === "lite") return { materials: [], geometries: [] };
    const count = 320;
    const geometry = new THREE.ConeGeometry(0.22, 1.2, 4);
    const grassMaterial = material(THREE, "#70ad4f", quality);
    const grassMesh = new THREE.InstancedMesh(geometry, grassMaterial, count);
    const dummy = new THREE.Object3D();
    let placed = 0;
    for (let index = 0; index < count; index += 1) {
      const point = safePosition(random, samples, occupied);
      if (!point) continue;
      dummy.position.set(point.x, heightAt(point.x, point.z) + 0.6, point.z);
      dummy.rotation.y = random() * Math.PI;
      dummy.scale.setScalar(0.6 + random() * 0.9);
      dummy.updateMatrix();
      grassMesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }
    grassMesh.count = placed;
    scene.add(grassMesh);
    return { materials: [grassMaterial], geometries: [geometry] };
  }

  function addHouse(THREE, scene, point, height, quality, style) {
    const house = new THREE.Group();
    const wallColors = ["#f3d9ae", "#d9e8d0", "#f0c5ad", "#d5d9ef"];
    const wall = material(THREE, wallColors[style % wallColors.length], quality);
    const roof = material(THREE, ["#bd7866", "#806c8f", "#9d7657", "#5e7f70"][style % 4], quality);
    const windowMaterial = material(THREE, "#9bd5df", quality, { emissive: "#477a83", emissiveIntensity: 0.15 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.2, 3.8), wall);
    base.position.y = 1.6;
    const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.1, 4), roof);
    roofMesh.position.y = 4.1;
    roofMesh.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.7, 0.15), material(THREE, "#805c48", quality));
    door.position.set(0, 0.85, 1.98);
    const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.14), windowMaterial);
    windowMesh.position.set(-1.25, 2, 1.98);
    const secondWindow = windowMesh.clone();
    secondWindow.position.x = 1.25;
    house.add(base, roofMesh, door, windowMesh, secondWindow);
    house.position.set(point.x, height, point.z);
    house.rotation.y = style * 0.7;
    house.traverse(function (object) {
      if (object.isMesh) object.castShadow = true;
    });
    scene.add(house);
    return {
      group: house,
      materials: [wall, roof, windowMaterial, door.material],
      geometries: [base.geometry, roofMesh.geometry, door.geometry, windowMesh.geometry]
    };
  }

  function addStopLandmarks(THREE, scene, boardData, trackData, heightAt, quality) {
    const landmarks = [];
    const stopSpaces = boardData.spaces.filter(function (space) {
      return boardData.stopTypes.indexOf(space.type) !== -1;
    });
    stopSpaces.forEach(function (space, index) {
      const tile = trackData.tileCenters.get(space.id);
      if (!tile) return;
      const angle = tile.angle * Math.PI / 180;
      const point = {
        x: tile.x - Math.sin(angle) * 14,
        z: tile.z + Math.cos(angle) * 14
      };
      const height = heightAt(point.x, point.z);
      const style = index;
      const house = addHouse(THREE, scene, point, height, quality, style);
      landmarks.push(house);
      if (space.type === "marriage") {
        const archMaterial = material(THREE, "#e892ae", quality);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.22, 7, 20, Math.PI), archMaterial);
        arch.position.set(point.x, height + 3.1, point.z + 3);
        arch.rotation.z = Math.PI;
        scene.add(arch);
        landmarks.push({ materials: [archMaterial], geometries: [arch.geometry] });
      }
    });
    return landmarks;
  }

  function addHeroLandmarks(THREE, scene, heightAt, quality) {
    const assets = [];
    const lighthouse = new THREE.Group();
    const white = material(THREE, "#f7f1dc", quality);
    const red = material(THREE, "#d9665d", quality);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 11, 8), white);
    tower.position.y = 5.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.2, 8), red);
    roof.position.y = 12;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 10, 7),
      material(THREE, "#fff0a8", quality, { emissive: "#ffe39b", emissiveIntensity: 0.8 })
    );
    lamp.position.y = 10.1;
    lighthouse.add(tower, roof, lamp);
    lighthouse.position.set(68, heightAt(68, 62), 62);
    scene.add(lighthouse);
    assets.push({ materials: [white, red, lamp.material], geometries: [tower.geometry, roof.geometry, lamp.geometry] });

    const windmill = new THREE.Group();
    const wood = material(THREE, "#96714e", quality);
    const millBody = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.3, 8, 6), wood);
    millBody.position.y = 4;
    const blades = new THREE.Group();
    const bladeMaterial = material(THREE, "#fff0ce", quality);
    for (let index = 0; index < 4; index += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.5, 0.2), bladeMaterial);
      blade.position.y = 3;
      blade.rotation.z = index * Math.PI / 2;
      blades.add(blade);
    }
    blades.position.y = 7;
    windmill.add(millBody, blades);
    windmill.position.set(-51, heightAt(-51, 45), 45);
    scene.add(windmill);
    assets.push({ materials: [wood, bladeMaterial], geometries: [millBody.geometry].concat(blades.children.map(function (blade) {
      return blade.geometry;
    })) });

    const wheelTower = new THREE.Group();
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.48, 8, 24),
      material(THREE, "#ed8d92", quality)
    );
    wheel.position.y = 8;
    const center = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.4, 10), material(THREE, "#f5d166", quality));
    center.position.y = 8;
    center.rotation.x = Math.PI / 2;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), wood);
    stand.position.y = 4;
    wheelTower.add(wheel, center, stand);
    wheelTower.position.set(-8, heightAt(-8, -66), -66);
    scene.add(wheelTower);
    assets.push({ materials: [wheel.material, center.material, wood], geometries: [wheel.geometry, center.geometry, stand.geometry] });

    const ride = new THREE.Group();
    const rideRed = material(THREE, "#e45e55", quality);
    [-1, 1].forEach(function (side) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(8, 0.5, 8, 24, Math.PI), rideRed);
      arc.rotation.z = Math.PI;
      arc.position.x = side * 4.5;
      ride.add(arc);
    });
    ride.position.set(-67, heightAt(-67, 0), 0);
    scene.add(ride);
    assets.push({ materials: [rideRed], geometries: ride.children.map(function (child) {
      return child.geometry;
    }) });

    return {
      assets: assets,
      update: function (delta) {
        blades.rotation.z += delta * 0.35;
        wheel.rotation.z += delta * 0.16;
      }
    };
  }

  function addPark(THREE, scene, boardData, trackData, heightAt, quality) {
    const start = trackData.tileCenters.get(boardData.mainStart);
    if (!start) return { update: function () {}, materials: [], geometries: [] };
    const angle = start.angle * Math.PI / 180;
    const x = start.x - Math.sin(angle) * 14;
    const z = start.z + Math.cos(angle) * 14;
    const ground = heightAt(x, z);
    const plazaMaterial = material(THREE, "#e5d7b6", quality);
    const stone = material(THREE, "#b7b2a1", quality);
    const water = material(THREE, "#59c8df", quality, {
      emissive: "#24869b",
      emissiveIntensity: 0.18
    });
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.22, 24), plazaMaterial);
    plaza.position.set(x, ground + 0.12, z);
    scene.add(plaza);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 14), stone);
    pool.position.set(x, ground + 0.42, z);
    scene.add(pool);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.22, 12), stone);
    basin.position.set(x, ground + 1.2, z);
    scene.add(basin);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.2, 8), stone);
    stem.position.set(x, ground + 0.95, z);
    scene.add(stem);
    const waterSurface = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 0.08, 16), water);
    waterSurface.position.set(x, ground + 0.72, z);
    scene.add(waterSurface);

    const benchWood = material(THREE, "#a77a4f", quality);
    const benchLegs = material(THREE, "#596d69", quality);
    const benches = [];
    for (let index = 0; index < 4; index += 1) {
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.65), benchWood);
      seat.position.y = 0.75;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 0.16), benchWood);
      back.position.set(0, 1.18, -0.23);
      const legGeometry = new THREE.BoxGeometry(0.16, 0.65, 0.16);
      [[-1, 0], [1, 0]].forEach(function (side) {
        const leg = new THREE.Mesh(legGeometry, benchLegs);
        leg.position.set(side[0] * 0.9, 0.34, side[1]);
        bench.add(leg);
      });
      bench.add(seat, back);
      const benchAngle = index * Math.PI / 2;
      bench.position.set(
        x + Math.cos(benchAngle) * 5.2,
        heightAt(x + Math.cos(benchAngle) * 5.2, z + Math.sin(benchAngle) * 5.2),
        z + Math.sin(benchAngle) * 5.2
      );
      bench.rotation.y = -benchAngle;
      scene.add(bench);
      benches.push(bench);
    }

    const birdGeometry = new THREE.IcosahedronGeometry(0.28, 0);
    const birdMaterial = material(THREE, "#596b70", quality);
    const birds = [];
    for (let index = 0; index < (quality === "lite" ? 0 : 3); index += 1) {
      const bird = new THREE.Mesh(birdGeometry, birdMaterial);
      bird.position.set(x + (index - 1) * 2.2, ground + 0.5, z + 2.8);
      bird.scale.set(1.3, 0.65, 0.8);
      scene.add(bird);
      birds.push(bird);
    }

    const dropGeometry = new THREE.SphereGeometry(0.13, 6, 5);
    const dropMaterial = new THREE.MeshBasicMaterial({ color: "#b7f4ff" });
    const drops = [];
    for (let index = 0; index < 8; index += 1) {
      const drop = new THREE.Mesh(dropGeometry, dropMaterial);
      scene.add(drop);
      drops.push(drop);
    }
    let elapsed = 0;
    return {
      materials: [plazaMaterial, stone, water, benchWood, benchLegs, birdMaterial, dropMaterial],
      geometries: [
        plaza.geometry, pool.geometry, basin.geometry, stem.geometry, waterSurface.geometry,
        birdGeometry, dropGeometry
      ].concat(benches.reduce(function (all, bench) {
        return all.concat(bench.children.map(function (child) { return child.geometry; }));
      }, [])),
      update: function (delta) {
        elapsed += delta * 1000;
        drops.forEach(function (drop, index) {
          const progress = ((elapsed + index * window.LIFE_TIMING.fountainCycle / drops.length) %
            window.LIFE_TIMING.fountainCycle) / window.LIFE_TIMING.fountainCycle;
          const radius = 0.35 + progress * 0.9;
          drop.position.set(
            x + Math.cos(index * Math.PI / 4) * radius,
            ground + 1.15 + Math.sin(progress * Math.PI) * 2.2,
            z + Math.sin(index * Math.PI / 4) * radius
          );
        });
      }
    };
  }

  function create(THREE, scene, boardData, trackData, heightAt, quality) {
    const random = seededRandom(boardData.scenerySeed);
    const occupied = [];
    const treeAssets = addTrees(
      THREE, scene, heightAt, random, trackData.samples.concat(trackData.branchSamples), quality, occupied
    );
    const rockAssets = addRocks(
      THREE, scene, heightAt, random, trackData.samples.concat(trackData.branchSamples), quality, occupied
    );
    const grassAssets = addGrass(
      THREE, scene, heightAt, random, trackData.samples.concat(trackData.branchSamples), quality, occupied
    );

    const houses = [];
    for (let index = 0; index < (quality === "lite" ? 7 : 14); index += 1) {
      const point = safePosition(random, trackData.samples, occupied);
      if (!point) continue;
      houses.push(addHouse(THREE, scene, point, heightAt(point.x, point.z), quality, index));
    }
    const landmarks = addStopLandmarks(THREE, scene, boardData, trackData, heightAt, quality);
    const hero = addHeroLandmarks(THREE, scene, heightAt, quality);
    const park = addPark(THREE, scene, boardData, trackData, heightAt, quality);
    const allAssets = [treeAssets, rockAssets, grassAssets, park]
      .concat(houses, landmarks, hero.assets);
    return {
      update: function (delta) {
        hero.update(delta);
        park.update(delta);
      },
      dispose: function () {
        allAssets.forEach(function (asset) {
          if (asset.group && asset.group.parent) asset.group.parent.remove(asset.group);
          (asset.materials || []).forEach(function (entry) { entry.dispose(); });
          (asset.geometries || []).forEach(function (entry) { entry.dispose(); });
        });
      }
    };
  }

  window.Life3DProps = { create: create };
}());
