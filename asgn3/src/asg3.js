const VSHADER_SOURCE = `
  attribute vec4 a_Position;
  attribute vec2 a_UV;
  attribute float a_Shade;

  uniform mat4 u_ModelMatrix;
  uniform mat4 u_ViewMatrix;
  uniform mat4 u_ProjectionMatrix;

  varying vec2 v_UV;
  varying float v_Shade;

  void main() {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * a_Position;
    v_UV = a_UV;
    v_Shade = a_Shade;
  }
`;

const FSHADER_SOURCE = `
  precision mediump float;

  varying vec2 v_UV;
  varying float v_Shade;

  uniform vec4 u_BaseColor;
  uniform float u_TexColorWeight;
  uniform int u_WhichTexture;
  uniform sampler2D u_Sampler0;
  uniform sampler2D u_Sampler1;
  uniform sampler2D u_Sampler2;
  uniform sampler2D u_Sampler3;
  uniform sampler2D u_Sampler4;

  vec4 getTexColor() {
    if (u_WhichTexture == 0) {
      return texture2D(u_Sampler0, v_UV);
    } else if (u_WhichTexture == 1) {
      return texture2D(u_Sampler1, v_UV);
    } else if (u_WhichTexture == 2) {
      return texture2D(u_Sampler2, v_UV);
    } else if (u_WhichTexture == 3) {
      return texture2D(u_Sampler3, v_UV);
    } else if (u_WhichTexture == 4) {
      return texture2D(u_Sampler4, v_UV);
    }

    return u_BaseColor;
  }

  void main() {
    vec4 texColor = getTexColor();
    vec4 color = mix(u_BaseColor, texColor, u_TexColorWeight);
    gl_FragColor = vec4(min(color.rgb * v_Shade, vec3(1.0)), color.a);
  }
`;

const FLOATS_PER_VERTEX = 6;
const BYTES_PER_FLOAT = Float32Array.BYTES_PER_ELEMENT;
const WORLD_SIZE = 32;
const WORLD_HALF = WORLD_SIZE / 2;
const PLAYER_HEIGHT = 1.65;
const COLLISION_RADIUS = 0.24;
const GROUND_STEP_UP_LIMIT = 0.55;
const WALK_OFF_DROP_LIMIT = 0.58;
const LANDING_EPSILON = 0.055;
const GRAVITY = 18;
const TERMINAL_FALL_SPEED = 16;
const AIR_CONTROL = 0.38;
const MAX_BLOCK_HEIGHT = 4;
const RIFT_TRIGGER_RADIUS = 0.78;
const FOOTPRINT_OFFSETS = [
  [0, 0],
  [COLLISION_RADIUS, 0],
  [-COLLISION_RADIUS, 0],
  [0, COLLISION_RADIUS],
  [0, -COLLISION_RADIUS],
  [COLLISION_RADIUS * 0.72, COLLISION_RADIUS * 0.72],
  [COLLISION_RADIUS * 0.72, -COLLISION_RADIUS * 0.72],
  [-COLLISION_RADIUS * 0.72, COLLISION_RADIUS * 0.72],
  [-COLLISION_RADIUS * 0.72, -COLLISION_RADIUS * 0.72],
];

const RIFT_PORTALS = [
  { x: 18, z: 25, exitX: 2, exitZ: 3, destinationName: "the far northern edge" },
  { x: 2, z: 1, exitX: 18, exitZ: 27, destinationName: "the neon plaza" },
];

const TEX = {
  grass: 0,
  path: 1,
  stone: 2,
  brick: 3,
  crystal: 4,
};

const TEXTURE_DEFS = [
  { id: TEX.grass, sampler: "u_Sampler0", unit: 0, url: "./textures/grass.png", fallback: [92, 132, 65] },
  { id: TEX.path, sampler: "u_Sampler1", unit: 1, url: "./textures/path.png", fallback: [138, 111, 78] },
  { id: TEX.stone, sampler: "u_Sampler2", unit: 2, url: "./textures/stone.png?v=cyber-4", fallback: [4, 16, 22] },
  { id: TEX.brick, sampler: "u_Sampler3", unit: 3, url: "./textures/brick.png?v=cyber-4", fallback: [38, 8, 48] },
  { id: TEX.crystal, sampler: "u_Sampler4", unit: 4, url: "./textures/crystal.png?v=cyber-4", fallback: [0, 190, 205] },
];

