// This file turns Life Path's existing tile positions into 3D roads and colorful tile slabs.
(function () {
  "use strict";

  function boardToWorld(point) {
    return window.Life3DWorld.boardToWorld(point);
  }

  function surfaceMaterial(THREE, quality, options) {
    const Material = quality === "lite" ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    return new Material(options);
  }

  function curveFromWaypoints(THREE, points) {
    return new THREE.CatmullRomCurve3(points.map(function (point) {
      const worldPoint = boardToWorld(point);
      return new THREE.Vector3(worldPoint.x, 0, worldPoint.z);
    }), false, "centripetal");
  }

  function makeData(THREE, boardData) {
    const mainCurve = curveFromWaypoints(THREE, boardData.mainWaypoints);
    const mainSpaces = boardData.spaces.filter(function (space) {
      return space.id.charAt(0) === "m";
    }).sort(function (first, second) {
      return Number(first.id.slice(1)) - Number(second.id.slice(1));
    });
    const collegeSpaces = boardData.spaces.filter(function (space) {
      return space.id.charAt(0) === "c";
    }).sort(function (first, second) {
      return Number(first.id.slice(1)) - Number(second.id.slice(1));
    });
    const entry = mainSpaces[boardData.collegeEntryIndex];
    const merge = mainSpaces[boardData.collegeMergeIndex];
    const collegeCurve = curveFromWaypoints(THREE,
      [[entry.x, entry.y]].concat(boardData.collegeWaypoints, [[merge.x, merge.y]]));
    const samples = mainCurve.getPoints(200).map(function (point) {
      return { x: point.x, z: point.z, height: 0 };
    });
    const branchSamples = collegeCurve.getPoints(60).map(function (point) {
      return { x: point.x, z: point.z, height: 0 };
    });
    const tileCenters = new Map();
    boardData.spaces.forEach(function (space) {
      const worldPoint = boardToWorld([space.x, space.y]);
      tileCenters.set(space.id, {
        x: worldPoint.x,
        z: worldPoint.z,
        angle: Number(space.angle || 0),
        type: space.type
      });
    });
    return {
      mainCurve: mainCurve,
      collegeCurve: collegeCurve,
      mainSpaces: mainSpaces,
      collegeSpaces: collegeSpaces,
      samples: samples,
      branchSamples: branchSamples,
      tileCenters: tileCenters
    };
  }

  function stripGeometry(THREE, points, width, offset, heightAt) {
    const positions = [];
    const indices = [];
    points.forEach(function (point, index) {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const sideX = -dz / length;
      const sideZ = dx / length;
      const centerX = point.x + sideX * offset;
      const centerZ = point.z + sideZ * offset;
      const height = heightAt(centerX, centerZ) + 0.22;
      const half = width / 2;
      positions.push(
        centerX - sideX * half, height, centerZ - sideZ * half,
        centerX + sideX * half, height, centerZ + sideZ * half
      );
      if (index < points.length - 1) {
        const left = index * 2;
        indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function canvasTexture(THREE, type, color, label) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, 256, 256);
    context.lineWidth = 12;
    context.strokeStyle = "#ffffff";
    context.strokeRect(8, 8, 240, 240);
    context.save();
    context.translate(128, 128);
    context.strokeStyle = "#fffdf3";
    context.fillStyle = "#fffdf3";
    context.lineWidth = 8;
    context.lineJoin = "round";
    context.lineCap = "round";
    if (type === "event") {
      for (let radius = 40; radius <= 88; radius += 24) {
        context.beginPath();
        for (let side = 0; side < 8; side += 1) {
          const angle = side * Math.PI / 4 - Math.PI / 8;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (side === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.stroke();
      }
    } else if (type === "payday") {
      context.strokeRect(-78, -48, 156, 96);
      context.beginPath();
      context.arc(0, 0, 25, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-60, -25); context.lineTo(-45, -25);
      context.moveTo(45, 25); context.lineTo(60, 25);
      context.stroke();
    } else if (type === "activity") {
      context.beginPath();
      context.moveTo(-86, 0);
      context.bezierCurveTo(-40, -80, 40, 80, 86, 0);
      context.bezierCurveTo(40, -80, -40, 80, -86, 0);
      context.stroke();
    } else if (type === "milestone") {
      context.beginPath();
      context.moveTo(0, 76);
      context.bezierCurveTo(-112, 6, -72, -70, -18, -38);
      context.bezierCurveTo(0, -108, 80, -70, 0, 76);
      context.fill();
    } else if (type === "opportunity") {
      context.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const radius = point % 2 ? 35 : 85;
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (point === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
    } else if (type === "setback") {
      context.strokeRect(-76, -36, 152, 86);
      for (let x = -48; x <= 48; x += 32) {
        context.beginPath();
        context.moveTo(x, -25);
        context.lineTo(x, 36);
        context.stroke();
      }
      context.beginPath();
      context.moveTo(-86, -38); context.lineTo(0, -80); context.lineTo(86, -38);
      context.stroke();
    } else if (type === "boost") {
      for (let row = -48; row <= 48; row += 48) {
        context.beginPath();
        context.moveTo(-62, row - 20);
        context.lineTo(0, row + 20);
        context.lineTo(62, row - 20);
        context.stroke();
      }
    } else if (type === "college" || type === "graduation") {
      context.beginPath();
      context.moveTo(-82, -50); context.quadraticCurveTo(-40, -70, 0, -42);
      context.quadraticCurveTo(40, -70, 82, -50); context.lineTo(82, 54);
      context.quadraticCurveTo(40, 34, 0, 62); context.quadraticCurveTo(-40, 34, -82, 54);
      context.closePath();
      context.stroke();
      context.beginPath(); context.moveTo(0, -42); context.lineTo(0, 62); context.stroke();
    } else if (type === "start") {
      context.font = "bold 50px Arial";
      context.textAlign = "center";
      context.fillText("START", 0, 15);
      for (let x = -120; x < 120; x += 30) {
        context.fillStyle = (x / 30) % 2 ? "#ffffff" : "#4b5a4b";
        context.fillRect(x, 72, 30, 30);
      }
    } else if (type === "stop") {
      context.font = "bold 52px Arial";
      context.textAlign = "center";
      context.fillText("STOP", 0, 15);
      context.font = "64px Arial";
      context.fillText(label || "✦", 0, -46);
    } else {
      context.font = "bold 88px Arial";
      context.textAlign = "center";
      context.fillText(label || "✦", 0, 30);
    }
    context.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function createTileMaterials(THREE, boardData, quality) {
    const side = surfaceMaterial(THREE, quality, { color: "#edf0e9", roughness: 0.88 });
    const materials = {};
    Object.keys(boardData.legendTypes).forEach(function (type) {
      const info = boardData.legendTypes[type];
      materials[type] = surfaceMaterial(THREE, quality, {
        map: canvasTexture(THREE, type, info.color, info.emoji),
        roughness: 0.8
      });
    });
    materials.start = surfaceMaterial(THREE, quality, {
      map: canvasTexture(THREE, "start", "#ffd51e", "START"),
      roughness: 0.8
    });
    materials.college = surfaceMaterial(THREE, quality, {
      map: canvasTexture(THREE, "college", "#a58bf0", "📖"),
      roughness: 0.8
    });
    materials.graduation = surfaceMaterial(THREE, quality, {
      map: canvasTexture(THREE, "college", "#a58bf0", "🎓"),
      roughness: 0.8
    });
    materials.stop = surfaceMaterial(THREE, quality, {
      map: canvasTexture(THREE, "stop", "#e8352b", "✦"),
      roughness: 0.8
    });
    return { top: materials, side: side };
  }

  function addLamps(THREE, scene, spaces, heightAt, quality) {
    const chosen = spaces.filter(function (_, index) {
      return index % 6 === 0;
    });
    const postGeometry = new THREE.CylinderGeometry(0.1, 0.18, 4.2, 6);
    const postMaterial = surfaceMaterial(THREE, quality, { color: "#f6f0dc", roughness: 0.7 });
    const lampGeometry = new THREE.IcosahedronGeometry(0.45, 1);
    const lampMaterial = surfaceMaterial(THREE, quality, {
      color: "#fff8d8",
      emissive: "#fff0a8",
      emissiveIntensity: 0.5,
      flatShading: true
    });
    const posts = new THREE.InstancedMesh(postGeometry, postMaterial, chosen.length);
    const globes = new THREE.InstancedMesh(lampGeometry, lampMaterial, chosen.length);
    const dummy = new THREE.Object3D();
    chosen.forEach(function (space, index) {
      const point = boardToWorld([space.x, space.y]);
      const side = index % 2 ? -1 : 1;
      const tangent = (Number(space.angle || 0) * Math.PI) / 180;
      const x = point.x - Math.sin(tangent) * 6.3 * side;
      const z = point.z + Math.cos(tangent) * 6.3 * side;
      const y = heightAt(x, z);
      dummy.position.set(x, y + 2.1, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      posts.setMatrixAt(index, dummy.matrix);
      dummy.position.set(x, y + 4.3, z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      globes.setMatrixAt(index, dummy.matrix);
    });
    posts.castShadow = true;
    scene.add(posts, globes);
    return {
      objects: [posts, globes],
      assets: [postGeometry, postMaterial, lampGeometry, lampMaterial]
    };
  }

  function addCurbProps(THREE, scene, spaces, heightAt, quality) {
    const hedgeSpaces = spaces.filter(function (_, index) {
      return index % 4 === 2;
    });
    const benchSpaces = spaces.filter(function (_, index) {
      return index % 8 === 4;
    });
    const hedgeGeometry = new THREE.IcosahedronGeometry(0.9, 0);
    const hedgeMaterial = surfaceMaterial(THREE, quality, { color: "#5e9d55", flatShading: true });
    const hedges = new THREE.InstancedMesh(hedgeGeometry, hedgeMaterial, hedgeSpaces.length);
    const potGeometry = new THREE.CylinderGeometry(0.28, 0.34, 0.48, 7);
    const potMaterial = surfaceMaterial(THREE, quality, { color: "#cf9474" });
    const pots = new THREE.InstancedMesh(potGeometry, potMaterial, hedgeSpaces.length);
    const flowerGeometry = new THREE.IcosahedronGeometry(0.23, 0);
    const flowerMaterial = surfaceMaterial(THREE, quality, { color: "#f3c968", flatShading: true });
    const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, hedgeSpaces.length);
    const hedgeDummy = new THREE.Object3D();
    const potDummy = new THREE.Object3D();
    hedgeSpaces.forEach(function (space, index) {
      const point = boardToWorld([space.x, space.y]);
      const angle = Number(space.angle || 0) * Math.PI / 180;
      const side = index % 2 ? -1 : 1;
      const x = point.x - Math.sin(angle) * 6.8 * side;
      const z = point.z + Math.cos(angle) * 6.8 * side;
      const height = heightAt(x, z);
      hedgeDummy.position.set(x, height + 0.55, z);
      hedgeDummy.scale.set(1.3, 0.75, 0.85);
      hedgeDummy.updateMatrix();
      hedges.setMatrixAt(index, hedgeDummy.matrix);
      potDummy.position.set(x + Math.cos(angle) * 1.4, height + 0.24, z + Math.sin(angle) * 1.4);
      potDummy.scale.setScalar(1);
      potDummy.updateMatrix();
      pots.setMatrixAt(index, potDummy.matrix);
      hedgeDummy.position.set(potDummy.position.x, height + 0.68, potDummy.position.z);
      hedgeDummy.scale.setScalar(0.45);
      hedgeDummy.updateMatrix();
      flowers.setMatrixAt(index, hedgeDummy.matrix);
    });
    scene.add(hedges, pots, flowers);

    const seatGeometry = new THREE.BoxGeometry(2.6, 0.24, 0.72);
    const backGeometry = new THREE.BoxGeometry(2.6, 0.86, 0.2);
    const legGeometry = new THREE.BoxGeometry(0.18, 0.72, 0.18);
    const wood = surfaceMaterial(THREE, quality, { color: "#a77a4f" });
    const metal = surfaceMaterial(THREE, quality, { color: "#596d69" });
    const seats = new THREE.InstancedMesh(seatGeometry, wood, benchSpaces.length);
    const backs = new THREE.InstancedMesh(backGeometry, wood, benchSpaces.length);
    const legs = new THREE.InstancedMesh(legGeometry, metal, benchSpaces.length * 4);
    const dummy = new THREE.Object3D();
    benchSpaces.forEach(function (space, index) {
      const point = boardToWorld([space.x, space.y]);
      const angle = Number(space.angle || 0) * Math.PI / 180;
      const side = index % 2 ? -1 : 1;
      const x = point.x - Math.sin(angle) * 7.6 * side;
      const z = point.z + Math.cos(angle) * 7.6 * side;
      const height = heightAt(x, z);
      dummy.position.set(x, height + 0.9, z);
      dummy.rotation.y = -angle;
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      seats.setMatrixAt(index, dummy.matrix);
      dummy.position.y = height + 1.42;
      dummy.updateMatrix();
      backs.setMatrixAt(index, dummy.matrix);
      [[-1.05, -0.22], [1.05, -0.22], [-1.05, 0.22], [1.05, 0.22]]
        .forEach(function (offset, legIndex) {
          const localX = offset[0] * Math.cos(angle) - offset[1] * Math.sin(angle);
          const localZ = offset[0] * Math.sin(angle) + offset[1] * Math.cos(angle);
          dummy.position.set(x + localX, height + 0.36, z + localZ);
          dummy.updateMatrix();
          legs.setMatrixAt(index * 4 + legIndex, dummy.matrix);
        });
    });
    scene.add(seats, backs, legs);
  }

  function addCollegeSign(THREE, scene, boardData, heightAt, quality) {
    const entry = boardData.spaces.find(function (space) {
      return space.id === "m" + boardData.collegeEntryIndex;
    });
    if (!entry) return [];
    const point = boardToWorld([entry.x, entry.y]);
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 3.5, 6),
      surfaceMaterial(THREE, quality, { color: "#806446" })
    );
    pole.position.y = 1.75;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1.5, 0.25),
      surfaceMaterial(THREE, quality, { color: "#a58bf0", roughness: 0.8 })
    );
    board.position.set(0, 3.7, 0);
    const textCanvas = document.createElement("canvas");
    textCanvas.width = 256;
    textCanvas.height = 96;
    const context = textCanvas.getContext("2d");
    context.fillStyle = "#a58bf0";
    context.fillRect(0, 0, 256, 96);
    context.fillStyle = "#ffffff";
    context.font = "bold 48px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("COLLEGE", 128, 48);
    const texture = new THREE.CanvasTexture(textCanvas);
    texture.encoding = THREE.sRGBEncoding;
    board.material.map = texture;
    board.material.needsUpdate = true;
    group.add(pole, board);
    group.position.set(point.x + 5, heightAt(point.x + 5, point.z), point.z - 5);
    scene.add(group);
    return {
      object: group,
      assets: [pole.geometry, pole.material, board.geometry, board.material, texture]
    };
  }

  function addBridge(THREE, scene, trackData, heightAt, quality) {
    let nearest = trackData.samples[0];
    let nearestDistance = Infinity;
    trackData.samples.forEach(function (point) {
      const distance = Math.hypot(point.x - 68, point.z + 18);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = point;
      }
    });
    const before = trackData.samples[Math.max(0,
      trackData.samples.indexOf(nearest) - 1)];
    const after = trackData.samples[Math.min(trackData.samples.length - 1,
      trackData.samples.indexOf(nearest) + 1)];
    const yaw = Math.atan2(after.x - before.x, after.z - before.z);
    const baseY = heightAt(68, -18) + 0.3;
    const bridge = new THREE.Group();
    const stone = surfaceMaterial(THREE, quality, { color: "#b3b0a7", roughness: 0.92 });
    const rail = surfaceMaterial(THREE, quality, { color: "#e5dfd1", roughness: 0.86 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 16), stone);
    deck.position.y = 0.45;
    deck.receiveShadow = true;
    bridge.add(deck);
    [-1, 1].forEach(function (side) {
      const railMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 16), rail);
      railMesh.position.set(side * 5.7, 1.25, 0);
      bridge.add(railMesh);
      [-5, 0, 5].forEach(function (offset) {
        const support = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 1.1), stone);
        support.position.set(side * 4.8, -1.7, offset);
        bridge.add(support);
      });
    });
    const archPoints = [
      new THREE.Vector3(-5.4, -0.4, 0),
      new THREE.Vector3(-4, 1.2, 0),
      new THREE.Vector3(-2, 2.2, 0),
      new THREE.Vector3(0, 2.5, 0),
      new THREE.Vector3(2, 2.2, 0),
      new THREE.Vector3(4, 1.2, 0),
      new THREE.Vector3(5.4, -0.4, 0)
    ];
    const arch = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPoints), 24, 0.55, 7, false),
      rail
    );
    arch.position.y = -1.2;
    bridge.add(arch);
    bridge.position.set(68, baseY, -18);
    bridge.rotation.y = yaw;
    scene.add(bridge);
    return {
      object: bridge,
      assets: [stone, rail, deck.geometry, arch.geometry]
    };
  }

  function addRetirementArch(THREE, scene, boardData, trackData, heightAt, quality) {
    const space = boardData.spaces.find(function (entry) {
      return entry.id === "m" + (boardData.tileCodes.length - 1);
    });
    if (!space) return null;
    const point = trackData.tileCenters.get(space.id);
    const center = new THREE.Vector3(point.x, heightAt(point.x, point.z), point.z);
    const arch = new THREE.Group();
    const red = surfaceMaterial(THREE, quality, { color: "#e85e55", flatShading: true });
    const white = surfaceMaterial(THREE, quality, { color: "#ffffff", flatShading: true });
    [-4.6, 4.6].forEach(function (x) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 7.5, 8), red);
      post.position.set(x, 3.75, 0);
      post.castShadow = true;
      arch.add(post);
    });
    const top = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.48, 8, 24, Math.PI), red);
    top.position.y = 7.1;
    arch.add(top);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.25, 0.25), white);
    banner.position.set(0, 6.5, 0);
    arch.add(banner);
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const context = labelCanvas.getContext("2d");
    context.fillStyle = "#e85e55";
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = "#ffffff";
    context.font = "bold 42px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("FINISH", 128, 32);
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.encoding = THREE.sRGBEncoding;
    banner.material = surfaceMaterial(THREE, quality, { map: texture });
    arch.position.copy(center);
    arch.rotation.y = Math.PI / 2 - Number(space.angle || 0) * Math.PI / 180;
    scene.add(arch);
    return {
      object: arch,
      assets: [red, white, banner.material, texture]
    };
  }

  function create(THREE, scene, boardData, trackData, heightAt, quality) {
    const group = new THREE.Group();
    scene.add(group);
    const roadMaterial = surfaceMaterial(THREE, quality, {
      color: "#b8c0c8",
      roughness: 0.9,
      side: THREE.DoubleSide
    });
    const curbMaterial = surfaceMaterial(THREE, quality, {
      color: "#ffffff",
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    const collegeCurbMaterial = surfaceMaterial(THREE, quality, {
      color: "#d8cafd",
      roughness: 0.8,
      side: THREE.DoubleSide
    });
    const paths = [
      { points: trackData.samples, college: false },
      { points: trackData.branchSamples, college: true }
    ];
    paths.forEach(function (path) {
      const road = new THREE.Mesh(
        stripGeometry(THREE, path.points, 9, 0, heightAt),
        roadMaterial
      );
      road.receiveShadow = true;
      group.add(road);
      const curbMaterialForPath = path.college ? collegeCurbMaterial : curbMaterial;
      [-1, 1].forEach(function (side) {
        const curb = new THREE.Mesh(
          stripGeometry(THREE, path.points, 0.7, side * 4.85, heightAt),
          curbMaterialForPath
        );
        curb.receiveShadow = true;
        group.add(curb);
      });
    });

    const dashMaterial = new THREE.LineDashedMaterial({
      color: "#ffffff",
      dashSize: 1.3,
      gapSize: 1.6,
      transparent: true,
      opacity: 0.55
    });
    trackData.samples.forEach(function (point, index) {
      if (index % 5 !== 0 || index + 1 >= trackData.samples.length) return;
      const next = trackData.samples[index + 1];
      const y1 = heightAt(point.x, point.z) + 0.28;
      const y2 = heightAt(next.x, next.z) + 0.28;
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(point.x, y1, point.z),
        new THREE.Vector3(next.x, y2, next.z)
      ]);
      const dash = new THREE.Line(geometry, dashMaterial);
      dash.computeLineDistances();
      group.add(dash);
    });

    const materials = createTileMaterials(THREE, boardData, quality);
    const geometry = new THREE.BoxGeometry(6, 0.35, 5.4);
    const sideMaterial = materials.side;
    const tileMeshes = new Map();
    boardData.spaces.forEach(function (space) {
      const point = trackData.tileCenters.get(space.id);
      if (!point) return;
      const type = space.type;
      const topMaterial = materials.top[type] || materials.top.event;
      const mesh = new THREE.Mesh(geometry, [
        sideMaterial, sideMaterial, topMaterial, sideMaterial, sideMaterial, sideMaterial
      ]);
      const height = heightAt(point.x, point.z) + 0.42;
      mesh.position.set(point.x, height, point.z);
      mesh.rotation.y = Math.PI / 2 - point.angle * Math.PI / 180;
      if (type === "start") mesh.scale.x = 2;
      if (boardData.stopTypes.indexOf(type) !== -1) {
        const stop = new THREE.Mesh(geometry, [
          sideMaterial, sideMaterial, materials.top.stop, sideMaterial, sideMaterial, sideMaterial
        ]);
        stop.scale.set(2.1, 1, 1);
        stop.position.copy(mesh.position);
        stop.position.y += 0.22;
        stop.rotation.copy(mesh.rotation);
        group.add(stop);
        mesh.userData.stopSlab = stop;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.tileId = space.id;
      group.add(mesh);
      tileMeshes.set(space.id, mesh);
    });

    const lamps = addLamps(
      THREE, scene, trackData.mainSpaces.concat(trackData.collegeSpaces), heightAt, quality
    );
    addCurbProps(
      THREE, scene, trackData.mainSpaces.concat(trackData.collegeSpaces), heightAt, quality
    );
    const sign = addCollegeSign(THREE, scene, boardData, heightAt, quality);
    const bridge = addBridge(THREE, scene, trackData, heightAt, quality);
    const retirementArch = addRetirementArch(THREE, scene, boardData, trackData, heightAt, quality);
    return {
      group: group,
      tileMeshes: tileMeshes,
      trackData: trackData,
      dispose: function () {
        group.traverse(function (object) {
          if (object.isMesh || object.isLine) object.geometry.dispose();
        });
        lamps.objects.forEach(function (object) {
          scene.remove(object);
        });
        if (sign.object) scene.remove(sign.object);
        if (bridge.object) scene.remove(bridge.object);
        if (retirementArch && retirementArch.object) scene.remove(retirementArch.object);
        Object.keys(materials.top).forEach(function (type) {
          if (materials.top[type].map) materials.top[type].map.dispose();
          materials.top[type].dispose();
        });
        materials.side.dispose();
        roadMaterial.dispose();
        curbMaterial.dispose();
        collegeCurbMaterial.dispose();
        dashMaterial.dispose();
        geometry.dispose();
        lamps.assets.concat(sign.assets, bridge.assets, retirementArch ? retirementArch.assets : [])
          .forEach(function (asset) {
          if (asset && typeof asset.dispose === "function") asset.dispose();
        });
      }
    };
  }

  window.Life3DTrack = { makeData: makeData, create: create };
}());
