from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "skill" / "codex-task-control" / "scripts" / "task-control.mjs"
MEDIA = ROOT / "media"
SOURCE_WIDTH, SOURCE_HEIGHT = 720, 1280
OUTPUT_WIDTH, OUTPUT_HEIGHT = 1080, 1920
FPS = 20

BG = "#060913"
PANEL = "#10182a"
PANEL_2 = "#151f35"
EDGE = "#283956"
TEXT = "#f2f6ff"
MUTED = "#8999b5"
GREEN = "#59e3a7"
CYAN = "#72d5ff"
AMBER = "#ffca63"
RED = "#ff6b7a"
PURPLE = "#b99cff"


@dataclass
class Scene:
    voice: str
    headline: str
    caption: str
    visual: str
    start: float = 0.0
    end: float = 0.0


SCENES = [
    Scene(
        "兄弟们，GPT 五点六是真好用，但这个额度掉得也太吓人了。",
        "GPT-5.6 是真好用",
        "但这个额度掉得也太吓人了",
        "quota",
    ),
    Scene(
        "我用的是 Pro，甚至二十倍都感觉不太够。最难受的是，找文件、跑测试、改几个格式，这些简单操作居然也在用最好的模型。",
        "我 Pro，20× 也不够用",
        "最好的模型，居然在干这些杂活",
        "chores",
    ),
    Scene(
        "后来我就一直在想，能不能让最前沿的模型只负责当大脑？让它理解需求、拆任务、把握方向，确保整个事情不会跑偏。",
        "后来我换了个思路",
        "让最强模型只负责当大脑",
        "brain",
    ),
    Scene(
        "搜索文件、批量修改、跑命令、跑测试这些简单活，就分给简单一点的模型。做完以后，再交回最强模型验收。",
        "简单活，交给简单模型",
        "做完以后，再交回最强模型验收",
        "workers",
    ),
    Scene(
        "这样不是不用最好的模型，而是把最好的额度，尽量留在真正需要思考的地方。",
        "不是少用最强模型",
        "是别让它把额度浪费在简单活上",
        "allocation",
    ),
    Scene(
        "所以我给自己做了一个 Codex Task Control。现在我自己也在用，顺手把它开源了。你要是也被额度搞得难受，可以自己去看看。好不好用，用完回来告诉我。",
        "所以我先给自己做了一个",
        "现在自己在用，也顺手开源了",
        "personal",
    ),
]

CAPTION_CHUNKS = {
    "quota": ["兄弟们，GPT 五点六是真好用。", "但这个额度掉得也太吓人了。"],
    "chores": ["我用的是 Pro，甚至二十倍都感觉不太够。", "最难受的是，找文件、跑测试、改几个格式。", "这些简单操作，居然也在用最好的模型。"],
    "brain": ["后来我就一直在想。", "能不能让最前沿的模型，只负责当大脑？", "让它理解需求、拆任务、把握方向。", "确保整个事情不会跑偏。"],
    "workers": ["搜索文件、批量修改、跑命令、跑测试。", "这些简单活，就分给简单一点的模型。", "做完以后，再交回最强模型验收。"],
    "allocation": ["这样不是不用最好的模型。", "而是把最好的额度，留在真正需要思考的地方。"],
    "personal": ["所以我给自己做了一个 Codex Task Control。", "现在我自己也在用，顺手把它开源了。", "你要是也被额度搞得难受，可以自己去看看。", "好不好用，用完回来告诉我。"],
}


def font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    if mono:
        candidates = [Path(r"C:\Windows\Fonts\CascadiaMono.ttf"), Path(r"C:\Windows\Fonts\consola.ttf")]
    elif bold:
        candidates = [Path(r"C:\Windows\Fonts\msyhbd.ttc"), Path(r"C:\Windows\Fonts\simhei.ttf")]
    else:
        candidates = [Path(r"C:\Windows\Fonts\msyh.ttc"), Path(r"C:\Windows\Fonts\simhei.ttf")]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