const WORLD_MAP = [
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [4, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4],
  [4, 0, 3, 3, 3, 3, 0, 3, 0, 2, 0, 3, 3, 3, 3, 3, 3, 3, 0, 3, 0, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 4],
  [4, 0, 0, 0, 0, 3, 0, 3, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 4],
  [4, 2, 2, 2, 0, 3, 0, 3, 0, 2, 2, 2, 2, 2, 0, 2, 0, 3, 0, 3, 2, 2, 2, 2, 2, 2, 0, 2, 0, 3, 0, 4],
  [4, 0, 0, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 3, 0, 4],
  [4, 0, 2, 2, 0, 3, 3, 3, 3, 3, 3, 0, 0, 2, 0, 2, 0, 3, 3, 3, 3, 3, 3, 0, 0, 2, 0, 3, 0, 3, 0, 4],
  [4, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 3, 0, 0, 2, 0, 3, 0, 3, 0, 4],
  [4, 0, 2, 2, 2, 2, 2, 2, 0, 0, 3, 0, 0, 2, 0, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 2, 0, 3, 0, 3, 0, 4],
  [4, 0, 0, 0, 0, 0, 0, 2, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 0, 0, 0, 0, 0, 3, 0, 4],
  [4, 0, 3, 3, 3, 0, 0, 2, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 2, 0, 3, 3, 3, 3, 3, 3, 0, 3, 0, 4],
  [4, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 3, 0, 4],
  [4, 2, 2, 0, 3, 0, 3, 3, 3, 3, 0, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 3, 3, 3, 0, 3, 0, 3, 0, 3, 0, 4],
  [4, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 3, 0, 4],
  [4, 0, 3, 3, 3, 3, 3, 3, 0, 3, 0, 2, 0, 3, 3, 3, 3, 3, 2, 0, 3, 0, 2, 2, 2, 2, 2, 2, 2, 3, 0, 4],
  [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 0, 0, 3, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 4],
  [4, 0, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 0, 0, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 4],
  [4, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 4],
  [4, 0, 3, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 3, 0, 2, 0, 3, 0, 4],
  [4, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 3, 0, 0, 0, 3, 0, 4],
  [4, 2, 2, 2, 3, 0, 2, 2, 2, 2, 2, 2, 2, 2, 0, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 3, 3, 3, 0, 3, 0, 4],
  [4, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 0, 0, 0, 0, 3, 0, 4],
  [4, 0, 3, 3, 3, 0, 2, 0, 3, 3, 3, 3, 0, 2, 0, 3, 3, 3, 3, 3, 0, 2, 0, 3, 0, 2, 2, 2, 2, 3, 0, 4],
  [4, 0, 0, 0, 3, 0, 2, 0, 0, 0, 0, 3, 0, 2, 0, 3, 0, 0, 0, 3, 0, 2, 0, 3, 0, 0, 0, 0, 0, 3, 0, 4],
  [4, 0, 2, 0, 3, 0, 2, 2, 2, 2, 0, 3, 0, 2, 0, 3, 0, 2, 2, 3, 0, 2, 0, 3, 3, 3, 3, 3, 0, 3, 0, 4],
  [4, 0, 2, 0, 0, 0, 0, 0, 0, 2, 0, 3, 0, 0, 0, 3, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 3, 0, 4],
  [4, 0, 2, 2, 2, 2, 2, 2, 0, 2, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 0, 2, 2, 2, 2, 2, 2, 2, 0, 3, 0, 4],
  [4, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 4],
  [4, 0, 3, 3, 3, 3, 0, 2, 0, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 3, 0, 3, 3, 3, 3, 3, 3, 3, 0, 3, 0, 4],
  [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4],
  [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
];

let canvas;
let gl;
let camera;
let a_Position;
let a_UV;
let a_Shade;
let u_ModelMatrix;
let u_ViewMatrix;
let u_ProjectionMatrix;
let u_BaseColor;
let u_TexColorWeight;
let u_WhichTexture;
let gCubeBuffer;
let gCubeVertexCount = 0;
let gWorldBatches = [];
let gNeonLightBatches = [];
let gWorldHeights = [];
let gBlockTextures = [];
let gTerrainHeights = [];
let gStaticBlockCount = 0;
let gSelectedTexture = TEX.stone;
let gSelectedName = "Stone";
let gSeconds = 0;
let gLastTimestamp = 0;
let gFrameSamples = [];
let gGameWon = false;
let gAntigravityBoots = false;
let gVerticalVelocity = 0;
let gRiftCooldown = 0;
let gHud = {};

const gKeys = new Set();
const gMouse = {
  active: false,
  lastX: 0,
  lastY: 0,
  totalMove: 0,
};

const gCollectibles = [
  { x: 4, z: 1, collected: false },
  { x: 10, z: 5, collected: false },
  { x: 18, z: 9, collected: false },
  { x: 17, z: 11, collected: false },
  { x: 15, z: 15, collected: false },
  { x: 26, z: 17, collected: false },
  { x: 7, z: 25, collected: false },
  { x: 24, z: 29, collected: false },
];

const LORE_LINES = [
  "The shard cores are rogue implants hidden in the grid. Each one can siphon power or open a backdoor if left active.",
  "First core quarantined. Its signature matches the missing netrunner's entry route near the twin rift.",
  "Second core captured. The rogue signal is routing stolen power away from the city relays.",
  "Third core isolated. The rift network flickers, but your partner's trace is still corrupted.",
  "Fourth core neutralized. Half the grid firewall is back online.",
  "Fifth core recovered. The rogue netrunner's payload is losing control of the outer sectors.",
  "Sixth core secured. A faint distress echo pings from the far portal twin.",
  "Seventh core contained. One malicious implant still threatens the grid's main breaker.",
  "All eight cores are quarantined. Neon Rift's power grid is clean, and your missing partner's trail is stable enough to follow.",
];
const STORY_STATUS = "You are a netrunner contracted to recover eight shard cores implanted in this grid network by a rogue netrunner with malicious intentions.";

async function main() {
  try {
    setupWebGL();
    connectVariablesToGLSL();
    cacheHud();
    validateWorldRows();
    initCubeBuffer();
    initWorldState();
    setupInput();
    resizeCanvasToDisplaySize();
    camera = new Camera(canvas);
    camera.setPose([2.5, 1.7, 13.25], [2.5, 1.62, 11.0]);
    alignCameraToTerrain();

    gl.clearColor(0.01, 0.015, 0.04, 1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    await initTextures();
    rebuildWorldMesh();
    logAction("The neon rift ahead links the far ends of the grid for fast travel. Your second netrunner was meant to enter through its twin portal, but he vanished; the mission is yours now. The shard hunt begins.");
    requestAnimationFrame(tick);
  } catch (err) {
    logAction(err.message || String(err));
    throw err;
  }
}

function setupWebGL() {
  canvas = document.getElementById("webgl");
  gl = canvas.getContext("webgl", { antialias: true });
  if (!gl) {
    throw new Error("WebGL is not available in this browser.");
  }
}

function connectVariablesToGLSL() {
  const program = createProgram(gl, VSHADER_SOURCE, FSHADER_SOURCE);
  gl.useProgram(program);
  gl.program = program;

  a_Position = gl.getAttribLocation(program, "a_Position");
  a_UV = gl.getAttribLocation(program, "a_UV");
  a_Shade = gl.getAttribLocation(program, "a_Shade");
  u_ModelMatrix = gl.getUniformLocation(program, "u_ModelMatrix");
  u_ViewMatrix = gl.getUniformLocation(program, "u_ViewMatrix");
  u_ProjectionMatrix = gl.getUniformLocation(program, "u_ProjectionMatrix");
  u_BaseColor = gl.getUniformLocation(program, "u_BaseColor");
  u_TexColorWeight = gl.getUniformLocation(program, "u_TexColorWeight");
  u_WhichTexture = gl.getUniformLocation(program, "u_WhichTexture");

  for (const textureDef of TEXTURE_DEFS) {
    textureDef.location = gl.getUniformLocation(program, textureDef.sampler);
  }
}

function cacheHud() {
  gHud.story = document.getElementById("storyStatus");
  gHud.shards = document.getElementById("shardValue");
  gHud.fps = document.getElementById("fpsValue");
  gHud.blocks = document.getElementById("blockValue");
  gHud.position = document.getElementById("positionValue");
  gHud.boots = document.getElementById("bootsValue");
  gHud.lore = document.getElementById("loreText");
  gHud.action = document.getElementById("actionLog");
  gHud.meter = document.getElementById("shardMeter");
}

function validateWorldRows() {
  if (WORLD_MAP.length !== WORLD_SIZE) {
    throw new Error("The world map must have 32 rows.");
  }

  for (const row of WORLD_MAP) {
    if (row.length !== WORLD_SIZE || row.some((height) => height < 0 || height > 4)) {
      throw new Error("Each world map row must contain 32 height values from 0 to 4.");
    }
  }
}

function initWorldState() {
  gWorldHeights = WORLD_MAP.map((row) => row.slice());
  carveOpenStartPlaza();
  gBlockTextures = gWorldHeights.map((row, z) => (
    row.map((height, x) => chooseInitialBlockTexture(x, z, height))
  ));
  gTerrainHeights = buildTerrainMap();
}

function carveOpenStartPlaza() {
  for (let z = 25; z <= 30; z += 1) {
    for (let x = 14; x <= 22; x += 1) {
      gWorldHeights[z][x] = 0;
    }
  }

  const portalPads = [
    [2, 1], [2, 2], [2, 3], [1, 1], [3, 1], [1, 2], [3, 2],
    [18, 25], [18, 26], [18, 27], [17, 25], [19, 25],
  ];

  for (const cell of portalPads) {
    gWorldHeights[cell[1]][cell[0]] = 0;
  }
}

function initCubeBuffer() {
  const vertices = [];
  appendCube(vertices, 0, 0, 0, 1, 1, 1);

  gCubeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, gCubeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gCubeVertexCount = vertices.length / FLOATS_PER_VERTEX;
}

function buildTerrainMap() {
  const terrain = [];

  for (let z = 0; z < WORLD_SIZE; z += 1) {
    const row = [];
    for (let x = 0; x < WORLD_SIZE; x += 1) {
      const wave =
        Math.sin(x * 0.52) * 0.13 +
        Math.cos(z * 0.43) * 0.11 +
        Math.sin((x + z) * 0.29) * 0.08;
      const openPath = gWorldHeights[z][x] === 0;
      const border = x === 0 || z === 0 || x === WORLD_SIZE - 1 || z === WORLD_SIZE - 1;
      const plazaLift = Math.max(0, 0.28 - Math.abs(x - 18) * 0.045 - Math.abs(z - 28) * 0.04);
      let height = 0.18 + wave;

      if (openPath) {
        height = 0.12 + wave * 0.72 + plazaLift;
      }
      if (border) {
        height = 0.04;
      }

      row.push(Math.max(0.03, Math.min(0.52, height)));
    }
    terrain.push(row);
  }

  return terrain;
}

function chooseInitialBlockTexture(x, z, height) {
  if (height === 0) {
    return TEX.stone;
  }
  if (x === 0 || z === 0 || x === WORLD_SIZE - 1 || z === WORLD_SIZE - 1) {
    return TEX.stone;
  }
  if ((x + z * 3) % 17 === 0 || (height >= 3 && (x * 5 + z) % 11 === 0)) {
    return TEX.crystal;
  }
  if ((x > 18 && z < 12) || (x < 8 && z > 18)) {
    return TEX.brick;
  }
  return (x + z) % 5 === 0 ? TEX.brick : TEX.stone;
}

function setupInput() {
  window.addEventListener("keydown", (ev) => {
    const key = ev.key.toLowerCase();

    if ("wasdqefr123bc ".includes(key) || key === "control" || ev.key === "Shift") {
      ev.preventDefault();
    }

    gKeys.add(key);
    if (ev.key === "Shift") {
      gKeys.add("shift");
    }

    if (!ev.repeat) {
      if (key === "f") {
        placeBlock();
      } else if (key === "r") {
        removeBlock();
      } else if (key === "1") {
        selectBlock(TEX.stone, "Stone");
      } else if (key === "2") {
        selectBlock(TEX.brick, "Brick");
      } else if (key === "3") {
        selectBlock(TEX.crystal, "Crystal");
      } else if (key === "b") {
        toggleAntigravityBoots();
      }
    }
  });

  window.addEventListener("keyup", (ev) => {
    gKeys.delete(ev.key.toLowerCase());
    if (ev.key === "Shift") {
      gKeys.delete("shift");
    }
  });

  canvas.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    if (ev.button !== 0) {
      return;
    }

    gMouse.active = true;
    gMouse.lastX = ev.clientX;
    gMouse.lastY = ev.clientY;
    gMouse.totalMove = 0;
    canvas.classList.add("dragging");
    canvas.focus();
  });

  window.addEventListener("mouseup", (ev) => {
    if (!gMouse.active) return;
    gMouse.active = false;
    canvas.classList.remove("dragging");

    if (gMouse.totalMove < 4 && ev.button === 0) {
      removeBlock();
    }
  });

  window.addEventListener("mousemove", (ev) => {
    if (!gMouse.active) return;

    const dx = ev.clientX - gMouse.lastX;
    const dy = ev.clientY - gMouse.lastY;
    gMouse.lastX = ev.clientX;
    gMouse.lastY = ev.clientY;
    gMouse.totalMove += Math.abs(dx) + Math.abs(dy);

    camera.panBy(dx * 0.16);
    camera.tiltBy(-dy * 0.13);
  });

  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
  });

  window.addEventListener("resize", () => {
    resizeCanvasToDisplaySize();
    if (camera) {
      camera.updateProjectionMatrix(canvas);
    }
  });
}

