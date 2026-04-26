const VSHADER_SOURCE = `
  attribute vec4 a_Position;
  uniform mat4 u_ModelMatrix;
  uniform mat4 u_GlobalRotation;
  uniform mat4 u_ViewProjectionMatrix;

  void main() {
    gl_Position = u_ViewProjectionMatrix * u_GlobalRotation * u_ModelMatrix * a_Position;
  }
`;

const FSHADER_SOURCE = `
  precision mediump float;
  uniform vec4 u_FragColor;

  void main() {
    gl_FragColor = u_FragColor;
  }
`;

let canvas;
let gl;
let a_Position;
let u_ModelMatrix;
let u_GlobalRotation;
let u_ViewProjectionMatrix;
let u_FragColor;

const gPrimitives = {
  cube: null,
  cone: null,
  circle: null,
  star: null,
  triangle: null,
};

const gDefaultPose = {
  globalY: 18,
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

let gAnimate = true;
let gSeconds = 0;
let gStartTime = 0;
let gMouseYaw = 0;
let gMousePitch = -12;
let gDragState = {
  active: false,
  lastX: 0,
  lastY: 0,
};
let gPokeUntil = 0;
let gFrameCounter = 0;
let gLastFrameTime = 0;
let gPerfAccumulator = 0;
let gPerfSamples = 0;

const gControlSpecs = [
  { id: "globalY", label: "Global Y", min: -180, max: 180, step: 1, group: "viewControls" },
  { id: "headYaw", label: "Head Yaw", min: -40, max: 40, step: 1, group: "headControls" },
  { id: "jawOpen", label: "Jaw", min: -5, max: 40, step: 1, group: "headControls" },
  { id: "leftShoulder", label: "Shoulder", min: -10, max: 90, step: 1, group: "leftWingControls" },
  { id: "leftElbow", label: "Elbow", min: -70, max: 45, step: 1, group: "leftWingControls" },
  { id: "leftWrist", label: "Wrist", min: -50, max: 45, step: 1, group: "leftWingControls" },
  { id: "rightShoulder", label: "Shoulder", min: -90, max: 10, step: 1, group: "rightWingControls" },
  { id: "rightElbow", label: "Elbow", min: -45, max: 70, step: 1, group: "rightWingControls" },
  { id: "rightWrist", label: "Wrist", min: -45, max: 50, step: 1, group: "rightWingControls" },
  { id: "leftHip", label: "Left Hip", min: -35, max: 35, step: 1, group: "legControls" },
  { id: "leftKnee", label: "Left Knee", min: -10, max: 70, step: 1, group: "legControls" },
  { id: "leftAnkle", label: "Left Foot", min: -30, max: 30, step: 1, group: "legControls" },
  { id: "rightHip", label: "Right Hip", min: -35, max: 35, step: 1, group: "legControls" },
  { id: "rightKnee", label: "Right Knee", min: -10, max: 70, step: 1, group: "legControls" },
  { id: "rightAnkle", label: "Right Foot", min: -30, max: 30, step: 1, group: "legControls" },
];

function main() {
  setupWebGL();
  connectVariablesToGLSL();
  initPrimitiveBuffers();
  setupControls();
  setupMouseControls();

  gl.clearColor(0.03, 0.05, 0.09, 1.0);
  gl.enable(gl.DEPTH_TEST);

  gStartTime = performance.now();
  gLastFrameTime = gStartTime;
  renderScene();
  requestAnimationFrame(tick);
}

function setupWebGL() {
  canvas = document.getElementById("webgl");
  gl = canvas.getContext("webgl");
  if (!gl) {
    throw new Error("WebGL not available.");
  }
}

function connectVariablesToGLSL() {
  const program = createProgram(gl, VSHADER_SOURCE, FSHADER_SOURCE);
  gl.useProgram(program);
  gl.program = program;

  a_Position = gl.getAttribLocation(program, "a_Position");
  u_ModelMatrix = gl.getUniformLocation(program, "u_ModelMatrix");
  u_GlobalRotation = gl.getUniformLocation(program, "u_GlobalRotation");
  u_ViewProjectionMatrix = gl.getUniformLocation(program, "u_ViewProjectionMatrix");
  u_FragColor = gl.getUniformLocation(program, "u_FragColor");
}

function initPrimitiveBuffers() {
  gPrimitives.cube = createPrimitive(cubeVertices());
  gPrimitives.cone = createPrimitive(coneVertices(18));
  gPrimitives.circle = createPrimitive(circleVertices(40));
  gPrimitives.star = createPrimitive(starVertices(5));
  gPrimitives.triangle = createPrimitive(triangleVertices());
}

function createPrimitive(vertices) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  return {
    buffer,
    count: vertices.length / 3,
  };
}

