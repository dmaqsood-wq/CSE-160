Assignment 3 - Textured Voxel World

Open through a local server so the PNG textures can load:

1. From the repo root, run:

   powershell -ExecutionPolicy Bypass -File asgn3/serve.ps1

2. Visit:

   http://127.0.0.1:8765/asgn3/src/asg3.html

Controls:

- W/A/S/D: move quickly through the world
- Q/E: turn left/right quickly
- Drag mouse: look around
- F: place a block in front of you
- R or left-click: remove a block in front of you
- 1/2/3: select stone, brick, or crystal blocks
- Shift: move faster
- B: toggle antigravity boots
- Space/C: rise/descend while antigravity boots are on
- Turning antigravity boots off in mid-air, or stepping off a block roof, starts a freefall; block stacks still collide and you land on terrain or block tops

Features included:

- 32x32 hardcoded voxel world with wall heights from 0 to 4
- Perspective first-person camera
- Textured rolling terrain, paths, stone, brick, and crystal blocks
- Large turquoise-blue sky cube with clean flashing pink-purple horizontal strips
- Dark futuristic cyberpunk styling with quiet dark maze walls, flashing turquoise/pink block lights, horizontal neon strips on the outside borders, an open neon plaza, shard locator beams, portal accents, drones, collectibles, bats, and an evolving netrunner story about quarantining rogue shard-core implants
- Optional antigravity boots for flying over the full 32x32 map
- Flight collision with voxel stacks, freefall after disabling antigravity boots or walking off roofs, and landing on top of blocks
- Paired rift gates: one in the neon plaza and one at the far northern edge, each teleporting to the other side
- Batched static world geometry for better performance
