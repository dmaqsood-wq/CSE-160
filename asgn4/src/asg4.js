const VSHADER_SOURCE = `
  attribute vec4 a_Position;
  attribute vec3 a_Normal;

  uniform mat4 u_ModelMatrix;
  uniform mat4 u_NormalMatrix;
  uniform mat4 u_ViewMatrix;
  uniform mat4 u_ProjectionMatrix;

  varying vec3 v_Normal;
  varying vec3 v_WorldPos;

  void main() {
    vec4 worldPos = u_ModelMatrix * a_Position;
    gl_Position = u_ProjectionMatrix * u_ViewMatrix * worldPos;
    v_WorldPos = worldPos.xyz;
    v_Normal = normalize(mat3(u_NormalMatrix) * a_Normal);
  }
`;

const FSHADER_SOURCE = `
  precision mediump float;

  varying vec3 v_Normal;
  varying vec3 v_WorldPos;

  uniform vec4 u_BaseColor;
  uniform vec3 u_CameraPos;
  uniform vec3 u_PointLightPos;
  uniform vec3 u_PointLightColor;
  uniform vec3 u_SpotLightPos;
  uniform vec3 u_SpotDirection;
  uniform vec3 u_SpotLightColor;
  uniform float u_SpotCutoff;
  uniform float u_SpotOuterCutoff;
  uniform int u_LightingOn;
  uniform int u_NormalVizOn;
  uniform int u_PointLightOn;
  uniform int u_SpotLightOn;
  uniform float u_Emissive;

  vec3 phongPoint(vec3 normal, vec3 viewDir, vec3 lightPos, vec3 lightColor) {
    vec3 lightVector = lightPos - v_WorldPos;
    float distance = length(lightVector);
    vec3 lightDir = normalize(lightVector);
    float nDotL = max(dot(normal, lightDir), 0.0);
    vec3 reflectDir = reflect(-lightDir, normal);
    float specular = pow(max(dot(viewDir, reflectDir), 0.0), 36.0);
    float attenuation = 1.0 / (1.0 + 0.06 * distance + 0.018 * distance * distance);
    vec3 diffuse = nDotL * u_BaseColor.rgb * lightColor;
    vec3 shine = specular * 0.62 * lightColor;
    return (diffuse + shine) * attenuation;
  }

  vec3 phongSpot(vec3 normal, vec3 viewDir) {
    vec3 lightVector = u_SpotLightPos - v_WorldPos;
    float distance = length(lightVector);
    vec3 lightDir = normalize(lightVector);
    float theta = dot(normalize(-lightDir), normalize(u_SpotDirection));
    float epsilon = max(u_SpotCutoff - u_SpotOuterCutoff, 0.001);
    float cone = clamp((theta - u_SpotOuterCutoff) / epsilon, 0.0, 1.0);
    float nDotL = max(dot(normal, lightDir), 0.0);
    vec3 reflectDir = reflect(-lightDir, normal);
    float specular = pow(max(dot(viewDir, reflectDir), 0.0), 44.0);
    float attenuation = 1.0 / (1.0 + 0.05 * distance + 0.016 * distance * distance);
    vec3 diffuse = nDotL * u_BaseColor.rgb * u_SpotLightColor;
    vec3 shine = specular * 0.55 * u_SpotLightColor;
    return (diffuse + shine) * attenuation * cone;
  }

  void main() {
    vec3 normal = normalize(v_Normal);

    if (u_NormalVizOn == 1) {
      gl_FragColor = vec4(normal * 0.5 + 0.5, u_BaseColor.a);
      return;
    }

    if (u_LightingOn == 0 || u_Emissive > 0.5) {
      gl_FragColor = u_BaseColor;
      return;
    }

    vec3 viewDir = normalize(u_CameraPos - v_WorldPos);
    vec3 color = u_BaseColor.rgb * 0.18;

    if (u_PointLightOn == 1) {
      color += phongPoint(normal, viewDir, u_PointLightPos, u_PointLightColor);
    }

    if (u_SpotLightOn == 1) {
      color += phongSpot(normal, viewDir);
    }

    gl_FragColor = vec4(min(color, vec3(1.0)), u_BaseColor.a);
  }
`;

const FLOATS_PER_VERTEX = 6;
const BYTES_PER_FLOAT = Float32Array.BYTES_PER_ELEMENT;

let canvas;
let gl;
let a_Position;
let a_Normal;
let u_ModelMatrix;
let u_NormalMatrix;
let u_ViewMatrix;
let u_ProjectionMatrix;
let u_BaseColor;
let u_CameraPos;
let u_PointLightPos;
let u_PointLightColor;
let u_SpotLightPos;
let u_SpotDirection;
let u_SpotLightColor;
let u_SpotCutoff;
let u_SpotOuterCutoff;
let u_LightingOn;
let u_NormalVizOn;
let u_PointLightOn;
let u_SpotLightOn;
let u_Emissive;

const gPrimitives = {
  cube: null,
  sphere: null,
  cone: null,
  triangle: null,
};

let gObjPrimitive = null;
let gObjTriangleCount = 0;
let gSeconds = 0;
let gStartTime = 0;
let gLastFrameTime = 0;
let gFrameSamples = [];
let gPointLightPosition = [0, 2.4, 2.2];
let gDragState = { active: false, lastX: 0, lastY: 0 };
let gPokeUntil = 0;
const gKeys = new Set();

