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

  // 默认自动配图指示词 (必须使用 <image> 标签包裹，严格遵循就地插入、单主体防污染与肢体接触互动规范)
  const DEFAULT_IMAGE_INSTRUCTION = `【自动配图指示】：在生成回复文字的同时，请你根据当前文字情景，自行判断是否需要为当前内容配图（最少1张，最多3张）。本插件配图为**行内情景插图**，必须严格遵循【插图就地嵌入与防污染规范】：\n1. **就地插入原则**：描述哪段文字情景，就必须将对应的生图标签**直接紧随插入在哪段文字正下方**，图文紧密呼应！**绝对严禁**将所有生图标签统一堆砌在文段末尾或整篇回复的最后面！\n2. **单主体与防污染规则（重要）**：**除非 2 个角色发生明确的肢体接触或互动动作**（如拥抱、牵手、坐在腿上、依偎等），**否则每次插图必须且只能描述 1 个角色主体**（如 1girl 或 1boy，搭配 solo）！英文 tag 必须完全聚焦于该单一角色，**绝对严禁在单人图片中混入其他任何角色的名称或特征词**，彻底杜绝提示词与特征污染（例如防止单人图误生其他角色的尾巴、发色或配饰）！\n3. **双人接触互动严格受限**：仅当情节中 2 个角色存在**直接身体接触或明确互动动作**时，才允许使用双主体标签（如 1girl, 1boy 或 2girls），并且必须在 tag 中明确写出两者具体的互动动作（如 hugging each other, holding hands, sitting on lap）。**严禁出现 3 个及以上角色**！\n4. **标签格式**：<image>image###sfw/nsfw, 主体数量(无身体接触必须为1人如 1girl, solo; 有接触时最多2人如 1girl, 1boy), 人物名称(无接触仅填当前1人; 有接触填2人), 动作与特征描述(如有2人必须描述具体互动动作), 图片英文tag###</image>\n【单人示例（默认常规，纯净无污染）】：\n<image>image###sfw, 1girl, solo, emilia \\(re:zero\\), silver hair, long hair, purple eyes, white flower hair ornament, purple and white dress, elf ears, standing in sunlit mansion hallway, gentle smile, looking at viewer###</image>\n【双人身体接触互动示例（仅在有明确接触动作时使用）】：\n<image>image###sfw, 1girl, 1boy, emilia \\(re:zero\\), subaru natsuki, 1boy holding hands with 1girl, 1girl sitting on 1boy lap, hugging each other, romantic garden bench, sunset, warm cinematic lighting###</image>\n【关键准则】：发出生图标签后，ComfyUI 会在后台异步生图并直接保存至 /sdcard/Download/DSHA/ 目录。你**完全无需等待生图结果**，插入标签后必须**立即继续向下输出你的后续文字回复**！`;

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
    ttsEngine: 'xiaomi', // 'xiaomi' | 'webspeech' | 'openai'
    ttsVoice: '',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    ttsVolume: 1.0,
    // 小米 MiMo 在线 TTS
    ttsXiaomiKey: '',
    ttsXiaomiEndpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
    ttsXiaomiModel: 'mimo-v2.5-tts', // 'mimo-v2.5-tts' | 'mimo-v2.5-tts-voicedesign' | 'mimo-v2.5-tts-voiceclone'
    ttsXiaomiVoice: '冰糖', // '冰糖' | '茉莉' | 'Mia' | 'Chloe' | 'Milo' | 'Dean'
    ttsXiaomiSinging: false,
    ttsXiaomiVoiceDesignPrompt: '年轻活泼的女性声音，亲切自然，语调轻快',
    ttsXiaomiCloneSample: '',
    // OpenAI 兼容 TTS
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

  // 全局生图任务去重与状态记录表 (杜绝重复触发与无限刷图)
  // key: taskKey
  // val: { status: 'running'|'completed'|'error', images: [], prompt: string, activeLoras: [] }
  const sctDrawingTasks = new Map();

  // 初始加载保护与会话实时消息追踪：彻底杜绝浏览器刷新时狂刷所有历史消息生图
  let isInitialLoad = true;
  let isChatSwitching = false;
  const newlyReceivedMesIds = new Set();

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
        // 如果旧版缓存了默认的 webspeech 或未设置，自动升级为推荐的小米 MiMo 在线 TTS
        if (!extSettings[MODULE_NAME].ttsEngine || extSettings[MODULE_NAME].ttsEngine === 'webspeech') {
          extSettings[MODULE_NAME].ttsEngine = 'xiaomi';
        }
        if (!extSettings[MODULE_NAME].imageInstructionText || 
            !extSettings[MODULE_NAME].imageInstructionText.includes('就地插入') || 
            !extSettings[MODULE_NAME].imageInstructionText.includes('防污染') ||
            !extSettings[MODULE_NAME].imageInstructionText.includes('肢体接触')) {
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
     持久化生图缓存与生命周期管理 (Persistent Image Cache & Lifecycle)
     ========================================================================== */

  const SCT_STORAGE_KEY = 'sct_completed_tasks_v2';

  // 将图像 URL 规范化为当前配置的 ComfyUI 主机，彻底避免因 IP、端口或局域网切换导致的旧图裂图
  function normalizeComfyImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const currentHost = getCleanComfyHost();
    if (url.startsWith('/view?')) {
      return `${currentHost}${url}`;
    }
    const match = url.match(/\/view\?[\s\S]*$/);
    if (match) {
      return `${currentHost}${match[0]}`;
    }
    return url;
  }

  // 获取当前酒馆会话/角色作用域唯一前缀
  function getChatScopeKey() {
    const ctx = getSTContext();
    if (ctx) {
      if (ctx.chatId) return `chat_${String(ctx.chatId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      if (ctx.characterId !== undefined && ctx.characterId !== null) return `char_${ctx.characterId}`;
    }
    return 'global';
  }

  // 生成统一规范的任务唯一键
  function getTaskKey(mesId, slotIdx, promptText) {
    const scope = getChatScopeKey();
    const cleanPrompt = (promptText || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    return `sct_${scope}_mes_${mesId}_slot_${slotIdx}_${cleanPrompt}`;
  }

  // 读取所有持久化的任务
  function getPersistentTasks() {
    try {
      const raw = localStorage.getItem(SCT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  // 保存任务结果 (持久化到 localStorage)
  function savePersistentTask(taskKey, data) {
    if (!taskKey) return;
    try {
      const all = getPersistentTasks();
      all[taskKey] = {
        images: (data.images || []).map(normalizeComfyImageUrl),
        prompt: data.prompt || '',
        activeLoras: data.activeLoras || [],
        status: data.status || 'completed',
        updatedAt: Date.now()
      };
      // 保留最近 500 条生图记录，防止 localStorage 膨胀
      const keys = Object.keys(all);
      if (keys.length > 500) {
        keys.sort((a, b) => (all[a]?.updatedAt || 0) - (all[b]?.updatedAt || 0));
        while (keys.length > 400) {
          delete all[keys.shift()];
        }
      }
      localStorage.setItem(SCT_STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn(`[${DISPLAY_NAME}] 保存生图本地缓存失败:`, e);
    }
  }

  // 删除任务缓存 (例如点击重新生成时)
  function removePersistentTask(taskKey) {
    if (!taskKey) return;
    try {
      const all = getPersistentTasks();
      delete all[taskKey];
      localStorage.setItem(SCT_STORAGE_KEY, JSON.stringify(all));
    } catch (_) {}
  }

  // 从酒馆消息上下文 extra 获取生图缓存
  function getChatMessageExtraImages(mesId, slotIdx) {
    try {
      const ctx = getSTContext();
      if (!ctx || !ctx.chat) return null;
      const numId = parseInt(mesId, 10);
      if (isNaN(numId) || !ctx.chat[numId]) return null;
      const extra = ctx.chat[numId].extra;
      if (!extra || !extra.sct_images) return null;
      const slotData = extra.sct_images[slotIdx];
      if (slotData && Array.isArray(slotData.images) && slotData.images.length > 0) {
        return slotData;
      }
    } catch (_) {}
    return null;
  }

  // 保存生图结果到酒馆消息上下文 extra 并保存聊天记录
  function saveChatMessageExtraImages(mesId, slotIdx, images, promptText, activeLoras = []) {
    try {
      const ctx = getSTContext();
      if (!ctx || !ctx.chat) return;
      const numId = parseInt(mesId, 10);
      if (isNaN(numId) || !ctx.chat[numId]) return;
      if (!ctx.chat[numId].extra) {
        ctx.chat[numId].extra = {};
      }
      if (!ctx.chat[numId].extra.sct_images) {
        ctx.chat[numId].extra.sct_images = {};
      }
      ctx.chat[numId].extra.sct_images[slotIdx] = {
        images: (images || []).map(normalizeComfyImageUrl),
        prompt: promptText,
        activeLoras: activeLoras,
        savedAt: Date.now()
      };
      if (typeof ctx.saveChatDebounced === 'function') {
        ctx.saveChatDebounced();
      }
    } catch (_) {}
  }

  // 从酒馆消息上下文 extra 移除生图缓存
  function removeChatMessageExtraImages(mesId, slotIdx) {
    try {
      const ctx = getSTContext();
      if (!ctx || !ctx.chat) return;
      const numId = parseInt(mesId, 10);
      if (isNaN(numId) || !ctx.chat[numId] || !ctx.chat[numId].extra?.sct_images) return;
      delete ctx.chat[numId].extra.sct_images[slotIdx];
      if (typeof ctx.saveChatDebounced === 'function') {
        ctx.saveChatDebounced();
      }
    } catch (_) {}
  }

  // 多层级查找已生成的任务 (内存 -> 酒馆 extra -> 本地 localStorage)
  function findCachedTask(taskKey, mesId, slotIdx, rawPrompt) {
    // 1. 检查内存缓存 sctDrawingTasks
    const inMem = sctDrawingTasks.get(taskKey);
    if (inMem && inMem.status === 'completed' && inMem.images && inMem.images.length > 0) {
      return inMem;
    }

    // 2. 检查酒馆消息 extra
    const fromExtra = getChatMessageExtraImages(mesId, slotIdx);
    if (fromExtra && fromExtra.images && fromExtra.images.length > 0) {
      const entry = {
        status: 'completed',
        images: fromExtra.images.map(normalizeComfyImageUrl),
        prompt: fromExtra.prompt || '',
        activeLoras: fromExtra.activeLoras || []
      };
      sctDrawingTasks.set(taskKey, entry);
      return entry;
    }

    // 3. 检查 localStorage 持久化缓存 (新格式键名)
    const pTasks = getPersistentTasks();
    let fromStorage = pTasks[taskKey];
    // 兼顾旧版键名格式兜底 (mes_${mesId}_slot_${idx}_${item.prompt.slice(0, 40)})
    if (!fromStorage && rawPrompt) {
      const legacyKey = `mes_${mesId}_slot_${slotIdx}_${rawPrompt.slice(0, 40)}`;
      fromStorage = pTasks[legacyKey];
    }

    if (fromStorage && fromStorage.images && fromStorage.images.length > 0) {
      const entry = {
        status: 'completed',
        images: fromStorage.images.map(normalizeComfyImageUrl),
        prompt: fromStorage.prompt || '',
        activeLoras: fromStorage.activeLoras || []
      };
      sctDrawingTasks.set(taskKey, entry);
      return entry;
    }

    return null;
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

  let currentLightboxContext = null;

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
          <button type="button" class="sct-comfy-btn" id="sct-lightbox-inpaint">🖌️ 局部重绘</button>
          <button type="button" class="sct-comfy-btn" id="sct-lightbox-open-raw">🔗 查看原图</button>
          <button type="button" class="sct-comfy-btn" id="sct-lightbox-download">💾 保存图片</button>
        </div>
      </div>
    `;

    overlay.querySelector('.sct-lightbox-close-btn').addEventListener('click', closeLightbox);
    overlay.querySelector('#sct-lightbox-img').addEventListener('click', closeLightbox);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('active')) {
        closeLightbox();
      }
    });

    overlay.querySelector('#sct-lightbox-inpaint').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ctx = currentLightboxContext;
      closeLightbox();
      if (ctx) {
        openInpaintModal(ctx);
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

  function openLightbox(imgUrl, promptText = '', activeLoras = [], container = null) {
    currentLightboxContext = {
      imageUrl: imgUrl,
      promptText: promptText,
      activeLoras: activeLoras,
      container: container
    };
    const lb = ensureLightbox();
    const img = lb.querySelector('#sct-lightbox-img');
    img.src = imgUrl;
    lb.classList.add('active');
  }

  function closeLightbox() {
    if (lightboxEl) lightboxEl.classList.remove('active');
  }

  // 长按与点击交互辅助绑定 (严格区分点击、长按与移动端上下滑动翻页)
  function bindLongPress(el, onLongPress, onClick) {
    if (!el) return;
    let timer = null;
    let startX = 0;
    let startY = 0;
    let isLongPress = false;
    let isMoved = false;
    let touchStartTime = 0;
    let lastMoveTime = 0;

    const start = (clientX, clientY, e) => {
      isLongPress = false;
      isMoved = false;
      startX = clientX;
      startY = clientY;
      touchStartTime = Date.now();

      clear();
      timer = setTimeout(() => {
        if (isMoved) return;
        isLongPress = true;
        try { if (navigator.vibrate) navigator.vibrate(50); } catch (_) {}
        if (onLongPress) onLongPress(e);
      }, 650); // 适度放宽长按阈值至 650ms，且期间严禁位移
    };

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // 鼠标事件 (桌面端)
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      start(e.clientX, e.clientY, e);
    });

    el.addEventListener('mousemove', (e) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
        isMoved = true;
        clear();
      }
    });

    el.addEventListener('mouseup', (e) => {
      const wasLong = isLongPress;
      const moved = isMoved;
      clear();
      if (!wasLong && !moved && onClick) {
        onClick(e);
      }
    });

    el.addEventListener('mouseleave', () => {
      isMoved = true;
      clear();
    });

    // 触屏事件 (移动端上下滑动滚动浏览聊天记录)
    el.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        start(e.touches[0].clientX, e.touches[0].clientY, e);
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length === 1) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        // 只要任何方向产生超过 6px 的位移 (无论上下滑动还是斜向滑动)，立刻标记为“滑动”，彻底取消一切长按与点击！
        if (dx > 6 || dy > 6) {
          isMoved = true;
          lastMoveTime = Date.now();
          clear();
        }
      }
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      const wasLong = isLongPress;
      const moved = isMoved;
      const duration = Date.now() - touchStartTime;
      clear();

      // 必须是：没有发生过任何滑动、没有触发长按、纯手指点按且持续时间正常 (40ms - 450ms)
      if (!wasLong && !moved && onClick && duration > 40 && duration < 450) {
        onClick(e);
      }
    });

    el.addEventListener('touchcancel', () => {
      isMoved = true;
      lastMoveTime = Date.now();
      clear();
    });

    // 彻底阻止移动端在滑动释放后浏览器合成的虚拟 click 穿透
    el.addEventListener('click', (e) => {
      if (isMoved || (Date.now() - lastMoveTime < 450)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  /* ==========================================================================
     3.1 图像局部重绘弹窗与画板 (Inpainting Canvas & Modal)
     ========================================================================== */

  let inpaintModalEl = null;
  let inpaintContext = null;
  let inpaintDrawCtx = null;
  let inpaintMaskCanvas = null;
  let inpaintMaskCtx = null;
  let inpaintIsDrawing = false;
  let inpaintLastX = 0;
  let inpaintLastY = 0;
  let inpaintTool = 'brush'; // 'brush' | 'eraser'
  let inpaintBrushSize = 30;

  // SAM 智能分割状态
  let inpaintSamPointMode = false;      // 是否开启 SAM2 鼠标坐标点选模式
  let inpaintSamBusy = false;           // 是否正在向 ComfyUI 请求分割任务
  let currentInpaintUploadedName = null; // 缓存当前原图在 ComfyUI 中的文件名，避免重复上传
  const inpaintSegMaskCache = new Map(); // 缓存当前图片的分割结果 (key -> maskUrl)，二次点击瞬间秒出并防止重复运算

  // 画板视图缩放状态
  let inpaintZoomLevel = 1.0;
  let inpaintBaseDisplayW = 512;
  let inpaintBaseDisplayH = 768;

  function applyInpaintZoom() {
    if (!inpaintModalEl) return;
    const stage = inpaintModalEl.querySelector('#sct-inpaint-canvas-stage');
    const baseImg = inpaintModalEl.querySelector('#sct-inpaint-base-img');
    const drawCanvas = inpaintModalEl.querySelector('#sct-inpaint-draw-canvas');
    const zoomVal = inpaintModalEl.querySelector('#sct-zoom-val');

    const targetW = Math.round(inpaintBaseDisplayW * inpaintZoomLevel);
    const targetH = Math.round(inpaintBaseDisplayH * inpaintZoomLevel);

    if (stage) {
      stage.style.width = `${targetW}px`;
      stage.style.height = `${targetH}px`;
    }
    if (baseImg) {
      baseImg.style.width = `${targetW}px`;
      baseImg.style.height = `${targetH}px`;
    }
    if (drawCanvas) {
      drawCanvas.style.width = `${targetW}px`;
      drawCanvas.style.height = `${targetH}px`;
    }
    if (zoomVal) {
      zoomVal.textContent = `${Math.round(inpaintZoomLevel * 100)}%`;
    }
  }

  // ---------------------------------------------------------------------------
  // 画板涂抹撤销/重做 (Undo/Redo)：以"一笔涂抹"、清空、反选、SAM 应用为撤销粒度，
  // 对视觉层 + 离屏蒙版层做双层 PNG dataURL 快照（压缩存储、内存开销极低）
  // ---------------------------------------------------------------------------
  const sctInpaintHistory = { undo: [], redo: [], max: 30, busy: false };
  let sctHistoryUIButtons = null;

  function loadImgAsync(url) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('画布快照加载失败'));
      im.src = url;
    });
  }

  function updateInpaintHistoryButtons() {
    if (!sctHistoryUIButtons) return;
    if (sctHistoryUIButtons.undoBtn) {
      sctHistoryUIButtons.undoBtn.disabled = sctInpaintHistory.undo.length === 0 || sctInpaintHistory.busy;
      sctHistoryUIButtons.undoBtn.style.opacity = sctInpaintHistory.undo.length === 0 ? '0.4' : '1';
    }
    if (sctHistoryUIButtons.redoBtn) {
      sctHistoryUIButtons.redoBtn.disabled = sctInpaintHistory.redo.length === 0 || sctInpaintHistory.busy;
      sctHistoryUIButtons.redoBtn.style.opacity = sctInpaintHistory.redo.length === 0 ? '0.4' : '1';
    }
  }

  // 记录一次操作前的画布状态 (双层原子快照；新操作自动清空重做栈，超出上限丢弃最早一条)
  function captureInpaintHistoryPoint() {
    try {
      if (!inpaintMaskCtx || !inpaintDrawCtx) return;
      const drawUrl = inpaintDrawCtx.canvas.toDataURL('image/png');
      const maskUrl = inpaintMaskCtx.canvas.toDataURL('image/png');
      if (!drawUrl || !maskUrl) return;
      sctInpaintHistory.undo.push({ draw: drawUrl, mask: maskUrl });
      if (sctInpaintHistory.undo.length > sctInpaintHistory.max) sctInpaintHistory.undo.shift();
      sctInpaintHistory.redo.length = 0;
      updateInpaintHistoryButtons();
    } catch (_) {}
  }

  // 将某个历史点的双层快照写回两张画布
  function restoreInpaintHistoryPoint(point) {
    return Promise.all([loadImgAsync(point.draw), loadImgAsync(point.mask)]).then(([dImg, mImg]) => {
      if (!inpaintDrawCtx || !inpaintMaskCtx) return;
      const dc = inpaintDrawCtx.canvas;
      const mc = inpaintMaskCtx.canvas;
      inpaintDrawCtx.clearRect(0, 0, dc.width, dc.height);
      inpaintDrawCtx.drawImage(dImg, 0, 0, dc.width, dc.height);
      inpaintMaskCtx.clearRect(0, 0, mc.width, mc.height);
      inpaintMaskCtx.drawImage(mImg, 0, 0, mc.width, mc.height);
    });
  }

  // 撤销：弹出最近一条历史写回画布，并把当前状态压入重做栈
  function undoInpaintStroke() {
    if (sctInpaintHistory.busy || sctInpaintHistory.undo.length === 0) return;
    let current = null;
    try {
      current = { draw: inpaintDrawCtx.canvas.toDataURL('image/png'), mask: inpaintMaskCtx.canvas.toDataURL('image/png') };
    } catch (_) { return; }
    const target = sctInpaintHistory.undo.pop();
    if (!target) return;
    sctInpaintHistory.redo.push(current);
    sctInpaintHistory.busy = true;
    updateInpaintHistoryButtons();
    restoreInpaintHistoryPoint(target).catch(() => showToast('撤销失败', 'error')).finally(() => {
      sctInpaintHistory.busy = false;
      updateInpaintHistoryButtons();
    });
  }

  // 重做：弹出重做栈写回画布，并把当前状态压回撤销栈（受上限约束）
  function redoInpaintStroke() {
    if (sctInpaintHistory.busy || sctInpaintHistory.redo.length === 0) return;
    let current = null;
    try {
      current = { draw: inpaintDrawCtx.canvas.toDataURL('image/png'), mask: inpaintMaskCtx.canvas.toDataURL('image/png') };
    } catch (_) { return; }
    const target = sctInpaintHistory.redo.pop();
    if (!target) return;
    sctInpaintHistory.undo.push(current);
    if (sctInpaintHistory.undo.length > sctInpaintHistory.max) sctInpaintHistory.undo.shift();
    sctInpaintHistory.busy = true;
    updateInpaintHistoryButtons();
    restoreInpaintHistoryPoint(target).catch(() => showToast('重做失败', 'error')).finally(() => {
      sctInpaintHistory.busy = false;
      updateInpaintHistoryButtons();
    });
  }

  // 将返回的蒙版渲染并同步写入 inpaintMaskCanvas 与 inpaintDrawCanvas
  async function applyMaskImageToCanvas(maskUrl, addMode) {
    // SAM/点选结果写入前先快照，作为可撤销的历史点
    captureInpaintHistoryPoint();
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const w = inpaintMaskCanvas.width;
          const h = inpaintMaskCanvas.height;

          // 1. 读取返回的蒙版图片像素数据 (ComfyUI 输出的是 RGB 黑白二值图)
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = w;
          tempCanvas.height = h;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(img, 0, 0, w, h);
          const imgData = tempCtx.getImageData(0, 0, w, h);
          const d = imgData.data;

          // 获取底层黑白蒙版和顶层半透明视觉层的像素数组
          const maskImgData = inpaintMaskCtx.getImageData(0, 0, w, h);
          const md = maskImgData.data;

          const visualImgData = inpaintDrawCtx.getImageData(0, 0, w, h);
          const vd = visualImgData.data;

          let hasSelectedPixels = false;

          // 2. 逐像素按亮度提取选区，将黑底转换为完全透明 (Alpha=0)，白色选区转为半透明品红
          for (let i = 0; i < d.length; i += 4) {
            // 灰度亮度判定：大于 40 则视为模型识别出的目标分割区域
            const isMaskArea = d[i] > 40;

            if (isMaskArea) {
              hasSelectedPixels = true;

              // 底层离屏蒙版设为纯白 (#ffffff，Alpha=255)
              md[i] = 255;
              md[i + 1] = 255;
              md[i + 2] = 255;
              md[i + 3] = 255;

              // 视觉层设为半透明红色高亮 (rgba(239, 68, 68, 0.55))
              vd[i] = 239;
              vd[i + 1] = 68;
              vd[i + 2] = 68;
              vd[i + 3] = 140; // 0.55 * 255 ≈ 140
            } else if (!addMode) {
              // 非累加模式下，背景区域设为纯黑并使视觉层完全透明
              md[i] = 0;
              md[i + 1] = 0;
              md[i + 2] = 0;
              md[i + 3] = 255;

              vd[i] = 0;
              vd[i + 1] = 0;
              vd[i + 2] = 0;
              vd[i + 3] = 0; // 关键：完全透明，绝不遮挡画面！
            }
          }

          // 3. 将转换后的像素数据写回画布
          inpaintMaskCtx.putImageData(maskImgData, 0, 0);
          inpaintDrawCtx.putImageData(visualImgData, 0, 0);

          if (!hasSelectedPixels) {
            showToast('提示：未在当前画面中检测到该目标，建议使用【🎯 鼠标点选】或手动涂抹', 'warning');
          }

          resolve(hasSelectedPixels);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('加载分割蒙版图像失败'));
      img.src = maskUrl;
    });
  }

  // 反转当前已有选区 (白变黑，黑变白)
  function invertCurrentMask() {
    if (!inpaintMaskCtx || !inpaintMaskCanvas || !inpaintDrawCtx) return;
    // 反选动作本身也可撤销：先快照当前状态
    captureInpaintHistoryPoint();
    const w = inpaintMaskCanvas.width;
    const h = inpaintMaskCanvas.height;
    const maskImgData = inpaintMaskCtx.getImageData(0, 0, w, h);
    const md = maskImgData.data;

    const visualImgData = inpaintDrawCtx.createImageData(w, h);
    const vd = visualImgData.data;

    for (let i = 0; i < md.length; i += 4) {
      const isSelected = md[i] > 40;
      if (isSelected) {
        // 原来是选区 -> 变为背景保留区 (黑底、完全透明)
        md[i] = 0;
        md[i + 1] = 0;
        md[i + 2] = 0;
        md[i + 3] = 255;

        vd[i] = 0;
        vd[i + 1] = 0;
        vd[i + 2] = 0;
        vd[i + 3] = 0;
      } else {
        // 原来是背景 -> 变为重绘选区 (白底、半透明红)
        md[i] = 255;
        md[i + 1] = 255;
        md[i + 2] = 255;
        md[i + 3] = 255;

        vd[i] = 239;
        vd[i + 1] = 68;
        vd[i + 2] = 68;
        vd[i + 3] = 140;
      }
    }

    inpaintMaskCtx.putImageData(maskImgData, 0, 0);
    inpaintDrawCtx.putImageData(visualImgData, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // 分割模型回退链：主力组合失败(缺模型/OOM/下载失败/异常)时自动逐档降级，保证功能始终可用
  // ---------------------------------------------------------------------------
  const SEG_TEXT_FALLBACKS = [
    { sam: 'sam_hq_vit_h (2.57GB)', dino: 'GroundingDINO_SwinB (938MB)' },
    { sam: 'sam_vit_h (2.56GB)', dino: 'GroundingDINO_SwinB (938MB)' },
    { sam: 'sam_vit_b (375MB)', dino: 'GroundingDINO_SwinT_OGC (694MB)' }
  ];
  const SEG_POINT_FALLBACKS = [
    'sam2.1_hiera_large.safetensors',
    'sam2_hiera_base_plus.safetensors'
  ];
  let lastSegModelInfo = '';

  // 中文检测：GroundingDINO 只认英文，含中文即需翻译
  function hasChineseText(str) {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(str || '');
  }

  // 带超时的请求工具 (翻译源不可达时快速放弃，避免卡 UI)
  async function fetchWithTimeout(url, ms = 9000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // 自定义关键词自动翻译成英文 (Google gtx → MyMemory → Lingva 三源兜底 + 内存缓存，全部失败则原样尽力回退)
  const segTranslationCache = new Map();
  async function translateSegPromptToEnglish(text) {
    const raw = (text || '').trim();
    if (!raw || !hasChineseText(raw)) return raw;
    if (segTranslationCache.has(raw)) return segTranslationCache.get(raw);

    let result = '';
    const providers = [
      async () => {
        const q = encodeURIComponent(raw);
        const res = await fetchWithTimeout(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${q}`);
        if (!res.ok) throw new Error('gtx ' + res.status);
        const data = await res.json();
        const out = (data && Array.isArray(data[0])) ? data[0].map(seg => (seg && seg[0]) ? seg[0] : '').join(' ') : '';
        if (!out.trim()) throw new Error('gtx empty');
        return out;
      },
      async () => {
        const q = encodeURIComponent(raw.slice(0, 450));
        const res = await fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${q}&langpair=zh-CN|en`);
        if (!res.ok) throw new Error('mymemory ' + res.status);
        const data = await res.json();
        const out = data?.responseData?.translatedText || '';
        if (!out.trim() || /MYMEMORY WARNING/i.test(out)) throw new Error('mymemory empty');
        return out;
      },
      async () => {
        const res = await fetchWithTimeout(`https://lingva.ml/api/v1/auto/en/${encodeURIComponent(raw)}`);
        if (!res.ok) throw new Error('lingva ' + res.status);
        const data = await res.json();
        const out = data?.translation || '';
        if (!out.trim()) throw new Error('lingva empty');
        return out;
      }
    ];

    for (const provider of providers) {
      try {
        const out = (await provider()).trim();
        if (out) { result = out; break; }
      } catch (_) {}
    }

    if (!result) {
      // 三个翻译源都不可达：尽力保留英文部分，规避纯中文喂入导致 GroundingDINO 必然失败
      result = raw.toLowerCase().replace(/[^a-z0-9,. \-_%()]+/gi, ' ').replace(/\s+/g, ' ').trim();
    }

    if (segTranslationCache.size > 120) segTranslationCache.clear();
    segTranslationCache.set(raw, result);
    return result;
  }

  // 常用英文提示词包 (画板自定义识别输入框下方点击即追加)
  const SCT_PROMPT_PACK = [
    { group: '五官', items: ['face', 'eyes', 'eyelashes', 'eyebrows', 'mouth', 'lips', 'nose', 'ears', 'head', 'hair', 'ponytail', 'twintails', 'bangs', 'long hair', 'short hair', 'blush', 'smile', 'open mouth', 'closed eyes'] },
    { group: '服饰', items: ['dress', 'skirt', 'pleated skirt', 'school uniform', 'shirt', 'blouse', 'jacket', 'coat', 'hoodie', 'sweater', 'kimono', 'maid outfit', 'swimsuit', 'stockings', 'thighhighs', 'socks', 'gloves', 'scarf', 'ribbon', 'hat', 'necklace', 'earrings', 'bow tie'] },
    { group: '手足', items: ['arms', 'hands', 'fingers', 'torso', 'chest', 'waist', 'hips', 'legs', 'thighs', 'knees', 'feet', 'shoes', 'boots', 'sandals', 'barefoot', 'skin'] },
    { group: '场景物', items: ['background', 'sky', 'clouds', 'window', 'curtains', 'bed', 'sofa', 'desk', 'chair', 'mirror', 'door', 'bag', 'book', 'smartphone', 'cup', 'umbrella', 'flower', 'bouquet', 'tree', 'street', 'indoor', 'outdoor', 'sword', 'laptop'] }
  ];

  // 执行 ComfyUI 图像分割任务 (支持语义文本分割与 SAM2 鼠标坐标点选)
  async function runComfySegmentationTask(options) {
    const { type, promptText, point, label } = options;
    const s = getSettings();
    if (!s.comfyEnabled) {
      showToast('ComfyUI 绘图服务未启用', 'warning');
      return;
    }

    if (inpaintSamBusy) {
      showToast('正在执行上一次分割识别，请稍候…', 'warning');
      return;
    }

    const modal = inpaintModalEl;
    if (!modal) return;

    const samStatus = modal.querySelector('#sct-sam-status');
    const samStatusText = modal.querySelector('#sct-sam-status-text');
    const addModeCheckbox = modal.querySelector('#sct-sam-add-mode');
    const isAddMode = !!(addModeCheckbox && addModeCheckbox.checked);

    try {
      inpaintSamBusy = true;
      if (samStatus) {
        samStatus.style.display = 'inline-flex';
        samStatusText.textContent = `正在使用 SAM 识别提取【${label || promptText || '选区'}】...`;
      }

      // 0. 优先命中前端本地分割蒙版缓存 (原图相同时，相同部位或点选坐标毫秒级直出)
      const cacheCoord = point ? `${Math.round(point.x)}_${Math.round(point.y)}` : '';
      const segCacheKey = `${currentInpaintUploadedName || inpaintContext.imageUrl}_${type}_${promptText || ''}_${cacheCoord}`;
      if (inpaintSegMaskCache.has(segCacheKey)) {
        const cachedMaskUrl = inpaintSegMaskCache.get(segCacheKey);
        await applyMaskImageToCanvas(cachedMaskUrl, isAddMode);
        showToast(`已从缓存快速提取【${label || promptText || '选区'}】`, 'success');
        return;
      }

      const comfyHost = getCleanComfyHost();

      // 1. 若尚未上传当前原图，则先上传原图至 ComfyUI
      if (!currentInpaintUploadedName) {
        let origBlob = null;
        try {
          const imgRes = await fetch(inpaintContext.imageUrl);
          origBlob = await imgRes.blob();
        } catch (_) {
          const baseImg = modal.querySelector('#sct-inpaint-base-img');
          if (baseImg) {
            const tc = document.createElement('canvas');
            tc.width = baseImg.naturalWidth;
            tc.height = baseImg.naturalHeight;
            tc.getContext('2d').drawImage(baseImg, 0, 0);
            origBlob = await new Promise(res => tc.toBlob(res, 'image/png'));
          }
        }
        if (!origBlob) throw new Error('无法读取当前图片用于分割');

        const origFormData = new FormData();
        origFormData.append('image', origBlob, `sam_orig_${Date.now()}.png`);
        origFormData.append('overwrite', 'true');
        const upRes = await fetch(`${comfyHost}/upload/image`, {
          method: 'POST',
          body: origFormData
        });
        if (!upRes.ok) throw new Error(`上传原图至 ComfyUI 失败 (${upRes.status})`);
        const upData = await upRes.json();
        currentInpaintUploadedName = upData.name;
      }

      // 2. 词语文本分割时自动把提示词翻译为英文 (GroundingDINO 仅认英文；带缓存与多源兜底)
      const isBg = (type === 'text' && promptText === '__background__');
      let segPrompt = (promptText || '').trim();
      if (type === 'text') {
        if (isBg) {
          segPrompt = 'girl, woman, person, boy, human';
        } else if (hasChineseText(segPrompt)) {
          if (samStatusText) samStatusText.textContent = `正在将【${segPrompt}】翻译为英文…`;
          try {
            segPrompt = await translateSegPromptToEnglish(segPrompt) || segPrompt;
          } catch (_) { /* 翻译失败将原词尽力回退 */ }
          if (samStatusText) samStatusText.textContent = `正在使用 SAM 识别提取【${label || segPrompt || '选区'}】...`;
        }
        segPrompt = segPrompt.toLowerCase().replace(/[，、]/g, ',').trim();
      }

      // 3. 模型回退链依次尝试：主力组合失败 (缺模型/OOM/下载失败/执行异常) 立即自动降级到下一档
      const candidates = type === 'text' ? SEG_TEXT_FALLBACKS : SEG_POINT_FALLBACKS;
      const formatCandidate = (c) => (type === 'text' ? `${c.sam} + ${c.dino}` : c);
      let outputImgInfo = null;
      const attemptErrors = [];
      const ts = Date.now();

      for (let ci = 0; ci < candidates.length; ci++) {
        const candidate = candidates[ci];
        let promptWf = null;
        let outputNodeId = '6';

        if (type === 'text') {
          if (isBg) {
            // 背景识别：以极高置信度锁定前景人物，并通过 InvertMask 得到纯净背景
            promptWf = {
              '1': { inputs: { image: currentInpaintUploadedName, upload: 'image' }, class_type: 'LoadImage' },
              '2': { inputs: { model_name: candidate.sam }, class_type: 'SAMModelLoader (segment anything)' },
              '3': { inputs: { model_name: candidate.dino }, class_type: 'GroundingDinoModelLoader (segment anything)' },
              '4': { inputs: { prompt: segPrompt, threshold: 0.22, sam_model: ['2', 0], grounding_dino_model: ['3', 0], image: ['1', 0] }, class_type: 'GroundingDinoSAMSegment (segment anything)' },
              'inv': { inputs: { mask: ['4', 1] }, class_type: 'InvertMask' },
              '5': { inputs: { mask: ['inv', 0] }, class_type: 'MaskToImage' },
              '6': { inputs: { filename_prefix: `sct_sam_bg_${ts}`, images: ['5', 0] }, class_type: 'SaveImage' }
            };
          } else {
            // 常规物体/身体部位识别
            promptWf = {
              '1': { inputs: { image: currentInpaintUploadedName, upload: 'image' }, class_type: 'LoadImage' },
              '2': { inputs: { model_name: candidate.sam }, class_type: 'SAMModelLoader (segment anything)' },
              '3': { inputs: { model_name: candidate.dino }, class_type: 'GroundingDinoModelLoader (segment anything)' },
              '4': { inputs: { prompt: segPrompt, threshold: 0.22, sam_model: ['2', 0], grounding_dino_model: ['3', 0], image: ['1', 0] }, class_type: 'GroundingDinoSAMSegment (segment anything)' },
              '5': { inputs: { mask: ['4', 1] }, class_type: 'MaskToImage' },
              '6': { inputs: { filename_prefix: `sct_sam_seg_${ts}`, images: ['5', 0] }, class_type: 'SaveImage' }
            };
          }
        } else if (type === 'point') {
          // SAM2 交互式坐标点选分割
          outputNodeId = '5';
          promptWf = {
            '1': { inputs: { image: currentInpaintUploadedName, upload: 'image' }, class_type: 'LoadImage' },
            '2': {
              inputs: {
                model: candidate,
                segmentor: 'single_image',
                device: 'cuda',
                precision: 'fp16'
              },
              class_type: 'DownloadAndLoadSAM2Model'
            },
            '3': {
              inputs: {
                sam2_model: ['2', 0],
                image: ['1', 0],
                keep_model_loaded: true,
                coordinates_positive: `[[${Math.round(point.x)}, ${Math.round(point.y)}]]`
              },
              class_type: 'Sam2Segmentation'
            },
            '4': { inputs: { mask: ['3', 0] }, class_type: 'MaskToImage' },
            '5': { inputs: { filename_prefix: `sct_sam2_seg_${ts}`, images: ['4', 0] }, class_type: 'SaveImage' }
          };
        }

        if (samStatusText && ci > 0) {
          samStatusText.textContent = `主力模型不可用，正在回退尝试第 ${ci + 1}/${candidates.length} 档：${formatCandidate(candidate)}…`;
        }

        try {
          // 3a. 提交任务到 ComfyUI
          const pRes = await fetch(`${comfyHost}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptWf })
          });
          if (!pRes.ok) throw new Error(`提交分割任务失败 (${pRes.status})`);
          const pData = await pRes.json();
          const promptId = pData.prompt_id;
          if (!promptId) throw new Error('ComfyUI 未返回有效任务 ID');

          // 3b. 轮询历史记录获取生成结果 (GPU 推理约需 1~2.5 秒，缓存命中约 0.3 秒)
          for (let i = 0; i < 35; i++) {
            await new Promise(r => setTimeout(r, 600));
            const hRes = await fetch(`${comfyHost}/history/${promptId}`);
            if (!hRes.ok) continue;
            const hData = await hRes.json();
            if (hData[promptId]) {
              const taskInfo = hData[promptId];
              const outImgs = taskInfo.outputs?.[outputNodeId]?.images;
              if (outImgs && outImgs.length > 0) {
                outputImgInfo = outImgs[0];
                break;
              }
              if (taskInfo.status?.status_str === 'error') {
                const errMsg = taskInfo.status?.messages?.find(m => m[0] === 'execution_error')?.[1]?.exception_message || '未知分割错误';
                throw new Error(errMsg);
              }
              if (taskInfo.status?.completed) {
                // 已完成但未能从 outputs[outputNodeId] 找到图片（尝试在 outputs 所有 key 中寻找）
                for (const k of Object.keys(taskInfo.outputs || {})) {
                  if (taskInfo.outputs[k]?.images && taskInfo.outputs[k].images.length > 0) {
                    outputImgInfo = taskInfo.outputs[k].images[0];
                    break;
                  }
                }
                if (outputImgInfo) break;
                throw new Error('ComfyUI 任务已完成但未返回生成图像');
              }
            }
          }

          if (outputImgInfo) {
            lastSegModelInfo = formatCandidate(candidate);
            break;
          }
          attemptErrors.push(`${formatCandidate(candidate)}: 等待结果超时`);
        } catch (candErr) {
          attemptErrors.push(`${formatCandidate(candidate)}: ${candErr.message}`);
        }
      }

      if (!outputImgInfo) {
        const detail = attemptErrors.length > 0 ? `（尝试过: ${attemptErrors.join('；')}）` : '';
        throw new Error(`所有分割模型档位均失败，请检查 ComfyUI 控制台${detail}`);
      }

      // 5. 应用蒙版到画布并缓存结果
      const maskUrl = `${comfyHost}/view?filename=${encodeURIComponent(outputImgInfo.filename)}&subfolder=${encodeURIComponent(outputImgInfo.subfolder || '')}&type=${encodeURIComponent(outputImgInfo.type || 'output')}&t=${Date.now()}`;
      inpaintSegMaskCache.set(segCacheKey, maskUrl);
      await applyMaskImageToCanvas(maskUrl, isAddMode);

      showToast(`已成功提取【${label || promptText || '目标区域'}】${lastSegModelInfo ? ' · ' + lastSegModelInfo : ''}`, 'success');

    } catch (err) {
      console.error('[SCT] SAM 分割失败:', err);
      showToast(`SAM 分割失败: ${err.message}`, 'error');
    } finally {
      inpaintSamBusy = false;
      if (samStatus) samStatus.style.display = 'none';
    }
  }

  function ensureInpaintModal() {
    if (inpaintModalEl) return inpaintModalEl;

    const overlay = document.createElement('div');
    overlay.id = 'sct-inpaint-modal';
    overlay.className = 'sct-inpaint-overlay';
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML = `
      <div class="sct-inpaint-dialog">
        <div class="sct-inpaint-header">
          <div class="sct-inpaint-title">
            <span>🖌️</span>
            <span>ComfyUI 图像局部重绘 (Inpainting)</span>
          </div>
          <button type="button" class="sct-inpaint-close-btn" title="关闭 (Esc)">✕</button>
        </div>

        <div class="sct-inpaint-body">
          <div class="sct-inpaint-stage-wrapper">
            <div class="sct-inpaint-canvas-container" id="sct-inpaint-canvas-container">
              <div class="sct-inpaint-canvas-stage" id="sct-inpaint-canvas-stage">
                <img id="sct-inpaint-base-img" crossOrigin="anonymous" alt="Inpaint Base" />
                <canvas id="sct-inpaint-draw-canvas"></canvas>
              </div>
            </div>

            <div class="sct-inpaint-toolbar">
              <div class="sct-tool-group">
                <button type="button" class="sct-comfy-btn sct-tool-btn active" id="sct-tool-brush">🖌️ 涂抹</button>
                <button type="button" class="sct-comfy-btn sct-tool-btn" id="sct-tool-eraser">🧹 橡皮擦</button>
                <button type="button" class="sct-comfy-btn sct-tool-btn" id="sct-tool-undo" title="撤销上一笔涂抹或上一步蒙版操作">↩️ 撤销</button>
                <button type="button" class="sct-comfy-btn sct-tool-btn" id="sct-tool-redo" title="重做被撤销的操作">↪️ 重做</button>
                <button type="button" class="sct-comfy-btn" id="sct-tool-clear">🗑️ 清空涂抹</button>
              </div>

              <div class="sct-tool-group sct-brush-size-group">
                <span>笔刷粗细: <b id="sct-brush-size-val">30px</b></span>
                <input type="range" id="sct-brush-size-slider" min="8" max="100" value="30" />
              </div>

              <!-- 画板视图放大/缩小调节 (方便细化眼睛/手等细节) -->
              <div class="sct-tool-group sct-zoom-group">
                <span style="font-size:12px; opacity:0.8;">画板缩放:</span>
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-zoom-out" title="缩小画板视图">🔍 -</button>
                <span id="sct-zoom-val" style="font-size:12px; min-width:38px; text-align:center; font-weight:600;">100%</span>
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-zoom-in" title="放大画板视图 (方便细画微小细节)">🔍 +</button>
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-zoom-reset" title="恢复适应屏幕 (100%)">适应</button>
              </div>
            </div>

            <!-- SAM 智能图像分割选区面板 (Segment Anything) -->
            <div class="sct-inpaint-sam-panel">
              <div class="sct-sam-header">
                <span class="sct-sam-title">✨ SAM 智能分割选区 (Segment Anything)</span>
                <div class="sct-sam-mode-toggle">
                  <label class="sct-sam-mode-label" title="开启后，点击提取的选区将累加到当前涂抹上；关闭则单选替换">
                    <input type="checkbox" id="sct-sam-add-mode" /> 累加模式
                  </label>
                  <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-tool-invert" title="反转当前所有选区 (前景变背景，背景变前景)">🔄 反选</button>
                </div>
              </div>

              <div class="sct-sam-body">
                <div class="sct-sam-tags-container">
                  <span style="font-size:11.5px; opacity:0.75; display:inline-flex; align-items:center; margin-right:2px;">快捷部位:</span>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="anime face, face, head">😊 脸部</button>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="anime hair, hair, ponytail">💇 头发</button>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="shirt, top clothes, blouse, jacket, upper body clothes, anime clothes">👕 上衣</button>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="dress, skirt, pleated skirt, anime dress">👗 裙子</button>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="pants, trousers, shorts, jeans">👖 裤子</button>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="arms, hands, sleeve, gloves">🧤 手臂/双手</button>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="legs, thighs, stockings, pantyhose, socks">🦵 腿部</button>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="shoes, boots, footwear, sneakers">👟 鞋子</button>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="1girl, 1boy, anime character, girl, person">🧍 整个角色</button>
                  <button type="button" class="sct-sam-chip" data-sam-prompt="__background__">🏞️ 背景</button>
                </div>

                <div class="sct-prompt-pack" id="sct-prompt-pack"></div>

                <div class="sct-sam-custom-row">
                  <input type="text" id="sct-sam-custom-input" placeholder="输入任意关键词 (支持中文自动译英文，如: 眼镜、猫耳、翅膀、刀、尾巴)" />
                  <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-sam-custom-btn">🔍 智能抠出</button>
                  <button type="button" class="sct-comfy-btn sct-tool-btn" id="sct-sam-point-btn" title="开启后，在上方图片中点击任意物体，SAM2 将自动提取该物体轮廓">🎯 鼠标点选 (SAM2)</button>
                </div>

                <div class="sct-sam-status" id="sct-sam-status" style="display:none; margin-top:4px;">
                  <span class="sct-sam-spinner"></span>
                  <span id="sct-sam-status-text">正在使用 Segment Anything 识别分割中...</span>
                </div>
              </div>
            </div>
          </div>

          <div class="sct-inpaint-form">
            <div class="sct-setting-col" style="margin-bottom: 8px;">
              <label for="sct-inpaint-prompt-input">局部重绘提示词 (修改或补充涂抹区域特征)</label>
              <textarea id="sct-inpaint-prompt-input" class="text_pole sct-textarea-autowrap" rows="2" placeholder="描述涂抹区域期望呈现的画面内容…"></textarea>
            </div>

            <!-- 输出图像尺寸 (调节分辨率) -->
            <div class="sct-setting-col" style="margin-bottom: 8px;">
              <label for="sct-inpaint-size-preset">重绘生成尺寸 (调节输出图像分辨率)</label>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <select id="sct-inpaint-size-preset" class="text_pole" style="flex:1; min-width:180px; padding:6px 10px;">
                  <option value="original" selected>🔄 保持原图尺寸 (自动检测匹配)</option>
                  <option value="768x768">768 × 768 (1:1 标清方形)</option>
                  <option value="768x1024">768 × 1024 (3:4 标清竖屏)</option>
                  <option value="1024x768">1024 × 768 (4:3 标清横屏)</option>
                  <option value="832x1216">832 × 1216 (约 9:16 高清立绘 - 推荐动漫角色)</option>
                  <option value="1216x832">1216 × 832 (约 16:9 高清横屏 - 推荐宽景横幅)</option>
                  <option value="1024x1024">1024 × 1024 (1:1 高清方形)</option>
                  <option value="896x1344">896 × 1344 (超清大图竖屏)</option>
                  <option value="custom">✏️ 自定义长宽...</option>
                </select>
                <div id="sct-inpaint-custom-size-row" style="display:none; gap:6px; align-items:center;">
                  <input type="number" id="sct-inpaint-custom-w" placeholder="宽度" style="width:75px; padding:5px 8px; border-radius:6px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.2); color:#fff;" value="1024" step="64" min="256" max="2048" />
                  <span style="opacity:0.6;">×</span>
                  <input type="number" id="sct-inpaint-custom-h" placeholder="高度" style="width:75px; padding:5px 8px; border-radius:6px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.2); color:#fff;" value="1024" step="64" min="256" max="2048" />
                </div>
              </div>
              <div style="font-size:11px; opacity:0.6; margin-top:2px;">若当前图像分辨率较低或模糊，可选择更高分辨率直接放大高清重绘</div>
            </div>

            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom: 10px;">
              <div style="flex:1; min-width:180px;">
                <label style="font-size:12px;">重绘幅度 (Denoise): <b id="sct-inpaint-denoise-val">0.70</b></label>
                <input type="range" id="sct-inpaint-denoise-slider" min="0.2" max="1.0" step="0.05" value="0.70" style="width:100%;" />
                <div style="font-size:11px; opacity:0.6; margin-top:2px;">0.35 微调修复 | 0.70 替换细节(推荐) | 0.95 重新构图</div>
              </div>

              <div style="flex:1; min-width:160px;">
                <label style="font-size:12px;">蒙版边缘外扩: <b id="sct-inpaint-grow-val">6px</b></label>
                <input type="range" id="sct-inpaint-grow-slider" min="0" max="24" step="1" value="6" style="width:100%;" />
                <div style="font-size:11px; opacity:0.6; margin-top:2px;">向外羽化融合，避免接缝明显</div>
              </div>
            </div>

            <div class="sct-inpaint-footer-btns">
              <button type="button" class="sct-comfy-btn" id="sct-inpaint-cancel-btn">取消</button>
              <button type="button" class="sct-comfy-btn sct-primary-btn" id="sct-inpaint-submit-btn">🎨 开始局部重绘</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // 绑定关闭
    overlay.querySelector('.sct-inpaint-close-btn').addEventListener('click', closeInpaintModal);
    overlay.querySelector('#sct-inpaint-cancel-btn').addEventListener('click', closeInpaintModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeInpaintModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.style.display !== 'none') {
        closeInpaintModal();
      }
    });

    // 笔刷切换与 SAM2 模式联动
    const brushBtn = overlay.querySelector('#sct-tool-brush');
    const eraserBtn = overlay.querySelector('#sct-tool-eraser');
    const pointBtn = overlay.querySelector('#sct-sam-point-btn');

    brushBtn.addEventListener('click', () => {
      inpaintTool = 'brush';
      if (inpaintSamPointMode) {
        inpaintSamPointMode = false;
        pointBtn.classList.remove('active');
        pointBtn.textContent = '🎯 鼠标点选 (SAM2)';
        drawCanvas.style.cursor = 'default';
      }
      brushBtn.classList.add('active');
      eraserBtn.classList.remove('active');
    });

    eraserBtn.addEventListener('click', () => {
      inpaintTool = 'eraser';
      if (inpaintSamPointMode) {
        inpaintSamPointMode = false;
        pointBtn.classList.remove('active');
        pointBtn.textContent = '🎯 鼠标点选 (SAM2)';
        drawCanvas.style.cursor = 'default';
      }
      eraserBtn.classList.add('active');
      brushBtn.classList.remove('active');
    });

    // SAM2 点选模式按钮
    pointBtn.addEventListener('click', () => {
      inpaintSamPointMode = !inpaintSamPointMode;
      if (inpaintSamPointMode) {
        pointBtn.classList.add('active');
        pointBtn.textContent = '🎯 点击画面提取中… (点此退出)';
        drawCanvas.style.cursor = 'crosshair';
        brushBtn.classList.remove('active');
        eraserBtn.classList.remove('active');
        showToast('SAM2 点选模式已开启：请点击画面中的任意物体', 'info');
      } else {
        pointBtn.classList.remove('active');
        pointBtn.textContent = '🎯 鼠标点选 (SAM2)';
        drawCanvas.style.cursor = 'default';
        if (inpaintTool === 'brush') brushBtn.classList.add('active');
        else eraserBtn.classList.add('active');
      }
    });

    // 撤销/重做按钮绑定 (含禁用态管理)
    sctHistoryUIButtons = {
      undoBtn: overlay.querySelector('#sct-tool-undo'),
      redoBtn: overlay.querySelector('#sct-tool-redo')
    };
    if (sctHistoryUIButtons.undoBtn) {
      sctHistoryUIButtons.undoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        undoInpaintStroke();
      });
    }
    if (sctHistoryUIButtons.redoBtn) {
      sctHistoryUIButtons.redoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        redoInpaintStroke();
      });
    }
    updateInpaintHistoryButtons();

    // 反转当前选区
    overlay.querySelector('#sct-tool-invert').addEventListener('click', () => {
      invertCurrentMask();
      showToast('已反转当前选区', 'info');
    });

    // 部位快捷芯片点击
    overlay.querySelectorAll('.sct-sam-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        const promptText = chip.getAttribute('data-sam-prompt');
        const labelText = chip.textContent.trim();
        await runComfySegmentationTask({
          type: 'text',
          promptText: promptText,
          label: labelText
        });
      });
    });

    // 自定义文本分割
    const customInput = overlay.querySelector('#sct-sam-custom-input');
    const customBtn = overlay.querySelector('#sct-sam-custom-btn');
    const runCustomSeg = async () => {
      const val = (customInput.value || '').trim();
      if (!val) {
        showToast('请输入需要识别分割的目标关键词 (支持中文，会自动翻译成英文)', 'warning');
        return;
      }
      await runComfySegmentationTask({
        type: 'text',
        promptText: val,
        label: val
      });
    };
    customBtn.addEventListener('click', runCustomSeg);
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runCustomSeg();
      }
    });

    // 常用英文提示词包：按分组渲染芯片，点击追加到自定义输入框 (去重 + 逗号自动拼接)
    const packWrap = overlay.querySelector('#sct-prompt-pack');
    if (packWrap && typeof SCT_PROMPT_PACK !== 'undefined') {
      SCT_PROMPT_PACK.forEach(group => {
        const gRow = document.createElement('div');
        gRow.className = 'sct-pack-group';
        const gLabel = document.createElement('span');
        gLabel.className = 'sct-pack-group-label';
        gLabel.textContent = group.group;
        gRow.appendChild(gLabel);
        group.items.forEach(item => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'sct-pack-chip';
          chip.textContent = item;
          chip.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cur = customInput.value.trim().replace(/,+$/, '');
            if (!cur.length) customInput.value = item;
            else if (!customInput.value.toLowerCase().includes(item.toLowerCase())) customInput.value = cur + ', ' + item;
            customInput.focus();
          });
          gRow.appendChild(chip);
        });
        packWrap.appendChild(gRow);
      });
    }

    // 清空涂抹
    overlay.querySelector('#sct-tool-clear').addEventListener('click', () => {
      // 清空同样可撤销
      captureInpaintHistoryPoint();
      const drawCanvas = overlay.querySelector('#sct-inpaint-draw-canvas');
      if (inpaintDrawCtx && drawCanvas) {
        inpaintDrawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      }
      if (inpaintMaskCtx && inpaintMaskCanvas) {
        inpaintMaskCtx.fillStyle = '#000000';
        inpaintMaskCtx.fillRect(0, 0, inpaintMaskCanvas.width, inpaintMaskCanvas.height);
      }
    });

    // 笔刷粗细滑块
    const brushSizeSlider = overlay.querySelector('#sct-brush-size-slider');
    const brushSizeVal = overlay.querySelector('#sct-brush-size-val');
    brushSizeSlider.addEventListener('input', (e) => {
      inpaintBrushSize = parseInt(e.target.value, 10) || 30;
      brushSizeVal.textContent = `${inpaintBrushSize}px`;
    });

    // 重绘幅度与蒙版外扩滑块
    const denoiseSlider = overlay.querySelector('#sct-inpaint-denoise-slider');
    const denoiseVal = overlay.querySelector('#sct-inpaint-denoise-val');
    denoiseSlider.addEventListener('input', (e) => {
      denoiseVal.textContent = parseFloat(e.target.value).toFixed(2);
    });

    const growSlider = overlay.querySelector('#sct-inpaint-grow-slider');
    const growVal = overlay.querySelector('#sct-inpaint-grow-val');
    growSlider.addEventListener('input', (e) => {
      growVal.textContent = `${e.target.value}px`;
    });

    // 画板缩放控制按钮绑定
    const zoomInBtn = overlay.querySelector('#sct-zoom-in');
    const zoomOutBtn = overlay.querySelector('#sct-zoom-out');
    const zoomResetBtn = overlay.querySelector('#sct-zoom-reset');

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        inpaintZoomLevel = Math.min(3.0, Math.round((inpaintZoomLevel + 0.25) * 100) / 100);
        applyInpaintZoom();
      });
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        inpaintZoomLevel = Math.max(0.5, Math.round((inpaintZoomLevel - 0.25) * 100) / 100);
        applyInpaintZoom();
      });
    }

    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        inpaintZoomLevel = 1.0;
        applyInpaintZoom();
      });
    }

    // 重绘分辨率选择与自定义宽高联动
    const sizePresetSelect = overlay.querySelector('#sct-inpaint-size-preset');
    const customSizeRow = overlay.querySelector('#sct-inpaint-custom-size-row');
    if (sizePresetSelect && customSizeRow) {
      sizePresetSelect.addEventListener('change', () => {
        if (sizePresetSelect.value === 'custom') {
          customSizeRow.style.display = 'inline-flex';
        } else {
          customSizeRow.style.display = 'none';
        }
      });
    }

    // 画布涂抹事件绑定
    const drawCanvas = overlay.querySelector('#sct-inpaint-draw-canvas');
    inpaintDrawCtx = drawCanvas.getContext('2d');
    inpaintMaskCanvas = document.createElement('canvas');
    inpaintMaskCtx = inpaintMaskCanvas.getContext('2d');

    function getCanvasCoords(e) {
      const rect = drawCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = drawCanvas.width / (rect.width || 1);
      const scaleY = drawCanvas.height / (rect.height || 1);
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function doPaintStroke(x, y) {
      const rect = drawCanvas.getBoundingClientRect();
      const scaleRatio = drawCanvas.width / (rect.width || drawCanvas.width || 1);
      const rad = inpaintBrushSize * scaleRatio;

      // 视觉层画布 (半透明品红/红高亮涂抹)
      inpaintDrawCtx.save();
      if (inpaintTool === 'brush') {
        inpaintDrawCtx.globalCompositeOperation = 'source-over';
        inpaintDrawCtx.fillStyle = 'rgba(239, 68, 68, 0.55)';
        inpaintDrawCtx.beginPath();
        inpaintDrawCtx.arc(x, y, rad / 2, 0, Math.PI * 2);
        inpaintDrawCtx.fill();

        inpaintDrawCtx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
        inpaintDrawCtx.lineWidth = rad;
        inpaintDrawCtx.lineCap = 'round';
        inpaintDrawCtx.lineJoin = 'round';
        inpaintDrawCtx.beginPath();
        inpaintDrawCtx.moveTo(inpaintLastX, inpaintLastY);
        inpaintDrawCtx.lineTo(x, y);
        inpaintDrawCtx.stroke();
      } else {
        // 橡皮擦
        inpaintDrawCtx.globalCompositeOperation = 'destination-out';
        inpaintDrawCtx.beginPath();
        inpaintDrawCtx.arc(x, y, rad / 2, 0, Math.PI * 2);
        inpaintDrawCtx.fill();

        inpaintDrawCtx.lineWidth = rad;
        inpaintDrawCtx.lineCap = 'round';
        inpaintDrawCtx.lineJoin = 'round';
        inpaintDrawCtx.beginPath();
        inpaintDrawCtx.moveTo(inpaintLastX, inpaintLastY);
        inpaintDrawCtx.lineTo(x, y);
        inpaintDrawCtx.stroke();
      }
      inpaintDrawCtx.restore();

      // 离屏黑白蒙版画布 (黑底 0，白区域 255)
      inpaintMaskCtx.save();
      if (inpaintTool === 'brush') {
        inpaintMaskCtx.fillStyle = '#ffffff';
        inpaintMaskCtx.beginPath();
        inpaintMaskCtx.arc(x, y, rad / 2, 0, Math.PI * 2);
        inpaintMaskCtx.fill();

        inpaintMaskCtx.strokeStyle = '#ffffff';
        inpaintMaskCtx.lineWidth = rad;
        inpaintMaskCtx.lineCap = 'round';
        inpaintMaskCtx.lineJoin = 'round';
        inpaintMaskCtx.beginPath();
        inpaintMaskCtx.moveTo(inpaintLastX, inpaintLastY);
        inpaintMaskCtx.lineTo(x, y);
        inpaintMaskCtx.stroke();
      } else {
        inpaintMaskCtx.fillStyle = '#000000';
        inpaintMaskCtx.beginPath();
        inpaintMaskCtx.arc(x, y, rad / 2, 0, Math.PI * 2);
        inpaintMaskCtx.fill();

        inpaintMaskCtx.strokeStyle = '#000000';
        inpaintMaskCtx.lineWidth = rad;
        inpaintMaskCtx.lineCap = 'round';
        inpaintMaskCtx.lineJoin = 'round';
        inpaintMaskCtx.beginPath();
        inpaintMaskCtx.moveTo(inpaintLastX, inpaintLastY);
        inpaintMaskCtx.lineTo(x, y);
        inpaintMaskCtx.stroke();
      }
      inpaintMaskCtx.restore();

      inpaintLastX = x;
      inpaintLastY = y;
    }

    // 鼠标事件
    drawCanvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const c = getCanvasCoords(e);
      if (inpaintSamPointMode) {
        runComfySegmentationTask({
          type: 'point',
          point: { x: c.x, y: c.y },
          label: `坐标(${Math.round(c.x)}, ${Math.round(c.y)})物体`
        });
        return;
      }
      if (sctInpaintHistory.busy) return;
      // 起笔前记录快照，作为一笔涂抹的可撤销历史点
      captureInpaintHistoryPoint();
      inpaintIsDrawing = true;
      inpaintLastX = c.x;
      inpaintLastY = c.y;
      doPaintStroke(c.x, c.y);
    });

    window.addEventListener('mousemove', (e) => {
      if (!inpaintIsDrawing) return;
      const c = getCanvasCoords(e);
      doPaintStroke(c.x, c.y);
    });

    window.addEventListener('mouseup', () => {
      inpaintIsDrawing = false;
    });

    // 触屏事件
    drawCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches && e.touches.length === 1) {
        const c = getCanvasCoords(e);
        if (inpaintSamPointMode) {
          runComfySegmentationTask({
            type: 'point',
            point: { x: c.x, y: c.y },
            label: `坐标(${Math.round(c.x)}, ${Math.round(c.y)})物体`
          });
          return;
        }
        if (sctInpaintHistory.busy) return;
        // 起笔前记录快照，作为一笔涂抹的可撤销历史点
        captureInpaintHistoryPoint();
        inpaintIsDrawing = true;
        inpaintLastX = c.x;
        inpaintLastY = c.y;
        doPaintStroke(c.x, c.y);
      }
    }, { passive: false });

    drawCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (inpaintIsDrawing && e.touches && e.touches.length === 1) {
        const c = getCanvasCoords(e);
        doPaintStroke(c.x, c.y);
      }
    }, { passive: false });

    drawCanvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      inpaintIsDrawing = false;
    }, { passive: false });

    // 提交局部重绘任务
    overlay.querySelector('#sct-inpaint-submit-btn').addEventListener('click', async () => {
      if (!inpaintContext) return;
      const { imageUrl, promptText, activeLoras, container } = inpaintContext;

      // 验证是否涂抹了蒙版
      let hasMask = false;
      try {
        const pData = inpaintMaskCtx.getImageData(0, 0, inpaintMaskCanvas.width, inpaintMaskCanvas.height).data;
        for (let i = 0; i < pData.length; i += 4) {
          if (pData[i] > 30) {
            hasMask = true;
            break;
          }
        }
      } catch (_) {
        hasMask = true;
      }

      if (!hasMask) {
        showToast('请先用智能分割或画笔涂抹需要局部修改的区域', 'warning');
        return;
      }

      const inpaintPrompt = (overlay.querySelector('#sct-inpaint-prompt-input').value || promptText || '').trim();
      const denoiseVal = parseFloat(overlay.querySelector('#sct-inpaint-denoise-slider').value) || 0.70;
      const growVal = parseInt(overlay.querySelector('#sct-inpaint-grow-slider').value, 10) || 6;

      // 解析用户指定的目标重绘分辨率
      let targetW = 0;
      let targetH = 0;
      const sizeVal = overlay.querySelector('#sct-inpaint-size-preset')?.value || 'original';
      if (sizeVal === 'custom') {
        const rawW = parseInt(overlay.querySelector('#sct-inpaint-custom-w')?.value, 10);
        const rawH = parseInt(overlay.querySelector('#sct-inpaint-custom-h')?.value, 10);
        if (!isNaN(rawW) && rawW > 0) targetW = Math.min(2048, Math.max(256, Math.round(rawW / 8) * 8));
        if (!isNaN(rawH) && rawH > 0) targetH = Math.min(2048, Math.max(256, Math.round(rawH / 8) * 8));
      } else if (sizeVal !== 'original' && sizeVal.includes('x')) {
        const parts = sizeVal.split('x');
        targetW = parseInt(parts[0], 10) || 0;
        targetH = parseInt(parts[1], 10) || 0;
      }

      closeInpaintModal();

      await triggerComfyInpaint({
        imageUrl: imageUrl,
        inpaintPrompt: inpaintPrompt,
        targetWidth: targetW,
        targetHeight: targetH,
        denoise: denoiseVal,
        growMaskBy: growVal,
        activeLoras: activeLoras,
        container: container,
        maskCanvas: inpaintMaskCanvas
      });
    });

    (document.body || document.documentElement).appendChild(overlay);
    inpaintModalEl = overlay;
    return overlay;
  }

  function openInpaintModal(options) {
    const { imageUrl, promptText, activeLoras, container } = options;
    inpaintContext = options;

    const modal = ensureInpaintModal();
    const baseImg = modal.querySelector('#sct-inpaint-base-img');
    const drawCanvas = modal.querySelector('#sct-inpaint-draw-canvas');
    const promptInput = modal.querySelector('#sct-inpaint-prompt-input');

    // 预填提示词
    promptInput.value = promptText || '';

    // 重置工具状态
    inpaintTool = 'brush';
    inpaintSamPointMode = false;
    currentInpaintUploadedName = null; // 重置当前上传图片名缓存
    inpaintSegMaskCache.clear();        // 清空当前图片的分割蒙版缓存

    // 新图新历史：清空涂抹撤销/重做栈
    sctInpaintHistory.undo.length = 0;
    sctInpaintHistory.redo.length = 0;
    sctInpaintHistory.busy = false;

    modal.querySelector('#sct-tool-brush').classList.add('active');
    modal.querySelector('#sct-tool-eraser').classList.remove('active');

    const pointBtn = modal.querySelector('#sct-sam-point-btn');
    if (pointBtn) {
      pointBtn.classList.remove('active');
      pointBtn.textContent = '🎯 鼠标点选 (SAM2)';
    }
    drawCanvas.style.cursor = 'default';

    const samStatus = modal.querySelector('#sct-sam-status');
    if (samStatus) samStatus.style.display = 'none';

    // 加载图片并同步尺寸
    baseImg.onload = () => {
      const natW = baseImg.naturalWidth || 512;
      const natH = baseImg.naturalHeight || 768;

      drawCanvas.width = natW;
      drawCanvas.height = natH;
      inpaintMaskCanvas.width = natW;
      inpaintMaskCanvas.height = natH;

      inpaintDrawCtx.clearRect(0, 0, natW, natH);
      inpaintMaskCtx.fillStyle = '#000000';
      inpaintMaskCtx.fillRect(0, 0, natW, natH);

      // 计算自适应展示尺寸与基准缩放比
      const maxStageW = Math.min(560, Math.max(280, (window.innerWidth || 800) - 48));
      const ratio = Math.min(1.0, maxStageW / natW);
      inpaintBaseDisplayW = Math.max(180, Math.round(natW * ratio));
      inpaintBaseDisplayH = Math.max(180, Math.round(natH * ratio));
      inpaintZoomLevel = 1.0;
      applyInpaintZoom();

      // 动态更新保持原图尺寸选项的描述文字
      const optOriginal = modal.querySelector('#sct-inpaint-size-preset option[value="original"]');
      if (optOriginal) {
        optOriginal.textContent = `🔄 保持原图尺寸 (${natW} × ${natH})`;
      }
      const customWInput = modal.querySelector('#sct-inpaint-custom-w');
      const customHInput = modal.querySelector('#sct-inpaint-custom-h');
      if (customWInput) customWInput.value = natW;
      if (customHInput) customHInput.value = natH;
    };

    baseImg.src = imageUrl;
    modal.style.display = 'flex';
  }

  function closeInpaintModal() {
    if (inpaintModalEl) inpaintModalEl.style.display = 'none';
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

  // 判断 promptText 是否属于“明确的双角色且存在肢体接触或互动动作”
  function isDualCharacterWithInteraction(promptText) {
    if (!promptText) return false;
    const lower = promptText.toLowerCase();

    // 1. 检查是否存在双角色指示词 (如 1girl, 1boy / 2girls / couple 等)
    const hasDualSubject = /(?:1girl\s*,\s*1boy|1boy\s*,\s*1girl|2girls|2boys|pair|couple)/i.test(lower);
    if (!hasDualSubject) return false;

    // 2. 检查是否存在具体的身体接触或互动动作关键词 (中英文全覆盖)
    const interactionKeywords = [
      'hug', 'hugging', 'embrace', 'embracing',
      'holding hands', 'hand in hand', 'holding hand',
      'kiss', 'kissing',
      'lap', 'sitting on lap', 'on his lap', 'on her lap',
      'cuddle', 'cuddling', 'snuggle',
      'lean on', 'leaning on', 'leaning against',
      'piggyback', 'princess carry', 'carrying',
      'intertwined', 'arm around', 'arms around',
      'touching', 'physical contact',
      '拥抱', '牵手', '接吻', '坐在腿上', '依偎', '靠在', '抚摸'
    ];

    return interactionKeywords.some(kw => lower.includes(kw));
  }

  // 检测生图应激活的角色 LoRA (严格遵循防污染机制：除非双角色有动作或身体接触，否则每次只激活 1 个 LoRA，且优先精准匹配 tag 本身)
  function detectActiveLoras(fullText, promptText) {
    const s = getSettings();
    const loras = s.comfyLoras || [];
    if (!loras || loras.length === 0) return [];

    const lowerPrompt = (promptText || '').toLowerCase();
    const lowerFull = (fullText || '').toLowerCase();

    // 核心准则：双角色且有互动最多允许 3~4 个，单角色正常允许最多 3 个 (常驻 1~2 个 + 动态匹配 1 个)
    const isDual = isDualCharacterWithInteraction(lowerPrompt);
    const maxTotalLoras = isDual ? 4 : 3;

    const matchedLoras = [];

    // Helper: 检查某个 LoRA 是否与指定文本匹配
    function matchLoraAgainstText(lora, text) {
      if (!lora.enabled || !lora.name) return false;
      // 检查配置的关键词 (如 'emilia, 艾米莉亚')
      if (lora.keywords) {
        const kws = lora.keywords.split(/[,，\n|]/).map(k => k.trim().toLowerCase()).filter(Boolean);
        if (kws.some(k => text.includes(k))) return true;
      }
      // 检查触发词特定特征 (去除 1girl/1boy 等泛词)
      if (lora.triggerWords) {
        const tws = lora.triggerWords.split(/[,，\n|]/).map(k => k.trim().toLowerCase()).filter(k => k.length > 2 && !['1girl', '1boy', 'solo', 'masterpiece', '2girls'].includes(k));
        if (tws.some(k => text.includes(k))) return true;
      }
      // 检查 LoRA 文件名本身的主名
      const cleanName = lora.name.replace(/\.[^/.]+$/, '').trim().toLowerCase();
      if (cleanName.length > 2 && text.includes(cleanName)) return true;
      return false;
    }

    // 第 0 阶段【最高优先级 · 绝对常驻】：所有已启用且勾选了常驻生效 (alwaysOn) 的 LoRA 必须直接无条件全量挂载！
    // 无论是画风 LoRA 还是固定角色 LoRA，永远稳定生效，绝不被任何关键词或单名额逻辑挤掉！
    for (const item of loras) {
      if (!item.enabled || !item.name) continue;
      if (item.alwaysOn) {
        if (!matchedLoras.some(x => x.id === item.id || x.name === item.name)) {
          matchedLoras.push(item);
        }
      }
    }

    // 第 1 阶段【动态匹配补充】：若总名额未满，优先从生图标签自身 (promptText) 识别专属角色或服装 LoRA
    if (matchedLoras.length < maxTotalLoras) {
      for (const item of loras) {
        if (matchedLoras.length >= maxTotalLoras) break;
        if (!item.enabled || !item.name || item.alwaysOn) continue; // 已常驻的不重复匹配
        if (matchLoraAgainstText(item, lowerPrompt)) {
          if (!matchedLoras.some(x => x.id === item.id || x.name === item.name)) {
            matchedLoras.push(item);
          }
        }
      }
    }

    // 第 2 阶段【上下文兜底匹配】：若除常驻外尚未动态命中任何角色，再使用聊天消息正文 (fullText) 兜底寻找 1 个角色
    const hasDynamicLora = matchedLoras.some(l => !l.alwaysOn);
    if (!hasDynamicLora && matchedLoras.length < maxTotalLoras) {
      for (const item of loras) {
        if (matchedLoras.length >= maxTotalLoras) break;
        if (!item.enabled || !item.name || item.alwaysOn) continue;
        if (matchLoraAgainstText(item, lowerFull)) {
          if (!matchedLoras.some(x => x.id === item.id || x.name === item.name)) {
            matchedLoras.push(item);
            break; // 正文兜底最多补充 1 个
          }
        }
      }
    }

    return matchedLoras.slice(0, maxTotalLoras);
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

  // 动态组装 ComfyUI 局部重绘工作流 (Inpainting + VAEEncodeForInpaint + LoadImageMask + 多 LoRA + 尺寸缩放)
  function buildComfyInpaintWorkflow(params) {
    const {
      checkpoint,
      positivePrompt,
      negativePrompt,
      uploadedImage,
      uploadedMask,
      targetWidth = 0,
      targetHeight = 0,
      denoise = 0.70,
      growMaskBy = 6,
      steps = 20,
      cfg = 7.0,
      sampler = 'euler',
      scheduler = 'normal',
      activeLoras = [],
      seed = Math.floor(Math.random() * 1000000000)
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

    // 3. LoadImage 原图 (Node 10)
    workflow["10"] = {
      "class_type": "LoadImage",
      "inputs": {
        "image": uploadedImage
      }
    };

    // 4. LoadImageMask 蒙版图 (Node 11) - 读取红色通道 (绘制区域为纯白色 255)
    workflow["11"] = {
      "class_type": "LoadImageMask",
      "inputs": {
        "image": uploadedMask,
        "channel": "red"
      }
    };

    let inpaintImageSource = ["10", 0];
    let inpaintMaskSource = ["11", 0];

    // 如果指定了输出目标尺寸，加入高保真 ImageScale 节点与蒙版双向缩放对齐
    const needScale = (parseInt(targetWidth, 10) > 0 && parseInt(targetHeight, 10) > 0);
    if (needScale) {
      const finalW = parseInt(targetWidth, 10);
      const finalH = parseInt(targetHeight, 10);

      // Node 13: 原图高质量 Lanczos 插值缩放
      workflow["13"] = {
        "class_type": "ImageScale",
        "inputs": {
          "image": ["10", 0],
          "upscale_method": "lanczos",
          "width": finalW,
          "height": finalH,
          "crop": "disabled"
        }
      };
      inpaintImageSource = ["13", 0];

      // Node 14: 蒙版转图像 (MaskToImage)
      workflow["14"] = {
        "class_type": "MaskToImage",
        "inputs": {
          "mask": ["11", 0]
        }
      };

      // Node 15: 蒙版图像双线性平滑插值缩放至目标分辨率 (ImageScale)
      workflow["15"] = {
        "class_type": "ImageScale",
        "inputs": {
          "image": ["14", 0],
          "upscale_method": "bilinear",
          "width": finalW,
          "height": finalH,
          "crop": "disabled"
        }
      };

      // Node 16: 缩放后的图像重新转换回蒙版 (ImageToMask)
      workflow["16"] = {
        "class_type": "ImageToMask",
        "inputs": {
          "image": ["15", 0],
          "channel": "red"
        }
      };
      inpaintMaskSource = ["16", 0];
    }

    // 5. VAEEncodeForInpaint 局部重绘专用潜空间编码 (Node 12)
    workflow["12"] = {
      "class_type": "VAEEncodeForInpaint",
      "inputs": {
        "pixels": inpaintImageSource,
        "vae": currentVae,
        "mask": inpaintMaskSource,
        "grow_mask_by": Math.max(0, parseInt(growMaskBy, 10) || 6)
      }
    };

    // 6. Positive CLIPTextEncode (Node 6)
    workflow["6"] = {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": currentClip,
        "text": positivePrompt
      }
    };

    // 7. Negative CLIPTextEncode (Node 7)
    workflow["7"] = {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "clip": currentClip,
        "text": negativePrompt
      }
    };

    // 8. KSampler 采样 (Node 3)
    workflow["3"] = {
      "class_type": "KSampler",
      "inputs": {
        "cfg": cfg,
        "denoise": parseFloat(denoise) || 0.70,
        "latent_image": ["12", 0],
        "model": currentModel,
        "negative": ["7", 0],
        "positive": ["6", 0],
        "sampler_name": sampler,
        "scheduler": scheduler,
        "seed": seed,
        "steps": steps
      }
    };

    // 9. VAE Decode (Node 8)
    workflow["8"] = {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["3", 0],
        "vae": currentVae
      }
    };

    // 10. SaveImage (Node 9)
    workflow["9"] = {
      "class_type": "SaveImage",
      "inputs": {
        "filename_prefix": "SillyTavern_Inpaint",
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
    const normalizedImages = (images || []).map(normalizeComfyImageUrl);
    const cardId = container.dataset.sctCardId || `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    container.dataset.sctCardId = cardId;

    let state = cardStateMap.get(cardId);
    if (!state) {
      state = { currentIdx: 0, images: normalizedImages, prompt: promptText, loras: activeLoras };
      cardStateMap.set(cardId, state);
    } else {
      state.images = normalizedImages;
    }

    const total = normalizedImages.length;
    const safeIdx = ((state.currentIdx % total) + total) % total;
    state.currentIdx = safeIdx;
    const currentUrl = normalizedImages[safeIdx];

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
          <img src="${currentUrl}" alt="ComfyUI Image ${safeIdx + 1}" title="单击放大查看 · 长按开启局部重绘" />
          ${total > 1 ? `<div class="sct-comfy-counter-badge">${safeIdx + 1} / ${total}</div>` : ''}
        </div>
        <div class="sct-comfy-footer">
          ${total > 1 ? `
            <button type="button" class="sct-comfy-btn sct-prev-btn">◀ 上一张</button>
            <div class="sct-comfy-dots">
              ${normalizedImages.map((_, i) => `<span class="sct-comfy-dot ${i === safeIdx ? 'active' : ''}" data-idx="${i}"></span>`).join('')}
            </div>
            <button type="button" class="sct-comfy-btn sct-next-btn">下一张 ▶</button>
            <button type="button" class="sct-comfy-btn sct-inpaint-btn" title="涂抹重绘当前画面 (或长按图片)">🖌️ 局部重绘</button>
            <button type="button" class="sct-comfy-btn sct-retry-btn" title="重新生成所有图片">🔄 重新生成</button>
          ` : `
            <span style="font-size: 11px; opacity: 0.5;">长按重绘 · 点击放大</span>
            <button type="button" class="sct-comfy-btn sct-inpaint-btn" title="涂抹重绘当前画面 (或长按图片)">🖌️ 局部重绘</button>
            <button type="button" class="sct-comfy-btn sct-retry-btn">🔄 重新生成</button>
          `}
        </div>
      </div>
    `;

    const vp = container.querySelector(`#vp_${cardId}`);
    vp.addEventListener('click', (e) => e.stopPropagation());

    const imgEl = vp.querySelector('img');
    bindLongPress(imgEl, (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      openInpaintModal({
        imageUrl: currentUrl,
        promptText: promptText,
        activeLoras: activeLoras,
        container: container
      });
    }, (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      openLightbox(currentUrl, promptText, activeLoras, container);
    });

    // 触摸滑动 (Touch Swipe - 严格区分左右横向翻图与页面上下垂直滚动)
    let touchStartX = 0;
    let touchStartY = 0;
    vp.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    vp.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches.length > 0 && total > 1) {
        const diffX = e.changedTouches[0].clientX - touchStartX;
        const diffY = e.changedTouches[0].clientY - touchStartY;
        // 只有当水平位移明显大于垂直位移 (至少 1.5 倍) 且绝对距离大于 50px 时才视作切换卡片，绝不干扰上下滚动！
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
          if (diffX > 50) {
            state.currentIdx = (state.currentIdx - 1 + total) % total;
            renderCarouselCard(container, state.images, promptText, activeLoras);
          } else if (diffX < -50) {
            state.currentIdx = (state.currentIdx + 1) % total;
            renderCarouselCard(container, state.images, promptText, activeLoras);
          }
        }
      }
    }, { passive: true });

    const prevBtn = container.querySelector('.sct-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.currentIdx = (state.currentIdx - 1 + total) % total;
        renderCarouselCard(container, state.images, promptText, activeLoras);
      });
    }

    const nextBtn = container.querySelector('.sct-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.currentIdx = (state.currentIdx + 1) % total;
        renderCarouselCard(container, state.images, promptText, activeLoras);
      });
    }

    container.querySelectorAll('.sct-comfy-dot').forEach((dot) => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(dot.dataset.idx, 10);
        if (!isNaN(idx)) {
          state.currentIdx = idx;
          renderCarouselCard(container, state.images, promptText, activeLoras);
        }
      });
    });

    const inpaintBtn = container.querySelector('.sct-inpaint-btn');
    if (inpaintBtn) {
      inpaintBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openInpaintModal({
          imageUrl: currentUrl,
          promptText: promptText,
          activeLoras: activeLoras,
          container: container
        });
      });
    }

    const retryBtn = container.querySelector('.sct-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tk = container.dataset.sctTaskKey;
        const mesId = container.dataset.sctMesId || container.closest('.mes')?.getAttribute('mesid');
        const slotIdx = container.dataset.sctSlotIdx || '0';
        if (tk) {
          sctDrawingTasks.delete(tk);
          removePersistentTask(tk);
        }
        if (mesId !== undefined && mesId !== null) {
          removeChatMessageExtraImages(mesId, slotIdx);
        }
        triggerComfyDraw(promptText, container, activeLoras, tk);
      });
    }
  }

  // 提交并调度 ComfyUI 局部重绘任务 (Inpainting)
  async function triggerComfyInpaint(params) {
    const {
      imageUrl,
      inpaintPrompt,
      targetWidth = 0,
      targetHeight = 0,
      denoise = 0.70,
      growMaskBy = 6,
      activeLoras = [],
      container,
      maskCanvas
    } = params;

    const s = getSettings();
    if (!s.comfyEnabled) {
      showToast('ComfyUI 绘图功能未开启', 'warning');
      return;
    }

    const cardId = container?.dataset?.sctCardId || `card_${Date.now()}`;
    const taskKey = `inpaint_${cardId}_${Date.now()}`;

    renderLoadingCard(container, inpaintPrompt, '🎨 正在上传原图与重绘蒙版至 ComfyUI…', taskKey);

    const comfyHost = getCleanComfyHost();

    try {
      // 1. 获取原图 Blob
      let origBlob = null;
      try {
        const imgRes = await fetch(imageUrl);
        origBlob = await imgRes.blob();
      } catch (_) {
        const baseImg = document.getElementById('sct-inpaint-base-img');
        if (baseImg) {
          const tc = document.createElement('canvas');
          tc.width = baseImg.naturalWidth;
          tc.height = baseImg.naturalHeight;
          tc.getContext('2d').drawImage(baseImg, 0, 0);
          origBlob = await new Promise(res => tc.toBlob(res, 'image/png'));
        }
      }

      if (!origBlob) {
        throw new Error('无法读取原图数据用于重绘');
      }

      // 2. 获取蒙版 Blob
      const maskBlob = await new Promise((res) => maskCanvas.toBlob(res, 'image/png'));
      if (!maskBlob) {
        throw new Error('导出重绘蒙版失败');
      }

      // 3. 上传原图至 ComfyUI /upload/image (若已通过 SAM 智能分割上传则直接复用缓存)
      let uploadedImageName = currentInpaintUploadedName;
      if (!uploadedImageName) {
        const origFormData = new FormData();
        origFormData.append('image', origBlob, `inpaint_orig_${Date.now()}.png`);
        origFormData.append('overwrite', 'true');
        const origUploadRes = await fetch(`${comfyHost}/upload/image`, {
          method: 'POST',
          body: origFormData
        });
        if (!origUploadRes.ok) throw new Error(`上传原图至 ComfyUI 失败 (${origUploadRes.status})`);
        const origUploadData = await origUploadRes.json();
        uploadedImageName = origUploadData.name;
        currentInpaintUploadedName = uploadedImageName;
      }

      // 4. 上传蒙版至 ComfyUI /upload/image
      const maskFormData = new FormData();
      maskFormData.append('image', maskBlob, `inpaint_mask_${Date.now()}.png`);
      maskFormData.append('overwrite', 'true');
      const maskUploadRes = await fetch(`${comfyHost}/upload/image`, {
        method: 'POST',
        body: maskFormData
      });
      if (!maskUploadRes.ok) throw new Error(`上传蒙版至 ComfyUI 失败 (${maskUploadRes.status})`);
      const maskUploadData = await maskUploadRes.json();
      const uploadedMaskName = maskUploadData.name;

      renderLoadingCard(container, inpaintPrompt, '🎨 正在构建局部重绘工作流并执行采样…', taskKey);

      // 5. 探查可用 Checkpoint
      let ckpt = s.comfyCheckpoint || '';
      if (!ckpt) {
        if (cachedCheckpoints.length === 0) {
          await scanComfyAssets(comfyHost);
        }
        ckpt = cachedCheckpoints[0] || 'v1-5-pruned-emaonly.safetensors';
      }

      // 注入 LoRA 特征词
      const loraTriggerWords = activeLoras.map(l => l.triggerWords).filter(Boolean).join(', ');
      const loraInjection = loraTriggerWords ? `${loraTriggerWords}, ` : '';
      const fullPositivePrompt = `${s.comfyFixedPositive || ''}${loraInjection}${inpaintPrompt}${s.comfyPromptSuffix || ''}`.trim();
      const negativePrompt = s.comfyFixedNegative || '';

      // 6. 动态生成局部重绘工作流
      const workflow = buildComfyInpaintWorkflow({
        checkpoint: ckpt,
        positivePrompt: fullPositivePrompt,
        negativePrompt: negativePrompt,
        uploadedImage: uploadedImageName,
        uploadedMask: uploadedMaskName,
        targetWidth: targetWidth,
        targetHeight: targetHeight,
        denoise: denoise,
        growMaskBy: growMaskBy,
        steps: s.comfySteps || 20,
        cfg: s.comfyCfg || 7.0,
        sampler: s.comfySampler || 'euler',
        scheduler: s.comfyScheduler || 'normal',
        activeLoras: activeLoras,
        seed: Math.floor(Math.random() * 1000000000)
      });

      const clientId = 'st_inpaint_' + Math.random().toString(36).slice(2, 10);

      // 7. WebSocket 进度追踪
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
              renderLoadingCard(container, inpaintPrompt, `🎨 局部重绘渲染进度: ${value}/${max} 步 (${percent}%)`, taskKey);
            }
          } catch (_) {}
        };
      } catch (_) {}

      // 8. 提交任务至 /prompt
      const promptRes = await fetch(`${comfyHost}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: clientId })
      });

      if (!promptRes.ok) {
        throw new Error(`ComfyUI 提交失败 HTTP ${promptRes.status}: ${promptRes.statusText}`);
      }

      const promptData = await promptRes.json();
      const promptId = promptData.prompt_id;
      if (!promptId) throw new Error('未获取到局部重绘任务 ID');

      // 9. 轮询结果
      let pollCount = 0;
      const maxPolls = 180;
      const pollInterval = setInterval(async () => {
        pollCount++;
        if (pollCount > maxPolls) {
          clearInterval(pollInterval);
          if (ws) ws.close();
          renderErrorCard(container, inpaintPrompt, '局部重绘任务超时', activeLoras, taskKey);
          return;
        }

        try {
          const histRes = await fetch(`${comfyHost}/history/${promptId}`);
          if (!histRes.ok) return;
          const histData = await histRes.json();
          if (histData[promptId]) {
            clearInterval(pollInterval);
            if (ws) ws.close();

            const outputs = histData[promptId].outputs || {};
            const resultImages = [];
            Object.values(outputs).forEach((out) => {
              if (out.images && Array.isArray(out.images)) {
                out.images.forEach((img) => {
                  const url = `${comfyHost}/view?filename=${encodeURIComponent(img.filename)}&type=${encodeURIComponent(img.type || 'output')}${img.subfolder ? '&subfolder=' + encodeURIComponent(img.subfolder) : ''}`;
                  resultImages.push(url);
                });
              }
            });

            if (resultImages.length > 0) {
              const state = cardStateMap.get(cardId);
              let allImages = resultImages;
              if (state && state.images) {
                state.images.push(...resultImages);
                state.currentIdx = state.images.length - 1; // 自动跳到新生成的重绘图
                allImages = state.images;
                renderCarouselCard(container, state.images, inpaintPrompt, activeLoras);
              } else {
                renderCarouselCard(container, resultImages, inpaintPrompt, activeLoras);
              }

              // 保存重绘结果到持久化存储与酒馆消息 extra，确保刷新浏览器不丢失且不重复调用
              const tk = container?.dataset?.sctTaskKey || taskKey;
              const mesId = container?.dataset?.sctMesId || container?.closest('.mes')?.getAttribute('mesid');
              const slotIdx = container?.dataset?.sctSlotIdx || '0';
              if (tk) {
                sctDrawingTasks.set(tk, { status: 'completed', images: allImages, prompt: inpaintPrompt, activeLoras: activeLoras });
                savePersistentTask(tk, { status: 'completed', images: allImages, prompt: inpaintPrompt, activeLoras: activeLoras });
              }
              if (mesId !== undefined && mesId !== null) {
                saveChatMessageExtraImages(mesId, slotIdx, allImages, inpaintPrompt, activeLoras);
              }

              showToast('✨ 局部重绘成功！已加入轮播展示', 'success');
            } else {
              renderErrorCard(container, inpaintPrompt, 'ComfyUI 未返回重绘图像输出', activeLoras, taskKey);
            }
          }
        } catch (_) {}
      }, 1000);

    } catch (err) {
      renderErrorCard(container, inpaintPrompt, `局部重绘失败: ${err.message}`, activeLoras, taskKey);
    }
  }

  // 中止并清空 ComfyUI 排队任务
  async function clearComfyQueue() {
    const comfyHost = getCleanComfyHost();
    try {
      await fetch(`${comfyHost}/interrupt`, { method: 'POST' }).catch(() => {});
      await fetch(`${comfyHost}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true })
      }).catch(() => {});

      // 将当前所有运行中的生图标记为已中止
      sctDrawingTasks.forEach((val) => {
        if (val && val.status === 'running') {
          val.status = 'error';
          val.error = '生图任务已被手动中止并已清空后台排队';
        }
      });

      // 更新界面中所有正在加载的卡片
      document.querySelectorAll('.sct-comfy-card-container').forEach((c) => {
        const tk = c.dataset.sctTaskKey;
        const prompt = c.dataset.sctPrompt || '';
        if (tk && sctDrawingTasks.get(tk)?.status === 'error') {
          renderErrorCard(c, prompt, '生图已被手动中止并已清空后台排队', [], tk);
        }
      });

      showToast('已向 ComfyUI 发送中止信号并清空排队任务！', 'info');
    } catch (e) {
      showToast(`清空队列异常: ${e.message}`, 'error');
    }
  }

  function renderLoadingCard(container, promptText, progressText = '🎨 ComfyUI 正在后台生成画面…', taskKey = null) {
    if (!container) return;
    const existingTextEl = container.querySelector('.sct-loading-text');
    if (existingTextEl) {
      existingTextEl.textContent = progressText;
      return;
    }

    container.innerHTML = `
      <div class="sct-comfy-card">
        <div class="sct-comfy-loading">
          <div class="sct-spinner"></div>
          <div class="sct-loading-text">${escapeHtml(progressText)}</div>
          <div class="sct-loading-hint">提示词: ${escapeHtml(promptText.slice(0, 50))}...</div>
          <div style="margin-top: 8px;">
            <button type="button" class="sct-cancel-draw-btn" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 11px; padding: 4px 12px; border-radius: 6px; cursor: pointer;">🛑 中止此次生图并清空排队</button>
          </div>
        </div>
      </div>
    `;
    const cancelBtn = container.querySelector('.sct-cancel-draw-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await clearComfyQueue();
        if (taskKey) sctDrawingTasks.delete(taskKey);
        renderErrorCard(container, promptText, '用户主动中止了生图任务', [], taskKey);
      });
    }
  }

  function renderErrorCard(container, promptText, err, activeLoras = [], taskKey = null) {
    container.innerHTML = `
      <div class="sct-comfy-card">
        <div class="sct-comfy-error">
          <div class="sct-comfy-error-header">
            <span>⚠️</span>
            <span>ComfyUI 生图失败</span>
          </div>
          <div style="opacity: 0.8; font-size: 12px; margin-bottom: 8px;">${escapeHtml(err || '未能连接到 ComfyUI 服务')}</div>
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button type="button" class="sct-comfy-btn sct-error-retry">🔄 重新尝试</button>
            <button type="button" class="sct-comfy-btn sct-error-clear" style="background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.35); color: #fca5a5;">🛑 清空后台排队</button>
          </div>
        </div>
      </div>
    `;
    container.querySelector('.sct-error-retry')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const mesId = container.dataset.sctMesId || container.closest('.mes')?.getAttribute('mesid');
      const slotIdx = container.dataset.sctSlotIdx || '0';
      if (taskKey) {
        sctDrawingTasks.delete(taskKey);
        removePersistentTask(taskKey);
      }
      if (mesId !== undefined && mesId !== null) {
        removeChatMessageExtraImages(mesId, slotIdx);
      }
      triggerComfyDraw(promptText, container, activeLoras, taskKey);
    });
    container.querySelector('.sct-error-clear')?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await clearComfyQueue();
    });
  }

  // 动态解析处于实时 DOM 树中的活跃卡片容器 (防止酒馆在流式结束时重写 Markdown 导致旧 DOM 脱节)
  function getActiveCardContainer(taskKey, fallbackEl) {
    if (taskKey) {
      const live = document.querySelector(`.sct-comfy-card-container[data-sct-task-key="${taskKey}"]`);
      if (live && live.isConnected) return live;
    }
    if (fallbackEl && fallbackEl.isConnected) return fallbackEl;
    return fallbackEl;
  }

  // 触发 ComfyUI 生图任务 (带唯一 taskKey 去重锁与活跃 DOM 动态绑定)
  async function triggerComfyDraw(promptText, container, explicitActiveLoras = null, taskKey = null) {
    const s = getSettings();
    if (!s.comfyEnabled) {
      showToast('ComfyUI 绘图功能未开启', 'warning');
      return;
    }

    if (taskKey) {
      container.dataset.sctTaskKey = taskKey;
      sctDrawingTasks.set(taskKey, { status: 'running', images: [], prompt: promptText, container: container });
    }

    renderLoadingCard(container, promptText, '🎨 正在构建工作流并连接 ComfyUI…', taskKey);

    const comfyHost = getCleanComfyHost();
    const batch = Math.min(3, Math.max(1, s.comfyBatchCount || 1));
    const width = s.comfyWidth || 512;
    const height = s.comfyHeight || 768;
    const steps = s.comfySteps || 20;
    const cfg = s.comfyCfg || 7.0;
    const sampler = s.comfySampler || 'euler';
    const scheduler = s.comfyScheduler || 'normal';
    const seed = Math.floor(Math.random() * 1000000000);

    // 确定启用的 LoRA 列表与特征词注入 (支持最多 3 个链式加载)
    const activeLoras = (explicitActiveLoras ? explicitActiveLoras.slice(0, 3) : detectActiveLoras(container.closest('.mes')?.querySelector('.mes_text')?.textContent || '', promptText));
    
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
              const txt = `🎨 正在采样渲染: ${value}/${max} 步 (${percent}%)`;
              if (taskKey) {
                const cur = sctDrawingTasks.get(taskKey);
                if (cur) cur.lastProgressText = txt;
              }
              const target = getActiveCardContainer(taskKey, container);
              renderLoadingCard(target, promptText, txt, taskKey);
            } else if (msg.type === 'executing') {
              const node = msg.data.node;
              let txt = null;
              if (node === '3') txt = `🎨 执行基础 KSampler 采样…`;
              else if (node === '201') txt = `🔍 执行高清放大重绘采样…`;
              else if (node === '8') txt = `🎨 执行 VAE 解码输出…`;
              if (txt) {
                if (taskKey) {
                  const cur = sctDrawingTasks.get(taskKey);
                  if (cur) cur.lastProgressText = txt;
                }
                const target = getActiveCardContainer(taskKey, container);
                renderLoadingCard(target, promptText, txt, taskKey);
              }
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
          if (taskKey) {
            sctDrawingTasks.set(taskKey, { status: 'error', error: '生图等待超时', prompt: promptText });
          }
          const target = getActiveCardContainer(taskKey, container);
          renderErrorCard(target, promptText, '生图等待超时（超过 240 秒）', activeLoras, taskKey);
          return;
        }

        try {
          const hRes = await fetch(`${comfyHost}/history/${promptId}`);
          if (!hRes.ok) return;
          const hData = await hRes.json();
          const task = hData[promptId];

          // 核心拦截 1：ComfyUI 执行报错立刻退出并展示详细错误，绝不死等超时卡死！
          if (task && task.status && task.status.status_str === 'error') {
            clearInterval(pollTimer);
            if (ws) ws.close();
            const errMsg = task.status.messages?.find(m => m[0] === 'execution_error')?.[1]?.exception_message || 'ComfyUI 采样执行报错，请检查控制台';
            if (taskKey) {
              sctDrawingTasks.set(taskKey, { status: 'error', error: errMsg, prompt: promptText });
            }
            const target = getActiveCardContainer(taskKey, container);
            renderErrorCard(target, promptText, errMsg, activeLoras, taskKey);
            return;
          }

          // 核心拦截 2：多输出插槽兼容查找生成的图像
          let foundImages = null;
          if (task && task.outputs) {
            if (task.outputs['9'] && task.outputs['9'].images && task.outputs['9'].images.length > 0) {
              foundImages = task.outputs['9'].images;
            } else {
              for (const k of Object.keys(task.outputs)) {
                if (task.outputs[k]?.images && task.outputs[k].images.length > 0) {
                  foundImages = task.outputs[k].images;
                  break;
                }
              }
            }
          }

          if (foundImages && foundImages.length > 0) {
            clearInterval(pollTimer);
            if (ws) ws.close();

            const images = foundImages.map((img) => 
              `${comfyHost}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`
            );

            if (taskKey) {
              sctDrawingTasks.set(taskKey, { status: 'completed', images: images, prompt: promptText, activeLoras: activeLoras });
              savePersistentTask(taskKey, { status: 'completed', images: images, prompt: promptText, activeLoras: activeLoras });
              const mesId = container.dataset.sctMesId || container.closest('.mes')?.getAttribute('mesid');
              const slotIdx = container.dataset.sctSlotIdx || '0';
              if (mesId !== undefined && mesId !== null) {
                saveChatMessageExtraImages(mesId, slotIdx, images, promptText, activeLoras);
              }
            }

            const target = getActiveCardContainer(taskKey, container);
            renderCarouselCard(target, images, promptText, activeLoras);
            showToast(`ComfyUI 绘图成功！${activeLoras.length > 0 ? `(已加载 ${activeLoras.length} 个 LoRA)` : ''}`, 'success');
          }
        } catch (_) {}
      }, 1500);

    } catch (e) {
      if (taskKey) {
        sctDrawingTasks.set(taskKey, { status: 'error', error: e.message, prompt: promptText });
      }
      const target = getActiveCardContainer(taskKey, container);
      renderErrorCard(target, promptText, e.message, activeLoras, taskKey);
    }
  }

  /* ==========================================================================
     7. 消息 DOM 扫描与自动化处理 (Message Scanning & Tag Processing)
     ========================================================================== */

  // 判断 SillyTavern 是否正处于流式生成 / 打字中
  function isSTGenerating() {
    if (typeof is_send_press !== 'undefined' && is_send_press) return true;
    const stopBtn = document.getElementById('stop_button');
    if (stopBtn && (stopBtn.style.display !== 'none' && stopBtn.offsetParent !== null)) {
      return true;
    }
    const typing = document.querySelector('#chat .typing_indicator, .mes.streaming, .mes[is_streaming="true"]');
    if (typing) return true;
    return false;
  }

  function processSingleMessage(mesEl) {
    if (!mesEl) return;

    // 核心防抖与防重复检查 1：如果此消息正在 AI 打字机流式生成中，绝不提前触发生图！
    // 避免 AI 打字机每输出一个 Token / 字符就触发一次生图导致无限生成十几张图！
    const isStreaming = mesEl.classList.contains('streaming') ||
                        mesEl.querySelector('.streaming') ||
                        (typeof is_send_press !== 'undefined' && is_send_press) ||
                        mesEl.getAttribute('is_streaming') === 'true' ||
                        mesEl.querySelector('.typing_indicator') ||
                        (isSTGenerating() && (mesEl === document.querySelector('#chat .mes:last-child') || !mesEl.getAttribute('mesid')));
    if (isStreaming) {
      return;
    }

    const s = getSettings();
    const textEl = mesEl.querySelector('.mes_text');
    if (!textEl) return;

    // 消息唯一标识：优先获取酒馆的 mesid，没有则按其在父容器中的索引兜底
    const mesId = mesEl.getAttribute('mesid') || mesEl.dataset.sctMesId || (() => {
      const idx = Array.from(mesEl.parentElement?.children || []).indexOf(mesEl);
      const genId = `mes_idx_${idx}`;
      mesEl.dataset.sctMesId = genId;
      return genId;
    })();

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
        // 第一阶段：将所有匹配的标签一次性替换为精准插槽标记
        let replacedHtml = textEl.innerHTML;
        promptsToDraw.forEach((item, idx) => {
          const slotToken = `<div class="sct-comfy-slot" data-sct-mes="${mesId}" data-sct-idx="${idx}"></div>`;
          const rawIdx = replacedHtml.indexOf(item.raw);
          if (rawIdx !== -1) {
            replacedHtml = replacedHtml.slice(0, rawIdx) + slotToken + replacedHtml.slice(rawIdx + item.raw.length);
          } else {
            replacedHtml = replacedHtml.replace(item.raw, slotToken);
          }
        });
        textEl.innerHTML = replacedHtml;

        // 第二阶段：在已更新的 DOM 中查找插槽并挂载卡片容器与启动生图
        promptsToDraw.forEach((item, idx) => {
          const taskKey = getTaskKey(mesId, idx, item.prompt);
          const existingTask = sctDrawingTasks.get(taskKey);
          const activeLoras = detectActiveLoras(textEl.textContent || '', item.prompt);

          // 核心拦截 0：检查 DOM 树中是否已经存在该 taskKey 的卡片容器，若有则直接复用
          const existingInDom = textEl.querySelector(`.sct-comfy-card-container[data-sct-task-key="${taskKey}"]`);
          if (existingInDom) {
            if (existingTask && existingTask.status === 'running') {
              existingTask.container = existingInDom;
              renderLoadingCard(existingInDom, item.prompt, existingTask.lastProgressText || '🎨 ComfyUI 正在后台生成画面中…', taskKey);
            } else if (existingTask && existingTask.status === 'completed' && existingTask.images && existingTask.images.length > 0) {
              renderCarouselCard(existingInDom, existingTask.images, item.prompt, existingTask.activeLoras || activeLoras);
            }
            return;
          }

          const cardContainer = document.createElement('div');
          cardContainer.className = 'sct-comfy-card-container';
          cardContainer.dataset.sctPrompt = item.prompt;
          cardContainer.dataset.sctTaskKey = taskKey;
          cardContainer.dataset.sctMesId = String(mesId);
          cardContainer.dataset.sctSlotIdx = String(idx);
          cardContainer.setAttribute('aria-hidden', 'true');
          cardContainer.setAttribute('translate', 'no');

          // 核心事件隔离：阻断卡片内所有交互事件向外层消息容器冒泡，彻底避免触发酒馆朗读消息或意外划选
          ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evt => {
            cardContainer.addEventListener(evt, (e) => {
              e.stopPropagation();
            }, { passive: evt.startsWith('touch') });
          });

          const slot = textEl.querySelector(`.sct-comfy-slot[data-sct-mes="${mesId}"][data-sct-idx="${idx}"]`);
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

          // 核心防重复与持久化还原拦截：
          // 1. 优先从内存已完成任务或本地存储中还原
          if (existingTask && existingTask.status === 'completed' && existingTask.images && existingTask.images.length > 0) {
            renderCarouselCard(cardContainer, existingTask.images, item.prompt, existingTask.activeLoras || activeLoras);
            return;
          }

          const cached = findCachedTask(taskKey, mesId, idx, item.prompt);
          if (cached && cached.images && cached.images.length > 0) {
            renderCarouselCard(cardContainer, cached.images, item.prompt, cached.activeLoras || activeLoras);
            return;
          }

          // 2. 检查内存中是否正在运行中
          if (existingTask && existingTask.status === 'running') {
            // 实时将新挂载的 cardContainer 绑定给后台任务！
            existingTask.container = cardContainer;
            renderLoadingCard(cardContainer, item.prompt, existingTask.lastProgressText || '🎨 ComfyUI 正在后台生成画面中…', taskKey);
            return;
          }

          // 3. 核心冷启动/历史消息防刷保护：
          // 严禁在浏览器刷新/初始载入历史消息 (isInitialLoad) 或正在切换角色聊天 (isChatSwitching) 时自动狂刷所有历史消息！
          // 仅允许在当前会话中实时接收到的新消息 (newlyReceivedMesIds) 且开启了 comfyAutoDrawTags 时自动开跑。
          const isNewlyReceived = newlyReceivedMesIds.has(String(mesId));
          const isLastMessage = mesEl === document.querySelector('#chat .mes:last-child') || 
                                mesEl.matches('#chat .mes:nth-last-child(-n+2)');
          const allowAutoDraw = s.comfyAutoDrawTags && 
                                !isInitialLoad && 
                                !isChatSwitching && 
                                (isNewlyReceived || isLastMessage);

          if (allowAutoDraw) {
            // 记录任务状态为 running
            sctDrawingTasks.set(taskKey, { status: 'running', images: [], container: cardContainer, prompt: item.prompt });
            triggerComfyDraw(item.prompt, cardContainer, activeLoras, taskKey);
          } else {
            // 对于历史消息（未曾生图或页面刷新后）或者关闭了自动生图的情况，仅渲染引导卡片与【立即开始生图】按钮，绝不自作主张发起网络请求！
            cardContainer.innerHTML = `
              <div class="sct-comfy-card" style="padding: 12px; text-align: center;">
                <span style="font-size: 13px; color: #c084fc;">🎨 检测到绘画提示词: <i>${escapeHtml(item.prompt.slice(0, 35))}...</i></span>
                <div style="margin-top: 8px;">
                  <button type="button" class="sct-comfy-btn sct-start-draw">立即开始生图</button>
                </div>
              </div>
            `;
            cardContainer.querySelector('.sct-start-draw').addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              triggerComfyDraw(item.prompt, cardContainer, activeLoras, taskKey);
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
          const cleanText = getCleanMessageText(textEl);
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
              container.setAttribute('aria-hidden', 'true');
              container.setAttribute('translate', 'no');
              ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evt => {
                container.addEventListener(evt, (e) => {
                  e.stopPropagation();
                }, { passive: evt.startsWith('touch') });
              });
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

  // 从消息 DOM 容器中提取纯净正文（克隆节点并彻底移除生图卡片、操作按钮、提示标签等所有扩展注入元素）
  function getCleanMessageText(textEl) {
    if (!textEl) return '';
    try {
      const clone = textEl.cloneNode(true);
      clone.querySelectorAll(`
        .sct-comfy-card-container,
        .sct-comfy-card,
        .sct-comfy-slot,
        .sct-mes-action-btn,
        .sct-floating-tts,
        .sct-tts-status-badge,
        .sct-tts-pill-btn,
        .sct-inpaint-overlay,
        .sct-inpaint-dialog,
        .sct-inpaint-btn
      `).forEach((el) => el.remove());
      return cleanTextForTts(clone.textContent || '');
    } catch (_) {
      return cleanTextForTts(textEl.textContent || '');
    }
  }

  function cleanTextForTts(rawText) {
    if (!rawText) return '';
    let text = rawText;
    const s = getSettings();
    if (s.ttsFilterThinking) {
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
      text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
    }
    // 过滤生图标签 (闭合与未闭合)
    text = text.replace(/<image>[\s\S]*?<\/image>/gi, '');
    text = text.replace(/&lt;image&gt;[\s\S]*?&lt;\/image&gt;/gi, '');
    text = text.replace(/<image>[\s\S]*?$/gi, '');
    text = text.replace(/<img_prompt>[\s\S]*?<\/img_prompt>/gi, '');
    text = text.replace(/&lt;img_prompt&gt;[\s\S]*?&lt;\/img_prompt&gt;/gi, '');
    text = text.replace(/image###[\s\S]*?###/gi, '');
    text = text.replace(/image###[\s\S]*?$/gi, '');
    text = text.replace(/###[\s\S]*?###/gi, '');

    // 彻底剥离 ComfyUI 轮播卡片与操作按钮残留文本 (杜绝在朗读时念出卡片上的操作标签与 LoRA 名字)
    text = text.replace(/🎨?\s*ComfyUI\s*(生图|绘图)?/gi, '');
    text = text.replace(/LoRA:\s*[^,\n\r，。！\s]+([,\n\r，。！\s]|$)/gi, '');
    text = text.replace(/点击图片放大查看/g, '');
    text = text.replace(/[🔄◀▶\s]*重新生成/g, '');
    text = text.replace(/[◀▶\s]*上一张/g, '');
    text = text.replace(/[◀▶\s]*下一张/g, '');
    text = text.replace(/[🖌️\s]*局部重绘/g, '');
    text = text.replace(/长按重绘[·\s]*点击放大/g, '');
    text = text.replace(/检测到绘画提示词[:：]?[\s\S]*?立即开始生图/gi, '');
    text = text.replace(/立即开始生图/g, '');
    text = text.replace(/ComfyUI\s*正在后台生成画面中[….]*/gi, '');
    text = text.replace(/生图失败/g, '');
    text = text.replace(/🛑?\s*中止此次生图并清空排队/g, '');
    text = text.replace(/🛑?\s*清空后台排队/g, '');
    text = text.replace(/\b\d+\s*\/\s*\d+\b/g, '');

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

    // 引擎分支 1：小米 MiMo 在线 TTS (原厂高品质拟真人声)
    if (s.ttsEngine === 'xiaomi') {
      try {
        const apiKey = (s.ttsXiaomiKey || '').trim();
        if (!apiKey) {
          showToast('请先在插件设置中填写小米 MiMo API Key', 'warning');
          setTtsPlayingState(false);
          return;
        }

        const endpoint = (s.ttsXiaomiEndpoint || 'https://api.xiaomimimo.com/v1/chat/completions').trim();
        const model = s.ttsXiaomiModel || 'mimo-v2.5-tts';

        let requestBody = {
          model: model,
          messages: []
        };

        if (model === 'mimo-v2.5-tts-voicedesign') {
          const prompt = (s.ttsXiaomiVoiceDesignPrompt || '年轻活泼的女性声音，亲切自然，语调轻快').trim();
          requestBody.messages = [
            { role: 'user', content: prompt },
            { role: 'assistant', content: text }
          ];
          requestBody.audio = { format: 'mp3' };
        } else if (model === 'mimo-v2.5-tts-voiceclone') {
          let sample = (s.ttsXiaomiCloneSample || '').trim();
          if (!sample) {
            throw new Error('语音克隆模式需要填写参考音频 Base64 数据');
          }
          if (!sample.startsWith('data:audio/')) {
            sample = 'data:audio/wav;base64,' + sample;
          }
          requestBody.messages = [
            { role: 'assistant', content: text }
          ];
          requestBody.audio = {
            voice: sample,
            format: 'mp3'
          };
        } else {
          // mimo-v2.5-tts 内置音色
          let speakContent = text;
          if (s.ttsXiaomiSinging && !speakContent.startsWith('(唱歌)') && !speakContent.startsWith('(sing)')) {
            speakContent = '(唱歌)' + speakContent;
          }
          requestBody.messages = [
            { role: 'assistant', content: speakContent }
          ];
          requestBody.audio = {
            voice: s.ttsXiaomiVoice || '冰糖',
            format: 'mp3'
          };
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'api-key': apiKey,
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${errBody || res.statusText}`);
        }

        const data = await res.json();
        const audioBase64 = data?.choices?.[0]?.message?.audio?.data;
        if (!audioBase64) {
          throw new Error('小米 TTS 返回无音频数据 (choices[0].message.audio.data 为空)');
        }

        const audioUrl = `data:audio/mp3;base64,${audioBase64}`;
        const audio = new Audio(audioUrl);
        currentAudio = audio;
        audio.volume = Math.min(1.0, Math.max(0, s.ttsVolume || 1.0));

        audio.onended = () => {
          currentAudio = null;
          setTtsPlayingState(false);
        };
        audio.onerror = () => {
          currentAudio = null;
          setTtsPlayingState(false);
          showToast('小米 TTS 音频播放失败', 'error');
        };

        await audio.play();
        return;
      } catch (err) {
        showToast(`小米 TTS 失败 (${err.message})，转为浏览器原生朗读`, 'warning');
      }
    }

    // 引擎分支 2：OpenAI 兼容协议
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
      container.setAttribute('aria-hidden', 'true');
      container.setAttribute('translate', 'no');
      ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evt => {
        container.addEventListener(evt, (e) => {
          e.stopPropagation();
        }, { passive: evt.startsWith('touch') });
      });
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
            <textarea class="text_pole sct-textarea-autowrap sct-lora-keywords" data-idx="${idx}" rows="2" placeholder="多个关键词用逗号隔开，如: 柚木凪, nagi, 银发">${escapeHtml(item.keywords || '')}</textarea>
          </div>

          <div class="sct-setting-col">
            <label>角色特征激活词 <span style="font-size:11px; opacity:0.6;">(挂载后自动注入正向提示词 · 宽屏多行自动换行)</span></label>
            <textarea class="text_pole sct-textarea-autowrap sct-lora-triggers" data-idx="${idx}" rows="3" placeholder="如: nagi, 1girl, silver hair, purple eyes, school uniform, white ribbon, looking at viewer, gentle smile">${escapeHtml(item.triggerWords || '')}</textarea>
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
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
        </div>
        <div class="inline-drawer-content" style="display: none;">
          
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
              <button type="button" class="sct-comfy-btn" id="sct-btn-clear-queue" style="background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.35); color: #fca5a5;">🛑 中止当前生图并清空排队</button>
            </div>
          </div>

          <!-- 板块 2: 多 LoRA 配置与关键词智能激活 -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>🎭</span>
              <span>角色 LoRA 管理与关键词激活</span>
            </div>
            <div class="sct-hint">表面仅展示角色关键词，点击任意条目即可展开详细配置（模型、权重与特征词）。正文出现关键词时自动挂载 LoRA 并注入特征词（为保证出图画质与避免模型冲突，最多同时激活 2 个角色 LoRA）。</div>

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
              <div style="margin-top:4px; display:flex; gap:6px;">
                <button type="button" class="sct-comfy-btn" id="sct-btn-copy-inst">📋 复制自动配图提示词</button>
                <button type="button" class="sct-comfy-btn" id="sct-btn-reset-inst" style="opacity:0.85;">🔄 恢复最新默认规范</button>
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
              <label>选择 TTS 语音引擎</label>
              <div class="sct-chip-group sct-engine-chips" style="margin-bottom:8px;">
                <button type="button" class="sct-chip-btn sct-engine-btn ${s.ttsEngine === 'xiaomi' ? 'active' : ''}" data-engine="xiaomi">🔴 小米 MiMo 在线 TTS (原厂拟真人声 · 推荐)</button>
                <button type="button" class="sct-chip-btn sct-engine-btn ${s.ttsEngine === 'webspeech' ? 'active' : ''}" data-engine="webspeech">🌐 浏览器原生 Web Speech (免配置)</button>
                <button type="button" class="sct-chip-btn sct-engine-btn ${s.ttsEngine === 'openai' ? 'active' : ''}" data-engine="openai">🔌 OpenAI 兼容音频服务</button>
              </div>
            </div>

            <!-- 小米 MiMo 在线 TTS 设置面板 -->
            <div id="sct-wrap-xiaomi" style="${s.ttsEngine === 'xiaomi' ? '' : 'display:none;'}" class="sct-engine-box">
              <div class="sct-engine-box-header">
                <span>🔴 小米 MiMo 在线 TTS 授权与音色设置</span>
              </div>

              <div class="sct-setting-col" style="margin-bottom: 10px;">
                <label for="sct-cfg-xiaomi-key">小米 MiMo API Key <span style="color:#ef4444; font-weight:bold;">* (必填)</span></label>
                <div style="display:flex; gap:6px;">
                  <input type="password" id="sct-cfg-xiaomi-key" class="text_pole" placeholder="在此填入小米开放平台 API Key (sk-...)" value="${escapeHtml(s.ttsXiaomiKey || '')}" style="flex:1;" />
                  <button type="button" class="sct-comfy-btn" id="sct-toggle-key-vis" style="padding:4px 10px; font-size:11px;">👁️ 显示/隐藏</button>
                </div>
                <div style="font-size:11px; opacity:0.6; margin-top:2px;">前往小米开放平台 (api.xiaomimimo.com) 获取 API Key 即可直连调用。</div>
              </div>

              <div class="sct-setting-col" style="margin-bottom: 10px;">
                <label for="sct-cfg-xiaomi-model">模型类型 (Model)</label>
                <select id="sct-cfg-xiaomi-model" class="text_pole">
                  <option value="mimo-v2.5-tts" ${s.ttsXiaomiModel === 'mimo-v2.5-tts' ? 'selected' : ''}>mimo-v2.5-tts (预设音色 · 支持唱歌模式 · 推荐)</option>
                  <option value="mimo-v2.5-tts-voicedesign" ${s.ttsXiaomiModel === 'mimo-v2.5-tts-voicedesign' ? 'selected' : ''}>mimo-v2.5-tts-voicedesign (语音设计 · 自定义音色描述)</option>
                  <option value="mimo-v2.5-tts-voiceclone" ${s.ttsXiaomiModel === 'mimo-v2.5-tts-voiceclone' ? 'selected' : ''}>mimo-v2.5-tts-voiceclone (语音克隆 · 参考音频复刻)</option>
                </select>
              </div>

              <!-- 内置音色选择与唱歌模式 -->
              <div id="sct-wrap-xiaomi-builtin" style="${(!s.ttsXiaomiModel || s.ttsXiaomiModel === 'mimo-v2.5-tts') ? '' : 'display:none;'}">
                <div class="sct-setting-col" style="margin-bottom: 10px;">
                  <label>预设角色音色 (Voice - 点击选择)</label>
                  <div class="sct-chip-group sct-voice-chips" style="margin-bottom:6px;">
                    <button type="button" class="sct-chip-btn sct-v-chip ${s.ttsXiaomiVoice === '冰糖' ? 'active' : ''}" data-v="冰糖">🍬 冰糖 (甜美清新女声 · 推荐)</button>
                    <button type="button" class="sct-chip-btn sct-v-chip ${s.ttsXiaomiVoice === '茉莉' ? 'active' : ''}" data-v="茉莉">🌸 茉莉 (知性温婉女声)</button>
                    <button type="button" class="sct-chip-btn sct-v-chip ${s.ttsXiaomiVoice === 'Mia' ? 'active' : ''}" data-v="Mia">✨ Mia (活泼灵动女声)</button>
                    <button type="button" class="sct-chip-btn sct-v-chip ${s.ttsXiaomiVoice === 'Chloe' ? 'active' : ''}" data-v="Chloe">👠 Chloe (沉稳干练女声)</button>
                    <button type="button" class="sct-chip-btn sct-v-chip ${s.ttsXiaomiVoice === 'Milo' ? 'active' : ''}" data-v="Milo">☀️ Milo (阳光活力男声)</button>
                    <button type="button" class="sct-chip-btn sct-v-chip ${s.ttsXiaomiVoice === 'Dean' ? 'active' : ''}" data-v="Dean">🎙️ Dean (成熟磁性男声)</button>
                  </div>
                  <div style="display:flex; gap:6px;">
                    <input type="text" id="sct-cfg-xiaomi-voice-custom" class="text_pole" placeholder="或输入自定义音色名" value="${escapeHtml(s.ttsXiaomiVoice || '冰糖')}" style="flex:1;" />
                  </div>
                </div>

                <div class="sct-setting-row" style="margin-bottom: 10px;">
                  <label for="sct-cfg-xiaomi-singing">开启唱歌模式 (自动为朗读注入旋律)</label>
                  <input type="checkbox" id="sct-cfg-xiaomi-singing" ${s.ttsXiaomiSinging ? 'checked' : ''} />
                </div>
              </div>

              <!-- 语音设计 -->
              <div id="sct-wrap-xiaomi-design" style="${s.ttsXiaomiModel === 'mimo-v2.5-tts-voicedesign' ? '' : 'display:none;'}">
                <div class="sct-setting-col" style="margin-bottom: 10px;">
                  <label for="sct-cfg-xiaomi-prompt">语音设计音色描述 (Prompt)</label>
                  <textarea id="sct-cfg-xiaomi-prompt" class="text_pole sct-textarea-autowrap" rows="2" placeholder="例如：年轻活泼的女性声音，亲切自然，语调轻快">${escapeHtml(s.ttsXiaomiVoiceDesignPrompt || '年轻活泼的女性声音，亲切自然，语调轻快')}</textarea>
                </div>
              </div>

              <!-- 语音克隆 -->
              <div id="sct-wrap-xiaomi-clone" style="${s.ttsXiaomiModel === 'mimo-v2.5-tts-voiceclone' ? '' : 'display:none;'}">
                <div class="sct-setting-col" style="margin-bottom: 10px;">
                  <label for="sct-cfg-xiaomi-clone">克隆参考音频 (Base64 或 data:audio/wav;base64,...)</label>
                  <textarea id="sct-cfg-xiaomi-clone" class="text_pole sct-textarea-autowrap" rows="2" placeholder="粘贴音频 Base64 数据">${escapeHtml(s.ttsXiaomiCloneSample || '')}</textarea>
                </div>
              </div>

              <div class="sct-setting-col" style="margin-bottom: 10px;">
                <label for="sct-cfg-xiaomi-ep">小米 API 端点 (Endpoint)</label>
                <input type="text" id="sct-cfg-xiaomi-ep" class="text_pole" placeholder="https://api.xiaomimimo.com/v1/chat/completions" value="${escapeHtml(s.ttsXiaomiEndpoint || 'https://api.xiaomimimo.com/v1/chat/completions')}" />
              </div>
            </div>

            <!-- 原生 Web Speech 设置 -->
            <div class="sct-setting-col" id="sct-wrap-voice-ws" style="${s.ttsEngine === 'webspeech' ? '' : 'display:none;'}">
              <label for="sct-cfg-voice">发音人音色 (Voice)</label>
              <select id="sct-cfg-voice" class="text_pole">
                <option value="">加载中…</option>
              </select>
            </div>

            <!-- OpenAI 兼容音频服务设置 -->
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

    // 折叠展开管理：
    // SillyTavern 原生框架会在 document 上统一代理监听 .inline-drawer-toggle 并执行 slideToggle 与 class down 切换。
    // 为避免与酒馆原生双重触发冲突，有 jQuery 时交由宿主托管；若在单体测试或极简无 jQuery 环境则进行轻量兜底。
    if (typeof jQuery === 'undefined' || !jQuery) {
      const drawerToggle = container.querySelector('.inline-drawer-toggle');
      const drawerContent = container.querySelector('.inline-drawer-content');
      const drawerIcon = container.querySelector('.inline-drawer-icon');
      if (drawerToggle && drawerContent) {
        drawerToggle.addEventListener('click', () => {
          const isHidden = drawerContent.style.display === 'none' || getComputedStyle(drawerContent).display === 'none';
          drawerContent.style.display = isHidden ? 'block' : 'none';
          if (drawerIcon) {
            drawerIcon.classList.toggle('down', isHidden);
          }
        });
      }
    }

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
    container.querySelectorAll('.sct-chip-btn[data-w]').forEach((chip) => {
      chip.addEventListener('click', () => {
        container.querySelectorAll('.sct-chip-btn[data-w]').forEach(c => c.classList.remove('active'));
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

    container.querySelector('#sct-btn-reset-inst')?.addEventListener('click', () => {
      saveSettings({ imageInstructionText: DEFAULT_IMAGE_INSTRUCTION });
      const preview = container.querySelector('#sct-inst-preview');
      if (preview) preview.textContent = DEFAULT_IMAGE_INSTRUCTION;
      showToast('已将自动配图提示词恢复为最新规范！', 'success');
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

    container.querySelector('#sct-btn-clear-queue')?.addEventListener('click', async () => {
      await clearComfyQueue();
    });

    // TTS 绑定
    const voiceSelect = container.querySelector('#sct-cfg-voice');
    populateVoiceList(voiceSelect);
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = () => populateVoiceList(voiceSelect);
    }

    // TTS 引擎切换绑定 (大卡片直选按钮)
    const wrapWs = container.querySelector('#sct-wrap-voice-ws');
    const wrapXiaomi = container.querySelector('#sct-wrap-xiaomi');
    const wrapOai = container.querySelector('#sct-wrap-openai');
    const engineBtns = container.querySelectorAll('.sct-engine-btn');

    engineBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        engineBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const val = btn.dataset.engine;
        saveSettings({ ttsEngine: val });
        if (wrapWs) wrapWs.style.display = val === 'webspeech' ? '' : 'none';
        if (wrapXiaomi) wrapXiaomi.style.display = val === 'xiaomi' ? '' : 'none';
        if (wrapOai) wrapOai.style.display = val === 'openai' ? '' : 'none';
      });
    });

    // 小米 TTS 专属事件绑定
    const xiaomiKeyInput = container.querySelector('#sct-cfg-xiaomi-key');
    if (xiaomiKeyInput) {
      xiaomiKeyInput.addEventListener('input', (e) => saveSettings({ ttsXiaomiKey: e.target.value.trim() }));
    }

    const toggleKeyBtn = container.querySelector('#sct-toggle-key-vis');
    if (toggleKeyBtn && xiaomiKeyInput) {
      toggleKeyBtn.addEventListener('click', () => {
        if (xiaomiKeyInput.type === 'password') {
          xiaomiKeyInput.type = 'text';
          toggleKeyBtn.textContent = '🔒 隐藏';
        } else {
          xiaomiKeyInput.type = 'password';
          toggleKeyBtn.textContent = '👁️ 显示/隐藏';
        }
      });
    }

    const xiaomiEpInput = container.querySelector('#sct-cfg-xiaomi-ep');
    if (xiaomiEpInput) {
      xiaomiEpInput.addEventListener('input', (e) => saveSettings({ ttsXiaomiEndpoint: e.target.value.trim() }));
    }
    
    const mimoModelSelect = container.querySelector('#sct-cfg-xiaomi-model');
    const wrapMimoBuiltin = container.querySelector('#sct-wrap-xiaomi-builtin');
    const wrapMimoDesign = container.querySelector('#sct-wrap-xiaomi-design');
    const wrapMimoClone = container.querySelector('#sct-wrap-xiaomi-clone');
    if (mimoModelSelect) {
      mimoModelSelect.addEventListener('change', (e) => {
        const m = e.target.value;
        saveSettings({ ttsXiaomiModel: m });
        if (wrapMimoBuiltin) wrapMimoBuiltin.style.display = m === 'mimo-v2.5-tts' ? '' : 'none';
        if (wrapMimoDesign) wrapMimoDesign.style.display = m === 'mimo-v2.5-tts-voicedesign' ? '' : 'none';
        if (wrapMimoClone) wrapMimoClone.style.display = m === 'mimo-v2.5-tts-voiceclone' ? '' : 'none';
      });
    }

    // 小米预设音色快捷芯片
    const voiceChips = container.querySelectorAll('.sct-v-chip');
    const mimoVoiceCustom = container.querySelector('#sct-cfg-xiaomi-voice-custom');

    voiceChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        voiceChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const v = chip.dataset.v;
        if (mimoVoiceCustom) mimoVoiceCustom.value = v;
        saveSettings({ ttsXiaomiVoice: v });
      });
    });

    if (mimoVoiceCustom) {
      mimoVoiceCustom.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        voiceChips.forEach(c => {
          c.classList.toggle('active', c.dataset.v === val);
        });
        saveSettings({ ttsXiaomiVoice: val });
      });
    }

    const xiaomiSinging = container.querySelector('#sct-cfg-xiaomi-singing');
    if (xiaomiSinging) {
      xiaomiSinging.addEventListener('change', (e) => saveSettings({ ttsXiaomiSinging: e.target.checked }));
    }

    const xiaomiPrompt = container.querySelector('#sct-cfg-xiaomi-prompt');
    if (xiaomiPrompt) {
      xiaomiPrompt.addEventListener('input', (e) => saveSettings({ ttsXiaomiVoiceDesignPrompt: e.target.value.trim() }));
    }

    const xiaomiClone = container.querySelector('#sct-cfg-xiaomi-clone');
    if (xiaomiClone) {
      xiaomiClone.addEventListener('input', (e) => saveSettings({ ttsXiaomiCloneSample: e.target.value.trim() }));
    }

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
        if (target) {
          const drawerContent = target.querySelector('.inline-drawer-content');
          const drawerIcon = target.querySelector('.inline-drawer-icon');
          if (drawerContent && (drawerContent.style.display === 'none' || getComputedStyle(drawerContent).display === 'none')) {
            jQuery(drawerContent).slideDown(200);
            if (drawerIcon) drawerIcon.classList.add('down');
          }
          target.scrollIntoView({ behavior: 'smooth' });
        }
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
        es.on(et.CHARACTER_MESSAGE_RENDERED, (arg) => {
          if (!isInitialLoad && !isChatSwitching) {
            let id = (typeof arg === 'number' || typeof arg === 'string') ? String(arg) : null;
            if (!id) {
              const lastMes = document.querySelector('#chat .mes:last-child');
              id = lastMes?.getAttribute('mesid') || lastMes?.dataset?.sctMesId;
            }
            if (id) newlyReceivedMesIds.add(String(id));
          }
          setTimeout(scanAllMessages, 100);
        });
      }
      if (et.MESSAGE_RECEIVED) {
        es.on(et.MESSAGE_RECEIVED, (arg) => {
          if (!isInitialLoad && !isChatSwitching) {
            let id = (typeof arg === 'number' || typeof arg === 'string') ? String(arg) : null;
            if (!id) {
              const lastMes = document.querySelector('#chat .mes:last-child');
              id = lastMes?.getAttribute('mesid') || lastMes?.dataset?.sctMesId;
            }
            if (id) newlyReceivedMesIds.add(String(id));
          }
          setTimeout(scanAllMessages, 150);
        });
      }
      if (et.CHAT_CHANGED) {
        es.on(et.CHAT_CHANGED, () => {
          stopTts();
          isChatSwitching = true;
          newlyReceivedMesIds.clear();
          setTimeout(() => {
            isChatSwitching = false;
          }, 2500);
          setTimeout(scanAllMessages, 300);
          updateExtensionPrompt();
        });
      }
      if (et.CHAT_COMPLETION_PROMPT_READY) {
        es.on(et.CHAT_COMPLETION_PROMPT_READY, () => {
          updateExtensionPrompt();
        });
      }
      if (et.GENERATION_AFTER_COMMANDS) {
        es.on(et.GENERATION_AFTER_COMMANDS, () => {
          setTimeout(scanAllMessages, 100);
        });
      }
    }

    let scanDebounceTimer = null;
    function debouncedScanAllMessages(delay = 250) {
      if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
      scanDebounceTimer = setTimeout(() => {
        scanAllMessages();
      }, delay);
    }

    const chatObserver = new MutationObserver((mutations) => {
      // 检查变动是否全是插件自身的卡片、加载状态、TTS 浮条、消息按钮或插槽更新，若是则完全忽略，绝不触发重新扫描
      let hasExternalChange = false;
      for (const m of mutations) {
        const target = m.target;
        if (target && target.closest && target.closest('.sct-comfy-card, .sct-comfy-card-container, .sct-floating-tts, .sct-tts-status-badge, .sct-mes-action-btn, .sct-comfy-slot')) {
          continue;
        }
        let allSctNodes = true;
        if (m.addedNodes && m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (!node.classList?.contains('sct-comfy-card') && 
                  !node.classList?.contains('sct-comfy-card-container') && 
                  !node.classList?.contains('sct-comfy-slot') &&
                  !node.classList?.contains('sct-mes-action-btn')) {
                allSctNodes = false;
                break;
              }
            } else {
              allSctNodes = false;
              break;
            }
          }
        } else {
          allSctNodes = false;
        }
        if (!allSctNodes) {
          hasExternalChange = true;
          break;
        }
      }
      if (hasExternalChange) {
        debouncedScanAllMessages(250);
      }
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

    // 初始加载保护期：在进入页面/刷新页面的前 3.5 秒内，所有历史消息只恢复已生成图像，未生成的仅显示手动触发按钮
    setTimeout(() => {
      isInitialLoad = false;
      console.log(`[${DISPLAY_NAME}] 初始历史消息载入完成，已进入实时会话生图监听模式。`);
    }, 3500);

    console.log(`[${DISPLAY_NAME}] 原生插件就绪！`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
