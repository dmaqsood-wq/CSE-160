const VSHADER_SOURCE = `
  attribute vec4 a_Position;
  uniform float u_Size;
  void main() {
    gl_Position = a_Position;
    gl_PointSize = u_Size;
  }
`;

const FSHADER_SOURCE = `
  precision mediump float;
  uniform vec4 u_FragColor;
  void main() {
    gl_FragColor = u_FragColor;
  }
`;

const POINT = 0;
const SQUARE = 1;
const TRIANGLE = 2;
const CIRCLE = 3;

let canvas, gl;
let a_Position, u_FragColor, u_Size;

let shapes = [];

let selectedShape = SQUARE;
let selectedColor = [0.20, 0.80, 0.20, 1.0];
let selectedSize = 12.0;
let selectedSegments = 16;

let lastX = null;
let lastY = null;

function main() {
  setupWebGL();
  connectVariablesToGLSL();
  setupUI();

  canvas.onmousedown = (ev) => handleClicks(ev);
  canvas.onmousemove = (ev) => { if (ev.buttons === 1) handleClicks(ev); };
  canvas.onmouseup = resetDrag;
  canvas.onmouseleave = resetDrag;

  gl.clearColor(1, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  updateColorPreview();
}

function setupWebGL() {
  canvas = document.getElementById('webgl');
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
}

function connectVariablesToGLSL() {
  const program = createProgram(gl, VSHADER_SOURCE, FSHADER_SOURCE);
  gl.useProgram(program);
  gl.program = program;

  a_Position = gl.getAttribLocation(program, 'a_Position');
  u_FragColor = gl.getUniformLocation(program, 'u_FragColor');
  u_Size = gl.getUniformLocation(program, 'u_Size');
}

function setupUI() {
  document.getElementById('pointButton').onclick = () => selectedShape = POINT;
  document.getElementById('squareButton').onclick = () => selectedShape = SQUARE;
  document.getElementById('triangleButton').onclick = () => selectedShape = TRIANGLE;
  document.getElementById('circleButton').onclick = () => selectedShape = CIRCLE;

  document.getElementById('clearButton').onclick = () => {
    shapes = [];
    renderAllShapes();
  };

  document.getElementById('pictureButton').onclick = () => drawPicture();

  document.getElementById('redSlide').oninput = function() {
    selectedColor[0] = this.value / 100;
    updateColorPreview();
  };
  document.getElementById('greenSlide').oninput = function() {
    selectedColor[1] = this.value / 100;
    updateColorPreview();
  };
  document.getElementById('blueSlide').oninput = function() {
    selectedColor[2] = this.value / 100;
    updateColorPreview();
  };

  document.getElementById('sizeSlide').oninput = function() {
    selectedSize = Number(this.value);
    document.getElementById('sizeValue').textContent = this.value;
  };

  document.getElementById('segmentSlide').oninput = function() {
    selectedSegments = Number(this.value);
    document.getElementById('segmentValue').textContent = this.value;
  };
}

function updateColorPreview() {
  const r = Math.round(selectedColor[0] * 255);
  const g = Math.round(selectedColor[1] * 255);
  const b = Math.round(selectedColor[2] * 255);
  document.getElementById('colorPreview').style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

function resetDrag() {
  lastX = null;
  lastY = null;
}

function handleClicks(ev) {
  const [x, y] = mouseToGL(ev);

  if (lastX !== null && lastY !== null && ev.buttons === 1) {
    fillStroke(lastX, lastY, x, y);
  } else {
    addBrushShape(x, y);
  }

  lastX = x;
  lastY = y;
  renderAllShapes();
}

function mouseToGL(ev) {
  const rect = ev.target.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) - canvas.width / 2) / (canvas.width / 2);
  const y = (canvas.height / 2 - (ev.clientY - rect.top)) / (canvas.height / 2);
  return [x, y];
}

function fillStroke(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const spacing = getSpacing();
  const steps = Math.max(1, Math.ceil(dist / spacing));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    addBrushShape(x1 + dx * t, y1 + dy * t);
  }

  shapes.push(new BrushLine([x1, y1, x2, y2], selectedColor));
}

