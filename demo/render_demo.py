from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "skill" / "codex-task-control" / "scripts" / "task-control.mjs"
MEDIA = ROOT / "media"
WIDTH, HEIGHT = 1280, 720
FPS = 12
DURATION = 19

BG = "#070b16"
PANEL = "#0e1628"
PANEL_EDGE = "#263451"
TEXT = "#dce7ff"
MUTED = "#8090ad"
GREEN = "#55d6a2"
CYAN = "#70c7ff"
AMBER = "#ffc857"
PURPLE = "#b89cff"


def run_cli(codex_home: Path, *args: str) -> str:
    result = subprocess.run(
        ["node", str(CLI), *args, "--codex-home", str(codex_home)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def run_real_scenario() -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="codex-task-control-demo-") as raw_home:
        home = Path(raw_home)
        project = r"C:\work\demo-project"
        controller = "controller-1"
        worker = "worker-1"

        run_cli(
            home,
            "register",
            "--project-root",
            project,
            "--controller",
            controller,
            "--thread",
            worker,
            "--parent",
            controller,
            "--title",
            "Audit authentication flow",
            "--model",
            "gpt-5.6-terra",
            "--thinking",
            "low",
        )
        executing = json.loads(run_cli(home, "query-self", "--self", worker))
        event_path = run_cli(
            home,
            "complete",
            "--self",
            worker,
            "--candidate-commit",
            "candidate-auth-v1",
        )
        run_cli(
            home,
            "controller-ingest-completion",
            "--project-root",
            project,
            "--controller",
            controller,
            "--event",
            event_path,
        )
        awaiting_review = json.loads(run_cli(home, "query-self", "--self", worker))
        run_cli(
            home,
            "mark-accepted",
            "--project-root",
            project,
            "--controller",
            controller,
            "--thread",
            worker,
        )
        run_cli(
            home,
            "mark-integrated",
            "--project-root",
            project,
            "--controller",
            controller,
            "--thread",
            worker,
        )
        integrated = json.loads(run_cli(home, "query-self", "--self", worker))

        return {
            "executing": executing,
            "awaiting_review": awaiting_review,
            "integrated": integrated,
            "event_name": Path(event_path).name,
        }


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path(r"C:\Windows\Fonts\CascadiaMono.ttf"),
        Path(r"C:\Windows\Fonts\consolab.ttf" if bold else r"C:\Windows\Fonts\consola.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


FONT = load_font(24)
FONT_SMALL = load_font(19)
FONT_TINY = load_font(16)
FONT_TITLE = load_font(32, bold=True)


SCENES = [
    {
        "start": 0.0,
        "end": 3.4,
        "label": "01  REGISTER WORKER",
        "command": "$ task-control register --thread worker-1 --model gpt-5.6-terra --thinking low",
        "output": [
            ("✓ registered", GREEN),
            ("parent: controller-1", MUTED),
            ("status: executing", CYAN),
        ],
    },
    {
        "start": 3.4,
        "end": 6.7,
        "label": "02  VERIFY ASSIGNMENT",
        "command": "$ task-control query-self --self worker-1",
        "output": [
            ('"model": "gpt-5.6-terra"', PURPLE),
            ('"thinking": "low"', AMBER),
            ('"status": "executing"', CYAN),
        ],
    },
    {
        "start": 6.7,
        "end": 10.0,
        "label": "03  SUBMIT CANDIDATE",
        "command": "$ task-control complete --self worker-1 --candidate-commit candidate-auth-v1",
        "output": [
            ("✓ completion event created", GREEN),
            ("candidate: candidate-auth-v1", TEXT),
            ("worker cannot accept its own result", AMBER),
        ],
    },
    {
        "start": 10.0,
        "end": 13.5,
        "label": "04  CONTROLLER REVIEW GATE",
        "command": "$ controller ingest completion-001.json",
        "output": [
            ("✓ identity + parent + freshness verified", GREEN),
            ('"status": "awaiting_review"', CYAN),
            ("controller decision required", AMBER),
        ],
    },
    {
        "start": 13.5,
        "end": 19.0,
        "label": "05  ACCEPT + INTEGRATE",
        "command": "$ controller accept worker-1 && controller integrate worker-1",
        "output": [
            ('"threadId": "worker-1"', TEXT),
            ('"model": "gpt-5.6-terra"', PURPLE),
            ('"status": "integrated"', GREEN),
            ("✓ auditable lifecycle complete", GREEN),
        ],
    },
]


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def fit_text(text: str, font: ImageFont.ImageFont, max_width: int) -> str:
    if font.getlength(text) <= max_width:
        return text
    suffix = "…"
    while text and font.getlength(text + suffix) > max_width:
        text = text[:-1]
    return text + suffix


def active_scene(t: float) -> dict[str, object]:
    for scene in SCENES:
        if scene["start"] <= t < scene["end"]:
            return scene
    return SCENES[-1]


def render_frame(t: float) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)

    draw.text((60, 28), "CODEX TASK CONTROL", font=FONT_TITLE, fill=TEXT)
    draw.text((WIDTH - 60, 40), "REAL CLI · ISOLATED LEDGER", font=FONT_TINY, fill=GREEN, anchor="ra")

    rounded(draw, (54, 82, WIDTH - 54, HEIGHT - 72), 20, PANEL, PANEL_EDGE, 2)
    draw.ellipse((82, 106, 96, 120), fill="#ff6b6b")
    draw.ellipse((104, 106, 118, 120), fill="#ffd166")
    draw.ellipse((126, 106, 140, 120), fill="#55d6a2")
    draw.text((160, 103), "codex-task-control / demo", font=FONT_TINY, fill=MUTED)
    draw.line((78, 140, WIDTH - 78, 140), fill=PANEL_EDGE, width=1)

    scene = active_scene(t)
    local = max(0.0, t - float(scene["start"]))
    label = str(scene["label"])
    command = str(scene["command"])
    output = list(scene["output"])

    draw.text((88, 166), label, font=FONT_SMALL, fill=CYAN)

    typed_chars = min(len(command), max(0, int((local - 0.25) * 46)))
    visible_command = command[:typed_chars]
    draw.text((88, 214), fit_text(visible_command, FONT, WIDTH - 176), font=FONT, fill=TEXT)
    if typed_chars < len(command) or int(t * 2) % 2 == 0:
        cursor_x = 88 + FONT.getlength(fit_text(visible_command, FONT, WIDTH - 176))
        draw.rectangle((cursor_x + 3, 218, cursor_x + 13, 244), fill=GREEN)

    output_start = 1.25 + len(command) / 90
    for index, (line, color) in enumerate(output):
        reveal = local - output_start - index * 0.38
        if reveal <= 0:
            continue
        alpha = min(1.0, reveal / 0.25)
        mixed = tuple(
            round(int(PANEL[i : i + 2], 16) * (1 - alpha) + int(color[i : i + 2], 16) * alpha)
            for i in (1, 3, 5)
        )
        draw.text((110, 280 + index * 48), line, font=FONT, fill=mixed)

    progress = min(1.0, t / DURATION)
    draw.rounded_rectangle((88, HEIGHT - 118, WIDTH - 88, HEIGHT - 110), radius=4, fill="#1c2942")
    draw.rounded_rectangle((88, HEIGHT - 118, 88 + int((WIDTH - 176) * progress), HEIGHT - 110), radius=4, fill=GREEN)

    chips = [
        ("MODEL RECORDED", PURPLE),
        ("REVIEW GATED", AMBER),
        ("PROVIDER CALLS: 0", GREEN),
    ]
    x = 88
    for text, color in chips:
        chip_width = int(FONT_TINY.getlength(text)) + 30
        rounded(draw, (x, HEIGHT - 96, x + chip_width, HEIGHT - 64), 10, "#121e34", color, 1)
        draw.text((x + 15, HEIGHT - 89), text, font=FONT_TINY, fill=color)
        x += chip_width + 12

    draw.text((WIDTH - 88, HEIGHT - 84), "github.com/faizlee/codex-task-control", font=FONT_TINY, fill=MUTED, anchor="ra")

    if t > 17.0:
        strength = min(1.0, (t - 17.0) / 0.6)
        overlay = Image.new("RGBA", (WIDTH, HEIGHT), (7, 11, 22, round(225 * strength)))
        image = Image.alpha_composite(image.convert("RGBA"), overlay)
        draw = ImageDraw.Draw(image)
        rounded(draw, (190, 215, WIDTH - 190, 475), 24, PANEL, PANEL_EDGE, 2)
        draw.text((WIDTH // 2, 290), "CONTROL THE WORK. NOT JUST THE PROMPT.", font=FONT_TITLE, fill=TEXT, anchor="mm")
        draw.text((WIDTH // 2, 355), "Open source · Windows-first v0.1", font=FONT, fill=GREEN, anchor="mm")
        draw.text((WIDTH // 2, 415), "github.com/faizlee/codex-task-control", font=FONT_SMALL, fill=CYAN, anchor="mm")
        image = image.convert("RGB")

    return image


def render_video(mp4_path: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")
    command = [
        ffmpeg,
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{WIDTH}x{HEIGHT}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(mp4_path),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    for frame_number in range(DURATION * FPS):
        frame = render_frame(frame_number / FPS)
        process.stdin.write(frame.tobytes())
    process.stdin.close()
    if process.wait() != 0:
        raise RuntimeError("ffmpeg MP4 render failed")


def render_gif(mp4_path: Path, gif_path: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")
    filter_graph = (
        "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];"
        "[s0]palettegen=max_colors=128[p];"
        "[s1][p]paletteuse=dither=bayer:bayer_scale=4"
    )
    subprocess.run(
        [ffmpeg, "-y", "-i", str(mp4_path), "-filter_complex", filter_graph, "-loop", "0", str(gif_path)],
        check=True,
    )


def main() -> None:
    scenario = run_real_scenario()
    assert scenario["executing"]["status"] == "executing"
    assert scenario["awaiting_review"]["status"] == "awaiting_review"
    assert scenario["integrated"]["status"] == "integrated"

    MEDIA.mkdir(parents=True, exist_ok=True)
    mp4_path = MEDIA / "codex-task-control-demo.mp4"
    gif_path = MEDIA / "codex-task-control-demo.gif"
    render_video(mp4_path)
    render_gif(mp4_path, gif_path)
    print(json.dumps({"scenario": scenario, "mp4": str(mp4_path), "gif": str(gif_path)}, indent=2))


if __name__ == "__main__":
    main()