const gState = {
  lighting: true,
  normalViz: false,
  pointLight: true,
  spotLight: true,
  lightMotion: true,
  batMotion: true,
};

const gSettings = {
  pointX: 0,
  pointY: 2.6,
  pointZ: 1.4,
  orbitRadius: 2.4,
  lightR: 255,
  lightG: 226,
  lightB: 186,
  spotAngle: 18,
  cameraYaw: 28,
  cameraPitch: 18,
  cameraDistance: 8.6,
};

const gDefaultPose = {
  headYaw: 0,
  jawOpen: 8,
  leftShoulder: 34,
  leftElbow: -18,
  leftWrist: 10,
  rightShoulder: -34,
  rightElbow: 18,
  rightWrist: -10,
  leftHip: -12,
  leftKnee: 20,
  leftAnkle: -12,
  rightHip: 12,
  rightKnee: 20,
  rightAnkle: 12,
};

const gPose = { ...gDefaultPose };

const gControlSpecs = [
  { id: "pointX", label: "Base X", min: -4, max: 4, step: 0.1, group: "pointControls" },
  { id: "pointY", label: "Height", min: 0.4, max: 5.5, step: 0.1, group: "pointControls" },
  { id: "pointZ", label: "Base Z", min: -4, max: 4, step: 0.1, group: "pointControls" },
  { id: "orbitRadius", label: "Orbit", min: 0, max: 4, step: 0.1, group: "pointControls" },
  { id: "lightR", label: "Red", min: 0, max: 255, step: 1, group: "colorControls" },
  { id: "lightG", label: "Green", min: 0, max: 255, step: 1, group: "colorControls" },
  { id: "lightB", label: "Blue", min: 0, max: 255, step: 1, group: "colorControls" },
  { id: "spotAngle", label: "Cone", min: 8, max: 36, step: 1, group: "spotControls" },
  { id: "cameraYaw", label: "Yaw", min: -180, max: 180, step: 1, group: "cameraControls" },
  { id: "cameraPitch", label: "Pitch", min: -18, max: 70, step: 1, group: "cameraControls" },
  { id: "cameraDistance", label: "Distance", min: 4, max: 14, step: 0.1, group: "cameraControls" },
];

