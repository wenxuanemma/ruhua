import cv2, numpy as np
from insightface.app import FaceAnalysis
from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
from diffusers import StableDiffusionXLPipeline, StableDiffusionXLImg2ImgPipeline
import torch, io, base64
from PIL import Image

app = FastAPI()

class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = "photorealistic, photograph, modern, anime"
    steps: int = 25
    guidance: float = 7.5
    seed: int = -1
    width: int = 640
    height: int = 640
    init_image: str = None
    strength: float = 0.20

print("Loading model + LoRA...")
pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.bfloat16,
    variant="fp16",
    use_safetensors=True,
).to("cuda")
pipe.load_lora_weights(".", weight_name="output/gongbi_lora/gongbi_portrait_v3-000002.safetensors")
pipe.fuse_lora(lora_scale=0.8)
pipe_img2img = StableDiffusionXLImg2ImgPipeline(**pipe.components).to("cuda")
print("Ready.")
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/generate")
async def generate(req: GenerateRequest):
    seed = req.seed if req.seed >= 0 else torch.randint(0, 2**32, (1,)).item()
    generator = torch.Generator("cuda").manual_seed(seed)

    if req.init_image:
        img_data = base64.b64decode(req.init_image.split(',')[-1])
        init_img = Image.open(io.BytesIO(img_data)).convert("RGB")
        init_img = init_img.resize((req.width, req.height))
        image = pipe_img2img(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            image=init_img,
            strength=req.strength,
            num_inference_steps=req.steps,
            guidance_scale=req.guidance,
            generator=generator,
        ).images[0]
    else:
        image = pipe(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            num_inference_steps=req.steps,
            guidance_scale=req.guidance,
            width=req.width,
            height=req.height,
            generator=generator,
        ).images[0]

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/png")

class DetectRequest(BaseModel):
    init_image: str

@app.post("/detect-face")
async def detect_face(req: DetectRequest):
    if not req.init_image:
        return {"box": None}
    try:
        raw = req.init_image.split(',')[-1] if ',' in req.init_image else req.init_image
        raw = raw.strip().replace(' ', '+')  # fix URL-encoded base64
        img_data = base64.b64decode(raw + '=' * (-len(raw) % 4))
        img = Image.open(io.BytesIO(img_data)).convert("RGB")
        W, H = img.size
        img_cv2 = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        faces = face_app.get(img_cv2)
        if not faces:
            return {"box": None}
        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0]) * (f.bbox[3]-f.bbox[1]))
        x1, y1, x2, y2 = face.bbox
        pad_x = (x2 - x1) * 0.25
        pad_y_top = (y2 - y1) * 0.20
        pad_y_bot = (y2 - y1) * 0.30
        return {"box": {
            "x":  float(max(0, (x1 - pad_x) / W)),
            "y":  float(max(0, (y1 - pad_y_top) / H)),
            "x2": float(min(1, (x2 + pad_x) / W)),
            "y2": float(min(1, (y2 + pad_y_bot) / H)),
        }}
    except Exception as e:
        print(f"Face detect error: {e}")
        return {"box": None}

import urllib.request, os
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python.vision import FaceDetector, FaceDetectorOptions
from mediapipe.tasks.python.core.base_options import BaseOptions

model_path = os.path.join(os.path.dirname(__file__), 'blaze_face_short_range.tflite')
if not os.path.exists(model_path):
    print("Downloading MediaPipe face model...")
    urllib.request.urlretrieve(
        'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        model_path
    )

mp_options = FaceDetectorOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    min_detection_confidence=0.3
)
mp_detector = FaceDetector.create_from_options(mp_options)
print("MediaPipe face detector ready.")

