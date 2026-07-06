import base64
import io
import os
from dataclasses import dataclass
from typing import Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageFont

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover - optional runtime dependency
    YOLO = None


MODEL_VERSION = os.getenv("WEED_YOLO_MODEL_VERSION", "weed-yolo-v0.1")
MODEL_PATH = os.getenv("WEED_YOLO_MODEL_PATH", "")
FORCE_MOCK = os.getenv("WEED_YOLO_MOCK", "false").lower() == "true"
CLASS_NAMES = [
    item.strip()
    for item in os.getenv(
        "WEED_YOLO_CLASSES",
        "cultivo,maleza_generica,suelo,amaranthus,rama_negra,eleusine",
    ).split(",")
    if item.strip()
]

app = FastAPI(title="Chaman Weed AI", version=MODEL_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@dataclass
class Detection:
    class_name: str
    confidence: float
    bbox: Dict[str, int]


_model = None


def get_model():
    global _model
    if FORCE_MOCK or not MODEL_PATH or YOLO is None:
        return None
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            return None
        _model = YOLO(MODEL_PATH)
    return _model


def safe_class_name(class_id: int, names: Optional[Dict[int, str]] = None) -> str:
    if names and class_id in names:
        return str(names[class_id])
    if 0 <= class_id < len(CLASS_NAMES):
        return CLASS_NAMES[class_id]
    return "maleza_generica"


def mock_detections(width: int, height: int) -> List[Detection]:
    x1 = max(8, int(width * 0.42))
    y1 = max(8, int(height * 0.35))
    x2 = min(width - 8, int(width * 0.62))
    y2 = min(height - 8, int(height * 0.68))
    return [
        Detection(
            class_name="maleza_generica",
            confidence=0.62,
            bbox={"x1": x1, "y1": y1, "x2": x2, "y2": y2},
        )
    ]


def yolo_detections(image: Image.Image) -> List[Detection]:
    model = get_model()
    if model is None:
        return mock_detections(image.width, image.height)

    results = model.predict(image, verbose=False)
    detections: List[Detection] = []
    for result in results:
        names = getattr(result, "names", None)
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            continue
        for box in boxes:
            xyxy = box.xyxy[0].tolist()
            class_id = int(box.cls[0].item())
            confidence = float(box.conf[0].item())
            detections.append(
                Detection(
                    class_name=safe_class_name(class_id, names),
                    confidence=round(confidence, 4),
                    bbox={
                        "x1": int(round(xyxy[0])),
                        "y1": int(round(xyxy[1])),
                        "x2": int(round(xyxy[2])),
                        "y2": int(round(xyxy[3])),
                    },
                )
            )
    return detections


def draw_processed_image(image: Image.Image, detections: List[Detection]) -> str:
    annotated = image.convert("RGB").copy()
    draw = ImageDraw.Draw(annotated, "RGBA")
    font = ImageFont.load_default()
    for det in detections:
        bbox = det.bbox
        label = f"{det.class_name} {det.confidence:.2f}"
        draw.rectangle(
            [bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]],
            outline=(0, 210, 180, 255),
            width=4,
        )
        text_box = draw.textbbox((bbox["x1"], bbox["y1"]), label, font=font)
        draw.rectangle(
            [text_box[0] - 4, text_box[1] - 4, text_box[2] + 4, text_box[3] + 4],
            fill=(0, 35, 40, 190),
        )
        draw.text((bbox["x1"], bbox["y1"]), label, fill=(255, 255, 255), font=font)

    buffer = io.BytesIO()
    annotated.save(buffer, format="JPEG", quality=88)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


@app.get("/health")
def health():
    model = get_model()
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "mode": "yolo" if model else "mock",
        "model_path": MODEL_PATH or None,
        "classes": CLASS_NAMES,
    }


@app.post("/weed-detection/analyze")
async def analyze(
    image: UploadFile = File(...),
    lote_id: Optional[str] = Form(None),
    ensayo_id: Optional[str] = Form(None),
    cultivo: Optional[str] = Form(None),
    fecha: Optional[str] = Form(None),
    campania: Optional[str] = Form(None),
):
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")

    content = await image.read()
    try:
        pil_image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Imagen invalida") from exc

    detections = yolo_detections(pil_image)
    detected_classes = sorted({det.class_name for det in detections})
    max_confidence = max([det.confidence for det in detections], default=0)
    processed_image_base64 = draw_processed_image(pil_image, detections)

    return {
        "status": "ok",
        "model_version": MODEL_VERSION if get_model() else f"{MODEL_VERSION}-mock",
        "metadata": {
            "lote_id": lote_id,
            "ensayo_id": ensayo_id,
            "cultivo": cultivo,
            "fecha": fecha,
            "campania": campania,
        },
        "detections": [
            {
                "class": det.class_name,
                "confidence": det.confidence,
                "bbox": det.bbox,
            }
            for det in detections
        ],
        "summary": {
            "total_detections": len(detections),
            "weed_detected": any(det.class_name != "cultivo" for det in detections),
            "classes_detected": detected_classes,
            "max_confidence": round(max_confidence, 4),
        },
        "processed_image_base64": processed_image_base64,
    }
