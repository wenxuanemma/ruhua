#!/usr/bin/env python3
# crop-faces.py
import json
import os
import sys
from PIL import Image, ImageOps

FILTERED_META          = './museum-paintings/filtered-metadata.json'
CORRECTIONS            = './museum-paintings/face-corrections.json'
CROPS_DIR              = './face-crops'
CROP_SIZE              = 512
PAD_FACTOR             = 1.35
MIN_CROP_PX            = 80
MIN_FACE_FRAC          = 0.02
MAX_FACE_SIZE          = 0.80
MAX_FACE_ASPECT        = 2.5
IOU_THRESHOLD          = 0.25
MAX_FACES_PER_PAINTING = 10
TRIGGER_WORD           = 'gongbi_portrait'

BLOCKED_TITLE_KEYWORDS = [
    'horse', 'bird', 'cat', 'dog', 'ox', 'deer', 'fish', 'goose', 'duck',
    'crane', 'eagle', 'tiger', 'lion', 'dragon', 'phoenix', 'rabbit', 'monkey',
    'frog', 'toad', 'insect', 'butterfly', 'bat', 'snake', 'turtle',
    '马', '牛', '鹿', '鸟', '鹤', '鱼', '猫', '貓', '狗', '虎', '鸡', '鹅',
    '猴', '獼', '兔', '豹', '象', '獸', '禽', '兽', '犬', '驴', '羊', '熊',
    '孔雀', '鹦鹉', '鸳鸯', '鴛', '蛙', '蟾', '蝶', '蝙蝠', '蛇', '龟',
    'bamboo', 'landscape', 'mountain', 'river', 'flower', 'lotus',
    '竹', '梅', '菊', '兰', '荷', '松', '山', '水',
    'chariot', 'carriage', 'cart', 'vehicle', 'palanquin',
    '车', '輦', '辇', '轿', '舆',
]

IMG_DIRS = [
    './wikimedia-paintings/images',
    './met-paintings/images',
    './museum-paintings/cleveland/images',
    './museum-paintings/smithsonian/images',
]


def is_blocked_painting(title):
    title_lower = title.lower()
    return any(k.lower() in title_lower for k in BLOCKED_TITLE_KEYWORDS)


def boxes_iou(a, b):
    ax1, ay1 = a['x'], a['y']
    ax2, ay2 = a['x'] + a['w'], a['y'] + a['h']
    bx1, by1 = b['x'], b['y']
    bx2, by2 = b['x'] + b['w'], b['y'] + b['h']
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = a['w'] * a['h']
    area_b = b['w'] * b['h']
    return inter / (area_a + area_b - inter)


def nms_faces(faces):
    sorted_faces = sorted(faces, key=lambda f: f['w'] * f['h'])
    kept = []
    for face in sorted_faces:
        if all(boxes_iou(face, k) < IOU_THRESHOLD for k in kept):
            kept.append(face)
    return kept


def suppress_stacked_duplicates(faces):
    to_remove = set()
    for i in range(len(faces)):
        for j in range(i + 1, len(faces)):
            if i in to_remove or j in to_remove:
                continue
            a, b = faces[i], faces[j]
            if a['y'] <= b['y']:
                upper, lower, upper_idx = a, b, i
            else:
                upper, lower, upper_idx = b, a, j
            u_cx = upper['x'] + upper['w'] / 2
            l_cx = lower['x'] + lower['w'] / 2
            combined_half_w = (upper['w'] + lower['w']) / 2
            if abs(u_cx - l_cx) > combined_half_w:
                continue
            upper_bottom = upper['y'] + upper['h']
            gap = lower['y'] - upper_bottom
            smaller_h = min(upper['h'], lower['h'])
            if gap < smaller_h:
                to_remove.add(upper_idx)
    return [f for i, f in enumerate(faces) if i not in to_remove]


def resolve_local_file(painting):
    local = painting.get('localFile')
    if local and os.path.exists(local):
        return local
    pid = str(painting.get('id', ''))
    if not pid:
        return None
    for img_dir in IMG_DIRS:
        if not os.path.exists(img_dir):
            continue
        for fname in os.listdir(img_dir):
            if fname.startswith(pid + '_') or fname.startswith(pid + '.'):
                return os.path.join(img_dir, fname)
    return None