F_KICKER = font(22, bold=True)
F_H1 = font(48, bold=True)
F_H2 = font(35, bold=True)
F_BODY = font(27)
F_CAPTION = font(30, bold=True)
F_CAPTION_SMALL = font(23)
F_MONO = font(21, mono=True)
F_MONO_SMALL = font(17, mono=True)
F_NUMBER = font(58, bold=True)
F_FOOT = font(15)


def run_cli(home: Path, *args: str) -> str:
    result = subprocess.run(
        ["node", str(CLI), *args, "--codex-home", str(home)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def verify_real_lifecycle() -> dict[str, str]:
    with tempfile.TemporaryDirectory(prefix="codex-task-control-douyin-") as raw:
        home = Path(raw)
        project = r"C:\work\demo-project"
        run_cli(home, "register", "--project-root", project, "--controller", "controller-1", "--thread", "worker-1", "--parent", "controller-1", "--title", "Audit auth flow", "--model", "economical-worker", "--thinking", "low", "--delegation", "explicit", "--execution-surface", "visible_task", "--model-class", "economical", "--quota-reason", "Mechanical audit work is cheaper than using the frontier controller.")
        registered = json.loads(run_cli(home, "query-self", "--self", "worker-1"))
        event = run_cli(home, "complete", "--self", "worker-1", "--candidate-commit", "candidate-auth-v1")
        run_cli(home, "controller-ingest-completion", "--project-root", project, "--controller", "controller-1", "--event", event)
        review = json.loads(run_cli(home, "query-self", "--self", "worker-1"))
        run_cli(home, "mark-accepted", "--project-root", project, "--controller", "controller-1", "--thread", "worker-1")
        run_cli(home, "mark-integrated", "--project-root", project, "--controller", "controller-1", "--thread", "worker-1")
        integrated = json.loads(run_cli(home, "query-self", "--self", "worker-1"))
        assert registered["status"] == "executing"
        assert review["status"] == "awaiting_review"
        assert integrated["status"] == "integrated"
        return {"registered": registered["status"], "review": review["status"], "integrated": integrated["status"]}


def synthesize_voice(text: str, output: Path) -> None:
    mp3 = output.with_suffix(".mp3")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "edge_tts",
            "--voice",
            "zh-CN-YunxiNeural",
            "--rate=+8%",
            "--text",
            text,
            "--write-media",
            str(mp3),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(mp3), "-af", "apad=pad_dur=0.65", "-c:a", "pcm_s16le", str(output)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def ease_out(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return 1 - (1 - value) ** 3


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_center(draw: ImageDraw.ImageDraw, xy: tuple[int, int], content: str, used_font: ImageFont.ImageFont, fill: str) -> None:
    draw.text(xy, content, font=used_font, fill=fill, anchor="mm")


def wrap_text(content: str, used_font: ImageFont.ImageFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in content:
        candidate = current + char
        if current and used_font.getlength(candidate) > max_width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def active_caption(scene: Scene, local: float) -> str:
    chunks = CAPTION_CHUNKS[scene.visual]
    duration = max(0.1, scene.end - scene.start)
    progress = max(0.0, min(0.999, local / duration))
    total_weight = sum(len(chunk) for chunk in chunks)
    cursor = 0
    target = progress * total_weight
    for chunk in chunks:
        cursor += len(chunk)
        if target < cursor:
            return chunk
    return chunks[-1]


def draw_header(draw: ImageDraw.ImageDraw, index: int) -> None:
    draw.text((48, 55), "我的 CODEX 使用记录", font=F_KICKER, fill=MUTED)
    draw.text((672, 57), f"第 {index + 1} 段", font=F_KICKER, fill=MUTED, anchor="ra")
    draw.line((48, 94, 672, 94), fill=EDGE, width=2)


def draw_terminal(draw: ImageDraw.ImageDraw, y: int, lines: list[tuple[str, str]], title: str = "codex / task-control") -> None:
    rounded(draw, (48, y, 672, y + 330), 22, PANEL, EDGE, 2)
    for i, color in enumerate((RED, AMBER, GREEN)):
        draw.ellipse((72 + i * 25, y + 25, 86 + i * 25, y + 39), fill=color)
    draw.text((160, y + 22), title, font=F_MONO_SMALL, fill=MUTED)
    draw.line((68, y + 58, 652, y + 58), fill=EDGE, width=1)
    for row, (content, color) in enumerate(lines):
        draw.text((78, y + 82 + row * 48), content, font=F_MONO, fill=color)


def draw_chaos(draw: ImageDraw.ImageDraw, t: float) -> None:
    labels = [
        ("TASK 01", "executing", CYAN, -12),
        ("TASK 02", "unknown", RED, 8),
        ("TASK 03", "done?", AMBER, -5),
        ("TASK 04", "executing", PURPLE, 10),
        ("TASK 05", "no parent", RED, -8),
    ]
    for i, (name, state, color, angle) in enumerate(labels):
        card = Image.new("RGBA", (470, 125), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        rounded(cd, (2, 2, 468, 123), 18, PANEL_2, color, 2)
        cd.text((28, 24), name, font=F_H2, fill=TEXT)
        cd.text((442, 48), state, font=F_MONO, fill=color, anchor="ra")
        card = card.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        x = 125 + int(math.sin(t * 2.2 + i) * 10)
        y = 355 + i * 112
        draw._image.paste(card, (x, y), card)


def draw_waste(draw: ImageDraw.ImageDraw, local: float) -> None:
    items = [
        ("01", "重复执行", "同一件事又跑一遍", RED),
        ("02", "无人验收", "完成了却没人知道", AMBER),
        ("03", "任务失联", "子任务找不到父任务", PURPLE),
    ]
    for i, (icon, title, body, color) in enumerate(items):
        y = 350 + i * 190
        alpha = ease_out((local - i * 0.22) / 0.6)
        offset = int((1 - alpha) * 55)
        rounded(draw, (58 + offset, y, 662 + offset, y + 155), 22, PANEL, color, 2)
        text_center(draw, (115 + offset, y + 77), icon, F_NUMBER, color)
        draw.text((170 + offset, y + 35), title, font=F_H2, fill=TEXT)
        draw.text((170 + offset, y + 91), body, font=F_BODY, fill=MUTED)


def draw_register(draw: ImageDraw.ImageDraw, local: float) -> None:
    lines = [
        ("$ task-control register", TEXT),
        ("project: demo-project", MUTED),
        ("parent: controller-1", MUTED),
        ("model: gpt-5.6-terra", PURPLE),
        ("thinking: low", AMBER),
    ]
    draw_terminal(draw, 360, lines)
    progress = ease_out((local - 0.7) / 1.1)
    rounded(draw, (80, 750, 640, 844), 20, "#102b27", GREEN, 2)
    draw.text((110, 776), "REGISTERED", font=F_H2, fill=GREEN)
    draw.rectangle((110, 824, 110 + int(500 * progress), 830), fill=GREEN)


def draw_gate(draw: ImageDraw.ImageDraw, local: float) -> None:
    states = [
        ("WORKER", "COMPLETED", CYAN),
        ("CONTROLLER", "ACCEPTED", AMBER),
        ("LEDGER", "INTEGRATED", GREEN),
    ]
    for i, (who, state, color) in enumerate(states):
        y = 365 + i * 210
        active = local > i * 1.15
        rounded(draw, (90, y, 630, y + 125), 22, PANEL if active else "#0b1020", color if active else EDGE, 3)
        draw.text((120, y + 24), who, font=F_KICKER, fill=MUTED)
        draw.text((120, y + 63), state if active else "WAITING", font=F_H2, fill=color if active else MUTED)
        if i < 2:
            draw.line((360, y + 132, 360, y + 195), fill=color if active else EDGE, width=5)
            draw.polygon([(350, y + 184), (370, y + 184), (360, y + 199)], fill=color if active else EDGE)


def draw_ledger(draw: ImageDraw.ImageDraw, local: float) -> None:
    draw.text((60, 345), "任务台账", font=F_H2, fill=TEXT)
    rows = [
        ("调研任务", "integrated", GREEN),
        ("开发任务", "executing", CYAN),
        ("测试任务", "awaiting_review", AMBER),
        ("文档任务", "changes_requested", RED),
    ]
    for i, (title, state, color) in enumerate(rows):
        y = 420 + i * 135
        rounded(draw, (58, y, 662, y + 105), 18, PANEL, EDGE, 2)
        draw.ellipse((85, y + 39, 111, y + 65), fill=color)
        draw.text((135, y + 25), title, font=F_BODY, fill=TEXT)
        draw.text((630, y + 31), state, font=F_MONO_SMALL, fill=color, anchor="ra")
    rounded(draw, (58, 1000, 662, 1095), 18, "#102b27", GREEN, 2)
    text_center(draw, (360, 1048), "每一步都有记录", F_H2, GREEN)


def draw_cta(draw: ImageDraw.ImageDraw, local: float) -> None:
    pulse = 1 + 0.025 * math.sin(local * 4)
    text_center(draw, (360, 405), "OPEN SOURCE", F_KICKER, GREEN)
    text_center(draw, (360, 485), "codex-task-control", F_H1, TEXT)
    rounded(draw, (85, 565, 635, 690), 24, PANEL, CYAN, 3)
    text_center(draw, (360, 610), "GitHub 搜索", F_BODY, MUTED)
    text_center(draw, (360, 657), "codex-task-control", F_H2, CYAN)
    radius = int(90 * pulse)
    draw.ellipse((360 - radius, 820 - radius, 360 + radius, 820 + radius), outline=GREEN, width=4)
    text_center(draw, (360, 820), "★", F_NUMBER, GREEN)
    text_center(draw, (360, 965), "如果你也遇到过任务失控", F_BODY, TEXT)
    text_center(draw, (360, 1015), "评论区告诉我", F_H2, AMBER)


def draw_quota_story(draw: ImageDraw.ImageDraw, local: float) -> None:
    rounded(draw, (60, 365, 660, 815), 26, PANEL, EDGE, 2)
    draw.text((95, 405), "Codex Pro", font=F_H2, fill=TEXT)
    rounded(draw, (500, 400, 620, 454), 14, "#241b12", AMBER, 2)
    text_center(draw, (560, 427), "20×", F_KICKER, AMBER)
    draw.text((95, 515), "GPT-5.6", font=F_H1, fill=CYAN)
    draw.text((95, 585), "今天的使用额度", font=F_BODY, fill=MUTED)
    progress = max(0.08, 1.0 - ease_out(local / 3.6) * 0.9)
    rounded(draw, (95, 655, 625, 720), 18, "#25141b", EDGE, 2)
    rounded(draw, (95, 655, 95 + int(530 * progress), 720), 18, GREEN if progress > 0.35 else RED)
    draw.text((95, 748), "刚开始", font=F_FOOT, fill=MUTED)
    draw.text((625, 748), "怎么又快没了？", font=F_FOOT, fill=RED, anchor="ra")
    rounded(draw, (95, 850, 625, 950), 20, "#27151d", RED, 2)
    text_center(draw, (360, 900), "掉得哗啦啦的", F_H2, RED)


def draw_chores_story(draw: ImageDraw.ImageDraw, local: float) -> None:
    draw.text((64, 355), "我回头看了一下，它在做：", font=F_BODY, fill=MUTED)
    chores = [("找文件", "rg --files"), ("跑测试", "npm test"), ("改格式", "format files"), ("重复命令", "run again")]
    for index, (title, command) in enumerate(chores):
        y = 430 + index * 145
        rounded(draw, (60, y, 660, y + 112), 20, PANEL, EDGE, 2)
        draw.text((92, y + 25), title, font=F_H2, fill=TEXT)
        draw.text((625, y + 37), command, font=F_MONO_SMALL, fill=MUTED, anchor="ra")
        rounded(draw, (500, y + 70, 625, y + 99), 9, "#2b1820", RED, 1)
        text_center(draw, (562, y + 84), "GPT-5.6", F_MONO_SMALL, RED)
    draw.text((360, 1035), "这些真的都需要最强模型吗？", font=F_H2, fill=AMBER, anchor="mm")


def draw_brain_story(draw: ImageDraw.ImageDraw, local: float) -> None:
    rounded(draw, (100, 385, 620, 590), 28, "#102a34", CYAN, 3)
    text_center(draw, (360, 438), "主控大脑", F_KICKER, CYAN)
    text_center(draw, (360, 505), "GPT-5.6", F_H1, TEXT)
    text_center(draw, (360, 555), "只做真正需要判断的事", F_BODY, MUTED)
    tasks = ["理解需求", "拆分任务", "把握方向", "最后验收"]
    for index, label in enumerate(tasks):
        row, column = divmod(index, 2)
        y = 750 + row * 135
        x_pos = 70 + column * 310
        rounded(draw, (x_pos, y, x_pos + 270, y + 96), 18, PANEL, CYAN if local > 0.6 + index * 0.25 else EDGE, 2)
        text_center(draw, (x_pos + 135, y + 48), label, F_H2, TEXT)
    draw.line((360, 600, 360, 735), fill=CYAN, width=5)
    draw.polygon([(350, 720), (370, 720), (360, 740)], fill=CYAN)


def draw_workers_story(draw: ImageDraw.ImageDraw, local: float) -> None:
    rounded(draw, (145, 350, 575, 475), 22, "#102a34", CYAN, 3)
    draw.text((180, 376), "GPT-5.6 主控", font=F_H2, fill=TEXT)
    draw.text((180, 425), "拆任务 + 定方向", font=F_BODY, fill=CYAN)
    worker_rows = [("worker-1", "搜索文件"), ("worker-2", "批量修改"), ("worker-3", "跑命令 / 测试")]
    for index, (worker, job) in enumerate(worker_rows):
        y = 595 + index * 135
        rounded(draw, (65, y, 655, y + 100), 18, PANEL, GREEN if local > index * 0.5 else EDGE, 2)
        draw.text((95, y + 20), worker, font=F_MONO_SMALL, fill=GREEN)
        draw.text((625, y + 27), job, font=F_H2, fill=TEXT, anchor="ra")
    draw.line((360, 480, 360, 565), fill=MUTED, width=4)
    draw.polygon([(350, 550), (370, 550), (360, 570)], fill=MUTED)
    rounded(draw, (120, 1010, 600, 1080), 18, "#241f12", AMBER, 2)
    text_center(draw, (360, 1045), "做完 → 回主控验收", F_H2, AMBER)


def draw_allocation_story(draw: ImageDraw.ImageDraw, local: float) -> None:
    draw.text((65, 380), "以前", font=F_H2, fill=RED)
    draw.text((655, 390), "最强模型什么都干", font=F_BODY, fill=MUTED, anchor="ra")
    rounded(draw, (65, 450, 655, 555), 22, "#23141b", RED, 2)
    draw.rectangle((90, 475, 620, 530), fill=RED)
    text_center(draw, (355, 502), "思考 + 搜索 + 修改 + 命令 + 测试", F_KICKER, BG)
    draw.text((65, 680), "现在", font=F_H2, fill=GREEN)
    draw.text((655, 690), "最强模型只放在关键节点", font=F_BODY, fill=MUTED, anchor="ra")
    rounded(draw, (65, 750, 655, 855), 22, "#10251f", GREEN, 2)
    draw.rectangle((90, 775, 300, 830), fill=GREEN)
    draw.rectangle((312, 775, 620, 830), fill="#29364e")
    text_center(draw, (195, 802), "关键思考", F_KICKER, BG)
    text_center(draw, (466, 802), "简单任务交出去", F_KICKER, TEXT)
    rounded(draw, (90, 940, 630, 1040), 20, PANEL, CYAN, 2)
    text_center(draw, (360, 990), "最好的额度，花在脑力上", F_H2, CYAN)


def draw_personal_story(draw: ImageDraw.ImageDraw, local: float) -> None:
    draw.text((65, 350), "我不是专门做这个的。", font=F_H2, fill=TEXT)
    draw.text((65, 405), "就是自己不够用，所以先做给自己。", font=F_BODY, fill=MUTED)
    rounded(draw, (55, 500, 665, 815), 24, PANEL, EDGE, 2)
    draw.text((85, 535), "faizlee / codex-task-control", font=F_MONO, fill=TEXT)
    draw.text((85, 590), "Public", font=F_MONO_SMALL, fill=MUTED)
    draw.line((85, 635, 635, 635), fill=EDGE, width=2)
    draw.text((85, 675), "让最强模型负责思考，", font=F_H2, fill=CYAN)
    draw.text((85, 730), "让简单模型负责干活。", font=F_H2, fill=GREEN)
    rounded(draw, (80, 875, 640, 970), 20, "#111e31", CYAN, 2)
    text_center(draw, (360, 922), "GitHub 搜：codex-task-control", F_BODY, CYAN)
    text_center(draw, (360, 1040), "有想用的兄弟，自己去看看", F_H2, AMBER)


def scene_at(t: float) -> tuple[int, Scene]:
    for index, scene in enumerate(SCENES):
        if scene.start <= t < scene.end:
            return index, scene
    return len(SCENES) - 1, SCENES[-1]


def render_frame(t: float) -> Image.Image:
    image = Image.new("RGB", (SOURCE_WIDTH, SOURCE_HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    index, scene = scene_at(t)
    local = t - scene.start
    draw_header(draw, index)

    entry = ease_out(local / 0.42)
    heading_y = 150 + int((1 - entry) * 35)
    text_center(draw, (360, heading_y), scene.headline, F_H1 if len(scene.headline) <= 14 else F_H2, TEXT)
    text_center(draw, (360, heading_y + 72), scene.caption, F_BODY, AMBER if index < 2 else CYAN)

    if scene.visual == "quota":
        draw_quota_story(draw, local)
    elif scene.visual == "chores":
        draw_chores_story(draw, local)
    elif scene.visual == "brain":
        draw_brain_story(draw, local)
    elif scene.visual == "workers":
        draw_workers_story(draw, local)
    elif scene.visual == "allocation":
        draw_allocation_story(draw, local)
    else:
        draw_personal_story(draw, local)

    # Burned-in captions stay above Douyin's bottom control area.
    caption_text = active_caption(scene, local)
    caption_font = F_CAPTION if len(caption_text) < 19 else F_BODY
    caption_lines = wrap_text(caption_text, caption_font, 590)
    if len(caption_lines) > 2:
        caption_font = F_CAPTION_SMALL
        caption_lines = wrap_text(caption_text, caption_font, 590)
    box_top = 1095 if len(caption_lines) >= 2 else 1115
    rounded(draw, (38, box_top, 682, 1215), 18, "#111827", None)
    line_height = 42 if caption_font == F_BODY else 48
    block_height = len(caption_lines) * line_height
    first_y = box_top + (1215 - box_top - block_height) // 2 + line_height // 2
    for line_index, line in enumerate(caption_lines):
        text_center(draw, (360, first_y + line_index * line_height), line, caption_font, TEXT)
    draw.text((360, 1242), "这是我自己的使用思路 · 不是额度破解", font=F_FOOT, fill=MUTED, anchor="ma")
    return image


def make_sfx(path: Path, duration: float, scene_starts: list[float]) -> None:
    rate = 44100
    total = int(duration * rate)
    data = bytearray()
    starts = [int(value * rate) for value in scene_starts]
    for i in range(total):
        value = 0.0
        # Subtle low ambient bed.
        value += 0.035 * math.sin(2 * math.pi * 82 * i / rate)
        value += 0.018 * math.sin(2 * math.pi * 123 * i / rate)
        for start in starts:
            offset = i - start
            if 0 <= offset < int(0.22 * rate):
                env = 1 - offset / (0.22 * rate)
                value += 0.18 * env * math.sin(2 * math.pi * 660 * offset / rate)
        sample = max(-1.0, min(1.0, value))
        data += int(sample * 32767).to_bytes(2, "little", signed=True)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(bytes(data))


def srt_time(seconds: float) -> str:
    millis = round(seconds * 1000)
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def write_srt(path: Path) -> None:
    chunks = []
    for i, scene in enumerate(SCENES, 1):
        chunks.append(f"{i}\n{srt_time(scene.start)} --> {srt_time(scene.end)}\n{scene.voice}\n")
    path.write_text("\n".join(chunks), encoding="utf-8-sig")


def render_cover(path: Path) -> None:
    image = Image.new("RGB", (OUTPUT_WIDTH, OUTPUT_HEIGHT), BG)
    draw = ImageDraw.Draw(image)
    big = font(92, bold=True)
    medium = font(54, bold=True)
    small = font(39)
    draw.text((80, 115), "我的 CODEX 使用记录", font=font(34, bold=True), fill=MUTED)
    draw.line((80, 175, 1000, 175), fill=EDGE, width=3)
    draw.text((80, 330), "GPT-5.6", font=big, fill=TEXT)
    draw.text((80, 455), "是真好用", font=big, fill=TEXT)
    draw.text((80, 600), "但额度太吓人", font=big, fill=AMBER)
    rounded(draw, (80, 790, 1000, 1215), 36, PANEL, EDGE, 3)
    rows = [("找文件", "GPT-5.6", RED), ("跑测试", "GPT-5.6", RED), ("改格式", "GPT-5.6", RED)]
    for i, (name, state, color) in enumerate(rows):
        y = 850 + i * 110
        draw.text((135, y), name, font=medium, fill=TEXT)
        draw.text((940, y + 8), state, font=font(36, mono=True), fill=color, anchor="ra")
    rounded(draw, (80, 1355, 1000, 1515), 32, "#102b27", GREEN, 3)
    text_center(draw, (540, 1436), "别让最强模型一直干杂活", medium, GREEN)
    text_center(draw, (540, 1695), "GitHub：codex-task-control", small, CYAN)
    image.save(path, quality=95)


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")
    lifecycle = verify_real_lifecycle()
    MEDIA.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="codex-task-control-video-") as raw:
        temp = Path(raw)
        voice_files = []
        cursor = 0.0
        for index, scene in enumerate(SCENES):
            voice = temp / f"voice-{index:02}.wav"
            synthesize_voice(scene.voice, voice)
            voice_files.append(voice)
            scene.start = cursor
            scene.end = cursor + wav_duration(voice)
            cursor = scene.end
        duration = cursor + 0.25

        concat_file = temp / "voices.txt"
        concat_file.write_text("\n".join(f"file '{path.as_posix()}'" for path in voice_files), encoding="utf-8")
        joined_voice = temp / "voice.wav"
        subprocess.run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file), str(joined_voice)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        sfx = temp / "sfx.wav"
        make_sfx(sfx, duration, [scene.start for scene in SCENES])
        raw_video = temp / "silent.mp4"
        process = subprocess.Popen(
            [ffmpeg, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{SOURCE_WIDTH}x{SOURCE_HEIGHT}", "-r", str(FPS), "-i", "-", "-an", "-vf", f"scale={OUTPUT_WIDTH}:{OUTPUT_HEIGHT}:flags=lanczos", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", str(raw_video)],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        assert process.stdin is not None
        for frame_no in range(math.ceil(duration * FPS)):
            process.stdin.write(render_frame(frame_no / FPS).tobytes())
        process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("video render failed")

        output = MEDIA / "codex-task-control-douyin-final.mp4"
        subprocess.run(
            [ffmpeg, "-y", "-i", str(raw_video), "-i", str(joined_voice), "-i", str(sfx), "-filter_complex", "[1:a]volume=1.35[voice];[2:a]volume=0.30[bed];[voice][bed]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[a]", "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(output)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    # Keep a different basename so video players do not auto-load the sidecar
    # on top of the captions already burned into the final MP4.
    srt = MEDIA / "codex-task-control-douyin-editing.srt"
    cover = MEDIA / "codex-task-control-douyin-cover.png"
    write_srt(srt)
    render_cover(cover)
    print(json.dumps({"lifecycle": lifecycle, "duration": duration, "video": str(output), "cover": str(cover), "srt": str(srt)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