function selectBlock(textureId, name) {
  gSelectedTexture = textureId;
  gSelectedName = name;
  logAction(`${name} block selected.`);
}

function toggleAntigravityBoots() {
  const pose = camera.clonePose();
  gAntigravityBoots = !gAntigravityBoots;

  if (gAntigravityBoots) {
    gVerticalVelocity = 0;
  } else if (isAirborne()) {
    gVerticalVelocity = Math.min(gVerticalVelocity, 0);
    logAction("Antigravity boots offline. Freefall engaged.");
    return;
  } else {
    if (!landCameraOnSurface()) {
      camera.restorePose(pose);
      gAntigravityBoots = true;
      logAction("Move over the map before landing.");
      return;
    }
    gVerticalVelocity = 0;
  }

  logAction(gAntigravityBoots ? "Antigravity boots online. Vertical lift unlocked." : "Antigravity boots offline.");
}

function tick(timestamp) {
  if (!gLastTimestamp) {
    gLastTimestamp = timestamp;
  }

  const delta = Math.min(0.05, (timestamp - gLastTimestamp) / 1000);
  gLastTimestamp = timestamp;
  gSeconds += delta;

  handleMovement(delta);
  updateRiftPortals(delta);
  updateCollectibles();
  renderScene();
  updateHud(delta);

  requestAnimationFrame(tick);
}

function handleMovement(delta) {
  const moveSpeed = (gKeys.has("shift") ? 9.5 : 5.8) * delta;
  const turnSpeed = 180 * delta;

  if (gKeys.has("q")) {
    camera.panLeft(turnSpeed);
  }
  if (gKeys.has("e")) {
    camera.panRight(turnSpeed);
  }

  if (gAntigravityBoots) {
    gVerticalVelocity = 0;
    handleFlightMovement(moveSpeed);
    return;
  }

  if (isAirborne()) {
    handleAirborneMovement(moveSpeed, delta);
    return;
  }

  gVerticalVelocity = 0;

  if (gKeys.has("w")) {
    attemptCameraMove(() => camera.moveForward(moveSpeed));
  }
  if (gKeys.has("s")) {
    attemptCameraMove(() => camera.moveBackwards(moveSpeed));
  }
  if (gKeys.has("a")) {
    attemptCameraMove(() => camera.moveLeft(moveSpeed));
  }
  if (gKeys.has("d")) {
    attemptCameraMove(() => camera.moveRight(moveSpeed));
  }
}

function handleAirborneMovement(moveSpeed, delta) {
  const airMoveSpeed = moveSpeed * AIR_CONTROL;

  if (gKeys.has("w")) {
    const f = camera.getHorizontalForwardVector();
    f.mul(airMoveSpeed);
    moveCameraByVector(f);
  }
  if (gKeys.has("s")) {
    const b = camera.getHorizontalForwardVector();
    b.mul(-airMoveSpeed);
    moveCameraByVector(b);
  }
  if (gKeys.has("a")) {
    const f = camera.getHorizontalForwardVector();
    const s = Vector3.cross(camera.up, f);
    s.normalize();
    s.mul(airMoveSpeed);
    moveCameraByVector(s);
  }
  if (gKeys.has("d")) {
    const f = camera.getHorizontalForwardVector();
    const s = Vector3.cross(f, camera.up);
    s.normalize();
    s.mul(airMoveSpeed);
    moveCameraByVector(s);
  }

  gVerticalVelocity = Math.max(gVerticalVelocity - GRAVITY * delta, -TERMINAL_FALL_SPEED);
  moveCameraByVector(new Vector3([0, gVerticalVelocity * delta, 0]));

  if (!isAirborne()) {
    gVerticalVelocity = 0;
    alignCameraToTerrain();
    logAction("Landed.");
  }
}

function handleFlightMovement(moveSpeed) {
  const liftSpeed = moveSpeed * 0.9;

  if (gKeys.has("w")) {
    const f = camera.getForwardVector();
    f.mul(moveSpeed);
    moveCameraByVector(f);
  }
  if (gKeys.has("s")) {
    const b = camera.getForwardVector();
    b.mul(-moveSpeed);
    moveCameraByVector(b);
  }
  if (gKeys.has("a")) {
    const f = camera.getHorizontalForwardVector();
    const s = Vector3.cross(camera.up, f);
    s.normalize();
    s.mul(moveSpeed);
    moveCameraByVector(s);
  }
  if (gKeys.has("d")) {
    const f = camera.getHorizontalForwardVector();
    const s = Vector3.cross(f, camera.up);
    s.normalize();
    s.mul(moveSpeed);
    moveCameraByVector(s);
  }
  if (gKeys.has(" ")) {
    moveCameraByVector(new Vector3([0, liftSpeed, 0]));
  }
  if (gKeys.has("c") || gKeys.has("control")) {
    moveCameraByVector(new Vector3([0, -liftSpeed, 0]));
  }

  clampFlightCamera();
}