async function main() {
  setupWebGL();
  connectVariablesToGLSL();
  initPrimitiveBuffers();
  setupControls();
  setupInput();

  gl.clearColor(0.015, 0.02, 0.024, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gStartTime = performance.now();
  gLastFrameTime = gStartTime;
  loadObjModel();
  requestAnimationFrame(tick);
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
  a_Normal = gl.getAttribLocation(program, "a_Normal");
  u_ModelMatrix = gl.getUniformLocation(program, "u_ModelMatrix");
  u_NormalMatrix = gl.getUniformLocation(program, "u_NormalMatrix");
  u_ViewMatrix = gl.getUniformLocation(program, "u_ViewMatrix");
  u_ProjectionMatrix = gl.getUniformLocation(program, "u_ProjectionMatrix");
  u_BaseColor = gl.getUniformLocation(program, "u_BaseColor");
  u_CameraPos = gl.getUniformLocation(program, "u_CameraPos");
  u_PointLightPos = gl.getUniformLocation(program, "u_PointLightPos");
  u_PointLightColor = gl.getUniformLocation(program, "u_PointLightColor");
  u_SpotLightPos = gl.getUniformLocation(program, "u_SpotLightPos");
  u_SpotDirection = gl.getUniformLocation(program, "u_SpotDirection");
  u_SpotLightColor = gl.getUniformLocation(program, "u_SpotLightColor");
  u_SpotCutoff = gl.getUniformLocation(program, "u_SpotCutoff");
  u_SpotOuterCutoff = gl.getUniformLocation(program, "u_SpotOuterCutoff");
  u_LightingOn = gl.getUniformLocation(program, "u_LightingOn");
  u_NormalVizOn = gl.getUniformLocation(program, "u_NormalVizOn");
  u_PointLightOn = gl.getUniformLocation(program, "u_PointLightOn");
  u_SpotLightOn = gl.getUniformLocation(program, "u_SpotLightOn");
  u_Emissive = gl.getUniformLocation(program, "u_Emissive");
}

function initPrimitiveBuffers() {
  gPrimitives.cube = createPrimitive(cubeMesh());
  gPrimitives.sphere = createPrimitive(sphereMesh(24, 32));
  gPrimitives.cone = createPrimitive(coneMesh(28));
  gPrimitives.triangle = createPrimitive(triangleMesh());
}

function setupControls() {
  for (const spec of gControlSpecs) {
    addSliderControl(spec);
  }

  setupToggleButton("lightingButton", "lighting", "Lighting On", "Lighting Off");
  setupToggleButton("normalButton", "normalViz", "Normals On", "Normals Off");
  setupToggleButton("pointButton", "pointLight", "Point On", "Point Off");
  setupToggleButton("spotButton", "spotLight", "Spot On", "Spot Off");
  setupToggleButton("lightMotionButton", "lightMotion", "Light Motion On", "Light Motion Off");
  setupToggleButton("batMotionButton", "batMotion", "Bat Motion On", "Bat Motion Off");
  syncControlValues();
  updateToggleButtons();
}

function setupToggleButton(id, key, onText, offText) {
  const button = document.getElementById(id);
  button.dataset.onText = onText;
  button.dataset.offText = offText;
  button.addEventListener("click", () => {
    gState[key] = !gState[key];
    updateToggleButtons();
  });
}

function updateToggleButtons() {
  const configs = [
    ["lightingButton", gState.lighting],
    ["normalButton", gState.normalViz],
    ["pointButton", gState.pointLight],
    ["spotButton", gState.spotLight],
    ["lightMotionButton", gState.lightMotion],
    ["batMotionButton", gState.batMotion],
  ];

  for (const [id, active] of configs) {
    const button = document.getElementById(id);
    button.classList.toggle("active", active);
    button.textContent = active ? button.dataset.onText : button.dataset.offText;
  }
}

function addSliderControl(spec) {
  const wrapper = document.createElement("div");
  wrapper.className = "control";

  const label = document.createElement("label");
  label.setAttribute("for", spec.id);
  label.textContent = spec.label;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = spec.id;
  slider.min = String(spec.min);
  slider.max = String(spec.max);
  slider.step = String(spec.step);
  slider.value = String(gSettings[spec.id]);

  const value = document.createElement("div");
  value.className = "value";
  value.id = `${spec.id}Value`;
  value.textContent = formatControlValue(gSettings[spec.id]);

  slider.addEventListener("input", () => {
    gSettings[spec.id] = Number(slider.value);
    value.textContent = formatControlValue(gSettings[spec.id]);
  });

  wrapper.appendChild(label);
  wrapper.appendChild(slider);
  wrapper.appendChild(value);
  document.getElementById(spec.group).appendChild(wrapper);
}

function syncControlValues() {
  for (const spec of gControlSpecs) {
    const slider = document.getElementById(spec.id);
    const value = document.getElementById(`${spec.id}Value`);
    if (slider) slider.value = String(gSettings[spec.id]);
    if (value) value.textContent = formatControlValue(gSettings[spec.id]);
  }
}

function formatControlValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function setupInput() {
  canvas.addEventListener("mousedown", (ev) => {
    canvas.focus();

    if (ev.shiftKey) {
      gPokeUntil = gSeconds + 1.2;
      return;
    }

    gDragState.active = true;
    gDragState.lastX = ev.clientX;
    gDragState.lastY = ev.clientY;
    canvas.classList.add("dragging");
  });

  window.addEventListener("mouseup", () => {
    gDragState.active = false;
    canvas.classList.remove("dragging");
  });

  window.addEventListener("mousemove", (ev) => {
    if (!gDragState.active) return;

    const dx = ev.clientX - gDragState.lastX;
    const dy = ev.clientY - gDragState.lastY;
    gDragState.lastX = ev.clientX;
    gDragState.lastY = ev.clientY;

    gSettings.cameraYaw = wrapDegrees(gSettings.cameraYaw - dx * 0.35);
    gSettings.cameraPitch = clamp(gSettings.cameraPitch + dy * 0.25, -18, 70);
    syncControlValues();
  });

  window.addEventListener("keydown", (ev) => {
    const key = ev.key.toLowerCase();
    if ("wasdqe".includes(key)) {
      ev.preventDefault();
    }
    gKeys.add(key);
  });

  window.addEventListener("keyup", (ev) => {
    gKeys.delete(ev.key.toLowerCase());
  });

  window.addEventListener("resize", resizeCanvasToDisplaySize);
}

function tick(now) {
  const delta = Math.min(0.05, (now - gLastFrameTime) / 1000);
  gLastFrameTime = now;
  gSeconds = (now - gStartTime) / 1000;

  handleKeyboard(delta);
  updateAnimationAngles();
  renderScene(delta);
  updateHud(delta);
  requestAnimationFrame(tick);
}

function handleKeyboard(delta) {
  const orbitSpeed = 80 * delta;
  const pitchSpeed = 50 * delta;
  const dollySpeed = 4 * delta;

  if (gKeys.has("a")) gSettings.cameraYaw = wrapDegrees(gSettings.cameraYaw + orbitSpeed);
  if (gKeys.has("d")) gSettings.cameraYaw = wrapDegrees(gSettings.cameraYaw - orbitSpeed);
  if (gKeys.has("q")) gSettings.cameraPitch = clamp(gSettings.cameraPitch + pitchSpeed, -18, 70);
  if (gKeys.has("e")) gSettings.cameraPitch = clamp(gSettings.cameraPitch - pitchSpeed, -18, 70);
  if (gKeys.has("w")) gSettings.cameraDistance = clamp(gSettings.cameraDistance - dollySpeed, 4, 14);
  if (gKeys.has("s")) gSettings.cameraDistance = clamp(gSettings.cameraDistance + dollySpeed, 4, 14);

  if (gKeys.size > 0) {
    syncControlValues();
  }
}

function updateAnimationAngles() {
  const pokeWave = Math.max(0, gPokeUntil - gSeconds);
  const pokeAmt = pokeWave > 0 ? Math.sin((1.2 - pokeWave) * Math.PI * 3.2) * (pokeWave / 1.2) : 0;

  if (!gState.batMotion && pokeAmt === 0) {
    return;
  }

  const flap = Math.sin(gSeconds * 6.2);
  const secondary = Math.sin(gSeconds * 3.1 + 0.8);
  const bodyBob = Math.sin(gSeconds * 2.4);

  if (gState.batMotion) {
    gPose.leftShoulder = 44 + flap * 26;
    gPose.rightShoulder = -44 - flap * 26;
    gPose.leftElbow = -24 + flap * -18 + secondary * 6;
    gPose.rightElbow = 24 - flap * -18 - secondary * 6;
    gPose.leftWrist = 12 + flap * 14;
    gPose.rightWrist = -12 - flap * 14;
    gPose.leftHip = -8 + bodyBob * 8;
    gPose.rightHip = 8 - bodyBob * 8;
    gPose.leftKnee = 24 + secondary * 10;
    gPose.rightKnee = 24 - secondary * 10;
    gPose.leftAnkle = -12 + secondary * 7;
    gPose.rightAnkle = 12 - secondary * 7;
    gPose.headYaw = secondary * 8;
    gPose.jawOpen = 8 + Math.max(0, flap) * 10;
  }

  if (pokeAmt !== 0) {
    gPose.jawOpen = 28 + pokeAmt * 22;
    gPose.headYaw = pokeAmt * 16;
    gPose.leftShoulder = 74 + pokeAmt * 8;
    gPose.rightShoulder = -74 - pokeAmt * 8;
    gPose.leftWrist = 28 + pokeAmt * 10;
    gPose.rightWrist = -28 - pokeAmt * 10;
  }
}

function renderScene() {
  if (!gl) return;

  resizeCanvasToDisplaySize();
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gPointLightPosition = computePointLightPosition();

  const camera = computeCamera();
  const viewMatrix = new Matrix4();
  viewMatrix.setLookAt(
    camera.eye[0], camera.eye[1], camera.eye[2],
    camera.target[0], camera.target[1], camera.target[2],
    0, 1, 0
  );

  const projectionMatrix = new Matrix4();
  projectionMatrix.setPerspective(58, canvas.width / canvas.height, 0.1, 100);

  const pointColor = getPointLightColor();
  const spotPos = [0.0, 2.28, -4.36];
  const spotTarget = [0.0, 0.55, -0.35];
  const spotDirection = normalizeArray(subtractArray(spotTarget, spotPos));
  const inner = Math.cos(degreesToRadians(gSettings.spotAngle));
  const outer = Math.cos(degreesToRadians(gSettings.spotAngle + 8));

  gl.uniformMatrix4fv(u_ViewMatrix, false, viewMatrix.elements);
  gl.uniformMatrix4fv(u_ProjectionMatrix, false, projectionMatrix.elements);
  gl.uniform3f(u_CameraPos, camera.eye[0], camera.eye[1], camera.eye[2]);
  gl.uniform3f(u_PointLightPos, gPointLightPosition[0], gPointLightPosition[1], gPointLightPosition[2]);
  gl.uniform3f(u_PointLightColor, pointColor[0], pointColor[1], pointColor[2]);
  gl.uniform3f(u_SpotLightPos, spotPos[0], spotPos[1], spotPos[2]);
  gl.uniform3f(u_SpotDirection, spotDirection[0], spotDirection[1], spotDirection[2]);
  gl.uniform3f(u_SpotLightColor, 0.95, 0.97, 1.0);
  gl.uniform1f(u_SpotCutoff, inner);
  gl.uniform1f(u_SpotOuterCutoff, outer);
  gl.uniform1i(u_LightingOn, gState.lighting ? 1 : 0);
  gl.uniform1i(u_NormalVizOn, gState.normalViz ? 1 : 0);
  gl.uniform1i(u_PointLightOn, gState.pointLight ? 1 : 0);
  gl.uniform1i(u_SpotLightOn, gState.spotLight ? 1 : 0);

  drawWorld();
  drawSceneCube();
  drawSpheres();
  drawObjModel();
  drawBat();
  drawLightMarkers(spotPos, pointColor);
}

function computeCamera() {
  const yaw = degreesToRadians(gSettings.cameraYaw);
  const pitch = degreesToRadians(gSettings.cameraPitch);
  const distance = gSettings.cameraDistance;
  const target = [0, 0.78, 0];
  const cosPitch = Math.cos(pitch);
  const eye = [
    target[0] + Math.sin(yaw) * cosPitch * distance,
    target[1] + Math.sin(pitch) * distance,
    target[2] + Math.cos(yaw) * cosPitch * distance,
  ];

  return { eye, target };
}

function computePointLightPosition() {
  if (!gState.lightMotion) {
    return [gSettings.pointX, gSettings.pointY, gSettings.pointZ];
  }

  const angle = gSeconds * 0.9;
  return [
    gSettings.pointX + Math.cos(angle) * gSettings.orbitRadius,
    gSettings.pointY + Math.sin(gSeconds * 1.7) * 0.38,
    gSettings.pointZ + Math.sin(angle) * gSettings.orbitRadius,
  ];
}

function getPointLightColor() {
  return [
    gSettings.lightR / 255,
    gSettings.lightG / 255,
    gSettings.lightB / 255,
  ];
}

function drawWorld() {
  drawCube(new Matrix4().translate(0, -0.56, 0).scale(9.5, 0.12, 9.5), [0.16, 0.22, 0.20, 1]);
  drawCube(new Matrix4().translate(0, 0.96, -4.72).scale(9.5, 3.05, 0.16), [0.18, 0.20, 0.25, 1]);
  drawCube(new Matrix4().translate(-4.72, 0.72, 0).scale(0.16, 2.55, 9.5), [0.13, 0.18, 0.22, 1]);
  drawCube(new Matrix4().translate(4.72, 0.52, 0).scale(0.16, 2.15, 9.5), [0.13, 0.18, 0.22, 1]);

  drawCube(new Matrix4().translate(2.55, -0.12, 2.45).scale(1.45, 0.76, 1.45), [0.23, 0.27, 0.28, 1]);
}

function drawSceneCube() {
  drawCube(
    new Matrix4().translate(-2.9, -0.12, -1.25).rotate(14, 0, 1, 0).scale(0.76, 0.76, 0.76),
    [0.34, 0.41, 0.43, 1]
  );
}

function drawSpheres() {
  drawSphere(new Matrix4().translate(2.0, 0.28, -1.35).scale(1.15, 1.15, 1.15), [0.78, 0.48, 0.36, 1]);
  drawSphere(new Matrix4().translate(-1.8, 0.0, 1.85).scale(0.72, 0.72, 0.72), [0.43, 0.82, 0.76, 1]);
}

function drawObjModel() {
  if (!gObjPrimitive) return;

  const modelMatrix = new Matrix4()
    .translate(2.55, 0.54, 2.45)
    .rotate(gSeconds * 12, 0, 1, 0)
    .scale(0.58, 0.58, 0.58);
  drawPrimitive(gObjPrimitive, modelMatrix, [0.60, 0.52, 0.88, 1]);
}

function drawLightMarkers(spotPos, pointColor) {
  drawCube(
    new Matrix4().translate(gPointLightPosition[0], gPointLightPosition[1], gPointLightPosition[2]).scale(0.16, 0.16, 0.16),
    [pointColor[0], pointColor[1], pointColor[2], 1],
    { emissive: true }
  );

  drawCube(
    new Matrix4().translate(spotPos[0], spotPos[1], -4.57).scale(0.54, 0.20, 0.12),
    [0.08, 0.11, 0.14, 1]
  );
  drawCube(
    new Matrix4().translate(spotPos[0], spotPos[1], spotPos[2]).scale(0.20, 0.14, 0.16),
    [0.82, 0.88, 1.0, 1],
    { emissive: true }
  );
}

function drawBat() {
  const bodyBob = gState.batMotion ? Math.sin(gSeconds * 2.4) * 0.08 : 0;
  const root = new Matrix4()
    .translate(-0.22, 1.22 + bodyBob, 0.0)
    .rotate(-8, 0, 1, 0);

  const fur = [0.13, 0.14, 0.18, 1];
  const furLight = [0.22, 0.23, 0.29, 1];
  const membrane = [0.36, 0.20, 0.30, 0.94];
  const claw = [0.82, 0.74, 0.62, 1];
  const eye = [0.95, 0.20, 0.16, 1];

  drawCube(new Matrix4(root).translate(0, 0.05, 0).scale(1.35, 0.72, 0.75), fur);
  drawCube(new Matrix4(root).translate(0, 0.12, 0.1).scale(0.9, 0.55, 0.52), furLight);
  drawCone(new Matrix4(root).translate(0, -0.28, -0.34).rotate(110, 1, 0, 0).scale(0.14, 0.35, 0.14), fur);

  drawWing(root, true, membrane, furLight, claw);
  drawWing(root, false, membrane, furLight, claw);
  drawLeg(root, true, furLight, claw);
  drawLeg(root, false, furLight, claw);

  const headJoint = new Matrix4(root);
  headJoint.translate(0, 0.66, 0.18);
  headJoint.rotate(gPose.headYaw, 0, 1, 0);

  drawCube(new Matrix4(headJoint).translate(0, 0.03, 0).scale(0.68, 0.54, 0.56), fur);
  drawCube(new Matrix4(headJoint).translate(-0.16, 0.05, 0.27).scale(0.08, 0.08, 0.08), eye);
  drawCube(new Matrix4(headJoint).translate(0.16, 0.05, 0.27).scale(0.08, 0.08, 0.08), eye);

  drawCone(new Matrix4(headJoint).translate(-0.2, 0.42, -0.04).rotate(-20, 0, 0, 1).scale(0.13, 0.38, 0.13), membrane);
  drawCone(new Matrix4(headJoint).translate(0.2, 0.42, -0.04).rotate(20, 0, 0, 1).scale(0.13, 0.38, 0.13), membrane);

  const jawJoint = new Matrix4(headJoint);
  jawJoint.translate(0, -0.14, 0.2);
  jawJoint.rotate(-gPose.jawOpen, 1, 0, 0);
  drawCube(new Matrix4(jawJoint).translate(0, -0.03, 0.12).scale(0.48, 0.12, 0.32), furLight);
  drawCone(new Matrix4(jawJoint).translate(-0.11, -0.06, 0.23).rotate(180, 1, 0, 0).scale(0.04, 0.12, 0.04), claw);
  drawCone(new Matrix4(jawJoint).translate(0.11, -0.06, 0.23).rotate(180, 1, 0, 0).scale(0.04, 0.12, 0.04), claw);
}

function drawWing(root, isLeft, membraneColor, boneColor, clawColor) {
  const side = isLeft ? -1 : 1;
  const shoulder = isLeft ? gPose.leftShoulder : gPose.rightShoulder;
  const elbow = isLeft ? gPose.leftElbow : gPose.rightElbow;
  const wrist = isLeft ? gPose.leftWrist : gPose.rightWrist;
  const zTilt = isLeft ? 16 : -16;
  const upperLength = 1.18;
  const foreLength = 1.02;
  const handLength = 0.82;

  const shoulderJoint = new Matrix4(root);
  shoulderJoint.translate(0.72 * side, 0.22, 0.06);
  shoulderJoint.rotate(shoulder, 0, 0, 1);
  shoulderJoint.rotate(zTilt, 0, 1, 0);

  const elbowJoint = new Matrix4(shoulderJoint);
  elbowJoint.translate(upperLength * side, 0, 0);
  elbowJoint.rotate(elbow, 0, 0, 1);

  const wristJoint = new Matrix4(elbowJoint);
  wristJoint.translate(foreLength * side, 0, 0);
  wristJoint.rotate(wrist, 0, 0, 1);

  const bodyTop = transformPoint(root, 0.66 * side, 0.02, -0.12);
  const bodyMiddle = transformPoint(root, 0.58 * side, -0.28, -0.12);
  const bodyLower = transformPoint(root, 0.48 * side, -0.54, -0.12);
  const elbowMembrane = transformPoint(shoulderJoint, upperLength * 0.94 * side, -0.18, -0.12);
  const wristMembrane = transformPoint(elbowJoint, foreLength * 0.94 * side, -0.14, -0.12);
  const handMembrane = transformPoint(wristJoint, handLength * 0.92 * side, -0.08, -0.12);

  drawTrianglePanel(bodyTop, elbowMembrane, bodyMiddle, membraneColor);
  drawTrianglePanel(bodyMiddle, elbowMembrane, bodyLower, [0.31, 0.17, 0.26, 0.94]);
  drawTrianglePanel(bodyLower, elbowMembrane, wristMembrane, membraneColor);
  drawTrianglePanel(bodyLower, wristMembrane, handMembrane, [0.31, 0.17, 0.26, 0.94]);

  drawCube(new Matrix4(shoulderJoint).translate(0.52 * side, -0.02, 0).scale(upperLength, 0.14, 0.18), boneColor);
  drawCube(new Matrix4(elbowJoint).translate(0.46 * side, -0.01, 0).scale(foreLength, 0.11, 0.14), boneColor);
  drawCube(new Matrix4(wristJoint).translate(0.36 * side, 0, 0).scale(handLength, 0.08, 0.1), boneColor);
  drawCone(
    new Matrix4(wristJoint)
      .translate((handLength + 0.08) * side, 0.02, 0)
      .rotate(isLeft ? 90 : -90, 0, 0, 1)
      .scale(0.05, 0.16, 0.05),
    clawColor
  );
}

function drawLeg(root, isLeft, furColor, clawColor) {
  const side = isLeft ? -1 : 1;
  const hip = isLeft ? gPose.leftHip : gPose.rightHip;
  const knee = isLeft ? gPose.leftKnee : gPose.rightKnee;
  const ankle = isLeft ? gPose.leftAnkle : gPose.rightAnkle;
  const upperLength = 0.45;
  const lowerLength = 0.42;

  const hipJoint = new Matrix4(root);
  hipJoint.translate(0.28 * side, -0.42, 0.08);
  hipJoint.rotate(hip, 0, 0, 1);

  drawCube(new Matrix4(hipJoint).translate(0, -0.22, 0).scale(0.11, upperLength, 0.11), furColor);

  const kneeJoint = new Matrix4(hipJoint);
  kneeJoint.translate(0, -upperLength, 0);
  kneeJoint.rotate(knee, 0, 0, 1);

  drawCube(new Matrix4(kneeJoint).translate(0, -0.2, 0).scale(0.09, lowerLength, 0.09), furColor);

  const ankleJoint = new Matrix4(kneeJoint);
  ankleJoint.translate(0, -lowerLength, 0);
  ankleJoint.rotate(ankle, 1, 0, 0);

  drawCube(new Matrix4(ankleJoint).translate(0, -0.02, 0.12).scale(0.08, 0.06, 0.26), clawColor);
  drawCone(new Matrix4(ankleJoint).translate(0, -0.02, 0.28).rotate(90, 1, 0, 0).scale(0.03, 0.12, 0.03), clawColor);
}

function drawCube(matrix, color, options = {}) {
  drawPrimitive(gPrimitives.cube, matrix, color, options);
}

function drawSphere(matrix, color, options = {}) {
  drawPrimitive(gPrimitives.sphere, matrix, color, options);
}

function drawCone(matrix, color, options = {}) {
  drawPrimitive(gPrimitives.cone, matrix, color, options);
}

function drawTrianglePanel(pointA, pointB, pointC, color) {
  drawPrimitive(gPrimitives.triangle, trianglePanelMatrix(pointA, pointB, pointC), color);
}

function drawPrimitive(primitive, matrix, color, options = {}) {
  if (!primitive) return;

  const normalMatrix = new Matrix4();
  normalMatrix.setInverseOf(matrix);
  normalMatrix.transpose();

  gl.uniformMatrix4fv(u_ModelMatrix, false, matrix.elements);
  gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);
  gl.uniform4f(u_BaseColor, color[0], color[1], color[2], color[3]);
  gl.uniform1f(u_Emissive, options.emissive ? 1 : 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, primitive.buffer);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * BYTES_PER_FLOAT, 0);
  gl.vertexAttribPointer(a_Normal, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * BYTES_PER_FLOAT, 3 * BYTES_PER_FLOAT);
  gl.enableVertexAttribArray(a_Position);
  gl.enableVertexAttribArray(a_Normal);
  gl.drawArrays(gl.TRIANGLES, 0, primitive.count);
}

