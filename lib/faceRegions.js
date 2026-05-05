// lib/faceRegions.js
// Single source of truth for face region coordinates.
// Used by:
//   - pages/api/composite.js  (face compositing + rotation)
//   - RuHua.jsx               (你在此处 marker + selfie pre-crop)
//
// x, y, w, h: normalized 0-1 coordinates of the face region in the painting
// angle: rotation in degrees applied to the generated face before compositing

export const FACE_REGIONS = {
  qingming: {
    scholar:  { x:0.000, y:0.390, w:0.130, h:0.200, angle:0   },
    merchant: { x:0.000, y:0.350, w:0.080, h:0.180, angle:5   },
    boatman:  { x:0.000, y:0.840, w:0.070, h:0.180, angle:-8  },
  },
  hanxizai: {
    guest:  { x:0.760, y:0.330, w:0.130, h:0.220, angle:5  },
    host:   { x:0.155, y:0.300, w:0.120, h:0.220, angle:-3 },
    dancer: { x:0.350, y:0.290, w:0.090, h:0.170, angle:-5 },
  },
  bunianta: {
    official: { x:0.340, y:0.330, w:0.090, h:0.160, angle:3  },
    envoy:    { x:0.820, y:0.270, w:0.090, h:0.180, angle:-5 },
  },
  guoguo: {
    lady:      { x:0.240, y:0.330, w:0.090, h:0.180, angle:0  },
    attendant: { x:0.390, y:0.170, w:0.090, h:0.180, angle:3  },
    rider:     { x:0.785, y:0.210, w:0.090, h:0.180, angle:-5 },
  },
  luoshen: {
    cao:       { x:0.565, y:0.110, w:0.110, h:0.220, angle:-5 },
    attendant: { x:0.220, y:0.285, w:0.080, h:0.160, angle:-2 },
  },
  gongle: {
    listener: { x:0.210, y:0.170, w:0.110, h:0.200, angle:0  },
    musician: { x:0.575, y:0.450, w:0.120, h:0.200, angle:-8 },
    serving:  { x:0.015, y:0.355, w:0.100, h:0.180, angle:2  },
  },
};