function getSpacing() {
  if (selectedShape === POINT) return Math.max(0.006, selectedSize / 800);
  if (selectedShape === SQUARE) return Math.max(0.008, selectedSize / 700);
  if (selectedShape === TRIANGLE) return Math.max(0.012, selectedSize / 520);
  return Math.max(0.010, selectedSize / 620);
}

function addBrushShape(x, y) {
  let shape;

  if (selectedShape === POINT) {
    shape = new Point();
  } else if (selectedShape === SQUARE) {
    shape = new Square();
  } else if (selectedShape === TRIANGLE) {
    shape = new Triangle();
  } else {
    shape = new Circle();
    shape.segments = selectedSegments;
  }

  shape.position = [x, y];
  shape.color = [...selectedColor];
  shape.size = selectedSize;
  shapes.push(shape);
}

function renderAllShapes() {
  gl.clear(gl.COLOR_BUFFER_BIT);
  for (const shape of shapes) {
    shape.render();
  }
}

// ----------------------
// simple drawing helpers
// ----------------------

function addTriangle(x1, y1, x2, y2, x3, y3, color) {
  shapes.push(new FreeTriangle([x1, y1, x2, y2, x3, y3], color));
}

function addLine(x1, y1, x2, y2, color) {
  shapes.push(new BrushLine([x1, y1, x2, y2], color));
}

function addRect(left, right, bottom, top, color) {
  addTriangle(left, bottom, right, bottom, right, top, color);
  addTriangle(left, bottom, right, top, left, top, color);
}

// New helper that guarantees connected borders for faceted shapes
function fillTri(x1, y1, x2, y2, x3, y3, fill, outline) {
  addTriangle(x1, y1, x2, y2, x3, y3, fill);
  addLine(x1, y1, x2, y2, outline);
  addLine(x2, y2, x3, y3, outline);
  addLine(x3, y3, x1, y1, outline);
}

// ----------------------
// tree picture
// ----------------------