def load_corrections():
    if not os.path.exists(CORRECTIONS):
        return {}
    if not os.path.getsize(CORRECTIONS):
        return {}
    with open(CORRECTIONS, encoding='utf-8') as f:
        data = json.load(f)
    # Normalise to {title: {mode, faces}} regardless of input format
    if isinstance(data, list):
        result = {}
        for entry in data:
            for face in entry.get('faces', []):
                face['_manual'] = True
            result[entry['title']] = {'mode': entry.get('mode', 'replace'), 'faces': entry.get('faces', [])}
        data = result
    elif isinstance(data, dict) and 'corrections' in data:
        result = {}
        for entry in data['corrections']:
            for face in entry.get('faces', []):
                face['_manual'] = True
            result[entry['title']] = {'mode': entry.get('mode', 'replace'), 'faces': entry.get('faces', [])}
        data = result
    else:
        # Already {title: {mode, faces}} format — tag faces as manual
        for title, entry in data.items():
            if title.startswith("_"): continue
            for face in entry.get('faces', []):
                face['_manual'] = True
    print(f'  Loaded corrections for {len(data)} painting(s): {CORRECTIONS}')
    return data


def infer_dynasty(title):
    tl = title.lower()
    if '唐' in title or 'tang' in tl:              return 'Tang'
    if '五代' in title or 'five dynasties' in tl:  return 'Five Dynasties'
    if '宋' in title or 'song' in tl:              return 'Song'
    if '辽' in title or 'liao' in tl:              return 'Liao'
    if '金' in title or 'jin dynasty' in tl:       return 'Jin'
    if '元' in title or 'yuan' in tl:              return 'Yuan'
    return 'Tang or Song'


def make_caption(painting, face_idx, total_faces):
    title   = painting.get('title', '')
    dynasty = painting.get('dynasty', '') or infer_dynasty(title)
    dl = dynasty.lower()
    if any(d in dl for d in ['tang', '唐']):
        style = 'Tang dynasty Chinese court painting style'
        palette = 'warm ochre and vermillion mineral pigments'
        technique = 'gongbi fine brushwork on silk'
    elif any(d in dl for d in ['five dynasties', '五代']):
        style = 'Five Dynasties period Chinese court painting style'
        palette = 'muted ochre and umber mineral pigments on aged silk'
        technique = 'gongbi fine brushwork'
    elif any(d in dl for d in ['song', '宋']):
        style = 'Song dynasty Chinese painting style'
        palette = 'subdued ink and mineral pigment tones'
        technique = 'gongbi or mogu brushwork on silk'
    else:
        style = 'classical Chinese court painting style'
        palette = 'warm mineral pigments on aged silk'
        technique = 'gongbi fine brushwork'
    return (
        f'{TRIGGER_WORD}, a portrait in {style}, '
        f'flat matte skin with {palette}, '
        f'no photographic texture or subsurface scattering, '
        f'no specular highlights, even ambient lighting, '
        f'{technique}, painted figure on silk handscroll, '
        f'traditional Chinese figure painting'
    )


def crop_face(img, face, all_faces=None, pad_factor=PAD_FACTOR):
    W, H = img.size
    fx = face['x'] * W
    fy = face['y'] * H
    fw = face['w'] * W
    fh = face['h'] * H
    manual = face.get('_manual', False)

    if not manual:
        if fw < W * MIN_FACE_FRAC:
            return None, 'tiny'
        if fw > W * MAX_FACE_SIZE:
            return None, 'oversized'
        aspect = fh / fw if fw > 5 else 1.0
        if aspect > MAX_FACE_ASPECT:
            return None, f'aspect={aspect:.2f}'

    cx = fx + fw / 2
    cy = fy + fh / 2
    half = fw * pad_factor / 2

    if half * 2 < MIN_CROP_PX:
        return None, f'small_pre({half*2:.0f}px)'

    # Neighbor-aware padding
    if all_faces:
        for other in all_faces:
            if other is face:
                continue
            ocx = (other['x'] + other['w'] / 2) * W
            ocy = (other['y'] + other['h'] / 2) * H
            dx = abs(ocx - cx)
            dy = abs(ocy - cy)
            if dx < half and dy < half:
                safe_half = max(dx, dy) * 0.90
                half = min(half, safe_half)

    if half * 2 < MIN_CROP_PX:
        return None, f'small_post({half*2:.0f}px)'

    x1, y1, x2, y2 = cx - half, cy - half, cx + half, cy + half

    if x1 < 0 or y1 < 0 or x2 > W or y2 > H:
        pad_left   = max(0, -int(x1))
        pad_top    = max(0, -int(y1))
        pad_right  = max(0, int(x2) - W)
        pad_bottom = max(0, int(y2) - H)
        img_padded = ImageOps.expand(img, (pad_left, pad_top, pad_right, pad_bottom), fill=0)
        x1 += pad_left; y1 += pad_top
        x2 += pad_left; y2 += pad_top
    else:
        img_padded = img

    crop = img_padded.crop((int(x1), int(y1), int(x2), int(y2)))
    crop = crop.resize((CROP_SIZE, CROP_SIZE), Image.LANCZOS)
    return crop, None


