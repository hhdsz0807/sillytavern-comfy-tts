# SillyTavern ComfyUI 绘图 & TTS 语音朗读插件

> 🎨 **SillyTavern ComfyUI Draw & TTS Speech Extension (`sillytavern-comfy-tts`)**  
> 专为 SillyTavern 酒馆打造的次时代互动扩展：深度集成 **ComfyUI 异步画面生成**与**触屏划选即时语音朗读 (TTS)**。

---

## 🌟 核心特性

### 1. 🎨 ComfyUI 智能画面生成与交互轮播
- **自动标签识别**：智能捕获 AI 回复中的 `<image>prompt</image>` 或 `<img_prompt>...</img_prompt>` 标签，自动在对话流中渲染卡片并驱动后台生图。
- **横向多图轮播**：支持一次生成多张图片（Batch 1~4），采用优雅卡片呈现：
  - **手势滑动**：手机触屏左滑/右滑即时切换图片。
  - **按键与圆点指示**：提供 `◀ 上一张`、`下一张 ▶` 与小圆点直达任意画面。
  - **画面计数角标**：右上角半透明磨砂徽章清晰标示当前位置（如 `1 / 3`）。
- **全屏高清灯箱 (Lightbox)**：点击卡片任意图片即可调出沉浸式大图灯箱，支持新标签查看原图与一键下载保存。
- **一键重试与消息快捷生图**：
  - 遇到不理想画面随时点击 `🔄 重新生成`。
  - 每条 AI 消息工具栏内置 `🎨` 按钮，点击即可根据当条回复或自定义提示词即时生图。
- **斜杠命令支持**：在输入框直接键入 `/comfy <提示词>` 随时随地生成插画。

### 2. 🔊 划选文本即时语音朗读 (Floating Selection TTS)
- **就地浮动胶囊**：手机手滑划选文字、电脑鼠标选中文本时，在划选区域就地升起磨砂蓝光胶囊 `🔊 朗读选中文字`。
- **正在播放脉冲动效**：播放时胶囊自动变更为红色呼吸波纹 `⏹ 停止朗读`，随点随停。
- **全局浮动指示条**：屏幕右下角自动常驻 `🔊 正在朗读… [点击停止]` 徽章，无论页面如何滚动都能一键终止。
- **整条消息一键朗读**：消息工具栏内置 `🔊` 按钮，自动过滤 `<think>` 思考过程、代码块与 `<image>` 标签，只字正腔圆朗读纯净叙事正文。
- **双引擎通道**：
  - **Web Speech API（默认）**：原生免配置，自动枚举系统所有优质中文/日文/英文发音人。
  - **DSH 本地语音通道**：支持对接本地 3092/3090 服务或 Android 原生 TTS 管道。

### 3. ⚙️ 原生酒馆配置面板
- 完美接入酒馆右侧抽屉扩展配置（`Extensions Settings`）与顶部魔杖快捷菜单（`Extensions Menu`）。
- **ComfyUI 项**：自动生图开关、画风正向提示词前缀/后缀、通用负向词、生图张数、直连 8188 或 DSH 3092 切换、连通性一键测试。
- **TTS 项**：划选胶囊开关、过滤思考开关、发音人下拉选择、语速（0.5x ~ 2.0x）与音调（0.5 ~ 1.5）平滑调节、一键试听与停止。

---

## 📦 安装与部署

### 方式一：手机端 DSH / Termux 酒馆部署
通过 ADB 或终端直接将本目录复制到酒馆第三方扩展目录：
```bash
# 复制至第三方扩展路径
cp -r sillytavern-comfy-tts /data/user/0/com.dsh.client.plus/files/linux/ubuntu/root/SillyTavern/public/scripts/extensions/third-party/
```

### 方式二：电脑端 SillyTavern 部署
将 `sillytavern-comfy-tts` 文件夹放置在 SillyTavern 的扩展目录中：
```text
SillyTavern/
└── public/
    └── scripts/
        └── extensions/
            └── third-party/
                └── sillytavern-comfy-tts/
                    ├── manifest.json
                    ├── index.js
                    ├── style.css
                    └── README.md
```

完成后刷新酒馆浏览器页面，插件将自动完成加载并生效！

---

## 💡 使用指南

### 1. 角色卡提示词让 AI 自动出图
在你的角色卡系统提示词（System Prompt）或情境中加入以下简要约定即可触发自动生图：
```text
当剧情出现值得描绘的视觉场景时，请在回复正文的末尾输出一段精准的英文画面描述标签：
<image>1girl, solo, cute smile, classroom, sunny afternoon, anime aesthetic</image>
```
酒馆在渲染该消息时，会自动将 `<image>` 标签无缝转换为 ComfyUI 轮播生图卡片！

### 2. 手动生图与朗读
- **划选朗读**：在任意聊天文本上长按/拖动选中，点击浮起的 `🔊 朗读选中文字` 胶囊。
- **消息朗读**：点击消息右下角操作栏中的 `🔊` 图标。
- **消息生图**：点击消息右下角操作栏中的 `🎨` 图标，输入想绘制的画面即可。
- **斜杠命令**：
  - `/comfy solo, masterpiece, beautiful landscape`
  - `/tts 很高兴与您交流！`

---

## 🛠️ 后端服务配置参考

| 模式 | 适用场景 | 默认地址 | 说明 |
| :--- | :--- | :--- | :--- |
| **DSH 本地桥服务** | 手机端配套或本地 DSH 运行环境 | `http://127.0.0.1:3092` (或 3090) | 调用 `/app/comfy/draw` 与 `/app/comfy/image`，无需前端暴露 API 密钥 |
| **ComfyUI 直连** | PC 端启动了原生 ComfyUI（端口 8188） | `http://127.0.0.1:8188` | 直连 ComfyUI REST API，自动提交工作流并获取输出图像 |
| **Web Speech TTS** | 任意浏览器环境（电脑/手机 Chrome/Edge/Safari） | 原生内置 | 零网络开销、零延迟，支持调节音色、语速与音调 |

---

## 📄 开源许可证
MIT License.
