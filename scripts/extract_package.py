#!/usr/bin/env python3
"""Extract the four TypeScript deliverables from the grand_choreographer_package.md
into src/lib/ — zero manual transcription errors."""
import re
import os

SRC = "/home/z/my-project/.ref/grand_choreographer/grand_choreographer_package.md"
OUT_DIR = "/home/z/my-project/src/lib"

with open(SRC, "r", encoding="utf-8") as f:
    md = f.read()

def extract_section(header_re: str) -> str:
    """Return the first ```ts fenced block after the given header regex."""
    m = re.search(header_re, md, re.MULTILINE)
    if not m:
        raise SystemExit(f"Header not found: {header_re}")
    rest = md[m.end():]
    fm = re.search(r"```ts\n(.*?)\n```", rest, re.DOTALL)
    if not fm:
        raise SystemExit(f"Code fence not found after {header_re}")
    return fm.group(1) + "\n"

targets = {
    "danceMoves.ts": r"^## 1\. ",
    "choreographer.ts": r"^## 2\. ",
    "cameraShots.ts": r"^## 3\. ",
    "danceStyleMapping.ts": r"^### 4a\. ",
}

os.makedirs(OUT_DIR, exist_ok=True)
for fname, hdr in targets.items():
    code = extract_section(hdr)
    path = os.path.join(OUT_DIR, fname)
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    lines = code.count("\n") + 1
    print(f"WROTE {path}  ({lines} lines, {len(code)} bytes)")

# Quick sanity checks
dm = open(os.path.join(OUT_DIR, "danceMoves.ts")).read()
assert dm.count("id: '") >= 40, "Expected at least 40 moves"
assert "PELVIS_REST_Y" in dm
ch = open(os.path.join(OUT_DIR, "choreographer.ts")).read()
assert "createChoreographer" in ch and "mulberry" not in ch.lower().replace("mulberry32 prng", "")
cs = open(os.path.join(OUT_DIR, "cameraShots.ts")).read()
assert "createCameraSequencer" in cs
print("SANITY CHECKS PASSED")
