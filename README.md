# SillyTavern ComfyUI 绘图 & TTS 语音朗读原生插件

> 🎨 **SillyTavern ComfyUI Draw & TTS Speech Extension (`sillytavern-comfy-tts`)**  
> 专为 SillyTavern 酒馆打造的纯净原生插件：**100% 独立运行，不依赖任何外部宿主或中间桥接**，直连 ComfyUI 原生 API，前端逻辑全部闭环！

---

## 🌟 核心特性与架构升级

### 1. 🎨 内置原生 ComfyUI 高阶工作流引擎
- **文生图 + 链式多 LoRA + 高清潜空间放大（Hires Fix）**：
  - **动态模型链式装载**：根据当前角色或情景命中规则，自动在 `CheckpointLoaderSimple` 之后级联多个 `LoraLoader` 节点，平滑传递 `MODEL` 与 `CLIP` 管道。
  - **智能特征词注入**：正文或标签中检测到角色 LoRA 关键词时，自动挂载对应 LoRA，并将配置的**角色特征触发词**精准注入到正向提示词中。
  - **潜空间二次放大 (Hires Fix)**：支持开启 `LatentUpscaleBy` + 二次 `KSampler` 重绘，放大倍数（1.1x ~ 2.0x）与重绘幅度（Denoise: 0.2 ~ 0.75）在面板中可精细微调，大幅提升画面细节与精细度。
- **直连 ComfyUI 原生引擎**：直接与标准 ComfyUI 服务（默认 `http://127.0.0.1:8188` 或远程局域网 IP）通信，无需任何代理或桥接程序。
- **自动探查资产与算法**：点击按钮即可自动从 ComfyUI 端点探查已安装的 Checkpoint 模型、LoRA 权重列表、采样器（Sampler）与调度算法（Scheduler），并在面板中以下拉列表呈现。
- **WebSocket 实时步数与进度推送**：通过 ComfyUI 原生 WebSocket 通道实时监听采样步数与执行进度（百分比与执行节点实时反馈），并辅以 `/history` 轮询双重兜底。

### 2. 🖼️ 自动标签解析与配图指示规范
- **精确标签识别**：智能捕获正文中的 `<image>` 配图标签：
  ```xml
  <image>image###sfw, 1girl, emilia \(re:zero\), silver hair, long hair, purple eyes, white flower hair ornament, purple and white dress, elf ears, standing in sunlit mansion hallway, gentle smile, looking at viewer###</image>
  ```
  自动清洗并提取核心提示词驱动后台异步生图，并在正文原位就地替换为精致的轮播生图卡片。
- **系统级上下文自动注入**：
  插件自动向酒馆上下文注入标准【自动配图指示】，模型无需繁琐配置即可稳定触发：
  ```text
  【自动配图指示】：在生成回复文字的同时，请你根据当前文字情景，自行判断是否需要为当前内容配图（最少1张，最多3张）。如果不需要配图则正常回复文字；如果需要配图，请直接在正文相应精彩位置嵌入生图标签：
  格式：<image>image###sfw/nsfw, 主体数量(如 1girl / 1girl, 1boy / 2girls), 人物名称(如 emilia \(re:zero\)), 图片英文tag###</image>
  示例：
  <image>image###sfw, 1girl, emilia \(re:zero\), silver hair, long hair, purple eyes, white flower hair ornament, purple and white dress, elf ears, standing in sunlit mansion hallway, gentle smile, looking at viewer###</image>
  【关键准则】：发出生图标签后，ComfyUI 会在后台异步生图并直接保存至 /sdcard/Download/DSHA/ 目录。你**完全无需等待生图结果**，必须**立即继续向下输出你的后续文字回复**！
  ```
- **一键复制提示词**：配置面板内提供一键复制按钮，可随时复制配图指示直接粘贴至角色卡、Persona 或世界书。