function moveCameraByVector(vector) {
  const v = vector.elements;
  attemptFlightAxisMove(v[0], 0, 0);
  attemptFlightAxisMove(0, 0, v[2]);
  attemptFlightAxisMove(0, v[1], 0);
}

function attemptFlightAxisMove(dx, dy, dz) {
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 0.00001) {
    return;
  }

  const eye = camera.eye.elements;
  const margin = 0.65;
  let nextX = clampNumber(eye[0] + dx, -WORLD_HALF + margin, WORLD_HALF - margin);
  let nextY = eye[1] + dy;
  let nextZ = clampNumber(eye[2] + dz, -WORLD_HALF + margin, WORLD_HALF - margin);

  if (!getFootprintCells(nextX, nextZ)) {
    return;
  }

  if (dy !== 0) {
    const minEyeY = getSupportHeightAtWorld(nextX, nextZ) + PLAYER_HEIGHT;
    nextY = clampNumber(nextY, minEyeY, 18);
  }

  if (playerCollidesAt(nextX, nextY, nextZ)) {
    if (dy < 0) {
      setCameraPosition(eye[0], getSupportHeightAtWorld(eye[0], eye[2]) + PLAYER_HEIGHT, eye[2]);
    }
    return;
  }

  setCameraPosition(nextX, nextY, nextZ);
}

function clampFlightCamera() {
  const eye = camera.eye.elements;
  const at = camera.at.elements;
  const lookOffset = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
  const margin = 0.65;
  const nextX = clampNumber(eye[0], -WORLD_HALF + margin, WORLD_HALF - margin);
  const nextZ = clampNumber(eye[2], -WORLD_HALF + margin, WORLD_HALF - margin);
  const minEyeY = getSupportHeightAtWorld(nextX, nextZ) + PLAYER_HEIGHT;

  eye[0] = nextX;
  eye[1] = clampNumber(eye[1], minEyeY, 18);
  eye[2] = nextZ;
  at[0] = eye[0] + lookOffset[0];
  at[1] = eye[1] + lookOffset[1];
  at[2] = eye[2] + lookOffset[2];
  camera.updateViewMatrix();
}

function attemptCameraMove(moveFn) {
  const pose = camera.clonePose();
  const currentSurfaceY = getSupportHeightAtWorld(pose.eye.elements[0], pose.eye.elements[2]);
  moveFn();
  const nextX = camera.eye.elements[0];
  const nextZ = camera.eye.elements[2];
  const nextSurfaceY = getSupportHeightAtWorld(nextX, nextZ);

  if (!canStandAt(nextX, nextZ, currentSurfaceY)) {
    camera.restorePose(pose);
    return;
  }

  if (currentSurfaceY - nextSurfaceY > WALK_OFF_DROP_LIMIT) {
    gVerticalVelocity = 0;
    logAction("You stepped off the roof. Freefall engaged.");
    return;
  }

  alignCameraToTerrain();
}

function alignCameraToTerrain() {
  const eye = camera.eye.elements;
  const surfaceY = getSupportHeightAtWorld(eye[0], eye[2]);
  camera.snapToHeight(surfaceY + PLAYER_HEIGHT);
}

function landCameraOnSurface() {
  const eye = camera.eye.elements;
  if (!getFootprintCells(eye[0], eye[2])) {
    return false;
  }

  alignCameraToTerrain();
  const landedEye = camera.eye.elements;
  return !playerCollidesAt(landedEye[0], landedEye[1], landedEye[2]);
}

function isAirborne() {
  const eye = camera.eye.elements;
  return eye[1] > getGroundedEyeY(eye[0], eye[2]) + LANDING_EPSILON;
}

function canStandAt(worldX, worldZ, currentSurfaceY) {
  if (!getFootprintCells(worldX, worldZ)) {
    return false;
  }

  const nextSurfaceY = getSupportHeightAtWorld(worldX, worldZ);
  if (nextSurfaceY - currentSurfaceY > GROUND_STEP_UP_LIMIT) {
    return false;
  }

  return !playerCollidesAt(worldX, nextSurfaceY + PLAYER_HEIGHT, worldZ);
}

function updateCollectibles() {
  const eye = camera.eye.elements;
  let newlyCollected = false;

  for (const shard of gCollectibles) {
    if (shard.collected) continue;

    const wx = mapToWorld(shard.x);
    const wz = mapToWorld(shard.z);
    const dx = eye[0] - wx;
    const dz = eye[2] - wz;
    if (dx * dx + dz * dz < 0.72) {
      shard.collected = true;
      newlyCollected = true;
    }
  }

  if (newlyCollected) {
    const count = getCollectedShardCount();
    logAction(`Shard core recovered: ${count}/${gCollectibles.length}. ${getShardRecoveryMessage(count)}`);
    if (count === gCollectibles.length) {
      gGameWon = true;
      logAction("All shard cores quarantined. The grid is secure, and your missing partner's trace points through the far rift.");
    }
  }
}

function getShardRecoveryMessage(count) {
  const messages = [
    "Rogue implant quarantined; access logs show an outside hand.",
    "A backdoor route collapses before it can drain the plaza relay.",
    "Your partner's last handshake flashes across the rift channel.",
    "Firewall segment restored; the city stops bleeding power.",
    "The rogue payload loses another anchor in the maze.",
    "A weak ping returns from the far portal twin.",
    "Only one hostile core remains in the grid.",
    "All malicious cores quarantined; the contract is complete.",
  ];

  return messages[count - 1] || "";
}

function updateRiftPortals(delta) {
  if (gRiftCooldown > 0) {
    gRiftCooldown = Math.max(0, gRiftCooldown - delta);
    return;
  }

  const eye = camera.eye.elements;
  for (const portal of RIFT_PORTALS) {
    const x = mapToWorld(portal.x);
    const z = mapToWorld(portal.z);
    const y = getTerrainHeightAtWorld(x, z);
    const dx = eye[0] - x;
    const dz = eye[2] - z;

    if (dx * dx + dz * dz < RIFT_TRIGGER_RADIUS * RIFT_TRIGGER_RADIUS && eye[1] < y + 3.4) {
      teleportThroughRift(portal);
      break;
    }
  }
}

function teleportThroughRift(portal) {
  const eye = camera.eye.elements;
  const at = camera.at.elements;
  const lookOffset = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
  const exitX = mapToWorld(portal.exitX);
  const exitZ = mapToWorld(portal.exitZ);
  const exitSurfaceY = getSupportHeightAtWorld(exitX, exitZ);
  const minExitEyeY = exitSurfaceY + PLAYER_HEIGHT;
  const flightY = clampNumber(Math.max(eye[1], minExitEyeY), minExitEyeY, 18);
  const landingY = gAntigravityBoots ? flightY : minExitEyeY;

  eye[0] = exitX;
  eye[1] = landingY;
  eye[2] = exitZ;
  at[0] = eye[0] + lookOffset[0];
  at[1] = eye[1] + lookOffset[1];
  at[2] = eye[2] + lookOffset[2];
  camera.updateViewMatrix();

  gRiftCooldown = 0.9;
  logAction(`Rift jump complete: ${portal.destinationName}.`);
}