@app.post("/detect-face-mp")
async def detect_face_mp(req: DetectRequest):
    if not req.init_image:
        return {"box": None}
    try:
        raw = req.init_image.split(',', 1)[1] if ',' in req.init_image else req.init_image
        raw += '=' * (-len(raw) % 4)
        img_data = base64.b64decode(raw)
        img = Image.open(io.BytesIO(img_data)).convert("RGB")
        W, H = img.size
        import mediapipe as mp
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.array(img))
        result = mp_detector.detect(mp_image)
        if not result.detections:
            return {"box": None}
        best = max(result.detections, key=lambda d: d.bounding_box.width * d.bounding_box.height)
        bb = best.bounding_box
        # BlazeFace keypoints (normalized): 0=right eye, 1=left eye, 2=nose, 3=mouth, 4=right ear, 5=left ear
        kps = best.keypoints
        keypoints = [{"x": float(kp.x), "y": float(kp.y)} for kp in kps] if kps else []
        return {"box": {
            "x":  float(max(0, bb.origin_x / W)),
            "y":  float(max(0, bb.origin_y / H)),
            "x2": float(min(1, (bb.origin_x + bb.width)  / W)),
            "y2": float(min(1, (bb.origin_y + bb.height) / H)),
        }, "keypoints": keypoints}
    except Exception as e:
        print(f"MediaPipe detect error: {e}")
        return {"box": None}


# ── Outline-based face detection (combined with MediaPipe) ───────────────────
# Finds precise foreheadTop and chinBottom via ink contour detection,
# combined with MediaPipe keypoints for horizontal bounds and face direction.

