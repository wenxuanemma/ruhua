// lib/faceRegions.js
// Single source of truth for face region coordinates.
// Updated by calibrate tool at 2026-05-05T15:35:46.233Z

export const FACE_REGIONS = {
  qingming: {
    scholar     : { x:0.0000, y:0.3900, w:0.1300, h:0.2000, angle:0 },
    merchant    : { x:0.0000, y:0.3500, w:0.0800, h:0.1800, angle:0 },
    boatman     : { x:0.0000, y:0.8400, w:0.0700, h:0.1800, angle:0 },
  },
  hanxizai: {
    guest       : { x:0.7647, y:0.0200, w:0.0989, h:0.1420, angle:0 },
    host        : { x:0.3646, y:0.2820, w:0.0936, h:0.1620, angle:0 },
    dancer      : { x:0.0798, y:0.3500, w:0.0807, h:0.1260, angle:0 },
  },
  bunianta: {
    official    : { x:0.7248, y:0.3620, w:0.0479, h:0.1420, angle:0 },
    envoy       : { x:0.3521, y:0.3540, w:0.0489, h:0.1260, angle:0 },
  },
  guoguo: {
    lady        : { x:0.3820, y:0.1805, w:0.0660, h:0.1401, angle:0 },
    attendant   : { x:0.6321, y:0.3494, w:0.0900, h:0.1800, angle:0 },
    rider       : { x:0.8081, y:0.2565, w:0.0276, h:0.1136, angle:0 },
  },
  luoshen: {
    cao         : { x:0.5650, y:0.1100, w:0.1100, h:0.2200, angle:0 },
    attendant   : { x:0.2200, y:0.2850, w:0.0800, h:0.1600, angle:0 },
  },
  gongle: {
    listener    : { x:0.2226, y:0.3640, w:0.0903, h:0.1220, angle:0 },
    musician    : { x:0.6663, y:0.0360, w:0.0863, h:0.1140, angle:0 },
    serving     : { x:0.7680, y:0.3830, w:0.0789, h:0.1220, angle:0 },
  },
};
