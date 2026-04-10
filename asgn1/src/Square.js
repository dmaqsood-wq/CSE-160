class Square {
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
      x - d, y + d,
      x - d, y - d,
      x + d, y + d
    ]);

    drawTriangle([
      x + d, y + d,
      x - d, y - d,
      x + d, y - d
    ]);
  }
}