function createPrimitive(mesh) {
  const data = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    data.push(
      mesh.positions[i],
      mesh.positions[i + 1],
      mesh.positions[i + 2],
      mesh.normals[i],
      mesh.normals[i + 1],
      mesh.normals[i + 2]
    );
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return {
    buffer,
    count: mesh.positions.length / 3,
  };
}

function triangleMesh() {
  return {
    positions: [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ],
    normals: [
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ],
  };
}

function cubeMesh() {
  const positions = [];
  const normals = [];

  pushFace(positions, normals, [
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5],
    [-0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ], [0, 0, 1]);

  pushFace(positions, normals, [
    [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
    [-0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5],
  ], [0, 0, -1]);

  pushFace(positions, normals, [
    [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
    [-0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5],
  ], [0, 1, 0]);

  pushFace(positions, normals, [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5],
    [-0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5],
  ], [0, -1, 0]);

  pushFace(positions, normals, [
    [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5],
    [0.5, -0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5],
  ], [1, 0, 0]);

  pushFace(positions, normals, [
    [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5],
    [-0.5, -0.5, -0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5],
  ], [-1, 0, 0]);

  return { positions, normals };
}

function coneMesh(segments) {
  const positions = [];
  const normals = [];
  const radius = 0.5;
  const baseY = -0.5;
  const apexY = 0.5;

  for (let i = 0; i < segments; i += 1) {
    const angle1 = (i / segments) * Math.PI * 2;
    const angle2 = ((i + 1) / segments) * Math.PI * 2;
    const mid = (angle1 + angle2) / 2;
    const p1 = [Math.cos(angle1) * radius, baseY, Math.sin(angle1) * radius];
    const p2 = [Math.cos(angle2) * radius, baseY, Math.sin(angle2) * radius];
    const apex = [0, apexY, 0];
    const n1 = normalizeArray([Math.cos(angle1), radius, Math.sin(angle1)]);
    const n2 = normalizeArray([Math.cos(angle2), radius, Math.sin(angle2)]);
    const nApex = normalizeArray([Math.cos(mid), radius, Math.sin(mid)]);

    pushVertex(positions, normals, apex, nApex);
    pushVertex(positions, normals, p1, n1);
    pushVertex(positions, normals, p2, n2);

    pushVertex(positions, normals, [0, baseY, 0], [0, -1, 0]);
    pushVertex(positions, normals, p2, [0, -1, 0]);
    pushVertex(positions, normals, p1, [0, -1, 0]);
  }

  return { positions, normals };
}

function sphereMesh(latBands, longBands) {
  const positions = [];
  const normals = [];

  for (let lat = 0; lat < latBands; lat += 1) {
    for (let lon = 0; lon < longBands; lon += 1) {
      const p1 = spherePoint(lat, lon, latBands, longBands);
      const p2 = spherePoint(lat + 1, lon, latBands, longBands);
      const p3 = spherePoint(lat + 1, lon + 1, latBands, longBands);
      const p4 = spherePoint(lat, lon + 1, latBands, longBands);

      pushVertex(positions, normals, p1.position, p1.normal);
      pushVertex(positions, normals, p2.position, p2.normal);
      pushVertex(positions, normals, p3.position, p3.normal);

      pushVertex(positions, normals, p1.position, p1.normal);
      pushVertex(positions, normals, p3.position, p3.normal);
      pushVertex(positions, normals, p4.position, p4.normal);
    }
  }

  return { positions, normals };
}

function spherePoint(lat, lon, latBands, longBands) {
  const theta = (lat / latBands) * Math.PI;
  const phi = (lon / longBands) * Math.PI * 2;
  const normal = [
    Math.sin(theta) * Math.cos(phi),
    Math.cos(theta),
    Math.sin(theta) * Math.sin(phi),
  ];

  return {
    position: [normal[0] * 0.5, normal[1] * 0.5, normal[2] * 0.5],
    normal,
  };
}

function pushFace(positions, normals, points, normal) {
  for (const point of points) {
    pushVertex(positions, normals, point, normal);
  }
}

function pushVertex(positions, normals, point, normal) {
  positions.push(point[0], point[1], point[2]);
  normals.push(normal[0], normal[1], normal[2]);
}

async function loadObjModel() {
  const status = document.getElementById("objStatusValue");

  try {
    const response = await fetch("./models/faceted_crystal.obj");
    if (!response.ok) {
      throw new Error(`OBJ request failed: ${response.status}`);
    }
    const source = await response.text();
    gObjPrimitive = createPrimitive(parseObj(source));
    gObjTriangleCount = gObjPrimitive.count / 3;
    status.textContent = `${gObjTriangleCount.toFixed(0)} tris`;
  } catch (err) {
    gObjPrimitive = createPrimitive(parseObj(generateFallbackObjSource()));
    gObjTriangleCount = gObjPrimitive.count / 3;
    status.textContent = `${gObjTriangleCount.toFixed(0)} tris`;
  }
}

function parseObj(source) {
  const tempPositions = [];
  const tempNormals = [];
  const positions = [];
  const normals = [];
  const lines = source.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const parts = line.split(/\s+/);
    if (parts[0] === "v") {
      tempPositions.push([Number(parts[1]), Number(parts[2]), Number(parts[3])]);
    } else if (parts[0] === "vn") {
      tempNormals.push(normalizeArray([Number(parts[1]), Number(parts[2]), Number(parts[3])]));
    } else if (parts[0] === "f") {
      const face = parts.slice(1).map((token) => parseObjVertex(token, tempPositions, tempNormals));
      for (let i = 1; i < face.length - 1; i += 1) {
        const tri = [face[0], face[i], face[i + 1]];
        const faceNormal = normalFromPoints(tri[0].position, tri[1].position, tri[2].position);
        for (const vertex of tri) {
          pushVertex(positions, normals, vertex.position, vertex.normal || faceNormal);
        }
      }
    }
  }

  return { positions, normals };
}

