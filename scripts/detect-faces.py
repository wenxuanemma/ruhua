#!/usr/bin/env python3
# detect-faces.py
# Runs Grounding DINO locally (RTX 5070) to detect faces in painting images.
# Much faster and free compared to Replicate API.
#
# Setup (one time):
#   pip install torch torchvision transformers Pillow numpy
#
# Usage:
#   python scripts/detect-faces.py --image path/to/painting.jpg
#   python scripts/detect-faces.py --dir ./met-paintings/images/
#   python scripts/detect-faces.py --dir ./museum-paintings/cleveland/images/
#
# Output: prints JSON with detected face bounding boxes (normalized 0-1)

import argparse
import json
import sys
import os
from pathlib import Path

def load_model():
    from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
    import torch

    model_id = "IDEA-Research/grounding-dino-base"
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"  Using device: {device}", file=sys.stderr)

    processor = AutoProcessor.from_pretrained(model_id)
    model = AutoModelForZeroShotObjectDetection.from_pretrained(model_id).to(device)
    model.eval()
    return processor, model, device

def nms_boxes(boxes, iou_threshold=0.4):
    """Remove duplicate overlapping detections, keep highest-score box per cluster."""
    if not boxes:
        return boxes
    
    # Sort by score descending
    boxes = sorted(boxes, key=lambda b: b.get('score', 0), reverse=True)
    kept = []
    
    for box in boxes:
        overlap = False
        for kept_box in kept:
            # Compute IoU
            ix1 = max(box['x1'], kept_box['x1'])
            iy1 = max(box['y1'], kept_box['y1'])
            ix2 = min(box['x2'], kept_box['x2'])
            iy2 = min(box['y2'], kept_box['y2'])
            
            if ix2 <= ix1 or iy2 <= iy1:
                continue
            
            intersection = (ix2 - ix1) * (iy2 - iy1)
            area_a = (box['x2'] - box['x1']) * (box['y2'] - box['y1'])
            area_b = (kept_box['x2'] - kept_box['x1']) * (kept_box['y2'] - kept_box['y1'])
            iou = intersection / (area_a + area_b - intersection)
            
            if iou > iou_threshold:
                overlap = True
                break
        
        if not overlap:
            kept.append(box)
    
    return kept

def detect_faces(image_path, processor, model, device, threshold=0.15):
    from PIL import Image
    import torch

    image = Image.open(image_path).convert("RGB")
    W, H = image.size

    # Grounding DINO text queries — must end with period
    text = "human face. person head. face."

    inputs = processor(images=image, text=text, return_tensors="pt").to(device)

    with torch.no_grad():
        outputs = model(**inputs)

    # API changed in newer transformers versions — handle both signatures
    try:
        results = processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            box_threshold=threshold,
            text_threshold=0.20,
            target_sizes=[(H, W)],
        )[0]
    except TypeError:
        try:
            # Try without text_threshold
            results = processor.post_process_grounded_object_detection(
                outputs,
                inputs.input_ids,
                box_threshold=threshold,
                target_sizes=[(H, W)],
            )[0]
        except TypeError:
            # Oldest API
            results = processor.post_process_grounded_object_detection(
                outputs,
                threshold=threshold,
                target_sizes=[(H, W)],
            )[0]

    boxes = []
    for score, box in zip(results["scores"], results["boxes"]):
        x1, y1, x2, y2 = box.tolist()
        # Normalize to 0-1
        boxes.append({
            "x1": round(x1 / W, 4),
            "y1": round(y1 / H, 4),
            "x2": round(x2 / W, 4),
            "y2": round(y2 / H, 4),
            "score": round(float(score), 3),
            "w": round((x2 - x1) / W, 4),
            "h": round((y2 - y1) / H, 4),
            "img_w": W,
            "img_h": H,
        })

    # Sort by x position (left to right)
    boxes.sort(key=lambda b: b["x1"])
    
    # Apply NMS to remove duplicate detections of the same face
    raw_count = len(boxes)
    boxes = nms_boxes(boxes, iou_threshold=0.20)
    boxes.sort(key=lambda b: b["x1"])  # re-sort after NMS
    
    import sys
    print(f"  DEBUG: raw={raw_count} after_nms={len(boxes)}", file=sys.stderr)
    
    return boxes

def process_image(image_path, processor, model, device):
    path = Path(image_path)
    if not path.exists():
        return {"file": str(path), "error": "not found"}

    try:
        boxes = detect_faces(path, processor, model, device)
        # Filter: face must be at least 40px or 3% of image height
        useful = [b for b in boxes
                  if b["h"] * b["img_h"] >= 150  # passes if face >= 150px tall (absolute)
                  or (b["h"] * b["img_h"] >= 25 and b["h"] >= 0.02)]  # OR meets both criteria

        return {
            "file": str(path),
            "title": path.stem,
            "total_detected": len(boxes),
            "usable_faces": len(useful),
            "boxes": useful,
        }
    except Exception as e:
        return {"file": str(path), "error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="Detect faces in paintings using Grounding DINO")
    parser.add_argument("--image", help="Path to a single image")
    parser.add_argument("--dir", help="Directory of images to process")
    parser.add_argument("--output", help="Output JSON file (default: stdout)")
    parser.add_argument("--threshold", type=float, default=0.25,
                        help="Detection confidence threshold (default: 0.25)")
    args = parser.parse_args()

    if not args.image and not args.dir:
        parser.print_help()
        sys.exit(1)

    print("Loading Grounding DINO model...", file=sys.stderr)
    processor, model, device = load_model()
    print("Model loaded.\n", file=sys.stderr)

    results = []

    if args.image:
        result = process_image(args.image, processor, model, device)
        results.append(result)
        print(f"  {result['file']}: {result.get('usable_faces', 0)} usable faces",
              file=sys.stderr)

    elif args.dir:
        img_dir = Path(args.dir)
        extensions = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
        images = sorted([f for f in img_dir.iterdir()
                        if f.suffix.lower() in extensions])

        print(f"Processing {len(images)} images in {img_dir}...\n", file=sys.stderr)

        passed = 0
        for i, img_path in enumerate(images):
            sys.stderr.write(f"  [{i+1}/{len(images)}] {img_path.name[:60].ljust(60)} ... ")
            sys.stderr.flush()

            result = process_image(img_path, processor, model, device)
            results.append(result)

            n = result.get("usable_faces", 0)
            if n > 0:
                sys.stderr.write(f"✅ {n} face(s)\n")
                passed += 1
            elif "error" in result:
                sys.stderr.write(f"❌ {result['error']}\n")
            else:
                sys.stderr.write(f"— none detected\n")

        print(f"\n  Passed: {passed}/{len(images)}", file=sys.stderr)

    output = json.dumps(results, indent=2)

    if args.output:
        Path(args.output).write_text(output)
        print(f"\nResults saved to {args.output}", file=sys.stderr)
    else:
        print(output)

if __name__ == "__main__":
    main()