function placeBlock() {
  const cell = getTargetCell();
  if (!cell) {
    logAction("No buildable cell is in reach.");
    return;
  }

  if (gWorldHeights[cell.z][cell.x] >= MAX_BLOCK_HEIGHT) {
    logAction("That stack is already four blocks high.");
    return;
  }

  gWorldHeights[cell.z][cell.x] += 1;
  gBlockTextures[cell.z][cell.x] = gSelectedTexture;
  rebuildWorldMesh();
  logAction(`${gSelectedName} block placed.`);
}

function removeBlock() {
  const cell = getTargetCell();
  if (!cell) {
    logAction("No block is in reach.");
    return;
  }

  if (gWorldHeights[cell.z][cell.x] <= 0) {
    logAction("That cell is already open.");
    return;
  }

  gWorldHeights[cell.z][cell.x] -= 1;
  rebuildWorldMesh();
  logAction("Block removed.");
}

function getTargetCell() {
  const forward = camera.getHorizontalForwardVector().elements;
  const eye = camera.eye.elements;
  const targetX = eye[0] + forward[0] * 1.65;
  const targetZ = eye[2] + forward[2] * 1.65;
  return getMapCellFromWorld(targetX, targetZ);
}

function rebuildWorldMesh() {
  for (const batch of gWorldBatches) {
    gl.deleteBuffer(batch.buffer);
  }
  for (const batch of gNeonLightBatches) {
    gl.deleteBuffer(batch.buffer);
  }

  const buckets = new Map();
  const neonBuckets = [[], []];
  gStaticBlockCount = 0;

  for (let z = 0; z < WORLD_SIZE; z += 1) {
    for (let x = 0; x < WORLD_SIZE; x += 1) {
      const wx = mapToWorld(x);
      const wz = mapToWorld(z);
      const terrainY = gTerrainHeights[z][x];
      const groundTexture = gWorldHeights[z][x] === 0 ? TEX.path : TEX.grass;

      appendCube(getBucket(buckets, groundTexture), wx, terrainY - 0.09, wz, 1.02, 0.18, 1.02);
      gStaticBlockCount += 1;

      for (let y = 0; y < gWorldHeights[z][x]; y += 1) {
        appendCube(
          getBucket(buckets, gBlockTextures[z][x]),
          wx,
          terrainY + 0.5 + y,
          wz,
          1,
          1,
          1
        );
        appendBlockNeonLights(neonBuckets, x, z, y, wx, terrainY + y, wz);
        gStaticBlockCount += 1;
      }
    }
  }

  gWorldBatches = [];
  for (const [textureId, vertices] of buckets.entries()) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gWorldBatches.push({
      textureId,
      buffer,
      count: vertices.length / FLOATS_PER_VERTEX,
    });
  }

  gNeonLightBatches = neonBuckets
    .filter((vertices) => vertices.length > 0)
    .map((vertices, index) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      return {
        colorIndex: index,
        buffer,
        count: vertices.length / FLOATS_PER_VERTEX,
      };
    });
}

function getBucket(buckets, textureId) {
  if (!buckets.has(textureId)) {
    buckets.set(textureId, []);
  }
  return buckets.get(textureId);
}

function appendBlockNeonLights(neonBuckets, x, z, y, wx, blockBaseY, wz) {
  const faceLights = [
    { dx: 0, dz: -1, face: "north" },
    { dx: 0, dz: 1, face: "south" },
    { dx: -1, dz: 0, face: "west" },
    { dx: 1, dz: 0, face: "east" },
  ];

  for (let i = 0; i < faceLights.length; i += 1) {
    const face = faceLights[i];
    const nx = x + face.dx;
    const nz = z + face.dz;
    const neighborHeight = nx < 0 || nx >= WORLD_SIZE || nz < 0 || nz >= WORLD_SIZE
      ? 0
      : gWorldHeights[nz][nx];

    if (neighborHeight <= y) {
      const bucket = neonBuckets[(x + z + y + i) % 2];
      appendNeonStripOnFace(bucket, wx, blockBaseY + 0.68, wz, face.face);
    }
  }
}

function appendNeonStripOnFace(vertices, x, y, z, face) {
  if (face === "north") {
    appendCube(vertices, x, y, z - 0.512, 0.54, 0.048, 0.016);
  } else if (face === "south") {
    appendCube(vertices, x, y, z + 0.512, 0.54, 0.048, 0.016);
  } else if (face === "west") {
    appendCube(vertices, x - 0.512, y, z, 0.016, 0.048, 0.54);
  } else if (face === "east") {
    appendCube(vertices, x + 0.512, y, z, 0.016, 0.048, 0.54);
  }
}

function renderScene() {
  resizeCanvasToDisplaySize();
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(u_ViewMatrix, false, camera.viewMatrix.elements);
  gl.uniformMatrix4fv(u_ProjectionMatrix, false, camera.projectionMatrix.elements);

  drawSky();
  drawWorld();
  drawNeonBlockLights();
  drawWallBorderStrips();
  drawCyberpunkAccents();
  drawRiftGate();
  drawPathLanterns();
  drawMoonwell();
  drawCollectibles();
  drawFireflies();
  drawBats();
}

function drawSky() {
  gl.depthMask(false);
  drawCube(
    new Matrix4().translate(0, 0, 0).scale(1000, 1000, 1000),
    [0.0, 0.36, 0.42, 1],
    -1,
    0
  );
  drawSkyPatterns();
  gl.depthMask(true);
}

function drawSkyPatterns() {
  const backZ = -58;
  const leftX = -98;
  const rightX = 98;

  for (let i = 0; i < 9; i += 1) {
    const y = 6.5 + i * 2.35;
    const color = getStripColor(i, 0.72);
    const width = i % 3 === 0 ? 92 : 76;
    drawCleanStrip(new Matrix4().translate(0, y, backZ).scale(width, 0.085, 0.06), color);
  }

  for (let i = 0; i < 7; i += 1) {
    const y = 7.7 + i * 2.55;
    const color = getStripColor(i + 2, 0.48);
    drawCleanStrip(new Matrix4().translate(leftX, y, -42 + i * 7).scale(0.06, 0.08, 42), color);
    drawCleanStrip(new Matrix4().translate(rightX, y, -42 + i * 7).scale(0.06, 0.08, 42), color);
  }
}

function getStripColor(index, alpha) {
  const flash = 0.72 + Math.sin(gSeconds * 4.8 + index * 0.8) * 0.22;
  const pink = [1.0, 0.02, 0.78, alpha * flash];
  const purple = [0.52, 0.12, 0.95, alpha * flash];
  return index % 2 === 0 ? pink : purple;
}

function drawCleanStrip(matrix, color) {
  drawCube(
    new Matrix4(matrix).scale(1, 4.4, 1.2),
    [color[0], color[1], color[2], color[3] * 0.16],
    -1,
    0
  );
  drawCube(matrix, color, -1, 0);
}

function drawCyberpunkAccents() {
  const guideCells = [
    [18, 30], [18, 29], [18, 28], [18, 27], [18, 26], [18, 25],
    [16, 29], [20, 29], [16, 27], [20, 27], [16, 25], [20, 25],
    [15, 15], [16, 15], [17, 15], [16, 16],
  ];

  for (let i = 0; i < guideCells.length; i += 1) {
    const x = mapToWorld(guideCells[i][0]);
    const z = mapToWorld(guideCells[i][1]);
    const y = getTerrainHeightAtWorld(x, z);
    const color = i % 2 === 0 ? [0.02, 0.95, 1.0, 0.86] : [1.0, 0.07, 0.72, 0.82];
    drawSpinningGroundMarker(x, z, y, color, i * 0.73);
  }

}

