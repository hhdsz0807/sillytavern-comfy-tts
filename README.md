# SillyTavern ComfyUI 绘图 & TTS 语音朗读原生插件

> 🎨 **SillyTavern ComfyUI Draw & TTS Speech Extension (`sillytavern-comfy-tts`)**  
> 专为 SillyTavern 酒馆打造的纯净原生插件：**100% 独立运行，不依赖任何外部宿主或中间桥接**，所有逻辑前端闭环！

---

## 🌟 核心特性

### 1. 🎨 ComfyUI 原生智能生图与交互轮播
- **直连 ComfyUI 原生引擎**：直接与标准 ComfyUI 服务（默认 `http://127.0.0.1:8188` 或远程局域网 IP）通信，无需任何中间代理。
- **自动探查模型与调度器**：自动枚举并识别 ComfyUI 中已安装的 Checkpoint 模型权重、采样器与调度算法。
- **实时进度推送**：通过 ComfyUI 原生 WebSocket 通道监听采样步数与执行进度（百分比实时回传），辅以 `/history` 轮询双重兜底。
- **自动标签识别**：智能捕获 AI 回复中的 `<image>prompt</image>` 或 `<img_prompt>...</img_prompt>` 标签，自动在对话流中渲染卡片并驱动后台生图。
- **横向多图轮播交互**：
  - **手势滑动**：手机触屏左滑/右滑即时切换图片。
  - **按键与圆点指示**：提供 `◀ 上一张`、`下一张 ▶` 与小圆点直达任意画面。
  - **画面计数角标**：右上角半透明磨砂徽章清晰标示当前位置（如 `1 / 3`）。
- **全屏沉浸灯箱 (Lightbox)**：点击卡片任意图片即可调出沉浸式大图灯箱，支持新标签查看原图与一键下载保存。
- **一键重试与快捷生图**：
  - 遇到不理想画面随时点击 `🔄 重新生成`。
  - 每条 AI 消息工具栏内置 `🎨` 按钮，点击即可根据当条回复或自定义提示词即时生图。
  - 支持 `/comfy <提示词>` 斜杠命令在输入框中随时触发。

### 2. 🔊 纯净独立 TTS 语音朗读
- **双独立引擎架构**：
  - **Web Speech API（默认）**：浏览器原生引擎，零网络开销、零延迟、开箱即用，自动枚举当前设备所有优质多语种发音人。
  - **OpenAI 兼容协议音频服务**：直连标准 `/v1/audio/speech` 端点（适配 Edge-TTS、CosyVoice、GPT-SoVITS、Fish-Speech 等）。
- **划选浮动胶囊**：手机手滑划选文字、电脑鼠标选中文本时，在划选区域就地升起磨砂蓝光胶囊 `🔊 朗读选中文字`。
- **正在播放动效**：播放时胶囊自动变更为红色呼吸波纹 `⏹ 停止朗读`，随点随停。
- **全局常驻指示条**：屏幕右下角自动展示 `🔊 正在朗读… [点击停止]`，页面滚动也不影响一键中止。
- **整条消息一键朗读**：消息工具栏内置 `🔊` 按钮，自动过滤 `<think>` 思考过程、代码块与 `<image>` 标签，只字正腔圆朗读纯净叙事正文。
- **斜杠命令支持**：支持输入 `/tts <文本>` 随时调用朗读。

### 3. ⚙️ 原生酒馆配置面板
- 接入酒馆右侧抽屉 **Extensions Settings** 与顶部魔杖快捷菜单（**Extensions Menu**）。
- **ComfyUI 项**：ComfyUI 服务地址、自动模型探查、采样步数、CFG Scale、画风正向提示词前缀/后缀、通用负向词、生图张数、一键测试连接。
- **TTS 项**：引擎选择（Web Speech / OpenAI）、音色列表下拉、语速（0.5x ~ 2.0x）与音调（0.5 ~ 1.5）平滑调节、划选胶囊开关、过滤思考链开关、一键试听测试。

---

## 📦 安装与部署

### 方式一：电脑端 / 手机端 SillyTavern 纯净安装
只需将 `sillytavern-comfy-tts` 文件夹克隆或复制到 SillyTavern 的第三方扩展目录中：

```bash
cd <SillyTavern安装目录>/public/scripts/extensions/third-party/
git clone https://github.com/hhdsz0807/sillytavern-comfy-tts.git
```

目录结构如下：
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
在你的角色卡系统提示词（System Prompt）中加入以下简要约定即可触发自动生图：
```text
当剧情出现值得描绘的视觉场景时，请在回复正文的末尾输出一段精准的英文画面描述标签：
<image>1girl, solo, cute smile, classroom, sunny afternoon, anime aesthetic</image>
```
酒馆在渲染该消息时，会自动将 `<image>` 标签无缝转换为 ComfyUI 轮播生图卡片！

### 2. 交互操作
- **划选朗读**：在任意聊天文本上长按/拖动选中，点击浮起的 `🔊 朗读选中文字` 胶囊。
- **消息朗读**：点击消息右下角操作栏中的 `🔊` 图标。
- **消息生图**：点击消息右下角操作栏中的 `🎨` 图标，输入想绘制的画面即可。
- **斜杠命令**：
  - `/comfy solo, masterpiece, beautiful landscape`
  - `/tts 很高兴与您交流！`

---

## 🛠️ 后端服务配置参考

| 引擎 | 适用环境 | 默认地址 | 特点 |
| :--- | :--- | :--- | :--- |
| **ComfyUI 原生直连** | 本地或远程 ComfyUI 服务（PC/服务器） | `http://127.0.0.1:8188` | 原生工作流驱动、实时步数推送、支持模型自动探查 |
| **Web Speech API** | 任意浏览器环境（手机/平板/PC Chrome、Edge、Safari） | 原生内置 | 零服务器依赖、零网络延迟、开箱即用 |
| **OpenAI 兼容 TTS** | 本地或云端部署的 Edge-TTS / CosyVoice / GPT-SoVITS | 自定义 URL | 支持高拟真多角色克隆音色 |

---

## 📄 开源许可证
MIT License.