function parseObjVertex(token, tempPositions, tempNormals) {
  const fields = token.split("/");
  const positionIndex = resolveObjIndex(Number(fields[0]), tempPositions.length);
  const normalIndex = fields[2] ? resolveObjIndex(Number(fields[2]), tempNormals.length) : -1;

  return {
    position: tempPositions[positionIndex],
    normal: normalIndex >= 0 ? tempNormals[normalIndex] : null,
  };
}

function resolveObjIndex(index, length) {
  return index < 0 ? length + index : index - 1;
}

function generateFallbackObjSource() {
  const lines = ["o FallbackFacetedCrystal"];
  const segments = 12;
  const upperStart = 2;
  const midStart = upperStart + segments;
  const lowerStart = midStart + segments;
  const bottomIndex = lowerStart + segments;

  lines.push("v 0 1.55 0");
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    lines.push(`v ${(Math.cos(angle) * 0.42).toFixed(4)} 0.72 ${(Math.sin(angle) * 0.42).toFixed(4)}`);
  }
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const radius = i % 2 === 0 ? 0.68 : 0.55;
    lines.push(`v ${(Math.cos(angle) * radius).toFixed(4)} -0.08 ${(Math.sin(angle) * radius).toFixed(4)}`);
  }
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    lines.push(`v ${(Math.cos(angle) * 0.38).toFixed(4)} -0.92 ${(Math.sin(angle) * 0.38).toFixed(4)}`);
  }
  lines.push("v 0 -1.35 0");

  for (let i = 0; i < segments; i += 1) {
    const next = (i + 1) % segments;
    lines.push(`f 1 ${upperStart + i} ${upperStart + next}`);
    lines.push(`f ${upperStart + i} ${midStart + i} ${midStart + next} ${upperStart + next}`);
    lines.push(`f ${midStart + i} ${lowerStart + i} ${lowerStart + next} ${midStart + next}`);
    lines.push(`f ${bottomIndex} ${lowerStart + next} ${lowerStart + i}`);
  }

  lines.push("v -0.34 0.42 0");
  lines.push("v -1.36 0.16 0.14");
  lines.push("v -1.52 -0.36 0");
  lines.push("v -0.42 -0.18 -0.08");
  lines.push("v 0.34 0.42 0");
  lines.push("v 1.36 0.16 0.14");
  lines.push("v 1.52 -0.36 0");
  lines.push("v 0.42 -0.18 -0.08");
  lines.push("f 39 40 41 42");
  lines.push("f 43 46 45 44");
  lines.push("f 39 42 46 43");

  return lines.join("\n");
}

