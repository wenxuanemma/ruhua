// lib/faceRegions.js
// Single source of truth for face region coordinates.
// Updated by calibrate tool at 2026-05-07T03:08:10.246Z

export const FACE_REGIONS = {
  qingming: {
    scholar     : { x:0.0000, y:0.3900, w:0.1300, h:0.2000, angle:0 },
    merchant    : { x:0.0000, y:0.3500, w:0.0800, h:0.1800, angle:5 },
    boatman     : { x:0.0000, y:0.8400, w:0.0700, h:0.1800, angle:-8 },
  },
  hanxizai: {
    guest       : { x:0.7911, y:0.0380, w:0.0709, h:0.1160, angle:17 },
    host        : { x:0.3522, y:0.2820, w:0.0889, h:0.1460, angle:-3 },
    dancer      : { x:0.0922, y:0.3660, w:0.0760, h:0.1140, angle:-5 },
  },
  bunianta: {
    official    : { x:0.3400, y:0.3300, w:0.0900, h:0.1600, angle:3 },
    envoy       : { x:0.8200, y:0.2700, w:0.0900, h:0.1800, angle:-5 },
  },
  guoguo: {
    lady        : { x:0.2400, y:0.3300, w:0.0900, h:0.1800, angle:0 },
    attendant   : { x:0.3900, y:0.1700, w:0.0900, h:0.1800, angle:3 },
    rider       : { x:0.7850, y:0.2100, w:0.0900, h:0.1800, angle:-5 },
  },
  luoshen: {
    cao         : { x:0.5650, y:0.1100, w:0.1100, h:0.2200, angle:-5 },
    attendant   : { x:0.2200, y:0.2850, w:0.0800, h:0.1600, angle:-2 },
  },
  gongle: {
    listener    : { x:0.2100, y:0.1700, w:0.1100, h:0.2000, angle:0 },
    musician    : { x:0.5750, y:0.4500, w:0.1200, h:0.2000, angle:-8 },
    serving     : { x:0.0150, y:0.3550, w:0.1000, h:0.1800, angle:2 },
  },
};
