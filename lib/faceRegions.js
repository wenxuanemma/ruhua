// lib/faceRegions.js
// Single source of truth for face region coordinates.
// Updated by calibrate tool at 2026-06-10T16:55:35.087Z
// faceAngle: viewing angle of the character in the painting
//   'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right'

export const FACE_REGIONS = {
  qingming: {
    scholar     : { x:0.0000, y:0.3900, w:0.1300, h:0.2000, angle:0, faceAngle:'front' },
    merchant    : { x:0.0000, y:0.3500, w:0.0800, h:0.1800, angle:5, faceAngle:'three_quarter_right' },
    boatman     : { x:0.0000, y:0.8400, w:0.0700, h:0.1800, angle:-8, faceAngle:'three_quarter_left' },
  },
  hanxizai: {
    guest       : { x:0.7895, y:0.0380, w:0.0740, h:0.1180, angle:17, faceAngle:'front', colorShift:0.95, skinSample:{ cx:0.8079, cy:0.1087, r:0.0080 } },
    host        : { x:0.3569, y:0.3000, w:0.0749, h:0.1260, angle:-3, faceAngle:'three_quarter_left', colorShift:0.95, skinSample:{ cx:0.3990, cy:0.3779, r:0.0080 } },
    dancer      : { x:0.1093, y:0.3740, w:0.0558, h:0.1080, angle:7, faceAngle:'profile_right', skinSample:{ cx:0.1372, cy:0.4442, r:0.0080 } },
  },
  bunianta: {
    official    : { x:0.3400, y:0.3300, w:0.0900, h:0.1600, angle:3, faceAngle:'front' },
    envoy       : { x:0.8200, y:0.2700, w:0.0900, h:0.1800, angle:-5, faceAngle:'three_quarter_right' },
  },
  guoguo: {
    lady        : { x:0.2400, y:0.3300, w:0.0900, h:0.1800, angle:0, faceAngle:'front' },
    attendant   : { x:0.3900, y:0.1700, w:0.0900, h:0.1800, angle:3, faceAngle:'three_quarter_left' },
    rider       : { x:0.7850, y:0.2100, w:0.0900, h:0.1800, angle:-5, faceAngle:'three_quarter_right' },
  },
  luoshen: {
    cao         : { x:0.5650, y:0.1100, w:0.1100, h:0.2200, angle:-5, faceAngle:'front' },
    attendant   : { x:0.2200, y:0.2850, w:0.0800, h:0.1600, angle:-2, faceAngle:'three_quarter_left' },
  },
  gongle: {
    listener    : { x:0.2100, y:0.1700, w:0.1100, h:0.2000, angle:0, faceAngle:'front' },
    musician    : { x:0.5750, y:0.4500, w:0.1200, h:0.2000, angle:-8, faceAngle:'three_quarter_left' },
    serving     : { x:0.0150, y:0.3550, w:0.1000, h:0.1800, angle:2, faceAngle:'three_quarter_right' },
  },
};

export const GUEST_SPOTS = {
  hanxizai: {
    visitor: {
      label: '入席贵客',
      labelEn: 'Arriving Guest',
      bodyAsset: '/guest-bodies/hanxizai-visitor.png',
      faceInBody:     { x:0.28, y:0.02, w:0.44, h:0.32, angle:3  },
      bodyInPainting: { x:0.880, y:0.180, w:0.100, h:0.580 },
    },
  },
};
