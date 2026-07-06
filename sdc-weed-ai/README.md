# Chaman Weed AI

Microservicio experimental para inferencia de malezas por imagen.

## Endpoints

- `GET /health`
- `POST /weed-detection/analyze`

## Variables

- `WEED_YOLO_MODEL_PATH`: ruta al modelo YOLO entrenado.
- `WEED_YOLO_MODEL_VERSION`: version visible en la respuesta.
- `WEED_YOLO_MOCK`: si es `true`, usa inferencia mockeada.
- `WEED_YOLO_CLASSES`: clases separadas por coma.

Clases iniciales: `cultivo`, `maleza_generica`, `suelo`, `amaranthus`, `rama_negra`, `eleusine`.