def _find_face_contour_bbox(img_cv2):
    """
    Find the main face contour bbox using ink outline detection.
    Returns (x, y, w, h) in pixels, or None.
    """
    H, W = img_cv2.shape[:2]
    gray = cv2.cvtColor(img_cv2, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(blur, 40, 120)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, k, iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    min_area = W * H * 0.01
    max_area = W * H * 0.30
    candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        x, y, w, h = cv2.boundingRect(cnt)
        if area < min_area or area > max_area:
            continue
        aspect = w / max(h, 1)
        if aspect < 0.25 or aspect > 1.5:
            continue
        if (y + h / 2) > H * 0.75:
            continue
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = area / max(hull_area, 1)
        if solidity < 0.3:
            continue
        perimeter = cv2.arcLength(cnt, True)
        circularity = 4 * np.pi * area / max(perimeter ** 2, 1)
        if circularity < 0.05:
            continue
        cx_norm = (x + w / 2) / W
        cy_norm = (y + h / 2) / H
        # Face can be left or right facing — score based on distance from either side center
        # Prefer upper half of image for face position
        pos_x_score = max(1 - abs(cx_norm - 0.35), 1 - abs(cx_norm - 0.65))  # left or right face
        pos_y_score = 1 - abs(cy_norm - 0.35)  # prefer upper portion
        pos_score = pos_x_score * pos_y_score
        size_score = min(area / (W * H * 0.08), 1.0)
        score = pos_score * 0.35 + size_score * 0.25 + circularity * 3 * 0.20 + solidity * 0.20
        candidates.append((score, x, y, w, h, cnt))

    if not candidates:
        print(f"[outline] No candidates found")
        return None, None
    candidates.sort(reverse=True)
    _, x, y, w, h, cnt = candidates[0]
    return (x, y, w, h), cnt


def _find_chin_y(cnt, bbox_x, bbox_w, img_w):
    # Find chin Y for a profile face contour.
    # Strategy: scan the lower 60% of the contour for the profile edge.
    # The chin is the LAST local protrusion before the neck narrows permanently.
    # We scan from bottom upward and find where the edge protrudes outward,
    # which gives the chin tip (below the mouth recess).
    pts = cnt.reshape(-1, 2)
    min_y = int(pts[:, 1].min())
    max_y = int(pts[:, 1].max())
    face_h = max_y - min_y

    # Only look in lower 60% of face for chin (above = nose/forehead)
    lower_start = int(min_y + face_h * 0.40)
    band = 6
    drop_threshold = bbox_w * 0.06

    bbox_cx = bbox_x + bbox_w / 2
    facing_left = bbox_cx < img_w / 2  # nose on left = track right edge

    # Build profile edge from lower_start to max_y
    profile_edge = []
    for y0 in range(lower_start, max_y - band, band):
        mask = (pts[:, 1] >= y0) & (pts[:, 1] < y0 + band)
        if mask.sum() == 0:
            continue
        edge_x = int(pts[mask, 0].max()) if facing_left else int(pts[mask, 0].min())
        profile_edge.append((y0, edge_x))

    if not profile_edge:
        return max_y

    # Smooth the edge to reduce noise
    if len(profile_edge) > 4:
        smoothed = []
        for i in range(len(profile_edge)):
            window = profile_edge[max(0,i-2):i+3]
            avg_x = sum(p[1] for p in window) // len(window)
            smoothed.append((profile_edge[i][0], avg_x))
        profile_edge = smoothed

    # Find the last local maximum (chin) — scan from bottom up
    # looking for where edge protrudes then recedes (neck)
    best_chin_y = max_y
    for i in range(len(profile_edge) - 1, 0, -1):
        y0, ex = profile_edge[i]
        # Check if this is a local protrusion relative to points below it
        below = profile_edge[i+1:i+4] if i+1 < len(profile_edge) else []
        if not below:
            continue
        avg_below = sum(p[1] for p in below) / len(below)
        protrusion = (ex - avg_below) if facing_left else (avg_below - ex)
        if protrusion > drop_threshold:
            best_chin_y = y0 + band  # chin is just past this protrusion
            break

    return best_chin_y



@app.post("/detect-face-full")
async def detect_face_full(req: DetectRequest):
    """
    Combined face detection:
    - MediaPipe: keypoints (eyes, nose, mouth, ears) + bbox for horizontal bounds
    - Outline detection: foreheadTop and chinBottom from ink contour
    Returns both raw results and a combined 'faceBounds' ready for cropping.
    """
    if not req.init_image:
        return {"error": "no image"}
    try:
        raw = req.init_image.split(',', 1)[1] if ',' in req.init_image else req.init_image
        raw += '=' * (-len(raw) % 4)
        img_data = base64.b64decode(raw)
        img_pil = Image.open(io.BytesIO(img_data)).convert("RGB")
        W, H = img_pil.size
        img_cv2 = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)

        # ── MediaPipe ──────────────────────────────────────────────────────────
        import mediapipe as mp
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.array(img_pil))
        mp_result = mp_detector.detect(mp_image)

        mp_data = None
        if mp_result.detections:
            best = max(mp_result.detections,
                       key=lambda d: d.bounding_box.width * d.bounding_box.height)
            bb = best.bounding_box
            kps = best.keypoints
            keypoints = [{"x": float(kp.x), "y": float(kp.y)} for kp in kps] if kps else []
            mp_data = {
                "box": {
                    "x":  float(max(0, bb.origin_x / W)),
                    "y":  float(max(0, bb.origin_y / H)),
                    "x2": float(min(1, (bb.origin_x + bb.width) / W)),
                    "y2": float(min(1, (bb.origin_y + bb.height) / H)),
                },
                "keypoints": keypoints,
            }

        # ── Outline detection ─────────────────────────────────────────────────
        outline_data = None
        bbox_px, cnt = _find_face_contour_bbox(img_cv2)
        if bbox_px is not None:
            ox, oy, ow, oh = bbox_px
            chin_y = _find_chin_y(cnt, ox, ow, W)
            # Validity: face should be 10-55% of image in each dimension.
            # Larger detections are likely the background rectangle or full border.
            face_h_frac = (chin_y - oy) / H
            face_w_frac = ow / W
            if face_h_frac > 0.55 or face_w_frac > 0.55 or face_h_frac < 0.10 or face_w_frac < 0.10:
                print(f"[outline] Rejected invalid bbox: w={face_w_frac:.2f} h={face_h_frac:.2f}")
            else:
                print(f"[outline] Accepted: w={face_w_frac:.2f} h={face_h_frac:.2f} forehead={oy/H:.3f} chin={chin_y/H:.3f}")
                outline_data = {
                    "foreheadTop": float(oy / H),
                    "chinBottom":  float(chin_y / H),
                    "raw_bbox":    [ox/W, oy/H, ow/W, oh/H],
                }

        # ── Combined faceBounds ───────────────────────────────────────────────
        # Vertical: from outline (precise ink boundary)
        # Horizontal: from MediaPipe bbox (includes back of head)
        combined = None
        if mp_data and outline_data:
            foreheadTop_px = outline_data["foreheadTop"] * H
            chinBottom_px  = outline_data["chinBottom"]  * H
            box_x_px  = mp_data["box"]["x"]  * W
            box_x2_px = mp_data["box"]["x2"] * W
            combined = {
                "x":  float(box_x_px / W),
                "y":  float(foreheadTop_px / H),
                "x2": float(box_x2_px / W),
                "y2": float(chinBottom_px / H),
                "w":  float((box_x2_px - box_x_px) / W),
                "h":  float((chinBottom_px - foreheadTop_px) / H),
            }
        elif mp_data:
            combined = mp_data["box"]
            combined["w"] = combined["x2"] - combined["x"]
            combined["h"] = combined["y2"] - combined["y"]

        return {
            "mediapipe": mp_data,
            "outline":   outline_data,
            "faceBounds": combined,   # ready to use for cropping
        }

    except Exception as e:
        import traceback
        print(f"detect-face-full error: {e}\n{traceback.format_exc()}")
        return {"error": str(e)}


