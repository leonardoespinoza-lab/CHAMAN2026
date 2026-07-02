#!/usr/bin/env python3
import argparse
import json
import re
import urllib.request
from pathlib import Path


def is_argentina_pair(value):
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(isinstance(item, (int, float)) for item in value)
        and -56 <= value[0] <= -21
        and -74 <= value[1] <= -53
    )


def is_feature(node):
    return (
        isinstance(node, list)
        and len(node) >= 6
        and isinstance(node[0], str)
        and isinstance(node[1], list)
        and node[1]
        and isinstance(node[1][0], list)
        and node[1][0]
        and is_argentina_pair(node[1][0][0])
    )


def walk_features(node, features):
    if is_feature(node):
        features.append(node)
        return
    if isinstance(node, list):
        for child in node:
            walk_features(child, features)


def read_html(args):
    if args.html:
        return Path(args.html).read_text(encoding="utf-8", errors="replace")
    if not args.mid:
        raise ValueError("Debe indicar --mid o --html")
    url = f"https://www.google.com/maps/d/u/0/viewer?mid={args.mid}"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def extract_points(html):
    match = re.search(r'var _pageData = "(.*?)";\s*</script>', html, re.S)
    if not match:
        raise ValueError("No se encontro _pageData en el HTML de My Maps")
    decoded = json.loads('"' + match.group(1) + '"')
    page_data = json.loads(decoded)
    features = []
    walk_features(page_data, features)

    points = []
    for feature in features:
        lat, lon = feature[1][0][0]
        attrs = {}
        extended = feature[5] if len(feature) > 5 else None
        data_rows = (
            extended[3]
            if isinstance(extended, list)
            and len(extended) > 3
            and isinstance(extended[3], list)
            else []
        )
        for attr in data_rows:
            if not (isinstance(attr, list) and len(attr) >= 2):
                continue
            values = attr[1]
            attrs[attr[0]] = values[0] if isinstance(values, list) and values else ""
        points.append(
            {
                "mymaps_id": feature[0],
                "lat": lat,
                "lon": lon,
                "distribuidor": attrs.get("unnamed (2)", ""),
                "domicilio": attrs.get("unnamed (3)", ""),
                "localidad": attrs.get("unnamed (4)", ""),
                "provincia": attrs.get("unnamed (5)", ""),
            }
        )
    return points


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mid", default="")
    parser.add_argument("--html", default="")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    html = read_html(args)
    points = extract_points(html)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(points, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"points": len(points), "output": str(output_path)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