function transformPoint(matrix, x, y, z) {
  return Array.from(matrix.multiplyVector3(new Vector3([x, y, z])).elements);
}

function trianglePanelMatrix(pointA, pointB, pointC) {
  const matrix = new Matrix4();
  const e = matrix.elements;

  e[0] = pointB[0] - pointA[0];
  e[1] = pointB[1] - pointA[1];
  e[2] = pointB[2] - pointA[2];
  e[3] = 0;

  e[4] = pointC[0] - pointA[0];
  e[5] = pointC[1] - pointA[1];
  e[6] = pointC[2] - pointA[2];
  e[7] = 0;

  e[8] = 0;
  e[9] = 0;
  e[10] = 1;
  e[11] = 0;

  e[12] = pointA[0];
  e[13] = pointA[1];
  e[14] = pointA[2];
  e[15] = 1;

  return matrix;
}

function updateHud(delta) {
  gFrameSamples.push(delta);
  if (gFrameSamples.length > 24) {
    gFrameSamples.shift();
  }

  const average = gFrameSamples.reduce((sum, value) => sum + value, 0) / gFrameSamples.length;
  const fps = average > 0 ? 1 / average : 0;
  document.getElementById("fpsValue").textContent = fps.toFixed(1);
  document.getElementById("pointPosValue").textContent = gPointLightPosition.map((value) => value.toFixed(1)).join(", ");
  document.getElementById("cameraValue").textContent = `${gSettings.cameraYaw.toFixed(0)}, ${gSettings.cameraPitch.toFixed(0)}`;
}

function resizeCanvasToDisplaySize() {
  if (!canvas) return;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function normalFromPoints(a, b, c) {
  const edge1 = subtractArray(b, a);
  const edge2 = subtractArray(c, a);
  return normalizeArray(crossArray(edge1, edge2));
}

function subtractArray(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function crossArray(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalizeArray(value) {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < 0.00001) {
    return [0, 1, 0];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapDegrees(value) {
  let wrapped = value;
  while (wrapped > 180) wrapped -= 360;
  while (wrapped < -180) wrapped += 360;
  return wrapped;
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
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