### 3. 📱 移动端与桌面端交互轮播卡片
- **多图手势滑动轮播**：支持单次生成 1 ~ 3 张图片，在移动设备上支持**手指左右滑动**切换，桌面端支持点击翻页与圆点直达。
- **画面计数角标**：右上角半透明磨砂徽章清晰标示当前位置（如 `1 / 3`）。
- **全屏沉浸灯箱 (Lightbox)**：点击卡片任意图片即可调出沉浸式大图灯箱，支持新标签查看原图与一键下载保存。
- **一键重试与快捷生图**：
  - 遇到不理想画面随时点击 `🔄 重新尝试`。
  - 每条 AI 消息工具栏内置 `🎨` 按钮，点击即可根据当条回复或自定义提示词即时生图。
  - 支持 `/comfy <提示词>` 斜杠命令在输入框中随时触发。

### 4. 🔊 纯净独立 TTS 语音朗读
- **三大独立引擎架构**：
  - **小米 MiMo 在线 TTS（原厂高品质拟真人声 · 推荐）**：
    - 官方直连（支持跨域 CORS 原生访问，免反代免桥接）：支持填入小米开放平台 API Key。
    - **三款模型系列**：
      - `mimo-v2.5-tts`：内置高质量音色（冰糖、茉莉、Mia、Chloe、Milo、Dean 及自定义），**支持开启唱歌模式**（自动注入 `(唱歌)` 旋律前缀）；
      - `mimo-v2.5-tts-voicedesign`：语音设计模式，通过文本 Prompt 描述自定义音色生成专属语音；
      - `mimo-v2.5-tts-voiceclone`：语音克隆模式，传入参考音频 Base64 数据复刻真实音色。
  - **Web Speech API**：浏览器原生引擎，零网络开销、零延迟、开箱即用，自动枚举当前设备所有优质多语种发音人。
  - **OpenAI 兼容协议音频服务**：直连标准 `/v1/audio/speech` 端点（适配 Edge-TTS、CosyVoice、GPT-SoVITS、Fish-Speech 等）。
- **划选浮动胶囊**：手机手滑划选文字、电脑鼠标选中文本时，在划选区域就地升起磨砂蓝光胶囊 `🔊 朗读选中文字`。
- **正在播放动效**：播放时胶囊自动变更为红色呼吸波纹 `⏹ 停止朗读`，随点随停。
- **全局常驻指示条**：屏幕右下角自动展示 `🔊 正在朗读… [点击停止]`，页面滚动也不影响一键中止。
- **整条消息一键朗读**：消息工具栏内置 `🔊` 按钮，自动过滤 `<think>` 思考过程、代码块与 `<image>` 标签，只字正腔圆朗读纯净叙事正文。
- **斜杠命令支持**：支持输入 `/tts <文本>` 随时调用朗读。

---

## ⚙️ 原生酒馆配置面板参数详解

在酒馆右侧抽屉 **Extensions Settings** 或顶部魔杖菜单中展开 **ComfyUI 绘图 & TTS 语音朗读**：

