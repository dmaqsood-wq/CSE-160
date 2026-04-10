class Triangle {
  constructor() {
    this.position = [0.0, 0.0];
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.size = 10.0;
  }

  render() {
    const x = this.position[0];
    const y = this.position[1];
    const d = this.size / 200.0;

    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.uniform1f(u_Size, this.size);

    drawTriangle([
      x,     y + d,
      x - d, y - d,
      x + d, y - d
    ]);
  }
}

class FreeTriangle {
  constructor(vertices, color) {
    this.vertices = vertices;
    this.color = color;
  }

  render() {
    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.uniform1f(u_Size, 1.0);
    drawTriangle(this.vertices);
  }
}

class BrushLine {
  constructor(vertices, color) {
    this.vertices = vertices;
    this.color = color;
  }

  render() {
    const vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.DYNAMIC_DRAW);
    gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_Position);
    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.drawArrays(gl.LINES, 0, 2);
  }
}

function drawTriangle(vertices) {
  const vertexBuffer = gl.createBuffer();
  if (!vertexBuffer) {
    console.log('Failed to create buffer.');
    return;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(a_Position, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(a_Position);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}