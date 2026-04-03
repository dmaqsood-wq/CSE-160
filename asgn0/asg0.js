let canvas;
let ctx;

function main() {
  canvas = document.getElementById("example");
  if (!canvas) {
    console.log("Failed to retrieve the <canvas> element");
    return;
  }

  ctx = canvas.getContext("2d");
  if (!ctx) {
    console.log("Failed to get 2D context");
    return;
  }

  clearCanvas();

  // Initial default draw
  const v1 = new Vector3([2.25, 2.25, 0]);
  drawVector(v1, "red");
}

function clearCanvas() {
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawVector(v, color) {
  const scale = 20;
  const originX = canvas.width / 2;
  const originY = canvas.height / 2;

  const x = originX + v.elements[0] * scale;
  const y = originY - v.elements[1] * scale; // invert y-axis for canvas

  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function getInputVector(xId, yId) {
  const x = parseFloat(document.getElementById(xId).value) || 0;
  const y = parseFloat(document.getElementById(yId).value) || 0;
  return new Vector3([x, y, 0]);
}

function handleDrawEvent() {
  clearCanvas();

  const v1 = getInputVector("v1x", "v1y");
  const v2 = getInputVector("v2x", "v2y");

  drawVector(v1, "red");
  drawVector(v2, "blue");
}

function handleDrawOperationEvent() {
  clearCanvas();

  const v1 = getInputVector("v1x", "v1y");
  const v2 = getInputVector("v2x", "v2y");
  const op = document.getElementById("operation").value;
  const scalar = parseFloat(document.getElementById("scalar").value);

  drawVector(v1, "red");
  drawVector(v2, "blue");

  if (op === "add") {
    const v3 = new Vector3([v1.elements[0], v1.elements[1], v1.elements[2]]);
    v3.add(v2);
    drawVector(v3, "green");
  } else if (op === "sub") {
    const v3 = new Vector3([v1.elements[0], v1.elements[1], v1.elements[2]]);
    v3.sub(v2);
    drawVector(v3, "green");
  } else if (op === "mul") {
    const v3 = new Vector3([v1.elements[0], v1.elements[1], v1.elements[2]]);
    const v4 = new Vector3([v2.elements[0], v2.elements[1], v2.elements[2]]);
    v3.mul(scalar);
    v4.mul(scalar);
    drawVector(v3, "green");
    drawVector(v4, "green");
  } else if (op === "div") {
    if (scalar === 0) {
      console.log("Cannot divide by zero.");
      return;
    }
    const v3 = new Vector3([v1.elements[0], v1.elements[1], v1.elements[2]]);
    const v4 = new Vector3([v2.elements[0], v2.elements[1], v2.elements[2]]);
    v3.div(scalar);
    v4.div(scalar);
    drawVector(v3, "green");
    drawVector(v4, "green");
  } else if (op === "magnitude") {
    console.log("Magnitude v1:", v1.magnitude());
    console.log("Magnitude v2:", v2.magnitude());
  } else if (op === "normalize") {
    const v3 = new Vector3([v1.elements[0], v1.elements[1], v1.elements[2]]);
    const v4 = new Vector3([v2.elements[0], v2.elements[1], v2.elements[2]]);
    v3.normalize();
    v4.normalize();
    drawVector(v3, "green");
    drawVector(v4, "green");
  } else if (op === "angle") {
    console.log("Angle between:", angleBetween(v1, v2), "degrees");
  } else if (op === "area") {
    console.log("Area of triangle:", areaTriangle(v1, v2));
  }
}

function angleBetween(v1, v2) {
  const mag1 = v1.magnitude();
  const mag2 = v2.magnitude();

  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }

  let cosAlpha = Vector3.dot(v1, v2) / (mag1 * mag2);

  // clamp to avoid floating point issues
  cosAlpha = Math.max(-1, Math.min(1, cosAlpha));

  const angleRadians = Math.acos(cosAlpha);
  return angleRadians * 180 / Math.PI;
}

function areaTriangle(v1, v2) {
  const cross = Vector3.cross(v1, v2);
  return cross.magnitude() / 2;
}