function drawSpinningGroundMarker(x, z, y, color, phase) {
  const flash = 0.58 + Math.sin(gSeconds * 5.2 + phase) * 0.28;
  const spin = gSeconds * 72 + phase * 31;
  const alpha = 0.28 + flash * 0.42;
  const bright = [
    clampNumber(color[0] + 0.12 * flash, 0, 1),
    clampNumber(color[1] + 0.1 * flash, 0, 1),
    clampNumber(color[2] + 0.12 * flash, 0, 1),
    alpha,
  ];
  const core = color[1] > color[0] ? [1.0, 0.05, 0.82, alpha] : [0.03, 0.95, 1.0, alpha];
  const root = new Matrix4()
    .translate(x, y + 0.052 + flash * 0.01, z)
    .rotate(spin, 0, 1, 0);
  const diamond = new Matrix4(root).rotate(45, 0, 1, 0);

  drawCube(new Matrix4(diamond).scale(0.62, 0.018, 0.62), [bright[0], bright[1], bright[2], alpha * 0.32], -1, 0);
  drawCube(new Matrix4(diamond).translate(0, 0.01, 0).scale(0.42, 0.02, 0.42), [0.005, 0.012, 0.018, 0.74], -1, 0);
  drawCube(new Matrix4(diamond).translate(0, 0.024, 0).scale(0.24, 0.024, 0.24), [bright[0], bright[1], bright[2], alpha * 0.82], -1, 0);
  drawCube(new Matrix4(diamond).translate(0, 0.042, 0).scale(0.11, 0.032, 0.11), core, -1, 0);
}

function drawWorld() {
  const identity = new Matrix4();
  gl.uniformMatrix4fv(u_ModelMatrix, false, identity.elements);
  gl.uniform4f(u_BaseColor, 0.005, 0.008, 0.018, 1);
  gl.uniform1f(u_TexColorWeight, 0.82);

  for (const batch of gWorldBatches) {
    gl.uniform1i(u_WhichTexture, batch.textureId);
    bindInterleavedBuffer(batch.buffer);
    gl.drawArrays(gl.TRIANGLES, 0, batch.count);
  }
}

function drawNeonBlockLights() {
  const identity = new Matrix4();
  const colors = [
    [0.02, 1.0, 0.95, 0.58 + Math.sin(gSeconds * 6.2) * 0.28],
    [1.0, 0.04, 0.76, 0.56 + Math.cos(gSeconds * 5.7) * 0.28],
  ];

  gl.uniformMatrix4fv(u_ModelMatrix, false, identity.elements);
  gl.uniform1i(u_WhichTexture, -1);
  gl.uniform1f(u_TexColorWeight, 0);

  for (const batch of gNeonLightBatches) {
    const color = colors[batch.colorIndex];
    gl.uniform4f(u_BaseColor, color[0], color[1], color[2], color[3]);
    bindInterleavedBuffer(batch.buffer);
    gl.drawArrays(gl.TRIANGLES, 0, batch.count);
  }
}

function drawWallBorderStrips() {
  const northZ = mapToWorld(0) + 0.515;
  const southZ = mapToWorld(WORLD_SIZE - 1) - 0.515;
  const westX = mapToWorld(0) + 0.515;
  const eastX = mapToWorld(WORLD_SIZE - 1) - 0.515;

  for (let i = 0; i < 5; i += 1) {
    const y = 0.58 + i * 0.78;
    const color = getStripColor(i + 6, 0.78);
    drawCleanStrip(new Matrix4().translate(0, y, northZ).scale(31.2, 0.055, 0.028), color);
    drawCleanStrip(new Matrix4().translate(0, y, southZ).scale(31.2, 0.055, 0.028), color);
    drawCleanStrip(new Matrix4().translate(westX, y, 0).scale(0.028, 0.055, 31.2), color);
    drawCleanStrip(new Matrix4().translate(eastX, y, 0).scale(0.028, 0.055, 31.2), color);
  }
}

function drawRiftGate() {
  for (let i = 0; i < RIFT_PORTALS.length; i += 1) {
    drawSingleRiftGate(RIFT_PORTALS[i], i);
  }
}

function drawSingleRiftGate(portal, portalIndex) {
  const x = mapToWorld(portal.x);
  const z = mapToWorld(portal.z);
  const y = getTerrainHeightAtWorld(x, z);
  const pulse = Math.sin(gSeconds * 5.4) * 0.1;
  const portalColor = gGameWon
    ? [0.1, 1.0, 0.92, 0.58]
    : portalIndex === 0
      ? [0.03, 0.86, 1.0, 0.34]
      : [1.0, 0.05, 0.82, 0.34];

  for (let i = 0; i < 4; i += 1) {
    const columnY = y + 0.32 + i * 0.55;
    const tex = i % 2 === 0 ? TEX.brick : TEX.crystal;
    drawCube(new Matrix4().translate(x - 0.72, columnY, z).scale(0.34, 0.58, 0.34), [0.08, 0.09, 0.16, 1], tex, 0.72);
    drawCube(new Matrix4().translate(x + 0.72, columnY, z).scale(0.34, 0.58, 0.34), [0.08, 0.09, 0.16, 1], tex, 0.72);
    drawCube(new Matrix4().translate(x - 0.72, columnY + 0.12, z + 0.171).scale(0.32, 0.055, 0.012), [0.04, 0.95, 1.0, 0.82], -1, 0);
    drawCube(new Matrix4().translate(x + 0.72, columnY + 0.12, z + 0.171).scale(0.32, 0.055, 0.012), [1.0, 0.04, 0.78, 0.76], -1, 0);
  }

  drawCube(new Matrix4().translate(x, y + 2.56, z).scale(1.82, 0.32, 0.34), [0.11, 0.08, 0.18, 1], TEX.brick, 0.8);
  drawCube(new Matrix4().translate(x, y + 1.36, z + 0.01).scale(0.76 + pulse, 1.28 + pulse, 0.045), portalColor, TEX.crystal, 0.38);
  drawCube(new Matrix4().translate(x, y + 1.36, z - 0.03).rotate(gSeconds * 82, 0, 0, 1).scale(0.72, 0.72, 0.05), [1.0, 0.08, 0.9, 0.42], -1, 0);
}

function drawPathLanterns() {
  const lanterns = [
    { x: 17, z: 29, phase: 0 },
    { x: 19, z: 29, phase: 1.1 },
    { x: 17, z: 27, phase: 2.4 },
    { x: 19, z: 27, phase: 3.2 },
    { x: 14, z: 15, phase: 4.5 },
    { x: 18, z: 17, phase: 5.3 },
  ];

  for (const lantern of lanterns) {
    const x = mapToWorld(lantern.x);
    const z = mapToWorld(lantern.z);
    const y = gTerrainHeights[lantern.z][lantern.x];
    const flicker = 0.04 + Math.sin(gSeconds * 7 + lantern.phase) * 0.025;

    drawCube(new Matrix4().translate(x, y + 0.34, z).scale(0.12, 0.62, 0.12), [0.04, 0.05, 0.09, 1], TEX.stone, 0.25);
    drawCube(new Matrix4().translate(x, y + 0.72, z).scale(0.22 + flicker, 0.22 + flicker, 0.22 + flicker), [0.05, 0.92, 1.0, 0.86], -1, 0);
  }
}

