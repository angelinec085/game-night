// This file builds the island, sea, sky, and river from simple shapes and seeded noise.
(function () {
  "use strict";

  function smoothstep(edge0, edge1, value) {
    const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return amount * amount * (3 - 2 * amount);
  }

  function hash(x, z, seed) {
    let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  }

  function valueNoise(x, z, seed) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const tx = x - x0;
    const tz = z - z0;
    const sx = tx * tx * (3 - 2 * tx);
    const sz = tz * tz * (3 - 2 * tz);
    const a = hash(x0, z0, seed);
    const b = hash(x0 + 1, z0, seed);
    const c = hash(x0, z0 + 1, seed);
    const d = hash(x0 + 1, z0 + 1, seed);
    const top = a + (b - a) * sx;
    const bottom = c + (d - c) * sx;
    return top + (bottom - top) * sz;
  }

  function boardToWorld(point) {
    return {
      x: (point[0] - 800) * 0.1,
      z: (point[1] - 850) * 0.1
    };
  }

  function nearestLinePoint(x, z, line) {
    let nearest = null;
    let distance = Infinity;
    for (let index = 0; index < line.length - 1; index += 1) {
      const start = line[index];
      const end = line[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSquared = dx * dx + dz * dz || 1;
      const fraction = Math.max(0, Math.min(1,
        ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared));
      const pointX = start.x + dx * fraction;
      const pointZ = start.z + dz * fraction;
      const pointDistance = Math.hypot(x - pointX, z - pointZ);
      if (pointDistance < distance) {
        distance = pointDistance;
        nearest = {
          distance: pointDistance,
          x: pointX,
          z: pointZ,
          height: start.height + (end.height - start.height) * fraction
        };
      }
    }
    return nearest;
  }

  function roundedIslandMask(x, z) {
    const halfWidth = 79;
    const halfDepth = 84;
    const radius = 19;
    const qx = Math.abs(x) - (halfWidth - radius);
    const qz = Math.abs(z) - (halfDepth - radius);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
    const inside = Math.min(Math.max(qx, qz), 0);
    const signedDistance = outside + inside - radius;
    return 1 - smoothstep(-1.5, 8, signedDistance);
  }

  function createNoiseHeight(x, z, seed) {
    return 0.5 +
      (valueNoise(x * 0.055, z * 0.055, seed) - 0.5) * 4.2 +
      (valueNoise(x * 0.018, z * 0.018, seed + 97) - 0.5) * 5.4;
  }

  function buildHeightField(trackData, seed) {
    const lines = [trackData.samples, trackData.branchSamples];
    lines.forEach(function (line) {
      line.forEach(function (point) {
        point.height = createNoiseHeight(point.x, point.z, seed);
      });
      const rawHeights = line.map(function (point, index) {
        let total = 0;
        let count = 0;
        for (let offset = -2; offset <= 2; offset += 1) {
          const neighbor = line[Math.max(0, Math.min(line.length - 1, index + offset))];
          total += neighbor.height;
          count += 1;
        }
        return total / count;
      });
      line.forEach(function (point, index) {
        point.height = rawHeights[index];
      });
    });

    return function sampleHeight(x, z) {
      const mask = roundedIslandMask(x, z);
      const landHeight = createNoiseHeight(x, z, seed) * mask + (-8 * (1 - mask));
      const riverDistance = Math.abs(z + 18 - Math.sin(x * 0.04) * 1.3);
      const riverCarve = 1 - smoothstep(3.2, 5.8, riverDistance);
      let height = landHeight - riverCarve * 2;
      const bridgeZone = Math.abs(x - 68) < 7 && riverDistance < 7;
      if (!bridgeZone) {
        const nearest = lines.map(function (line) {
          return nearestLinePoint(x, z, line);
        }).filter(Boolean).sort(function (first, second) {
          return first.distance - second.distance;
        })[0];
        if (nearest && nearest.distance < 12) {
          const flatten = 1 - smoothstep(5, 12, nearest.distance);
          height += (nearest.height - height) * flatten;
        }
      }
      return height;
    };
  }

  function gradientTexture(THREE) {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#6ec3ff");
    gradient.addColorStop(1, "#e6f7ff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function surfaceMaterial(THREE, quality, options) {
    const Material = quality === "lite" ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    return new Material(options);
  }

  function waveTexture(THREE, lineColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    context.strokeStyle = lineColor;
    context.lineWidth = 3;
    for (let row = 10; row < canvas.height; row += 32) {
      context.beginPath();
      for (let x = 0; x <= canvas.width; x += 8) {
        const y = row + Math.sin(x * 0.025 + row) * 5;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
    return texture;
  }

  function foamCurve(THREE) {
    const points = [];
    const corners = [
      [-60, -84, -19], [60, -84, -19],
      [79, -65, -19], [79, 65, -19],
      [60, 84, -19], [-60, 84, -19],
      [-79, 65, -19], [-79, -65, -19]
    ];
    corners.forEach(function (corner) {
      points.push(new THREE.Vector3(corner[0], corner[2], corner[1]));
    });
    return new THREE.CatmullRomCurve3(points, true, "centripetal");
  }

  function addClouds(THREE, group, quality) {
    const cloudMaterial = surfaceMaterial(THREE, quality, {
      color: "#ffffff",
      roughness: 1,
      flatShading: true
    });
    const geometry = new THREE.IcosahedronGeometry(4.5, 1);
    for (let index = 0; index < 9; index += 1) {
      const cloud = new THREE.Group();
      const pieces = 3 + index % 3;
      for (let piece = 0; piece < pieces; piece += 1) {
        const puff = new THREE.Mesh(geometry, cloudMaterial);
        puff.position.set(piece * 3.2 - pieces * 1.5, (piece % 2) * 1.1, 0);
        puff.scale.set(1.05, 0.75 + (piece % 2) * 0.18, 0.85);
        cloud.add(puff);
      }
      cloud.position.set(-95 + (index * 23) % 190, 25 + (index % 3) * 3, -95 + (index * 41) % 190);
      cloud.userData.drift = 0.7 + index * 0.06;
      group.add(cloud);
    }
  }

  function addTerrain(THREE, scene, sampleHeight, quality) {
    const geometry = new THREE.PlaneGeometry(210, 220, 160, 160);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const colors = [];
    const grass = new THREE.Color("#98d24a");
    const hillGrass = new THREE.Color("#7fc23f");
    const tan = new THREE.Color("#e8c88a");
    const cliff = new THREE.Color("#b9814f");
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const height = sampleHeight(x, z);
      positions.setY(index, height);
      const slope = Math.hypot(
        sampleHeight(x + 0.5, z) - sampleHeight(x - 0.5, z),
        sampleHeight(x, z + 0.5) - sampleHeight(x, z - 0.5)
      );
      const color = grass.clone().lerp(hillGrass, smoothstep(0, 6, height));
      if (slope > 0.55) color.lerp(tan, smoothstep(0.55, 1.4, slope));
      if (slope > 1.4 && height > -3) color.lerp(cliff, smoothstep(1.4, 2.4, slope));
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const terrainMaterial = surfaceMaterial(THREE, quality, {
      vertexColors: true,
      flatShading: true,
      roughness: 1
    });
    const terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.receiveShadow = true;
    terrain.name = "life-island-terrain";
    scene.add(terrain);
    return terrain;
  }

  function create(THREE, scene, boardData, trackData, quality) {
    const seed = boardData.scenerySeed >>> 0;
    const sampleHeight = buildHeightField(trackData, seed);
    const terrain = addTerrain(THREE, scene, sampleHeight, quality);
    const skyTexture = gradientTexture(THREE);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(480, 40, 24),
      new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide })
    );
    sky.name = "life-sky";
    scene.add(sky);

    const seaGeometry = new THREE.PlaneGeometry(600, 600);
    seaGeometry.rotateX(-Math.PI / 2);
    const seaMaterial = surfaceMaterial(THREE, quality, {
      color: "#2fa8e0",
      roughness: 0.4,
      metalness: 0.05
    });
    const sea = new THREE.Mesh(seaGeometry, seaMaterial);
    sea.position.y = -4;
    sea.receiveShadow = true;
    scene.add(sea);

    const waveTextureA = waveTexture(THREE, "rgba(255,255,255,.32)");
    const waveTextureB = waveTexture(THREE, "rgba(195,245,255,.28)");
    const waveA = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshBasicMaterial({ map: waveTextureA, transparent: true, depthWrite: false })
    );
    waveA.rotation.x = -Math.PI / 2;
    waveA.position.y = -3.92;
    const waveB = waveA.clone();
    waveB.material = new THREE.MeshBasicMaterial({
      map: waveTextureB,
      transparent: true,
      depthWrite: false,
      opacity: 0.7
    });
    waveB.position.y = -3.88;
    scene.add(waveA, waveB);

    const foamMaterial = new THREE.MeshBasicMaterial({
      color: "#e8fff5",
      transparent: true,
      opacity: 0.65
    });
    const foam = new THREE.Mesh(new THREE.TubeGeometry(foamCurve(THREE), 180, 0.7, 5, true), foamMaterial);
    scene.add(foam);

    const clouds = new THREE.Group();
    addClouds(THREE, clouds, quality);
    scene.add(clouds);

    const riverMaterial = surfaceMaterial(THREE, quality, {
      color: "#58c9e6",
      roughness: 0.25,
      metalness: 0.05
    });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(190, 8), riverMaterial);
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, -0.5, -18);
    scene.add(river);

    const riverShine = new THREE.Mesh(
      new THREE.PlaneGeometry(190, 1.2),
      new THREE.MeshBasicMaterial({ color: "#b5f4fb", transparent: true, opacity: 0.7 })
    );
    riverShine.rotation.x = -Math.PI / 2;
    riverShine.position.set(0, -0.42, -18);
    scene.add(riverShine);

    const hemi = new THREE.HemisphereLight("#bfe6ff", "#8fbf5a", 0.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff3d6", 0.9);
    sun.position.set(-35, 55, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    scene.add(sun, sun.target);

    return {
      sampleHeight: sampleHeight,
      terrain: terrain,
      sun: sun,
      followShadows: function (target) {
        sun.target.position.set(target.x, target.y, target.z);
        sun.position.set(target.x - 35, target.y + 55, target.z + 28);
      },
      update: function (delta) {
        waveTextureA.offset.x += delta * window.LIFE_TIMING.waveDriftPrimary;
        waveTextureB.offset.x -= delta * window.LIFE_TIMING.waveDriftSecondary;
        clouds.children.forEach(function (cloud) {
          cloud.position.x += delta * cloud.userData.drift * window.LIFE_TIMING.cloudDrift;
          if (cloud.position.x > 110) cloud.position.x = -110;
        });
      },
      dispose: function () {
        terrain.geometry.dispose();
        terrain.material.dispose();
        sky.geometry.dispose();
        sky.material.dispose();
        skyTexture.dispose();
        sea.geometry.dispose();
        sea.material.dispose();
        waveA.geometry.dispose();
        waveA.material.dispose();
        waveB.material.dispose();
        waveTextureA.dispose();
        waveTextureB.dispose();
        foam.geometry.dispose();
        foam.material.dispose();
        river.geometry.dispose();
        river.material.dispose();
        riverShine.geometry.dispose();
        riverShine.material.dispose();
        clouds.traverse(function (object) {
          if (object.isMesh) {
            object.geometry.dispose();
            object.material.dispose();
          }
        });
      }
    };
  }

  window.Life3DWorld = { create: create, boardToWorld: boardToWorld };
}());
