/**
 * SillyTavern ComfyUI 绘图 & TTS 语音朗读原生插件 (sillytavern-comfy-tts)
 * 
 * 核心功能：
 * 1. ComfyUI 原生工作流引擎 (文生图 + 多 LoRA + 高清放大 Hires Fix)：
 *    - 直连标准 ComfyUI 服务（默认 8188 端口或远程 IP）；
 *    - 自动探查与下拉选择 Checkpoint 模型、采样器（Sampler）与调度算法（Scheduler）；
 *    - 多 LoRA 规则管理：可视化配置多个 LoRA 权重、关键词匹配（正文出现该关键词自动激活该角色 LoRA 并将角色特征注入正向提示词）；
 *    - 固定正向/负向质量提示词、画风前缀后缀；
 *    - 可调节图像尺寸（内置常用比例芯片与自定义宽高）、单次生图张数（1~3 张轮播切换）；
 *    - 高清放大倍数设置（Hires Fix 1.0x~2.0x 与重绘幅度调整）；
 *    - 自动识别正文 `<image>image###sfw, tag###</image>` 标签自动后台异步出图，手势多图轮播卡片、全屏大图灯箱预览；
 *    - 自动配图指令注入与一键复制；消息栏「🎨」快捷绘图与 /comfy 斜杠命令。
 * 
 * 2. 纯净独立 TTS 语音朗读：
 *    - 原生 Web Speech API（零配置无延迟、支持系统全语种发音人）与 OpenAI 兼容格式音频服务；
 *    - 划选文本就地弹出「🔊 朗读选中文字」浮动胶囊（带播放波纹动效与随点随停）；
 *    - 消息栏「🔊」一键朗读（智能剥离 <think> 思考链、代码块与图像标签）；
 *    - 屏幕右下角全局播放/停止常驻指示条与 /tts 斜杠命令。
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__sctExtensionLoaded) return;
  window.__sctExtensionLoaded = true;

  const MODULE_NAME = 'sillytavern-comfy-tts';
  const DISPLAY_NAME = 'ComfyUI 绘图 & TTS 语音朗读';

  // 默认自动配图指示词 (必须使用 <image> 标签包裹)
  const DEFAULT_IMAGE_INSTRUCTION = `【自动配图指示】：在生成回复文字的同时，请你根据当前文字情景，自行判断是否需要为当前内容配图（最少1张，最多3张）。如果不需要配图则正常回复文字；如果需要配图，请直接在正文相应精彩位置嵌入生图标签：\n格式：<image>image###sfw/nsfw, 主体数量(如 1girl / 1girl, 1boy / 2girls), 人物名称(如 emilia \\(re:zero\\)), 图片英文tag###</image>\n示例：\n<image>image###sfw, 1girl, emilia \\(re:zero\\), silver hair, long hair, purple eyes, white flower hair ornament, purple and white dress, elf ears, standing in sunlit mansion hallway, gentle smile, looking at viewer###</image>\n【关键准则】：发出生图标签后，ComfyUI 会在后台异步生图并直接保存至 /sdcard/Download/DSHA/ 目录。你**完全无需等待生图结果**，必须**立即继续向下输出你的后续文字回复**！`;

  // 默认配置
  const DEFAULT_SETTINGS = {
    // ComfyUI 服务与工作流设置
    comfyEnabled: true,
    comfyHost: 'http://127.0.0.1:8188',
    comfyWorkflow: 'txt2img_multilora', // 'txt2img' | 'txt2img_multilora' | 'txt2img_multilora_hires'
    comfyCheckpoint: '',
    comfyAutoDrawTags: true,
    comfyShowMesButton: true,
    
    // 固定的正向、负向质量提示词与前后缀
    comfyFixedPositive: '(masterpiece, best quality, highly detailed), ',
    comfyPromptSuffix: ', 8k, photorealistic, cinematic lighting',
    comfyFixedNegative: '(worst quality, low quality:1.4), deformed, bad anatomy, bad hands, missing fingers, extra limbs, blurry, cropped, watermark, normal quality, username',
    
    // 图像尺寸与生成张数
    comfyWidth: 512,
    comfyHeight: 768,
    comfyBatchCount: 1, // 1~3 张，轮播切换

    // 采样核心参数
    comfySteps: 20,
    comfyCfg: 7.0,
    comfySampler: 'euler',
    comfyScheduler: 'normal',

    // 高清放大倍数设置 (Hires Fix)
    comfyHiresEnabled: false,
    comfyHiresScale: 1.5,
    comfyHiresDenoise: 0.45,

    // 多 LoRA 规则库 (Array of LoRA objects)
    // 结构: [{ id, name, strengthModel, strengthClip, keywords, triggerWords, enabled, alwaysOn }]
    comfyLoras: [
      {
        id: 'default_lora_1',
        name: '',
        strengthModel: 0.8,
        strengthClip: 0.8,
        keywords: '柚木凪, 凪, nagi, 银发',
        triggerWords: 'nagi, 1girl, solo, silver hair, purple eyes, school uniform',
        enabled: true,
        alwaysOn: false
      }
    ],

    // 自动配图指令注入
    autoInjectImageInstruction: true,
    imageInstructionText: DEFAULT_IMAGE_INSTRUCTION,

    // TTS 语音朗读设置
    ttsEnabled: true,
    ttsFloatingSelection: true,
    ttsShowMesButton: true,
    ttsFilterThinking: true,
    ttsEngine: 'webspeech', // 'webspeech' | 'openai'
    ttsVoice: '',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    ttsVolume: 1.0,
    ttsOpenAiEndpoint: '',
    ttsOpenAiKey: '',
    ttsOpenAiModel: 'tts-1',
    ttsOpenAiVoice: 'alloy',
  };

  // 运行期全局缓存与状态
  let currentUtterance = null;
  let currentAudio = null;
  let isTtsPlaying = false;
  let currentPlayingText = '';
  let ttsButton = null;
  let playingBadge = null;
  let selectedTextCache = '';
  let lastActionTime = 0;
  let lightboxEl = null;

  // 探查到的 ComfyUI 资产缓存
  let cachedCheckpoints = [];
  let cachedLoras = [];
  let cachedSamplers = [];
  let cachedSchedulers = [];

  /* ==========================================================================
     1. 上下文与设置管理 (Context & Settings)
     ========================================================================== */

  function getSTContext() {
    if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
      try { return SillyTavern.getContext(); } catch (_) {}
    }
    return null;
  }

  function getSettings() {
    const ctx = getSTContext();
    const extSettings = ctx?.extensionSettings || (typeof extension_settings !== 'undefined' ? extension_settings : null);
    if (extSettings) {
      if (!extSettings[MODULE_NAME]) {
        extSettings[MODULE_NAME] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      } else {
        extSettings[MODULE_NAME] = Object.assign({}, DEFAULT_SETTINGS, extSettings[MODULE_NAME]);
        if (!Array.isArray(extSettings[MODULE_NAME].comfyLoras)) {
          extSettings[MODULE_NAME].comfyLoras = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.comfyLoras));
        }
        if (!extSettings[MODULE_NAME].imageInstructionText || !extSettings[MODULE_NAME].imageInstructionText.includes('emilia')) {
          extSettings[MODULE_NAME].imageInstructionText = DEFAULT_IMAGE_INSTRUCTION;
        }
      }
      return extSettings[MODULE_NAME];
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function saveSettings(patch) {
    const s = getSettings();
    Object.assign(s, patch);
    const ctx = getSTContext();
    if (ctx && typeof ctx.saveSettingsDebounced === 'function') {
      ctx.saveSettingsDebounced();
    } else if (typeof saveSettingsDebounced === 'function') {
      saveSettingsDebounced();
    }
    updateExtensionPrompt();
  }

  function getCleanComfyHost() {
    const s = getSettings();
    let host = (s.comfyHost || 'http://127.0.0.1:8188').trim().replace(/\/+$/, '');
    if (!host.startsWith('http://') && !host.startsWith('https://')) {
      host = 'http://' + host;
    }
    return host;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg, type = 'info') {
    if (typeof toastr !== 'undefined') {
      if (type === 'error') toastr.error(msg, DISPLAY_NAME);
      else if (type === 'success') toastr.success(msg, DISPLAY_NAME);
      else if (type === 'warning') toastr.warning(msg, DISPLAY_NAME);
      else toastr.info(msg, DISPLAY_NAME);
      return;
    }
    console.log(`[${DISPLAY_NAME}] [${type}]`, msg);
  }

  /* ==========================================================================
     2. 自动配图指令注入 (System Prompt Guidance Injection)
     ========================================================================== */

  function updateExtensionPrompt() {
    const s = getSettings();
    const ctx = getSTContext();
    if (!ctx) return;

    if (s.autoInjectImageInstruction && s.comfyEnabled) {
      const text = s.imageInstructionText || DEFAULT_IMAGE_INSTRUCTION;
      if (typeof ctx.setExtensionPrompt === 'function') {
        // 注入在上下文尾部，确保模型严格遵守输出规范
        ctx.setExtensionPrompt(MODULE_NAME, `\n${text}\n`, 1, 0, false);
      }
    } else {
      if (typeof ctx.setExtensionPrompt === 'function') {
        ctx.setExtensionPrompt(MODULE_NAME, '', 1, 0, false);
      }
    }
  }

  /* ==========================================================================
     3. 全屏大图灯箱预览 (Lightbox Viewer)
     ========================================================================== */

  function ensureLightbox() {
    if (lightboxEl) return lightboxEl;
    const overlay = document.createElement('div');
    overlay.id = 'sct-lightbox';
    overlay.className = 'sct-lightbox-overlay';
    overlay.innerHTML = `
      <div class="sct-lightbox-content">
        <button type="button" class="sct-lightbox-close-btn" title="关闭 (Esc)">✕</button>
        <img id="sct-lightbox-img" src="" alt="ComfyUI Preview" />
        <div class="sct-lightbox-toolbar">
          <button type="button" class="sct-comfy-btn" id="sct-lightbox-open-raw">🔗 查看原图</button>
          <button type="button" class="sct-comfy-btn" id="sct-lightbox-download">💾 保存图片</button>
        </div>
      </div>
    `;

    overlay.querySelector('.sct-lightbox-close-btn').addEventListener('click', closeLightbox);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) {
        closeLightbox();
      }
    });

    overlay.querySelector('#sct-lightbox-open-raw').addEventListener('click', () => {
      const src = overlay.querySelector('#sct-lightbox-img').src;
      if (src) window.open(src, '_blank');
    });

    overlay.querySelector('#sct-lightbox-download').addEventListener('click', () => {
      const src = overlay.querySelector('#sct-lightbox-img').src;
      if (!src) return;
      const a = document.createElement('a');
      a.href = src;
      a.download = `comfy_${Date.now()}.png`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    (document.body || document.documentElement).appendChild(overlay);
    lightboxEl = overlay;
    return overlay;
  }

  function openLightbox(imgUrl) {
    const lb = ensureLightbox();
    const img = lb.querySelector('#sct-lightbox-img');
    img.src = imgUrl;
    lb.classList.add('active');
  }

  function closeLightbox() {
    if (lightboxEl) lightboxEl.classList.remove('active');
  }

  /* ==========================================================================
     4. 标签解析与关键词匹配 (Tag Parsing & LoRA Keyword Matching)
     ========================================================================== */

  // 解析并提取生图标签内容（兼容纯文本 image###...###、带标签 <image>image###...###</image> 及常规格式）
  function parseImageTagContent(rawContent) {
    let s = (rawContent || '').trim();
    // 反转义 HTML 实体字符
    s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    // 清除可能存在的 markdown 代码块包裹与反引号
    s = s.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    s = s.replace(/^`+|`+$/g, '').trim();
    // 匹配并剥离 image###...### 或 ###...### 模式
    const m = s.match(/^image###([\s\S]*?)###$/i) || s.match(/###([\s\S]*?)###/);
    if (m) {
      s = m[1].trim();
    } else if (s.startsWith('image###')) {
      s = s.replace(/^image###/i, '').replace(/###$/i, '').trim();
    }
    return s;
  }

  // 检测上下文正文或提示词中是否命中了 LoRA 激活关键词
  function detectActiveLoras(fullText, promptText) {
    const s = getSettings();
    const loras = s.comfyLoras || [];
    const activeList = [];
    const lowerContext = `${fullText} ${promptText}`.toLowerCase();

    loras.forEach((item) => {
      if (!item.enabled || !item.name) return;
      if (item.alwaysOn) {
        activeList.push(item);
        return;
      }
      if (!item.keywords) return;
      const kws = item.keywords.split(/[,，\n|]/).map(k => k.trim().toLowerCase()).filter(Boolean);
      const isMatched = kws.some(k => lowerContext.includes(k));
      if (isMatched) {
        activeList.push(item);
      }
    });

    return activeList;
  }

  /* ==========================================================================
     5. ComfyUI 原生工作流动态组装 (Dynamic ComfyUI Graph Builder)
     ========================================================================== */

  // 探查 ComfyUI 已安装的各类模型与算法
  async function scanComfyAssets(host) {
    const results = { checkpoints: [], loras: [], samplers: [], schedulers: [] };
    try {
      // 探查 Checkpoints
      const ckptRes = await fetch(`${host}/object_info/CheckpointLoaderSimple`);
      if (ckptRes.ok) {
        const d = await ckptRes.json();
        results.checkpoints = d?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
      }
    } catch (_) {}

    try {
      // 探查 LoRAs
      const loraRes = await fetch(`${host}/object_info/LoraLoader`);
      if (loraRes.ok) {
        const d = await loraRes.json();
        results.loras = d?.LoraLoader?.input?.required?.lora_name?.[0] || [];
      }
    } catch (_) {}

    try {
      // 探查 Samplers & Schedulers
      const samplerRes = await fetch(`${host}/object_info/KSampler`);
      if (samplerRes.ok) {
        const d = await samplerRes.json();
        results.samplers = d?.KSampler?.input?.required?.sampler_name?.[0] || [];
        results.schedulers = d?.KSampler?.input?.required?.scheduler?.[0] || [];
      }
    } catch (_) {}

    cachedCheckpoints = results.checkpoints;
    cachedLoras = results.loras;
    cachedSamplers = results.samplers;
    cachedSchedulers = results.schedulers;

    return results;
  }

  // 动态组装 ComfyUI 工作流 (文生图 + 多 LoRA + 高清放大 Hires Fix)
  function buildComfyWorkflow(params) {
    const {
      checkpoint,
      positivePrompt,
      negativePrompt,
      width,
      height,
      batchSize,
      steps,
      cfg,
      sampler,
      scheduler,
      activeLoras,
      hiresEnabled,
      hiresScale,
      hiresDenoise,
      seed
    } = params;

    const workflow = {};

    // 1. Checkpoint Loader (Node 4)
    workflow["4"] = {
      "class_type": "CheckpointLoaderSimple",
      "inputs": {
        "ckpt_name": checkpoint
      }
    };

    let currentModel = ["4", 0];
    let currentClip = ["4", 1];
    let currentVae = ["4", 2];

    // 2. 多 LoRA 链式装载器 (Nodes 100, 101, 102...)
    if (activeLoras && activeLoras.length > 0) {
      activeLoras.forEach((lora, idx) => {
        const loraNodeId = String(100 + idx);
        workflow[loraNodeId] = {
          "class_type": "LoraLoader",
          "inputs": {
            "model": currentModel,
            "clip": currentClip,
            "lora_name": lora.name,
            "strength_model": parseFloat(lora.strengthModel) || 0.8,
            "strength_clip": parseFloat(lora.strengthClip) || 0.8
          }
        };
        currentModel = [loraNodeId, 0];
        currentClip = [loraNodeId, 1];
      });
    }

    // 3. Positive CLIPTextEncode (Node 6)
    workflow["6"] = {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": currentClip,
        "text": positivePrompt
      }
    };

    // 4. Negative CLIPTextEncode (Node 7)
    workflow["7"] = {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": currentClip,
        "text": negativePrompt
      }
    };

    // 5. EmptyLatentImage (Node 5)
    workflow["5"] = {
      "class_type": "EmptyLatentImage",
      "inputs": {
        "batch_size": batchSize,
        "height": height,
        "width": width
      }
    };

    // 6. 基础 KSampler (Node 3)
    workflow["3"] = {
      "class_type": "KSampler",
      "inputs": {
        "cfg": cfg,
        "denoise": 1.0,
        "latent_image": ["5", 0],
        "model": currentModel,
        "negative": ["7", 0],
        "positive": ["6", 0],
        "sampler_name": sampler,
        "scheduler": scheduler,
        "seed": seed,
        "steps": steps
      }
    };

    let lastLatent = ["3", 0];

    // 7. 高清放大分支 (Hires Fix: LatentUpscaleBy + 2nd KSampler)
    if (hiresEnabled && hiresScale > 1.0) {
      // Node 200: LatentUpscaleBy
      workflow["200"] = {
        "class_type": "LatentUpscaleBy",
        "inputs": {
          "samples": ["3", 0],
          "scale_by": hiresScale,
          "upscale_method": "bicubic"
        }
      };

      // Node 201: Second KSampler for Hires Fix
      const hiresSteps = Math.max(12, Math.round(steps * 0.7));
      workflow["201"] = {
        "class_type": "KSampler",
        "inputs": {
          "cfg": cfg,
          "denoise": hiresDenoise,
          "latent_image": ["200", 0],
          "model": currentModel,
          "negative": ["7", 0],
          "positive": ["6", 0],
          "sampler_name": sampler,
          "scheduler": scheduler,
          "seed": seed + 1,
          "steps": hiresSteps
        }
      };

      lastLatent = ["201", 0];
    }

    // 8. VAE Decode (Node 8)
    workflow["8"] = {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": lastLatent,
        "vae": currentVae
      }
    };

    // 9. SaveImage (Node 9)
    workflow["9"] = {
      "class_type": "SaveImage",
      "inputs": {
        "filename_prefix": "SillyTavern",
        "images": ["8", 0]
      }
    };

    return workflow;
  }

  /* ==========================================================================
     6. 轮播展示卡片与生图调度 (Carousel Card & Generation Dispatcher)
     ========================================================================== */

  const cardStateMap = new Map();

  function renderCarouselCard(container, images, promptText, activeLoras = []) {
    if (!images || images.length === 0) return;
    const cardId = container.dataset.sctCardId || `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    container.dataset.sctCardId = cardId;

    let state = cardStateMap.get(cardId);
    if (!state) {
      state = { currentIdx: 0, images: images, prompt: promptText, loras: activeLoras };
      cardStateMap.set(cardId, state);
    } else {
      state.images = images;
    }

    const total = images.length;
    const safeIdx = ((state.currentIdx % total) + total) % total;
    state.currentIdx = safeIdx;
    const currentUrl = images[safeIdx];

    const loraBadgeHtml = activeLoras && activeLoras.length > 0 
      ? `<span style="font-size:10px; background:rgba(168,85,247,0.3); border:1px solid rgba(168,85,247,0.5); padding:1px 6px; border-radius:8px; color:#f0abfc;">LoRA: ${activeLoras.map(l => l.name.replace(/\.[^/.]+$/, '')).join(', ')}</span>`
      : '';

    container.innerHTML = `
      <div class="sct-comfy-card">
        <div class="sct-comfy-card-header">
          <div class="sct-title">
            <span>🎨</span>
            <span>ComfyUI 生图</span>
            ${loraBadgeHtml}
          </div>
          <div class="sct-prompt-preview" title="${encodeURIComponent(promptText)}">
            ${promptText.slice(0, 45)}...
          </div>
        </div>
        <div class="sct-comfy-viewport" id="vp_${cardId}">
          <img src="${currentUrl}" alt="ComfyUI Image ${safeIdx + 1}" />
          ${total > 1 ? `<div class="sct-comfy-counter-badge">${safeIdx + 1} / ${total}</div>` : ''}
        </div>
        <div class="sct-comfy-footer">
          ${total > 1 ? `
            <button type="button" class="sct-comfy-btn sct-prev-btn">◀ 上一张</button>
            <div class="sct-comfy-dots">
              ${images.map((_, i) => `<span class="sct-comfy-dot ${i === safeIdx ? 'active' : ''}" data-idx="${i}"></span>`).join('')}
            </div>
            <button type="button" class="sct-comfy-btn sct-next-btn">下一张 ▶</button>
          ` : `
            <span style="font-size: 11px; opacity: 0.5;">点击图片放大查看</span>
            <button type="button" class="sct-comfy-btn sct-retry-btn">🔄 重新生成</button>
          `}
        </div>
      </div>
    `;

    const vp = container.querySelector(`#vp_${cardId}`);
    vp.querySelector('img').addEventListener('click', () => openLightbox(currentUrl));

    // 触摸滑动 (Touch Swipe)
    let touchStartX = 0;
    vp.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) touchStartX = e.touches[0].clientX;
    }, { passive: true });

    vp.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches.length > 0 && total > 1) {
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (diff > 45) {
          state.currentIdx = (state.currentIdx - 1 + total) % total;
          renderCarouselCard(container, images, promptText, activeLoras);
        } else if (diff < -45) {
          state.currentIdx = (state.currentIdx + 1) % total;
          renderCarouselCard(container, images, promptText, activeLoras);
        }
      }
    }, { passive: true });

    const prevBtn = container.querySelector('.sct-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.currentIdx = (state.currentIdx - 1 + total) % total;
        renderCarouselCard(container, images, promptText, activeLoras);
      });
    }

    const nextBtn = container.querySelector('.sct-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.currentIdx = (state.currentIdx + 1) % total;
        renderCarouselCard(container, images, promptText, activeLoras);
      });
    }

    container.querySelectorAll('.sct-comfy-dot').forEach((dot) => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(dot.dataset.idx, 10);
        if (!isNaN(idx)) {
          state.currentIdx = idx;
          renderCarouselCard(container, images, promptText, activeLoras);
        }
      });
    });

    const retryBtn = container.querySelector('.sct-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerComfyDraw(promptText, container, activeLoras);
      });
    }
  }

  function renderLoadingCard(container, promptText, progressText = '🎨 ComfyUI 正在后台生成画面…') {
    container.innerHTML = `
      <div class="sct-comfy-card">
        <div class="sct-comfy-loading">
          <div class="sct-spinner"></div>
          <div class="sct-loading-text">${progressText}</div>
          <div class="sct-loading-hint">提示词: ${promptText.slice(0, 50)}...</div>
        </div>
      </div>
    `;
  }

  function renderErrorCard(container, promptText, err, activeLoras) {
    container.innerHTML = `
      <div class="sct-comfy-card">
        <div class="sct-comfy-error">
          <div class="sct-comfy-error-header">
            <span>⚠️</span>
            <span>ComfyUI 生图失败</span>
          </div>
          <div style="opacity: 0.8; font-size: 12px; margin-bottom: 8px;">${err || '未能连接到 ComfyUI 服务'}</div>
          <button type="button" class="sct-comfy-btn sct-error-retry">🔄 重新尝试</button>
        </div>
      </div>
    `;
    container.querySelector('.sct-error-retry').addEventListener('click', () => {
      triggerComfyDraw(promptText, container, activeLoras);
    });
  }

  // 触发 ComfyUI 生图任务
  async function triggerComfyDraw(promptText, container, explicitActiveLoras = null) {
    const s = getSettings();
    if (!s.comfyEnabled) {
      showToast('ComfyUI 绘图功能未开启', 'warning');
      return;
    }

    renderLoadingCard(container, promptText, '🎨 正在构建工作流并连接 ComfyUI…');

    const comfyHost = getCleanComfyHost();
    const batch = Math.min(3, Math.max(1, s.comfyBatchCount || 1));
    const width = s.comfyWidth || 512;
    const height = s.comfyHeight || 768;
    const steps = s.comfySteps || 20;
    const cfg = s.comfyCfg || 7.0;
    const sampler = s.comfySampler || 'euler';
    const scheduler = s.comfyScheduler || 'normal';
    const seed = Math.floor(Math.random() * 1000000000);

    // 确定启用的 LoRA 列表与特征词注入
    const activeLoras = explicitActiveLoras || detectActiveLoras(container.closest('.mes')?.querySelector('.mes_text')?.textContent || '', promptText);
    
    // 注入 LoRA 角色特征词到正向提示词中
    const loraTriggerWords = activeLoras.map(l => l.triggerWords).filter(Boolean).join(', ');
    const loraInjection = loraTriggerWords ? `${loraTriggerWords}, ` : '';
    
    // 组合正向提示词：固定质量词 + LoRA 角色特征词 + 提取的标签提示词 + 后缀
    const fullPositivePrompt = `${s.comfyFixedPositive || ''}${loraInjection}${promptText}${s.comfyPromptSuffix || ''}`.trim();
    const negativePrompt = s.comfyFixedNegative || '';

    // 探查可用 Checkpoint
    let ckpt = s.comfyCheckpoint || '';
    if (!ckpt) {
      if (cachedCheckpoints.length === 0) {
        await scanComfyAssets(comfyHost);
      }
      ckpt = cachedCheckpoints[0] || 'v1-5-pruned-emaonly.safetensors';
    }

    // 是否开启高清放大
    const hiresEnabled = s.comfyWorkflow === 'txt2img_multilora_hires' || s.comfyHiresEnabled;
    const hiresScale = parseFloat(s.comfyHiresScale) || 1.5;
    const hiresDenoise = parseFloat(s.comfyHiresDenoise) || 0.45;

    // 动态生成标准 ComfyUI 工作流
    const workflow = buildComfyWorkflow({
      checkpoint: ckpt,
      positivePrompt: fullPositivePrompt,
      negativePrompt: negativePrompt,
      width: width,
      height: height,
      batchSize: batch,
      steps: steps,
      cfg: cfg,
      sampler: sampler,
      scheduler: scheduler,
      activeLoras: activeLoras,
      hiresEnabled: hiresEnabled,
      hiresScale: hiresScale,
      hiresDenoise: hiresDenoise,
      seed: seed
    });

    const clientId = 'st_' + Math.random().toString(36).slice(2, 10);

    try {
      // 1. 尝试建立 WebSocket 实时进度接收
      let ws = null;
      try {
        const wsUrl = comfyHost.replace(/^http/i, 'ws') + `/ws?clientId=${clientId}`;
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'progress') {
              const { value, max } = msg.data;
              const percent = Math.round((value / max) * 100);
              renderLoadingCard(container, promptText, `🎨 正在采样渲染: ${value}/${max} 步 (${percent}%)`);
            } else if (msg.type === 'executing') {
              const node = msg.data.node;
              if (node === '3') renderLoadingCard(container, promptText, `🎨 执行基础 KSampler 采样…`);
              else if (node === '201') renderLoadingCard(container, promptText, `🔍 执行高清放大重绘采样…`);
              else if (node === '8') renderLoadingCard(container, promptText, `🎨 执行 VAE 解码输出…`);
            }
          } catch (_) {}
        };
      } catch (_) {}

      // 2. 提交任务至 ComfyUI /prompt
      const res = await fetch(`${comfyHost}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: clientId })
      });

      if (!res.ok) {
        throw new Error(`ComfyUI 响应异常 HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const promptId = data.prompt_id;
      if (!promptId) {
        if (data.node_errors && Object.keys(data.node_errors).length > 0) {
          throw new Error(`工作流节点配置异常: ${JSON.stringify(data.node_errors)}`);
        }
        throw new Error('未获取到 ComfyUI 任务 ID');
      }

      // 3. 轮询 /history/{promptId} 获取输出图像
      let pollCount = 0;
      const maxPoll = 160; // 160 * 1.5s = 240s
      const pollTimer = setInterval(async () => {
        pollCount++;
        if (pollCount > maxPoll) {
          clearInterval(pollTimer);
          if (ws) ws.close();
          renderErrorCard(container, promptText, '生图等待超时（超过 240 秒）', activeLoras);
          return;
        }

        try {
          const hRes = await fetch(`${comfyHost}/history/${promptId}`);
          if (!hRes.ok) return;
          const hData = await hRes.json();
          const task = hData[promptId];

          if (task && task.outputs && task.outputs['9'] && task.outputs['9'].images) {
            clearInterval(pollTimer);
            if (ws) ws.close();

            const images = task.outputs['9'].images.map((img) => 
              `${comfyHost}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`
            );

            renderCarouselCard(container, images, promptText, activeLoras);
            showToast(`ComfyUI 绘图成功！${activeLoras.length > 0 ? `(已加载 ${activeLoras.length} 个角色 LoRA)` : ''}`, 'success');
          }
        } catch (_) {}
      }, 1500);

    } catch (e) {
      renderErrorCard(container, promptText, e.message, activeLoras);
    }
  }

  /* ==========================================================================
     7. 消息 DOM 扫描与自动化处理 (Message Scanning & Tag Processing)
     ========================================================================== */

  function processSingleMessage(mesEl) {
    if (!mesEl) return;

    const s = getSettings();
    const textEl = mesEl.querySelector('.mes_text');
    if (!textEl) return;

    // 1. 扫描并替换生图标签 (同时完全兼容纯文本 image###...###、带标签 <image>...</image>、Markdown 代码包裹等多种形态)
    const textHtml = textEl.innerHTML;
    if (textHtml.includes('image###') || textHtml.includes('<image') || textHtml.includes('&lt;image') || textHtml.includes('img_prompt')) {
      const tagRegex = /(?:<pre>\s*)?(?:<code>)?\s*(?:<image>([\s\S]*?)<\/image>|&lt;image&gt;([\s\S]*?)&lt;\/image&gt;|<img_prompt>([\s\S]*?)<\/img_prompt>|&lt;img_prompt&gt;([\s\S]*?)&lt;\/img_prompt&gt;|(?:<img[^>]*>\s*)?image###([\s\S]*?)###(?:\s*<\/image>)?)\s*(?:<\/code>)?(?:\s*<\/pre>)?/gi;
      let match;
      const promptsToDraw = [];

      while ((match = tagRegex.exec(textHtml)) !== null) {
        const rawInner = match[1] || match[2] || match[3] || match[4] || match[5] || '';
        const cleanPrompt = parseImageTagContent(rawInner);
        if (cleanPrompt) {
          promptsToDraw.push({ raw: match[0], prompt: cleanPrompt });
        }
      }

      if (promptsToDraw.length > 0) {
        // 第一阶段：将所有匹配的标签一次性替换为插槽标记，避免循环内多次重写 innerHTML 破坏已插入的组件 DOM
        let replacedHtml = textEl.innerHTML;
        promptsToDraw.forEach((item, idx) => {
          replacedHtml = replacedHtml.replace(item.raw, `<div class="sct-comfy-slot" data-idx="${idx}"></div>`);
        });
        textEl.innerHTML = replacedHtml;

        // 第二阶段：在已更新的 DOM 中查找插槽并挂载卡片容器与启动生图
        promptsToDraw.forEach((item, idx) => {
          const cardContainer = document.createElement('div');
          cardContainer.className = 'sct-comfy-card-container';
          cardContainer.dataset.sctPrompt = item.prompt;

          const slot = textEl.querySelector(`.sct-comfy-slot[data-idx="${idx}"]`);
          if (slot) {
            const parent = slot.parentElement;
            if (parent && parent.tagName === 'P' && parent.children.length === 1 && parent.textContent.trim() === '') {
              parent.replaceWith(cardContainer);
            } else {
              slot.replaceWith(cardContainer);
            }
          } else {
            textEl.appendChild(cardContainer);
          }

          // 检测上下文激活的 LoRA
          const activeLoras = detectActiveLoras(textEl.textContent || '', item.prompt);

          if (s.comfyAutoDrawTags) {
            triggerComfyDraw(item.prompt, cardContainer, activeLoras);
          } else {
            cardContainer.innerHTML = `
              <div class="sct-comfy-card" style="padding: 12px; text-align: center;">
                <span style="font-size: 13px; color: #c084fc;">🎨 检测到绘画提示词: <i>${item.prompt.slice(0, 35)}...</i></span>
                <div style="margin-top: 8px;">
                  <button type="button" class="sct-comfy-btn sct-start-draw">立即开始生图</button>
                </div>
              </div>
            `;
            cardContainer.querySelector('.sct-start-draw').addEventListener('click', () => {
              triggerComfyDraw(item.prompt, cardContainer, activeLoras);
            });
          }
        });
      }
    }

    // 2. 注入消息工具栏操作按钮 (mes_buttons)
    const btnBar = mesEl.querySelector('.mes_buttons');
    if (btnBar) {
      if (s.ttsShowMesButton && !btnBar.querySelector('.sct-mes-tts-btn')) {
        const ttsBtn = document.createElement('div');
        ttsBtn.className = 'sct-mes-action-btn sct-mes-tts-btn';
        ttsBtn.textContent = '🔊';
        ttsBtn.title = '朗读此条消息';
        ttsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cleanText = cleanTextForTts(textEl.textContent || '');
          speakText(cleanText);
        });
        btnBar.appendChild(ttsBtn);
      }

      if (s.comfyShowMesButton && !btnBar.querySelector('.sct-mes-draw-btn')) {
        const drawBtn = document.createElement('div');
        drawBtn.className = 'sct-mes-action-btn sct-mes-draw-btn';
        drawBtn.textContent = '🎨';
        drawBtn.title = '为此条消息生成插图';
        drawBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const raw = textEl.textContent || '';
          const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().slice(0, 200);
          const userPrompt = prompt('请输入 ComfyUI 绘图提示词：', cleaned);
          if (userPrompt && userPrompt.trim()) {
            let container = mesEl.querySelector('.sct-comfy-card-container');
            if (!container) {
              container = document.createElement('div');
              container.className = 'sct-comfy-card-container';
              textEl.appendChild(container);
            }
            const activeLoras = detectActiveLoras(textEl.textContent || '', userPrompt.trim());
            triggerComfyDraw(userPrompt.trim(), container, activeLoras);
          }
        });
        btnBar.appendChild(drawBtn);
      }
    }
  }

  function scanAllMessages() {
    document.querySelectorAll('#chat .mes').forEach(processSingleMessage);
  }

  /* ==========================================================================
     8. TTS 语音朗读核心实现 (Web Speech API & OpenAI Audio)
     ========================================================================== */

  function cleanTextForTts(rawText) {
    if (!rawText) return '';
    let text = rawText;
    const s = getSettings();
    if (s.ttsFilterThinking) {
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
      text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
    }
    text = text.replace(/<image>[\s\S]*?<\/image>/gi, '');
    text = text.replace(/&lt;image&gt;[\s\S]*?&lt;\/image&gt;/gi, '');
    text = text.replace(/<img_prompt>[\s\S]*?<\/img_prompt>/gi, '');
    text = text.replace(/&lt;img_prompt&gt;[\s\S]*?&lt;\/img_prompt&gt;/gi, '');
    text = text.replace(/image###[\s\S]*?###/gi, '');
    text = text.replace(/###[\s\S]*?###/gi, '');
    text = text.replace(/```[\s\S]*?```/g, ' [代码块已省略] ');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    text = text.replace(/[*_~#]/g, '');
    return text.trim();
  }

  function setTtsPlayingState(playing, text = '') {
    isTtsPlaying = playing;
    currentPlayingText = playing ? text : '';

    if (ttsButton) {
      if (playing) {
        ttsButton.className = 'sct-tts-pill-btn sct-tts-playing';
        ttsButton.innerHTML = '<span>⏹</span> <span>停止朗读</span>';
      } else {
        ttsButton.className = 'sct-tts-pill-btn sct-tts-idle';
        ttsButton.innerHTML = '<span>🔊</span> <span>朗读选中文字</span>';
      }
    }

    const badge = getGlobalTtsBadge();
    if (badge) {
      if (playing) {
        badge.style.display = 'flex';
        badge.innerHTML = '<span>🔊</span> <span>正在朗读… [点击停止]</span>';
      } else {
        badge.style.display = 'none';
      }
    }

    document.querySelectorAll('.sct-mes-tts-btn').forEach((btn) => {
      const parentMes = btn.closest('.mes');
      const mesText = parentMes ? parentMes.querySelector('.mes_text')?.textContent || '' : '';
      if (playing && currentPlayingText && mesText.includes(currentPlayingText.slice(0, 30))) {
        btn.classList.add('sct-active');
        btn.textContent = '⏹';
        btn.title = '停止朗读';
      } else {
        btn.classList.remove('sct-active');
        btn.textContent = '🔊';
        btn.title = '朗读此条消息';
      }
    });
  }

  async function speakText(rawText) {
    const text = cleanTextForTts(rawText);
    if (!text) {
      showToast('没有可朗读的文本', 'warning');
      return;
    }

    const s = getSettings();
    if (!s.ttsEnabled) {
      showToast('TTS 语音功能已在插件设置中关闭', 'warning');
      return;
    }

    if (isTtsPlaying) {
      stopTts();
      return;
    }

    setTtsPlayingState(true, text);

    // 引擎分支 1：OpenAI 兼容协议
    if (s.ttsEngine === 'openai' && s.ttsOpenAiEndpoint) {
      try {
        const ep = s.ttsOpenAiEndpoint.trim().replace(/\/+$/, '');
        const url = ep.endsWith('/speech') ? ep : `${ep}/v1/audio/speech`;
        const headers = { 'Content-Type': 'application/json' };
        if (s.ttsOpenAiKey) headers['Authorization'] = `Bearer ${s.ttsOpenAiKey.trim()}`;

        const res = await fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model: s.ttsOpenAiModel || 'tts-1',
            input: text,
            voice: s.ttsOpenAiVoice || 'alloy',
            speed: s.ttsRate || 1.0,
            response_format: 'mp3'
          })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        currentAudio = audio;
        audio.volume = Math.min(1.0, Math.max(0, s.ttsVolume || 1.0));

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudio = null;
          setTtsPlayingState(false);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudio = null;
          setTtsPlayingState(false);
          showToast('音频解码播放失败', 'error');
        };

        await audio.play();
        return;
      } catch (err) {
        showToast(`OpenAI TTS 失败 (${err.message})，转为浏览器原生朗读`, 'warning');
      }
    }

    // 引擎分支 2：浏览器原生 Web Speech API
    if (typeof window.speechSynthesis !== 'undefined') {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        currentUtterance = utterance;

        utterance.rate = s.ttsRate || 1.0;
        utterance.pitch = s.ttsPitch || 1.0;
        utterance.volume = s.ttsVolume || 1.0;

        const voices = window.speechSynthesis.getVoices();
        if (s.ttsVoice) {
          const matched = voices.find((v) => v.voiceURI === s.ttsVoice || v.name === s.ttsVoice);
          if (matched) utterance.voice = matched;
        } else {
          const zhVoice = voices.find((v) => v.lang && (v.lang.startsWith('zh') || v.lang.startsWith('cmn')));
          if (zhVoice) utterance.voice = zhVoice;
        }

        utterance.onend = () => {
          currentUtterance = null;
          setTtsPlayingState(false);
        };

        utterance.onerror = () => {
          currentUtterance = null;
          setTtsPlayingState(false);
        };

        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        setTtsPlayingState(false);
        showToast(`语音朗读失败: ${err.message}`, 'error');
      }
    } else {
      setTtsPlayingState(false);
      showToast('当前浏览器环境不支持 Web Speech API', 'error');
    }
  }

  function stopTts() {
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
      currentUtterance = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    setTtsPlayingState(false);
  }

  function getTtsButton() {
    if (ttsButton) return ttsButton;
    const btn = document.createElement('div');
    btn.id = 'sct-tts-selection-pill';
    btn.className = 'sct-tts-pill-btn sct-tts-idle';
    btn.innerHTML = '<span>🔊</span> <span>朗读选中文字</span>';

    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastActionTime < 300) return;
      lastActionTime = now;

      if (isTtsPlaying) {
        stopTts();
      } else {
        speakText(selectedTextCache);
      }
    });

    (document.body || document.documentElement).appendChild(btn);
    ttsButton = btn;
    return btn;
  }

  function getGlobalTtsBadge() {
    if (playingBadge) return playingBadge;
    const badge = document.createElement('div');
    badge.id = 'sct-global-tts-badge';
    badge.className = 'sct-global-tts-badge';
    badge.innerHTML = '<span>🔊</span> <span>正在朗读… [点击停止]</span>';

    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopTts();
    });

    (document.body || document.documentElement).appendChild(badge);
    playingBadge = badge;
    return badge;
  }

  function updateSelectionPosition() {
    const s = getSettings();
    if (!s.ttsEnabled || !s.ttsFloatingSelection) {
      if (ttsButton) ttsButton.style.display = 'none';
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      if (!isTtsPlaying && ttsButton) ttsButton.style.display = 'none';
      return;
    }

    const text = sel.toString().trim();
    if (!text || text.length < 2) {
      if (!isTtsPlaying && ttsButton) ttsButton.style.display = 'none';
      return;
    }

    selectedTextCache = text;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const btn = getTtsButton();
    btn.style.display = 'flex';

    const btnWidth = btn.offsetWidth || 140;
    const btnHeight = btn.offsetHeight || 36;

    let left = rect.left + rect.width / 2 - btnWidth / 2;
    let top = rect.top - btnHeight - 10;

    const margin = 12;
    if (left < margin) left = margin;
    if (left + btnWidth > window.innerWidth - margin) {
      left = window.innerWidth - btnWidth - margin;
    }
    if (top < margin) {
      top = rect.bottom + 10;
    }

    btn.style.left = `${Math.round(left)}px`;
    btn.style.top = `${Math.round(top)}px`;
  }

  function bindSelectionListeners() {
    let timer = null;
    function debouncedUpdate() {
      clearTimeout(timer);
      timer = setTimeout(updateSelectionPosition, 180);
    }

    document.addEventListener('selectionchange', debouncedUpdate);
    document.addEventListener('mouseup', debouncedUpdate);
    document.addEventListener('touchend', debouncedUpdate);

    document.addEventListener('mousedown', (e) => {
      if (ttsButton && !ttsButton.contains(e.target) && !isTtsPlaying) {
        ttsButton.style.display = 'none';
      }
    });
  }

  /* ==========================================================================
     9. 斜杠命令注册 (Slash Commands)
     ========================================================================== */

  function registerSlashCommands() {
    const ctx = getSTContext();
    if (!ctx || typeof ctx.registerSlashCommand !== 'function') return;

    ctx.registerSlashCommand('comfy', (args) => {
      const p = (args || '').trim();
      if (!p) {
        showToast('用法: /comfy <提示词>', 'warning');
        return;
      }
      showToast(`已提交 ComfyUI 生图: ${p.slice(0, 30)}...`, 'info');
      const container = document.createElement('div');
      container.className = 'sct-comfy-card-container';
      const chat = document.getElementById('chat');
      if (chat) chat.appendChild(container);
      const activeLoras = detectActiveLoras(p, p);
      triggerComfyDraw(p, container, activeLoras);
    }, [], '使用 ComfyUI (含多 LoRA 工作流) 根据提示词生成插画', true, true);

    ctx.registerSlashCommand('tts', (args) => {
      const t = (args || '').trim();
      if (!t) {
        showToast('用法: /tts <需要朗读的文本>', 'warning');
        return;
      }
      speakText(t);
    }, [], '使用 TTS 语音朗读指定文本', true, true);
  }

  /* ==========================================================================
     10. 原生配置面板与多 LoRA 规则设计 (Comprehensive Settings UI)
     ========================================================================== */

  function populateVoiceList(selectEl) {
    if (!selectEl || typeof window.speechSynthesis === 'undefined') return;
    const voices = window.speechSynthesis.getVoices();
    const curVal = getSettings().ttsVoice;
    selectEl.innerHTML = '<option value="">(自动匹配默认语言)</option>';

    voices.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI || v.name;
      opt.textContent = `${v.name} (${v.lang})${v.default ? ' [默认]' : ''}`;
      if (opt.value === curVal) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  const expandedLoraIndices = new Set();

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderLoraList(container) {
    const s = getSettings();
    const loras = s.comfyLoras || [];
    container.innerHTML = '';

    if (loras.length === 0) {
      container.innerHTML = '<div style="font-size:12px; color:rgba(255,255,255,0.4); text-align:center; padding:12px 10px; background:rgba(0,0,0,0.2); border-radius:8px; border:1px dashed rgba(255,255,255,0.1);">暂未配置任何角色 LoRA，点击下方「➕ 添加一条角色 LoRA 配置」开始添加</div>';
      return;
    }

    loras.forEach((item, idx) => {
      const isExpanded = expandedLoraIndices.has(idx);
      const card = document.createElement('div');
      card.className = `sct-lora-card ${isExpanded ? 'expanded' : ''}`;
      card.dataset.idx = String(idx);

      const kwText = (item.keywords || '').trim();
      const displayKw = kwText 
        ? `<span class="sct-lora-kw-text" title="${escapeHtml(kwText)}">${escapeHtml(kwText)}</span>` 
        : '<i class="sct-lora-kw-empty">未设置角色关键词 (点此展开配置)</i>';

      card.innerHTML = `
        <!-- 表面层：仅展示角色关键词与精简状态，点击整行展开/收起详情 -->
        <div class="sct-lora-summary-bar">
          <div class="sct-lora-summary-main">
            <span class="sct-lora-role-icon">🎭</span>
            <div class="sct-lora-kw-display">${displayKw}</div>
            ${item.alwaysOn ? '<span class="sct-badge-always" title="即使正文未匹配到关键词也会默认挂载">常驻</span>' : ''}
            ${!item.enabled ? '<span class="sct-badge-disabled">已停用</span>' : ''}
          </div>
          <div class="sct-lora-summary-action">
            <span class="sct-lora-chevron">${isExpanded ? '收起 ▲' : '详情 ▼'}</span>
          </div>
        </div>

        <!-- 详细配置层：点击后展开 -->
        <div class="sct-lora-detail-body" style="${isExpanded ? 'display:flex;' : 'display:none;'}">
          <div class="sct-setting-col">
            <label>角色激活关键词 <span style="font-size:11px; opacity:0.6;">(正文/提示词出现该词自动挂载 LoRA)</span></label>
            <input type="text" class="text_pole sct-lora-keywords" data-idx="${idx}" placeholder="多个关键词用逗号隔开，如: 柚木凪, nagi, 银发" value="${escapeHtml(item.keywords || '')}" />
          </div>

          <div class="sct-setting-col">
            <label>角色特征激活词 <span style="font-size:11px; opacity:0.6;">(挂载后自动注入正向提示词)</span></label>
            <input type="text" class="text_pole sct-lora-triggers" data-idx="${idx}" placeholder="如: nagi, 1girl, silver hair, purple eyes, school uniform" value="${escapeHtml(item.triggerWords || '')}" />
          </div>

          <div class="sct-setting-col">
            <label>选择或填入 LoRA 模型文件名</label>
            <div style="display:flex; gap:6px;">
              <input type="text" class="text_pole sct-lora-name" data-idx="${idx}" placeholder="如 nagi_v1.safetensors" value="${escapeHtml(item.name || '')}" style="flex:1;" />
              <select class="text_pole sct-lora-select" data-idx="${idx}" style="max-width:140px;">
                <option value="">(扫描列表)</option>
                ${cachedLoras.map(l => `<option value="${escapeHtml(l)}" ${l === item.name ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="sct-setting-row">
            <label>LoRA 权重强度 (0.1 ~ 2.0): <span class="sct-lora-str-val">${item.strengthModel || 0.8}</span></label>
            <input type="range" class="sct-lora-strength" data-idx="${idx}" min="0.1" max="2.0" step="0.05" value="${item.strengthModel || 0.8}" />
          </div>

          <div class="sct-lora-card-footer">
            <div style="display:flex; align-items:center; gap:12px;">
              <label style="font-size:12px; cursor:pointer; display:flex; align-items:center; gap:4px;">
                <input type="checkbox" class="sct-lora-enable" data-idx="${idx}" ${item.enabled ? 'checked' : ''} /> 启用
              </label>
              <label style="font-size:12px; cursor:pointer; display:flex; align-items:center; gap:4px;" title="开启后即使正文未匹配到关键词也会默认挂载该 LoRA">
                <input type="checkbox" class="sct-lora-always" data-idx="${idx}" ${item.alwaysOn ? 'checked' : ''} /> 常驻生效
              </label>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="sct-lora-del-btn" data-idx="${idx}">✕ 删除</button>
              <button type="button" class="sct-lora-collapse-btn" data-idx="${idx}">▲ 收起</button>
            </div>
          </div>
        </div>
      `;

      // 点击表面切换展开/收起
      const summaryBar = card.querySelector('.sct-lora-summary-bar');
      summaryBar.addEventListener('click', () => {
        if (expandedLoraIndices.has(idx)) {
          expandedLoraIndices.delete(idx);
        } else {
          expandedLoraIndices.add(idx);
        }
        renderLoraList(container);
      });

      // 底部收起按钮
      const collapseBtn = card.querySelector('.sct-lora-collapse-btn');
      if (collapseBtn) {
        collapseBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          expandedLoraIndices.delete(idx);
          renderLoraList(container);
        });
      }

      // 实时响应关键词输入并同步到表面展示
      const kwInput = card.querySelector('.sct-lora-keywords');
      const kwDisplay = card.querySelector('.sct-lora-kw-display');
      kwInput.addEventListener('input', (e) => {
        const val = e.target.value;
        loras[idx].keywords = val;
        if (val.trim()) {
          kwDisplay.innerHTML = `<span class="sct-lora-kw-text" title="${escapeHtml(val)}">${escapeHtml(val)}</span>`;
        } else {
          kwDisplay.innerHTML = '<i class="sct-lora-kw-empty">未设置角色关键词 (点此展开配置)</i>';
        }
        saveSettings({ comfyLoras: loras });
      });

      card.querySelector('.sct-lora-triggers').addEventListener('input', (e) => {
        loras[idx].triggerWords = e.target.value;
        saveSettings({ comfyLoras: loras });
      });

      card.querySelector('.sct-lora-enable').addEventListener('change', (e) => {
        loras[idx].enabled = e.target.checked;
        saveSettings({ comfyLoras: loras });
        renderLoraList(container);
      });

      card.querySelector('.sct-lora-always').addEventListener('change', (e) => {
        loras[idx].alwaysOn = e.target.checked;
        saveSettings({ comfyLoras: loras });
        renderLoraList(container);
      });

      card.querySelector('.sct-lora-name').addEventListener('input', (e) => {
        loras[idx].name = e.target.value.trim();
        saveSettings({ comfyLoras: loras });
      });

      const select = card.querySelector('.sct-lora-select');
      select.addEventListener('change', (e) => {
        if (e.target.value) {
          card.querySelector('.sct-lora-name').value = e.target.value;
          loras[idx].name = e.target.value;
          saveSettings({ comfyLoras: loras });
        }
      });

      const strRange = card.querySelector('.sct-lora-strength');
      const strVal = card.querySelector('.sct-lora-str-val');
      strRange.addEventListener('input', (e) => {
        strVal.textContent = e.target.value;
        loras[idx].strengthModel = parseFloat(e.target.value);
        loras[idx].strengthClip = parseFloat(e.target.value);
        saveSettings({ comfyLoras: loras });
      });

      card.querySelector('.sct-lora-del-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        loras.splice(idx, 1);
        expandedLoraIndices.delete(idx);
        saveSettings({ comfyLoras: loras });
        renderLoraList(container);
      });

      container.appendChild(card);
    });
  }

  function injectSettingsPanel() {
    const parent = document.getElementById('extensions_settings');
    if (!parent || document.getElementById('sct-settings-container')) return;

    const s = getSettings();
    const container = document.createElement('div');
    container.id = 'sct-settings-container';
    container.className = 'sct-settings-wrapper';

    container.innerHTML = `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>🎨 ComfyUI 绘图 & 🔊 TTS 语音朗读 (原生工作流版)</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display: block;">
          
          <!-- 板块 1: ComfyUI 基础连接与模型选择 -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>🎨</span>
              <span>ComfyUI 服务连接与模型</span>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-comfy-enabled">启用 ComfyUI 生图功能</label>
              <input type="checkbox" id="sct-cfg-comfy-enabled" ${s.comfyEnabled ? 'checked' : ''} />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-comfy-host">ComfyUI 服务地址 (默认 8188 端口)</label>
              <input type="text" id="sct-cfg-comfy-host" class="text_pole" placeholder="http://127.0.0.1:8188" value="${s.comfyHost || 'http://127.0.0.1:8188'}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-workflow">选择生图工作流 (内置完整图形生成)</label>
              <select id="sct-cfg-workflow" class="text_pole">
                <option value="txt2img" ${s.comfyWorkflow === 'txt2img' ? 'selected' : ''}>标准文生图工作流 (Txt2Img)</option>
                <option value="txt2img_multilora" ${s.comfyWorkflow === 'txt2img_multilora' ? 'selected' : ''}>文生图 + 多 LoRA 智能链式工作流 (推荐)</option>
                <option value="txt2img_multilora_hires" ${s.comfyWorkflow === 'txt2img_multilora_hires' ? 'selected' : ''}>文生图 + 多 LoRA + 高清二次潜空间放大 (Hires Fix)</option>
              </select>
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-checkpoint">选择 Checkpoint 模型文件</label>
              <div style="display:flex; gap:6px;">
                <input type="text" id="sct-cfg-checkpoint" class="text_pole" placeholder="留空自动选择首个可用模型" value="${s.comfyCheckpoint || ''}" style="flex:1;" />
                <select id="sct-ckpt-select" class="text_pole" style="max-width:140px;">
                  <option value="">(模型列表)</option>
                  ${cachedCheckpoints.map(c => `<option value="${c}" ${c === s.comfyCheckpoint ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="sct-test-btn-group">
              <button type="button" class="sct-comfy-btn" id="sct-btn-test-comfy">📡 测试 ComfyUI 连接与扫描全部模型</button>
            </div>
          </div>

          <!-- 板块 2: 多 LoRA 配置与关键词智能激活 -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>🎭</span>
              <span>角色 LoRA 管理与关键词激活</span>
            </div>
            <div class="sct-hint">表面仅展示角色关键词，点击任意条目即可展开详细配置（模型、权重与特征词）。正文出现关键词时自动挂载 LoRA 并注入特征词。</div>

            <div id="sct-lora-items-container" class="sct-lora-list"></div>

            <div style="margin-top:6px;">
              <button type="button" class="sct-comfy-btn" id="sct-btn-add-lora">➕ 添加一条角色 LoRA 配置</button>
            </div>
          </div>

          <!-- 板块 3: 提示词与画面质量参数 -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>✨</span>
              <span>固定质量提示词与出图尺寸</span>
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-fixed-pos">固定的正向质量提示词 (Prefix)</label>
              <input type="text" id="sct-cfg-fixed-pos" class="text_pole" value="${s.comfyFixedPositive || ''}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-prompt-suffix">画风后缀提示词 (Suffix)</label>
              <input type="text" id="sct-cfg-prompt-suffix" class="text_pole" value="${s.comfyPromptSuffix || ''}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-fixed-neg">固定的通用负向提示词 (Negative Prompt)</label>
              <textarea id="sct-cfg-fixed-neg" class="text_pole" rows="2">${s.comfyFixedNegative || ''}</textarea>
            </div>

            <div class="sct-setting-col">
              <label>图片尺寸 (Width x Height)</label>
              <div class="sct-chip-group">
                <button type="button" class="sct-chip-btn ${s.comfyWidth===512 && s.comfyHeight===768 ? 'active':''}" data-w="512" data-h="768">512x768 (经典人像)</button>
                <button type="button" class="sct-chip-btn ${s.comfyWidth===768 && s.comfyHeight===1024 ? 'active':''}" data-w="768" data-h="1024">768x1024 (高清竖版)</button>
                <button type="button" class="sct-chip-btn ${s.comfyWidth===1024 && s.comfyHeight===1024 ? 'active':''}" data-w="1024" data-h="1024">1024x1024 (正方形)</button>
                <button type="button" class="sct-chip-btn ${s.comfyWidth===768 && s.comfyHeight===512 ? 'active':''}" data-w="768" data-h="512">768x512 (横屏场景)</button>
              </div>
              <div style="display:flex; gap:8px; margin-top:4px;">
                <input type="number" id="sct-cfg-width" class="text_pole" placeholder="宽" value="${s.comfyWidth || 512}" style="width:100px;" />
                <span style="align-self:center;">x</span>
                <input type="number" id="sct-cfg-height" class="text_pole" placeholder="高" value="${s.comfyHeight || 768}" style="width:100px;" />
              </div>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-batch">单次生成张数 (1-3 张，轮播切换)</label>
              <input type="number" id="sct-cfg-batch" class="text_pole" min="1" max="3" style="width: 70px;" value="${s.comfyBatchCount || 1}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-steps">采样步数 (Steps)</label>
              <input type="number" id="sct-cfg-steps" class="text_pole" min="1" max="100" style="width: 70px;" value="${s.comfySteps || 20}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-cfg">CFG Scale</label>
              <input type="number" id="sct-cfg-cfg" class="text_pole" min="1" max="30" step="0.5" style="width: 70px;" value="${s.comfyCfg || 7.0}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-sampler">采样器 (Sampler) 与调度算法 (Scheduler)</label>
              <div style="display:flex; gap:8px;">
                <select id="sct-cfg-sampler" class="text_pole" style="flex:1;">
                  <option value="${s.comfySampler}">${s.comfySampler || 'euler'}</option>
                  ${cachedSamplers.map(sm => `<option value="${sm}" ${sm === s.comfySampler ? 'selected':''}>${sm}</option>`).join('')}
                </select>
                <select id="sct-cfg-scheduler" class="text_pole" style="flex:1;">
                  <option value="${s.comfyScheduler}">${s.comfyScheduler || 'normal'}</option>
                  ${cachedSchedulers.map(sc => `<option value="${sc}" ${sc === s.comfyScheduler ? 'selected':''}>${sc}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>

          <!-- 板块 4: 高清二次放大设置 (Hires Fix) -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>🔍</span>
              <span>高清二次放大修复设置 (Hires Fix)</span>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-hires-enable">启用潜空间高清放大</label>
              <input type="checkbox" id="sct-cfg-hires-enable" ${s.comfyHiresEnabled || s.comfyWorkflow === 'txt2img_multilora_hires' ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-hires-scale">放大倍数 (1.2x ~ 2.0x): <span id="sct-hires-scale-val">${s.comfyHiresScale || 1.5}x</span></label>
              <input type="range" id="sct-cfg-hires-scale" min="1.1" max="2.0" step="0.1" value="${s.comfyHiresScale || 1.5}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-hires-denoise">二次重绘幅度 (0.3 ~ 0.7): <span id="sct-hires-denoise-val">${s.comfyHiresDenoise || 0.45}</span></label>
              <input type="range" id="sct-cfg-hires-denoise" min="0.2" max="0.75" step="0.05" value="${s.comfyHiresDenoise || 0.45}" />
            </div>
          </div>

          <!-- 板块 5: 自动配图指令与消息交互 -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>🤖</span>
              <span>自动配图指示与消息交互</span>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-auto-draw">自动检测正文中生图标签 (image###...###) 即时生图</label>
              <input type="checkbox" id="sct-cfg-auto-draw" ${s.comfyAutoDrawTags ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-mes-draw-btn">在每条消息操作栏显示「🎨」生图按钮</label>
              <input type="checkbox" id="sct-cfg-mes-draw-btn" ${s.comfyShowMesButton ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-auto-inject-inst">自动向 AI 上下文注入【自动配图指示】</label>
              <input type="checkbox" id="sct-cfg-auto-inject-inst" ${s.autoInjectImageInstruction ? 'checked' : ''} />
            </div>

            <div class="sct-setting-col">
              <label>配图指示词模板 (支持一键复制到角色卡或世界书)</label>
              <div class="sct-code-box" id="sct-inst-preview">${escapeHtml(s.imageInstructionText || DEFAULT_IMAGE_INSTRUCTION)}</div>
              <div style="margin-top:4px;">
                <button type="button" class="sct-comfy-btn" id="sct-btn-copy-inst">📋 复制自动配图提示词</button>
              </div>
            </div>
          </div>

          <!-- 板块 6: 纯净 TTS 语音朗读 -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title">
              <span>🔊</span>
              <span>TTS 语音朗读设置</span>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-tts-enabled">启用 TTS 语音功能</label>
              <input type="checkbox" id="sct-cfg-tts-enabled" ${s.ttsEnabled ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-float-sel">划选文本弹出「🔊 朗读」胶囊</label>
              <input type="checkbox" id="sct-cfg-float-sel" ${s.ttsFloatingSelection ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-mes-tts-btn">在每条消息下显示朗读按钮</label>
              <input type="checkbox" id="sct-cfg-mes-tts-btn" ${s.ttsShowMesButton ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-filter-think">朗读时自动过滤思考过程 &lt;think&gt;</label>
              <input type="checkbox" id="sct-cfg-filter-think" ${s.ttsFilterThinking ? 'checked' : ''} />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-tts-engine">语音引擎类型</label>
              <select id="sct-cfg-tts-engine" class="text_pole">
                <option value="webspeech" ${s.ttsEngine === 'webspeech' ? 'selected' : ''}>浏览器原生 Web Speech API (推荐，零延迟开箱即用)</option>
                <option value="openai" ${s.ttsEngine === 'openai' ? 'selected' : ''}>OpenAI 兼容音频服务 (/v1/audio/speech)</option>
              </select>
            </div>

            <div class="sct-setting-col" id="sct-wrap-voice-ws" style="${s.ttsEngine === 'webspeech' ? '' : 'display:none;'}">
              <label for="sct-cfg-voice">发音人音色 (Voice)</label>
              <select id="sct-cfg-voice" class="text_pole">
                <option value="">加载中…</option>
              </select>
            </div>

            <div id="sct-wrap-openai" style="${s.ttsEngine === 'openai' ? '' : 'display:none;'}">
              <div class="sct-setting-col" style="margin-bottom: 8px;">
                <label for="sct-cfg-openai-ep">API 端点 (如 http://127.0.0.1:8000)</label>
                <input type="text" id="sct-cfg-openai-ep" class="text_pole" placeholder="http://127.0.0.1:8000" value="${s.ttsOpenAiEndpoint || ''}" />
              </div>
              <div class="sct-setting-col" style="margin-bottom: 8px;">
                <label for="sct-cfg-openai-key">API Key (留空免鉴权)</label>
                <input type="password" id="sct-cfg-openai-key" class="text_pole" placeholder="sk-..." value="${s.ttsOpenAiKey || ''}" />
              </div>
              <div class="sct-setting-col" style="margin-bottom: 8px;">
                <label for="sct-cfg-openai-voice">音色名称 (如 alloy / echo)</label>
                <input type="text" id="sct-cfg-openai-voice" class="text_pole" value="${s.ttsOpenAiVoice || 'alloy'}" />
              </div>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-rate">朗读语速 (0.5x - 2.0x): <span id="sct-rate-val">${s.ttsRate || 1.0}</span></label>
              <input type="range" id="sct-cfg-rate" min="0.5" max="2.0" step="0.1" value="${s.ttsRate || 1.0}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-pitch">声音音调 (0.5 - 1.5): <span id="sct-pitch-val">${s.ttsPitch || 1.0}</span></label>
              <input type="range" id="sct-cfg-pitch" min="0.5" max="1.5" step="0.1" value="${s.ttsPitch || 1.0}" />
            </div>

            <div class="sct-test-btn-group">
              <button type="button" class="sct-comfy-btn" id="sct-btn-test-tts">▶ 试听语音效果</button>
              <button type="button" class="sct-comfy-btn" id="sct-btn-stop-tts">⏹ 停止</button>
            </div>
          </div>

        </div>
      </div>
    `;

    parent.appendChild(container);

    // 折叠展开
    const drawerToggle = container.querySelector('.inline-drawer-toggle');
    const drawerContent = container.querySelector('.inline-drawer-content');
    drawerToggle.addEventListener('click', () => {
      const isHidden = drawerContent.style.display === 'none';
      drawerContent.style.display = isHidden ? 'block' : 'none';
      drawerToggle.querySelector('.inline-drawer-icon').className = isHidden 
        ? 'inline-drawer-icon fa-solid fa-circle-chevron-down down'
        : 'inline-drawer-icon fa-solid fa-circle-chevron-right right';
    });

    // 渲染 LoRA 列表
    const loraContainer = container.querySelector('#sct-lora-items-container');
    renderLoraList(loraContainer);

    container.querySelector('#sct-btn-add-lora').addEventListener('click', () => {
      const curLoras = getSettings().comfyLoras || [];
      const newIdx = curLoras.length;
      curLoras.push({
        id: `lora_${Date.now()}`,
        name: cachedLoras[0] || '',
        strengthModel: 0.8,
        strengthClip: 0.8,
        keywords: '',
        triggerWords: '',
        enabled: true,
        alwaysOn: false
      });
      expandedLoraIndices.add(newIdx);
      saveSettings({ comfyLoras: curLoras });
      renderLoraList(loraContainer);
    });

    // 尺寸快捷芯片
    container.querySelectorAll('.sct-chip-btn').forEach((chip) => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.sct-chip-btn').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const w = parseInt(chip.dataset.w, 10);
        const h = parseInt(chip.dataset.h, 10);
        container.querySelector('#sct-cfg-width').value = w;
        container.querySelector('#sct-cfg-height').value = h;
        saveSettings({ comfyWidth: w, comfyHeight: h });
      });
    });

    // 绑定基础事件与保存
    container.querySelector('#sct-cfg-comfy-enabled').addEventListener('change', (e) => saveSettings({ comfyEnabled: e.target.checked }));
    container.querySelector('#sct-cfg-comfy-host').addEventListener('input', (e) => saveSettings({ comfyHost: e.target.value.trim() }));
    container.querySelector('#sct-cfg-workflow').addEventListener('change', (e) => saveSettings({ comfyWorkflow: e.target.value }));
    container.querySelector('#sct-cfg-checkpoint').addEventListener('input', (e) => saveSettings({ comfyCheckpoint: e.target.value.trim() }));
    
    const ckptSelect = container.querySelector('#sct-ckpt-select');
    ckptSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        container.querySelector('#sct-cfg-checkpoint').value = e.target.value;
        saveSettings({ comfyCheckpoint: e.target.value });
      }
    });

    container.querySelector('#sct-cfg-fixed-pos').addEventListener('input', (e) => saveSettings({ comfyFixedPositive: e.target.value }));
    container.querySelector('#sct-cfg-prompt-suffix').addEventListener('input', (e) => saveSettings({ comfyPromptSuffix: e.target.value }));
    container.querySelector('#sct-cfg-fixed-neg').addEventListener('input', (e) => saveSettings({ comfyFixedNegative: e.target.value }));
    container.querySelector('#sct-cfg-width').addEventListener('change', (e) => saveSettings({ comfyWidth: parseInt(e.target.value, 10) || 512 }));
    container.querySelector('#sct-cfg-height').addEventListener('change', (e) => saveSettings({ comfyHeight: parseInt(e.target.value, 10) || 768 }));
    container.querySelector('#sct-cfg-batch').addEventListener('change', (e) => saveSettings({ comfyBatchCount: parseInt(e.target.value, 10) || 1 }));
    container.querySelector('#sct-cfg-steps').addEventListener('change', (e) => saveSettings({ comfySteps: parseInt(e.target.value, 10) || 20 }));
    container.querySelector('#sct-cfg-cfg').addEventListener('change', (e) => saveSettings({ comfyCfg: parseFloat(e.target.value) || 7.0 }));
    container.querySelector('#sct-cfg-sampler').addEventListener('change', (e) => saveSettings({ comfySampler: e.target.value }));
    container.querySelector('#sct-cfg-scheduler').addEventListener('change', (e) => saveSettings({ comfyScheduler: e.target.value }));

    // 高清放大
    container.querySelector('#sct-cfg-hires-enable').addEventListener('change', (e) => saveSettings({ comfyHiresEnabled: e.target.checked }));
    const hiresScaleRange = container.querySelector('#sct-cfg-hires-scale');
    const hiresScaleVal = container.querySelector('#sct-hires-scale-val');
    hiresScaleRange.addEventListener('input', (e) => {
      hiresScaleVal.textContent = `${e.target.value}x`;
      saveSettings({ comfyHiresScale: parseFloat(e.target.value) });
    });

    const hiresDenoiseRange = container.querySelector('#sct-cfg-hires-denoise');
    const hiresDenoiseVal = container.querySelector('#sct-hires-denoise-val');
    hiresDenoiseRange.addEventListener('input', (e) => {
      hiresDenoiseVal.textContent = e.target.value;
      saveSettings({ comfyHiresDenoise: parseFloat(e.target.value) });
    });

    // 自动配图指令
    container.querySelector('#sct-cfg-auto-draw').addEventListener('change', (e) => saveSettings({ comfyAutoDrawTags: e.target.checked }));
    container.querySelector('#sct-cfg-mes-draw-btn').addEventListener('change', (e) => saveSettings({ comfyShowMesButton: e.target.checked }));
    container.querySelector('#sct-cfg-auto-inject-inst').addEventListener('change', (e) => saveSettings({ autoInjectImageInstruction: e.target.checked }));

    container.querySelector('#sct-btn-copy-inst').addEventListener('click', () => {
      const text = getSettings().imageInstructionText || DEFAULT_IMAGE_INSTRUCTION;
      navigator.clipboard.writeText(text).then(() => {
        showToast('已复制自动配图提示词到剪贴板！', 'success');
      }).catch(() => {
        showToast('复制失败，请手动划选复制', 'warning');
      });
    });

    // 探查 ComfyUI 资产
    container.querySelector('#sct-btn-test-comfy').addEventListener('click', async () => {
      const testBtn = container.querySelector('#sct-btn-test-comfy');
      const host = getCleanComfyHost();
      testBtn.textContent = '⏳ 正在探查 ComfyUI…';
      try {
        const assets = await scanComfyAssets(host);
        if (assets.checkpoints.length > 0 || assets.loras.length > 0) {
          showToast(`连通成功！探查到 ${assets.checkpoints.length} 个模型, ${assets.loras.length} 个 LoRA`, 'success');
          // 更新 Checkpoint 下拉
          ckptSelect.innerHTML = '<option value="">(模型列表)</option>' + 
            assets.checkpoints.map(c => `<option value="${c}">${c}</option>`).join('');
          if (!container.querySelector('#sct-cfg-checkpoint').value && assets.checkpoints[0]) {
            container.querySelector('#sct-cfg-checkpoint').value = assets.checkpoints[0];
            saveSettings({ comfyCheckpoint: assets.checkpoints[0] });
          }
          // 更新采样器下拉
          if (assets.samplers.length > 0) {
            container.querySelector('#sct-cfg-sampler').innerHTML = 
              assets.samplers.map(s => `<option value="${s}">${s}</option>`).join('');
          }
          if (assets.schedulers.length > 0) {
            container.querySelector('#sct-cfg-scheduler').innerHTML = 
              assets.schedulers.map(sc => `<option value="${sc}">${sc}</option>`).join('');
          }
          // 重新刷新 LoRA 列表下拉
          renderLoraList(loraContainer);
        } else {
          showToast(`已连通 ComfyUI (${host})，服务就绪！`, 'success');
        }
      } catch (err) {
        showToast(`连通 ComfyUI 失败 (${host}): ${err.message}`, 'error');
      } finally {
        testBtn.textContent = '📡 测试 ComfyUI 连接与扫描全部模型';
      }
    });

    // TTS 绑定
    const voiceSelect = container.querySelector('#sct-cfg-voice');
    populateVoiceList(voiceSelect);
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = () => populateVoiceList(voiceSelect);
    }

    const engineSelect = container.querySelector('#sct-cfg-tts-engine');
    const wrapWs = container.querySelector('#sct-wrap-voice-ws');
    const wrapOai = container.querySelector('#sct-wrap-openai');
    engineSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      saveSettings({ ttsEngine: val });
      wrapWs.style.display = val === 'webspeech' ? '' : 'none';
      wrapOai.style.display = val === 'openai' ? '' : 'none';
    });

    container.querySelector('#sct-cfg-tts-enabled').addEventListener('change', (e) => saveSettings({ ttsEnabled: e.target.checked }));
    container.querySelector('#sct-cfg-float-sel').addEventListener('change', (e) => saveSettings({ ttsFloatingSelection: e.target.checked }));
    container.querySelector('#sct-cfg-mes-tts-btn').addEventListener('change', (e) => saveSettings({ ttsShowMesButton: e.target.checked }));
    container.querySelector('#sct-cfg-filter-think').addEventListener('change', (e) => saveSettings({ ttsFilterThinking: e.target.checked }));
    voiceSelect.addEventListener('change', (e) => saveSettings({ ttsVoice: e.target.value }));

    container.querySelector('#sct-cfg-openai-ep').addEventListener('input', (e) => saveSettings({ ttsOpenAiEndpoint: e.target.value.trim() }));
    container.querySelector('#sct-cfg-openai-key').addEventListener('input', (e) => saveSettings({ ttsOpenAiKey: e.target.value.trim() }));
    container.querySelector('#sct-cfg-openai-voice').addEventListener('input', (e) => saveSettings({ ttsOpenAiVoice: e.target.value.trim() }));

    const rateRange = container.querySelector('#sct-cfg-rate');
    const rateVal = container.querySelector('#sct-rate-val');
    rateRange.addEventListener('input', (e) => {
      rateVal.textContent = e.target.value;
      saveSettings({ ttsRate: parseFloat(e.target.value) });
    });

    const pitchRange = container.querySelector('#sct-cfg-pitch');
    const pitchVal = container.querySelector('#sct-pitch-val');
    pitchRange.addEventListener('input', (e) => {
      pitchVal.textContent = e.target.value;
      saveSettings({ ttsPitch: parseFloat(e.target.value) });
    });

    container.querySelector('#sct-btn-test-tts').addEventListener('click', () => {
      speakText('您好！这是 SillyTavern 智能语音朗读与 ComfyUI 原生生图测试，祝您使用愉快！');
    });
    container.querySelector('#sct-btn-stop-tts').addEventListener('click', () => {
      stopTts();
    });
  }

  function injectWandMenuButton() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('sct-wand-item')) return;

    const item = document.createElement('div');
    item.className = 'extension_container interactable';
    item.tabIndex = 0;
    item.innerHTML = `
      <a id="sct-wand-item" class="list-group-item" href="#" title="${DISPLAY_NAME}">
        <i class="fa-solid fa-palette"></i>
        <span>ComfyUI & 语音朗读</span>
      </a>
    `;

    item.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof jQuery !== 'undefined') {
        jQuery('#right-nav-panel').addClass('openDrawer');
        jQuery('#extensions_settings_tab').trigger('click');
        const target = document.getElementById('sct-settings-container');
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      }
      menu.style.display = 'none';
    });

    menu.appendChild(item);
  }

  /* ==========================================================================
     11. 插件启动与事件监听 (Lifecycle Initialization)
     ========================================================================== */

  function init() {
    console.log(`[${DISPLAY_NAME}] 正在初始化 ComfyUI 原生工作流扩展…`);

    bindSelectionListeners();
    registerSlashCommands();
    updateExtensionPrompt();

    const ctx = getSTContext();
    const es = ctx?.eventSource || (typeof eventSource !== 'undefined' ? eventSource : null);
    const et = ctx?.eventTypes || ctx?.event_types || (typeof event_types !== 'undefined' ? event_types : null);

    if (es && typeof es.on === 'function' && et) {
      if (et.CHARACTER_MESSAGE_RENDERED) {
        es.on(et.CHARACTER_MESSAGE_RENDERED, () => {
          setTimeout(scanAllMessages, 100);
        });
      }
      if (et.MESSAGE_RECEIVED) {
        es.on(et.MESSAGE_RECEIVED, () => {
          setTimeout(scanAllMessages, 150);
        });
      }
      if (et.CHAT_CHANGED) {
        es.on(et.CHAT_CHANGED, () => {
          stopTts();
          setTimeout(scanAllMessages, 300);
          updateExtensionPrompt();
        });
      }
      if (et.CHAT_COMPLETION_PROMPT_READY) {
        es.on(et.CHAT_COMPLETION_PROMPT_READY, () => {
          updateExtensionPrompt();
        });
      }
    }

    const chatObserver = new MutationObserver(() => {
      scanAllMessages();
    });

    const targetChat = document.getElementById('chat');
    if (targetChat) {
      chatObserver.observe(targetChat, { childList: true, subtree: true });
    }

    let initChecks = 0;
    const initTimer = setInterval(() => {
      initChecks++;
      injectSettingsPanel();
      injectWandMenuButton();
      scanAllMessages();
      updateExtensionPrompt();

      if (initChecks > 10) clearInterval(initTimer);
    }, 800);

    console.log(`[${DISPLAY_NAME}] 原生插件就绪！`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