function drawMoonwell() {
  const x = mapToWorld(16);
  const z = mapToWorld(15);
  const y = getTerrainHeightAtWorld(x, z);
  const pulse = Math.sin(gSeconds * 3) * 0.05;
  const glowColor = gGameWon ? [0.08, 1.0, 0.9, 0.94] : [0.86, 0.08, 1.0, 0.72];

  drawCube(new Matrix4().translate(x, y + 0.12, z).scale(1.3, 0.24, 1.3), [0.04, 0.05, 0.09, 1], TEX.stone, 0.75);
  drawCube(new Matrix4().translate(x, y + 0.38, z).scale(0.78, 0.28, 0.78), [0.12, 0.05, 0.19, 1], TEX.brick, 0.7);
  drawCube(new Matrix4().translate(x, y + 0.78 + pulse, z).rotate(gSeconds * 34, 0, 1, 0).scale(0.36, 0.62, 0.36), glowColor, TEX.crystal, 0.95);

  if (gGameWon) {
    drawCube(new Matrix4().translate(x, y + 2.1, z).scale(0.18, 2.6, 0.18), [0.05, 1.0, 0.9, 0.42], -1, 0);
  }
}

function drawCollectibles() {
  for (const shard of gCollectibles) {
    if (shard.collected) continue;

    const x = mapToWorld(shard.x);
    const z = mapToWorld(shard.z);
    const y = gTerrainHeights[shard.z][shard.x] + 0.58 + Math.sin(gSeconds * 3 + shard.x) * 0.08;
    const accent = (shard.x + shard.z) % 2 === 0 ? [0.03, 1.0, 0.95, 0.95] : [1.0, 0.04, 0.78, 0.95];
    const matrix = new Matrix4()
      .translate(x, y, z)
      .rotate(gSeconds * 84 + shard.z * 9, 0, 1, 0)
      .rotate(28, 1, 0, 0)
      .scale(0.52, 0.52, 0.52);

    drawCube(matrix, accent, TEX.crystal, 0.78);
    drawCube(new Matrix4().translate(x, y + 1.3, z).scale(0.08, 2.2, 0.08), accent, -1, 0);
    drawCube(new Matrix4().translate(x, gTerrainHeights[shard.z][shard.x] + 0.08, z).scale(0.88, 0.035, 0.88), [accent[0], accent[1], accent[2], 0.58], -1, 0);
  }
}

function drawFireflies() {
  const centerX = mapToWorld(16);
  const centerZ = mapToWorld(15);

  for (let i = 0; i < 18; i += 1) {
    const angle = gSeconds * (0.55 + i * 0.018) + i * 2.1;
    const radius = 1.3 + (i % 5) * 0.34;
    const x = centerX + Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle * 0.92) * radius;
    const y = getTerrainHeightAtWorld(x, z) + 1.1 + Math.sin(gSeconds * 2.2 + i) * 0.46;
    const color = i % 3 === 0 ? [1.0, 0.07, 0.78, 0.88] : [0.05, 0.94, 1.0, 0.76];
    const size = i % 3 === 0 ? 0.07 : 0.05;

    drawCube(new Matrix4().translate(x, y, z).scale(size, size, size), color, -1, 0);
  }
}

function drawBats() {
  drawBlockyBat(mapToWorld(14), mapToWorld(14), 0.82, 15, 0);
  drawBlockyBat(mapToWorld(18), mapToWorld(14), 0.72, -20, 1.7);
  drawBlockyBat(mapToWorld(17), mapToWorld(17), 0.46, 155, 3.2);
  drawBlockyBat(mapToWorld(15), mapToWorld(17), 0.42, -150, 4.4);
}

function drawBlockyBat(worldX, worldZ, scale, yaw, phase) {
  const terrainY = getTerrainHeightAtWorld(worldX, worldZ);
  const bob = Math.sin(gSeconds * 2.4 + phase) * 0.08;
  const flap = Math.sin(gSeconds * 5.6 + phase) * 24;
  const root = new Matrix4()
    .translate(worldX, terrainY + 0.82 + bob, worldZ)
    .rotate(yaw, 0, 1, 0);

  const body = [0.04, 0.045, 0.075, 1];
  const belly = [0.1, 0.08, 0.14, 1];
  const wing = [0.09, 0.04, 0.13, 0.96];
  const eye = [0.05, 1.0, 0.92, 1];

  drawCube(new Matrix4(root).scale(0.56 * scale, 0.34 * scale, 0.38 * scale), body, -1, 0);
  drawCube(new Matrix4(root).translate(0, 0.02 * scale, 0.13 * scale).scale(0.38 * scale, 0.2 * scale, 0.18 * scale), belly, -1, 0);
  drawCube(new Matrix4(root).translate(0, 0.31 * scale, 0.08 * scale).scale(0.38 * scale, 0.28 * scale, 0.32 * scale), body, -1, 0);
  drawCube(new Matrix4(root).translate(-0.09 * scale, 0.34 * scale, 0.26 * scale).scale(0.055 * scale, 0.055 * scale, 0.055 * scale), eye, -1, 0);
  drawCube(new Matrix4(root).translate(0.09 * scale, 0.34 * scale, 0.26 * scale).scale(0.055 * scale, 0.055 * scale, 0.055 * scale), eye, -1, 0);
  drawCube(new Matrix4(root).translate(-0.16 * scale, 0.56 * scale, 0).rotate(-24, 0, 0, 1).scale(0.12 * scale, 0.28 * scale, 0.08 * scale), wing, -1, 0);
  drawCube(new Matrix4(root).translate(0.16 * scale, 0.56 * scale, 0).rotate(24, 0, 0, 1).scale(0.12 * scale, 0.28 * scale, 0.08 * scale), wing, -1, 0);
  drawCube(new Matrix4(root).translate(-0.48 * scale, 0.1 * scale, 0).rotate(16 + flap, 0, 0, 1).scale(0.75 * scale, 0.08 * scale, 0.28 * scale), wing, -1, 0);
  drawCube(new Matrix4(root).translate(0.48 * scale, 0.1 * scale, 0).rotate(-16 - flap, 0, 0, 1).scale(0.75 * scale, 0.08 * scale, 0.28 * scale), wing, -1, 0);
}

function drawCube(matrix, color, textureId = -1, textureWeight = 0) {
  gl.uniformMatrix4fv(u_ModelMatrix, false, matrix.elements);
  gl.uniform4f(u_BaseColor, color[0], color[1], color[2], color[3]);
  gl.uniform1i(u_WhichTexture, textureId);
  gl.uniform1f(u_TexColorWeight, textureWeight);
  bindInterleavedBuffer(gCubeBuffer);
  gl.drawArrays(gl.TRIANGLES, 0, gCubeVertexCount);
}

function bindInterleavedBuffer(buffer) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * BYTES_PER_FLOAT, 0);
  gl.vertexAttribPointer(a_UV, 2, gl.FLOAT, false, FLOATS_PER_VERTEX * BYTES_PER_FLOAT, 3 * BYTES_PER_FLOAT);
  gl.vertexAttribPointer(a_Shade, 1, gl.FLOAT, false, FLOATS_PER_VERTEX * BYTES_PER_FLOAT, 5 * BYTES_PER_FLOAT);
  gl.enableVertexAttribArray(a_Position);
  gl.enableVertexAttribArray(a_UV);
  gl.enableVertexAttribArray(a_Shade);
}

