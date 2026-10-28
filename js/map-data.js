// STRIKEZONE map layout data. Keep collision and render geometry in sync.
// Coordinates use X/Z on the ground plane; dimensions are world units.
window.STRIKEZONE_MAP = {
  id: "training-yard",
  name: "Training Yard",
  version: 1,
  bounds: { min: -27.1, max: 27.1 },
  obstacles: [
 {x:-10,z:-7,sx:4,sz:2,sy:2.3,c:[.24,.33,.39]},{x:-4,z:-12,sx:2.2,sz:2.2,sy:1.4,c:[.33,.38,.4]},
 {x:8,z:-8,sx:5,sz:2,sy:2.1,c:[.24,.34,.39]},{x:14,z:-2,sx:2,sz:4,sy:1.7,c:[.3,.35,.39]},
 {x:-13,z:6,sx:2.5,sz:4,sy:1.9,c:[.29,.34,.37]},{x:-5,z:10,sx:5,sz:2,sy:2.2,c:[.23,.32,.37]},
 {x:5,z:8,sx:3,sz:3,sy:1.6,c:[.31,.36,.39]},{x:13,z:12,sx:4,sz:2,sy:2.2,c:[.24,.32,.37]},
 {x:1,z:-1,sx:2,sz:2,sy:1.1,c:[.36,.4,.4]},{x:20,z:7,sx:2,sz:5,sy:1.8,c:[.29,.34,.37]},
 {x:-20,z:-8,sx:2,sz:5,sy:1.6,c:[.29,.34,.37]}
],
  // [centerX, centerZ, width, depth, height]
  buildings: [
 [-22,-20,7,7,5.8],[-10,-22,7,6,4.6],[10,-22,8,6,6.4],[22,-18,6,8,5.1],
 [-23,1,6,8,4.7],[23,-1,7,7,6.0],[-21,20,8,6,5.4],[20,21,8,6,4.8],
 [-11,20,5,5,3.8],[11,21,6,5,4.2]
]
};
