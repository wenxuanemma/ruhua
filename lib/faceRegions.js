// lib/faceRegions.js
// Single source of truth for face region coordinates.
// Updated by calibrate tool at 2026-05-05T15:03:11.310Z

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
    official    : { x:0.3400, y:0.3300, w:0.0900, h:0.1600, angle:0 },
    envoy       : { x:0.8200, y:0.2700, w:0.0900, h:0.1800, angle:0 },
  },
  guoguo: {
    lady        : { x:0.2400, y:0.3300, w:0.0900, h:0.1800, angle:0 },
    attendant   : { x:0.3900, y:0.1700, w:0.0900, h:0.1800, angle:0 },
    rider       : { x:0.7850, y:0.2100, w:0.0900, h:0.1800, angle:0 },
  },
  luoshen: {
    cao         : { x:0.5650, y:0.1100, w:0.1100, h:0.2200, angle:0 },
    attendant   : { x:0.2200, y:0.2850, w:0.0800, h:0.1600, angle:0 },
  },
  gongle: {
    listener    : { x:0.2100, y:0.1700, w:0.1100, h:0.2000, angle:0 },
    musician    : { x:0.5750, y:0.4500, w:0.1200, h:0.2000, angle:0 },
    serving     : { x:0.0150, y:0.3550, w:0.1000, h:0.1800, angle:0 },
  },
};