function drawPicture() {
  shapes = [];

  const outline = [0.0, 0.0, 0.0, 1.0];
  const greenLight = [0.40, 0.80, 0.20, 1.0];
  const greenMid = [0.25, 0.70, 0.15, 1.0];
  
  const blueLight = [0.40, 0.80, 1.00, 1.0];
  const blueDark = [0.20, 0.60, 0.90, 1.0];
  const black = [0.00, 0.00, 0.00, 1.0];

  const trunkLight = [0.50, 0.30, 0.10, 1.0];
  const trunkMid = [0.40, 0.20, 0.05, 1.0];
  const trunkDark = [0.30, 0.15, 0.00, 1.0];

  // 1. Trunk
  fillTri(0, -0.6, -0.3, -0.9, -0.15, -0.9, trunkDark, outline);
  fillTri(0, -0.6, -0.15, -0.9, 0, -0.9, trunkMid, outline);
  fillTri(0, -0.6, 0, -0.9, 0.15, -0.9, trunkLight, outline);
  fillTri(0, -0.6, 0.15, -0.9, 0.3, -0.9, trunkDark, outline);

  // 2. Tier 4 (Bottom Green Layer - sits behind DM box)
  fillTri(0, -0.1, -0.9, -0.6, -0.45, -0.35, greenLight, outline);
  fillTri(-0.45, -0.35, -0.9, -0.6, 0, -0.6, greenMid, outline);
  fillTri(0, -0.1, -0.45, -0.35, 0, -0.6, greenLight, outline);
  fillTri(0, -0.1, 0.9, -0.6, 0.45, -0.35, greenMid, outline);
  fillTri(0.45, -0.35, 0.9, -0.6, 0, -0.6, greenLight, outline);
  fillTri(0, -0.1, 0.45, -0.35, 0, -0.6, greenMid, outline);

  // 3. DM Box Background (Blue triangles to match sketched fractures)
  // Left Box (D)
  fillTri(-0.45, -0.2, 0.0, -0.2, -0.225, -0.35, blueLight, outline);
  fillTri(0.0, -0.2, 0.0, -0.5, -0.225, -0.35, blueDark, outline);
  fillTri(0.0, -0.5, -0.45, -0.5, -0.225, -0.35, blueLight, outline);
  fillTri(-0.45, -0.5, -0.45, -0.2, -0.225, -0.35, blueDark, outline);
  // Right Box (M)
  fillTri(0.0, -0.2, 0.45, -0.2, 0.225, -0.35, blueDark, outline);
  fillTri(0.45, -0.2, 0.45, -0.5, 0.225, -0.35, blueLight, outline);
  fillTri(0.45, -0.5, 0.0, -0.5, 0.225, -0.35, blueDark, outline);
  fillTri(0.0, -0.5, 0.0, -0.2, 0.225, -0.35, blueLight, outline);

  // Outer Box Borders
  addLine(-0.45, -0.2, 0.45, -0.2, outline);
  addLine(0.45, -0.2, 0.45, -0.5, outline);
  addLine(0.45, -0.5, -0.45, -0.5, outline);
  addLine(-0.45, -0.5, -0.45, -0.2, outline);
  addLine(0.0, -0.2, 0.0, -0.5, outline);

  // 4. DM Text (Thick faceted polygons)
  // D Letter
  addRect(-0.4, -0.35, -0.45, -0.25, black); // spine
  addTriangle(-0.35, -0.25, -0.1, -0.35, -0.35, -0.32, black); // top curve
  addTriangle(-0.35, -0.45, -0.1, -0.35, -0.35, -0.38, black); // bottom curve
  // M Letter
  addRect(0.05, 0.1, -0.45, -0.25, black); // left leg
  addRect(0.35, 0.4, -0.45, -0.25, black); // right leg
  addTriangle(0.1, -0.25, 0.225, -0.4, 0.15, -0.25, black); // V left
  addTriangle(0.35, -0.25, 0.225, -0.4, 0.3, -0.25, black); // V right

  // 5. Tier 3 (Middle Bottom Layer)
  fillTri(0, 0.25, -0.8, -0.2, -0.4, 0.05, greenMid, outline);
  fillTri(-0.4, 0.05, -0.8, -0.2, 0, -0.2, greenLight, outline);
  fillTri(0, 0.25, -0.4, 0.05, 0, -0.2, greenMid, outline);
  fillTri(0, 0.25, 0.8, -0.2, 0.4, 0.05, greenLight, outline);
  fillTri(0.4, 0.05, 0.8, -0.2, 0, -0.2, greenMid, outline);
  fillTri(0, 0.25, 0.4, 0.05, 0, -0.2, greenLight, outline);

  // 6. Tier 2 (Middle Top Layer)
  fillTri(0, 0.55, -0.6, 0.15, -0.3, 0.35, greenLight, outline);
  fillTri(-0.3, 0.35, -0.6, 0.15, 0, 0.15, greenMid, outline);
  fillTri(0, 0.55, -0.3, 0.35, 0, 0.15, greenLight, outline);
  fillTri(0, 0.55, 0.6, 0.15, 0.3, 0.35, greenMid, outline);
  fillTri(0.3, 0.35, 0.6, 0.15, 0, 0.15, greenLight, outline);
  fillTri(0, 0.55, 0.3, 0.35, 0, 0.15, greenMid, outline);

  // 7. Tier 1 (Top Tip Layer)
  fillTri(0, 0.85, -0.35, 0.45, -0.15, 0.65, greenMid, outline);
  fillTri(-0.15, 0.65, -0.35, 0.45, 0, 0.45, greenLight, outline);
  fillTri(0, 0.85, -0.15, 0.65, 0, 0.45, greenMid, outline);
  fillTri(0, 0.85, 0.35, 0.45, 0.15, 0.65, greenLight, outline);
  fillTri(0.15, 0.65, 0.35, 0.45, 0, 0.45, greenMid, outline);
  fillTri(0, 0.85, 0.15, 0.65, 0, 0.45, greenLight, outline);

  renderAllShapes();
}

// ============================================================
// shader utilities
// ============================================================

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl, vshaderSource, fshaderSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vshaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fshaderSource);

  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}