| 配置板块 | 参数项 | 说明 |
| :--- | :--- | :--- |
| **ComfyUI 服务与模型** | ComfyUI 服务地址 | ComfyUI 原生 API 端口，默认 `http://127.0.0.1:8188` |
| | 生图工作流 | 可选：标准文生图 / 文生图+多LoRA / 文生图+多LoRA+高清放大 (Hires Fix) |
| | Checkpoint 模型 | 支持手动输入或点击「测试与扫描」后从下拉框一键选择 |
| **多 LoRA 规则管理** | 添加/删除 LoRA 卡片 | 可无限添加角色 LoRA，独立开关启用/禁用、常驻生效 |
| | LoRA 模型与权重 | 模型文件下拉选择，提供 0.1~2.0 强度平滑滑块（Model / CLIP） |
| | 激活关键词 | 正文或提示词包含此关键词时（如 `柚木凪, 银发`），自动激活挂载 |
| | 角色特征激活词 | 激活时自动组合进正向提示词（如 `nagi, 1girl, silver hair...`） |
| **质量词与尺寸** | 固定正向质量词 | 默认 `(masterpiece, best quality, highly detailed), ` |
| | 画风后缀提示词 | 默认 `, 8k, photorealistic, cinematic lighting` |
| | 通用负向提示词 | 默认去畸变、坏手、低画质负向词库 |
| | 图像尺寸 | 提供 `512x768`、`768x1024`、`1024x1024`、`768x512` 快捷芯片与自定义宽高 |
| | 单次生成张数 | 1 ~ 3 张（生成后在卡片中手势滑动轮播） |
| | 采样步数与 CFG | 默认 20 步、CFG 7.0，采样器与调度算法下拉可调 |
| **高清潜空间放大** | 放大倍数 (Hires Scale) | 1.1x ~ 2.0x 潜空间双三次插值放大 |
| | 重绘幅度 (Denoise) | 0.2 ~ 0.75，推荐 0.45 保持主体一致并增加高频细节 |
| **配图指示与消息交互**| 自动生图开关 | 自动拦截消息中的 `<image>` 标签并立即启动后台渲染 |
| | 上下文自动注入 | 自动向提示词流末尾注入标准配图提示词模板 |
| | 复制配图指示 | 一键复制完整指令文本，方便导入到世界书或角色卡 |
| **TTS 语音朗读** | 引擎类型 | 小米 MiMo 在线 TTS / Web Speech API / OpenAI 兼容接口 |
| | 小米 MiMo 配置 | API Key、三款模型选择、内置音色（冰糖/茉莉等）、唱歌模式开关、音色设计 Prompt、声音克隆 Base64 |
| | 发音人与调节 | 本地发音人枚举选择、语速（0.5x~2.0x）与音调（0.5~1.5）平滑调节 |
| | 划选朗读 / 过滤思考 | 划选悬浮胶囊开关、整条消息朗读按钮开关、`<think>` 过滤开关 |

---

## 📦 安装与部署

### 电脑端 / 手机端 SillyTavern 纯净安装
直接克隆或下载解压至 SillyTavern 的第三方扩展目录：

```bash
cd <SillyTavern安装目录>/public/scripts/extensions/third-party/
git clone https://github.com/hhdsz0807/sillytavern-comfy-tts.git
```

目录层级结构：
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

## 💡 使用指南与快捷指令

### 1. 自动配图
只需保持配置面板中的「自动向 AI 上下文注入【自动配图指示】」开启，AI 在生成精彩情节时便会输出：
```text
<image>image###sfw, 1girl, emilia \(re:zero\), silver hair, long hair, purple eyes, white flower hair ornament, purple and white dress, elf ears, standing in sunlit mansion hallway, gentle smile, looking at viewer###</image>
```
插件会即时捕获该标签，将其渲染为优雅的轮播卡片，并向 ComfyUI 提交渲染任务。

### 2. 手动与快捷操作
- **消息工具栏生图**：点击消息右下角的 `🎨` 图标，输入任意自定义提示词即可为当条消息生成配图。
- **斜杠命令生图**：在对话输入框中输入 `/comfy 1girl, masterpiece, city night` 即可快速出图。
- **划选朗读**：长按或鼠标拖动选中任意聊天段落，点击弹出的 `🔊 朗读选中文字` 胶囊。
- **整条消息朗读**：点击消息右下角的 `🔊` 图标，支持随点随停。
- **斜杠命令朗读**：输入 `/tts 想要朗读的文本`。

---

## 🛠️ 后端服务连通性参考

| 服务 | 推荐配置 | 跨域要求 (CORS) |
| :--- | :--- | :--- |
| **ComfyUI** | 启动参数加上 `--listen 0.0.0.0 --enable-cors-header` | 浏览器直接跨域访问 ComfyUI 必需开启 `--enable-cors-header` |
| **Web Speech API** | 现代主流浏览器自带（Chrome、Edge、Safari、Kiwi 等） | 无需网络，零开销 |
| **OpenAI 兼容 TTS** | 本地或云端兼容服务（Edge-TTS、GPT-SoVITS 等） | 需确保服务允许来自酒馆域名的跨域请求 |

---

## 📄 开源许可证
MIT License.