function setupControls() {
  for (const spec of gControlSpecs) {
    addSliderControl(spec);
  }

  document.getElementById("animateOnButton").onclick = () => {
    gAnimate = true;
    renderScene();
  };
  document.getElementById("animateOffButton").onclick = () => {
    gAnimate = false;
    renderScene();
  };
  document.getElementById("resetPoseButton").onclick = () => {
    Object.assign(gPose, gDefaultPose);
    syncControlValues();
    renderScene();
  };

  syncControlValues();
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
  slider.value = String(gPose[spec.id]);

  const value = document.createElement("div");
  value.className = "value";
  value.id = `${spec.id}Value`;
  value.textContent = `${gPose[spec.id]}`;

  slider.addEventListener("input", () => {
    gPose[spec.id] = Number(slider.value);
    value.textContent = slider.value;
    renderScene();
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
    if (slider) slider.value = String(gPose[spec.id]);
    if (value) value.textContent = `${gPose[spec.id].toFixed(0)}`;
  }
}

function setupMouseControls() {
  canvas.addEventListener("mousedown", (ev) => {
    if (ev.shiftKey) {
      gPokeUntil = gSeconds + 1.2;
      renderScene();
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

    gMouseYaw += dx * 0.45;
    gMousePitch += dy * 0.35;
    gMousePitch = clamp(gMousePitch, -75, 75);

    document.getElementById("mouseValue").textContent = `${gMouseYaw.toFixed(0)}, ${gMousePitch.toFixed(0)}`;
    renderScene();
  });
}

function tick(now) {
  gSeconds = (now - gStartTime) / 1000;
  const deltaMs = now - gLastFrameTime;
  gLastFrameTime = now;

  updateAnimationAngles();
  renderScene();
  updatePerformance(deltaMs);
  requestAnimationFrame(tick);
}

function updateAnimationAngles() {
  if (!gAnimate && gSeconds > gPokeUntil) {
    document.getElementById("modeValue").textContent = "Idle";
    return;
  }

  const flap = Math.sin(gSeconds * 6.2);
  const secondary = Math.sin(gSeconds * 3.1 + 0.8);
  const bodyBob = Math.sin(gSeconds * 2.4);
  const pokeWave = Math.max(0, gPokeUntil - gSeconds);
  const pokeAmt = pokeWave > 0 ? Math.sin((1.2 - pokeWave) * Math.PI * 3.2) * (pokeWave / 1.2) : 0;

  if (gAnimate) {
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
    gPose.globalY = 18 + Math.sin(gSeconds * 0.8) * 14;
  }

  if (pokeAmt !== 0) {
    gPose.jawOpen = 28 + pokeAmt * 22;
    gPose.headYaw = pokeAmt * 16;
    gPose.leftShoulder = 74 + pokeAmt * 8;
    gPose.rightShoulder = -74 - pokeAmt * 8;
    gPose.leftWrist = 28 + pokeAmt * 10;
    gPose.rightWrist = -28 - pokeAmt * 10;
  }

  syncControlValues();
  document.getElementById("modeValue").textContent = gPokeUntil > gSeconds ? "Poke" : (gAnimate ? "Flapping" : "Idle");
}

function updatePerformance(deltaMs) {
  gPerfAccumulator += deltaMs;
  gPerfSamples += 1;
  gFrameCounter += 1;

  if (gPerfSamples < 8) return;

  const averageMs = gPerfAccumulator / gPerfSamples;
  const fps = 1000 / averageMs;
  document.getElementById("fpsValue").textContent = fps.toFixed(1);
  document.getElementById("msValue").textContent = `${averageMs.toFixed(1)} ms`;
  gPerfAccumulator = 0;
  gPerfSamples = 0;
}

function renderScene() {
  if (!gl) return;

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const viewProjectionMatrix = new Matrix4();
  viewProjectionMatrix.setPerspective(58, canvas.width / canvas.height, 0.1, 100);
  viewProjectionMatrix.lookAt(0, 1.25, 8.2, 0, 0.15, 0, 0, 1, 0);
  gl.uniformMatrix4fv(u_ViewProjectionMatrix, false, viewProjectionMatrix.elements);

  const globalRotationMatrix = new Matrix4();
  globalRotationMatrix.rotate(gMousePitch, 1, 0, 0);
  globalRotationMatrix.rotate(gPose.globalY + gMouseYaw, 0, 1, 0);
  gl.uniformMatrix4fv(u_GlobalRotation, false, globalRotationMatrix.elements);

  drawBackdrop();
  drawBat();
}

function drawBackdrop() {
  drawCircle(
    new Matrix4().translate(2.35, 2.05, -2.4).scale(0.42, 0.42, 0.42),
    [0.94, 0.86, 0.64, 1]
  );

  drawStar(new Matrix4().translate(-2.7, 1.8, -2.2).scale(0.13, 0.13, 0.13), [0.92, 0.96, 1.0, 1]);
  drawStar(new Matrix4().translate(-1.8, 2.4, -1.7).scale(0.09, 0.09, 0.09), [0.92, 0.96, 1.0, 1]);
  drawStar(new Matrix4().translate(1.9, 2.7, -2.5).scale(0.11, 0.11, 0.11), [0.92, 0.96, 1.0, 1]);
  drawStar(new Matrix4().translate(0.85, 2.48, -2.7).scale(0.08, 0.08, 0.08), [0.92, 0.96, 1.0, 1]);
}

function drawBat() {
  const bodyBob = gAnimate ? Math.sin(gSeconds * 2.4) * 0.08 : 0;
  const root = new Matrix4();
  root.translate(0, bodyBob, 0);

  const fur = [0.17, 0.18, 0.23, 1];
  const furLight = [0.23, 0.24, 0.30, 1];
  const membrane = [0.39, 0.23, 0.31, 0.98];
  const claw = [0.82, 0.73, 0.64, 1];
  const eye = [0.95, 0.26, 0.22, 1];

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
  drawTrianglePanel(bodyMiddle, elbowMembrane, bodyLower, [0.35, 0.2, 0.28, 1]);
  drawTrianglePanel(bodyLower, elbowMembrane, wristMembrane, membraneColor);
  drawTrianglePanel(bodyLower, wristMembrane, handMembrane, [0.35, 0.2, 0.28, 1]);

  drawCube(
    new Matrix4(shoulderJoint).translate(0.52 * side, -0.02, 0).scale(upperLength, 0.14, 0.18),
    boneColor
  );
  drawCube(
    new Matrix4(elbowJoint).translate(0.46 * side, -0.01, 0).scale(foreLength, 0.11, 0.14),
    boneColor
  );
  drawCube(
    new Matrix4(wristJoint).translate(0.36 * side, 0, 0).scale(handLength, 0.08, 0.1),
    boneColor
  );

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

  drawCube(
    new Matrix4(hipJoint).translate(0, -0.22, 0).scale(0.11, upperLength, 0.11),
    furColor
  );

  const kneeJoint = new Matrix4(hipJoint);
  kneeJoint.translate(0, -upperLength, 0);
  kneeJoint.rotate(knee, 0, 0, 1);

  drawCube(
    new Matrix4(kneeJoint).translate(0, -0.2, 0).scale(0.09, lowerLength, 0.09),
    furColor
  );

  const ankleJoint = new Matrix4(kneeJoint);
  ankleJoint.translate(0, -lowerLength, 0);
  ankleJoint.rotate(ankle, 1, 0, 0);

  drawCube(
    new Matrix4(ankleJoint).translate(0, -0.02, 0.12).scale(0.08, 0.06, 0.26),
    clawColor
  );
  drawCone(
    new Matrix4(ankleJoint).translate(0, -0.02, 0.28).rotate(90, 1, 0, 0).scale(0.03, 0.12, 0.03),
    clawColor
  );
}

function drawCube(matrix, color) {
  drawPrimitive(gPrimitives.cube, matrix, color);
}

function drawCone(matrix, color) {
  drawPrimitive(gPrimitives.cone, matrix, color);
}

function drawCircle(matrix, color) {
  drawPrimitive(gPrimitives.circle, matrix, color);
}

function drawStar(matrix, color) {
  drawPrimitive(gPrimitives.star, matrix, color);
}

function drawTrianglePanel(pointA, pointB, pointC, color) {
  drawPrimitive(gPrimitives.triangle, trianglePanelMatrix(pointA, pointB, pointC), color);
}

function drawPrimitive(primitive, matrix, color) {
  gl.uniformMatrix4fv(u_ModelMatrix, false, matrix.elements);
  gl.uniform4f(u_FragColor, color[0], color[1], color[2], color[3]);
  gl.bindBuffer(gl.ARRAY_BUFFER, primitive.buffer);
  gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(a_Position);
  gl.drawArrays(gl.TRIANGLES, 0, primitive.count);
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

function triangleVertices() {
  return [
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ];
}

function cubeVertices() {
  return [
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,
    -0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,

    -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
    -0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5, -0.5, -0.5,

    -0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,
    -0.5,  0.5, -0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,

    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,
    -0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,

     0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,
     0.5, -0.5, -0.5,   0.5,  0.5,  0.5,   0.5, -0.5,  0.5,

    -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,
    -0.5, -0.5, -0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
  ];
}

function coneVertices(segments) {
  const vertices = [];
  const baseY = -0.5;
  const apexY = 0.5;

  for (let i = 0; i < segments; i += 1) {
    const angle1 = (i / segments) * Math.PI * 2;
    const angle2 = ((i + 1) / segments) * Math.PI * 2;
    const x1 = Math.cos(angle1) * 0.5;
    const z1 = Math.sin(angle1) * 0.5;
    const x2 = Math.cos(angle2) * 0.5;
    const z2 = Math.sin(angle2) * 0.5;

    vertices.push(
      0, apexY, 0,
      x1, baseY, z1,
      x2, baseY, z2
    );

    vertices.push(
      0, baseY, 0,
      x2, baseY, z2,
      x1, baseY, z1
    );
  }

  return vertices;
}

function circleVertices(segments) {
  const vertices = [];

  for (let i = 0; i < segments; i += 1) {
    const angle1 = (i / segments) * Math.PI * 2;
    const angle2 = ((i + 1) / segments) * Math.PI * 2;

    vertices.push(
      0, 0, 0,
      Math.cos(angle1) * 0.5, Math.sin(angle1) * 0.5, 0,
      Math.cos(angle2) * 0.5, Math.sin(angle2) * 0.5, 0
    );
  }

  return vertices;
}

function starVertices(points) {
  const vertices = [];
  const outerRadius = 0.5;
  const innerRadius = 0.22;
  const totalPoints = points * 2;

  for (let i = 0; i < totalPoints; i += 1) {
    const angle1 = -Math.PI / 2 + (i / totalPoints) * Math.PI * 2;
    const angle2 = -Math.PI / 2 + ((i + 1) / totalPoints) * Math.PI * 2;
    const radius1 = i % 2 === 0 ? outerRadius : innerRadius;
    const radius2 = (i + 1) % 2 === 0 ? outerRadius : innerRadius;

    vertices.push(
      0, 0, 0,
      Math.cos(angle1) * radius1, Math.sin(angle1) * radius1, 0,
      Math.cos(angle2) * radius2, Math.sin(angle2) * radius2, 0
    );
  }

  return vertices;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
