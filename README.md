# SillyTavern ComfyUI 绘图原生插件

> 🎨 **SillyTavern ComfyUI Draw Extension (`sillytavern-comfy-tts`)**  
> 专为 SillyTavern 酒馆打造的纯净原生插件：**100% 独立运行，不依赖任何外部宿主或中间桥接**，直连 ComfyUI 原生 API，前端逻辑全部闭环！

> ⚠️ **v3.1.0 起只保留 SDXL 文生图一条链路**。已移除：MOSS 文生图、TTS 语音朗读、MiniMax H3 图生视频、Qwen-Image 图像编辑。
> 老配置里对应的设置键会在首次加载时自动清理，其它配置不受影响。
>
> 🆕 **v3.2.0 新增「🎨 画风控制」**：一键切换 二次元 / 2.5D / 3D / 真人写实，自动往正向/负向提示词追加风格词。

---

## 🌟 核心特性

### 1. 🎨 内置原生 ComfyUI 高阶工作流引擎
- **文生图 + 链式多 LoRA + 高清潜空间放大（Hires Fix）**：
  - **动态模型链式装载**：根据当前角色或情景命中规则，自动在 `CheckpointLoaderSimple` 之后级联多个 `LoraLoader` 节点，平滑传递 `MODEL` 与 `CLIP` 管道（常驻 LoRA 无条件全量优先装载；**动态角色 LoRA 每张图严格只激活 1 个**，即使正文出现 1girl/1boy 双主体也绝不挂两个角色 LoRA，杜绝特征词串台导致的画风劣化与权重污染）。
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
  【自动配图指示】：在生成回复文字的同时，请你根据当前文字情景，自行判断是否需要为当前内容配图（最少1张，最多3张）。本插件配图为**行内情景插图**，必须严格遵循【插图就地嵌入与防污染规范】：
  1. **就地插入原则**：描述哪段文字情景，就必须将对应的生图标签**直接紧随插入在哪段文字正下方**，图文紧密呼应！**绝对严禁**将所有生图标签统一堆砌在文段末尾或整篇回复的最后面！
  2. **单主体与防污染规则（重要）**：**除非 2 个角色发生明确的肢体接触或互动动作**（如拥抱、牵手、坐在腿上、依偎等），**否则每次插图必须且只能描述 1 个角色主体**（如 1girl 或 1boy，搭配 solo）！英文 tag 必须完全聚焦于该单一角色，**绝对严禁在单人图片中混入其他任何角色的名称或特征词**，彻底杜绝提示词与特征污染（例如防止单人图误生其他角色的尾巴、发色或配饰）！
  3. **双人接触互动严格受限**：仅当情节中 2 个角色存在**直接身体接触或明确互动动作**时，才允许使用双主体标签（如 1girl, 1boy 或 2girls），并且必须在 tag 中明确写出两者具体的互动动作（如 hugging each other, holding hands, sitting on lap）。**严禁出现 3 个及以上角色**！
  4. **标签格式**：<image>image###sfw/nsfw, 主体数量(无身体接触必须为1人如 1girl, solo; 有接触时最多2人如 1girl, 1boy), 人物名称(无接触仅填当前1人; 有接触填2人), 动作与特征描述(如有2人必须描述具体互动动作), 图片英文tag###</image>
  【单人示例（默认常规，纯净无污染）】：
  <image>image###sfw, 1girl, solo, emilia \(re:zero\), silver hair, long hair, purple eyes, white flower hair ornament, purple and white dress, elf ears, standing in sunlit mansion hallway, gentle smile, looking at viewer###</image>
  【双人身体接触互动示例（仅在有明确接触动作时使用）】：
  <image>image###sfw, 1girl, 1boy, emilia \(re:zero\), subaru natsuki, 1boy holding hands with 1girl, 1girl sitting on 1boy lap, hugging each other, romantic garden bench, sunset, warm cinematic lighting###</image>
  【关键准则】：发出生图标签后，ComfyUI 会在后台异步生图并直接保存至 /sdcard/Download/DSHA/ 目录。你**完全无需等待生图结果**，插入标签后必须**立即继续向下输出你的后续文字回复**！
  ```
- **一键复制提示词**：配置面板内提供一键复制按钮，可随时复制配图指示直接粘贴至角色卡、Persona 或世界书。
- **防止重复生图与一键清空排队**：
  - **流式输出防抖熔断**：在 AI 流式打字期间严密锁定生图触发，杜绝因 Token 刷新造成的重复与无限刷图；
  - **唯一任务状态去重映射**：已生成或正在生成的插槽绝对不重复提交 ComfyUI；
  - **🛑 一键中止当前生图并清空排队**：在配置面板和加载中卡片均提供一键中断（调用 ComfyUI 原生 `/interrupt` 与清空 `/queue`），遇到误触或积压可一键秒停。

### 3. 📱 移动端与桌面端交互轮播卡片
- **多图手势滑动轮播**：支持单次生成 1 ~ 3 张图片，在移动设备上支持**手指左右滑动**切换，桌面端支持点击翻页与圆点直达。
- **画面计数角标**：右上角半透明磨砂徽章清晰标示当前位置（如 `1 / 3`）。
- **全屏沉浸灯箱 (Lightbox)**：点击卡片任意图片即可调出沉浸式大图灯箱，支持新标签查看原图与一键下载保存。
- **一键重试与快捷生图**：
  - 遇到不理想画面随时点击 `🔄 重新尝试`。
  - 每条 AI 消息工具栏内置 `🎨` 按钮，点击即可根据当条回复或自定义提示词即时生图。
  - 支持 `/comfy <提示词>` 斜杠命令在输入框中随时触发。

### 4. 🗂️ 生成图片管理
- 集中查看所有生成过的图片（插件记录含其它聊天、当前聊天、ComfyUI 本次输出）。
- 可搜索、看大图、下载、复制提示词、一键设为某个角色的 LoRA 预览图、从记录里删除。
- 手机本地图库（IndexedDB）缓存，服务器 output 被清理后依然能看。

### 5. 🎨 画风控制（v3.2.0）
设置面板 → 「✨ 固定质量提示词与出图尺寸」→ 顶部一排芯片，点一下即切换：

| 档位 | 正向追加 | 负向追加 |
| :--- | :--- | :--- |
| **不控制**（默认） | 无 | 无 |
| **二次元** | `anime style, japanese anime, cel shading, clean lineart, flat color, 2d illustration, anime coloring` | `photorealistic, realistic, 3d, cgi, render, photo, photograph, real person, live action, depth of field, bokeh` |
| **2.5D** | `2.5d, semi-realistic, stylized 3d render, soft shading, subsurface scattering, volumetric lighting, detailed illustration, painterly` | `flat color, cel shading, pure lineart, cartoon, chibi, sketch, monochrome` |
| **3D** | `3d render, cgi, octane render, unreal engine, physically based rendering, subsurface scattering, volumetric lighting, ray tracing, high poly, detailed 3d model` | `anime, cel shading, flat color, 2d, lineart, sketch, drawing, illustration, painting, hand drawn` |
| **真人写实** | `photorealistic, realistic photo, raw photo, photograph, real person, live action, natural skin texture, skin pores, detailed face, 85mm lens, shallow depth of field, film grain, professional photography` | `anime, cartoon, 3d render, cgi, illustration, painting, drawing, sketch, cel shading, flat color, doll, plastic skin, oversaturated` |

**设计要点**：

- **只追加、不覆盖** —— 你自己填的「固定正向质量词」「画风后缀」「通用负向词」全部保留，风格词拼在最前面（SDXL 里靠前 token 权重更高）。
- **正向 + 负向双向约束** —— 光加正向词不够，模型仍会往原画风漂；负向词把对立风格压掉才稳。
- **`不控制` = 完全不动** —— 行为和加这个功能之前一模一样，老用户升级后不会突然变画风。
- **切换即时生效** —— 点完芯片，下一次出图就用新画风，不用重启。

> ⚠️ **画风上限由底模决定**：用 Illustrious / Pony 这类动漫底模，选「真人写实」也只能出半写实；要真写实得换 SDXL 写实底模（如 Juggernaut、RealVisXL）。

---

## ⚙️ 原生酒馆配置面板参数详解

在酒馆右侧抽屉 **Extensions Settings** 或顶部魔杖菜单中展开 **ComfyUI 绘图**：

| 配置板块 | 参数项 | 说明 |
| :--- | :--- | :--- |
| **ComfyUI 服务与模型** | ComfyUI 服务地址 | ComfyUI 原生 API 端口，默认 `http://127.0.0.1:8188` |
| | 生图工作流 | 可选：标准文生图 / 文生图+多LoRA / 文生图+多LoRA+高清放大 (Hires Fix) |
| | Checkpoint 模型 | 支持手动输入或点击「测试与扫描」后从下拉框一键选择 |
| | 外部 VAE | 留空 = 用模型自带；画面整体偏色/发灰/发绿时在这里指定 |
| **多 LoRA 规则管理** | 添加/删除 LoRA 卡片 | 可无限添加角色 LoRA，独立开关启用/禁用、常驻生效 |
| | LoRA 模型与权重 | 模型文件下拉选择，提供 0.1~2.0 强度平滑滑块（Model / CLIP） |
| | 激活关键词 | 正文或提示词包含此关键词时（如 `柚木凪, 银发`），自动激活挂载 |
| | 角色特征激活词 | 激活时自动组合进正向提示词（如 `nagi, 1girl, silver hair...`） |
| | 激活词分组 | 同一角色多套激活词（校服/泳装/便服…），出图时选其中一组生效 |
| **质量词与尺寸** | 🎨 画风控制 | 一键切换 不控制 / 二次元 / 2.5D / 3D / 真人写实，自动往正向+负向提示词追加风格词 |
| | 固定正向质量词 | 默认 `(masterpiece, best quality, highly detailed), ` |
| | 画风后缀提示词 | 默认 `, 8k, photorealistic, cinematic lighting` |
| | 通用负向提示词 | 默认去畸变、坏手、低画质负向词库 |
| | 图像尺寸 | 提供 `512x768`、`768x1024`、`1024x1024`、`768x512` 快捷芯片与自定义宽高 |
| | 单次生成张数 | 1 ~ 3 张（生成后在卡片中手势滑动轮播） |
| | 采样步数与 CFG | 默认 20 步、CFG 7.0，采样器与调度算法下拉可调 |
| **高清潜空间放大** | 放大倍数 (Hires Scale) | 1.1x ~ 2.0x 潜空间双三次插值放大 |
| | 重绘幅度 (Denoise) | 0.2 ~ 0.75，推荐 0.45 保持主体一致并增加高频细节 |
| **AI 自动配置** | AI 接口 / Key / 模型 | 任何 OpenAI 兼容 `/v1/chat/completions` 接口，用于「🤖 AI 自动配置 LoRA」 |
| | 一键配置全部 LoRA | 抓 C 站资料 → AI 生成激活词/特征词/分组 → 写入配置（串行限速） |
| **配图指示与消息交互**| 自动生图开关 | 自动拦截消息中的 `<image>` 标签并立即启动后台渲染 |
| | 上下文自动注入 | 自动向提示词流末尾注入标准配图提示词模板 |
| | 复制配图指示 | 一键复制完整指令文本，方便导入到世界书或角色卡 |

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
- **重新生成**：卡片底栏 `🔄 重新生成`，新图追加到轮播末尾，旧图仍可翻回去对比。
- **本次工作流**：卡片底栏 `🧩 本次工作流`，查看/复制本次实际提交的完整工作流 JSON 与参数。

---

## 🛠️ 后端服务连通性参考

| 服务 | 推荐配置 | 跨域要求 (CORS) |
| :--- | :--- | :--- |
| **ComfyUI** | 启动参数加上 `--listen 0.0.0.0 --enable-cors-header` | 浏览器直接跨域访问 ComfyUI 必需开启 `--enable-cors-header` |

---

## 📄 开源许可证
MIT License.
