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
  // 构建标记:界面里显示出来,便于确认「手机跑的是不是最新代码」(缓存问题排查)
  const SCT_BUILD = '1.16.6';

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

    // 脸部修复 (FaceDetailer · 需要 ComfyUI-Impact-Pack + 检测模型)
    // 出图后再单独重采样脸部小区域并贴回原图,是提升人脸质量最有效的一步
    comfyFaceFixEnabled: false,
    comfyFaceFixDetector: 'bbox/face_yolov8m.pt',
    comfyFaceFixDenoise: 0.5,
    comfyFaceFixGuideSize: 512,
    comfyFaceFixBboxThreshold: 0.5,
    comfyFaceFixFeather: 5,

    // 画风参考 (参考图)
    // mode: 'off' 关闭 | 'ipadapter' IP-Adapter(需 ComfyUI_IPAdapter_plus) | 'native' 原生 unCLIP(只需 CLIP Vision)
    comfyStyleRefMode: 'off',
    comfyStyleRefImage: '',            // 兼容保留:等于参考图列表里第一张的文件名
    comfyStyleRefImages: [],           // 参考图列表 [{ id, filename, weight }],最多 4 张,可分别设权重
    comfyStyleRefStrength: 0.8,
    comfyStyleRefStart: 0,
    comfyStyleRefEnd: 1,
    comfyStyleRefPreset: 'PLUS (high strength)',
    comfyStyleRefWeightType: '',       // 空 = 用节点默认(linear);可选 style transfer / composition 等
    comfyStyleRefClipVision: '',

    // AI 辅助配置 (用于「🤖 AI 自动配置 LoRA」:任何 OpenAI 兼容 /v1/chat/completions 接口)
    comfyAiAssistEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    comfyAiAssistKey: '',
    comfyAiAssistModel: 'deepseek-chat',
    comfyAiAssistExtra: '',            // 额外要求(可选):会追加进系统提示词

    // 图片本地保存(手机 IndexedDB):服务器 output 被清理后依然能看,并且能在手机上真删
    comfyLocalCacheEnabled: true,
    comfyLocalCacheMaxMB: 800,         // 本地图库容量上限(MB),超出自动删最旧的

    // LoRA 特征词注入策略
    // true(推荐) = 基础「角色特征激活词」始终注入(放身份锚点:发色/眼睛/尾巴…),再加选中分组的服装词
    // false       = 只注入选中分组的特征词(旧的"完全替换"行为)
    comfyLoraBaseAlwaysInject: true,

    // 是否允许用「消息正文」兜底做 LoRA 激活判定
    // false(默认,推荐) = 只按画面提示词(图片 tag)判定 —— 剧情正文里提到某个名字不会误挂角色 LoRA
    comfyLoraMatchBody: false,

    // 通用角色关键词 (常驻注入)：任意 LoRA 被激活时都会带入这组关键词，仅注入一次且自动去重
    comfyGlobalLoraKeywords: '',
    // 通用排除关键词 (正向提示词黑名单)：最终正向提示词中出现这些词就自动剔除掉
    comfyGlobalExcludeKeywords: '',

    // 多 LoRA 规则库 (Array of LoRA objects)
    // 结构: [{ id, title, name, strengthModel, strengthClip, keywords, triggerWords, enabled, alwaysOn,
    //          variants: [{ id, label, keywords, triggerWords }], activeVariantId, civitaiUrl, civitai, aiNote,
    //          aiHint, aiHintToChat }]
    // title = 中文标题(给人看的角色名), keywords = 英文激活 tag, triggerWords = 注入的角色特征词
    // variants = 激活词分组:同一角色多套激活词(校服/泳装/便服…),出图时选其中一组生效
    // aiHint = 给 AI 的提醒(如「这 LoRA 有 5 个角色,每人 2 套服装」),aiHintToChat = 是否也注入聊天上下文
    comfyLoras: [
      {
        id: 'default_lora_1',
        title: '示例角色(改成中文名)',
        name: '',
        strengthModel: 0.8,
        strengthClip: 0.8,
        keywords: '柚木凪, 凪, nagi, 银发',
        triggerWords: 'nagi, 1girl, solo, silver hair, purple eyes, school uniform',
        variants: [],
        activeVariantId: '',
        civitaiUrl: '',
        aiNote: '',
        aiHint: '',
        aiHintToChat: false,
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
  // 脸部修复相关:可选检测模型列表 + FaceDetailer 节点的必填输入规格(各版本不同,运行时读取)
  let cachedFaceDetectors = [];
  let cachedFaceDetailerSpec = null;
  // 画风参考相关:IPAdapter 预设/模型列表、CLIP Vision 列表,以及各节点的必填输入规格
  let cachedIpAdapterPresets = [];
  let cachedIpAdapterWeightTypes = [];
  let cachedClipVisionModels = [];
  let cachedNodeSpecs = {};
  // AI 辅助:从接口 /models 拉到的模型名列表(供下拉选择)
  let cachedAiModels = [];

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
        // 兼容升级：老配置没有「激活词分组」字段，就地补齐默认值(已有数据一律不动)
        extSettings[MODULE_NAME].comfyLoras.forEach((item, i) => {
          if (!item || typeof item !== 'object') return;
          if (!Array.isArray(item.variants)) item.variants = [];
          if (typeof item.activeVariantId !== 'string') item.activeVariantId = '';
          if (!item.id) item.id = `lora_${i}`;
        });
        // 画风参考:把旧的单图配置迁移成参考图列表(最多 4 张,各自带权重)
        const refStore = extSettings[MODULE_NAME];
        if (!Array.isArray(refStore.comfyStyleRefImages)) refStore.comfyStyleRefImages = [];
        if (refStore.comfyStyleRefImages.length === 0 && (refStore.comfyStyleRefImage || '').trim()) {
          refStore.comfyStyleRefImages = [{
            id: `ref_${Date.now()}`,
            filename: String(refStore.comfyStyleRefImage).trim(),
            weight: typeof refStore.comfyStyleRefStrength === 'number' ? refStore.comfyStyleRefStrength : 0.8
          }];
        }
        // 兼容迁移：早期版本误把"通用排除关键词"存在负向字段里，这里搬回正向黑名单字段
        if (extSettings[MODULE_NAME].comfyGlobalLoraNegatives) {
          if (!extSettings[MODULE_NAME].comfyGlobalExcludeKeywords) {
            extSettings[MODULE_NAME].comfyGlobalExcludeKeywords = extSettings[MODULE_NAME].comfyGlobalLoraNegatives;
          }
          delete extSettings[MODULE_NAME].comfyGlobalLoraNegatives;
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

  // 提取 ComfyUI 图片的稳定文件标识 (忽略时间戳等缓存参数)，用于跨次去重
  function comfyFileKey(url) {
    if (!url || typeof url !== 'string') return '';
    try {
      const q = url.split('?')[1] || '';
      const params = new URLSearchParams(q);
      const fn = params.get('filename') || url;
      const sub = params.get('subfolder') || '';
      const type = params.get('type') || '';
      return `${sub}/${fn}#${type}`;
    } catch (_) {
      return url;
    }
  }

  // 按文件名去重：保留首次出现的顺序，但采用最新的带时间戳 URL (规避浏览器缓存读到旧图)
  function dedupeComfyImages(list) {
    const order = [];
    const map = new Map();
    (list || []).forEach(raw => {
      const url = normalizeComfyImageUrl(raw);
      if (!url) return;
      const key = comfyFileKey(url);
      if (!map.has(key)) order.push(key);
      map.set(key, url);
    });
    return order.map(k => map.get(k));
  }

  // 轮播最多保留张数：反复「重新生成」时旧图会持续累积，给个上限免得卡片无限膨胀
  const CAROUSEL_MAX_IMAGES = 12;
  function capCarouselImages(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.length > CAROUSEL_MAX_IMAGES ? arr.slice(arr.length - CAROUSEL_MAX_IMAGES) : arr;
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
  function saveChatMessageExtraImages(mesId, slotIdx, images, promptText, activeLoras = [], lastRepaintUrl = '') {
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
        lastRepaintUrl: lastRepaintUrl || '',
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
    if (typeof ctx.setExtensionPrompt !== 'function') return;

    // 用户为某些 LoRA 勾选了「提醒聊天 AI」时,把提醒一起塞进上下文
    const reminders = s.comfyEnabled ? buildLoraAiReminders() : '';
    const baseText = (s.autoInjectImageInstruction && s.comfyEnabled) ? (s.imageInstructionText || DEFAULT_IMAGE_INSTRUCTION) : '';

    const finalText = `${baseText}${reminders}`.trim();
    if (finalText) {
      // 注入在上下文尾部，确保模型严格遵守输出规范
      ctx.setExtensionPrompt(MODULE_NAME, `\n${finalText}\n`, 1, 0, false);
    } else {
      ctx.setExtensionPrompt(MODULE_NAME, '', 1, 0, false);
    }
  }

  /** 汇总「提醒聊天 AI」的 LoRA 备注(用于注入上下文,让聊天模型写对角色触发 tag) */
  function buildLoraAiReminders() {
    const loras = getSettings().comfyLoras || [];
    const lines = loras
      .filter(item => item && item.aiHintToChat && String(item.aiHint || '').trim())
      .map(item => {
        const label = String(item.title || '').trim() || String(item.name || '').trim() || '(未命名 LoRA)';
        return `- ${label}:${String(item.aiHint).trim()}`;
      });
    if (lines.length === 0) return '';
    return `\n【角色 LoRA 提醒 · 写生图标签时必须遵守】\n${lines.join('\n')}\n`;
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
  // SAM2 一键全图分区选择：把自动掩码生成器输出的"每区域一色叠加图"解析成
  // 可点选的区域芯片；点击芯片即把该色块区域加入/移出重绘蒙版
  // ---------------------------------------------------------------------------
  let sctRegionState = null; // { overlayUrl, regions:[{key,count,label,swatch}], selected:Set, busy }

  // 颜色容差 (叠加图保存为 PNG 时可能有轻微色偏)
  const SCT_REGION_COLOR_TOL = 14;

  // 拉取叠加图并按颜色聚类出区域列表 (面积过小或纯黑的忽略，按面积降序最多取 28 个)
  function enterRegionSelectionMode(overlayUrl) {
    if (!inpaintModalEl || !inpaintMaskCtx || !inpaintDrawCtx) return Promise.resolve(false);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const w = inpaintMaskCanvas.width;
          const h = inpaintMaskCanvas.height;
          const tc = document.createElement('canvas');
          tc.width = w;
          tc.height = h;
          const tctx = tc.getContext('2d');
          tctx.drawImage(img, 0, 0, w, h);
          const d = tctx.getImageData(0, 0, w, h).data;

          const colorMap = new Map();
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            if (r + g + b === 0) continue; // 纯黑背景忽略
            const key = (r << 16) | (g << 8) | b;
            const box = colorMap.get(key) || { count: 0, minX: w, minY: h, maxX: 0, maxY: 0 };
            box.count++;
            const px = (i / 4) % w;
            const py = Math.floor((i / 4) / w);
            if (px < box.minX) box.minX = px;
            if (px > box.maxX) box.maxX = px;
            if (py < box.minY) box.minY = py;
            if (py > box.maxY) box.maxY = py;
            colorMap.set(key, box);
          }

          const total = w * h;
          const minPx = Math.max(300, Math.floor(total * 0.002));
          const regions = [...colorMap.entries()]
            .filter(([, box]) => box.count >= minPx)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 28)
            .map(([key, box], idx) => ({
              key,
              count: box.count,
              label: `区域 ${idx + 1}`,
              swatch: `rgb(${(key >> 16) & 255}, ${(key >> 8) & 255}, ${key & 255})`
            }));

          sctRegionState = { overlayUrl, regions, selected: new Set(), busy: false };
          renderRegionChips();
          resolve(regions.length > 0);
        } catch (_) {
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = overlayUrl;
    });
  }

  // 渲染区域芯片列表 (点击芯片 = 该区域加入/移出重绘选区)
  function renderRegionChips() {
    const listEl = inpaintModalEl?.querySelector('#sct-sam-region-list');
    if (!listEl) return;
    if (!sctRegionState) return;
    if (!sctRegionState.regions || sctRegionState.regions.length === 0) {
      listEl.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }
    listEl.style.display = 'block';
    listEl.innerHTML = `
      <div class="sct-region-header">
        <span class="sct-region-title">🧩 分区选择 · 点击色块加入/移出重绘选区</span>
        <button type="button" class="sct-pack-chip sct-region-clear">❌ 清除全部分区</button>
      </div>
      <div class="sct-region-chips"></div>
    `;
    const chipsEl = listEl.querySelector('.sct-region-chips');
    sctRegionState.regions.forEach(region => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sct-region-chip';
      chip.dataset.regionKey = String(region.key);
      chip.title = `占用 ${region.count} 像素，点击加入或移出重绘选区`;
      chip.innerHTML = `<span class="sct-region-swatch" style="background:${region.swatch}"></span>${region.label}`;
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleRegionFromChip(chip);
      });
      chipsEl.appendChild(chip);
    });
    listEl.querySelector('.sct-region-clear').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearAllRegions();
    });
  }

  // 按颜色从叠加图中提取该区域并写入重绘双层画布 (加入选区 / 移出选区)
  function applyRegionColorMask(overlayUrl, colorKey, isOn) {
    if (!inpaintMaskCtx || !inpaintDrawCtx) return Promise.resolve(false);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const w = inpaintMaskCanvas.width;
          const h = inpaintMaskCanvas.height;
          const tc = document.createElement('canvas');
          tc.width = w;
          tc.height = h;
          const tctx = tc.getContext('2d');
          tctx.drawImage(img, 0, 0, w, h);
          const d = tctx.getImageData(0, 0, w, h).data;

          const maskImgData = inpaintMaskCtx.getImageData(0, 0, w, h);
          const md = maskImgData.data;
          const visualImgData = inpaintDrawCtx.getImageData(0, 0, w, h);
          const vd = visualImgData.data;

          const r0 = (colorKey >> 16) & 255;
          const g0 = (colorKey >> 8) & 255;
          const b0 = colorKey & 255;

          for (let i = 0; i < d.length; i += 4) {
            const inRegion = Math.abs(d[i] - r0) <= SCT_REGION_COLOR_TOL &&
                             Math.abs(d[i + 1] - g0) <= SCT_REGION_COLOR_TOL &&
                             Math.abs(d[i + 2] - b0) <= SCT_REGION_COLOR_TOL;
            if (!inRegion) continue;
            if (isOn) {
              md[i] = 255; md[i + 1] = 255; md[i + 2] = 255; md[i + 3] = 255;
              vd[i] = 239; vd[i + 1] = 68; vd[i + 2] = 68; vd[i + 3] = 140;
            } else {
              md[i] = 0; md[i + 1] = 0; md[i + 2] = 0; md[i + 3] = 255;
              vd[i] = 0; vd[i + 1] = 0; vd[i + 2] = 0; vd[i + 3] = 0;
            }
          }

          inpaintMaskCtx.putImageData(maskImgData, 0, 0);
          inpaintDrawCtx.putImageData(visualImgData, 0, 0);
          resolve(true);
        } catch (_) {
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = overlayUrl;
    });
  }

  // 区域芯片点击切换 (加入/移出，动作前都做历史快照保证可撤销)
  async function toggleRegionFromChip(chip) {
    if (!sctRegionState || !inpaintModalEl) return;
    const key = parseInt(chip.dataset.regionKey, 10);
    const region = sctRegionState.regions.find(r => r.key === key);
    if (!region || sctRegionState.busy) return;
    const wasOn = sctRegionState.selected.has(key);
    sctRegionState.busy = true;
    try {
      captureInpaintHistoryPoint();
      const ok = await applyRegionColorMask(sctRegionState.overlayUrl, key, !wasOn);
      if (ok) {
        if (wasOn) sctRegionState.selected.delete(key);
        else sctRegionState.selected.add(key);
        chip.classList.toggle('active', !wasOn);
      }
    } finally {
      sctRegionState.busy = false;
    }
  }

  // 一键清除所有已选分区 (不影响手动涂抹的笔迹)
  async function clearAllRegions() {
    if (!sctRegionState || sctRegionState.busy || !inpaintModalEl) return;
    const keys = [...sctRegionState.selected];
    if (keys.length === 0) {
      showToast('当前没有已加入的分区', 'info');
      return;
    }
    sctRegionState.busy = true;
    try {
      captureInpaintHistoryPoint();
      for (const key of keys) {
        await applyRegionColorMask(sctRegionState.overlayUrl, key, false);
      }
      sctRegionState.selected.clear();
      inpaintModalEl.querySelectorAll('.sct-region-chip.active').forEach(chipEl => chipEl.classList.remove('active'));
      showToast('已清除全部分区选择 (可用 Ctrl+Z 撤回)', 'success');
    } finally {
      sctRegionState.busy = false;
    }
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

  // 为画板文本框挂自动中文转英文：输入停顿(默认900ms)或失焦时，自动把框内内容替换为翻译好的英文
  // (视觉反馈：成功后边框紫色闪烁 1.2 秒，原中文记录在悬浮提示里；不打断拼音输入法组词)
  function bindSegChineseAutoTranslate(field, idleDelay = 900) {
    if (!field) return;
    let timer = null;
    let running = false;
    let composing = false;

    const flashTranslated = () => {
      const old = field.style.borderColor;
      field.style.borderColor = 'rgba(139, 92, 246, 0.9)';
      setTimeout(() => { field.style.borderColor = old || ''; }, 1200);
    };

    const runTranslate = async () => {
      const val = (field.value || '').trim();
      if (!val || !hasChineseText(val) || running) return;
      running = true;
      try {
        const en = await translateSegPromptToEnglish(val);
        const normalized = (en || '').trim();
        if (normalized && normalized !== val) {
          field.value = normalized;
          field.title = `原文: ${val}`;
          flashTranslated();
        }
      } catch (_) { /* 翻译不可用时保留原文 */ } finally {
        running = false;
      }
    };

    const scheduleTranslate = () => {
      if (composing || !hasChineseText(field.value)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; runTranslate(); }, idleDelay);
    };

    field.addEventListener('compositionstart', () => { composing = true; });
    field.addEventListener('compositionend', () => {
      composing = false;
      scheduleTranslate();
    });
    field.addEventListener('input', scheduleTranslate);
    field.addEventListener('blur', () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!composing && hasChineseText(field.value)) runTranslate();
    });
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
        } else if (type === 'regions') {
          // SAM2 一键全图自动分区 (自动掩码生成器)：返回每个区域不同颜色叠加的可视化图，
          // 前端按颜色逐块提取成可点选的重绘区域芯片
          outputNodeId = '4';
          promptWf = {
            '1': { inputs: { image: currentInpaintUploadedName, upload: 'image' }, class_type: 'LoadImage' },
            '2': {
              inputs: {
                model: candidate,
                segmentor: 'automaskgenerator',
                device: 'cuda',
                precision: 'fp16'
              },
              class_type: 'DownloadAndLoadSAM2Model'
            },
            '3': {
              inputs: {
                sam2_model: ['2', 0],
                image: ['1', 0],
                points_per_side: 24,
                points_per_batch: 32,
                pred_iou_thresh: 0.85,
                stability_score_thresh: 0.92,
                stability_score_offset: 1.0,
                mask_threshold: 0.0,
                crop_n_layers: 0,
                box_nms_thresh: 0.7,
                crop_nms_thresh: 0.7,
                crop_overlap_ratio: 0.34,
                crop_n_points_downscale_factor: 1,
                min_mask_region_area: 0.0,
                use_m2m: false,
                keep_model_loaded: true
              },
              class_type: 'Sam2AutoSegmentation'
            },
            '4': { inputs: { filename_prefix: `sct_sam_regions_${ts}`, images: ['3', 1] }, class_type: 'SaveImage' }
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

      // 5. 应用结果：一键分区模式进入区域点选交互；文字与点选模式直接写入画布
      const maskUrl = `${comfyHost}/view?filename=${encodeURIComponent(outputImgInfo.filename)}&subfolder=${encodeURIComponent(outputImgInfo.subfolder || '')}&type=${encodeURIComponent(outputImgInfo.type || 'output')}&t=${Date.now()}`;
      inpaintSegMaskCache.set(segCacheKey, maskUrl);

      if (type === 'regions') {
        const okEnter = await enterRegionSelectionMode(maskUrl);
        if (okEnter && sctRegionState?.regions?.length > 0) {
          showToast(`🧩 全图已切分为 ${sctRegionState.regions.length} 个区域，点击芯片勾选要重绘的部分`, 'success');
        } else {
          showToast('未识别出足够的分区块，请使用画笔手动涂抹或鼠标点选', 'warning');
        }
      } else {
        await applyMaskImageToCanvas(maskUrl, isAddMode);
        showToast(`已成功提取【${label || promptText || '目标区域'}】${lastSegModelInfo ? ' · ' + lastSegModelInfo : ''}`, 'success');
      }

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
                  <button type="button" class="sct-comfy-btn sct-tool-btn" id="sct-sam-regions-btn" title="一键把全图自动切成多个区域 (衣服/手臂/部位等)，然后点击区域芯片加入重绘选区">🧩 一键分区</button>
                </div>

                <div id="sct-sam-region-list" style="display:none;"></div>

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
    // 注意：绝不在点击遮罩空白处时关闭弹窗 (极易误触丢失涂抹进度)，仅允许 X 按钮/取消按钮/Esc 键退出

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

    // 一键分区按钮：提交 SAM2 自动掩码生成，完成后弹出色块区域芯片
    overlay.querySelector('#sct-sam-regions-btn').addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await runComfySegmentationTask({ type: 'regions' });
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
      let val = (customInput.value || '').trim();
      if (!val) {
        showToast('请输入需要识别分割的目标关键词 (支持中文，会自动翻译成英文)', 'warning');
        return;
      }
      // 点击识别按钮时即时翻译并回填输入框 (内部有缓存，重复点击不重复请求)
      if (hasChineseText(val)) {
        try {
          const en = (await translateSegPromptToEnglish(val) || '').trim();
          if (en && en !== val) {
            customInput.value = en;
            customInput.title = `原文: ${val}`;
            showToast(`关键词已自动翻译为英文: ${en}`, 'success');
            val = en;
          }
        } catch (_) { /* 翻译不可用时按原文继续识别 */ }
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

    // 自定义关键词输入框 + 局部重绘提示词输入框：中文停顿/失焦自动译英
    bindSegChineseAutoTranslate(customInput, 900);
    bindSegChineseAutoTranslate(overlay.querySelector('#sct-inpaint-prompt-input'), 900);

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

      let inpaintPrompt = (overlay.querySelector('#sct-inpaint-prompt-input').value || promptText || '').trim();
      // 提交前兜底：中文重绘提示词自动翻译成英文 (CLIP 文本编码器英文效果最佳)
      if (hasChineseText(inpaintPrompt)) {
        const originalCn = inpaintPrompt;
        try {
          const en = (await translateSegPromptToEnglish(inpaintPrompt) || '').trim();
          if (en && en !== inpaintPrompt) {
            inpaintPrompt = en;
            const promptInputEl = overlay.querySelector('#sct-inpaint-prompt-input');
            if (promptInputEl) {
              promptInputEl.value = en;
              promptInputEl.title = `原文: ${originalCn}`;
            }
            showToast(`重绘提示词已自动翻译为英文: ${inpaintPrompt}`, 'success');
          }
        } catch (_) { /* 翻译不可用时按原词继续重绘 */ }
      }
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

    // 重置一键分区状态与芯片列表
    sctRegionState = null;
    const regionList = modal.querySelector('#sct-sam-region-list');
    if (regionList) {
      regionList.style.display = 'none';
      regionList.innerHTML = '';
    }

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

    // 加载底图并同步画板尺寸 (含 CORS 失败自动回退，绝不出现空白弹窗)
    const applyBaseImageLayout = () => {
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

    baseImg.onload = applyBaseImageLayout;
    baseImg.onerror = () => {
      // ComfyUI 未开 CORS 头时 crossOrigin="anonymous" 会让图片被浏览器拦截而空白：去掉该属性重试一次
      if (baseImg.getAttribute('crossorigin')) {
        baseImg.removeAttribute('crossorigin');
        console.warn('[SCT] 底图 CORS 加载失败，已改用普通模式重试');
        baseImg.src = imageUrl;
        return;
      }
      showToast('底图加载失败：请确认 ComfyUI 服务可访问 (建议加 --enable-cors-header 启动)', 'error');
    };

    baseImg.src = imageUrl;
    modal.style.display = 'flex';

    // 兜底：1.5 秒内仍未解码出尺寸时按默认尺寸先撑开画板，避免弹窗一片空白
    setTimeout(() => {
      if (modal.style.display !== 'none' && !drawCanvas.width) {
        applyBaseImageLayout();
      }
    }, 1500);
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

  // ---------------------------------------------------------------------------
  // 激活词分组(变体):同一个角色/同一份 LoRA 可以有多套激活词(校服/泳装/便服…)
  // 出图时"用哪一组":手动指定 activeVariantId 优先 → 图片 tag 命中组关键词 → 正文命中 → 回落基础特征词
  // ---------------------------------------------------------------------------
  /** 编辑用:全部分组(含刚添加、还没填内容的空组)——UI 渲染必须用它,否则新组看不见 */
  function loraAllVariants(lora) {
    if (!lora || !Array.isArray(lora.variants)) return [];
    return lora.variants.filter(v => v && typeof v === 'object');
  }

  /** 生效用:至少填了关键词或特征词的组才参与匹配与注入 */
  function loraVariantList(lora) {
    return loraAllVariants(lora).filter(v => v.triggerWords || v.keywords);
  }

  /** 空组:关键词与特征词都没填(多为误点「添加」留下的),用于提示与一键清理 */
  function loraBlankVariants(lora) {
    return loraAllVariants(lora).filter(v => !v.triggerWords && !v.keywords);
  }

  // ---------------------------------------------------------------------------
  // 激活判定工具(detectActiveLoras / 诊断 / 搜索共用同一套规则)
  // 严格规则:只有「角色激活关键词」与「分组激活关键词」能触发挂载
  // ---------------------------------------------------------------------------

  /** 把一个字段展开成多种写法(原样 / 下划线→空格 / 两词名顺序互换) */
  function expandLoraTokens(raw, minLen = 2) {
    const out = new Set();
    const norm = (s) => s.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    (raw || '')
      .split(/[,，\n|]/)
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length >= minLen)
      .forEach(tok => {
        out.add(tok);
        const spaced = norm(tok);
        if (!spaced) return;
        out.add(spaced);
        const parts = spaced.split(' ').filter(Boolean);
        if (parts.length === 2) out.add(`${parts[1]} ${parts[0]}`);
      });
    return [...out];
  }

  /**
   * 诊断:一段画面提示词会激活哪些 LoRA、命中词是什么、谁抢走了动态名额、谁没命中
   * 专门用来回答「为什么这个角色 LoRA 没激活」
   */
  function diagnoseLoraActivation(text) {
    const loras = getSettings().comfyLoras || [];
    const lower = String(text || '').toLowerCase();
    const haystacks = [lower, lower.replace(/[_-]/g, ' ').replace(/\s+/g, ' ')];
    const hitToken = (list) => {
      for (const tok of list) if (haystacks.some(h => h.includes(tok))) return tok;
      return '';
    };
    const rows = [];

    loras.forEach((item, idx) => {
      const name = String(item.name || '').trim();
      if (!item.enabled) return rows.push({ idx, item, state: 'disabled', stage: '条目已停用', token: '' });
      if (!name) return rows.push({ idx, item, state: 'noname', stage: '未填 LoRA 文件名(不会挂载)', token: '' });
      if (item.alwaysOn) return rows.push({ idx, item, state: 'alwaysOn', stage: '常驻生效(每张图都挂)', token: '' });

      const kwTokens = expandLoraTokens(item.keywords, 2);
      const variantTokens = loraVariantList(item).flatMap(v => expandLoraTokens(v.keywords, 2));
      const noKeywords = kwTokens.length === 0 && variantTokens.length === 0;

      // 只认激活词与分组激活词(不再有特征词/文件名兜底)
      const kwHit = hitToken(kwTokens);
      const varHit = kwHit ? '' : hitToken(variantTokens);
      const token = kwHit || varHit;

      rows.push({
        idx,
        item,
        state: token ? 'matched' : (noKeywords ? 'nokeywords' : 'nomatch'),
        stage: kwHit ? '激活关键词' : (varHit ? '分组激活关键词' : (noKeywords ? '没写激活词 → 不会自动激活(勾常驻才会挂)' : '')),
        token,
        noKeywords,
      });
    });

    const matched = rows.filter(r => r.state === 'matched');
    const dynamicMatched = matched.filter(r => !r.item.alwaysOn);
    return {
      rows,
      matched,
      dynamic: dynamicMatched,
      winner: dynamicMatched[0] || null,
      crowded: dynamicMatched.slice(1),
      alwaysOn: rows.filter(r => r.state === 'alwaysOn'),
    };
  }

  // LoRA 列表搜索/筛选(渲染后可重复调用;状态保存在 loraListFilter 里)
  let loraListFilter = '';
  let loraListFilterNoKw = false;
  function applyLoraFilter(keyword, container, onlyNoKeywords) {
    if (typeof keyword === 'string') loraListFilter = keyword;
    if (typeof onlyNoKeywords === 'boolean') loraListFilterNoKw = onlyNoKeywords;
    const listEl = container || document.getElementById('sct-lora-items-container');
    if (!listEl) return 0;
    const kw = loraListFilter.trim().toLowerCase();
    const cards = [...listEl.querySelectorAll('.sct-lora-card')];
    let shown = 0;
    cards.forEach(card => {
      const hay = card.dataset.search || '';
      const okKeyword = !kw || hay.includes(kw);
      const okNoKw = !loraListFilterNoKw || card.dataset.hasKeywords === '0';
      const visible = okKeyword && okNoKw;
      card.style.display = visible ? '' : 'none';
      if (visible) shown++;
    });
    const countEl = document.getElementById('sct-lora-search-count');
    if (countEl) {
      const parts = [];
      if (loraListFilterNoKw) parts.push('仅缺激活词');
      if (kw) parts.push(`关键词「${loraListFilter.trim()}」`);
      countEl.textContent = parts.length ? `${parts.join(' + ')}:${shown} / ${cards.length} 条` : `共 ${cards.length} 条`;
    }
    return shown;
  }

  /** 统计没有激活词的条目数(用于筛选按钮上的数字) */
  function countLoraWithoutKeywords() {
    return (getSettings().comfyLoras || []).filter(item => {
      if (!item || !String(item.name || '').trim()) return false;
      const kw = expandLoraTokens(item.keywords, 2).length;
      const vk = loraVariantList(item).flatMap(v => expandLoraTokens(v.keywords, 2)).length;
      return kw === 0 && vk === 0;
    }).length;
  }

  /* ---------------------------------------------------------------------------
     角色预览图管理
     为什么走 input 目录:ComfyUI 的 /view 只认 input/output/temp(type=loras 会 400),
     所以把 LoRA 旁边的预览图同步到 input/sct_lora_preview/(见 tools/sync-lora-previews.js),
     上传/替换也用同一个目录,插件按清单精确取图。
     --------------------------------------------------------------------------- */
  const LORA_PREVIEW_SUBFOLDER = 'sct_lora_preview';
  let loraPreviewManifest = null;      // { LoRA名/主干名: 预览文件名 }
  let loraPreviewManifestLoading = false;

  /** LoRA 名 → 预览文件名主干(子目录用 __ 连接) */
  function loraPreviewKey(name) {
    return String(name || '').trim().replace(/\.safetensors$/i, '').replace(/[\\/]/g, '__');
  }

  async function ensureLoraPreviewManifest() {
    if (loraPreviewManifest !== null || loraPreviewManifestLoading) return loraPreviewManifest;
    loraPreviewManifestLoading = true;
    try {
      const host = getCleanComfyHost();
      const url = `${host}/view?filename=${encodeURIComponent('_manifest.json')}&subfolder=${encodeURIComponent(LORA_PREVIEW_SUBFOLDER)}&type=input`;
      const res = await fetch(url, { cache: 'no-store' });
      loraPreviewManifest = res.ok ? await res.json() : {};
    } catch (_) {
      loraPreviewManifest = {};
    } finally {
      loraPreviewManifestLoading = false;
    }
    return loraPreviewManifest;
  }

  /** 取某条 LoRA 的预览图 URL:★ 优先用手机本地缓存(电脑重启/隧道换址后依然能显示) */
  function loraPreviewUrl(item) {
    if (!item || item.previewOff) return '';
    const key = loraPreviewKey(item.name);
    const local = loraPreviewLocalUrls.get(key);
    if (local) return local;
    const stem = String(item.name || '').split(/[\\/]/).pop().replace(/\.safetensors$/i, '');
    const manifest = loraPreviewManifest || {};
    const file = item.previewFile || manifest[item.name] || manifest[key] || manifest[stem] || '';
    if (!file) return '';
    const host = getCleanComfyHost();
    const ver = item.previewVer ? `&t=${encodeURIComponent(item.previewVer)}` : '';
    return `${host}/view?filename=${encodeURIComponent(file)}&subfolder=${encodeURIComponent(LORA_PREVIEW_SUBFOLDER)}&type=input${ver}`;
  }

  /** 把服务器版预览图地址(用于把服务器预览抓成本地副本) */
  function loraPreviewServerUrl(item) {
    const stem = String(item.name || '').split(/[\\/]/).pop().replace(/\.safetensors$/i, '');
    const manifest = loraPreviewManifest || {};
    const file = item.previewFile || manifest[item.name] || manifest[loraPreviewKey(item.name)] || manifest[stem] || '';
    if (!file) return '';
    return `${getCleanComfyHost()}/view?filename=${encodeURIComponent(file)}&subfolder=${encodeURIComponent(LORA_PREVIEW_SUBFOLDER)}&type=input`;
  }

  let loraPreviewAutoCacheRunning = false;

  /** 后台把所有 LoRA 预览图抓一份存到手机本地(缩略图很小,86 张不到 1MB) */
  async function autoCacheLoraPreviews(container, notify = false) {
    if (loraPreviewAutoCacheRunning) return 0;
    if (!getSettings().comfyLocalCacheEnabled) return 0;
    loraPreviewAutoCacheRunning = true;
    let saved = 0;
    try {
      const loras = getSettings().comfyLoras || [];
      for (const item of loras) {
        const key = loraPreviewKey(item.name);
        if (!key || loraPreviewLocalUrls.has(key)) continue;
        const url = loraPreviewServerUrl(item);
        if (!url) continue;
        if (await cacheLoraPreviewFromServer(key, url)) saved++;
      }
      if (saved > 0 && container) renderLoraList(container);
      if (notify) {
        showToast(
          saved > 0
            ? `已把 ${saved} 张 LoRA 预览图保存到手机本地 —— 以后电脑关着/隧道换址也能看`
            : (loraPreviewLocalUrls.size > 0 ? '预览图都已在手机本地' : '没抓到预览图:确认 ComfyUI 地址可用'),
          saved > 0 ? 'success' : 'info'
        );
      }
    } catch (err) {
      if (notify) showToast(`保存预览图失败:${err.message}`, 'error');
    } finally {
      loraPreviewAutoCacheRunning = false;
    }
    return saved;
  }

  // 组关键词命中打分:图片 tag 命中记 2 分,消息正文命中记 1 分
  function scoreLoraVariant(variant, promptText, fullText) {
    const words = (variant.keywords || '')
      .split(/[,，\n|]/)
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 1);
    if (words.length === 0) return 0;
    const lowerPrompt = (promptText || '').toLowerCase();
    const lowerFull = (fullText || '').toLowerCase();
    if (words.some(k => lowerPrompt.includes(k))) return 2;
    if (words.some(k => lowerFull.includes(k))) return 1;
    return 0;
  }

  function resolveLoraVariant(lora, promptText, fullText) {
    const variants = loraVariantList(lora);
    if (variants.length === 0) return null;
    const manual = variants.find(v => v.id && v.id === lora.activeVariantId);
    if (manual) return manual;
    let best = null;
    let bestScore = 0;
    for (const variant of variants) {
      const score = scoreLoraVariant(variant, promptText, fullText);
      if (score > bestScore) {
        best = variant;
        bestScore = score;
      }
    }
    return best;
  }

  // 组装 LoRA 特征词注入串 = 通用角色关键词(全局常驻) + 每个被激活 LoRA 的触发词
  // 命中激活词分组时用「那一组」的特征词,不叠加基础词——否则校服词会串进泳装图里
  function buildLoraTriggerInjection(activeLoras, context = {}) {
    const s = getSettings();
    const list = Array.isArray(activeLoras) ? activeLoras : [];
    const promptText = context.promptText || '';
    const fullText = context.fullText || '';

    const parts = [];
    const globalKw = (s.comfyGlobalLoraKeywords || '').trim();
    if (globalKw) parts.push(globalKw);
    const baseAlways = s.comfyLoraBaseAlwaysInject !== false;
    // 选哪一组也只看画面 tag(与激活判定同规则),除非用户显式开启了正文兜底
    const variantFullText = s.comfyLoraMatchBody === true ? fullText : '';
    list.forEach(l => {
      if (!l) return;
      const variant = resolveLoraVariant(l, promptText, variantFullText);
      const baseTw = ((l.triggerWords) || '').trim();
      if (variant) {
        // 基础词 = 身份锚点(发色/眼睛/尾巴…):默认始终注入,保证换装不丢角色
        if (baseAlways && baseTw) parts.push(baseTw);
        const vTw = ((variant.triggerWords) || '').trim();
        if (vTw) parts.push(vTw);
      } else if (baseTw) {
        parts.push(baseTw);
      }
    });

    const seen = new Set();
    const tokens = [];
    parts.join(',').split(/[,，]/).map(t => t.trim()).filter(Boolean).forEach(t => {
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      tokens.push(t);
    });

    return tokens.length > 0 ? `${tokens.join(', ')}, ` : '';
  }

  // 通用排除关键词：从最终正向提示词中把命中的词剔除掉 (正向黑名单，不限 LoRA，始终生效)
  // 语法：逗号/换行分隔多个词；支持 * 通配 (hat* 前缀、*hat* 包含)；以"逗号分段 token"为粒度匹配，不误伤其它词
  function buildPositiveExclusionRegex(list) {
    const alts = list.map(word => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^,，]*');
      return escaped;
    });
    return new RegExp(`(^|[,，])\\s*(?:${alts.join('|')})\\s*(?=[,，]|$)`, 'gi');
  }

  function applyPositiveExclusions(positivePrompt) {
    let text = positivePrompt || '';
    const s = getSettings();
    const raw = (s.comfyGlobalExcludeKeywords || '').trim();
    if (!raw || !text) return text;

    const list = raw.split(/[,，\n]/).map(t => t.trim()).filter(Boolean);
    if (list.length === 0) return text;

    try {
      text = text.replace(buildPositiveExclusionRegex(list), '$1');
      // 清理因剔除产生的多余逗号与空白
      text = text
        .replace(/[,，]\s*(?=[,，])/g, '')
        .replace(/^\s*[,，]\s*/, '')
        .replace(/[,，]\s*$/, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    } catch (_) {}
    return text;
  }

  // 检测生图应激活的角色 LoRA (核心防串台机制：正文可出现 1girl/1boy 双主体，
  // 但动态匹配的角色 LoRA 每张图严格最多只激活 1 个，绝不互相污染；常驻 LoRA 不受此限全量直载)
  function detectActiveLoras(fullText, promptText) {
    const s = getSettings();
    const loras = s.comfyLoras || [];
    if (!loras || loras.length === 0) return [];

    const lowerPrompt = (promptText || '').toLowerCase();
    const lowerFull = (fullText || '').toLowerCase();

    const matchedLoras = [];

    // Helper: 检查某个 LoRA 是否与指定文本匹配
    function matchLoraAgainstText(lora, text) {
      if (!lora.enabled || !lora.name) return false;
      const rawText = String(text || '').toLowerCase();
      // 文本侧容错:下划线/连字符视为空格(yanami_anna ≈ yanami anna)
      const haystacks = [rawText, rawText.replace(/[_-]/g, ' ').replace(/\s+/g, ' ')];
      const hit = (list) => list.some(tok => haystacks.some(hay => hay.includes(tok)));

      // ★ 唯一激活依据 = 角色激活关键词 + 各分组的激活关键词
      //   - 不使用「角色特征激活词」兜底(那是注入内容,不是判别词;blue hair 之类会把名额抢走)
      //   - 不使用 LoRA 文件名兜底(文件名只用于挂载,不参与判别)
      //   没写激活词的条目 = 永远不会被自动激活(只在勾了常驻时才挂),这是刻意的可预测行为
      if (hit(expandLoraTokens(lora.keywords, 2))) return true;
      if (hit(loraVariantList(lora).flatMap(variant => expandLoraTokens(variant.keywords, 2)))) return true;
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

    // 动态角色名额：常驻全量之外，严格只允许再加 1 个动态角色 LoRA (防串台核心铁律)
    const maxTotalLoras = matchedLoras.length + 1;

    // 第 1 阶段【单名额动态匹配】：优先从生图标签自身 (promptText) 识别专属角色/服装 LoRA，命中即止
    if (matchedLoras.length < maxTotalLoras) {
      for (const item of loras) {
        if (!item.enabled || !item.name || item.alwaysOn) continue; // 已常驻的不重复匹配
        if (matchLoraAgainstText(item, lowerPrompt)) {
          matchedLoras.push(item);
          break; // 动态角色名额严格只用 1 个，绝不串台
        }
      }
    }

    // 第 2 阶段【正文兜底 · 默认关闭】:按用户要求,激活判定只看「画面提示词(图片 tag)」,
    // 不再拿整条消息正文去兜底 —— 否则剧情正文里随便提到一个名字就会挂上不相干的角色 LoRA
    // (想在正文里也能激活,就到设置里把「允许用消息正文兜底」打开)
    const allowBodyFallback = getSettings().comfyLoraMatchBody === true;
    const hasDynamicLora = matchedLoras.some(l => !l.alwaysOn);
    if (allowBodyFallback && !hasDynamicLora && matchedLoras.length < maxTotalLoras) {
      for (const item of loras) {
        if (!item.enabled || !item.name || item.alwaysOn) continue;
        if (matchLoraAgainstText(item, lowerFull)) {
          matchedLoras.push(item);
          break;
        }
      }
    }

    return matchedLoras;
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

    // 脸部修复:可选检测模型 + FaceDetailer 必填输入规格(装了 Impact-Pack 才有)
    cachedFaceDetailerSpec = await fetchFaceDetailerSpec(host);
    try {
      const detRes = await fetch(`${host}/object_info/UltralyticsDetectorProvider`);
      if (detRes.ok) {
        const d = await detRes.json();
        cachedFaceDetectors = d?.UltralyticsDetectorProvider?.input?.required?.model_name?.[0] || [];
      } else {
        cachedFaceDetectors = [];
      }
    } catch (_) {
      cachedFaceDetectors = [];
    }

    // 画风参考:IPAdapter 预设/IPAdapter 模型(装了 IPAdapter_plus 才有) + CLIP Vision 模型
    cachedIpAdapterPresets = await fetchNodeOptionList(host, 'IPAdapterUnifiedLoader', 'preset');
    cachedClipVisionModels = await fetchNodeOptionList(host, 'CLIPVisionLoader', 'clip_name');
    cachedNodeSpecs = {};
    for (const cls of ['IPAdapterUnifiedLoader', 'IPAdapter', 'IPAdapterAdvanced', 'CLIPVisionLoader', 'CLIPVisionEncode', 'unCLIPConditioning', 'FaceDetailer', 'UltralyticsDetectorProvider']) {
      await fetchNodeSpec(host, cls);
    }
    if (cachedNodeSpecs.FaceDetailer) cachedFaceDetailerSpec = cachedNodeSpecs.FaceDetailer;
    // IP-Adapter 的「权重类型」候选也来自节点本身(linear / style transfer / composition …)
    const ipaApplySpec = cachedNodeSpecs.IPAdapterAdvanced || cachedNodeSpecs.IPAdapter;
    cachedIpAdapterWeightTypes = (ipaApplySpec && Array.isArray(ipaApplySpec.weight_type) && Array.isArray(ipaApplySpec.weight_type[0]))
      ? ipaApplySpec.weight_type[0]
      : [];

    cachedCheckpoints = results.checkpoints;
    cachedLoras = results.loras;
    cachedSamplers = results.samplers;
    cachedSchedulers = results.schedulers;

    return results;
  }

  /**
   * 读取 FaceDetailer 节点的必填输入规格。
   * 为什么运行时读:Impact-Pack 各版本的必填项会增减(或改名),写死一套参数迟早会因为
   * 「缺少/多余输入」整张图报错。拿到规格后按 key 填值,端口差异自然被吸收。
   * 返回 { 输入名: 规格数组 } 或 null(未安装 Impact-Pack)。
   */
  async function fetchFaceDetailerSpec(host) {
    try {
      const res = await fetch(`${host}/object_info/FaceDetailer`);
      if (!res.ok) return null;
      const data = await res.json();
      const required = data?.FaceDetailer?.input?.required;
      if (!required || typeof required !== 'object') return null;
      return required;
    } catch (_) {
      return null;
    }
  }

  /** 从 object_info 的输入规格里取默认值(规格形如 [[choices...]] 或 ["INT", {default: 20}] ) */
  function specDefault(spec, fallback) {
    if (!Array.isArray(spec)) return fallback;
    const type = spec[0];
    if (Array.isArray(type)) return type[0] ?? fallback; // 下拉:取第一个选项
    const opts = spec[1];
    if (opts && typeof opts === 'object' && opts.default !== undefined) return opts.default;
    if (type === 'INT') return 0;
    if (type === 'FLOAT') return 1.0;
    if (type === 'BOOLEAN') return false;
    if (type === 'STRING') return '';
    return fallback;
  }

  /** 通用:读取某节点某输入的候选项列表(节点没装则返回空数组,调用方据此降级) */
  async function fetchNodeOptionList(host, nodeClass, inputName) {
    try {
      const res = await fetch(`${host}/object_info/${nodeClass}`);
      if (!res.ok) return [];
      const data = await res.json();
      const list = data?.[nodeClass]?.input?.required?.[inputName]?.[0];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  /** 通用:读取某节点的必填输入规格(带进程内缓存;节点没装返回 null) */
  async function fetchNodeSpec(host, nodeClass) {
    if (cachedNodeSpecs[nodeClass]) return cachedNodeSpecs[nodeClass];
    try {
      const res = await fetch(`${host}/object_info/${nodeClass}`);
      if (!res.ok) return null;
      const data = await res.json();
      const required = data?.[nodeClass]?.input?.required;
      if (!required || typeof required !== 'object') return null;
      cachedNodeSpecs[nodeClass] = required;
      return required;
    } catch (_) {
      return null;
    }
  }

  /** 上传图片到 ComfyUI 的 input 目录(可选子目录),返回服务器上的文件名 */
  async function uploadComfyInputImage(host, blob, filename, subfolder = '') {
    const form = new FormData();
    form.append('image', blob, filename);
    form.append('overwrite', 'true');
    form.append('type', 'input');
    if (subfolder) form.append('subfolder', subfolder);
    const res = await fetch(`${host}/upload/image`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`上传失败 (${res.status})`);
    const data = await res.json();
    const name = data?.name || '';
    if (!name) throw new Error('ComfyUI 未返回文件名');
    return name;
  }

  /* ---------------------------------------------------------------------------
     AI 辅助配置动态 LoRA
     把「LoRA 文件名 + 用户粘贴的作者说明/示例」交给任意 OpenAI 兼容接口,
     让它输出结构化配置(激活关键词 / 特征注入词 / 多组分组),直接写进该 LoRA 条目。
     典型场景:一个 LoRA 里含 5 个角色 —— AI 一次就给出 5 组,不用手打。
     --------------------------------------------------------------------------- */

  // 从模型回复里抠出 JSON(容忍 ```json 围栏、前后废话、轻微截断)
  function extractAiJson(text) {
    const raw = String(text || '').replace(/```json/gi, '```').trim();
    const fenced = raw.match(/```([\s\S]*?)```/);
    const body = fenced ? fenced[1] : raw;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch (_) {
      return null;
    }
  }

  function buildAiLoraMessages(entry) {
    const s = getSettings();
    const extra = (s.comfyAiAssistExtra || '').trim();
    const system = [
      '你是 ComfyUI / SillyTavern 生图插件的 LoRA 配置助手。',
      '用户给你一个 LoRA 文件名,可能还有作者说明或示例提示词。请输出**严格 JSON**(不要解释、不要代码围栏):',
      '{',
      '  "title": "中文标题(角色中文名,能确定作品就写成「作品名·角色名」;不确定就只写角色名)",',
      '  "keywords": "激活关键词,逗号分隔(英文触发 tag 必须放最前)",',
      '  "triggerWords": "基础特征注入词 = 角色身份锚点,逗号分隔(可空)",',
      '  "variants": [ { "label": "分组名(用简短中文,如 女仆装 / 本体默认装 / 八奈见杏菜)", "keywords": "本组激活关键词", "triggerWords": "本组注入词" } ]',
      '}',
      '',
      '【第一步 · 决定分几组(最重要,必须先做这步)】',
      '先把这个 LoRA 的「形态触发 tag」数出来,数量 = 组数:',
      '- 形态触发 tag = 区分不同角色 / 不同服装 / 不同形态的专用 tag,例:deepseek_whale_girl(本体)、deepseek_maid_outfit(女仆装)、yanami_anna(某角色)。',
      '- 只有 1 个形态触发 tag → **不分** variants 给空数组 [],全部写进基础 triggerWords;',
      '- 有「本体 + 每套服装」各一个 → **每套衣服一组**;',
      '- 一个 LoRA 含多个角色 → **每个角色一组**;',
      '- 只有"单独一条的细节 tag"(如 blue whale emblem on lower apron)时,**绝不为它单独建组**,并入它所属那套服装的组里。',
      '组数上限 8;判不准时宁少勿多(把共性词放基础,不要重复建组)。',
      '',
      '【第二步 · 三个字段怎么分工】',
      '本插件注入规则是:出图时注入「基础 triggerWords(始终注入)」 + 「被选中那一组的 triggerWords」,不会互相覆盖。因此:',
      '- 基础 triggerWords = **身份锚点**,所有组共用、永远注入:角色触发 tag、1girl/solo、发色发型、眼睛、耳朵、尾巴等不分服装的特征;',
      '- 每组 triggerWords = **该组独有的内容**:该组形态触发 tag + 这套服装/形态的全部细节(不要把身份锚点重复写进组里,那会重复堆叠);',
      '- 每组 keywords = **该组独有的判别词**:英文形态触发 tag 放最前(保留下划线原样写法),后面附中文名/常见写法;',
      '- 基础 keywords = 「出现就应挂载该 LoRA」的全部判别词:所有角色/服装触发 tag + 各角色中文名;',
      '- title = 给人看的中文名,必须简洁可读(如「八奈见杏菜」「葬送的芙莉莲·菲伦」),禁止照抄英文文件名。',
      '',
      '【通用规则】',
      '1) 判别词只写有辨识度的词(形态触发 tag、角色名、中文名);**不要把 blue hair / school uniform 这类通用外貌词当作唯一判别词**(它们应出现在 triggerWords 用于注入);',
      '2) 所有 tag 保留下划线原样写法(如 yakishio_lemon、white_frilled_apron),那是 LoRA 训练口径;',
      '3) 从作者示例/C站资料里出现的词优先原样采用,不要擅自改写;',
      '4) keywords 与各组 keywords 之间不要重复;同一判别词只出现一次;',
      '5) 若用户给了「硬性要求」(角色数量/服装套数),以用户要求为准,即使与你的推断冲突。',
      extra ? `额外要求:${extra}` : '',
      '只输出 JSON。',
    ].filter(Boolean).join('\n');

    const note = (entry.aiNote || '').trim();
    const hint = (entry.aiHint || '').trim();
    const civ = entry.civitai || null;
    const civLines = civ
      ? [
          civ.name ? `C站模型名:${civ.name}` : '',
          civ.baseModel ? `底座:${civ.baseModel}` : '',
          (Array.isArray(civ.trainedWords) && civ.trainedWords.length)
            ? `官方触发词(必须原样保留写法):${civ.trainedWords.join(', ')}`
            : '',
          civ.tags ? `标签:${civ.tags}` : '',
        ].filter(Boolean).join('\n')
      : '';
    const user = [
      `LoRA 文件名:${entry.name || '(未填)'}`,
      hint ? `★ 用户对该 LoRA 的硬性要求(必须严格遵守,例如角色数量与服装套数):\n${hint}` : '',
      civLines,
      note ? `作者说明 / 示例提示词:\n${note}` : (civLines || hint ? '' : '(用户未提供作者说明;请依据文件名与你的知识推断角色与特征)'),
    ].filter(Boolean).join('\n');

    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }

  // 由 chat 接口地址推导 /models 候选地址(兼容 /v1/chat/completions、自定义路径、Ollama 等)
  function deriveAiModelsEndpoints(chatEndpoint) {
    const url = String(chatEndpoint || '').trim();
    if (!url) return [];
    const out = [];
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/+$/, '');
      const bases = [];
      if (/\/chat\/completions$/i.test(path)) bases.push(path.replace(/\/chat\/completions$/i, ''));
      else bases.push(path);
      bases.forEach(base => {
        out.push(`${u.origin}${base}/models`);
        const v1 = base.match(/^(.*\/v1)(\/.*)?$/i);
        if (v1 && v1[1]) out.push(`${u.origin}${v1[1]}/models`);
      });
    } catch (_) {
      out.push(`${url.replace(/\/+$/, '')}/models`);
    }
    return [...new Set(out)];
  }

  // 拉取可用模型名:GET /models(OpenAI 兼容 {data:[{id}]},也兼容 {data:{models:[{name}]}})
  async function fetchAiModelList() {
    const s = getSettings();
    const key = (s.comfyAiAssistKey || '').trim();
    const candidates = deriveAiModelsEndpoints(s.comfyAiAssistEndpoint);
    if (candidates.length === 0) throw new Error('未配置 AI 接口地址');
    let lastError = '';
    for (const url of candidates) {
      try {
        const res = await fetch(url, { headers: key ? { 'Authorization': `Bearer ${key}` } : {} });
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          continue;
        }
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data
          : Array.isArray(data?.data?.models) ? data.data.models
          : Array.isArray(data?.models) ? data.models
          : [];
        const names = list
          .map(m => (typeof m === 'string' ? m : (m?.id || m?.name || m?.model || '')))
          .map(n => String(n).trim())
          .filter(Boolean);
        if (names.length > 0) {
          cachedAiModels = names;
          return names;
        }
        lastError = '返回里没有模型名';
      } catch (err) {
        lastError = err.message;
      }
    }
    throw new Error(`获取模型列表失败(${candidates.join(' 或 ')}):${lastError || '未知错误'}`);
  }

  // 从模型列表里挑一个"像对话模型"的;挑不到就取第一个可用的
  function pickChatModel(models) {
    const list = Array.isArray(models) ? models : [];
    if (list.length === 0) return '';
    const prefer = /(chat|deepseek|gpt-4|gpt-3|qwen|glm|claude|llama|mimo|moonshot|abab|grok|gemini|doubao|hunyuan|ernie|yi-)/i;
    const skip = /(embed|rerank|whisper|tts|audio|speech|image|vision-encoder|moderation|dall|stable)/i;
    return list.find(m => prefer.test(m) && !skip.test(m)) || list.find(m => !skip.test(m)) || list[0];
  }

  // 解析 C 站模型页链接(也兼容粘贴整段含链接的文本)
  function parseCivitaiUrl(text) {
    const match = String(text || '').match(/civitai\.com\/models\/(\d+)/i);
    return match ? { id: match[1] } : null;
  }

  // 从任意文本里猜一个中文标题(C 站模型名 / 文件名里常带中文名)
  // 模型名常见结构是「作品丨角色」(如 丨金牌得主_狼嵜光),角色在最后一段,故优先取最后一段含中文的
  function guessCjkTitle(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const segments = raw
      .split(/[丨|/_\-–—,，·:：()（）\[\]【】]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const longestCjkRun = (s) => {
      const runs = s.match(/[\u4e00-\u9fa5]+/g) || [];
      return runs.length ? runs.reduce((best, cur) => (cur.length > best.length ? cur : best), '') : '';
    };
    // 从最后一段往前找:第一段里含「连续 ≥2 个汉字」的,就是角色名
    // (能自动跳过「負けヒロインが…」这类日语假名段,也避免取到作品名)
    const cjkSegments = segments.filter(s => /[\u4e00-\u9fa5]/.test(s));
    for (let i = cjkSegments.length - 1; i >= 0; i--) {
      const run = longestCjkRun(cjkSegments[i]);
      if (run.length >= 2) return run;
    }
    return longestCjkRun(raw);
  }

  // 抓取 C 站模型资料(公开 API):模型名 / 官方触发词 / 标签 / 底座 / 简介
  async function fetchCivitaiInfo(url) {
    const parsed = parseCivitaiUrl(url);
    if (!parsed) throw new Error('没识别出 C 站链接(形如 https://civitai.com/models/123456/xxx)');
    let res;
    try {
      res = await fetch(`https://civitai.com/api/v1/models/${parsed.id}`, { headers: { 'Accept': 'application/json' } });
    } catch (err) {
      throw new Error(`无法访问 Civitai 接口(${err.message});可改为手动粘贴模型页的触发词`);
    }
    if (!res.ok) throw new Error(`Civitai 接口返回 ${res.status}(链接是否正确/是否被墙)`);
    const data = await res.json();
    const versions = Array.isArray(data?.modelVersions) ? data.modelVersions : [];
    const trainedWords = [...new Set(
      versions
        .flatMap(v => (Array.isArray(v?.trainedWords) ? v.trainedWords : []))
        .map(w => String(w).trim())
        .filter(Boolean)
    )];
    const description = String(data?.description || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
    return {
      id: parsed.id,
      name: String(data?.name || '').trim(),
      titleGuess: guessCjkTitle(data?.name || ''),
      type: String(data?.type || '').trim(),
      baseModel: String(versions[0]?.baseModel || '').trim(),
      trainedWords,
      tags: (Array.isArray(data?.tags) ? data.tags : []).map(t => String(t)).join(', '),
      description,
      url: `https://civitai.com/models/${parsed.id}`,
    };
  }

  // 把抓到的资料汇成一段可读文本,写进「作者说明」(人和 AI 都能看/可编辑)
  function formatCivitaiNote(info) {
    const lines = [];
    if (info.name) lines.push(`模型名:${info.name}${info.baseModel ? ` (底座 ${info.baseModel})` : ''}`);
    if (info.type) lines.push(`类型:${info.type}`);
    if (info.trainedWords && info.trainedWords.length) lines.push(`官方触发词:${info.trainedWords.join(', ')}`);
    if (info.tags) lines.push(`标签:${info.tags}`);
    if (info.description) lines.push(`简介:${info.description}`);
    if (info.url) lines.push(`来源:${info.url}`);
    return lines.join('\n');
  }

  // 解析「文件名 → C 站地址」对照表:支持扫描脚本的 JSON、CSV,或纯文本行(文件名 => URL)
  function parseCivitaiMap(text) {
    const out = new Map();
    const raw = String(text || '').trim();
    if (!raw) return out;
    const addPair = (file, url) => {
      const u = String(url || '').trim();
      if (!file || !/civitai\.com\/models\//i.test(u)) return;
      const key = String(file).trim().replace(/\\/g, '/').replace(/^"|"$/g, '').toLowerCase();
      if (!key) return;
      out.set(key, u);
      const base = key.split('/').pop();
      if (base && !out.has(base)) out.set(base, u);
    };

    // 1) JSON 数组(扫描脚本输出)
    if (raw.startsWith('[') || raw.startsWith('{')) {
      try {
        const data = JSON.parse(raw);
        const list = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
        list.forEach(item => {
          if (!item) return;
          addPair(item.file || item.filename || item.name, item.url || item.civitaiUrl || item.link);
        });
        if (out.size > 0) return out;
      } catch (_) {}
    }

    // 2) CSV / 纯文本:逐行找 URL,左边当文件名
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/(https?:\/\/civitai\.com\/models\/[^\s"'|,]+)/i);
      if (!m) return;
      const url = m[1];
      const left = line.slice(0, m.index);
      let file = left.replace(/^\s*"|"\s*$/g, '').split(/"?\s*(?:=>|\||,|\t)\s*"?/).filter(Boolean).pop() || '';
      file = file.replace(/^"+|"+$/g, '').trim();
      if (!file || /^(文件名|file|name)$/i.test(file)) return;
      addPair(file, url);
    });
    return out;
  }

  /**
   * 文件名相似度打分(用于把对照表里的 C 站链接回填到每条 LoRA)
   * ★ 只保留「精确 / 去扩展名 / 前缀 / 包含」四类明确关系;
   *   刻意不做 token 重叠匹配 —— 同系列 LoRA(如 xxx-s1-illustriousxl-nochekaiser)会互相误配
   */
  function loraNameMatchScore(entryName, mapKey) {
    const a = String(entryName || '').replace(/\\/g, '/').toLowerCase().trim();
    const b = String(mapKey || '').replace(/\\/g, '/').toLowerCase().trim();
    if (!a || !b) return 0;
    const ab = a.split('/').pop();
    const bb = b.split('/').pop();
    if (a === b || ab === bb) return 100;
    const an = ab.replace(/\.safetensors$/i, '');
    const bn = bb.replace(/\.safetensors$/i, '');
    if (an === bn) return 95;
    if (an.length >= 8 && bn.length >= 8) {
      if (bn.startsWith(an) || an.startsWith(bn)) return 80;   // anna_yanami ↔ anna_yanami-makeine_…_30
      if (an.length >= 12 && bn.length >= 12 && (bn.includes(an) || an.includes(bn))) return 70;
    }
    return 0;
  }

  // 把对照表回填到各条 LoRA 的「C 站链接」(★ 每条取分数最高的唯一候选,避免误配)
  function applyCivitaiMap(map) {
    const loras = getSettings().comfyLoras || [];
    const entries = [...map.entries()];
    let applied = 0;
    const unmatched = [];

    loras.forEach(item => {
      const raw = String(item.name || '').trim();
      if (!raw) return;

      let bestUrl = '';
      let bestScore = 0;
      let secondScore = 0;
      for (const [k, v] of entries) {
        const score = loraNameMatchScore(raw, k);
        if (score > bestScore) {
          secondScore = bestScore;
          bestScore = score;
          bestUrl = v;
        } else if (score > secondScore) {
          secondScore = score;
        }
      }
      // 必须达到"明确关系"且唯一最优,才回填
      const accepted = bestUrl && bestScore >= 70 && bestScore > secondScore;
      if (accepted) {
        if ((item.civitaiUrl || '') !== bestUrl) {
          item.civitaiUrl = bestUrl;
          applied++;
        }
      } else if (!(item.civitaiUrl || '').trim()) {
        unmatched.push(String(raw).split('/').pop());
      }
    });

    if (applied > 0) saveSettings({ comfyLoras: loras });
    return { applied, unmatched };
  }

  // 解析「旧文件名 → 新文件名」重命名映射:支持 JSON 对象 {旧:新}、JSON 数组 [{from,to}],或每行「旧 => 新」
  function parseRenameMap(text) {
    const out = new Map();
    const raw = String(text || '').trim();
    if (!raw) return out;
    const add = (from, to) => {
      const f = String(from || '').trim().replace(/\\/g, '/').replace(/^"|"$/g, '').toLowerCase();
      const t = String(to || '').trim().replace(/\\/g, '/').replace(/^"|"$/g, '');
      if (!f || !t || f === t.toLowerCase()) return;
      out.set(f, t);
      const fb = f.split('/').pop();
      if (fb) out.set(fb, t);
    };
    if (raw.startsWith('{') || raw.startsWith('[')) {
      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          data.forEach(item => item && add(item.from || item.old || item.file, item.to || item.new || item.target));
        } else {
          Object.entries(data).forEach(([k, v]) => add(k, v));
        }
        if (out.size > 0) return out;
      } catch (_) {}
    }
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^(.*?)\s*(?:=>|->|\||\t)\s*(\S[^\t]*)$/);
      if (m) add(m[1], m[2]);
    });
    return out;
  }

  // 按重命名映射更新各条 LoRA 的文件名(改名后必须做这一步,否则条目会失联)
  function applyRenameMap(map) {
    const loras = getSettings().comfyLoras || [];
    let applied = 0;
    loras.forEach(item => {
      const name = String(item.name || '').replace(/\\/g, '/').toLowerCase();
      if (!name) return;
      const next = map.get(name) || map.get(name.split('/').pop());
      if (next && next !== item.name) {
        item.name = next;
        applied++;
      }
    });
    if (applied > 0) saveSettings({ comfyLoras: loras });
    return applied;
  }

  // 批量配置状态(串行执行,可随时停止)
  let loraBatchState = { running: false, stop: false };

  /** 为尚未建条目的 LoRA 建一条默认配置(角色 LoRA:启用但不常驻) */
  function createLoraEntry(fileName) {
    const loras = getSettings().comfyLoras || [];
    if (loras.some(item => String(item.name || '').trim().toLowerCase() === String(fileName).trim().toLowerCase())) {
      return false;
    }
    loras.push({
      id: `lora_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(fileName).trim(),
      strengthModel: 0.8,
      strengthClip: 0.8,
      keywords: '',
      triggerWords: '',
      variants: [],
      activeVariantId: '',
      enabled: true,
      alwaysOn: false,
    });
    saveSettings({ comfyLoras: loras });
    return true;
  }

  /**
   * 一键配置所有 LoRA:串行 逐个执行「抓 C 站资料 → AI 生成配置 → 写入」
   * @param {object} opts { createMissing, skipConfigured, fetchCivitai, onProgress, onFinish }
   */
  async function runLoraBatchConfig(opts = {}) {
    const { createMissing = false, skipConfigured = true, fetchCivitai = true, onProgress, onFinish } = opts;
    if (loraBatchState.running) return { ok: false, reason: '已在运行' };

    loraBatchState = { running: true, stop: false };
    const stats = { total: 0, created: 0, fetched: 0, configured: 0, skipped: 0, failed: 0, stopped: false };
    const errors = [];

    try {
      // 1) 需要时先为缺失的 LoRA 建条目
      if (createMissing) {
        const existing = new Set((getSettings().comfyLoras || []).map(i => String(i.name || '').trim().toLowerCase()));
        for (const name of cachedLoras || []) {
          if (!existing.has(String(name).trim().toLowerCase())) {
            if (createLoraEntry(name)) stats.created++;
          }
        }
      }

      const loras = getSettings().comfyLoras || [];
      stats.total = loras.length;

      // 2) 串行处理
      for (let idx = 0; idx < loras.length; idx++) {
        if (loraBatchState.stop) {
          stats.stopped = true;
          break;
        }
        const item = loras[idx];
        if (!item || !String(item.name || '').trim()) continue;
        if (!item.enabled) { stats.skipped++; continue; }
        if (skipConfigured && String(item.keywords || '').trim()) { stats.skipped++; continue; }

        const label = `[${idx + 1}/${loras.length}] ${item.name}`;
        if (onProgress) onProgress(`${label} · 处理中…`, stats);

        // 2a) 抓 C 站资料(有链接才抓)
        if (fetchCivitai && String(item.civitaiUrl || '').trim() && parseCivitaiUrl(item.civitaiUrl)) {
          try {
            const info = await fetchCivitaiInfo(item.civitaiUrl);
            const live = (getSettings().comfyLoras || [])[idx];
            if (live) {
              live.civitai = info;
              live.aiNote = formatCivitaiNote(info);
              if (!(live.title || '').trim()) {
                live.title = info.titleGuess || guessCjkTitle(live.name) || info.name || '';
              }
              if (!(live.keywords || '').trim() && info.trainedWords.length > 0) live.keywords = info.trainedWords.join(', ');
              if (!(live.triggerWords || '').trim() && info.trainedWords.length > 0) live.triggerWords = info.trainedWords.join(', ');
              saveSettings({ comfyLoras: getSettings().comfyLoras });
            }
            stats.fetched++;
          } catch (err) {
            errors.push(`${item.name} 抓取: ${err.message}`);
          }
          await new Promise(r => setTimeout(r, 300));
          if (loraBatchState.stop) { stats.stopped = true; break; }
        }

        // 2b) AI 生成配置
        try {
          if (onProgress) onProgress(`${label} · AI 生成中…`, stats);
          const live = (getSettings().comfyLoras || [])[idx];
          const cfg = await requestAiLoraConfig(live || item);
          applyAiLoraConfig(idx, cfg);
          stats.configured++;
        } catch (err) {
          stats.failed++;
          errors.push(`${item.name} AI: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 400));
      }
    } finally {
      loraBatchState.running = false;
    }

    const result = { ok: true, ...stats, errors };
    if (onFinish) onFinish(result);
    return result;
  }

  /**
   * 规范化 AI 对话接口地址:允许用户只填 base URL(几乎人人都少填 /chat/completions)
   *   https://api.deepseek.com              → https://api.deepseek.com/v1/chat/completions
   *   https://api.x.com/provider/v1         → https://api.x.com/provider/v1/chat/completions
   *   https://api.x.com/v1/chat/completions → 原样
   */
  function normalizeAiEndpoint(raw) {
    let url = String(raw || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (/\/chat\/completions$/i.test(url)) return url;
    if (/\/v\d+$/i.test(url)) return `${url}/chat/completions`;
    if (/^https?:\/\/[^/]+$/i.test(url)) return `${url}/v1/chat/completions`;
    return `${url}/chat/completions`;
  }

  /** 拿到最终要用的对话接口地址,并把补全结果写回设置(让用户看到真实地址) */
  function resolveAiEndpoint() {
    const raw = (getSettings().comfyAiAssistEndpoint || '').trim();
    const fixed = normalizeAiEndpoint(raw);
    if (fixed && fixed !== raw) saveSettings({ comfyAiAssistEndpoint: fixed });
    return fixed;
  }

  /** 最小对话请求探活:返回使用的模型名,失败抛错(跑批前先验一次,避免批量全失败) */
  async function pingAiEndpoint() {
    const endpoint = resolveAiEndpoint();
    if (!endpoint) throw new Error('未配置 AI 接口地址(设置面板 → 🤖 AI 辅助配置)');
    const key = (getSettings().comfyAiAssistKey || '').trim();
    if (!key) throw new Error('未配置 AI API Key');
    let model = (getSettings().comfyAiAssistModel || '').trim();
    if (!model) {
      const models = await fetchAiModelList().catch(() => []);
      model = pickChatModel(models);
      if (!model) throw new Error('拿不到模型名(点「🔄 获取模型列表」或手动填一个)');
      saveSettings({ comfyAiAssistModel: model });
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8, stream: false }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const hint = (res.status === 404 || /not a registered route|not found/i.test(detail))
        ? ' —— 接口地址可能不完整(应为 .../chat/completions)'
        : '';
      throw new Error(`对话接口返回 ${res.status}${detail ? ':' + detail.slice(0, 140) : ''}${hint}`);
    }
    return model;
  }

  /** 从 ComfyUI 拉取已发布的 C 站对照表(免粘贴,手机最省事) */
  async function fetchCivitaiMapFromComfy() {
    const host = getCleanComfyHost();
    if (!host) throw new Error('未配置 ComfyUI 地址');
    const url = `${host}/view?filename=${encodeURIComponent('_civitai_map.json')}&subfolder=${encodeURIComponent(LORA_PREVIEW_SUBFOLDER)}&type=input`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`ComfyUI 上没有对照表(HTTP ${res.status}) —— 需先在电脑上运行工具脚本发布`);
    const data = await res.json();
    const map = new Map();
    Object.entries(data || {}).forEach(([k, v]) => {
      if (typeof v !== 'string') return;
      const key = String(k).trim().replace(/\\/g, '/').toLowerCase();
      if (!key) return;
      map.set(key, v);
      const base = key.split('/').pop();
      if (base && !map.has(base)) map.set(base, v);
    });
    if (map.size === 0) throw new Error('对照表是空的');
    return map;
  }

  /** 预览「发给 AI 的默认提示词」,方便用户确认与按需追加要求 */
  function showAiPromptPreview() {
    const msgs = buildAiLoraMessages({ name: '(示例)某角色LoRA.safetensors', aiNote: '', aiHint: '' });
    const system = msgs.find(m => m.role === 'system')?.content || '';
    const overlay = document.createElement('div');
    overlay.className = 'sct-lora-picker-overlay';
    overlay.innerHTML = `
      <div class="sct-lora-picker-modal" style="width:min(94vw,780px);">
        <div class="sct-gallery-head">
          <span class="sct-gallery-title">🤖 发给 AI 的默认提示词(系统提示)</span>
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-aiprompt-close">✕</button>
        </div>
        <textarea class="text_pole sct-textarea-autowrap" rows="18" readonly style="font-size:12px; line-height:1.6;">${escapeHtml(system)}</textarea>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-aiprompt-copy">📋 复制这段提示词</button>
          <span class="sct-hint">想追加规则就写进上面的「额外要求」框 —— 会拼在这段末尾</span>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#sct-aiprompt-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#sct-aiprompt-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(system)
        .then(() => showToast('默认提示词已复制', 'success'))
        .catch(() => showToast('复制失败,可长按文本框手动复制', 'warning'));
    });
  }

  async function requestAiLoraConfig(entry) {
    const s = getSettings();
    const endpoint = resolveAiEndpoint();
    const key = (s.comfyAiAssistKey || '').trim();
    let model = (s.comfyAiAssistModel || '').trim();
    if (!endpoint) throw new Error('未配置 AI 接口地址(设置面板 → 🤖 AI 辅助配置)');
    if (!key) throw new Error('未配置 AI API Key(设置面板 → 🤖 AI 辅助配置)');
    if (!model) {
      // 没填模型名 → 自动从接口拉列表挑一个对话模型,省得手填
      const models = await fetchAiModelList();
      model = pickChatModel(models);
      if (!model) throw new Error('未配置模型名,且无法从接口获取模型列表(请在设置面板点「获取模型列表」)');
      saveSettings({ comfyAiAssistModel: model });
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: buildAiLoraMessages(entry), temperature: 0.2, stream: false }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const hint = (res.status === 404 || /not a registered route|not found/i.test(detail))
        ? ' —— 接口地址可能不完整,应以 /chat/completions 结尾(已在地址框自动补全,请再试)'
        : (res.status === 401 || res.status === 403 ? ' —— API Key 无效或没有权限' : '');
      throw new Error(`AI 接口返回 ${res.status}${detail ? ':' + detail.slice(0, 160) : ''}${hint}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
    const cfg = extractAiJson(content);
    if (!cfg) throw new Error('AI 返回无法解析为 JSON(可能被截断或格式不符)');
    return cfg;
  }

  /** 把 AI 结果写进指定 LoRA 条目(中文标题 / 激活词 / 特征词 / 分组) */
  function applyAiLoraConfig(idx, cfg) {
    const loras = getSettings().comfyLoras || [];
    const item = loras[idx];
    if (!item) return { variants: 0 };
    if (cfg.title) item.title = String(cfg.title).trim();
    if (cfg.keywords) item.keywords = String(cfg.keywords).trim();
    if (cfg.triggerWords) item.triggerWords = String(cfg.triggerWords).trim();
    let variantCount = 0;
    if (Array.isArray(cfg.variants) && cfg.variants.length > 0) {
      item.variants = cfg.variants.slice(0, 8).map((variant, i) => ({
        id: `var_${Date.now()}_${i}`,
        label: String((variant && variant.label) || `第 ${i + 1} 组`).trim(),
        keywords: String((variant && variant.keywords) || '').trim(),
        triggerWords: String((variant && variant.triggerWords) || '').trim(),
      }));
      item.activeVariantId = '';
      variantCount = item.variants.length;
    }
    saveSettings({ comfyLoras: loras });
    return { variants: variantCount };
  }

  /**
   * 按规格把一批输入填全:overrides 命中的键用我们的值,其余按官方默认补齐。
   * ★ 额外做「下拉候选校验」:overrides 里的字符串若不在该节点的候选列表里,就回落到规格默认值,
   *   避免像 weight_type:'standard' 这种写死的值让整个工作流校验失败(outputs failed validation)。
   */
  function fillSpecInputs(spec, overrides) {
    const inputs = {};
    Object.entries(spec || {}).forEach(([key, meta]) => {
      const choices = Array.isArray(meta) && Array.isArray(meta[0]) ? meta[0] : null;
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        const value = overrides[key];
        if (choices && typeof value === 'string' && !choices.includes(value)) {
          const opts = Array.isArray(meta) ? meta[1] : null;
          const fallbackDefault = (opts && typeof opts === 'object' && opts.default !== undefined)
            ? opts.default
            : choices[0];
          inputs[key] = fallbackDefault;
        } else {
          inputs[key] = value;
        }
      } else {
        inputs[key] = specDefault(meta, 0);
      }
    });
    return inputs;
  }

  /**
   * 按规格把 FaceDetailer 的必填输入填全:
   * 用户配置的参数优先,其余按官方默认值补齐,关键连线(image/model/clip/vae/检测器)显式接上。
   */
  function buildFaceDetailerInputs(spec, ctx) {
    const overrides = {
      image: ctx.imageRef,
      model: ctx.modelRef,
      clip: ctx.clipRef,
      vae: ctx.vaeRef,
      bbox_detector: ctx.detectorRef,
      positive: ctx.positiveRef,
      negative: ctx.negativeRef,
      seed: ctx.seed,
      steps: ctx.steps,
      cfg: ctx.cfg,
      sampler_name: ctx.sampler,
      scheduler: ctx.scheduler,
      denoise: ctx.denoise,
      guide_size: ctx.guideSize,
      guide_size_for: true,
      max_size: 1024,
      feather: ctx.feather,
      noise_mask: true,
      force_inpaint: true,
      bbox_threshold: ctx.bboxThreshold,
      bbox_dilation: 10,
      bbox_crop_factor: 3.0,
      sam_detection_hint: 'center-1',
      sam_dilation: 0,
      sam_threshold: 0.93,
      sam_bbox_expansion: 0,
      sam_mask_hint_threshold: 0.7,
      sam_mask_hint_use_negative: 'False',
      drop_size: 10,
    };
    const inputs = {};
    Object.entries(spec).forEach(([key, meta]) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        inputs[key] = overrides[key];
      } else {
        inputs[key] = specDefault(meta, 0);
      }
    });
    return inputs;
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
      faceFix,
      styleRef,
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

    // 2.5 画风参考 · IP-Adapter 模式:在 LoRA 链之后串接 IP-Adapter 节点改 model 链
    //     多张参考图 = 多个 IPAdapter 节点串联(每张各自权重),共用同一个 UnifiedLoader
    //     (排在文本编码之前,后面 KSampler 自然吃到带参考的 model)
    const styleRefList = styleRef && Array.isArray(styleRef.refs)
      ? styleRef.refs.filter(ref => ref && ref.filename)
      : [];
    if (styleRef && styleRef.mode === 'ipadapter' && styleRefList.length > 0 && styleRef.specs?.unifiedLoader && styleRef.specs?.apply) {
      workflow["401"] = {
        "class_type": "IPAdapterUnifiedLoader",
        "inputs": fillSpecInputs(styleRef.specs.unifiedLoader, {
          preset: styleRef.preset,
          model: currentModel
        })
      };
      let chainedModel = ["401", 0];
      styleRefList.forEach((ref, i) => {
        const loadId = String(410 + i);
        const applyId = String(420 + i);
        workflow[loadId] = { "class_type": "LoadImage", "inputs": { "image": ref.filename, "upload": "image" } };
        workflow[applyId] = {
          "class_type": styleRef.specs.applyClass,
          "inputs": fillSpecInputs(styleRef.specs.apply, {
            model: chainedModel,
            ipadapter: ["401", 1],
            image: [loadId, 0],
            weight: ref.weight,
            start_at: styleRef.start,
            end_at: styleRef.end,
            // weight_type 只在用户显式选了非空值时才覆盖(值会经候选校验,写错自动回落该节点默认)
            ...(styleRef.weightType ? { weight_type: styleRef.weightType } : {})
          })
        };
        chainedModel = [applyId, 0];
      });
      currentModel = chainedModel;
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

    // 4.5 画风参考 · 原生 unCLIP 模式(免插件,只需 CLIP Vision 模型)
    //     多张参考图时逐个串联 unCLIPConditioning(每张各自强度),叠加在正向条件上
    let positiveRef = ["6", 0];
    const styleRefImages = styleRef && Array.isArray(styleRef.refs)
      ? styleRef.refs.filter(ref => ref && ref.filename)
      : [];
    if (
      styleRef && styleRef.mode === 'native' && styleRefImages.length > 0 &&
      styleRef.specs?.clipVisionLoader && styleRef.specs?.clipVisionEncode && styleRef.specs?.unclip
    ) {
      workflow["401"] = {
        "class_type": "CLIPVisionLoader",
        "inputs": fillSpecInputs(styleRef.specs.clipVisionLoader, { clip_name: styleRef.clipVision })
      };
      let chainedCond = ["6", 0];
      styleRefImages.forEach((ref, i) => {
        const loadId = String(410 + i);
        const encodeId = String(430 + i);
        const unclipId = String(440 + i);
        workflow[loadId] = { "class_type": "LoadImage", "inputs": { "image": ref.filename, "upload": "image" } };
        workflow[encodeId] = {
          "class_type": "CLIPVisionEncode",
          "inputs": fillSpecInputs(styleRef.specs.clipVisionEncode, {
            clip_vision: ["401", 0],
            image: [loadId, 0],
            crop: "center"
          })
        };
        workflow[unclipId] = {
          "class_type": "unCLIPConditioning",
          "inputs": fillSpecInputs(styleRef.specs.unclip, {
            conditioning: chainedCond,
            clip_vision_output: [encodeId, 0],
            strength: ref.weight,
            noise_augmentation: 0
          })
        };
        chainedCond = [unclipId, 0];
      });
      positiveRef = chainedCond;
    }

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
        "positive": positiveRef,
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
          "positive": positiveRef,
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

    let finalImageRef = ["8", 0];

    // 9. 脸部修复 (FaceDetailer · Impact-Pack):拿解码后的图 → 检测脸部 → 小区域重采样 → 贴回
    //    spec 由运行时 /object_info 读取,faceted 参数按规格补齐,版本差异不影响出图
    if (faceFix && faceFix.enabled && faceFix.spec && faceFix.detector) {
      workflow["300"] = {
        "class_type": "UltralyticsDetectorProvider",
        "inputs": { "model_name": faceFix.detector }
      };
      workflow["301"] = {
        "class_type": "FaceDetailer",
        "inputs": buildFaceDetailerInputs(faceFix.spec, {
          imageRef: ["8", 0],
          modelRef: currentModel,
          clipRef: currentClip,
          vaeRef: currentVae,
          detectorRef: ["300", 0],
          positiveRef: positiveRef,
          negativeRef: ["7", 0],
          seed: seed + 7,
          steps: faceFix.steps || steps,
          cfg: faceFix.cfg || cfg,
          sampler: sampler,
          scheduler: scheduler,
          denoise: faceFix.denoise,
          guideSize: faceFix.guideSize,
          feather: faceFix.feather,
          bboxThreshold: faceFix.bboxThreshold
        })
      };
      finalImageRef = ["301", 0];
    }

    // 10. SaveImage (Node 9)
    workflow["9"] = {
      "class_type": "SaveImage",
      "inputs": {
        "filename_prefix": "SillyTavern",
        "images": finalImageRef
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
    // 按文件名去重兜底：即使上游重复塞入同一张图(哪怕时间戳不同)，也绝不会出现"同一张图连翻好几页"
    const normalizedImages = dedupeComfyImages(images);
    if (normalizedImages.length === 0) return;
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
    // ★ 优先用手机本地副本显示:服务器文件被删 / 隧道换址时,卡片里依然能看到图
    const currentSrc = localImageUrls.get(comfyFileKey(currentUrl)) || currentUrl;

    const loraBadgeHtml = activeLoras && activeLoras.length > 0 
      ? `<span class="sct-lora-badge" title="${escapeHtml(activeLoras.map(l => l.name).join(', '))}">🎭 LoRA: ${escapeHtml(activeLoras.map(l => l.name.replace(/\.[^/.]+$/, '')).join(', '))}</span>`
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
          <img src="${escapeHtml(currentSrc)}" alt="ComfyUI Image ${safeIdx + 1}" title="单击放大查看 · 长按开启局部重绘" />
          <div class="sct-comfy-img-error" style="display:none;"></div>
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
            <button type="button" class="sct-comfy-btn sct-retry-btn" title="重新生成并追加到轮播末尾">🔄 重新生成</button>
            <button type="button" class="sct-comfy-btn sct-style-ref-btn" title="把当前这张图设为画风参考(上传到 ComfyUI 后按设置里的参考模式生效)">🖼️ 用作画风参考</button>
            <button type="button" class="sct-comfy-btn sct-del-img-btn" title="只删除当前显示的这张 (共 ${total} 张)">✕ 删这张</button>
            <button type="button" class="sct-comfy-btn sct-btn-danger sct-clear-slot-btn" title="清空本槽位的全部图片">🗑️ 清空</button>
          ` : `
            <span style="font-size: 11px; opacity: 0.5;">长按重绘 · 点击放大</span>
            <button type="button" class="sct-comfy-btn sct-inpaint-btn" title="涂抹重绘当前画面 (或长按图片)">🖌️ 局部重绘</button>
            <button type="button" class="sct-comfy-btn sct-retry-btn">🔄 重新生成</button>
            <button type="button" class="sct-comfy-btn sct-style-ref-btn" title="把这张图设为画风参考">🖼️ 用作画风参考</button>
            <button type="button" class="sct-comfy-btn sct-del-img-btn" title="删除这张图片">✕ 删这张</button>
            <button type="button" class="sct-comfy-btn sct-btn-danger sct-clear-slot-btn" title="清空本槽位的全部图片">🗑️ 清空</button>
          `}
        </div>
      </div>
    `;

    const vp = container.querySelector(`#vp_${cardId}`);
    vp.addEventListener('click', (e) => e.stopPropagation());

    // 图片加载失败时给出明确原因与重试按钮(而不是留一片空白)
    const vpImg = vp.querySelector('img');
    const errBox = vp.querySelector('.sct-comfy-img-error');
    if (vpImg && errBox) {
      vpImg.addEventListener('error', () => {
        const tried = String(vpImg.getAttribute('src') || '');
        errBox.style.display = 'flex';
        errBox.innerHTML = `
          <div>⚠️ 图片加载失败</div>
          <div class="sct-comfy-img-error-url" title="${escapeHtml(tried)}">${escapeHtml(tried.slice(0, 110))}</div>
          <div class="sct-comfy-img-error-tip">多为 ComfyUI 地址不可达 / 隧道换址 / 该文件已被删除。${localImageUrls.size > 0 ? '（若已备份到手机本地,可点重试走本地副本）' : ''}</div>
          <button type="button" class="sct-comfy-btn sct-btn-xs sct-img-retry">🔄 重试</button>
        `;
        errBox.querySelector('.sct-img-retry')?.addEventListener('click', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          await loadLocalImageUrls();
          const local = localImageUrls.get(comfyFileKey(currentUrl));
          vpImg.setAttribute('src', local || `${currentUrl}${currentUrl.includes('?') ? '&' : '?'}r=${Date.now()}`);
          errBox.style.display = 'none';
        });
      });
      vpImg.addEventListener('load', () => {
        errBox.style.display = 'none';
      });
    }

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
        // 只清运行态:已生成的图保留在轮播里(新图会追加到末尾,前面的图仍可翻回去对比)
        if (tk) sctDrawingTasks.delete(tk);
        triggerComfyDraw(promptText, container, activeLoras, tk);
      });
    }

    // 只删当前这一张
    const delImgBtn = container.querySelector('.sct-del-img-btn');
    if (delImgBtn) {
      delImgBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteCurrentImage(container, promptText, activeLoras);
      });
    }

    // 清空本槽位全部图片
    const clearSlotBtn = container.querySelector('.sct-clear-slot-btn');
    if (clearSlotBtn) {
      clearSlotBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearSlotImages(container, promptText, activeLoras);
      });
    }

    // 把当前这张图设为画风参考:取图 → 上传到 ComfyUI input → 记下文件名
    const styleRefBtn = container.querySelector('.sct-style-ref-btn');
    if (styleRefBtn) {
      styleRefBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const settingsNow = getSettings();
          const refsNow = Array.isArray(settingsNow.comfyStyleRefImages) ? settingsNow.comfyStyleRefImages.slice() : [];
          if (refsNow.length >= 4) {
            showToast('参考图最多 4 张：请先到设置面板删掉一张再加', 'warning');
            return;
          }
          showToast('正在把当前图上传为画风参考…', 'info');
          const imgRes = await fetch(currentUrl);
          if (!imgRes.ok) throw new Error(`读取图片失败 (${imgRes.status})`);
          const blob = await imgRes.blob();
          const name = await uploadComfyInputImage(getCleanComfyHost(), blob, `styleref_${Date.now()}.png`);
          refsNow.push({
            id: `ref_${Date.now()}`,
            filename: name,
            weight: parseFloat(settingsNow.comfyStyleRefStrength) || 0.8
          });
          saveSettings({ comfyStyleRefImages: refsNow, comfyStyleRefImage: refsNow[0].filename });
          const mode = settingsNow.comfyStyleRefMode || 'off';
          showToast(
            mode === 'off'
              ? `已加入参考图(第 ${refsNow.length} 张)——还需到设置面板选择参考模式(IP-Adapter 或原生 unCLIP)才会生效`
              : `已加入参考图(第 ${refsNow.length} 张),当前模式:${mode === 'ipadapter' ? 'IP-Adapter' : '原生 unCLIP'}`,
            'success'
          );
        } catch (err) {
          showToast(`设为画风参考失败: ${err.message}`, 'error');
        }
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

      // 注入 LoRA 特征词 (含通用角色关键词与激活词分组;重绘提示词优先,原图画面前缀兜底)
      const loraInjection = buildLoraTriggerInjection(activeLoras, {
        promptText: inpaintPrompt,
        fullText: promptText || ''
      });
      const fullPositivePrompt = applyPositiveExclusions(`${s.comfyFixedPositive || ''}${loraInjection}${inpaintPrompt}${s.comfyPromptSuffix || ''}`.trim());
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
                out.images.forEach((img, imgIdx) => {
                  const url = `${comfyHost}/view?filename=${encodeURIComponent(img.filename)}&type=${encodeURIComponent(img.type || 'output')}${img.subfolder ? '&subfolder=' + encodeURIComponent(img.subfolder) : ''}&t=${Date.now()}_${imgIdx}`;
                  resultImages.push(url);
                });
              }
            });

            if (resultImages.length > 0) {
              // 保留原图基底 + 只保留最新一张重绘图：原图始终可见，反复重绘也绝不累积重复页
              const state = cardStateMap.get(cardId);
              const tk = container?.dataset?.sctTaskKey || taskKey;
              const mesId = container?.dataset?.sctMesId || container?.closest('.mes')?.getAttribute('mesid');
              const slotIdx = container?.dataset?.sctSlotIdx || '0';
              const extraRec = (mesId !== undefined && mesId !== null) ? getChatMessageExtraImages(mesId, slotIdx) : null;
              const prevRepaintUrl = container.dataset.sctLastRepaintUrl || extraRec?.lastRepaintUrl || '';

              let baseImages = (state && Array.isArray(state.images)) ? state.images.slice() : [];
              if (prevRepaintUrl) {
                const prevKey = comfyFileKey(prevRepaintUrl);
                baseImages = baseImages.filter(u => comfyFileKey(u) !== prevKey); // 剔除上一次的重绘图，只留原图
              }
              const displayImages = dedupeComfyImages([...baseImages, ...resultImages]);

              container.dataset.sctLastRepaintUrl = resultImages[0];
              if (state) {
                state.images = displayImages;
                state.currentIdx = Math.max(0, displayImages.length - 1); // 自动跳到最新重绘图
              }
              renderCarouselCard(container, displayImages, inpaintPrompt, activeLoras);

              // 保存到持久化存储与酒馆消息 extra (含"上次重绘图"标记，刷新后继续按替换逻辑处理)
              if (tk) {
                sctDrawingTasks.set(tk, { status: 'completed', images: displayImages, prompt: inpaintPrompt, activeLoras: activeLoras });
                savePersistentTask(tk, { status: 'completed', images: displayImages, prompt: inpaintPrompt, activeLoras: activeLoras });
              }
              if (mesId !== undefined && mesId !== null) {
                saveChatMessageExtraImages(mesId, slotIdx, displayImages, inpaintPrompt, activeLoras, resultImages[0]);
              }

              showToast(`✨ 局部重绘成功！原图已保留，最新重绘图在第 ${displayImages.length} 页`, 'success');
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
            <button type="button" class="sct-cancel-draw-btn">🛑 中止此次生图并清空排队</button>
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
          <div class="sct-error-desc">${escapeHtml(err || '未能连接到 ComfyUI 服务')}</div>
          <div class="sct-error-btn-row">
            <button type="button" class="sct-comfy-btn sct-error-retry">🔄 重新尝试</button>
            <button type="button" class="sct-comfy-btn sct-btn-danger sct-error-clear">🛑 清空后台排队</button>
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

  // 取当前卡片已有的图(轮播状态 → 内存任务 → 消息 extra 依次兜底)
  // 用途:「重新生成」时把旧图留在轮播里供翻页对比,而不是被新图替换掉
  function collectExistingImages(container, taskKey) {
    const cardId = container?.dataset?.sctCardId;
    const fromState = cardId ? cardStateMap.get(cardId)?.images : null;
    if (fromState && fromState.length) return fromState.slice();
    const fromMemory = taskKey ? sctDrawingTasks.get(taskKey)?.images : null;
    if (fromMemory && fromMemory.length) return fromMemory.slice();
    const mesId = container?.dataset?.sctMesId || container?.closest('.mes')?.getAttribute('mesid');
    const slotIdx = container?.dataset?.sctSlotIdx || '0';
    const fromExtra = mesId !== undefined && mesId !== null ? getChatMessageExtraImages(mesId, slotIdx)?.images : null;
    if (fromExtra && fromExtra.length) return fromExtra.slice();
    return [];
  }

  // 把某槽位的图片列表写回三级缓存(内存 / localStorage / 消息 extra);空列表=清掉缓存
  function persistSlotImages(container, taskKey, images, promptText, activeLoras) {
    const mesId = container?.dataset?.sctMesId || container?.closest('.mes')?.getAttribute('mesid');
    const slotIdx = container?.dataset?.sctSlotIdx || '0';
    if (taskKey) {
      if (images.length === 0) {
        sctDrawingTasks.delete(taskKey);
        removePersistentTask(taskKey);
      } else {
        sctDrawingTasks.set(taskKey, { status: 'completed', images: images, prompt: promptText, activeLoras: activeLoras });
        savePersistentTask(taskKey, { status: 'completed', images: images, prompt: promptText, activeLoras: activeLoras });
      }
    }
    if (mesId !== undefined && mesId !== null) {
      if (images.length === 0) removeChatMessageExtraImages(mesId, slotIdx);
      else saveChatMessageExtraImages(mesId, slotIdx, images, promptText, activeLoras);
    }
  }

  // 图片被删光后的占位卡:给一颗「重新生成」,不做成死白板
  function renderClearedCard(container, promptText, activeLoras, taskKey) {
    if (!container) return;
    container.innerHTML = `
      <div class="sct-comfy-card sct-guide-card">
        <span class="sct-guide-text">🗑️ 本槽位的图片已清空</span>
        <div class="sct-guide-row">
          <button type="button" class="sct-comfy-btn sct-start-draw">🎨 重新生成</button>
        </div>
      </div>
    `;
    const btn = container.querySelector('.sct-start-draw');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerComfyDraw(promptText, container, activeLoras, taskKey || null);
      });
    }
  }

  // 清空本槽位全部图片(轮播状态 + 三级缓存一起清)
  function clearSlotImages(container, promptText, activeLoras) {
    const taskKey = container?.dataset?.sctTaskKey || '';
    const cardId = container?.dataset?.sctCardId;
    const state = cardId ? cardStateMap.get(cardId) : null;
    if (state) {
      state.images = [];
      state.currentIdx = 0;
    }
    persistSlotImages(container, taskKey, [], promptText, activeLoras);
    renderClearedCard(container, promptText, activeLoras, taskKey);
    showToast('已清空本槽位的全部图片', 'success');
  }

  // 只删除当前显示的那一张;删到空则等同清空
  function deleteCurrentImage(container, promptText, activeLoras) {
    const cardId = container?.dataset?.sctCardId;
    const state = cardId ? cardStateMap.get(cardId) : null;
    const images = state?.images || [];
    if (images.length === 0) return;

    const idx = Math.max(0, Math.min(state.currentIdx ?? 0, images.length - 1));
    const next = images.filter((_, i) => i !== idx);
    const taskKey = container?.dataset?.sctTaskKey || '';

    if (next.length === 0) {
      if (state) {
        state.images = [];
        state.currentIdx = 0;
      }
      persistSlotImages(container, taskKey, [], promptText, activeLoras);
      renderClearedCard(container, promptText, activeLoras, taskKey);
      showToast('已删除该槽位的最后一张图片', 'info');
      return;
    }

    if (state) {
      state.images = next;
      state.currentIdx = Math.max(0, Math.min(idx, next.length - 1));
    }
    persistSlotImages(container, taskKey, next, promptText, activeLoras);
    renderCarouselCard(container, next, promptText, activeLoras);
    showToast(`已删除这一张(还剩 ${next.length} 张)`, 'success');
  }

  // 触发 ComfyUI 生图任务 (带唯一 taskKey 去重锁与活跃 DOM 动态绑定)
  async function triggerComfyDraw(promptText, container, explicitActiveLoras = null, taskKey = null) {
    const s = getSettings();
    if (!s.comfyEnabled) {
      showToast('ComfyUI 绘图功能未开启', 'warning');
      return;
    }

    // 记下本轮之前已有的图:「重新生成」时它们会留在轮播里(可翻回去对比),而不是被新图顶掉
    const previousImages = collectExistingImages(container, taskKey);

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

    // 确定启用的 LoRA 列表与特征词注入 (常驻全量 + 至多 1 个动态角色，链式加载上限 4 个)
    const mesTextForLora = container.closest('.mes')?.querySelector('.mes_text')?.textContent || '';
    const activeLoras = (explicitActiveLoras ? explicitActiveLoras.slice(0, 4) : detectActiveLoras(mesTextForLora, promptText));

    // 注入 LoRA 角色特征词到正向提示词中 (含通用常驻角色关键词与激活词分组)
    const loraInjection = buildLoraTriggerInjection(activeLoras, { promptText, fullText: mesTextForLora });
    
    // 组合正向提示词：固定质量词 + LoRA 角色特征词 + 提取的标签提示词 + 后缀，最后套用通用排除关键词
    const fullPositivePrompt = applyPositiveExclusions(`${s.comfyFixedPositive || ''}${loraInjection}${promptText}${s.comfyPromptSuffix || ''}`.trim());
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

    // 脸部修复:开启时先确保拿到 FaceDetailer 的输入规格(没装 Impact-Pack 就跳过并提示,不让整张图失败)
    let faceFix = null;
    if (s.comfyFaceFixEnabled) {
      if (!cachedFaceDetailerSpec) {
        cachedFaceDetailerSpec = await fetchFaceDetailerSpec(comfyHost);
      }
      if (cachedFaceDetailerSpec) {
        faceFix = {
          enabled: true,
          spec: cachedFaceDetailerSpec,
          detector: (s.comfyFaceFixDetector || '').trim(),
          denoise: parseFloat(s.comfyFaceFixDenoise) || 0.5,
          guideSize: parseInt(s.comfyFaceFixGuideSize, 10) || 512,
          bboxThreshold: parseFloat(s.comfyFaceFixBboxThreshold) || 0.5,
          feather: parseInt(s.comfyFaceFixFeather, 10) || 5,
          steps: steps,
          cfg: cfg
        };
      } else {
        showToast('未检测到 FaceDetailer 节点：脸部修复已跳过（需安装 ComfyUI-Impact-Pack 与 Ultralytics 检测模型）', 'warning');
      }
    }

    // 画风参考:按模式收集节点规格(缺节点则整体跳过并提示,不让整张图失败)
    // 参考图 = 列表(最多 4 张,每张自带权重):一张定画风、一张定服装的玩法
    let styleRef = null;
    const styleRefMode = s.comfyStyleRefMode || 'off';
    const fallbackWeight = parseFloat(s.comfyStyleRefStrength) || 0.8;
    const styleRefList = (Array.isArray(s.comfyStyleRefImages) ? s.comfyStyleRefImages : [])
      .map((ref, index) => ({
        id: (ref && ref.id) || `ref_${index}`,
        filename: String((ref && ref.filename) || '').trim(),
        weight: Number.isFinite(Number(ref && ref.weight)) ? Number(ref.weight) : fallbackWeight
      }))
      .filter(ref => ref.filename)
      .slice(0, 4);
    if (styleRefMode !== 'off' && styleRefList.length > 0) {
      if (styleRefMode === 'ipadapter') {
        const unifiedLoader = await fetchNodeSpec(comfyHost, 'IPAdapterUnifiedLoader');
        const applyAdvanced = await fetchNodeSpec(comfyHost, 'IPAdapterAdvanced');
        const applySimple = applyAdvanced ? null : await fetchNodeSpec(comfyHost, 'IPAdapter');
        if (unifiedLoader && (applyAdvanced || applySimple)) {
          // 预设必须在节点给出的候选里,否则节点会因校验失败报错 —— 命中不了就回落到 PLUS / 第一个可用项
          const presetList = cachedIpAdapterPresets || [];
          const wantedPreset = (s.comfyStyleRefPreset || '').trim();
          let preset = wantedPreset;
          if (presetList.length > 0 && !presetList.includes(wantedPreset)) {
            preset = presetList.includes('PLUS (high strength)')
              ? 'PLUS (high strength)'
              : presetList[0];
            if (preset) saveSettings({ comfyStyleRefPreset: preset });
          }
          styleRef = {
            mode: 'ipadapter',
            refs: styleRefList,
            start: parseFloat(s.comfyStyleRefStart) || 0,
            end: parseFloat(s.comfyStyleRefEnd) || 1,
            preset: preset,
            weightType: (s.comfyStyleRefWeightType || '').trim(),
            specs: {
              unifiedLoader: unifiedLoader,
              apply: applyAdvanced || applySimple,
              applyClass: applyAdvanced ? 'IPAdapterAdvanced' : 'IPAdapter'
            }
          };
        } else {
          showToast('未检测到 IP-Adapter 节点：画风参考已跳过（需安装 ComfyUI_IPAdapter_plus 与 IPAdapter 模型）', 'warning');
        }
      } else if (styleRefMode === 'native') {
        const clipVisionLoader = await fetchNodeSpec(comfyHost, 'CLIPVisionLoader');
        const clipVisionEncode = await fetchNodeSpec(comfyHost, 'CLIPVisionEncode');
        const unclip = await fetchNodeSpec(comfyHost, 'unCLIPConditioning');
        if (clipVisionLoader && clipVisionEncode && unclip) {
          styleRef = {
            mode: 'native',
            refs: styleRefList,
            clipVision: (s.comfyStyleRefClipVision || '').trim(),
            specs: { clipVisionLoader: clipVisionLoader, clipVisionEncode: clipVisionEncode, unclip: unclip }
          };
          if (!styleRef.clipVision) {
            styleRef.clipVision = cachedClipVisionModels[0] || '';
            if (!styleRef.clipVision) {
              showToast('原生参考模式需要 CLIP Vision 模型：请在设置里选择或先扫描模型列表', 'warning');
              styleRef = null;
            }
          } else if (cachedClipVisionModels.length > 0 && !cachedClipVisionModels.includes(styleRef.clipVision)) {
            // 配的名字不在候选里(改名/删过文件) → 优先挑 ViT-H(IPAdapter 常用),否则取第一个
            const preferred = 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors';
            styleRef.clipVision = cachedClipVisionModels.includes(preferred) ? preferred : cachedClipVisionModels[0];
            saveSettings({ comfyStyleRefClipVision: styleRef.clipVision });
          }
        } else {
          showToast('未检测到 CLIP Vision 节点：画风参考已跳过', 'warning');
        }
      }
    }

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
      faceFix: faceFix,
      styleRef: styleRef,
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

            const newImages = foundImages.map((img) =>
              `${comfyHost}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}&t=${Date.now()}`
            );
            // 追加式合并:旧图在前、新图在后(同一文件只留一次),总张数上限 12
            const mergedImages = capCarouselImages(dedupeComfyImages([...previousImages, ...newImages]));

            if (taskKey) {
              sctDrawingTasks.set(taskKey, { status: 'completed', images: mergedImages, prompt: promptText, activeLoras: activeLoras });
              savePersistentTask(taskKey, { status: 'completed', images: mergedImages, prompt: promptText, activeLoras: activeLoras });
              const mesId = container.dataset.sctMesId || container.closest('.mes')?.getAttribute('mesid');
              const slotIdx = container.dataset.sctSlotIdx || '0';
              if (mesId !== undefined && mesId !== null) {
                saveChatMessageExtraImages(mesId, slotIdx, mergedImages, promptText, activeLoras);
              }
            }
            // 全新一轮生成：清空上一轮的重绘标记，避免后续重绘误剔除新图
            delete container.dataset.sctLastRepaintUrl;

            const target = getActiveCardContainer(taskKey, container);
            // 自动定位到「本轮新图的第一张」:新图在末尾,往前翻就是之前生成的图
            const idxCardId = target?.dataset?.sctCardId || container.dataset.sctCardId;
            const idxState = idxCardId ? cardStateMap.get(idxCardId) : null;
            if (idxState) {
              idxState.currentIdx = Math.max(0, mergedImages.length - newImages.length);
            }
            renderCarouselCard(target, mergedImages, promptText, activeLoras);
            // ★ 出图后立刻把图片本体存进手机本地:以后服务器 output 被清理也不影响查看与删除
            cacheImagesToPhone(newImages.map(u => ({
              url: u,
              prompt: promptText,
              loras: (activeLoras || []).map(l => l.name).filter(Boolean),
            }))).then(async (r) => {
              if (r.saved > 0) {
                console.log(`[${DISPLAY_NAME}] 已保存 ${r.saved} 张到手机本地图库`);
                await ensurePersistentStorage();
                // 存好本地副本后重渲染一次:卡片改用本地副本显示,服务器之后怎样都不影响
                await loadLocalImageUrls();
                const card = getActiveCardContainer(taskKey, container);
                if (card && card.isConnected) renderCarouselCard(card, mergedImages, promptText, activeLoras);
              }
            }).catch(() => {});
            const historyCount = mergedImages.length - newImages.length;
            showToast(
              `ComfyUI 绘图成功！${activeLoras.length > 0 ? `(已加载 ${activeLoras.length} 个 LoRA)` : ''}${historyCount > 0 ? ` · 轮播保留历史 ${historyCount} 张,可往前翻` : ''}`,
              'success'
            );
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
              <div class="sct-comfy-card sct-guide-card">
                <span class="sct-guide-text">🎨 检测到绘画提示词: <i>${escapeHtml(item.prompt.slice(0, 35))}...</i></span>
                <div class="sct-guide-row">
                  <button type="button" class="sct-comfy-btn sct-start-draw">立即开始生图</button>
                  ${s.comfyAutoDrawTags ? '' : '<button type="button" class="sct-comfy-btn sct-btn-xs sct-enable-autodraw" title="以后检测到生图标签就自动出图">🎨 开启自动生图</button>'}
                </div>
                ${s.comfyAutoDrawTags ? '' : '<div class="sct-guide-hint">自动生图当前<b>已关闭</b>:抽卡满意后再点上面的按钮 👍</div>'}
              </div>
            `;
            cardContainer.querySelector('.sct-start-draw').addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              triggerComfyDraw(item.prompt, cardContainer, activeLoras, taskKey);
            });
            cardContainer.querySelector('.sct-enable-autodraw')?.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              saveSettings({ comfyAutoDrawTags: true });
              updateAutoDrawToggle(true);
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

  // 自动生图浮动开关:正文抽卡时不想立刻出图,一键关掉,满意后再手动点「立即开始生图」
  let autoDrawToggleEl = null;

  function updateAutoDrawToggle(notify) {
    const s = getSettings();
    const on = !!s.comfyAutoDrawTags;
    if (autoDrawToggleEl && autoDrawToggleEl.isConnected) {
      autoDrawToggleEl.style.display = s.comfyEnabled ? 'flex' : 'none';
      autoDrawToggleEl.classList.toggle('is-on', on);
      autoDrawToggleEl.classList.toggle('is-off', !on);
      // 内联色兜底(CSS 未刷新时也能看出开关状态)
      autoDrawToggleEl.style.borderColor = on ? '#76ABAE' : '#D9B358';
      autoDrawToggleEl.style.color = on ? '#76ABAE' : '#D9B358';
      autoDrawToggleEl.innerHTML = `<span>🎨</span><span>自动生图</span><b>${on ? '开' : '关'}</b>`;
      autoDrawToggleEl.title = on
        ? '正文出现 <image> 标签会立刻生图。点一下关闭 —— 抽卡满意后再手动点「立即开始生图」'
        : '已关闭自动生图:正文的 <image> 标签只显示「立即开始生图」按钮,满意后再点';
    }
    // 同步设置面板里的同名勾选框
    const cb = document.getElementById('sct-cfg-auto-draw');
    if (cb) cb.checked = on;
    if (notify) {
      showToast(
        on
          ? '已开启自动生图:检测到正文生图标签会立刻出图'
          : '已关闭自动生图:抽卡时只显示「立即开始生图」,满意后再点',
        on ? 'success' : 'info'
      );
    }
    updateWandAutoDrawLabel();
  }

  function getAutoDrawToggle() {
    if (autoDrawToggleEl && autoDrawToggleEl.isConnected) return autoDrawToggleEl;
    const btn = document.createElement('div');
    btn.id = 'sct-autodraw-toggle';
    btn.className = 'sct-autodraw-toggle';
    // 内联样式兜底:即使 style.css 没刷新到最新,开关也一定看得见、点得动
    btn.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:96px', 'z-index:2147483600',
      'display:flex', 'align-items:center', 'gap:6px', 'padding:7px 13px',
      'border-radius:999px', 'border:1px solid #686774', 'background:rgba(55,53,62,.92)',
      'color:#8E9392', 'font-size:12px', 'font-weight:600', 'line-height:1.4',
      'box-shadow:0 6px 20px rgba(0,0,0,.45)', 'cursor:pointer', 'user-select:none',
    ].join(';');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveSettings({ comfyAutoDrawTags: !getSettings().comfyAutoDrawTags });
      updateAutoDrawToggle(true);
    });
    (document.documentElement || document.body).appendChild(btn);
    autoDrawToggleEl = btn;
    updateAutoDrawToggle(false);
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
      // 搜索用索引:中文标题 + 激活词 + 特征词 + 文件名 + 分组名/组关键词
      card.dataset.search = [
        item.title || '',
        item.keywords || '',
        item.triggerWords || '',
        item.name || '',
        loraAllVariants(item).map(v => `${v.label || ''} ${v.keywords || ''}`).join(' '),
      ].join(' ').toLowerCase();
      // 是否配了激活词(用于「⚠️ 缺激活词」筛选:没激活词的条目永远不会被自动激活)
      const hasActivationWords = expandLoraTokens(item.keywords, 2).length > 0
        || loraVariantList(item).some(v => expandLoraTokens(v.keywords, 2).length > 0);
      card.dataset.hasKeywords = hasActivationWords ? '1' : '0';

      const kwText = (item.keywords || '').trim();
      const kwFirst = kwText.split(/[,，]/)[0].trim();
      // 三段式摘要:① 中文标题(看得懂) ② 英文激活 tag(实际挂载依据) ③ 文件名
      const titleText = (item.title || '').trim() || guessCjkTitle(item.name) || kwFirst || '';
      const displayTitle = titleText || '(未命名角色 · 点开配置)';
      const previewUrl = loraPreviewUrl(item);
      const previewThumb = previewUrl
        ? `<img class="sct-lora-thumb" src="${escapeHtml(previewUrl)}" alt="" loading="lazy" />`
        : `<span class="sct-lora-thumb is-placeholder">${item.previewOff ? '🚫' : '🖼️'}</span>`;
      const actTagHtml = kwFirst
        ? `<span class="sct-lora-acttag" title="激活依据:出现这个 tag 才挂载此 LoRA">🔑 ${escapeHtml(kwFirst)}</span>`
        : '<span class="sct-lora-acttag is-empty">🔑 未设置激活 tag</span>';
      const fileHtml = item.name
        ? `<span class="sct-lora-file" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`
        : '<span class="sct-lora-file is-empty">未设置 LoRA 文件</span>';

      // 分组计数:总数 + 其中空组数(空组=误点添加的残留,可一键清理)
      const variantTotal = loraAllVariants(item).length;
      const variantBlank = loraBlankVariants(item).length;
      const variantBadge = variantTotal
        ? '<span class="sct-badge-variants" title="激活词分组数' +
          (variantBlank ? ',其中 ' + variantBlank + ' 组还没填内容' : '') +
          '">' + variantTotal + ' 组激活词' +
          (variantBlank ? ' · ' + variantBlank + ' 空' : '') +
          '</span>'
        : '';

      card.innerHTML = `
        <!-- 表面层：中文标题 + 激活 tag + 文件名，点击整行展开/收起详情 -->
        <div class="sct-lora-summary-bar">
          <div class="sct-lora-summary-main">
            ${previewThumb}
            <div class="sct-lora-kw-display">
              <div class="sct-lora-title" title="中文标题(可展开修改)">${escapeHtml(displayTitle)}</div>
              <div class="sct-lora-subline">${actTagHtml}${fileHtml}</div>
            </div>
            ${item.alwaysOn ? '<span class="sct-badge-always" title="即使正文未匹配到关键词也会默认挂载">常驻</span>' : ''}
            ${variantBadge}
            ${!item.enabled ? '<span class="sct-badge-disabled">已停用</span>' : ''}
          </div>
          <div class="sct-lora-summary-action">
            <span class="sct-lora-chevron">${isExpanded ? '收起 ▲' : '详情 ▼'}</span>
          </div>
        </div>

        <!-- 详细配置层：点击后展开 -->
        <div class="sct-lora-detail-body" style="${isExpanded ? 'display:flex;' : 'display:none;'}">
          <div class="sct-setting-col sct-lora-preview">
            <label>角色预览图 <span style="font-size:11px; opacity:0.6;">(只用于识别角色,不影响出图)</span></label>
            <div class="sct-lora-preview-row">
              ${previewUrl
                ? `<img class="sct-lora-preview-img" src="${escapeHtml(previewUrl)}" alt="预览图" loading="lazy" />`
                : '<div class="sct-lora-preview-img is-placeholder">无预览图</div>'}
              <div class="sct-lora-preview-btns">
                <button type="button" class="sct-comfy-btn sct-btn-xs sct-lora-preview-pick" data-idx="${idx}">🖼️ 上传/更换预览图</button>
                <button type="button" class="sct-comfy-btn sct-btn-xs sct-lora-preview-toggle" data-idx="${idx}">${item.previewOff ? '👁️ 显示预览图' : '🚫 隐藏预览图'}</button>
                <input type="file" class="sct-lora-preview-file" data-idx="${idx}" accept="image/*" style="display:none;" />
              </div>
            </div>
            <div class="sct-hint">图片存在 ComfyUI 的 <code>input/${LORA_PREVIEW_SUBFOLDER}/</code>,同名上传会直接覆盖;批量同步可用 <code>tools/sync-lora-previews.js</code>。</div>
          </div>
          <div class="sct-setting-col">
            <label>角色标题 · 中文名 <span style="font-size:11px; opacity:0.6;">(只给人看,便于认出是哪位角色;AI 生成与 C 站抓取会自动填)</span></label>
            <input type="text" class="text_pole sct-lora-title-input" data-idx="${idx}" placeholder="如 八奈见杏菜 / 葬送的芙莉莲·菲伦" value="${escapeHtml(titleText)}" />
          </div>
          <div class="sct-setting-col">
            <label>角色激活关键词 <span style="font-size:11px; opacity:0.6;">(唯一激活依据 · 不写就不会自动激活;英文触发 tag 放最前)</span></label>
            <textarea class="text_pole sct-textarea-autowrap sct-lora-keywords" data-idx="${idx}" rows="2" placeholder="多个关键词用逗号隔开，如: 柚木凪, nagi, 银发">${escapeHtml(item.keywords || '')}</textarea>
          </div>

          <div class="sct-setting-col">
            <label>角色特征激活词 <span style="font-size:11px; opacity:0.6;">(挂载后注入正向提示词 · 绝不参与激活判定 · 宽屏多行自动换行)</span></label>
            <textarea class="text_pole sct-textarea-autowrap sct-lora-triggers" data-idx="${idx}" rows="3" placeholder="如: nagi, 1girl, silver hair, purple eyes, school uniform, white ribbon, looking at viewer, gentle smile">${escapeHtml(item.triggerWords || '')}</textarea>
          </div>

          <!-- AI 辅助:读文件名 + 作者说明 → 生成激活词/特征词/分组 -->
          <div class="sct-setting-col sct-lora-ai">
            <label>🤖 AI 自动配置 <span style="font-size:11px; opacity:0.6;">(可粘 C 站链接自动抓资料,再一键生成)</span></label>
            <input type="text" class="text_pole sct-lora-civitai" data-idx="${idx}" placeholder="粘贴 C 站链接:https://civitai.com/models/123456/xxx" value="${escapeHtml(item.civitaiUrl || '')}" />
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button type="button" class="sct-comfy-btn sct-btn-xs sct-lora-civitai-fetch" data-idx="${idx}">🌐 抓取 C 站资料</button>
              <button type="button" class="sct-comfy-btn sct-btn-xs sct-lora-aigen" data-idx="${idx}">🤖 生成配置(激活词/特征词/分组)</button>
            </div>
            <textarea class="text_pole sct-textarea-autowrap sct-lora-ainote" data-idx="${idx}" rows="3" placeholder="作者说明 / 示例提示词(抓取后会自动填这里,也可手改或直接手粘)">${escapeHtml(item.aiNote || '')}</textarea>
            <label class="sct-lora-aihint-label" style="font-size:12px; margin-top:2px;">✍️ 给 AI 的提醒 <span style="opacity:.6; font-size:11px;">(生成配置时会当作硬性要求;如「这个 LoRA 有 5 个角色」「每个角色 2 套服装」)</span></label>
            <textarea class="text_pole sct-textarea-autowrap sct-lora-aihint" data-idx="${idx}" rows="2" placeholder="例如:这个 LoRA 有 5 个角色:杏菜 / 知花 / 柠檬 / 佳树 / 梦子;其中杏菜与柠檬各有 2 套服装(校服 / 泳装)">${escapeHtml(item.aiHint || '')}</textarea>
            <label class="sct-lora-aihint-chat-label" style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
              <input type="checkbox" class="sct-lora-aihint-tochat" data-idx="${idx}" ${item.aiHintToChat ? 'checked' : ''} />
              同时<b>提醒聊天里的 AI</b>(让它写对角色触发 tag)
            </label>
            <div class="sct-hint">
              「🌐 抓取」调 Civitai 公开接口取<b>官方触发词/标签/简介</b>并填入下面的说明;「🤖 生成配置」再让 AI 据此产出激活词、特征词与分组。
              接口在设置面板 → 🤖 AI 辅助配置。
            </div>
          </div>

          <!-- 激活词分组:同一角色多套词(校服/泳装/便服…),出图时用其中一组 -->
          <div class="sct-setting-col sct-lora-variants">
            <label>激活词分组 <span style="font-size:11px; opacity:0.6;">(同一角色的多套激活词,出图时用哪一组)</span></label>
            ${loraAllVariants(item).length ? `
              <select class="text_pole sct-lora-variant-mode" data-idx="${idx}">
                <option value="" ${!item.activeVariantId ? 'selected' : ''}>🔄 自动(按图片 tag / 正文命中组关键词)</option>
                ${loraAllVariants(item).map(v => `<option value="${escapeHtml(v.id || '')}" ${item.activeVariantId === v.id ? 'selected' : ''}>${escapeHtml(v.label || '(未命名组)')}${v.keywords ? ` — ${escapeHtml(v.keywords.slice(0, 24))}` : ''}</option>`).join('')}
              </select>
            ` : ''}
            ${loraAllVariants(item).map((v, vi) => `
              <div class="sct-lora-variant${(v.keywords || v.triggerWords) ? '' : ' is-blank'}" data-vidx="${vi}">
                <div class="sct-lora-variant-head">
                  <span class="sct-lora-variant-no">第 ${vi + 1} 组</span>
                  <input type="text" class="text_pole sct-lora-variant-label" data-idx="${idx}" data-vidx="${vi}" placeholder="组名,如 校服" value="${escapeHtml(v.label || '')}" />
                  <button type="button" class="sct-lora-del-btn sct-lora-variant-del" data-idx="${idx}" data-vidx="${vi}" title="删除这一组">✕</button>
                </div>
                <input type="text" class="text_pole sct-lora-variant-kw" data-idx="${idx}" data-vidx="${vi}" placeholder="本组激活关键词(图片 tag/正文命中即选中本组),如 校服, school uniform" value="${escapeHtml(v.keywords || '')}" />
                <textarea class="text_pole sct-textarea-autowrap sct-lora-variant-tw" data-idx="${idx}" data-vidx="${vi}" rows="2" placeholder="本组特征激活词(选中本组时注入,不叠加基础词),如 nagi, school uniform, serafuku, white kneehighs">${escapeHtml(v.triggerWords || '')}</textarea>
              </div>
            `).join('')}
            <div class="sct-lora-variant-btns">
              <button type="button" class="sct-comfy-btn sct-btn-xs sct-lora-variant-add" data-idx="${idx}">➕ 添加一组激活词</button>
              ${variantBlank ? `<button type="button" class="sct-comfy-btn sct-btn-xs sct-lora-variant-clean" data-idx="${idx}" title="删掉所有还没填内容的空组">🧹 清理 ${variantBlank} 个空组</button>` : ''}
            </div>
            <div class="sct-hint">
              选中某组 → 只用那一组的特征词(避免校服词串进泳装图);选「自动」→ 按图片 tag 优先、正文次之匹配组关键词,都没命中就用上面的基础特征词。
            </div>
          </div>

          <div class="sct-setting-col">
            <label>选择或填入 LoRA 模型文件名</label>
            <div class="sct-lora-picker">
              <input type="text" class="text_pole sct-lora-name" data-idx="${idx}" placeholder="如 nagi_v1.safetensors (可直接手输)" value="${escapeHtml(item.name || '')}" />
              <input type="text" class="text_pole sct-lora-filter" data-idx="${idx}" placeholder="🔍 搜索 LoRA 文件名… (输入即筛选)" value="" autocomplete="off" />
              <div class="sct-lora-options" data-idx="${idx}"></div>
            </div>
            <div class="sct-hint sct-lora-picker-hint">
              ${cachedLoras && cachedLoras.length
                ? `共 ${cachedLoras.length} 个候选 · 点搜索框或输入关键词筛选,点条目即选中`
                : '尚未扫描到 LoRA 列表 —— 点上方「📡 测试 ComfyUI 连接与扫描全部模型」拉取,或直接手输文件名'}
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
              <button type="button" class="sct-lora-del-btn sct-lora-card-del" data-idx="${idx}">✕ 删除</button>
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

      // 实时响应关键词输入并同步到表面展示(仅更新副行里的激活 tag,保留中文标题与文件名)
      const kwInput = card.querySelector('.sct-lora-keywords');
      const kwDisplay = card.querySelector('.sct-lora-kw-display');
      kwInput.addEventListener('input', (e) => {
        const val = e.target.value;
        loras[idx].keywords = val;
        const firstTag = val.split(/[,，]/)[0].trim();
        const tagEl = kwDisplay.querySelector('.sct-lora-acttag');
        if (tagEl) {
          tagEl.className = firstTag ? 'sct-lora-acttag' : 'sct-lora-acttag is-empty';
          tagEl.textContent = firstTag ? `🔑 ${firstTag}` : '🔑 未设置激活 tag';
          tagEl.title = firstTag ? '激活依据:出现这个 tag 才挂载此 LoRA' : '';
        }
        saveSettings({ comfyLoras: loras });
      });

      // 中文标题输入:实时同步到卡片表面
      const titleInput = card.querySelector('.sct-lora-title-input');
      titleInput?.addEventListener('input', (e) => {
        const val = e.target.value;
        loras[idx].title = val;
        const titleEl = kwDisplay.querySelector('.sct-lora-title');
        if (titleEl) titleEl.textContent = val.trim() || '(未命名角色 · 点开配置)';
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

      // LoRA 文件名搜索选择器:输入即筛选,点条目即选中(mousedown 先于 blur,避免列表被先收起)
      const pickerName = card.querySelector('.sct-lora-name');
      const pickerFilter = card.querySelector('.sct-lora-filter');
      const pickerOptions = card.querySelector('.sct-lora-options');

      const pickLoraName = (picked) => {
        pickerName.value = picked;
        loras[idx].name = picked;
        saveSettings({ comfyLoras: loras });
        pickerOptions.classList.remove('is-open');
        pickerFilter.value = '';
      };

      const renderLoraOptions = (keyword = '') => {
        if (!pickerOptions) return;
        const kw = keyword.trim().toLowerCase();
        const matched = (cachedLoras || [])
          .filter(name => !kw || name.toLowerCase().includes(kw))
          .slice(0, 200);
        if (matched.length === 0) {
          pickerOptions.innerHTML = `<div class="sct-lora-option is-empty">${
            (cachedLoras && cachedLoras.length) ? '没有匹配的 LoRA' : '尚未扫描到 LoRA 列表'
          }</div>`;
        } else {
          // 顶部加一行说明 + 每行保留完整文件名(超出换行,不再截断成看不清的一坨)
          const head = `<div class="sct-lora-options-head">${
            kw ? `匹配到 ${matched.length} 个(输入更多字符可继续筛选)` : `共 ${matched.length} 个 LoRA(输入关键词筛选)`
          } · 点一行即选中</div>`;
          pickerOptions.innerHTML = head + matched
            .map(name => `<button type="button" class="sct-lora-option" data-name="${escapeHtml(name)}" title="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
            .join('');
          pickerOptions.querySelectorAll('.sct-lora-option[data-name]').forEach(btn => {
            btn.addEventListener('mousedown', (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              pickLoraName(btn.getAttribute('data-name') || '');
            });
          });
        }
        pickerOptions.classList.add('is-open');
      };

      if (pickerFilter && pickerOptions) {
        pickerFilter.addEventListener('focus', () => renderLoraOptions(pickerFilter.value));
        pickerFilter.addEventListener('input', () => renderLoraOptions(pickerFilter.value));
        pickerFilter.addEventListener('blur', () => {
          setTimeout(() => pickerOptions.classList.remove('is-open'), 150);
        });
        pickerFilter.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            pickerOptions.classList.remove('is-open');
            pickerFilter.blur();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const first = pickerOptions.querySelector('.sct-lora-option[data-name]');
            if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          }
        });
      }

      // ---- 角色预览图:上传/更换 与 显示/隐藏 ----
      const previewPickBtn = card.querySelector('.sct-lora-preview-pick');
      const previewFileInput = card.querySelector('.sct-lora-preview-file');
      if (previewPickBtn && previewFileInput) {
        previewPickBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!String(loras[idx].name || '').trim()) {
            showToast('先填 LoRA 文件名,预览图才好跟它绑定', 'warning');
            return;
          }
          previewFileInput.click();
        });
        previewFileInput.addEventListener('change', async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const btn = previewPickBtn;
          const originalText = btn.textContent;
          btn.disabled = true;
          btn.textContent = '⏳ 上传中…';
          try {
            const ext = (file.name.match(/\.[a-z0-9]+$/i) || ['.png'])[0].toLowerCase();
            const name = `${loraPreviewKey(loras[idx].name)}${ext}`;
            const saved = await uploadComfyInputImage(getCleanComfyHost(), file, name, LORA_PREVIEW_SUBFOLDER);
            const live = (getSettings().comfyLoras || [])[idx];
            if (live) {
              live.previewFile = saved || name;
              live.previewVer = Date.now();
              live.previewOff = false;
              saveSettings({ comfyLoras: getSettings().comfyLoras });
            }
            // ★ 同时存一份到手机本地(以后电脑关着/隧道换址也能显示)
            try {
              await putLocalPreview(loraPreviewKey(loras[idx].name), file);
              const u = loraPreviewLocalUrls.get(loraPreviewKey(loras[idx].name));
              if (u) URL.revokeObjectURL(u);
              loraPreviewLocalUrls.set(loraPreviewKey(loras[idx].name), URL.createObjectURL(file));
            } catch (_) {}
            renderLoraList(container);
            showToast('预览图已更新(并已存到手机本地)', 'success');
          } catch (err) {
            btn.disabled = false;
            btn.textContent = originalText;
            showToast(`预览图上传失败: ${err.message}`, 'error');
          } finally {
            e.target.value = '';
          }
        });
      }

      card.querySelector('.sct-lora-preview-toggle')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        loras[idx].previewOff = !loras[idx].previewOff;
        saveSettings({ comfyLoras: loras });
        renderLoraList(container);
        showToast(loras[idx].previewOff ? '已隐藏该角色的预览图' : '已显示预览图', 'info');
      });

      // ---- AI 自动配置:作者说明保存 + C 站抓取 + 一键生成 ----
      const aiNoteInput = card.querySelector('.sct-lora-ainote');
      if (aiNoteInput) {
        aiNoteInput.addEventListener('input', (e) => {
          loras[idx].aiNote = e.target.value;
          saveSettings({ comfyLoras: loras });
        });
      }

      // ✍️ 给 AI 的提醒:生成配置时作为硬性要求,可勾选同步提醒聊天里的 AI
      const aiHintInput = card.querySelector('.sct-lora-aihint');
      if (aiHintInput) {
        aiHintInput.addEventListener('input', (e) => {
          loras[idx].aiHint = e.target.value;
          saveSettings({ comfyLoras: loras });
        });
      }
      const aiHintChatBox = card.querySelector('.sct-lora-aihint-tochat');
      if (aiHintChatBox) {
        aiHintChatBox.addEventListener('change', (e) => {
          loras[idx].aiHintToChat = e.target.checked;
          saveSettings({ comfyLoras: loras });
          updateExtensionPrompt();
          showToast(
            e.target.checked
              ? '已开启:这条提醒会写进聊天上下文,让聊天里的 AI 也遵守'
              : '已关闭:这条提醒只用于「🤖 生成配置」,不影响聊天',
            'info'
          );
        });
      }

      const civitaiInput = card.querySelector('.sct-lora-civitai');      if (civitaiInput) {
        civitaiInput.addEventListener('input', (e) => {
          loras[idx].civitaiUrl = e.target.value.trim();
          saveSettings({ comfyLoras: loras });
        });
      }

      const civitaiFetchBtn = card.querySelector('.sct-lora-civitai-fetch');
      if (civitaiFetchBtn) {
        civitaiFetchBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const urlInput = card.querySelector('.sct-lora-civitai');
          const url = (urlInput?.value || '').trim();
          if (!parseCivitaiUrl(url)) {
            showToast('请先在输入框粘贴 C 站模型链接(形如 civitai.com/models/123456/xxx)', 'warning');
            return;
          }
          const originalText = civitaiFetchBtn.textContent;
          civitaiFetchBtn.disabled = true;
          civitaiFetchBtn.textContent = '⏳ 抓取中…';
          try {
            const info = await fetchCivitaiInfo(url);
            loras[idx].civitaiUrl = url;
            loras[idx].civitai = info;
            loras[idx].aiNote = formatCivitaiNote(info);
            // 中文标题还空着 → 用模型名里的中文名打底(如「丨金牌得主_狼嵜光」)
            if (!(loras[idx].title || '').trim()) {
              loras[idx].title = info.titleGuess || guessCjkTitle(loras[idx].name) || info.name || '';
            }
            // 关键字还空着 → 顺手用官方触发词打底(有 AI 时也可能被覆盖)
            if (!(loras[idx].keywords || '').trim() && info.trainedWords.length > 0) {
              loras[idx].keywords = info.trainedWords.join(', ');
            }
            if (!(loras[idx].triggerWords || '').trim() && info.trainedWords.length > 0) {
              loras[idx].triggerWords = info.trainedWords.join(', ');
            }
            saveSettings({ comfyLoras: loras });
            renderLoraList(container);
            showToast(
              `已抓取「${info.name || info.id}」:官方触发词 ${info.trainedWords.length} 个,标签 ${info.tags ? '有' : '无'}${info.trainedWords.length ? '(已填入空的关键词)' : ''}`,
              'success'
            );
          } catch (err) {
            civitaiFetchBtn.disabled = false;
            civitaiFetchBtn.textContent = originalText;
            showToast(`抓取失败: ${err.message}`, 'error');
          }
        });
      }

      const aiGenBtn = card.querySelector('.sct-lora-aigen');
      if (aiGenBtn) {
        aiGenBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!loras[idx].name) {
            showToast('先填 LoRA 模型文件名,AI 才知道要配哪个', 'warning');
            return;
          }
          const originalText = aiGenBtn.textContent;
          aiGenBtn.disabled = true;
          aiGenBtn.textContent = '⏳ AI 生成中…';
          try {
            const cfg = await requestAiLoraConfig(loras[idx]);
            const { variants } = applyAiLoraConfig(idx, cfg);
            renderLoraList(container);
            showToast(
              `AI 配置完成:激活关键词 ${(cfg.keywords || '').split(/[,，]/).filter(Boolean).length} 个,特征词 ${(cfg.triggerWords || '').split(/[,，]/).filter(Boolean).length} 个${variants ? `,分组 ${variants} 组` : ''}`,
              'success'
            );
          } catch (err) {
            aiGenBtn.disabled = false;
            aiGenBtn.textContent = originalText;
            showToast(`AI 配置失败: ${err.message}`, 'error');
          }
        });
      }

      // ---- 激活词分组:切换用哪一组 / 增删改组 ----
      const variantMode = card.querySelector('.sct-lora-variant-mode');
      if (variantMode) {
        variantMode.addEventListener('change', (e) => {
          loras[idx].activeVariantId = e.target.value || '';
          saveSettings({ comfyLoras: loras });
        });
      }

      card.querySelectorAll('.sct-lora-variant-label').forEach(input => {
        input.addEventListener('input', (e) => {
          const vi = parseInt(e.target.getAttribute('data-vidx'), 10);
          if (!loras[idx].variants || !loras[idx].variants[vi]) return;
          loras[idx].variants[vi].label = e.target.value;
          saveSettings({ comfyLoras: loras });
        });
      });

      card.querySelectorAll('.sct-lora-variant-kw').forEach(input => {
        input.addEventListener('input', (e) => {
          const vi = parseInt(e.target.getAttribute('data-vidx'), 10);
          if (!loras[idx].variants || !loras[idx].variants[vi]) return;
          loras[idx].variants[vi].keywords = e.target.value;
          saveSettings({ comfyLoras: loras });
        });
      });

      card.querySelectorAll('.sct-lora-variant-tw').forEach(area => {
        area.addEventListener('input', (e) => {
          const vi = parseInt(e.target.getAttribute('data-vidx'), 10);
          if (!loras[idx].variants || !loras[idx].variants[vi]) return;
          loras[idx].variants[vi].triggerWords = e.target.value;
          saveSettings({ comfyLoras: loras });
        });
      });

      card.querySelectorAll('.sct-lora-variant-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const vi = parseInt(btn.getAttribute('data-vidx'), 10);
          if (!Array.isArray(loras[idx].variants)) loras[idx].variants = [];
          const removed = loras[idx].variants.splice(vi, 1)[0];
          // 删掉的正好是手动选中的那一组 → 清空选择,回落到自动匹配
          if (removed && removed.id && loras[idx].activeVariantId === removed.id) {
            loras[idx].activeVariantId = '';
          }
          saveSettings({ comfyLoras: loras });
          renderLoraList(container);
        });
      });

      const variantAddBtn = card.querySelector('.sct-lora-variant-add');
      if (variantAddBtn) {
        variantAddBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!Array.isArray(loras[idx].variants)) loras[idx].variants = [];
          loras[idx].variants.push({
            id: `var_${Date.now()}_${loras[idx].variants.length}`,
            label: `第 ${loras[idx].variants.length + 1} 组`,
            keywords: '',
            triggerWords: ''
          });
          saveSettings({ comfyLoras: loras });
          renderLoraList(container);
        });
      }

      const variantCleanBtn = card.querySelector('.sct-lora-variant-clean');
      if (variantCleanBtn) {
        variantCleanBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const kept = loraVariantList(loras[idx]); // 只留填过内容的组
          loras[idx].variants = kept;
          if (loras[idx].activeVariantId && !kept.some(v => v.id === loras[idx].activeVariantId)) {
            loras[idx].activeVariantId = '';
          }
          saveSettings({ comfyLoras: loras });
          renderLoraList(container);
          showToast('已清理空组', 'success');
        });
      }

      const strRange = card.querySelector('.sct-lora-strength');
      const strVal = card.querySelector('.sct-lora-str-val');
      strRange.addEventListener('input', (e) => {
        strVal.textContent = e.target.value;
        loras[idx].strengthModel = parseFloat(e.target.value);
        loras[idx].strengthClip = parseFloat(e.target.value);
        saveSettings({ comfyLoras: loras });
      });

      // 只认卡片底部那颗「✕ 删除」——变体行内的 ✕ 是另一套 class,绝不能被它抢到
      const cardDelBtn = card.querySelector('.sct-lora-card-del');
      if (cardDelBtn) {
        cardDelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          loras.splice(idx, 1);
          expandedLoraIndices.delete(idx);
          saveSettings({ comfyLoras: loras });
          renderLoraList(container);
        });
      }

      container.appendChild(card);
    });

    // 渲染完成后重新套用当前搜索关键词(增删/改名后筛选依然生效)
    applyLoraFilter(undefined, container);
  }

  /**
   * 把设置面板里的每个 .sct-settings-section 变成可折叠区块:
   *   - 标题可点,带「展开 ▼ / 收起 ▲」
   *   - 默认全部收起(面板一眼能看完),状态记在 localStorage,刷新后保持
   *   - 顶部插入一条工具条:全部展开 / 全部收起 + 各板块快速跳转(点一个开一个,其余自动收起)
   */
  function setupCollapsibleSections(container) {
    const sections = [...container.querySelectorAll('.sct-settings-section')];
    if (sections.length === 0) return;

    const STORE_KEY = 'sct_collapsed_sections_v2';
    let collapsed;
    let hasStored = false;
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        hasStored = true;
        collapsed = new Set(JSON.parse(raw));
      }
    } catch (_) {}
    if (!collapsed) collapsed = new Set();
    const persist = () => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify([...collapsed]));
      } catch (_) {}
    };

    const items = sections.map((section, i) => {
      const title = [...section.children].find(el => el.classList.contains('sct-settings-section-title'));
      if (!title) return null;

      // 标题之后的兄弟节点包进可折叠 body
      const body = document.createElement('div');
      body.className = 'sct-section-body';
      [...section.children].filter(el => el !== title).forEach(el => body.appendChild(el));
      section.appendChild(body);

      title.classList.add('sct-section-toggle');
      const chevron = document.createElement('span');
      chevron.className = 'sct-section-chevron';
      title.appendChild(chevron);

      const id = `sec_${i}`;
      section.dataset.sectionId = id;
      // 首次使用:默认全部收起
      if (!hasStored) collapsed.add(id);

      const apply = () => {
        const isCollapsed = collapsed.has(id);
        section.classList.toggle('collapsed', isCollapsed);
        body.style.display = isCollapsed ? 'none' : '';
        chevron.textContent = isCollapsed ? '▾' : '▴';
      };
      title.addEventListener('click', () => {
        if (collapsed.has(id)) collapsed.delete(id);
        else collapsed.add(id);
        persist();
        apply();
      });

      // 工具条用的短标签(去掉括号补充说明)
      const rawText = (title.textContent || '').replace(/展开 ▼|收起 ▲/g, '').replace(/[（(].*?[)）]/g, '').trim();
      return { section, title, body, apply, id, label: rawText || `板块 ${i + 1}` };
    }).filter(Boolean);

    // ---------------------------------------------------------------------
    // 渲染期合并:把源码里分散在不同位置的多个板块合成一个(不动源码顺序,避免搬标记出错)
    // 被合并进来的板块会变成容器里的子区块 ①②③…,容器标题显示合并后的名字
    // ---------------------------------------------------------------------
    const cleanSecLabel = (t) => String(t || '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || '未命名';
    const MERGE_GROUPS = [
      {
        emoji: '🎨',
        label: '出图设置(连接 · 提示词 · 高清 · 脸部 · 画风 · 配图交互)',
        keys: [
          'ComfyUI 服务连接与模型',
          '固定质量提示词与出图尺寸',
          '高清二次放大修复设置',
          '脸部修复',
          '画风参考',
          '自动配图指示与消息交互',
        ],
      },
    ];
    const removedIds = new Set();
    MERGE_GROUPS.forEach(group => {
      const found = [];
      group.keys.forEach(key => {
        const hit = items.find(x => !removedIds.has(x.id) && !found.includes(x) && x.label.includes(key));
        if (hit) found.push(hit);
      });
      if (found.length < 2) return;

      const container = found[0];
      const spans = [...container.title.querySelectorAll('span')];
      if (spans[0]) spans[0].textContent = group.emoji;
      if (spans[1]) spans[1].textContent = group.label;
      container.label = `${group.emoji} ${group.label}`;

      const wrapAsSub = (item, order) => {
        const sub = document.createElement('div');
        sub.className = 'sct-subsection';
        const head = document.createElement('div');
        head.className = 'sct-subsection-title';
        head.textContent = `${order} ${cleanSecLabel(item.label)}`;
        sub.appendChild(head);
        [...item.body.children].forEach(ch => sub.appendChild(ch));
        return sub;
      };

      const subBlocks = [wrapAsSub(container, '①')];
      const orders = ['②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
      found.slice(1).forEach((item, i) => {
        subBlocks.push(wrapAsSub(item, orders[i] || `(${i + 2})`));
        removedIds.add(item.id);
        item.section.remove();
      });

      container.body.innerHTML = '';
      subBlocks.forEach(b => container.body.appendChild(b));
    });
    // 合并后只保留“还存在于页面上”的板块(用于工具条与全局展开/收起)
    const liveItems = items.filter(it => !removedIds.has(it.id));

    const applyAll = (collapse) => {
      liveItems.forEach(it => {
        if (collapse) collapsed.add(it.id);
        else collapsed.delete(it.id);
        it.apply();
      });
      persist();
    };

    // 工具条已移除(板块已合并到 5 个,不需要额外按钮占位);展开/收起直接点板块标题
    if (hasStored) {
      liveItems.forEach(it => it.apply());   // 沿用上次的展开/收起状态
    } else {
      applyAll(true);                    // 首次使用:默认全部收起,面板一眼看完
    }
  }

  /* ==========================================================================
     🖼️ 生成图片管理:聚合「插件记录(全部聊天) / 当前聊天 / ComfyUI 输出历史」,
        支持搜索、大图查看、下载、复制提示词、设为角色预览图、删除记录
     ========================================================================== */
  let galleryOverlay = null;
  let galleryItems = [];
  let gallerySource = 'all';
  let galleryKeyword = '';
  let galleryEscHandler = null;
  let galleryLocalUrls = new Map();   // 本地图库 key → objectURL
  let galleryLocalEntries = [];       // 本地图库原始记录
  // 已在界面里隐藏的图(ComfyUI 没有删除文件的接口,只能隐藏)
  // ★ 必须持久化到 localStorage:否则刷新/更新插件后又会全部冒出来(用户已反馈过)
  const GALLERY_HIDDEN_KEY = 'sct_gallery_hidden_v1';
  const galleryHiddenKeys = new Set();

  function loadGalleryHidden() {
    try {
      const raw = localStorage.getItem(GALLERY_HIDDEN_KEY);
      if (!raw) return;
      JSON.parse(raw).forEach(k => { if (k) galleryHiddenKeys.add(k); });
    } catch (_) {}
  }

  function saveGalleryHidden() {
    try {
      localStorage.setItem(GALLERY_HIDDEN_KEY, JSON.stringify([...galleryHiddenKeys]));
    } catch (_) {}
  }

  /** 同步来源:插件 localStorage 记录 + 当前聊天消息 extra */
  function collectLocalGalleryItems(source) {
    const items = [];
    const seen = new Map();
    const add = (url, prompt, time, sourceLabel, chatLabel) => {
      const norm = normalizeComfyImageUrl(url);
      if (!norm) return;
      const key = comfyFileKey(norm);
      if (seen.has(key)) {
        const exist = seen.get(key);
        if (!exist.prompt && prompt) exist.prompt = prompt;
        if (!exist.sources.includes(sourceLabel)) exist.sources.push(sourceLabel);
        return;
      }
      const entry = { key, url: norm, prompt: prompt || '', time: time || 0, sources: [sourceLabel], chat: chatLabel || '' };
      seen.set(key, entry);
      items.push(entry);
    };

    if (source === 'all' || source === 'plugin') {
      const all = getPersistentTasks();
      Object.entries(all || {}).forEach(([taskKey, data]) => {
        (data?.images || []).forEach(url => add(url, data?.prompt, data?.updatedAt, '插件记录', taskKey));
      });
    }
    if (source === 'all' || source === 'chat') {
      const ctx = getSTContext();
      (ctx?.chat || []).forEach((mes, i) => {
        const slots = mes?.extra?.sct_images || {};
        Object.entries(slots).forEach(([slotIdx, d]) => {
          (d?.images || []).forEach(url => add(url, d?.prompt, d?.savedAt, '当前聊天', `消息 #${i} · 槽位 ${slotIdx}`));
        });
      });
    }
    return items;
  }

  /** 第三个同步来源:直接扫当前页面上已经渲染出来的 ComfyUI 图片(聊天里的图/轮播图) */
  function collectDomGalleryItems() {
    const items = [];
    const seen = new Set();
    document.querySelectorAll('#chat img, .sct-comfy-card-container img, .mes_text img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (!/\/view\?/.test(src)) return;
      const norm = normalizeComfyImageUrl(src);
      const key = comfyFileKey(norm);
      if (!key || seen.has(key)) return;
      seen.add(key);
      items.push({
        key,
        url: norm,
        prompt: img.getAttribute('title') || '',
        time: 0,
        sources: ['当前页面'],
        chat: '',
      });
    });
    return items;
  }

  /** 异步来源:ComfyUI /history 里的本次运行输出(带超时,不通也不会把界面卡死) */
  async function collectComfyHistoryItems(timeoutMs = 8000) {
    const host = getCleanComfyHost();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(`${host}/history`, controller ? { signal: controller.signal } : {});
      if (!res.ok) throw new Error(`ComfyUI /history 返回 ${res.status}`);
      const data = await res.json();
      const items = [];
      Object.values(data || {}).forEach(entry => {
        Object.values(entry?.outputs || {}).forEach(nodeOut => {
          (nodeOut?.images || []).forEach(img => {
            if (!img || !img.filename) return;
            const url = `${host}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
            items.push({
              key: comfyFileKey(url),
              url,
              prompt: (Array.isArray(nodeOut?.text) && nodeOut.text[0]) || '',
              time: 0,
              sources: ['ComfyUI 输出'],
              chat: '',
            });
          });
        });
      });
      return items;
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error(`读取超时(${Math.round(timeoutMs / 1000)}s),ComfyUI 可能连不上`);
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function closeImageGallery() {
    // 关窗时若还在全屏,先退出全屏,避免页面卡在全屏状态
    try {
      if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen?.();
    } catch (_) {}
    // 释放本地图的 objectURL,避免内存泄漏
    galleryLocalUrls.forEach(u => {
      try { URL.revokeObjectURL(u); } catch (_) {}
    });
    galleryLocalUrls = new Map();
    // 一次性清掉所有同类遮罩:避免连点两次叠出多层,旧层关不掉卡在最上面
    document.querySelectorAll('.sct-gallery-overlay').forEach(el => el.remove());
    if (galleryEscHandler) {
      document.removeEventListener('keydown', galleryEscHandler);
      galleryEscHandler = null;
    }
    galleryOverlay = null;
  }

  /** 打开图片管理界面 */
  async function openImageGallery() {
    closeImageGallery();

    const overlay = document.createElement('div');
    overlay.className = 'sct-gallery-overlay';
    overlay.innerHTML = `
      <div class="sct-gallery-modal">
        <div class="sct-gallery-head">
          <span class="sct-gallery-title">🖼️ 生成图片管理</span>
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-gallery-close">✕ 关闭</button>
        </div>
        <div class="sct-gallery-tools">
          <select id="sct-gallery-source" class="text_pole">
            <option value="all">全部来源</option>
            <option value="local">📱 手机本地保存(可删)</option>
            <option value="dom">当前页面上的图(必有效)</option>
            <option value="plugin">插件记录(含其它聊天)</option>
            <option value="chat">当前聊天</option>
            <option value="comfy">ComfyUI 输出历史</option>
          </select>
          <input type="text" id="sct-gallery-search" class="text_pole" placeholder="🔍 搜索提示词 / 来源 / 聊天" autocomplete="off" />
          <select id="sct-gallery-thumbsize" class="text_pole" title="缩略图大小">
            <option value="s">小图</option>
            <option value="m">中图</option>
            <option value="l">大图</option>
          </select>
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-gallery-fullscreen">⛶ 全屏</button>
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-gallery-view">📋 列表视图</button>
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-gallery-refresh">🔄 刷新</button>
          <span class="sct-gallery-count" id="sct-gallery-count"></span>
        </div>
        <div class="sct-gallery-tools sct-gallery-tools-row2">
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-gallery-backup">📱 备份当前显示的全部到手机</button>
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-gallery-hide-shown">🚫 隐藏当前显示的全部</button>
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-gallery-unhide">♻️ 恢复隐藏</button>
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-gallery-export">⬇️ 导出清单(给电脑端清理)</button>
          <span class="sct-gallery-count" id="sct-gallery-hidden-count"></span>
        </div>
        <div class="sct-gallery-grid" id="sct-gallery-grid"></div>
        <div class="sct-gallery-hint" id="sct-gallery-hint"></div>
        <div class="sct-gallery-status" id="sct-gallery-status"></div>
        <div class="sct-gallery-foot">
          <button type="button" class="sct-comfy-btn" id="sct-gallery-close-bottom">✕ 关闭图片管理</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    galleryOverlay = overlay;

    // 有些酒馆主题会给 body 加 transform/filter → 形成层叠上下文把弹窗压住。
    // 挂到 <html> 上并清掉自身会形成新层叠上下文的属性,是最稳的规避方式。
    overlay.style.transform = 'none';
    overlay.style.filter = 'none';

    // 再上一层保险:尝试进入浏览器全屏(top layer 天生高于页面里任何 z-index)
    const tryFullscreen = () => {
      try {
        if (document.fullscreenElement === overlay) return;
        const p = overlay.requestFullscreen?.({ navigationUI: 'hide' });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    };
    // 打开即尝试全屏(由点击触发,浏览器一般允许;失败也无副作用,还有手动 ⛶ 按钮)
    tryFullscreen();

    // 关闭通道先全部挂好:即使后面读取/渲染出任何异常,也一定能关掉
    overlay.addEventListener('click', (e) => e.stopPropagation());
    overlay.querySelector('#sct-gallery-close').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeImageGallery();
    });
    overlay.querySelector('#sct-gallery-close-bottom').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeImageGallery();
    });
    // 点背景关闭(点弹窗内部不关)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeImageGallery();
    });

    const sourceSel = overlay.querySelector('#sct-gallery-source');
    const searchInput = overlay.querySelector('#sct-gallery-search');
    const grid = overlay.querySelector('#sct-gallery-grid');
    const countEl = overlay.querySelector('#sct-gallery-count');
    const hintEl = overlay.querySelector('#sct-gallery-hint');
    const statusEl = overlay.querySelector('#sct-gallery-status');
    const refreshBtn = overlay.querySelector('#sct-gallery-refresh');

    // 读取手机本地图库(IndexedDB)并建好可直接显示的 objectURL
    const loadLocalLibrary = async () => {
      try {
        galleryLocalEntries = await getAllLocalImages();
      } catch (_) {
        galleryLocalEntries = [];
      }
      galleryLocalUrls.forEach(u => {
        try { URL.revokeObjectURL(u); } catch (_) {}
      });
      galleryLocalUrls = new Map();
      galleryLocalEntries.forEach(e => {
        if (!e || !e.key || !e.blob) return;
        try { galleryLocalUrls.set(e.key, URL.createObjectURL(e.blob)); } catch (_) {}
      });
    };

    // 各来源计数 + 图片加载成败统计 + 地址填错警告 —— 一眼看出「为什么看不到图」
    const counts = { plugin: 0, chat: 0, dom: 0, comfy: 0 };
    let imgOk = 0;
    let imgFail = 0;
    let firstCellSize = '-';
    let galleryView = 'grid';
    let autoSwitchedView = false;
    // 缩略图尺寸偏好(默认小图:一屏能看到更多张,且完整显示不裁切)
    const GALLERY_SIZE_KEY = 'sct_gallery_thumb_size';
    let galleryThumbSize = 's';
    try {
      const saved = localStorage.getItem(GALLERY_SIZE_KEY);
      if (saved === 's' || saved === 'm' || saved === 'l') galleryThumbSize = saved;
    } catch (_) {}
    const renderStatus = () => {
      if (!statusEl || !statusEl.isConnected) return;
      const hiddenCountEl = overlay.querySelector('#sct-gallery-hidden-count');
      if (hiddenCountEl) hiddenCountEl.textContent = galleryHiddenKeys.size ? `已隐藏 ${galleryHiddenKeys.size} 张` : '';
      // 手机本地图库用量(异步补一行,不阻塞)
      if (statusEl && statusEl.isConnected) {
        const localCount = galleryLocalEntries.length;
        const localSize = galleryLocalEntries.reduce((s, e) => s + (e.blob?.size || 0), 0);
        getLocalStorageEstimate().then(est => {
          if (!statusEl.isConnected) return;
          const base = statusEl.dataset.base || '';
          const quotaTxt = est && est.quota ? `,浏览器可用 ${(est.quota / 1073741824).toFixed(1)}GB` : '';
          const tip = `手机本地图库 ${localCount} 张 / ${(localSize / 1048576).toFixed(1)}MB${quotaTxt}`;
          statusEl.textContent = `${base}  |  ${tip}`;
        }).catch(() => {});
      }
      const host = getCleanComfyHost();
      const pageHost = (typeof location !== 'undefined' && location.hostname) || '';
      const parts = [];
      parts.push(`来源:插件记录 ${counts.plugin} · 当前聊天 ${counts.chat} · 当前页面 ${counts.dom} · ComfyUI 输出 ${counts.comfy}`);
      parts.push(`ComfyUI 地址 ${host || '(未配置)'}`);
      if (imgOk || imgFail) parts.push(`图片加载 成功 ${imgOk} / 失败 ${imgFail}`);
      parts.push(`首格尺寸 ${firstCellSize}`);
      if (document.fullscreenElement === overlay) parts.push('已进入浏览器全屏');
      // 决定性诊断:弹窗实际尺寸 + 屏幕中心最顶层是谁(能直接看出有没有被挡住)
      try {
        const rect = overlay.getBoundingClientRect();
        parts.push(`弹窗 ${Math.round(rect.width)}x${Math.round(rect.height)}@top${Math.round(rect.top)}`);
        const cx = Math.round(window.innerWidth / 2);
        const cy = Math.round(window.innerHeight / 2);
        const topEl = document.elementFromPoint(cx, cy);
        const cls = topEl ? String(typeof topEl.className === 'string' ? topEl.className : '').split(/\s+/).slice(0, 2).join('.') : '';
        const desc = topEl ? `${topEl.tagName.toLowerCase()}${cls ? '.' + cls : ''}` : '无';
        const isMine = !!(topEl && (topEl === overlay || overlay.contains(topEl)));
        parts.push(`屏心最上层 ${desc}${isMine ? '(是本弹窗 ✓)' : '(⚠️ 被它盖住了)'}`);
      } catch (_) {}
      parts.push(`代码版本 v${SCT_BUILD}`);
      if (/127\.0\.0\.1|localhost/i.test(host) && pageHost && !/^(127\.0\.0\.1|localhost)$/i.test(pageHost)) {
        parts.push(`⚠️ 地址填的是 127.0.0.1,但你正从 ${pageHost} 访问 —— 手机上这指向手机自己,图片必然加载不出来!请把 ComfyUI 地址改成电脑局域网 IP(如 http://192.168.1.6:8188)`);
      } else if (imgFail > 0 && imgOk === 0) {
        parts.push('⚠️ 全部图片加载失败:多半是 ComfyUI 地址/端口不对,或手机与电脑不在同一网络');
      } else if (firstCellSize === '0x0' || firstCellSize.endsWith('x0')) {
        parts.push('⚠️ 网格高度被压成 0(布局塌陷)—— 已自动切到列表视图显示');
      }
      const baseText = parts.join('  |  ');
      statusEl.dataset.base = baseText;
      statusEl.textContent = baseText;
    };

    const renderGridInner = () => {
      if (!grid.isConnected) return; // 遮罩已被关闭,不再做无谓渲染
      const kw = galleryKeyword.trim().toLowerCase();
      const list = galleryItems
        .filter(it => !galleryHiddenKeys.has(it.key))
        .filter(it => !kw || `${it.prompt} ${it.sources.join(' ')} ${it.chat}`.toLowerCase().includes(kw))
        .sort((a, b) => (b.time || 0) - (a.time || 0));

      countEl.textContent = `${list.length} 张 / 共 ${galleryItems.length} 张`;
      if (list.length === 0) {
        grid.innerHTML = '<div class="sct-gallery-empty">没有图片。换个来源或点「🔄 刷新」试试。</div>';
        return;
      }
      grid.innerHTML = list.map((it, i) => `
        <div class="sct-gallery-cell" data-key="${escapeHtml(it.key)}" data-idx="${i}">
          <div class="sct-gallery-cell-img">
            <img loading="lazy" src="${escapeHtml(galleryLocalUrls.get(it.key) || it.url)}" alt="" />
          </div>
          <div class="sct-gallery-cell-ops">
            <button type="button" class="sct-gallery-op" data-act="view" title="大图查看">🔍</button>
            <button type="button" class="sct-gallery-op" data-act="download" title="下载">⬇️</button>
            <button type="button" class="sct-gallery-op" data-act="prompt" title="复制提示词">📋</button>
            <button type="button" class="sct-gallery-op" data-act="lora" title="设为角色 LoRA 预览图">🖼️</button>
            <button type="button" class="sct-gallery-op is-danger" data-act="del" title="从记录里删除">🗑️</button>
          </div>
          <div class="sct-gallery-cell-info">
            <span class="sct-gallery-cell-src">${escapeHtml(it.sources.join(' / '))}</span>
            ${it.prompt ? `<span class="sct-gallery-cell-prompt" title="${escapeHtml(it.prompt)}">${escapeHtml(it.prompt)}</span>` : ''}
          </div>
        </div>
      `).join('');

      // 尺寸自检:网格塌陷时一眼能看出来(状态栏会显示「首格 0x0」)
      const firstCell = grid.querySelector('.sct-gallery-cell');
      if (firstCell) {
        const w = firstCell.offsetWidth;
        const h = firstCell.offsetHeight;
        firstCellSize = `${w}x${h}`;
        grid.classList.remove('is-collapsed');
        // 网格塌陷 → 自动切列表视图兜底(只切一次,避免来回跳)
        if (h < 30 && galleryView === 'grid' && !autoSwitchedView) {
          autoSwitchedView = true;
          galleryView = 'list';
          grid.classList.add('is-list');
          const viewBtn = overlay.querySelector('#sct-gallery-view');
          if (viewBtn) viewBtn.textContent = '▦ 网格视图';
          showToast('检测到网格布局异常,已自动切换为列表视图显示', 'info');
          renderGrid();
          return;
        }
        if (h < 30) grid.classList.add('is-collapsed');
      } else {
        firstCellSize = '-';
      }

      grid.querySelectorAll('.sct-gallery-cell').forEach(cell => {
        const key = cell.getAttribute('data-key');
        const item = galleryItems.find(x => x.key === key);
        // 统计图片能否真的加载出来(图裂还是空格子,一眼分清)
        const imgEl = cell.querySelector('img');
        if (imgEl) {
          imgEl.addEventListener('load', () => {
            imgOk++;
            renderStatus();
          });
          imgEl.addEventListener('error', () => {
            imgFail++;
            cell.classList.add('is-broken');
            renderStatus();
          });
        }
        if (!item) return;
        cell.querySelectorAll('.sct-gallery-op').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const act = btn.getAttribute('data-act');
            if (act === 'view') {
              openLightbox(item.url, item.prompt || '', [], null);
            } else if (act === 'download') {
              try {
                const res = await fetch(item.url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = decodeURIComponent((item.url.split('filename=')[1] || 'image.png').split('&')[0]);
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
              } catch (err) {
                // 跨域(如 cloudflare 隧道)取 blob 可能被 CORS 拦 —— 退化为直接在新标签打开,由浏览器保存
                showToast(`直接下载失败(${err.message}),改为在新标签打开图片`, 'warning');
                window.open(item.url, '_blank');
              }
            } else if (act === 'prompt') {
              if (!item.prompt) {
                showToast('这张图没有记录提示词', 'warning');
                return;
              }
              navigator.clipboard.writeText(item.prompt)
                .then(() => showToast('提示词已复制', 'success'))
                .catch(() => showToast('复制失败,请手动复制', 'warning'));
            } else if (act === 'lora') {
              openLoraPreviewPicker(item);
            } else if (act === 'del') {
              await deleteGalleryImage(item);
              renderGrid();
              renderStatus();
            }
          });
        });
      });
    };

    // 安全渲染包装:渲染出错只提示,绝不让窗口变成关不掉的死界面
    const renderGrid = () => {
      try {
        renderGridInner();
      } catch (err) {
        try {
          grid.innerHTML = `<div class="sct-gallery-empty">界面渲染出错:${escapeHtml(err?.message || String(err))}(可点「🔄 刷新」重试,或直接关闭)</div>`;
        } catch (_) {}
      }
    };

    const loadLocal = () => {
      gallerySource = sourceSel.value;
      loadGalleryHidden();

      // 📱 本地图库来源:直接列 IndexedDB 里的图(服务器删了也有)
      if (gallerySource === 'local') {
        galleryItems = galleryLocalEntries.map(e => ({
          key: e.key,
          url: e.url || '',
          prompt: e.prompt || '',
          time: e.savedAt || 0,
          sources: ['📱 手机本地'],
          chat: '',
          localOnly: true,
        }));
      } else {
        counts.plugin = collectLocalGalleryItems('plugin').length;
        counts.chat = collectLocalGalleryItems('chat').length;
        counts.dom = collectDomGalleryItems().length;
        galleryItems = collectLocalGalleryItems(gallerySource === 'comfy' ? 'plugin' : gallerySource);
        if (gallerySource === 'dom' || gallerySource === 'all') {
          const seen = new Set(galleryItems.map(i => i.key));
          collectDomGalleryItems().forEach(it => {
            if (seen.has(it.key)) return;
            seen.add(it.key);
            galleryItems.push(it);
          });
        }
        // 「全部来源」时把手机本地的图也并进来(服务器文件没了也能看到)
        if (gallerySource === 'all') {
          const seen = new Set(galleryItems.map(i => i.key));
          galleryLocalEntries.forEach(e => {
            if (!e || seen.has(e.key)) return;
            seen.add(e.key);
            galleryItems.push({
              key: e.key,
              url: e.url || '',
              prompt: e.prompt || '',
              time: e.savedAt || 0,
              sources: ['📱 手机本地'],
              chat: '',
              localOnly: true,
            });
          });
        }
        if (gallerySource === 'comfy') galleryItems = [];
      }

      imgOk = 0;
      imgFail = 0;
      if (gallerySource === 'local') hintEl.textContent = '这些图存在手机浏览器本地(IndexedDB):服务器删掉也不影响,点 🗑️ 可以真正删除。';
      else if (gallerySource === 'plugin') hintEl.textContent = '插件记录保存在浏览器 localStorage(每个聊天/角色分开);若为 0,说明这个浏览器里没有生图记录。';
      else if (gallerySource === 'chat') hintEl.textContent = '当前聊天记录保存在消息 extra 里;若为 0,说明本聊天没有带图记录。';
      else if (gallerySource === 'dom') hintEl.textContent = '「当前页面上的图」直接扫聊天里已渲染的图片,只要有图必然能看到。';
      else hintEl.textContent = `已显示本地记录(含手机本地图库 ${galleryLocalEntries.length} 张);正在读取 ComfyUI 输出历史…`;
      renderGrid();
      grid.scrollTop = 0;
      if (typeof overlay.scrollTop === 'number') overlay.scrollTop = 0;
      renderStatus();
    };

    const load = async () => {
      // ★ 先读手机本地图库(这样服务器图被删了也能正常显示),再同步渲染本地记录
      await loadLocalLibrary();
      loadLocal();
      if (gallerySource !== 'all' && gallerySource !== 'comfy') return;
      try {
        const comfyItems = await collectComfyHistoryItems();
        counts.comfy = comfyItems.length;
        const seen = new Set(galleryItems.map(i => i.key));
        comfyItems.forEach(it => {
          if (seen.has(it.key)) return;
          seen.add(it.key);
          galleryItems.push(it);
        });
        hintEl.textContent = 'ComfyUI 输出历史来自本次运行(/history),重启 ComfyUI 后会清空;插件记录与聊天记录长期保存。';
      } catch (err) {
        counts.comfy = 0;
        hintEl.textContent = `读取 ComfyUI 输出历史失败:${err.message}`;
      }
      renderGrid();
      renderStatus();
    };

    // 📱 把当前显示的图备份到手机本地(服务器文件删了也不怕)
    overlay.querySelector('#sct-gallery-backup')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalText = btn.textContent;
      const kw = galleryKeyword.trim().toLowerCase();
      const shown = galleryItems
        .filter(it => !galleryHiddenKeys.has(it.key))
        .filter(it => !kw || `${it.prompt} ${it.sources.join(' ')} ${it.chat}`.toLowerCase().includes(kw));
      const need = shown.filter(it => !galleryLocalUrls.has(it.key) && it.url);
      if (need.length === 0) {
        showToast('当前显示的图都已在手机本地(或没有可下载的地址)', 'info');
        return;
      }
      btn.disabled = true;
      btn.textContent = `⏳ 备份中 0/${need.length}…`;
      let done = 0;
      try {
        // 分批,便于显示进度
        for (const it of need) {
          const r = await cacheImagesToPhone([{ url: it.url, prompt: it.prompt }]);
          done += r.saved;
          btn.textContent = `⏳ 备份中 ${done}/${need.length}…`;
        }
        await loadLocalLibrary();
        renderGrid();
        renderStatus();
        showToast(`已备份 ${done} 张到手机本地(以后服务器删了也能看、能真删)`, done > 0 ? 'success' : 'warning');
      } catch (err) {
        showToast(`备份失败:${err.message}`, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    // 🚫 批量:隐藏当前筛选出来的全部图(持久化,刷新/更新插件后不会复活)
    overlay.querySelector('#sct-gallery-hide-shown')?.addEventListener('click', () => {
      const kw = galleryKeyword.trim().toLowerCase();
      const shown = galleryItems.filter(it => !galleryHiddenKeys.has(it.key))
        .filter(it => !kw || `${it.prompt} ${it.sources.join(' ')} ${it.chat}`.toLowerCase().includes(kw));
      if (shown.length === 0) {
        showToast('当前没有可隐藏的图', 'warning');
        return;
      }
      shown.forEach(it => galleryHiddenKeys.add(it.key));
      saveGalleryHidden();
      renderGrid();
      renderStatus();
      showToast(`已隐藏 ${shown.length} 张(永久生效;可点「♻️ 恢复隐藏」找回)`, 'success');
    });

    // ♻️ 恢复隐藏
    overlay.querySelector('#sct-gallery-unhide')?.addEventListener('click', () => {
      const n = galleryHiddenKeys.size;
      if (n === 0) {
        showToast('没有已隐藏的图', 'info');
        return;
      }
      galleryHiddenKeys.clear();
      saveGalleryHidden();
      renderGrid();
      renderStatus();
      showToast(`已恢复 ${n} 张隐藏的图`, 'success');
    });

    // ⬇️ 导出清单:给电脑端脚本用(手机端删不掉服务器文件,电脑端可以真删)
    overlay.querySelector('#sct-gallery-export')?.addEventListener('click', () => {
      const kw = galleryKeyword.trim().toLowerCase();
      const names = galleryItems
        .filter(it => !galleryHiddenKeys.has(it.key))
        .filter(it => !kw || `${it.prompt} ${it.sources.join(' ')} ${it.chat}`.toLowerCase().includes(kw))
        .map(it => {
          const m = it.url.match(/filename=([^&]*)/);
          return m ? decodeURIComponent(m[1]) : '';
        })
        .filter(Boolean);
      if (names.length === 0) {
        showToast('当前没有可导出的文件名', 'warning');
        return;
      }
      const text = names.join('\n');
      try {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `comfy-output-delete-list-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        showToast(`已导出 ${names.length} 个文件名:拿去电脑上执行 cleanup-comfy-output.js 即可真删`, 'success');
      } catch (err) {
        navigator.clipboard.writeText(text)
          .then(() => showToast(`已复制 ${names.length} 个文件名到剪贴板`, 'success'))
          .catch(() => showToast(`导出失败:${err.message}`, 'error'));
      }
    });

    sourceSel.addEventListener('change', load);
    // 缩略图尺寸:小/中/大,记住选择
    const sizeSel = overlay.querySelector('#sct-gallery-thumbsize');
    const applyThumbSize = () => {
      grid.classList.remove('size-s', 'size-m', 'size-l');
      grid.classList.add(`size-${galleryThumbSize}`);
      if (sizeSel) sizeSel.value = galleryThumbSize;
    };
    sizeSel?.addEventListener('change', (e) => {
      galleryThumbSize = e.target.value;
      try {
        localStorage.setItem(GALLERY_SIZE_KEY, galleryThumbSize);
      } catch (_) {}
      applyThumbSize();
    });
    applyThumbSize();
    // ⛶ 全屏开关:进全屏后由浏览器 top layer 渲染,任何页面 CSS/z-index 都盖不住
    const fsBtn = overlay.querySelector('#sct-gallery-fullscreen');
    const syncFsBtn = () => {
      if (fsBtn) fsBtn.textContent = document.fullscreenElement === overlay ? '⤡ 退出全屏' : '⛶ 全屏';
    };
    fsBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (document.fullscreenElement === overlay) await document.exitFullscreen();
        else await overlay.requestFullscreen?.({ navigationUI: 'hide' });
      } catch (err) {
        showToast(`切换全屏失败:${err.message}(浏览器可能不允许)`, 'warning');
      }
      syncFsBtn();
      renderStatus();
    });
    document.addEventListener('fullscreenchange', () => {
      syncFsBtn();
      try {
        renderStatus();
      } catch (_) {}
    });
    syncFsBtn();
    overlay.querySelector('#sct-gallery-view')?.addEventListener('click', (e) => {
      galleryView = galleryView === 'grid' ? 'list' : 'grid';
      grid.classList.toggle('is-list', galleryView === 'list');
      e.currentTarget.textContent = galleryView === 'list' ? '▦ 网格视图' : '📋 列表视图';
      renderGrid();
    });
    searchInput.addEventListener('input', (e) => {
      galleryKeyword = e.target.value;
      renderGrid();
    });
    refreshBtn.addEventListener('click', load);

    // Esc 关闭
    galleryEscHandler = (e) => {
      if (e.key === 'Escape') closeImageGallery();
    };
    document.addEventListener('keydown', galleryEscHandler);

    try {
      await load();
    } catch (err) {
      // 任何异常都要在界面里说出来,绝不静默卡在「读取中」
      grid.innerHTML = `<div class="sct-gallery-empty">读取失败:${escapeHtml(err?.message || String(err))}</div>`;
      hintEl.textContent = '可点「🔄 刷新」重试;若一直失败,先确认 ComfyUI 是否在线。';
    }
  }

  /** 从记录里删除某张图(localStorage 任务 + 当前聊天 extra + ★ 手机本地 IndexedDB) */
  async function deleteGalleryImage(item) {
    let removed = 0;
    const key = item.key;

    // ★ 手机本地图库:这里才是"真删"(服务器文件删不掉,手机上的能删)
    let localDeleted = false;
    try {
      if (galleryLocalUrls.has(key) || galleryLocalEntries.some(e => e.key === key)) {
        await deleteLocalImage(key);
        const u = galleryLocalUrls.get(key);
        if (u) {
          try { URL.revokeObjectURL(u); } catch (_) {}
          galleryLocalUrls.delete(key);
        }
        galleryLocalEntries = galleryLocalEntries.filter(e => e.key !== key);
        localDeleted = true;
      }
    } catch (_) {}

    try {
      const all = getPersistentTasks();
      let dirty = false;
      Object.keys(all).forEach(taskKey => {
        const data = all[taskKey];
        if (!Array.isArray(data?.images)) return;
        const next = data.images.filter(u => comfyFileKey(normalizeComfyImageUrl(u)) !== key);
        if (next.length !== data.images.length) {
          removed += data.images.length - next.length;
          if (next.length === 0) delete all[taskKey];
          else data.images = next;
          dirty = true;
        }
      });
      if (dirty) localStorage.setItem(SCT_STORAGE_KEY, JSON.stringify(all));
    } catch (_) {}
    try {
      const ctx = getSTContext();
      let dirty = false;
      (ctx?.chat || []).forEach(mes => {
        const slots = mes?.extra?.sct_images || {};
        Object.keys(slots).forEach(slotIdx => {
          const d = slots[slotIdx];
          if (!Array.isArray(d?.images)) return;
          const next = d.images.filter(u => comfyFileKey(normalizeComfyImageUrl(u)) !== key);
          if (next.length !== d.images.length) {
            removed += d.images.length - next.length;
            if (next.length === 0) delete slots[slotIdx];
            else d.images = next;
            dirty = true;
          }
        });
      });
      if (dirty && typeof ctx?.saveChatDebounced === 'function') ctx.saveChatDebounced();
    } catch (_) {}
    // ComfyUI 输出历史没有删除接口,只能在界面里隐藏(★ 持久化,刷新/更新插件后不再复活)
    if (removed > 0 || localDeleted) {
      // 记录来源也清干净了,不需要再隐藏;但服务器文件仍在,为避免 ComfyUI 历史再把它捞出来,仍加入隐藏列表
      galleryHiddenKeys.add(key);
      saveGalleryHidden();
      const parts = [];
      if (localDeleted) parts.push('已从手机本地删除(真删)');
      if (removed > 0) parts.push(`已清理 ${removed} 条记录`);
      if (!localDeleted && removed === 0) parts.push('已在界面隐藏');
      showToast(`${parts.join(',')}${localDeleted ? '' : ';ComfyUI 服务器上的文件不会被删'}`, 'success');
    } else {
      galleryHiddenKeys.add(key);
      saveGalleryHidden();
      showToast('该图来自 ComfyUI 输出历史,服务器上没有删除接口 —— 已在界面里永久隐藏(可点「♻️ 恢复隐藏」找回)', 'info');
    }
  }

  /** 选择一条角色 LoRA,把这张图设为它的预览图 */
  function openLoraPreviewPicker(item) {
    const loras = getSettings().comfyLoras || [];
    if (loras.length === 0) {
      showToast('还没有 LoRA 条目', 'warning');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'sct-lora-picker-overlay';
    overlay.innerHTML = `
      <div class="sct-lora-picker-modal">
        <div class="sct-gallery-head">
          <span class="sct-gallery-title">🖼️ 设为哪个角色的预览图</span>
          <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-lp-close">✕</button>
        </div>
        <input type="text" id="sct-lp-search" class="text_pole" placeholder="🔍 搜索角色(中文名 / 文件名)" autocomplete="off" />
        <div class="sct-lp-list" id="sct-lp-list"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    const listEl = overlay.querySelector('#sct-lp-list');
    const searchEl = overlay.querySelector('#sct-lp-search');
    const close = () => {
      document.removeEventListener('keydown', pickerEsc);
      overlay.remove();
    };
    const pickerEsc = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', pickerEsc);
    overlay.querySelector('#sct-lp-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    const render = () => {
      const kw = (searchEl.value || '').trim().toLowerCase();
      const rows = loras
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !kw || `${item.title || ''} ${item.name || ''}`.toLowerCase().includes(kw));
      listEl.innerHTML = rows.map(({ item, idx }) => {
        const thumb = loraPreviewUrl(item);
        return `<button type="button" class="sct-lp-item" data-idx="${idx}">
          ${thumb ? `<img src="${escapeHtml(thumb)}" loading="lazy" alt="" />` : '<span class="sct-lp-thumb-ph">🖼️</span>'}
          <span class="sct-lp-name">${escapeHtml((item.title || '').trim() || item.name || `条目 #${idx + 1}`)}</span>
          <span class="sct-lp-file">${escapeHtml(item.name || '')}</span>
        </button>`;
      }).join('') || '<div class="sct-gallery-empty">没有匹配的角色</div>';

      listEl.querySelectorAll('.sct-lp-item').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          const target = (getSettings().comfyLoras || [])[idx];
          if (!target) return;
          btn.disabled = true;
          try {
            const res = await fetch(item.url);
            const blob = await res.blob();
            const ext = (item.url.match(/filename=([^&]*)/) || [])[1] || '';
            const lower = decodeURIComponent(ext).toLowerCase();
            const useExt = lower.endsWith('.png') ? '.png' : (lower.endsWith('.webp') ? '.webp' : '.jpeg');
            const name = `${loraPreviewKey(target.name)}${useExt}`;
            const saved = await uploadComfyInputImage(getCleanComfyHost(), blob, name, LORA_PREVIEW_SUBFOLDER);
            target.previewFile = saved || name;
            target.previewVer = Date.now();
            target.previewOff = false;
            saveSettings({ comfyLoras: getSettings().comfyLoras });
            // ★ 同时存到手机本地预览库
            try {
              const pkey = loraPreviewKey(target.name);
              await putLocalPreview(pkey, blob);
              const oldU = loraPreviewLocalUrls.get(pkey);
              if (oldU) URL.revokeObjectURL(oldU);
              loraPreviewLocalUrls.set(pkey, URL.createObjectURL(blob));
            } catch (_) {}
            const liveList = document.getElementById('sct-lora-items-container');
            if (liveList) renderLoraList(liveList);
            showToast(`已设为「${(target.title || target.name || '').trim()}」的预览图`, 'success');
            close();
          } catch (err) {
            btn.disabled = false;
            showToast(`设置失败: ${err.message}`, 'error');
          }
        });
      });
    };
    searchEl.addEventListener('input', render);
    render();
  }

  /* ==========================================================================
     📱 图片本地保存(手机 IndexedDB)
     为什么要它:ComfyUI 的 output 目录被清理后,画廊里所有图都会变成「加载失败」。
     把图片本体存进浏览器 IndexedDB 后:①服务器删了也能看 ②能在手机上真正删除
     ========================================================================== */
  const LOCAL_IMG_DB = 'sct_comfy_images';
  const LOCAL_IMG_STORE = 'images';
  const LOCAL_PREVIEW_STORE = 'previews';
  let localImgDbPromise = null;

  function openLocalImageDb() {
    if (localImgDbPromise) return localImgDbPromise;
    localImgDbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }
      const req = indexedDB.open(LOCAL_IMG_DB, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOCAL_IMG_STORE)) {
          const store = db.createObjectStore(LOCAL_IMG_STORE, { keyPath: 'key' });
          store.createIndex('savedAt', 'savedAt');
        }
        // v2:LoRA 预览图也存本地(电脑重启/隧道换址后依然能显示)
        if (!db.objectStoreNames.contains(LOCAL_PREVIEW_STORE)) {
          const pv = db.createObjectStore(LOCAL_PREVIEW_STORE, { keyPath: 'key' });
          pv.createIndex('savedAt', 'savedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('打开本地图片库失败'));
    });
    return localImgDbPromise;
  }

  /* ---- LoRA 预览图本地缓存 ---- */
  let loraPreviewLocalUrls = new Map();   // loraPreviewKey → objectURL

  async function putLocalPreview(key, blob, extra = {}) {
    if (!key || !blob) return false;
    const db = await openLocalImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_PREVIEW_STORE, 'readwrite');
      tx.objectStore(LOCAL_PREVIEW_STORE).put({ key, blob, size: blob.size, savedAt: Date.now(), ...extra });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAllLocalPreviews() {
    const db = await openLocalImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_PREVIEW_STORE, 'readonly');
      const req = tx.objectStore(LOCAL_PREVIEW_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteLocalPreview(key) {
    const db = await openLocalImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_PREVIEW_STORE, 'readwrite');
      tx.objectStore(LOCAL_PREVIEW_STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  /** 读出全部本地预览图并建好可直接用的 objectURL(渲染时同步取用) */
  async function loadLoraPreviewCache() {
    try {
      const list = await getAllLocalPreviews();
      loraPreviewLocalUrls.forEach(u => {
        try { URL.revokeObjectURL(u); } catch (_) {}
      });
      loraPreviewLocalUrls = new Map();
      list.forEach(e => {
        if (!e || !e.key || !e.blob) return;
        try { loraPreviewLocalUrls.set(e.key, URL.createObjectURL(e.blob)); } catch (_) {}
      });
    } catch (_) {}
    return loraPreviewLocalUrls.size;
  }

  /** 把服务器上的一张预览图抓到本地(已存在则跳过) */
  async function cacheLoraPreviewFromServer(key, url) {
    if (!key || !url || loraPreviewLocalUrls.has(key)) return false;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const blob = await res.blob();
      if (!blob || blob.size < 1024) return false; // 太小多半是错误页
      await putLocalPreview(key, blob);
      loraPreviewLocalUrls.set(key, URL.createObjectURL(blob));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function putLocalImages(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    const db = await openLocalImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_IMG_STORE, 'readwrite');
      const store = tx.objectStore(LOCAL_IMG_STORE);
      let n = 0;
      entries.forEach(e => {
        if (!e || !e.key || !e.blob) return;
        store.put(e);
        n++;
      });
      tx.oncomplete = () => resolve(n);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getLocalImageEntry(key) {
    const db = await openLocalImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_IMG_STORE, 'readonly');
      const req = tx.objectStore(LOCAL_IMG_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllLocalImages() {
    const db = await openLocalImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_IMG_STORE, 'readonly');
      const req = tx.objectStore(LOCAL_IMG_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteLocalImage(key) {
    const db = await openLocalImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_IMG_STORE, 'readwrite');
      tx.objectStore(LOCAL_IMG_STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearLocalImages() {
    const db = await openLocalImageDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_IMG_STORE, 'readwrite');
      tx.objectStore(LOCAL_IMG_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  /** 超出容量上限时删掉最旧的本地图(默认 800MB,可在设置里改) */
  async function trimLocalImages() {
    const maxMB = parseInt(getSettings().comfyLocalCacheMaxMB, 10) || 800;
    const all = (await getAllLocalImages()).sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    let total = all.reduce((s, e) => s + (e.blob?.size || 0), 0);
    const limit = maxMB * 1024 * 1024;
    let removed = 0;
    while (total > limit && all.length > 0) {
      const oldest = all.shift();
      total -= (oldest.blob?.size || 0);
      await deleteLocalImage(oldest.key);
      removed++;
    }
    return removed;
  }

  /** 本地出图副本的 key → objectURL(卡片展示优先用它,服务器图失效也能看) */
  const localImageUrls = new Map();

  async function loadLocalImageUrls() {
    try {
      const list = await getAllLocalImages();
      list.forEach(e => {
        if (!e || !e.key || !e.blob || localImageUrls.has(e.key)) return;
        try {
          localImageUrls.set(e.key, URL.createObjectURL(e.blob));
        } catch (_) {}
      });
    } catch (_) {}
    return localImageUrls.size;
  }

  /**
   * 把一批图(URL 形式)抓下来存进手机本地
   * @param {Array<{url:string,prompt?:string,loras?:Array}>} items
   */
  async function cacheImagesToPhone(items) {
    const s = getSettings();
    if (!s.comfyLocalCacheEnabled) return { saved: 0, failed: 0, skipped: 0 };
    const list = (items || []).filter(it => it && it.url);
    let saved = 0, failed = 0, skipped = 0;
    const push = [];
    for (const it of list) {
      const key = comfyFileKey(normalizeComfyImageUrl(it.url));
      if (!key) { skipped++; continue; }
      try {
        if (await getLocalImageEntry(key)) { skipped++; continue; }
        const res = await fetch(it.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        push.push({
          key,
          blob,
          url: normalizeComfyImageUrl(it.url),
          prompt: it.prompt || '',
          loras: it.loras || [],
          savedAt: Date.now(),
          size: blob.size,
        });
        saved++;
      } catch (_) {
        failed++;
      }
    }
    if (push.length > 0) {
      await putLocalImages(push);
      await trimLocalImages();
    }
    return { saved, failed, skipped };
  }

  /** 申请持久化存储,避免浏览器在空间紧张时把本地图清掉 */
  async function ensurePersistentStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const ok = await navigator.storage.persisted?.();
        if (!ok) await navigator.storage.persist();
      }
    } catch (_) {}
  }

  async function getLocalStorageEstimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        return { usage: est.usage || 0, quota: est.quota || 0 };
      }
    } catch (_) {}
    return null;
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
            <div class="sct-hint">激活规则(严格):<b>只有「角色激活关键词」与各分组的「激活关键词」能触发挂载</b> —— 特征激活词只负责注入、绝不参与判定,也不看 LoRA 文件名。所以<b>没写激活词的条目永远不会被自动激活</b>(勾了「常驻生效」才会每张都挂)。为防止特征串台,动态角色 LoRA 每张图最多激活 1 个(按列表顺序,第一个命中的胜出),常驻 LoRA 不受限。</div>

            <div class="sct-setting-row">
              <label for="sct-cfg-lora-base-always">分组生效时<b>基础特征词始终注入</b> <span style="opacity:.6; font-size:11px;">(推荐:基础放身份锚点=发色/眼睛/尾巴…,分组放这套衣服;关掉则只注入选中分组)</span></label>
              <input type="checkbox" id="sct-cfg-lora-base-always" ${s.comfyLoraBaseAlwaysInject !== false ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-lora-match-body">允许用<b>消息正文</b>兜底激活 <span style="opacity:.6; font-size:11px;">(默认关闭:只按画面提示词/图片 tag 判定,剧情正文提到名字不会误挂角色 LoRA)</span></label>
              <input type="checkbox" id="sct-cfg-lora-match-body" ${s.comfyLoraMatchBody === true ? 'checked' : ''} />
            </div>

            <div class="sct-lora-search-row">
              <input type="text" id="sct-lora-search" class="text_pole" placeholder="🔍 搜索角色:中文名 / 激活 tag / 文件名 / 分组名" autocomplete="off" />
              <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-lora-search-clear">✕</button>
              <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-lora-filter-nokw" title="只显示没写激活词的条目(它们不会被自动激活)">⚠️ 缺激活词</button>
              <span class="sct-hint" id="sct-lora-search-count"></span>
            </div>

            <div id="sct-lora-items-container" class="sct-lora-list"></div>

            <div style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="sct-comfy-btn" id="sct-btn-add-lora">➕ 添加一条角色 LoRA 配置</button>
              <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-btn-save-previews" title="把 LoRA 预览图存到手机本地,电脑关着也能看">📱 保存全部预览图到手机</button>
              <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-btn-diag-lora">🔎 诊断:这段提示词会激活哪些 LoRA</button>
            </div>

            <div class="sct-setting-col sct-lora-diag" id="sct-lora-diag-wrap" style="display:none;">
              <label for="sct-lora-diag-input">把 AI 生成的画面提示词粘进来(或点上面按钮用最后一条消息的画面前缀)</label>
              <textarea id="sct-lora-diag-input" class="text_pole sct-textarea-autowrap" rows="3" placeholder="sfw, 1girl, solo, anna yanami, blue hair, school uniform …"></textarea>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-lora-diag-run">🔎 分析</button>
              </div>
              <div id="sct-lora-diag-result" class="sct-lora-diag-result"></div>
            </div>

            <div class="sct-setting-col" style="margin-top:10px;">
              <label for="sct-cfg-global-lora-kw">🌐 通用角色关键词 (常驻注入 · 对所有 LoRA 生效)</label>
              <textarea id="sct-cfg-global-lora-kw" class="text_pole sct-textarea-autowrap" rows="2" placeholder="例如: 1girl, solo, silver hair, purple eyes, school uniform">${s.comfyGlobalLoraKeywords || ''}</textarea>
              <div class="sct-hint" style="margin-top:2px;">这组关键词<b>始终注入</b>正向提示词——无论是否激活任何 LoRA（与 LoRA 无关），且重复词自动去重、只注入一次。</div>
            </div>

            <div class="sct-setting-col" style="margin-top:8px;">
              <label for="sct-cfg-global-exclude">🚫 通用排除关键词 (从正向提示词中剔除 · 黑名单)</label>
              <textarea id="sct-cfg-global-exclude" class="text_pole sct-textarea-autowrap" rows="2" placeholder="例如: hat, glasses, twintails, *sword* —— 最终正向提示词里出现这些词就自动删掉">${s.comfyGlobalExcludeKeywords || ''}</textarea>
              <div class="sct-hint" style="margin-top:2px;">作用在<b>正向提示词</b>上：无论词来自画面标签、通用角色关键词还是各处注入，只要命中就自动剔除（按逗号分段匹配，不误伤其它词）。支持 <b>*</b> 通配：<code>hat*</code> 前缀、<code>*hat*</code> 包含。始终生效，与 LoRA 是否激活无关。</div>
            </div>
          </div>

          <!-- 板块 2.5: 生成图片管理 -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>🖼️</span>
              <span>生成图片管理</span>
            </div>
            <div class="sct-hint">集中查看所有生成过的图片(插件记录含其它聊天、当前聊天、ComfyUI 本次输出),可搜索、看大图、下载、复制提示词、<b>一键设为某个角色的 LoRA 预览图</b>、从记录里删除。</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <button type="button" class="sct-comfy-btn" id="sct-btn-open-gallery">🖼️ 打开图片管理</button>
              <span class="sct-hint" id="sct-gallery-stat"></span>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-localcache">📱 出图后自动保存到手机本地 <span style="opacity:.6; font-size:11px;">(服务器清理后依然能看、能在手机上真删)</span></label>
              <input type="checkbox" id="sct-cfg-localcache" ${s.comfyLocalCacheEnabled ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-localcache-max">本地图库容量上限 (MB,超出自动删最旧的)</label>
              <input type="number" id="sct-cfg-localcache-max" class="text_pole" style="max-width:110px;" min="100" max="8000" step="100" value="${s.comfyLocalCacheMaxMB || 800}" />
            </div>
            <div class="sct-hint">图片存在手机浏览器本地(IndexedDB),会申请持久化存储权限;已有图片可在图片管理里点「📱 备份当前显示的全部到手机」一次性补存。</div>
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

          <!-- 板块 4.5: 脸部修复 (FaceDetailer · Impact-Pack) -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>😊</span>
              <span>脸部修复 (FaceDetailer)</span>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-facefix-enable">启用脸部修复(出图后单独重采样脸部区域再贴回)</label>
              <input type="checkbox" id="sct-cfg-facefix-enable" ${s.comfyFaceFixEnabled ? 'checked' : ''} />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-facefix-detector">脸部检测模型 (Ultralytics 模型名)</label>
              <div style="display:flex; gap:6px;">
                <input type="text" id="sct-cfg-facefix-detector" class="text_pole" placeholder="如 bbox/face_yolov8m.pt" value="${escapeHtml(s.comfyFaceFixDetector || '')}" style="flex:1;" />
                <select id="sct-facefix-detector-select" class="text_pole" style="max-width:170px;">
                  <option value="">(检测模型列表)</option>
                  ${(cachedFaceDetectors || []).map(d => `<option value="${escapeHtml(d)}" ${d === s.comfyFaceFixDetector ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
                </select>
              </div>
              <div class="sct-hint">需 ComfyUI-Impact-Pack；模型放在 <code>ComfyUI/models/ultralytics/bbox/</code> 下，点上方「测试 ComfyUI 连接与扫描全部模型」可拉取列表。</div>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-facefix-denoise">脸部重绘幅度: <span id="sct-facefix-denoise-val">${s.comfyFaceFixDenoise || 0.5}</span></label>
              <input type="range" id="sct-cfg-facefix-denoise" min="0.2" max="0.9" step="0.05" value="${s.comfyFaceFixDenoise || 0.5}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-facefix-guide">脸部引导尺寸 (px): <span id="sct-facefix-guide-val">${s.comfyFaceFixGuideSize || 512}</span></label>
              <input type="range" id="sct-cfg-facefix-guide" min="256" max="1024" step="64" value="${s.comfyFaceFixGuideSize || 512}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-facefix-threshold">检测阈值: <span id="sct-facefix-threshold-val">${s.comfyFaceFixBboxThreshold || 0.5}</span></label>
              <input type="range" id="sct-cfg-facefix-threshold" min="0.1" max="0.9" step="0.05" value="${s.comfyFaceFixBboxThreshold || 0.5}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-facefix-feather">边缘羽化 (px): <span id="sct-facefix-feather-val">${s.comfyFaceFixFeather || 5}</span></label>
              <input type="range" id="sct-cfg-facefix-feather" min="0" max="32" step="1" value="${s.comfyFaceFixFeather || 5}" />
            </div>
          </div>

          <!-- 板块 4.6: 画风参考 (参考图) -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>🖼️</span>
              <span>画风参考 (参考图)</span>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-styleref-mode">参考模式</label>
              <select id="sct-cfg-styleref-mode" class="text_pole" style="max-width:280px;">
                <option value="off" ${(s.comfyStyleRefMode || 'off') === 'off' ? 'selected' : ''}>关闭</option>
                <option value="ipadapter" ${s.comfyStyleRefMode === 'ipadapter' ? 'selected' : ''}>IP-Adapter(推荐 · 需 IPAdapter_plus)</option>
                <option value="native" ${s.comfyStyleRefMode === 'native' ? 'selected' : ''}>原生 unCLIP(免插件 · 需 CLIP Vision)</option>
              </select>
            </div>

            <div class="sct-setting-col">
              <label>参考图 (最多 4 张 · 可分别设权重)</label>
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-styleref-pick">📁 添加参考图</button>
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-styleref-clear">🗑️ 全部清除</button>
                <span class="sct-hint" id="sct-styleref-state"></span>
                <!-- 原生 file 控件会被酒馆主题隐藏,故藏起来由上面的按钮代点 -->
                <input type="file" id="sct-styleref-file" accept="image/*" style="display:none;" />
              </div>
              <div class="sct-hint">
                每张单独调权重,例如「一张定画风(0.8) + 一张定服装(0.5)」;也可以在任意已生成的图上点「🖼️ 用作画风参考」直接加入。
              </div>
              <div id="sct-styleref-list" class="sct-styleref-list"></div>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-styleref-strength">参考强度: <span id="sct-styleref-strength-val">${s.comfyStyleRefStrength ?? 0.8}</span></label>
              <input type="range" id="sct-cfg-styleref-strength" min="0.1" max="1.5" step="0.05" value="${s.comfyStyleRefStrength ?? 0.8}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-styleref-start">作用起始步 (0~1): <span id="sct-styleref-start-val">${s.comfyStyleRefStart ?? 0}</span></label>
              <input type="range" id="sct-cfg-styleref-start" min="0" max="1" step="0.05" value="${s.comfyStyleRefStart ?? 0}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-styleref-end">作用结束步 (0~1): <span id="sct-styleref-end-val">${s.comfyStyleRefEnd ?? 1}</span></label>
              <input type="range" id="sct-cfg-styleref-end" min="0" max="1" step="0.05" value="${s.comfyStyleRefEnd ?? 1}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-styleref-preset">IP-Adapter 预设 (仅 IP-Adapter 模式)</label>
              <div style="display:flex; gap:6px;">
                <input type="text" id="sct-cfg-styleref-preset" class="text_pole" placeholder="如 PLUS (high strength)" value="${escapeHtml(s.comfyStyleRefPreset || '')}" style="flex:1;" />
                <select id="sct-styleref-preset-select" class="text_pole" style="max-width:170px;">
                  <option value="">(预设列表)</option>
                  ${(cachedIpAdapterPresets || []).map(p => `<option value="${escapeHtml(p)}" ${p === s.comfyStyleRefPreset ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
                </select>
              </div>
              <div class="sct-hint">装了 ComfyUI_IPAdapter_plus 后点「📡 测试并扫描」可拉取预设列表与 IPAdapter 模型。</div>
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-styleref-weighttype">参考权重类型 (仅 IP-Adapter 模式)</label>
              <select id="sct-cfg-styleref-weighttype" class="text_pole">
                <option value="" ${!s.comfyStyleRefWeightType ? 'selected' : ''}>(用节点默认 · linear 均衡)</option>
                ${(cachedIpAdapterWeightTypes || []).map(w => `<option value="${escapeHtml(w)}" ${w === s.comfyStyleRefWeightType ? 'selected' : ''}>${escapeHtml(w)}</option>`).join('')}
              </select>
              <div class="sct-hint">想更"只借画风"选 <code>style transfer</code>;想更接近参考图构图选 <code>composition</code>。</div>
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-styleref-clipvision">CLIP Vision 模型 (仅原生模式)</label>
              <div style="display:flex; gap:6px;">
                <input type="text" id="sct-cfg-styleref-clipvision" class="text_pole" placeholder="如 CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors" value="${escapeHtml(s.comfyStyleRefClipVision || '')}" style="flex:1;" />
                <select id="sct-styleref-clipvision-select" class="text_pole" style="max-width:170px;">
                  <option value="">(Vision 列表)</option>
                  ${(cachedClipVisionModels || []).map(v => `<option value="${escapeHtml(v)}" ${v === s.comfyStyleRefClipVision ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}
                </select>
              </div>
              <div class="sct-hint">模型放在 <code>ComfyUI/models/clip_vision/</code>；原生模式用它把参考图编码成视觉条件(unCLIP)。</div>
            </div>
          </div>

          <!-- 板块 4.7: AI 自动配置与批量工具(接口 / 一键配置 / 对照表 合并为一个板块) -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>🤖</span>
              <span>AI 自动配置与批量工具</span>
            </div>

            <div class="sct-subsection">
              <div class="sct-subsection-title">① AI 接口(「🤖 生成配置」用它)</div>

            <div class="sct-setting-col">
              <label for="sct-cfg-ai-endpoint">AI 接口地址 (OpenAI 兼容 /chat/completions)</label>
              <input type="text" id="sct-cfg-ai-endpoint" class="text_pole" placeholder="https://api.deepseek.com/v1/chat/completions" value="${escapeHtml(s.comfyAiAssistEndpoint || '')}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-ai-key">AI API Key</label>
              <div style="display:flex; gap:6px;">
                <input type="password" id="sct-cfg-ai-key" class="text_pole" placeholder="sk-..." value="${escapeHtml(s.comfyAiAssistKey || '')}" style="flex:1;" />
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-toggle-ai-key-vis">👁️ 显示/隐藏</button>
              </div>
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-ai-model">模型名</label>
              <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                <input type="text" id="sct-cfg-ai-model" class="text_pole" placeholder="留空则调用时自动获取" value="${escapeHtml(s.comfyAiAssistModel || '')}" style="flex:1; min-width:130px;" />
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-ai-fetch-models">🔄 获取模型列表</button>
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-ai-test">🧪 测试 AI 接口</button>
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-ai-view-prompt">👁️ 查看默认提示词</button>
                <select id="sct-ai-model-select" class="text_pole" style="max-width:190px;">
                  <option value="">(点左侧按钮拉取)</option>
                  ${(cachedAiModels || []).map(m => `<option value="${escapeHtml(m)}" ${m === s.comfyAiAssistModel ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                </select>
              </div>
              <div class="sct-hint">
                点「🔄 获取模型列表」会请求接口的 <code>/models</code> 拉取可用模型名(自动从上面的接口地址推导)。
                <b>模型名留空也行</b> —— 调用时会自动挑一个对话模型并记住。
                <br>地址只填 base 也能用:如填 <code>https://api.xxx.com/provider/v1</code> 会自动补成 <code>.../provider/v1/chat/completions</code>。
              </div>
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-ai-extra">额外要求 (可选)</label>
              <textarea id="sct-cfg-ai-extra" class="text_pole sct-textarea-autowrap" rows="2" placeholder="例如:激活词同时写日文名;分组名用角色中文名">${escapeHtml(s.comfyAiAssistExtra || '')}</textarea>
            </div>

            <div class="sct-hint">
              仅在点击 LoRA 卡片里的「🤖 生成配置」时调用一次,不会自动联网;任何 OpenAI 兼容接口都可用(DeepSeek / OpenAI / 本地 Ollama 等)。
            </div>
            </div><!-- /① AI 接口 -->

            <div class="sct-subsection">
              <div class="sct-subsection-title">② 一键配置全部 LoRA</div>

            <div class="sct-setting-col">
              <div class="sct-batch-opts">
                <label class="sct-batch-opt"><input type="checkbox" id="sct-batch-create" /> 为还没建条目的 LoRA 自动建条目</label>
                <label class="sct-batch-opt"><input type="checkbox" id="sct-batch-skip" checked /> 跳过已配好激活词的条目</label>
                <label class="sct-batch-opt"><input type="checkbox" id="sct-batch-fetch" checked /> 先抓取 C 站资料(有链接的条目)</label>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                <button type="button" class="sct-comfy-btn" id="sct-batch-run">🚀 开始一键配置</button>
                <button type="button" class="sct-comfy-btn sct-btn-danger" id="sct-batch-stop" disabled>🛑 停止</button>
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-batch-titles">🏷️ 用文件名/C站名补中文标题</button>
                <span class="sct-hint" id="sct-batch-progress">未运行</span>
              </div>
              <div class="sct-hint">
                <b>串行逐个处理</b>(每项之间限速,避免接口被封):抓 C 站资料 → AI 生成激活词/特征词/分组 → 写入配置。
                中途可随时「🛑 停止」,已完成的不会丢;结束后会汇总 成功/跳过/失败 数量。
                <br>先点上面的「🔄 获取模型列表」确保模型名已填好,再开始。
              </div>
            </div>
            </div><!-- /② 一键配置 -->

            <div class="sct-subsection">
              <div class="sct-subsection-title">③ C 站地址对照表(回填到每条 LoRA)</div>

            <div class="sct-setting-col">
              <label for="sct-civitai-map-text">对照表内容(JSON / CSV / 每行「文件名 => 地址」)</label>
              <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:6px;">
                <button type="button" class="sct-comfy-btn" id="sct-civitai-map-pull">☁️ 从 ComfyUI 一键拉取并回填(免粘贴)</button>
                <span class="sct-hint">推荐:对照表已发布在 ComfyUI 的 input/sct_lora_preview/_civitai_map.json</span>
              </div>
              <textarea id="sct-civitai-map-text" class="text_pole sct-textarea-autowrap" rows="3" placeholder="或手动粘贴:「文件名 => 地址」每行一条 / 小体积 JSON"></textarea>
              <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-civitai-map-apply">📥 回填到每条 LoRA 的「C 站链接」框</button>
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-rename-map-apply">🔁 按此表更新条目文件名(改名后用)</button>
                <button type="button" class="sct-comfy-btn sct-btn-xs" id="sct-civitai-map-file-btn">📄 选择文件</button>
                <input type="file" id="sct-civitai-map-file" accept=".json,.csv,.txt" style="display:none;" />
                <span class="sct-hint" id="sct-civitai-map-state"></span>
              </div>
              <div class="sct-hint">
                ① 「📥 套用」按文件名回填 C 站链接;② 若你在电脑上把 LoRA 文件<b>改了名</b>,把改名映射(旧名 → 新名,或 lora-rename-map.json)粘进来点「🔁」,即可让条目跟着更新。
              </div>
            </div>
            </div><!-- /③ C 站对照表 -->
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

    // 把所有设置板块做成可折叠手风琴(默认全部收起,面板不再长得看不到头)
    setupCollapsibleSections(container);

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

    // 预览图清单(异步拉取;拿到后重渲染一次,把缩略图补上)
    ensureLoraPreviewManifest().then(manifest => {
      if (manifest && Object.keys(manifest).length > 0) renderLoraList(loraContainer);
    });
    // 📱 预览图本地缓存:先读本地,再后台把服务器上还没存过的抓一份到手机
    loadLoraPreviewCache().then(n => {
      if (n > 0) renderLoraList(loraContainer);
      setTimeout(() => autoCacheLoraPreviews(loraContainer), 2000);
    });
    container.querySelector('#sct-btn-save-previews')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ 保存中…';
      try {
        await loadLoraPreviewCache();
        const n = await autoCacheLoraPreviews(loraContainer, true);
        btn.textContent = `✅ 已存 ${loraPreviewLocalUrls.size} 张`;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2500);
        return;
      } catch (err) {
        showToast(`保存失败:${err.message}`, 'error');
      }
      btn.disabled = false;
      btn.textContent = orig;
    });

    // 🔍 LoRA 搜索/筛选(89 条也好找):匹配 中文名/激活 tag/文件名/分组名
    const loraSearchInput = container.querySelector('#sct-lora-search');
    loraSearchInput?.addEventListener('input', (e) => {
      const kw = e.target.value;
      const shown = applyLoraFilter(kw, loraContainer);
      // 只剩一条时自动展开,省得再点一次
      if (kw.trim() && shown === 1) {
        const card = [...loraContainer.querySelectorAll('.sct-lora-card')].find(c => c.style.display !== 'none');
        const idx = card ? parseInt(card.dataset.idx, 10) : -1;
        if (idx >= 0 && !expandedLoraIndices.has(idx)) {
          expandedLoraIndices.add(idx);
          renderLoraList(loraContainer);
        }
      }
    });
    container.querySelector('#sct-lora-search-clear')?.addEventListener('click', () => {
      if (loraSearchInput) loraSearchInput.value = '';
      applyLoraFilter('', loraContainer, false);
      const nokwBtn = container.querySelector('#sct-lora-filter-nokw');
      if (nokwBtn) nokwBtn.classList.remove('active');
    });

    // ⚠️ 只筛出「没有激活词」的条目(它们永远不会被自动激活,需要补写)
    const nokwBtn = container.querySelector('#sct-lora-filter-nokw');
    if (nokwBtn) {
      nokwBtn.textContent = `⚠️ 缺激活词 ${countLoraWithoutKeywords()}`;
      nokwBtn.addEventListener('click', () => {
        const on = !loraListFilterNoKw;
        nokwBtn.classList.toggle('active', on);
        applyLoraFilter(undefined, loraContainer, on);
        if (on) showToast(`已筛出 ${countLoraWithoutKeywords()} 条没有激活词的条目:点开补写英文触发 tag(或点「🚀 一键配置」让 AI 生成)`, 'info');
      });
    }

    // 🔎 激活诊断:这段提示词会激活哪些 LoRA / 谁抢走了唯一动态名额
    const diagWrap = container.querySelector('#sct-lora-diag-wrap');

    /** 从聊天记录里取最近一段「画面提示词」:优先 <image> 块,其次不含 HTML 的普通消息 */
    const pickLatestImagePrompt = () => {
      const mesNodes = [...document.querySelectorAll('#chat .mes')].reverse();
      let fallback = '';
      for (const node of mesNodes) {
        const raw = node.querySelector('.mes_text')?.textContent || '';
        if (!raw.trim()) continue;
        const m = raw.match(/<image>([\s\S]*?)<\/image>/i);
        if (m) return m[1].trim();
        const looksLikeHtml = /<!DOCTYPE|<html|<style|<\/div>|class=/.test(raw);
        if (!looksLikeHtml && !fallback) fallback = raw.trim();
      }
      return fallback;
    };

    container.querySelector('#sct-btn-diag-lora')?.addEventListener('click', () => {
      if (!diagWrap) return;
      const show = diagWrap.style.display === 'none';
      diagWrap.style.display = show ? 'flex' : 'none';
      if (show) {
        const input = container.querySelector('#sct-lora-diag-input');
        // 已有内容就别覆盖;没有则自动带出最近一段画面提示词(自动跳过卡片 HTML)
        if (input && !input.value.trim()) {
          input.value = pickLatestImagePrompt().slice(0, 2000);
        }
      }
    });
    container.querySelector('#sct-lora-diag-run')?.addEventListener('click', () => {
      const input = container.querySelector('#sct-lora-diag-input');
      const out = container.querySelector('#sct-lora-diag-result');
      if (!input || !out) return;
      const text = input.value.trim();
      if (!text) {
        out.innerHTML = '<div class="sct-hint">先把画面提示词粘进来</div>';
        return;
      }
      // 防呆:喂进来的不是画面提示词(例如整段卡片 HTML / 代码块)时直接说清楚,别让用户以为没命中
      const looksLikeHtml = /<!DOCTYPE|<html|<style|<\/div>|class=|```/.test(text);
      const looksLikeTags = /,/.test(text) && /[a-z_]{3,}/i.test(text);
      if (looksLikeHtml && !looksLikeTags) {
        out.innerHTML = '<div class="sct-diag-line warn">这段文本看着不是画面提示词(像是卡片 HTML / 代码块),里面不会有角色 tag,所以必然是「命中 0 个」。请粘贴 AI 生成的那段英文 tag(通常形如 <code>sfw, 1girl, solo, anna yanami, …</code>)。</div>';
        return;
      }
      const diag = diagnoseLoraActivation(text);
      const preview = text.replace(/\s+/g, ' ').slice(0, 80);
      const nm = (r) => escapeHtml((r.item.title || '').trim() || r.item.name || `条目 #${r.idx + 1}`);
      const fileOf = (r) => escapeHtml(r.item.name || '');
      const lines = [];
      lines.push(`<div class="sct-diag-head">分析文本:${escapeHtml(preview)}${text.length > 80 ? '…' : ''}</div>`);
      lines.push(`<div class="sct-diag-head">判定依据:仅「画面提示词 / 图片 tag」${getSettings().comfyLoraMatchBody === true ? ' + 消息正文兜底(已开启)' : '(正文兜底已关闭)'}</div>`);
      lines.push(`<div class="sct-diag-head">共 ${diag.rows.length} 条配置 · 常驻命中 ${diag.alwaysOn.length} 个 · 动态命中 ${diag.dynamic.length} 个(每图只用第 1 个)</div>`);
      if (diag.alwaysOn.length) {
        lines.push('<div class="sct-diag-group">🟢 常驻生效(每张都挂)</div>');
        diag.alwaysOn.forEach(r => lines.push(`<div class="sct-diag-line">· ${nm(r)} <span class="sct-diag-file">${fileOf(r)}</span></div>`));
      }
      if (diag.winner) {
        lines.push('<div class="sct-diag-group">✅ 本次实际挂载的动态角色(唯一名额)</div>');
        lines.push(`<div class="sct-diag-line ok">· ${nm(diag.winner)} · 命中「<b>${escapeHtml(diag.winner.token)}</b>」(${diag.winner.stage}) <span class="sct-diag-file">${fileOf(diag.winner)}</span></div>`);
      } else {
        lines.push('<div class="sct-diag-group">⚠️ 没有任何动态角色命中</div>');
      }
      if (diag.crowded.length) {
        lines.push('<div class="sct-diag-group">🟡 也命中了,但名额被上面那个占了(不会挂载)</div>');
        diag.crowded.forEach(r => lines.push(`<div class="sct-diag-line warn">· ${nm(r)} · 命中「<b>${escapeHtml(r.token)}</b>」(${r.stage})</div>`));
      }
      const missed = diag.rows.filter(r => r.state === 'nomatch');
      const broken = diag.rows.filter(r => r.state === 'disabled' || r.state === 'noname');
      const nokw = diag.rows.filter(r => r.state === 'nokeywords');
      if (nokw.length) {
        lines.push(`<div class="sct-diag-group">🔑 没有激活词的条目 ${nokw.length} 条(不会自动激活)</div>`);
        nokw.slice(0, 6).forEach(r => lines.push(`<div class="sct-diag-line warn">· ${nm(r)} — 需补写激活关键词(英文触发 tag);或点「🚀 一键配置」让 AI 生成</div>`));
        if (nokw.length > 6) lines.push(`<div class="sct-diag-line warn">… 还有 ${nokw.length - 6} 条</div>`);
      }
      if (broken.length) {
        lines.push('<div class="sct-diag-group">⛔ 配置有问题(不会参与)</div>');
        broken.slice(0, 8).forEach(r => lines.push(`<div class="sct-diag-line">· ${nm(r)} — ${escapeHtml(r.stage)}</div>`));
      }
      if (missed.length) {
        lines.push(`<div class="sct-diag-group">⚪ 未命中 ${missed.length} 条(展示前 6 条)</div>`);
        missed.slice(0, 6).forEach(r => {
          const firstKw = (r.item.keywords || '').split(/[,，]/)[0].trim();
          lines.push(`<div class="sct-diag-line">· ${nm(r)} — 激活词${firstKw ? `「${escapeHtml(firstKw)}」` : '(空)'}${r.noKeywords ? ' <b>没写激活关键词</b>' : ''}</div>`);
        });
      }
      out.innerHTML = lines.join('');
    });

    // 🖼️ 生成图片管理
    const galleryBtn = container.querySelector('#sct-btn-open-gallery');
    if (galleryBtn) {
      const statEl = container.querySelector('#sct-gallery-stat');
      const refreshStat = () => {
        try {
          const local = collectLocalGalleryItems('all').length;
          if (statEl) statEl.textContent = `插件+聊天记录里共 ${local} 张`;
          getAllLocalImages().then(list => {
            if (!statEl || !statEl.isConnected) return;
            const mb = (list.reduce((s, e) => s + (e.blob?.size || 0), 0) / 1048576).toFixed(1);
            statEl.textContent = `插件+聊天记录共 ${local} 张 · 手机本地已存 ${list.length} 张 / ${mb}MB`;
          }).catch(() => {});
        } catch (_) {}
      };
      refreshStat();
      galleryBtn.addEventListener('click', async () => {
        await openImageGallery();
        refreshStat();
      });
    }

    // 📱 本地保存设置
    container.querySelector('#sct-cfg-localcache')?.addEventListener('change', (e) => {
      saveSettings({ comfyLocalCacheEnabled: e.target.checked });
      if (e.target.checked) ensurePersistentStorage();
      showToast(e.target.checked ? '已开启:出图后自动保存到手机本地' : '已关闭自动保存(已有本地图不会被删)', 'info');
    });
    container.querySelector('#sct-cfg-localcache-max')?.addEventListener('change', (e) => {
      const mb = Math.max(100, Math.min(8000, parseInt(e.target.value, 10) || 800));
      e.target.value = mb;
      saveSettings({ comfyLocalCacheMaxMB: mb });
      trimLocalImages().then(n => {
        if (n > 0) showToast(`已按新上限清理最旧的 ${n} 张本地图`, 'info');
      });
    });

    // 分组生效时基础特征词是否始终注入
    container.querySelector('#sct-cfg-lora-base-always')?.addEventListener('change', (e) => {
      saveSettings({ comfyLoraBaseAlwaysInject: e.target.checked });
      showToast(
        e.target.checked
          ? '已开启:基础特征词始终注入(基础放身份锚点,分组放服装 —— 换装不丢角色)'
          : '已关闭:选中分组时只注入该分组的特征词(需要每组自己写全身)',
        'info'
      );
    });

    // 是否允许正文兜底激活
    container.querySelector('#sct-cfg-lora-match-body')?.addEventListener('change', (e) => {
      saveSettings({ comfyLoraMatchBody: e.target.checked });
      showToast(
        e.target.checked
          ? '已开启正文兜底:画面 tag 没命中时会再看整条消息正文(可能误挂角色 LoRA)'
          : '已关闭正文兜底:LoRA 激活只看画面提示词(图片 tag),剧情正文不再影响挂载',
        e.target.checked ? 'warning' : 'success'
      );
    });

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
    container.querySelector('#sct-cfg-comfy-enabled').addEventListener('change', (e) => {
      saveSettings({ comfyEnabled: e.target.checked });
      updateAutoDrawToggle(false);
    });
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

    // 通用角色关键词 (常驻注入，对所有 LoRA 生效)
    const globalLoraKwInput = container.querySelector('#sct-cfg-global-lora-kw');
    if (globalLoraKwInput) {
      globalLoraKwInput.addEventListener('input', (e) => saveSettings({ comfyGlobalLoraKeywords: e.target.value }));
    }

    // 通用排除关键词 (正向提示词黑名单剔除)
    const globalExcludeInput = container.querySelector('#sct-cfg-global-exclude');
    if (globalExcludeInput) {
      globalExcludeInput.addEventListener('input', (e) => saveSettings({ comfyGlobalExcludeKeywords: e.target.value }));
    }
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

    // 脸部修复 (FaceDetailer)
    container.querySelector('#sct-cfg-facefix-enable').addEventListener('change', async (e) => {
      saveSettings({ comfyFaceFixEnabled: e.target.checked });
      if (!e.target.checked) return;
      // 开启时顺手探一下节点是否可用,免得出图才发现没装 Impact-Pack
      const host = getCleanComfyHost();
      cachedFaceDetailerSpec = await fetchFaceDetailerSpec(host);
      if (!cachedFaceDetailerSpec) {
        showToast('未检测到 FaceDetailer 节点：需要 ComfyUI-Impact-Pack（含 Ultralytics 检测模型）', 'warning');
      } else {
        showToast('已检测到 FaceDetailer 节点，脸部修复可用', 'success');
      }
    });

    container.querySelector('#sct-cfg-facefix-detector').addEventListener('input', (e) => saveSettings({ comfyFaceFixDetector: e.target.value.trim() }));

    const faceDetectorSelect = container.querySelector('#sct-facefix-detector-select');
    if (faceDetectorSelect) {
      faceDetectorSelect.addEventListener('change', (e) => {
        if (!e.target.value) return;
        container.querySelector('#sct-cfg-facefix-detector').value = e.target.value;
        saveSettings({ comfyFaceFixDetector: e.target.value });
      });
    }

    const faceFixSliders = [
      ['#sct-cfg-facefix-denoise', '#sct-facefix-denoise-val', 'comfyFaceFixDenoise', parseFloat, v => v],
      ['#sct-cfg-facefix-guide', '#sct-facefix-guide-val', 'comfyFaceFixGuideSize', v => parseInt(v, 10), v => `${v}`],
      ['#sct-cfg-facefix-threshold', '#sct-facefix-threshold-val', 'comfyFaceFixBboxThreshold', parseFloat, v => v],
      ['#sct-cfg-facefix-feather', '#sct-facefix-feather-val', 'comfyFaceFixFeather', v => parseInt(v, 10), v => `${v}`],
    ];
    faceFixSliders.forEach(([inputSel, valSel, key, parse, format]) => {
      const input = container.querySelector(inputSel);
      const label = container.querySelector(valSel);
      if (!input) return;
      input.addEventListener('input', (e) => {
        const value = parse(e.target.value);
        if (label) label.textContent = format(value);
        saveSettings({ [key]: value });
      });
    });

    // 画风参考 (参考图)
    container.querySelector('#sct-cfg-styleref-mode').addEventListener('change', (e) => {
      saveSettings({ comfyStyleRefMode: e.target.value });
    });

    // 参考图列表:缩略图 + 每张权重滑块 + 单张删除(最多 4 张)
    const STYLE_REF_MAX = 4;
    const readStyleRefs = () => (Array.isArray(getSettings().comfyStyleRefImages) ? getSettings().comfyStyleRefImages.slice() : []);
    const writeStyleRefs = (refs) => saveSettings({
      comfyStyleRefImages: refs,
      comfyStyleRefImage: refs[0]?.filename || ''
    });

    const renderStyleRefList = () => {
      const listEl = container.querySelector('#sct-styleref-list');
      const stateEl = container.querySelector('#sct-styleref-state');
      if (!listEl) return;
      const refs = readStyleRefs();
      if (stateEl) stateEl.textContent = refs.length ? `已设 ${refs.length}/${STYLE_REF_MAX} 张` : '未设置参考图';
      if (refs.length === 0) {
        listEl.innerHTML = '<div class="sct-hint">还没有参考图 —— 点「📁 添加参考图」或从生成图上一键加入</div>';
        return;
      }
      const host = getCleanComfyHost();
      listEl.innerHTML = refs.map((ref, i) => `
        <div class="sct-styleref-item" data-ref-index="${i}">
          <img src="${host}/view?filename=${encodeURIComponent(ref.filename)}&type=input" alt="参考图 ${i + 1}" />
          <div class="sct-styleref-meta">
            <div class="sct-styleref-name" title="${escapeHtml(ref.filename)}">#${i + 1} ${escapeHtml(ref.filename)}</div>
            <div class="sct-styleref-row">
              <span class="sct-hint">权重 <b class="sct-styleref-w">${Number(ref.weight ?? 0.8).toFixed(2)}</b></span>
              <input type="range" class="sct-styleref-weight" data-ref-index="${i}" min="0.1" max="1.5" step="0.05" value="${Number(ref.weight ?? 0.8)}" />
              <button type="button" class="sct-lora-del-btn sct-styleref-del" data-ref-index="${i}" title="删除这张参考图">✕</button>
            </div>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.sct-styleref-weight').forEach(input => {
        input.addEventListener('input', (e) => {
          const idx = parseInt(e.target.getAttribute('data-ref-index'), 10);
          const refsNow = readStyleRefs();
          if (!refsNow[idx]) return;
          refsNow[idx].weight = parseFloat(e.target.value);
          const wEl = e.target.closest('.sct-styleref-item')?.querySelector('.sct-styleref-w');
          if (wEl) wEl.textContent = refsNow[idx].weight.toFixed(2);
          writeStyleRefs(refsNow);
        });
      });

      listEl.querySelectorAll('.sct-styleref-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-ref-index'), 10);
          const refsNow = readStyleRefs();
          refsNow.splice(idx, 1);
          writeStyleRefs(refsNow);
          renderStyleRefList();
          showToast('已删除这张参考图', 'info');
        });
      });
    };
    renderStyleRefList();

    const styleRefFile = container.querySelector('#sct-styleref-file');
    const styleRefPick = container.querySelector('#sct-styleref-pick');
    if (styleRefPick && styleRefFile) {
      styleRefPick.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (readStyleRefs().length >= STYLE_REF_MAX) {
          showToast(`参考图最多 ${STYLE_REF_MAX} 张,先删掉一张再加`, 'warning');
          return;
        }
        styleRefFile.click(); // 原生 file 控件被主题隐藏,只能由按钮代点
      });
    }
    if (styleRefFile) {
      styleRefFile.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const state = container.querySelector('#sct-styleref-state');
        if (state) state.textContent = '⏳ 正在上传参考图…';
        try {
          const name = await uploadComfyInputImage(getCleanComfyHost(), file, `styleref_${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`);
          const refsNow = readStyleRefs();
          refsNow.push({ id: `ref_${Date.now()}`, filename: name, weight: parseFloat(getSettings().comfyStyleRefStrength) || 0.8 });
          writeStyleRefs(refsNow.slice(0, STYLE_REF_MAX));
          renderStyleRefList();
          showToast('参考图已上传并加入列表', 'success');
        } catch (err) {
          if (state) state.textContent = '上传失败';
          showToast(`参考图上传失败: ${err.message}`, 'error');
        } finally {
          e.target.value = '';
        }
      });
    }

    container.querySelector('#sct-styleref-clear').addEventListener('click', () => {
      writeStyleRefs([]);
      const fileInput = container.querySelector('#sct-styleref-file');
      if (fileInput) fileInput.value = '';
      renderStyleRefList();
      showToast('已清除全部参考图', 'info');
    });

    container.querySelector('#sct-cfg-styleref-preset').addEventListener('input', (e) => saveSettings({ comfyStyleRefPreset: e.target.value.trim() }));
    container.querySelector('#sct-cfg-styleref-clipvision').addEventListener('input', (e) => saveSettings({ comfyStyleRefClipVision: e.target.value.trim() }));

    const weightTypeSelect = container.querySelector('#sct-cfg-styleref-weighttype');
    if (weightTypeSelect) {
      weightTypeSelect.addEventListener('change', (e) => saveSettings({ comfyStyleRefWeightType: e.target.value }));
    }

    const presetSelect = container.querySelector('#sct-styleref-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        if (!e.target.value) return;
        container.querySelector('#sct-cfg-styleref-preset').value = e.target.value;
        saveSettings({ comfyStyleRefPreset: e.target.value });
      });
    }

    const visionSelect = container.querySelector('#sct-styleref-clipvision-select');
    if (visionSelect) {
      visionSelect.addEventListener('change', (e) => {
        if (!e.target.value) return;
        container.querySelector('#sct-cfg-styleref-clipvision').value = e.target.value;
        saveSettings({ comfyStyleRefClipVision: e.target.value });
      });
    }

    const styleRefSliders = [
      ['#sct-cfg-styleref-strength', '#sct-styleref-strength-val', 'comfyStyleRefStrength', parseFloat],
      ['#sct-cfg-styleref-start', '#sct-styleref-start-val', 'comfyStyleRefStart', parseFloat],
      ['#sct-cfg-styleref-end', '#sct-styleref-end-val', 'comfyStyleRefEnd', parseFloat],
    ];
    styleRefSliders.forEach(([inputSel, valSel, key, parse]) => {
      const input = container.querySelector(inputSel);
      const label = container.querySelector(valSel);
      if (!input) return;
      input.addEventListener('input', (e) => {
        const value = parse(e.target.value);
        if (label) label.textContent = String(value);
        saveSettings({ [key]: value });
      });
    });

    // AI 辅助配置
    container.querySelector('#sct-cfg-ai-endpoint')?.addEventListener('input', (e) => saveSettings({ comfyAiAssistEndpoint: e.target.value.trim() }));
    container.querySelector('#sct-cfg-ai-key')?.addEventListener('input', (e) => saveSettings({ comfyAiAssistKey: e.target.value.trim() }));
    container.querySelector('#sct-cfg-ai-model')?.addEventListener('input', (e) => saveSettings({ comfyAiAssistModel: e.target.value.trim() }));
    container.querySelector('#sct-cfg-ai-extra')?.addEventListener('input', (e) => saveSettings({ comfyAiAssistExtra: e.target.value }));
    container.querySelector('#sct-toggle-ai-key-vis')?.addEventListener('click', () => {
      const input = container.querySelector('#sct-cfg-ai-key');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });

    // 🔄 获取模型列表:调用接口 /models 并填进下拉
    container.querySelector('#sct-ai-fetch-models')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ 拉取中…';
      try {
        const models = await fetchAiModelList();
        const select = container.querySelector('#sct-ai-model-select');
        const current = (container.querySelector('#sct-cfg-ai-model')?.value || '').trim();
        if (select) {
          select.innerHTML = '<option value="">(选择模型)</option>' +
            models.map(m => `<option value="${escapeHtml(m)}" ${m === current ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
        }
        // 原来没填 → 自动挑一个对话模型填上
        if (!current) {
          const picked = pickChatModel(models);
          if (picked) {
            const input = container.querySelector('#sct-cfg-ai-model');
            if (input) input.value = picked;
            if (select) select.value = picked;
            saveSettings({ comfyAiAssistModel: picked });
          }
        }
        showToast(`获取到 ${models.length} 个模型${!current ? `,已自动选用 ${getSettings().comfyAiAssistModel}` : ''}`, 'success');
      } catch (err) {
        showToast(`获取模型列表失败: ${err.message}`, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    container.querySelector('#sct-ai-model-select')?.addEventListener('change', (e) => {
      if (!e.target.value) return;
      const input = container.querySelector('#sct-cfg-ai-model');
      if (input) input.value = e.target.value;
      saveSettings({ comfyAiAssistModel: e.target.value });
    });

    // 👁️ 查看发给 AI 的默认提示词
    container.querySelector('#sct-ai-view-prompt')?.addEventListener('click', (e) => {
      e.preventDefault();
      showAiPromptPreview();
    });

    // 🧪 测试 AI 接口:补全地址 → 拉模型列表 → 发一条最小对话请求
    container.querySelector('#sct-ai-test')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ 测试中…';
      const lines = [];
      try {
        const fixed = resolveAiEndpoint();
        const endpointInput = container.querySelector('#sct-cfg-ai-endpoint');
        if (endpointInput) endpointInput.value = fixed;
        lines.push(`接口: ${fixed}`);
        if (!fixed) throw new Error('未填接口地址');
        if (!(getSettings().comfyAiAssistKey || '').trim()) throw new Error('未填 API Key');

        // 1) 模型列表(可选,失败也继续)
        try {
          const models = await fetchAiModelList();
          lines.push(`✅ /models 可用,拿到 ${models.length} 个模型`);
          const select = container.querySelector('#sct-ai-model-select');
          if (select) {
            select.innerHTML = '<option value="">(选择模型)</option>' +
              models.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
          }
          if (!(getSettings().comfyAiAssistModel || '').trim()) {
            const picked = pickChatModel(models);
            if (picked) {
              const input = container.querySelector('#sct-cfg-ai-model');
              if (input) input.value = picked;
              saveSettings({ comfyAiAssistModel: picked });
              lines.push(`✅ 已自动选用模型: ${picked}`);
            }
          }
        } catch (err) {
          lines.push(`⚠️ /models 不可用(${err.message})—— 仍继续测对话接口`);
        }

        // 2) 最小对话请求
        const key = (getSettings().comfyAiAssistKey || '').trim();
        let model = (getSettings().comfyAiAssistModel || '').trim();
        if (!model && cachedAiModels.length > 0) {
          model = pickChatModel(cachedAiModels);
          saveSettings({ comfyAiAssistModel: model });
        }
        if (!model) throw new Error('拿不到模型名,请手动填一个');
        const res = await fetch(fixed, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8, stream: false }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`对话接口返回 ${res.status}${detail ? ':' + detail.slice(0, 160) : ''}`);
        }
        const data = await res.json();
        const reply = (data?.choices?.[0]?.message?.content || '').trim().slice(0, 40);
        lines.push(`✅ 对话接口正常(模型 ${model}${reply ? `,回复「${reply}」` : ''})`);
        showToast(`AI 接口测试通过 · ${lines.join(' | ')}`, 'success');
      } catch (err) {
        lines.push(`❌ ${err.message}`);
        showToast(`AI 接口测试失败 · ${lines.join(' | ')}`, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    // 🚀 一键配置全部 LoRA
    const batchRunBtn = container.querySelector('#sct-batch-run');
    const batchStopBtn = container.querySelector('#sct-batch-stop');
    const batchProgress = container.querySelector('#sct-batch-progress');

    const setBatchUi = (running, text) => {
      if (batchRunBtn) batchRunBtn.disabled = running;
      if (batchStopBtn) batchStopBtn.disabled = !running;
      if (batchProgress && text) batchProgress.textContent = text;
    };

    batchRunBtn?.addEventListener('click', async () => {
      const createMissing = !!container.querySelector('#sct-batch-create')?.checked;
      const skipConfigured = !!container.querySelector('#sct-batch-skip')?.checked;
      const fetchCivitai = !!container.querySelector('#sct-batch-fetch')?.checked;

      const loras = getSettings().comfyLoras || [];
      if (loras.length === 0 && !createMissing) {
        showToast('还没有任何 LoRA 条目:可勾选「自动建条目」或先手动添加', 'warning');
        return;
      }

      // 预检:先确认接口真的能通,避免像上次那样 89 个全失败才发现地址不对
      setBatchUi(true, '正在预检 AI 接口…');
      try {
        const usedModel = await pingAiEndpoint();
        if (batchProgress) batchProgress.textContent = `预检通过(模型 ${usedModel}),开始批量配置…`;
      } catch (err) {
        setBatchUi(false, `预检失败:${err.message}`);
        showToast(`一键配置未开始 —— AI 接口预检失败: ${err.message}`, 'error');
        return;
      }

      setBatchUi(true, '准备中…');
      const result = await runLoraBatchConfig({
        createMissing,
        skipConfigured,
        fetchCivitai,
        onProgress: (text, stats) => {
          setBatchUi(true, `${text} · 成功 ${stats.configured} / 失败 ${stats.failed} / 跳过 ${stats.skipped}`);
        },
        onFinish: (res) => {
          setBatchUi(false, `${res.stopped ? '已停止' : '已完成'} · 成功 ${res.configured} · 抓取 ${res.fetched} · 新建 ${res.created} · 跳过 ${res.skipped} · 失败 ${res.failed}`);
        },
      });
      if (typeof loraContainer !== 'undefined' && loraContainer) renderLoraList(loraContainer);
      if (!result.ok) {
        showToast(`未开始: ${result.reason}`, 'warning');
        return;
      }
      showToast(
        `${result.stopped ? '已手动停止' : '一键配置完成'}:成功 ${result.configured} 个${result.created ? `,新建条目 ${result.created} 个` : ''}${result.failed ? `,失败 ${result.failed} 个` : ''}${result.errors.length ? `(首个错误: ${result.errors[0]})` : ''}`,
        result.failed > 0 ? 'warning' : 'success'
      );
    });

    batchStopBtn?.addEventListener('click', () => {
      loraBatchState.stop = true;
      if (batchProgress) batchProgress.textContent = '正在停止(当前这项跑完就停)…';
    });

    // 🏷️ 不用 AI,直接从「C 站模型名 / 文件名」里提取中文标题补齐
    container.querySelector('#sct-batch-titles')?.addEventListener('click', () => {
      const loras = getSettings().comfyLoras || [];
      let filled = 0;
      loras.forEach(item => {
        if (String(item.title || '').trim()) return;
        const guess = (item.civitai && item.civitai.name ? guessCjkTitle(item.civitai.name) : '')
          || guessCjkTitle(item.name)
          || (item.civitai && item.civitai.name ? item.civitai.name : '');
        if (guess) {
          item.title = guess;
          filled++;
        }
      });
      if (filled > 0) saveSettings({ comfyLoras: loras });
      if (typeof loraContainer !== 'undefined' && loraContainer) renderLoraList(loraContainer);
      showToast(filled > 0 ? `已为 ${filled} 条补上中文标题` : '现有条目都已有标题(或文件/C站名里没有中文)', filled > 0 ? 'success' : 'info');
    });

    const runCivitaiMapImport = (text) => {
      const map = parseCivitaiMap(text);
      const state = container.querySelector('#sct-civitai-map-state');
      if (map.size === 0) {
        if (state) state.textContent = '没解析出任何有效条目';
        showToast('对照表里没找到有效的 C 站地址(检查格式)', 'warning');
        return;
      }
      const applied = applyCivitaiMap(map);
      const appliedCount = typeof applied === 'number' ? applied : applied.applied;
      const unmatched = (applied && applied.unmatched) ? applied.unmatched : [];
      if (state) state.textContent = `解析 ${map.size} 条,套用 ${appliedCount} 条${unmatched.length ? `,未匹配 ${unmatched.length} 条` : ''}`;
      if (typeof loraContainer !== 'undefined' && loraContainer) renderLoraList(loraContainer);
      if (appliedCount > 0) {
        showToast(
          `已套用 ${appliedCount} 条 C 站地址到对应 LoRA 条目${unmatched.length ? `;另有 ${unmatched.length} 条没匹配上(需要单独配置):${unmatched.slice(0, 3).join(' / ')}${unmatched.length > 3 ? ' …' : ''}` : ''}`,
          unmatched.length ? 'warning' : 'success'
        );
      } else {
        showToast(
          `解析到 ${map.size} 条,但没有匹配上任何 LoRA 条目${unmatched.length ? `(未匹配示例:${unmatched.slice(0, 3).join(' / ')})` : ''}`,
          'warning'
        );
      }
    };

    container.querySelector('#sct-civitai-map-apply')?.addEventListener('click', () => {
      const box = container.querySelector('#sct-civitai-map-text');
      runCivitaiMapImport(box ? box.value : '');
    });

    // ☁️ 从 ComfyUI 一键拉取对照表并回填(手机上不用粘贴任何东西)
    container.querySelector('#sct-civitai-map-pull')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ 拉取中…';
      const state = container.querySelector('#sct-civitai-map-state');
      try {
        const map = await fetchCivitaiMapFromComfy();
        if (state) state.textContent = `已从 ComfyUI 拉取 ${map.size} 条`;
        const applied = applyCivitaiMap(map);
        if (typeof loraContainer !== 'undefined' && loraContainer) renderLoraList(loraContainer);
        if (state) state.textContent = `已拉取 ${map.size} 条,回填 ${applied.applied} 条${applied.unmatched.length ? `,未匹配 ${applied.unmatched.length} 条` : ''}`;
        showToast(
          `已从 ComfyUI 拉取并回填 ${applied.applied} 条 C 站链接${applied.unmatched.length ? `;未匹配 ${applied.unmatched.length} 条:${applied.unmatched.slice(0, 3).join(' / ')}${applied.unmatched.length > 3 ? ' …' : ''}` : ''}`,
          applied.unmatched.length ? 'warning' : 'success'
        );
      } catch (err) {
        if (state) state.textContent = `拉取失败:${err.message}`;
        showToast(`拉取对照表失败:${err.message}`, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });

    // 🔁 应用重命名映射(LoRA 文件在电脑上改过名后,让条目跟着更新,避免失联)
    container.querySelector('#sct-rename-map-apply')?.addEventListener('click', () => {
      const box = container.querySelector('#sct-civitai-map-text');
      const state = container.querySelector('#sct-civitai-map-state');
      const map = parseRenameMap(box ? box.value : '');
      if (map.size === 0) {
        if (state) state.textContent = '没解析出改名映射';
        showToast('没解析出改名映射(格式:旧文件名 => 新文件名,或 JSON 对象)', 'warning');
        return;
      }
      const applied = applyRenameMap(map);
      if (state) state.textContent = `解析 ${map.size} 条映射,更新 ${applied} 条条目`;
      if (typeof loraContainer !== 'undefined' && loraContainer) renderLoraList(loraContainer);
      showToast(
        applied > 0
          ? `已按映射更新 ${applied} 条 LoRA 条目的文件名`
          : `解析到 ${map.size} 条映射,但没有条目的文件名与之匹配`,
        applied > 0 ? 'success' : 'warning'
      );
    });

    const civitaiMapFile = container.querySelector('#sct-civitai-map-file');    container.querySelector('#sct-civitai-map-file-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      civitaiMapFile?.click();
    });
    civitaiMapFile?.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        // ★ 直接解析文件全文(不再塞进文本框、也不截断 —— 大文件也能导入)
        const text = await file.text();
        const box = container.querySelector('#sct-civitai-map-text');
        if (box) box.value = `(已从文件 ${file.name} 导入,${(text.length / 1024).toFixed(1)}KB,无需粘贴)`;
        runCivitaiMapImport(text);
      } catch (err) {
        showToast(`读取对照表失败: ${err.message}`, 'error');
      } finally {
        e.target.value = '';
      }
    });

    // 自动配图指令
    container.querySelector('#sct-cfg-auto-draw').addEventListener('change', (e) => {
      saveSettings({ comfyAutoDrawTags: e.target.checked });
      updateAutoDrawToggle(false);
    });
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

          // 脸部检测模型下拉 + FaceDetailer 可用性
          const detSelect = container.querySelector('#sct-facefix-detector-select');
          if (detSelect) {
            const currentFaceDetector = getSettings().comfyFaceFixDetector || '';
            detSelect.innerHTML = '<option value="">(检测模型列表)</option>' +
              cachedFaceDetectors.map(d => `<option value="${escapeHtml(d)}" ${d === currentFaceDetector ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('');
            if (!currentFaceDetector && cachedFaceDetectors.length > 0) {
              container.querySelector('#sct-cfg-facefix-detector').value = cachedFaceDetectors[0];
              saveSettings({ comfyFaceFixDetector: cachedFaceDetectors[0] });
            }
          }
          if (cachedFaceDetectors.length === 0) {
            showToast('未探查到脸部检测模型：脸部修复需要 Ultralytics 模型(放 models/ultralytics/bbox/)', 'warning');
          }
          if (!cachedFaceDetailerSpec) {
            showToast('未检测到 FaceDetailer 节点：脸部修复需安装 ComfyUI-Impact-Pack', 'warning');
          }

          // 画风参考:预设与 CLIP Vision 下拉
          const presetSel = container.querySelector('#sct-styleref-preset-select');
          if (presetSel) {
            const currentPreset = getSettings().comfyStyleRefPreset || '';
            presetSel.innerHTML = '<option value="">(预设列表)</option>' +
              cachedIpAdapterPresets.map(p => `<option value="${escapeHtml(p)}" ${p === currentPreset ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('');
          }
          const visionSel = container.querySelector('#sct-styleref-clipvision-select');
          if (visionSel) {
            const currentVision = getSettings().comfyStyleRefClipVision || '';
            visionSel.innerHTML = '<option value="">(Vision 列表)</option>' +
              cachedClipVisionModels.map(v => `<option value="${escapeHtml(v)}" ${v === currentVision ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');
            if (!currentVision && cachedClipVisionModels.length > 0) {
              container.querySelector('#sct-cfg-styleref-clipvision').value = cachedClipVisionModels[0];
              saveSettings({ comfyStyleRefClipVision: cachedClipVisionModels[0] });
            }
          }

          // 参考权重类型候选(来自 IPAdapter 节点自身)
          const weightTypeSel = container.querySelector('#sct-cfg-styleref-weighttype');
          if (weightTypeSel) {
            const currentWeightType = getSettings().comfyStyleRefWeightType || '';
            weightTypeSel.innerHTML = '<option value="">(用节点默认 · linear 均衡)</option>' +
              cachedIpAdapterWeightTypes.map(w => `<option value="${escapeHtml(w)}" ${w === currentWeightType ? 'selected' : ''}>${escapeHtml(w)}</option>`).join('');
          }
          if (cachedIpAdapterPresets.length === 0) {
            showToast('未检测到 IP-Adapter 节点/预设：画风参考若要最佳效果需安装 ComfyUI_IPAdapter_plus', 'warning');
          }
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

  function updateWandAutoDrawLabel() {
    const el = document.getElementById('sct-wand-autodraw-label');
    if (!el) return;
    const on = !!getSettings().comfyAutoDrawTags;
    el.textContent = `🎨 自动生图:${on ? '开' : '关'}`;
    el.style.color = on ? '#76ABAE' : '#D9B358';
  }

  function injectWandMenuButton() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return;

    // 悬浮开关的内联样式兜底(CSS 未刷新时也能显示)
    if (autoDrawToggleEl && autoDrawToggleEl.isConnected) autoDrawToggleEl.style.cssText = '';

    if (!document.getElementById('sct-wand-item')) {
      const item = document.createElement('div');
      item.className = 'extension_container interactable';
      item.tabIndex = 0;
      item.innerHTML = `
        <a id="sct-wand-item" class="list-group-item" href="#" title="${DISPLAY_NAME} v${SCT_BUILD}">
          <i class="fa-solid fa-palette"></i>
          <span>ComfyUI & 语音朗读 <small style="opacity:.55">v${SCT_BUILD}</small></span>
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

    // ② 魔杖菜单里一键切换自动生图(抽卡时关掉,满意后再手动生图)
    if (!document.getElementById('sct-wand-autodraw')) {
      const auto = document.createElement('div');
      auto.className = 'extension_container interactable';
      auto.tabIndex = 0;
      auto.innerHTML = `
        <a id="sct-wand-autodraw" class="list-group-item" href="#" title="抽卡时点成「关」,满意后再手动点消息里的「立即开始生图」">
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <span id="sct-wand-autodraw-label">🎨 自动生图</span>
        </a>
      `;
      auto.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveSettings({ comfyAutoDrawTags: !getSettings().comfyAutoDrawTags });
        updateAutoDrawToggle(true);
        updateWandAutoDrawLabel();
        menu.style.display = 'none';
      });
      menu.appendChild(auto);
    }

    // ③ 魔杖菜单里直接打开图片管理
    if (!document.getElementById('sct-wand-gallery')) {
      const gal = document.createElement('div');
      gal.className = 'extension_container interactable';
      gal.tabIndex = 0;
      gal.innerHTML = `
        <a id="sct-wand-gallery" class="list-group-item" href="#" title="集中查看所有生成过的图片">
          <i class="fa-solid fa-images"></i>
          <span>🖼️ 生成图片管理</span>
        </a>
      `;
      gal.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.style.display = 'none';
        openImageGallery();
      });
      menu.appendChild(gal);
    }

    updateWandAutoDrawLabel();
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
      getAutoDrawToggle();   // 聊天页常驻的「自动生图 开/关」悬浮开关
      updateAutoDrawToggle(false);
      scanAllMessages();
      updateExtensionPrompt();

      if (initChecks > 10) clearInterval(initTimer);
    }, 800);

    // 初始加载保护期：在进入页面/刷新页面的前 3.5 秒内，所有历史消息只恢复已生成图像，未生成的仅显示手动触发按钮
    // 先把手机本地的出图副本读进来(卡片优先生效本地图),读完再重扫一次让历史卡片也用上
    loadLocalImageUrls().then(n => {
      if (n > 0) scanAllMessages();
    });
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
