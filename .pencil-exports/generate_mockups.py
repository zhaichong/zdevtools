from PIL import Image, ImageDraw, ImageFont
import os

# Colors
BG_PRIMARY = (15, 17, 21)
BG_SECONDARY = (24, 26, 32)
BG_TERTIARY = (30, 32, 40)
SURFACE_ELEVATED = (37, 40, 48)
BORDER = (46, 50, 60)
BORDER_SUBTLE = (35, 38, 45)
ACCENT_PRIMARY = (59, 130, 246)
ACCENT_SUCCESS = (34, 197, 94)
ACCENT_WARNING = (245, 158, 11)
ACCENT_ERROR = (239, 68, 68)
ACCENT_INFO = (6, 182, 212)
TEXT_PRIMARY = (241, 245, 249)
TEXT_SECONDARY = (148, 163, 184)
TEXT_TERTIARY = (100, 116, 139)

FONT_PATH = None

def get_font(size, bold=False):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except:
        return ImageFont.load_default()

def draw_rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

def draw_text(draw, text, pos, font, fill, max_width=None):
    if max_width is None:
        draw.text(pos, text, font=font, fill=fill)
        return draw.textbbox((0,0), text, font=font)[3] - draw.textbbox((0,0), text, font=font)[1]
    # simple word wrap
    words = text.split(' ')
    lines = []
    current = ''
    for word in words:
        test = current + ' ' + word if current else word
        bbox = draw.textbbox((0,0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    x, y = pos
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        y += draw.textbbox((0,0), line, font=font)[3] - draw.textbbox((0,0), line, font=font)[1] + 2
    return y - pos[1]

def dashboard():
    W, H = 1200, 800
    img = Image.new('RGB', (W, H), BG_PRIMARY)
    draw = ImageDraw.Draw(img)
    
    # Top bar
    draw.rectangle([0, 0, W, 56], fill=BG_SECONDARY)
    draw.line([0, 56, W, 56], fill=BORDER, width=1)
    
    # Logo
    draw_rounded_rect(draw, (20, 14, 48, 42), 6, ACCENT_PRIMARY)
    draw.text((62, 18), "ztools", font=get_font(18, True), fill=TEXT_PRIMARY)
    
    # Top right
    draw.text((1080, 22), "v1.0.2", font=get_font(12), fill=TEXT_TERTIARY)
    # Status badge
    draw_rounded_rect(draw, (1130, 18, 1180, 38), 11, ACCENT_SUCCESS)
    draw.ellipse([1138, 24, 1146, 32], fill=(255,255,255))
    draw.text((1152, 22), "正常", font=get_font(11), fill=(255,255,255))
    
    # Main
    y = 80
    # Scan bar
    draw_rounded_rect(draw, (24, y, W-24, y+81), 8, BG_SECONDARY, outline=BORDER)
    draw.text((44, y+16), "可调试目标", font=get_font(18, True), fill=TEXT_PRIMARY)
    draw.text((44, y+44), "1 台设备 · 2 个 WebView · 最近 3 秒前", font=get_font(13), fill=TEXT_SECONDARY)
    
    # chips
    draw_rounded_rect(draw, (540, y+28, 690, y+52), 11, ACCENT_SUCCESS)
    draw.ellipse([550, y+34, 558, y+42], fill=(255,255,255))
    draw.text((564, y+32), "WebView 调试已开启", font=get_font(11), fill=(255,255,255))
    
    draw_rounded_rect(draw, (700, y+28, 780, y+52), 11, ACCENT_WARNING)
    draw.ellipse([710, y+34, 718, y+42], fill=(255,255,255))
    draw.text((724, y+32), "1 条提示", font=get_font(11), fill=(255,255,255))
    
    # Driver select
    draw_rounded_rect(draw, (820, y+24, 990, y+58), 6, BG_TERTIARY, outline=BORDER)
    draw.text((834, y+33), "ADB 通道 (Android)", font=get_font(13), fill=TEXT_PRIMARY)
    
    # Scan button
    draw_rounded_rect(draw, (1000, y+24, 1160, y+58), 6, ACCENT_PRIMARY)
    draw.text((1040, y+33), "重新扫描", font=get_font(13, True), fill=(255,255,255))
    
    y += 105
    # Device cards
    # Card 1
    x1, x2 = 24, 628
    for x, model, os, badge_color, badge_text, target, url in [
        (x1, "HUAWEI P60", "Android 13 · API 33", ACCENT_SUCCESS, "ADB", "护理大屏 - 床头卡", "https://ntv.yarward.com/..."),
        (x2, "Xiaomi 14", "Android 14 · API 34", ACCENT_INFO, "HDC", "信息看板 - 护理站", "https://zhbf.hospital.com/...")
    ]:
        draw_rounded_rect(draw, (x, y, x+560, y+170), 8, BG_SECONDARY, outline=BORDER)
        # Header
        draw.text((x+20, y+20), model, font=get_font(15, True), fill=TEXT_PRIMARY)
        draw.text((x+20, y+42), os, font=get_font(12), fill=TEXT_SECONDARY)
        draw_rounded_rect(draw, (x+500, y+20, x+540, y+42), 11, badge_color)
        draw.text((x+512, y+24), badge_text, font=get_font(11, True), fill=(255,255,255))
        
        # Target
        draw.text((x+20, y+82), target, font=get_font(13, True), fill=TEXT_PRIMARY)
        draw.text((x+20, y+102), url, font=get_font(11), fill=TEXT_TERTIARY)
        
        # Workbench button
        draw_rounded_rect(draw, (x+440, y+120, x+540, y+150), 6, ACCENT_PRIMARY)
        draw.text((x+456, y+128), "调试工作台", font=get_font(12, True), fill=(255,255,255))
    
    return img

def workbench():
    W, H = 1200, 800
    img = Image.new('RGB', (W, H), BG_PRIMARY)
    draw = ImageDraw.Draw(img)
    
    # Left rail
    draw.rectangle([0, 0, 64, H], fill=BG_SECONDARY)
    draw.line([64, 0, 64, H], fill=BORDER, width=1)
    
    icons = [
        ("诊断", True), ("时间线", False), ("回放", False), ("网络", False),
        ("控制台", False), ("日志", False), ("设备", False), ("报告", False), ("DevTools", False)
    ]
    y = 20
    for label, active in icons:
        color = TEXT_PRIMARY if active else TEXT_SECONDARY
        bg = SURFACE_ELEVATED if active else None
        if bg:
            draw_rounded_rect(draw, (8, y, 56, y+56), 6, bg, outline=BORDER)
        # Icon placeholder
        draw.rectangle([24, y+8, 40, y+24], fill=ACCENT_PRIMARY if active else TEXT_SECONDARY)
        draw.text((32 - (len(label)*3 if len(label)<=2 else 6), y+32), label, font=get_font(9), fill=color)
        y += 64
    
    # Top bar
    draw.rectangle([64, 0, W, 56], fill=BG_SECONDARY)
    draw.line([64, 56, W, 56], fill=BORDER, width=1)
    
    draw.text((84, 16), "护理大屏 - 床头卡", font=get_font(15, True), fill=TEXT_PRIMARY)
    draw.text((84, 34), "https://ntv.yarward.com/bedhead/index.html#/bed/1024", font=get_font(12), fill=TEXT_TERTIARY)
    
    # Actions
    draw_rounded_rect(draw, (780, 14, 860, 40), 11, ACCENT_SUCCESS)
    draw.text((796, 21), "监听中", font=get_font(11), fill=(255,255,255))
    
    for x, label in [(870, "上传 SourceMap"), (990, "复制 Markdown")]:
        draw_rounded_rect(draw, (x, 14, x+110, 40), 6, BG_TERTIARY, outline=BORDER)
        draw.text((x+10, 21), label, font=get_font(12), fill=TEXT_PRIMARY)
    
    draw_rounded_rect(draw, (1110, 14, 1180, 40), 6, ACCENT_PRIMARY)
    draw.text((1122, 21), "导出诊断", font=get_font(12, True), fill=(255,255,255))
    
    # Cause list
    draw.rectangle([64, 56, 424, H], fill=BG_SECONDARY)
    draw.line([424, 56, 424, H], fill=BORDER, width=1)
    
    draw.text((84, 76), "根因分析", font=get_font(14, True), fill=TEXT_PRIMARY)
    draw.text((340, 78), "3 个可疑根因", font=get_font(12), fill=TEXT_TERTIARY)
    
    causes = [
        ("P0", ACCENT_ERROR, "全局函数缺失", "window.onMattressDataReceived 未定义或不是函数。", "94% 置信度"),
        ("P1", ACCENT_WARNING, "接口 500 错误", "GET /api/patient/current 返回 500，可能导致页面初始化数据为空。", "81% 置信度"),
        ("P2", ACCENT_INFO, "静态资源疑似未加载", "performance 中检测到 transferSize=0 的 chunk.js。", "68% 置信度"),
    ]
    cy = 110
    for p, color, title, summary, conf in causes:
        draw_rounded_rect(draw, (80, cy, 408, cy+110), 6, BG_TERTIARY, outline=BORDER)
        draw_rounded_rect(draw, (92, cy+12, 116, cy+32), 4, color)
        draw.text((98, cy+16), p, font=get_font(11, True), fill=(255,255,255))
        draw.text((360, cy+16), "×3", font=get_font(11), fill=TEXT_TERTIARY)
        draw.text((92, cy+42), title, font=get_font(14, True), fill=TEXT_PRIMARY)
        draw_text(draw, summary, (92, cy+66), get_font(12), TEXT_SECONDARY, max_width=300)
        draw.ellipse([92, cy+96, 100, cy+104], fill=color)
        draw.text((108, cy+94), conf, font=get_font(11), fill=TEXT_TERTIARY)
        cy += 124
    
    # Detail panel
    dx = 444
    draw.text((dx, 76), "全局函数缺失", font=get_font(22, True), fill=TEXT_PRIMARY)
    draw.text((dx, 108), "触发点：onMattressDataReceived", font=get_font(13), fill=TEXT_TERTIARY)
    
    draw_rounded_rect(draw, (dx+360, 76, dx+400, 102), 4, ACCENT_ERROR)
    draw.text((dx+372, 82), "P0", font=get_font(12, True), fill=(255,255,255))
    draw_rounded_rect(draw, (dx+412, 76, dx+490, 102), 4, SURFACE_ELEVATED, outline=BORDER)
    draw.text((dx+420, 82), "94% 置信度", font=get_font(12), fill=TEXT_SECONDARY)
    
    # Summary card
    draw_rounded_rect(draw, (dx, 136, W-24, 230), 6, BG_SECONDARY, outline=BORDER)
    draw.text((dx+16, 150), "摘要", font=get_font(11, True), fill=TEXT_TERTIARY)
    draw_text(draw, "window.onMattressDataReceived 未定义或不是函数。床垫数据链路调用该函数，但当前页面没有注册。常见原因是 Android/业务脚本未注入、注入晚于调用，或入口 HTML 与 chunk 版本不一致。",
              (dx+16, 172), get_font(13), TEXT_SECONDARY, max_width=W-dx-56)
    
    # Meta cards
    draw_rounded_rect(draw, (dx, 248, dx+360, 360), 6, BG_SECONDARY, outline=BORDER)
    draw.text((dx+16, 262), "OWNER", font=get_font(11, True), fill=TEXT_TERTIARY)
    draw_text(draw, "前端初始化 / Android Bridge / 床垫模块", (dx+16, 284), get_font(13), TEXT_PRIMARY, max_width=320)
    
    draw_rounded_rect(draw, (dx+380, 248, W-24, 360), 6, BG_SECONDARY, outline=BORDER)
    draw.text((dx+396, 262), "NEXT", font=get_font(11, True), fill=TEXT_TERTIARY)
    next_text = "1. 在 Console 执行 typeof window.onMattressDataReceived；2. 确认该方法由前端脚本还是 Android 注入；3. 检查 launchFinished 前是否提前收到 MQTT/床垫数据；4. 检查模块初始化顺序和 chunk 版本。"
    draw_text(draw, next_text, (dx+396, 284), get_font(13), TEXT_PRIMARY, max_width=W-dx-420)
    
    # Evidence
    draw_rounded_rect(draw, (dx, 380, W-24, H-24), 6, BG_SECONDARY, outline=BORDER)
    draw.text((dx+16, 394), "直接证据", font=get_font(12, True), fill=TEXT_PRIMARY)
    draw.text((dx+680, 396), "3 条", font=get_font(12), fill=TEXT_TERTIARY)
    
    draw_rounded_rect(draw, (dx+16, 424, W-40, 500), 6, BG_TERTIARY)
    draw.text((dx+28, 436), "JS 错误 · window.onerror", font=get_font(11, True), fill=ACCENT_ERROR)
    draw.text((dx+28, 458), "TypeError: window.onMattressDataReceived is not a function", font=get_font(12), fill=TEXT_PRIMARY)
    draw.text((dx+28, 480), "at onMessage (webpack://src/mqtt/index.js:142:11)", font=get_font(11), fill=TEXT_TERTIARY)
    
    return img

if __name__ == "__main__":
    os.makedirs(os.path.dirname(__file__), exist_ok=True)
    dashboard().save(os.path.join(os.path.dirname(__file__), "dashboard_mockup.png"))
    workbench().save(os.path.join(os.path.dirname(__file__), "workbench_mockup.png"))
    print("Mockups generated")
