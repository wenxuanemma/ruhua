// lib/faceRegions.js
// Single source of truth for face region coordinates.
// Updated by calibrate tool at 2026-07-14T15:48:26.573Z
// faceAngle: viewing angle of the character in the painting
//   'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right'

export const FACE_REGIONS = {
  hanxizai: {
    guest       : { x:0.7942, y:0.0540, w:0.0631, h:0.0940, angle:17, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.8087, cy:0.1083, r:0.0095 } },
    host        : { x:0.3569, y:0.3120, w:0.0687, h:0.1120, angle:-3, faceAngle:'three_quarter_left', disabled:true, faceSize:0.6, faceCenter:{ cx:0.4500, cy:0.6300 }, skinSample:{ cx:0.3990, cy:0.3779, r:0.0103 } },
    dancer      : { x:0.1186, y:0.3760, w:0.0465, h:0.1020, angle:7, faceAngle:'profile_right', disabled:true, faceSize:0.62, faceCenter:{ cx:0.5000, cy:0.4800 }, skinSample:{ cx:0.1372, cy:0.4442, r:0.0070 } },
  },
  gongle: {
    pipa        : { x:0.6817, y:0.0700, w:0.0344, h:0.0760, angle:-10, faceAngle:'front', skinSample:{ cx:0.7059, cy:0.1197, r:0.0052 } },
    guzheng     : { x:0.4916, y:0.0940, w:0.0358, h:0.0700, angle:20, faceAngle:'front', skinSample:{ cx:0.5018, cy:0.1351, r:0.0054 } },
    clapper     : { x:0.1900, y:0.0250, w:0.0257, h:0.0640, angle:20, faceAngle:'front', skinSample:{ cx:0.2084, cy:0.0375, r:0.0039 } },
    listener    : { x:0.7813, y:0.4260, w:0.0398, h:0.0760, angle:-5, faceAngle:'front', skinSample:{ cx:0.7963, cy:0.4864, r:0.0060 } },
  },
  daolian: {
    girl        : { x:0.2797, y:0.6297, w:0.0135, h:0.0622, angle:-81, faceAngle:'front', skinSample:{ cx:0.1550, cy:0.5300, r:0.0021 } },
    threader    : { x:0.5160, y:0.4192, w:0.0127, h:0.0830, angle:5, faceAngle:'front', skinSample:{ cx:0.5223, cy:0.4633, r:0.0019 } },
  },
  yinger: {
    topleft     : { x:0.2088, y:0.0820, w:0.0347, h:0.1060, angle:20, faceAngle:'front', skinSample:{ cx:0.2182, cy:0.2006, r:0.0052 } },
    bottomleft  : { x:0.1230, y:0.5280, w:0.0347, h:0.0960, angle:5, faceAngle:'front', skinSample:{ cx:0.1403, cy:0.5480, r:0.0052 } },
    topcenter   : { x:0.5580, y:0.0620, w:0.0347, h:0.1080, angle:-13, faceAngle:'front', skinSample:{ cx:0.5822, cy:0.1278, r:0.0055 } },
    right       : { x:0.7820, y:0.3680, w:0.0359, h:0.1080, angle:-16, faceAngle:'front', skinSample:{ cx:0.8102, cy:0.4371, r:0.0057 } },
  },
  tiaoqin: {
    lady        : { x:0.2203, y:0.3206, w:0.0269, h:0.1127, angle:-7, faceAngle:'front', rMax:0.78, gMax:0.95, bMax:1.65, skinSample:{ cx:0.2321, cy:0.3352, r:0.0040 } },
    seated      : { x:0.7260, y:0.1646, w:0.0281, h:0.1267, angle:10, faceAngle:'front', rMax:0.78, gMax:0.95, bMax:1.65, skinSample:{ cx:0.7438, cy:0.2462, r:0.0042 } },
  },
  huishan: {
    center      : { x:0.7581, y:0.1369, w:0.0135, h:0.0990, angle:-11, faceAngle:'front', skinSample:{ cx:0.7643, cy:0.1876, r:0.0020 } },
    seated      : { x:0.8398, y:0.3946, w:0.0136, h:0.0889, angle:11, faceAngle:'front', skinSample:{ cx:0.8465, cy:0.4402, r:0.0020 } },
  },
  mingdaidihou_taizu: {
    empress     : { x:0.1977, y:0.4180, w:0.1285, h:0.2500, angle:0, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.2687, cy:0.4686, r:0.0193 } },
    emperor     : { x:0.6698, y:0.4060, w:0.1394, h:0.2460, angle:0, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.7794, cy:0.5359, r:0.0215 } },
  },
  mingdaidihou_xuanzong: {
    empress     : { x:0.1977, y:0.4200, w:0.1204, h:0.2360, angle:-2, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.2620, cy:0.4625, r:0.0189 } },
    emperor     : { x:0.6644, y:0.4020, w:0.1312, h:0.2540, angle:1, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.7659, cy:0.5471, r:0.0203 } },
  },
  mingdaidihou_xiaozong: {
    empress     : { x:0.2085, y:0.3960, w:0.1095, h:0.2420, angle:0, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.2959, cy:0.5433, r:0.0164 } },
    emperor     : { x:0.6820, y:0.4220, w:0.1068, h:0.2140, angle:0, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.7679, cy:0.5511, r:0.0160 } },
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
