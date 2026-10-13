// lib/faceRegions.js
// Single source of truth for face region coordinates.
// Updated by calibrate tool at 2026-10-13T20:08:37.380Z
// faceAngle: viewing angle of the character in the painting
//   'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right'

export const FACE_REGIONS = {
  hanxizai: {
    guest       : { x:0.7942, y:0.0540, w:0.0631, h:0.0940, angle:17, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.8087, cy:0.1083, r:0.0095 }, labFade:0.5 },
    host        : { x:0.3693, y:0.3180, w:0.0454, h:0.0960, angle:-3, faceAngle:'three_quarter_left', foreheadClip:true, faceSize:0.6, faceCenter:{ cx:0.4500, cy:0.6300 }, skinSample:{ cx:0.3990, cy:0.3759, r:0.0103 }, labFade:0.5, widthCalibrated:true },
    dancer      : { x:0.1217, y:0.3900, w:0.0325, h:0.0820, angle:7, faceAngle:'profile_right', faceSize:0.62, faceCenter:{ cx:0.5000, cy:0.4800 }, skinSample:{ cx:0.1372, cy:0.4442, r:0.0070 }, labFade:0.5 },
    official    : { x:0.4514, y:0.0720, w:0.0365, h:0.0746, angle:1, faceAngle:'three_quarter_right', foreheadClip:true, skinSample:{ cx:0.4618, cy:0.1160, r:0.0051 }, labFade:0.5 },
    attendant   : { x:0.6021, y:0.0430, w:0.0341, h:0.0821, angle:-3, faceAngle:'three_quarter_left', foreheadClip:true, skinSample:{ cx:0.6262, cy:0.0911, r:0.0050 }, labFade:0.5 },
    lady        : { x:0.5480, y:0.1395, w:0.0385, h:0.0754, angle:-9, faceAngle:'three_quarter_left', skinSample:{ cx:0.5673, cy:0.1835, r:0.0046 }, labFade:0.5 },
    maid        : { x:0.4835, y:0.2908, w:0.0330, h:0.0690, angle:-8, faceAngle:'three_quarter_left', skinSample:{ cx:0.5000, cy:0.3318, r:0.0043 }, labFade:0.5 },
  },
  gongle: {
    pipa        : { x:0.6831, y:0.0700, w:0.0330, h:0.0740, angle:-10, faceAngle:'front', skinSample:{ cx:0.7059, cy:0.1197, r:0.0052 }, labFade:0.5 },
    guzheng     : { x:0.4930, y:0.0920, w:0.0344, h:0.0720, angle:20, faceAngle:'front', skinSample:{ cx:0.5018, cy:0.1351, r:0.0054 }, labFade:0.5 },
    clapper     : { x:0.1900, y:0.0250, w:0.0257, h:0.0640, angle:20, faceAngle:'three_quarter_right', skinSample:{ cx:0.2084, cy:0.0375, r:0.0039 }, labFade:1 },
    listener    : { x:0.7813, y:0.4260, w:0.0398, h:0.0760, angle:-5, faceAngle:'front', skinSample:{ cx:0.7963, cy:0.4864, r:0.0060 }, labFade:0.5 },
    maid        : { x:0.0673, y:0.4235, w:0.0184, h:0.0670, angle:12, faceAngle:'profile_right', skinSample:{ cx:0.0773, cy:0.4605, r:0.0034 }, labFade:0.5 },
  },
  daolian: {
    girl        : { x:0.2797, y:0.6297, w:0.0135, h:0.0622, angle:-81, faceAngle:'front', skinSample:{ cx:0.1550, cy:0.5300, r:0.0021 }, labFade:0.5 },
    threader    : { x:0.5162, y:0.4212, w:0.0125, h:0.0840, angle:10, faceAngle:'front', skinSample:{ cx:0.5190, cy:0.4733, r:0.0019 }, labFade:0.5 },
    stretcher   : { x:0.0874, y:0.2458, w:0.0117, h:0.0855, angle:18, faceAngle:'three_quarter_right', skinSample:{ cx:0.0910, cy:0.2914, r:0.0013 }, labFade:0.5 },
    ironer      : { x:0.2203, y:0.2241, w:0.0114, h:0.0808, angle:-34, faceAngle:'three_quarter_left', skinSample:{ cx:0.2284, cy:0.2706, r:0.0013 }, labFade:0.5 },
    fanner      : { x:0.4523, y:0.4496, w:0.0100, h:0.0605, angle:29, faceAngle:'front', skinSample:{ cx:0.4544, cy:0.4799, r:0.0012 }, labFade:0.5 },
    pounder     : { x:0.7285, y:0.2768, w:0.0141, h:0.0799, angle:-23, faceAngle:'front', labFade:0.5, skinSample:{ cx:0.7356, cy:0.3247, r:0.0017 } },
  },
  yinger: {
    topleft     : { x:0.2088, y:0.0820, w:0.0347, h:0.1060, angle:20, faceAngle:'three_quarter_right', skinSample:{ cx:0.2182, cy:0.2006, r:0.0052 }, labFade:1 },
    bottomleft  : { x:0.1230, y:0.5280, w:0.0347, h:0.0960, angle:5, faceAngle:'three_quarter_right', skinSample:{ cx:0.1403, cy:0.5480, r:0.0052 }, labFade:1 },
    topcenter   : { x:0.5580, y:0.0620, w:0.0347, h:0.1080, angle:-13, faceAngle:'three_quarter_left', skinSample:{ cx:0.5822, cy:0.1278, r:0.0055 }, labFade:1 },
    right       : { x:0.7820, y:0.3680, w:0.0359, h:0.1080, angle:-16, faceAngle:'three_quarter_left', skinSample:{ cx:0.8102, cy:0.4371, r:0.0057 }, labFade:1 },
  },
  tiaoqin: {
    lady        : { x:0.2211, y:0.3206, w:0.0261, h:0.1117, angle:-9, faceAngle:'front', rMax:0.78, gMax:0.95, bMax:1.65, skinSample:{ cx:0.2321, cy:0.3352, r:0.0040 }, labFade:1 },
    seated      : { x:0.7271, y:0.1686, w:0.0258, h:0.1197, angle:10, faceAngle:'three_quarter_left', rMax:0.78, gMax:0.95, bMax:1.65, skinSample:{ cx:0.7438, cy:0.2462, r:0.0042 }, labFade:1 },
    attendant   : { x:0.1056, y:0.0581, w:0.0210, h:0.1013, angle:9, faceAngle:'three_quarter_right', skinSample:{ cx:0.1134, cy:0.1179, r:0.0032 }, labFade:1 },
  },
  huishan: {
    center      : { x:0.7591, y:0.1389, w:0.0121, h:0.0960, angle:-11, faceAngle:'front', skinSample:{ cx:0.7643, cy:0.1876, r:0.0020 }, labFade:1 },
    seated      : { x:0.8405, y:0.3936, w:0.0122, h:0.0899, angle:11, faceAngle:'front', skinSample:{ cx:0.8465, cy:0.4402, r:0.0020 }, labFade:1 },
    dreamer     : { x:0.5063, y:0.2253, w:0.0102, h:0.0831, angle:-36, faceAngle:'three_quarter_left', skinSample:{ cx:0.5117, cy:0.2819, r:0.0011 }, labFade:1 },
  },
  mingdaidihou_taizu: {
    empress     : { x:0.1977, y:0.4180, w:0.1285, h:0.2500, angle:0, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.2687, cy:0.4686, r:0.0193 }, labFade:0.5, widthCalibrated:true },
    emperor     : { x:0.6698, y:0.4060, w:0.1394, h:0.2460, angle:0, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.7794, cy:0.5359, r:0.0215 }, labFade:0.5, widthCalibrated:true },
  },
  mingdaidihou_xuanzong: {
    empress     : { x:0.1977, y:0.4200, w:0.1204, h:0.2360, angle:-2, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.2620, cy:0.4625, r:0.0189 }, labFade:0.5, widthCalibrated:true },
    emperor     : { x:0.6644, y:0.4020, w:0.1312, h:0.2540, angle:1, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.7659, cy:0.5471, r:0.0203 }, labFade:0.5, widthCalibrated:true },
  },
  mingdaidihou_xiaozong: {
    empress     : { x:0.2085, y:0.3960, w:0.1095, h:0.2420, angle:0, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.2959, cy:0.5433, r:0.0164 }, labFade:0.5, widthCalibrated:true },
    emperor     : { x:0.6820, y:0.4220, w:0.1068, h:0.2140, angle:0, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.7679, cy:0.5511, r:0.0160 }, labFade:0.5, widthCalibrated:true },
  },
  kulou: {
    mother      : { x:0.1263, y:0.3562, w:0.0424, h:0.0655, angle:8, faceAngle:'three_quarter_right', saturation:1, skinSample:{ cx:0.1362, cy:0.3973, r:0.0050 }, labFade:1 },
    girl        : { x:0.7076, y:0.4618, w:0.0358, h:0.0521, angle:-23, faceAngle:'three_quarter_left', saturation:1, skinSample:{ cx:0.7197, cy:0.4985, r:0.0040 }, labFade:1, widthCalibrated:true },
    skeleton    : { x:0.2804, y:0.4256, w:0.0442, h:0.0625, angle:31, faceAngle:'three_quarter_right', saturation:1, skinSample:{ cx:0.2887, cy:0.4493, r:0.0050 }, labFade:1, widthCalibrated:true, overlayOriginal:0.3 },
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
