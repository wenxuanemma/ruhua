// lib/faceRegions.js
// Single source of truth for face region coordinates.
// Updated by calibrate tool at 2026-06-25T15:26:59.974Z
// faceAngle: viewing angle of the character in the painting
//   'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right'

export const FACE_REGIONS = {
  hanxizai: {
    guest       : { x:0.7911, y:0.0420, w:0.0724, h:0.1120, angle:17, faceAngle:'front', colorShift:0.95, skinSample:{ cx:0.8079, cy:0.1087, r:0.0080 } },
    host        : { x:0.3569, y:0.3120, w:0.0687, h:0.1120, angle:-3, faceAngle:'three_quarter_left', colorShift:0.95, faceSize:0.6, faceCenter:{ cx:0.4500, cy:0.6300 }, skinSample:{ cx:0.3990, cy:0.3779, r:0.0080 } },
    dancer      : { x:0.1186, y:0.3760, w:0.0465, h:0.1020, angle:7, faceAngle:'profile_right', faceSize:0.62, faceCenter:{ cx:0.5000, cy:0.4800 }, skinSample:{ cx:0.1372, cy:0.4442, r:0.0080 } },
  },
  gongle: {
    pipa        : { x:0.6747, y:0.0520, w:0.0526, h:0.1000, angle:-1, faceAngle:'front', skinSample:{ cx:0.7087, cy:0.1197, r:0.0080 } },
    guzheng     : { x:0.4888, y:0.0780, w:0.0456, h:0.0940, angle:20, faceAngle:'front', skinSample:{ cx:0.5004, cy:0.1351, r:0.0080 } },
    clapper     : { x:0.1844, y:0.0090, w:0.0397, h:0.0900, angle:20, faceAngle:'front', skinSample:{ cx:0.1958, cy:0.0615, r:0.0080 } },
    listener    : { x:0.7743, y:0.4100, w:0.0524, h:0.0960, angle:-5, faceAngle:'front', skinSample:{ cx:0.7935, cy:0.4804, r:0.0080 } },
  },
  daolian: {
    ironer      : { x:0.2165, y:0.1993, w:0.0168, h:0.1133, angle:-20, faceAngle:'front', skinSample:{ cx:0.2279, cy:0.2703, r:0.0080 } },
    threader    : { x:0.5134, y:0.3954, w:0.0180, h:0.1187, angle:5, faceAngle:'front', skinSample:{ cx:0.5188, cy:0.4752, r:0.0080 } },
  },
  yinger: {
    topleft     : { x:0.2054, y:0.0700, w:0.0461, h:0.1240, angle:20, faceAngle:'front', skinSample:{ cx:0.2182, cy:0.1486, r:0.0080 } },
    bottomleft  : { x:0.1173, y:0.5120, w:0.0484, h:0.1200, angle:5, faceAngle:'front', skinSample:{ cx:0.1335, cy:0.5880, r:0.0080 } },
    topcenter   : { x:0.5477, y:0.0440, w:0.0507, h:0.1320, angle:-3, faceAngle:'front', skinSample:{ cx:0.5822, cy:0.1278, r:0.0080 } },
    right       : { x:0.7717, y:0.3500, w:0.0542, h:0.1340, angle:-16, faceAngle:'front', skinSample:{ cx:0.8102, cy:0.4371, r:0.0080 } },
  },
  tiaoqin: {
    lady        : { x:0.2159, y:0.3020, w:0.0349, h:0.1360, angle:-7, faceAngle:'front', colorShift:1, skinSample:{ cx:0.2410, cy:0.3864, r:0.0080 } },
    seated      : { x:0.7216, y:0.1460, w:0.0370, h:0.1500, angle:10, faceAngle:'front', colorShift:1, skinSample:{ cx:0.7447, cy:0.2415, r:0.0080 } },
  },
  huishan: {
    center      : { x:0.7563, y:0.1218, w:0.0165, h:0.1192, angle:-11, faceAngle:'front', skinSample:{ cx:0.7669, cy:0.2027, r:0.0080 } },
    seated      : { x:0.8380, y:0.3744, w:0.0171, h:0.1192, angle:11, faceAngle:'front', colorShift:1, skinSample:{ cx:0.8483, cy:0.4553, r:0.0080 } },
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
