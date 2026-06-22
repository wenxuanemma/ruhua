// lib/faceRegions.js
// Single source of truth for face region coordinates.
// faceAngle: viewing angle of the character in the painting
//   'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right'

export const FACE_REGIONS = {
  hanxizai: {
    guest       : { x:0.7895, y:0.0380, w:0.0740, h:0.1180, angle:17, faceAngle:'front', colorShift:0.95, skinSample:{ cx:0.8079, cy:0.1087, r:0.0080 } },
    host        : { x:0.3569, y:0.3000, w:0.0749, h:0.1260, angle:-3, faceAngle:'three_quarter_left', colorShift:0.95, faceSize:0.6, faceCenter:{ cx:0.4500, cy:0.6300 }, skinSample:{ cx:0.3990, cy:0.3779, r:0.0080 }, disabled:true },
    dancer      : { x:0.1093, y:0.3660, w:0.0574, h:0.1160, angle:7, faceAngle:'profile_right', faceSize:0.62, faceCenter:{ cx:0.5000, cy:0.4800 }, skinSample:{ cx:0.1372, cy:0.4442, r:0.0080 }, disabled:true },
  },
  gongle: {
    listener    : { x:0.4811, y:0.0720, w:0.0580, h:0.1000, angle:13, faceAngle:'front' },
    musician    : { x:0.6733, y:0.0400, w:0.0554, h:0.1160, angle:-8, faceAngle:'front' },
    serving     : { x:0.7694, y:0.3990, w:0.0649, h:0.1100, angle:2, faceAngle:'front' },
  },
  daolian: {
    ironer      : { x:0.3500, y:0.1000, w:0.1200, h:0.5000, angle:0, faceAngle:'front' },
    threader    : { x:0.1000, y:0.1000, w:0.1200, h:0.5000, angle:5, faceAngle:'front' },
  },
  yinger: {
    topleft     : { x:0.0800, y:0.0200, w:0.2000, h:0.4500, angle:5, faceAngle:'front' },
    topcenter   : { x:0.4200, y:0.0200, w:0.2000, h:0.4500, angle:-3, faceAngle:'front' },
  },
  tiaoqin: {
    lady        : { x:0.3000, y:0.0500, w:0.2000, h:0.5000, angle:0, faceAngle:'front' },
    attendant   : { x:0.6000, y:0.0500, w:0.1800, h:0.5000, angle:-5, faceAngle:'front' },
  },
  huishan: {
    center      : { x:0.3500, y:0.0500, w:0.1500, h:0.5500, angle:0, faceAngle:'front' },
    seated      : { x:0.6500, y:0.2000, w:0.1500, h:0.5500, angle:5, faceAngle:'front' },
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