def main():
    if not os.path.exists(FILTERED_META):
        print(f'❌ {FILTERED_META} not found. Run filter-faces.mjs first.')
        sys.exit(1)

    with open(FILTERED_META) as f:
        data = json.load(f)

    passed = data.get('passed', [])
    corrections = load_corrections()
    print(f'🎨 Face Crop Extractor')
    print(f'   {len(passed)} paintings to process → {CROPS_DIR}/\n')

    os.makedirs(CROPS_DIR, exist_ok=True)
    manifest = []
    total_crops = skipped_crops = errors = 0

    for p_idx, painting in enumerate(passed):
        local_file = resolve_local_file(painting)
        faces = list(painting.get('faces', []))

        if not local_file or not os.path.exists(local_file):
            print(f'  [{p_idx+1}/{len(passed)}] ⚠️  No local file: {painting.get("title","?")[:50]}')
            continue
        if not faces:
            continue

        title = painting.get('title', '')

        # Apply corrections
        if title in corrections:
            entry = corrections[title]
            mode  = entry.get('mode', 'replace')
            manual_faces = entry.get('faces', [])
            faces = manual_faces if mode == 'replace' else faces + manual_faces

        if is_blocked_painting(title):
            sys.stdout.write(f'  [{p_idx+1}/{len(passed)}] {title[:50].ljust(50)} ')
            print('⏭  blocked title')
            continue

        faces = nms_faces(faces)
        faces = suppress_stacked_duplicates(faces)

        if len(faces) > MAX_FACES_PER_PAINTING:
            sys.stdout.write(f'  [{p_idx+1}/{len(passed)}] {title[:50].ljust(50)} ')
            print(f'⏭  crowd ({len(faces)} faces)')
            skipped_crops += len(faces)
            continue

        safe_id = str(painting.get('id', p_idx)).replace('/', '_').replace(' ', '_')[:30]
        sys.stdout.write(f'  [{p_idx+1}/{len(passed)}] {title[:50].ljust(50)} ')
        sys.stdout.flush()

        try:
            img = Image.open(local_file).convert('RGB')
        except Exception as e:
            print(f'❌ {e}')
            errors += 1
            continue

        crops_this = 0
        skip_reasons = {}
        for f_idx, face in enumerate(faces):
            try:
                crop, reason = crop_face(img, face, all_faces=faces)
                if crop is None:
                    skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                    skipped_crops += 1
                    continue

                crop_name = f'{safe_id}_{f_idx:02d}'
                img_path  = os.path.join(CROPS_DIR, f'{crop_name}.jpg')
                txt_path  = os.path.join(CROPS_DIR, f'{crop_name}.txt')
                crop.save(img_path, 'JPEG', quality=95)
                caption = make_caption(painting, f_idx, len(faces))
                with open(txt_path, 'w', encoding='utf-8') as cf:
                    cf.write(caption)
                manifest.append({
                    'crop_file': img_path, 'caption_file': txt_path,
                    'caption': caption, 'source_painting': title,
                    'source_file': local_file, 'dynasty': painting.get('dynasty', ''),
                    'face_idx': f_idx, 'face_box': face,
                })
                crops_this += 1
                total_crops += 1
            except Exception as e:
                print(f'\n    ⚠️  face {f_idx}: {e}')
                skipped_crops += 1

        if crops_this == 0 and skip_reasons:
            print(f'⚠️  0 crops [{", ".join(f"{r}×{n}" for r,n in sorted(skip_reasons.items()))}]')
        else:
            print(f'✅ {crops_this} crops')

    manifest_path = os.path.join(CROPS_DIR, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f'\n{"═"*55}')
    print(f'✅ Total crops:   {total_crops}')
    print(f'⚠️  Skipped:       {skipped_crops}')
    print(f'❌ Errors:        {errors}')
    print(f'\n📁 Crops: {CROPS_DIR}/')
    print(f'📄 Manifest: {manifest_path}')

if __name__ == '__main__':
    main()
