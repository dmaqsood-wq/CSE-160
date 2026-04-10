class Circle {
  constructor() {
    this.position = [0.0, 0.0];
    this.color = [1.0, 1.0, 1.0, 1.0];
    this.size = 10.0;
    this.segments = 16;
  }

  render() {
    const x = this.position[0];
    const y = this.position[1];
    const radius = this.size / 200.0;
    const angleStep = 360 / this.segments;

    gl.uniform4f(u_FragColor, this.color[0], this.color[1], this.color[2], this.color[3]);
    gl.uniform1f(u_Size, this.size);

    for (let angle = 0; angle < 360; angle += angleStep) {
      const rad1 = angle * Math.PI / 180;
      const rad2 = (angle + angleStep) * Math.PI / 180;

      const x1 = x + Math.cos(rad1) * radius;
      const y1 = y + Math.sin(rad1) * radius;
      const x2 = x + Math.cos(rad2) * radius;
      const y2 = y + Math.sin(rad2) * radius;

      drawTriangle([
        x, y,
        x1, y1,
        x2, y2
      ]);
    }
  }
}