function appendCube(vertices, cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy - sy / 2;
  const y1 = cy + sy / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;

  appendFace(vertices, [
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1],
    [x0, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ], 0.96, sx, sy);

  appendFace(vertices, [
    [x1, y0, z0], [x0, y0, z0], [x0, y1, z0],
    [x1, y0, z0], [x0, y1, z0], [x1, y1, z0],
  ], 0.7, sx, sy);

  appendFace(vertices, [
    [x0, y1, z1], [x1, y1, z1], [x1, y1, z0],
    [x0, y1, z1], [x1, y1, z0], [x0, y1, z0],
  ], 1.08, sx, sz);

  appendFace(vertices, [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1],
    [x0, y0, z0], [x1, y0, z1], [x0, y0, z1],
  ], 0.58, sx, sz);

  appendFace(vertices, [
    [x1, y0, z1], [x1, y0, z0], [x1, y1, z0],
    [x1, y0, z1], [x1, y1, z0], [x1, y1, z1],
  ], 0.84, sz, sy);

  appendFace(vertices, [
    [x0, y0, z0], [x0, y0, z1], [x0, y1, z1],
    [x0, y0, z0], [x0, y1, z1], [x0, y1, z0],
  ], 0.78, sz, sy);
}

function appendFace(vertices, points, shade, uScale, vScale) {
  const uMax = Math.max(1, uScale);
  const vMax = Math.max(1, vScale);
  const uvs = [
    [0, 0], [uMax, 0], [uMax, vMax],
    [0, 0], [uMax, vMax], [0, vMax],
  ];

  for (let i = 0; i < points.length; i += 1) {
    vertices.push(points[i][0], points[i][1], points[i][2], uvs[i][0], uvs[i][1], shade);
  }
}

function initTextures() {
  return Promise.all(TEXTURE_DEFS.map((textureDef) => loadTexture(textureDef)));
}

function loadTexture(textureDef) {
  return new Promise((resolve) => {
    const texture = gl.createTexture();
    const image = new Image();

    image.onload = () => {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.activeTexture(gl.TEXTURE0 + textureDef.unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.uniform1i(textureDef.location, textureDef.unit);
      resolve();
    };

    image.onerror = () => {
      createFallbackTexture(textureDef, texture);
      resolve();
    };

    image.src = textureDef.url;
  });
}

function createFallbackTexture(textureDef, texture) {
  const color = new Uint8Array([textureDef.fallback[0], textureDef.fallback[1], textureDef.fallback[2], 255]);
  gl.activeTexture(gl.TEXTURE0 + textureDef.unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, color);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.uniform1i(textureDef.location, textureDef.unit);
}

function updateHud(delta) {
  gFrameSamples.push(delta);
  if (gFrameSamples.length > 20) {
    gFrameSamples.shift();
  }

  const avg = gFrameSamples.reduce((sum, value) => sum + value, 0) / gFrameSamples.length;
  const fps = avg > 0 ? 1 / avg : 0;
  const shards = getCollectedShardCount();
  const eye = camera.eye.elements;
  const cell = getMapCellFromWorld(eye[0], eye[2]);

  gHud.fps.textContent = fps.toFixed(1);
  gHud.shards.textContent = `${shards}/${gCollectibles.length}`;
  gHud.blocks.textContent = `${gStaticBlockCount}`;
  gHud.position.textContent = cell ? `${cell.x}, ${cell.z}` : "--";
  gHud.boots.textContent = gAntigravityBoots ? "ON" : isAirborne() ? "FALL" : "OFF";
  gHud.meter.style.width = `${(shards / gCollectibles.length) * 100}%`;
  const remainingShards = gCollectibles.length - shards;
  const coreWord = remainingShards === 1 ? "core" : "cores";
  gHud.story.textContent = gGameWon
    ? "Grid secured. The rogue implants are quarantined."
    : STORY_STATUS;
  if (gHud.lore) {
    gHud.lore.textContent = LORE_LINES[shards] || LORE_LINES[0];
  }
}

function getCollectedShardCount() {
  return gCollectibles.filter((shard) => shard.collected).length;
}

function logAction(message) {
  if (gHud.action) {
    gHud.action.textContent = message;
  }
}

function mapToWorld(index) {
  return index - WORLD_HALF + 0.5;
}

function getMapCellFromWorld(worldX, worldZ) {
  const x = Math.floor(worldX + WORLD_HALF);
  const z = Math.floor(worldZ + WORLD_HALF);

  if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) {
    return null;
  }

  return { x, z };
}

function getFootprintCells(worldX, worldZ) {
  const cells = [];
  const seen = new Set();

  for (const offset of FOOTPRINT_OFFSETS) {
    const cell = getMapCellFromWorld(worldX + offset[0], worldZ + offset[1]);
    if (!cell) {
      return null;
    }

    const key = `${cell.x},${cell.z}`;
    if (!seen.has(key)) {
      seen.add(key);
      cells.push(cell);
    }
  }

  return cells;
}

function getTerrainHeightAtWorld(worldX, worldZ) {
  const cell = getMapCellFromWorld(worldX, worldZ);
  if (!cell) {
    return 0.04;
  }
  return gTerrainHeights[cell.z][cell.x];
}

function getSupportHeightAtWorld(worldX, worldZ) {
  const cells = getFootprintCells(worldX, worldZ);
  if (!cells) {
    return getTerrainHeightAtWorld(worldX, worldZ);
  }

  let surfaceY = 0.04;
  for (const cell of cells) {
    surfaceY = Math.max(surfaceY, gTerrainHeights[cell.z][cell.x] + gWorldHeights[cell.z][cell.x]);
  }

  return surfaceY;
}

function getGroundedEyeY(worldX, worldZ) {
  return getSupportHeightAtWorld(worldX, worldZ) + PLAYER_HEIGHT;
}

function playerCollidesAt(worldX, eyeY, worldZ) {
  const cells = getFootprintCells(worldX, worldZ);
  if (!cells) {
    return true;
  }

  const bodyBottom = eyeY - PLAYER_HEIGHT + 0.04;
  const bodyTop = eyeY + 0.12;

  for (const cell of cells) {
    const blockHeight = gWorldHeights[cell.z][cell.x];
    if (blockHeight <= 0) {
      continue;
    }

    const blockBottom = gTerrainHeights[cell.z][cell.x];
    const blockTop = blockBottom + blockHeight;
    if (bodyBottom < blockTop - 0.025 && bodyTop > blockBottom + 0.025) {
      return true;
    }
  }

  return false;
}

function setCameraPosition(x, y, z) {
  const eye = camera.eye.elements;
  const at = camera.at.elements;
  const lookOffset = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];

  eye[0] = x;
  eye[1] = y;
  eye[2] = z;
  at[0] = x + lookOffset[0];
  at[1] = y + lookOffset[1];
  at[2] = z + lookOffset[2];
  camera.updateViewMatrix();
}

function resizeCanvasToDisplaySize() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    if (camera) {
      camera.updateProjectionMatrix(canvas);
    }
  }
}

function createShader(glContext, type, source) {
  const shader = glContext.createShader(type);
  glContext.shaderSource(shader, source);
  glContext.compileShader(shader);

  if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
    throw new Error(glContext.getShaderInfoLog(shader));
  }

  return shader;
}

function createProgram(glContext, vshaderSource, fshaderSource) {
  const vertexShader = createShader(glContext, glContext.VERTEX_SHADER, vshaderSource);
  const fragmentShader = createShader(glContext, glContext.FRAGMENT_SHADER, fshaderSource);
  const program = glContext.createProgram();

  glContext.attachShader(program, vertexShader);
  glContext.attachShader(program, fragmentShader);
  glContext.linkProgram(program);

  if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) {
    throw new Error(glContext.getProgramInfoLog(program));
  }

  return program;
}
