Assignment 4 - Phong Lighting

Open `src/asg4.html` from the course index page, or use a local server so the OBJ file can load correctly.

Start a local server from the repo root:
```powershell
powershell -ExecutionPolicy Bypass -File asgn3/serve.ps1 -Root . -Port 8770
```

Local test URL used during development:
`http://127.0.0.1:8770/asgn4/src/asg4.html`

Controls:
- Drag the canvas to orbit the camera.
- W/S changes camera distance.
- A/D orbits left and right.
- Q/E tilts the camera.
- Shift-click triggers the bat pose animation.
- Sliders control point-light position, point-light orbit, light color, spotlight cone size, and camera values.

Implemented features:
- Cube specimen, two spheres, floor/walls, and the Assignment 2 bat model.
- Per-fragment Phong shader with ambient, diffuse, and specular lighting.
- Normal buffers for cube, sphere, cone, triangle panels, and the OBJ model.
- Point light with animated orbit, sliders, color sliders, and a cube marker.
- Independent wall-mounted spotlight with on/off toggle and cone-angle slider.
- Lighting on/off toggle and normal visualization toggle.
- OBJ loader for `src/models/faceted_crystal.obj`, with computed normals.
- Bat and light animation toggles.

Rubric coverage:
- Created a sphere: two generated spheres are in the scene.
- Lighting works: fragment shader combines ambient, diffuse, and specular terms.
- Light color slider: RGB sliders update the point light color and marker color.
- Light marker: the small glowing cube shows the moving point light location.
- Lighting button: `Lighting On/Off` toggles Phong lighting.
- Moving point light: the point light orbits over time; sliders adjust base position and orbit radius.
- Spotlight: wall-mounted spotlight has its own toggle and cone slider.
- Normal visualization: `Normals On/Off` colors surfaces using transformed normals.
- OBJ loaded: `src/models/faceted_crystal.obj` loads as a faceted 78-triangle model and uses the same controllable lighting.
- Animal/world integration: the Assignment 2 bat is integrated into the lit scene with floor and wall geometry.
