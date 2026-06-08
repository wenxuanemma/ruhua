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