# ── Poisson face compositing ─────────────────────────────────────────────────
class CompositeFaceRequest(BaseModel):
    face_b64:     str   # base64 JPEG/PNG of color-corrected face (pasteS x pasteS)
    painting_b64: str   # base64 JPEG of full painting
    paste_x:      int   # top-left x of paste region on painting
    paste_y:      int   # top-left y of paste region on painting
    oval_rx:      float # oval x-radius as fraction of face width (default 0.42)
    oval_ry:      float # oval y-radius as fraction of face height (default 0.42)
    oval_cx:      float # oval center x as fraction of face width (default 0.50)
    oval_cy:      float # oval center y as fraction of face height (default 0.50)


@app.post("/composite-face")
async def composite_face(req: CompositeFaceRequest):
    """
    Poisson blending (seamlessClone) of a face crop onto a painting.
    Uses a hard oval mask — seamlessClone handles color/gradient matching internally,
    so the portrait background inside the oval gets blended into painting tones.
    """
    try:
        def decode_b64(s):
            raw = s.split(",", 1)[1] if "," in s else s
            raw += "=" * (-len(raw) % 4)
            return base64.b64decode(raw)

        face_data = decode_b64(req.face_b64)
        paint_data = decode_b64(req.painting_b64)

        face_arr  = cv2.imdecode(np.frombuffer(face_data,  np.uint8), cv2.IMREAD_COLOR)
        paint_arr = cv2.imdecode(np.frombuffer(paint_data, np.uint8), cv2.IMREAD_COLOR)

        if face_arr is None or paint_arr is None:
            return {"error": "failed to decode images"}

        fH, fW = face_arr.shape[:2]
        pH, pW = paint_arr.shape[:2]

        # Crop painting to just the paste region + padding for Poisson solver.
        # This constrains the solver to a small area, reducing color bleed artifacts.
        pad = max(fW, fH)
        rx1 = max(0, req.paste_x - pad)
        ry1 = max(0, req.paste_y - pad)
        rx2 = min(pW, req.paste_x + fW + pad)
        ry2 = min(pH, req.paste_y + fH + pad)
        patch = paint_arr[ry1:ry2, rx1:rx2].copy()

        # Adjust paste coordinates to patch-local space
        local_x = req.paste_x - rx1
        local_y = req.paste_y - ry1

        # Build hard oval mask (white inside, black outside)
        mask = np.zeros((fH, fW), dtype=np.uint8)
        mcx = int(fW * req.oval_cx)
        mcy = int(fH * req.oval_cy)
        mrx = int(fW * req.oval_rx)
        mry = int(fH * req.oval_ry)
        cv2.ellipse(mask, (mcx, mcy), (mrx, mry), 0, 0, 360, 255, -1)

        # seamlessClone center in patch-local space
        center = (local_x + fW // 2, local_y + fH // 2)
        patchH, patchW = patch.shape[:2]
        center = (
            max(fW // 2, min(patchW - fW // 2, center[0])),
            max(fH // 2, min(patchH - fH // 2, center[1])),
        )

        cloned_patch = cv2.seamlessClone(face_arr, patch, mask, center, cv2.NORMAL_CLONE)

        # Paste cloned patch back into full painting
        result = paint_arr.copy()
        result[ry1:ry2, rx1:rx2] = cloned_patch

        _, buf = cv2.imencode(".jpg", result, [cv2.IMWRITE_JPEG_QUALITY, 92])
        b64 = base64.b64encode(buf).decode()
        return {"outputB64": f"data:image/jpeg;base64,{b64}"}

    except Exception as e:
        import traceback
        print(f"composite-face error: {e}\n{traceback.format_exc()}")
        return {"error": str(e)}
