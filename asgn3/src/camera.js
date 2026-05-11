class Camera {
  constructor(canvas) {
    this.fov = 60;
    this.eye = new Vector3([0, 0, 0]);
    this.at = new Vector3([0, 0, -1]);
    this.up = new Vector3([0, 1, 0]);
    this.viewMatrix = new Matrix4();
    this.projectionMatrix = new Matrix4();
    this.moveSpeed = 0.18;
    this.turnSpeed = 4;
    this.yaw = 0;
    this.pitch = 0;

    this.updateViewMatrix();
    this.updateProjectionMatrix(canvas);
  }

  updateProjectionMatrix(canvas) {
    const aspect = canvas.width / canvas.height;
    this.projectionMatrix.setPerspective(this.fov, aspect, 0.1, 1000);
  }

  setPose(eye, at) {
    this.eye = new Vector3(eye);
    this.at = new Vector3(at);
    this.updateAnglesFromAt();
    this.updateViewMatrix();
  }

  updateViewMatrix() {
    const e = this.eye.elements;
    const a = this.at.elements;
    const u = this.up.elements;
    this.viewMatrix.setLookAt(
      e[0], e[1], e[2],
      a[0], a[1], a[2],
      u[0], u[1], u[2]
    );
  }

  updateAtFromAngles() {
    const yawRad = degreesToRadians(this.yaw);
    const pitchRad = degreesToRadians(this.pitch);
    const cosPitch = Math.cos(pitchRad);
    const direction = new Vector3([
      Math.sin(yawRad) * cosPitch,
      Math.sin(pitchRad),
      -Math.cos(yawRad) * cosPitch,
    ]);

    this.at.set(this.eye);
    this.at.add(direction);
    this.updateViewMatrix();
  }

  updateAnglesFromAt() {
    const f = this.getForwardVector();
    const e = f.elements;
    this.pitch = radiansToDegrees(Math.asin(clampNumber(e[1], -1, 1)));
    this.yaw = radiansToDegrees(Math.atan2(e[0], -e[2]));
  }

  getForwardVector() {
    const f = new Vector3();
    f.set(this.at);
    f.sub(this.eye);
    f.normalize();
    return f;
  }

  getHorizontalForwardVector() {
    const f = this.getForwardVector();
    f.elements[1] = 0;
    if (f.magnitude() < 0.0001) {
      const yawRad = degreesToRadians(this.yaw);
      f.elements[0] = Math.sin(yawRad);
      f.elements[2] = -Math.cos(yawRad);
    }
    f.normalize();
    return f;
  }

  moveForward(speed = this.moveSpeed) {
    const f = this.getHorizontalForwardVector();
    f.mul(speed);
    this.eye.add(f);
    this.at.add(f);
    this.updateViewMatrix();
  }

  moveBackwards(speed = this.moveSpeed) {
    const b = this.getHorizontalForwardVector();
    b.mul(-speed);
    this.eye.add(b);
    this.at.add(b);
    this.updateViewMatrix();
  }

  moveLeft(speed = this.moveSpeed) {
    const f = this.getHorizontalForwardVector();
    const s = Vector3.cross(this.up, f);
    s.normalize();
    s.mul(speed);
    this.eye.add(s);
    this.at.add(s);
    this.updateViewMatrix();
  }

  moveRight(speed = this.moveSpeed) {
    const f = this.getHorizontalForwardVector();
    const s = Vector3.cross(f, this.up);
    s.normalize();
    s.mul(speed);
    this.eye.add(s);
    this.at.add(s);
    this.updateViewMatrix();
  }

  panLeft(alpha = this.turnSpeed) {
    this.panBy(alpha);
  }

  panRight(alpha = this.turnSpeed) {
    this.panBy(-alpha);
  }

  panBy(alpha) {
    const f = new Vector3();
    f.set(this.at);
    f.sub(this.eye);

    const up = this.up.elements;
    const rotationMatrix = new Matrix4();
    rotationMatrix.setRotate(alpha, up[0], up[1], up[2]);
    const fPrime = rotationMatrix.multiplyVector3(f);

    this.at.set(this.eye);
    this.at.add(fPrime);
    this.updateAnglesFromAt();
    this.updateViewMatrix();
  }

  tiltBy(alpha) {
    this.pitch = clampNumber(this.pitch + alpha, -72, 72);
    this.updateAtFromAngles();
  }

  snapToHeight(y) {
    const dy = this.at.elements[1] - this.eye.elements[1];
    this.eye.elements[1] = y;
    this.at.elements[1] = y + dy;
    this.updateViewMatrix();
  }

  clonePose() {
    return {
      eye: new Vector3(this.eye.elements),
      at: new Vector3(this.at.elements),
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  restorePose(pose) {
    this.eye.set(pose.eye);
    this.at.set(pose.at);
    this.yaw = pose.yaw;
    this.pitch = pose.pitch;
    this.updateViewMatrix();
  }
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

function radiansToDegrees(radians) {
  return radians * 180 / Math.PI;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
