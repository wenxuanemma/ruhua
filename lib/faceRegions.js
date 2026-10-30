// lib/faceRegions.js
// Single source of truth for face region coordinates.
// Updated by calibrate tool at 2026-10-14T18:21:21.757Z
// faceAngle: viewing angle of the character in the painting
//   'front' | 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right'

export const FACE_REGIONS = {
  hanxizai: {
    guest       : { x:0.7942, y:0.0540, w:0.0631, h:0.0940, angle:17, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.8087, cy:0.1083, r:0.0095 }, labFade:0.5 },
    host        : { x:0.3693, y:0.3180, w:0.0501, h:0.0960, angle:-5, faceAngle:'three_quarter_left', foreheadClip:true, faceSize:0.6, faceCenter:{ cx:0.4500, cy:0.6300 }, skinSample:{ cx:0.3990, cy:0.3759, r:0.0103 }, labFade:0.5, widthCalibrated:true },
    dancer      : { x:0.1251, y:0.3910, w:0.0317, h:0.0810, angle:13, faceAngle:'profile_right', faceSize:0.62, faceCenter:{ cx:0.5000, cy:0.4800 }, skinSample:{ cx:0.1372, cy:0.4442, r:0.0070 }, labFade:0.5 },
    official    : { x:0.4459, y:0.0577, w:0.0420, h:0.0869, angle:1, faceAngle:'three_quarter_right', foreheadClip:true, skinSample:{ cx:0.4618, cy:0.1160, r:0.0051 }, labFade:0.5 },
    attendant   : { x:0.6005, y:0.0370, w:0.0455, h:0.0864, angle:-3, faceAngle:'three_quarter_left', foreheadClip:true, skinSample:{ cx:0.6262, cy:0.0911, r:0.0050 }, labFade:0.5 },
    lady        : { x:0.5433, y:0.1275, w:0.0385, h:0.0854, angle:-13, faceAngle:'three_quarter_left', skinSample:{ cx:0.5626, cy:0.1515, r:0.0046 }, labFade:0.5 },
    maid        : { x:0.4816, y:0.2875, w:0.0356, h:0.0730, angle:-7, faceAngle:'three_quarter_left', skinSample:{ cx:0.5000, cy:0.3318, r:0.0043 }, labFade:0.5 },
  },
  gongle: {
    pipa        : { x:0.6812, y:0.0700, w:0.0367, h:0.0747, angle:-10, faceAngle:'front', skinSample:{ cx:0.7059, cy:0.1197, r:0.0052 }, labFade:0.5 },
    guzheng     : { x:0.4907, y:0.0940, w:0.0358, h:0.0720, angle:20, faceAngle:'front', skinSample:{ cx:0.5172, cy:0.1044, r:0.0054 }, labFade:0.5 },
    clapper     : { x:0.1879, y:0.0120, w:0.0299, h:0.0794, angle:20, faceAngle:'three_quarter_right', skinSample:{ cx:0.2098, cy:0.0378, r:0.0039 }, labFade:1 },
    listener    : { x:0.7813, y:0.4260, w:0.0398, h:0.0760, angle:-5, faceAngle:'front', skinSample:{ cx:0.7963, cy:0.4864, r:0.0060 }, labFade:0.5 },
    maid        : { x:0.0673, y:0.4242, w:0.0203, h:0.0663, angle:17, faceAngle:'profile_right', skinSample:{ cx:0.0773, cy:0.4605, r:0.0034 }, labFade:0.5 },
  },
  daolian: {
    girl        : { x:0.2797, y:0.6297, w:0.0135, h:0.0622, angle:-81, faceAngle:'front', skinSample:{ cx:0.1550, cy:0.5300, r:0.0021 }, labFade:0.5 },
    threader    : { x:0.5162, y:0.4192, w:0.0121, h:0.0870, angle:10, faceAngle:'front', skinSample:{ cx:0.5235, cy:0.4286, r:0.0019 }, labFade:0.5 },
    stretcher   : { x:0.0867, y:0.2464, w:0.0117, h:0.0835, angle:18, faceAngle:'three_quarter_right', skinSample:{ cx:0.0947, cy:0.2614, r:0.0013 }, labFade:0.5 },
    ironer      : { x:0.2198, y:0.2201, w:0.0122, h:0.0861, angle:-34, faceAngle:'three_quarter_left', skinSample:{ cx:0.2209, cy:0.2419, r:0.0013 }, labFade:0.5 },
    fanner      : { x:0.4511, y:0.4479, w:0.0118, h:0.0615, angle:29, faceAngle:'front', skinSample:{ cx:0.4603, cy:0.4596, r:0.0012 }, labFade:0.5 },
    pounder     : { x:0.7288, y:0.2688, w:0.0132, h:0.0892, angle:-23, faceAngle:'front', skinSample:{ cx:0.7334, cy:0.2794, r:0.0017 }, labFade:0.5 },
  },
  yinger: {
    topleft     : { x:0.2061, y:0.0727, w:0.0393, h:0.1153, angle:20, faceAngle:'three_quarter_right', skinSample:{ cx:0.2322, cy:0.1066, r:0.0052 }, labFade:1 },
    bottomleft  : { x:0.1211, y:0.5280, w:0.0374, h:0.0980, angle:5, faceAngle:'three_quarter_right', skinSample:{ cx:0.1403, cy:0.5480, r:0.0052 }, labFade:1 },
    topcenter   : { x:0.5550, y:0.0593, w:0.0404, h:0.1094, angle:-7, faceAngle:'three_quarter_left', skinSample:{ cx:0.5723, cy:0.0845, r:0.0055 }, labFade:1 },
    right       : { x:0.7797, y:0.3680, w:0.0424, h:0.1067, angle:-16, faceAngle:'three_quarter_left', skinSample:{ cx:0.8102, cy:0.4371, r:0.0057 }, labFade:1 },
  },
  tiaoqin: {
    lady        : { x:0.2211, y:0.3233, w:0.0254, h:0.1097, angle:-9, faceAngle:'front', rMax:0.78, gMax:0.95, bMax:1.65, skinSample:{ cx:0.2321, cy:0.3352, r:0.0040 }, labFade:1 },
    seated      : { x:0.7266, y:0.1673, w:0.0299, h:0.1190, angle:10, faceAngle:'three_quarter_left', rMax:0.78, gMax:0.95, bMax:1.65, skinSample:{ cx:0.7410, cy:0.1835, r:0.0042 }, labFade:1 },
    attendant   : { x:0.1038, y:0.0468, w:0.0238, h:0.1113, angle:9, faceAngle:'three_quarter_right', skinSample:{ cx:0.1193, cy:0.0812, r:0.0032 }, labFade:1 },
  },
  huishan: {
    center      : { x:0.7591, y:0.1389, w:0.0121, h:0.0960, angle:-11, faceAngle:'front', skinSample:{ cx:0.7643, cy:0.1876, r:0.0020 }, labFade:1 },
    seated      : { x:0.8407, y:0.3936, w:0.0120, h:0.0912, angle:20, faceAngle:'front', skinSample:{ cx:0.8465, cy:0.4402, r:0.0020 }, labFade:1 },
    dreamer     : { x:0.5063, y:0.2260, w:0.0107, h:0.0864, angle:-36, faceAngle:'three_quarter_left', skinSample:{ cx:0.5082, cy:0.2466, r:0.0011 }, labFade:1 },
  },
  mingdaidihou_taizu: {
    empress     : { x:0.1977, y:0.4180, w:0.1285, h:0.2500, angle:0, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.2687, cy:0.4686, r:0.0193 }, labFade:0, widthCalibrated:true },
    emperor     : { x:0.6698, y:0.4060, w:0.1394, h:0.2460, angle:0, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.7794, cy:0.5359, r:0.0215 }, labFade:0, widthCalibrated:true },
  },
  mingdaidihou_xuanzong: {
    empress     : { x:0.1977, y:0.4200, w:0.1218, h:0.2360, angle:-2, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.2620, cy:0.4625, r:0.0189 }, labFade:0, labOffset:{"L":5,"b":-3}, widthCalibrated:true },
    emperor     : { x:0.6621, y:0.4020, w:0.1335, h:0.2540, angle:1, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.7659, cy:0.5471, r:0.0203 }, labFade:0, widthCalibrated:true },
  },
  mingdaidihou_xiaozong: {
    empress     : { x:0.2085, y:0.3960, w:0.1095, h:0.2420, angle:0, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.2959, cy:0.5433, r:0.0164 }, labFade:0, widthCalibrated:true },
    emperor     : { x:0.6820, y:0.4220, w:0.1091, h:0.2167, angle:0, faceAngle:'front', foreheadClip:true, bMax:1.6, skinSample:{ cx:0.7679, cy:0.5511, r:0.0160 }, labFade:0, widthCalibrated:true },
  },
  kulou: {
    mother      : { x:0.1225, y:0.3542, w:0.0471, h:0.0678, angle:6, faceAngle:'three_quarter_right', saturation:1, skinSample:{ cx:0.1362, cy:0.3973, r:0.0050 }, labFade:1 },
    girl        : { x:0.7076, y:0.4618, w:0.0372, h:0.0541, angle:-23, faceAngle:'three_quarter_left', saturation:1, skinSample:{ cx:0.7197, cy:0.4985, r:0.0040 }, labFade:1, widthCalibrated:true },
    skeleton    : { x:0.2804, y:0.4249, w:0.0469, h:0.0625, angle:22, faceAngle:'three_quarter_right', saturation:1, skinSample:{ cx:0.2887, cy:0.4493, r:0.0050 }, labFade:1, widthCalibrated:true, overlayOriginal:0.15 },
  },
  zhongkui_fangxun: {
    zhongkui    : { x:0.4872, y:0.2033, w:0.1661, h:0.1097, angle:-2, faceAngle:'front', foreheadClip:true, skinSample:{ cx:0.6028, cy:0.2650, r:0.0156 }, labFade:0.5 },
  },
  hongli_xuejing: {
    qianlong    : { x:0.7214, y:0.1632, w:0.0286, h:0.0653, angle:0, faceAngle:'front', skinSample:{ cx:0.7357, cy:0.2023, r:0.0029 }, labFade:0.5 },
    consort     : { x:0.7575, y:0.1433, w:0.0205, h:0.0490, angle:0, faceAngle:'front', skinSample:{ cx:0.7677, cy:0.1727, r:0.0021 }, labFade:0.5 },
    consort2    : { x:0.7848, y:0.1494, w:0.0212, h:0.0474, angle:18, faceAngle:'three_quarter_left', skinSample:{ cx:0.7954, cy:0.1779, r:0.0021 }, labFade:0.5 },
    prince      : { x:0.6107, y:0.1509, w:0.0251, h:0.0490, angle:0, faceAngle:'front', skinSample:{ cx:0.6232, cy:0.1803, r:0.0025 }, labFade:0.5 },
    waving      : { x:0.2419, y:0.3049, w:0.0182, h:0.0326, angle:-10, faceAngle:'front', skinSample:{ cx:0.2510, cy:0.3245, r:0.0018 }, labFade:0.5 },
    fruit       : { x:0.4176, y:0.2631, w:0.0205, h:0.0388, angle:-15, faceAngle:'front', skinSample:{ cx:0.4279, cy:0.2864, r:0.0021 }, labFade:0.5 },
  },
  dongri_yingxi: {
    sister      : { x:0.5762, y:0.4939, w:0.0503, h:0.0491, angle:-20, faceAngle:'three_quarter_left', skinSample:{ cx:0.6014, cy:0.5234, r:0.0060 }, labFade:0.5 },
    brother     : { x:0.7725, y:0.5179, w:0.0582, h:0.0550, angle:20, faceAngle:'three_quarter_left', skinSample:{ cx:0.8016, cy:0.5509, r:0.0070 }, labFade:0.5 },
  },
  xueye_fangpu: {
    taizu       : { x:0.2797, y:0.5143, w:0.0359, h:0.0686, angle:-8, faceAngle:'three_quarter_left', skinSample:{ cx:0.2977, cy:0.5555, r:0.0043 }, labFade:0.5 },
    zhaopu      : { x:0.1965, y:0.6070, w:0.0180, h:0.0400, angle:0, faceAngle:'profile_right', skinSample:{ cx:0.2055, cy:0.6310, r:0.0022 }, labFade:1 },
    wife        : { x:0.5092, y:0.5055, w:0.0158, h:0.0327, angle:0, faceAngle:'front', skinSample:{ cx:0.5171, cy:0.5251, r:0.0019 }, labFade:0.5 },
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
