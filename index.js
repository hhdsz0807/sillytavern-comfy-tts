/**
 * SillyTavern ComfyUI 绘图 & TTS 语音朗读原生插件 (sillytavern-comfy-tts)
 * 
 * 纯正独立 SillyTavern 扩展，完全脱离任何外部宿主桥接，所有逻辑前端闭环：
 * 1. ComfyUI 原生直连生图：
 *    - 直连标准 ComfyUI 服务（默认 8188 端口或用户自定义局域网/远程地址）；
 *    - 自动探查并列举 ComfyUI 已安装的模型权重（Checkpoint）、采样器（Sampler）与调度器（Scheduler）；
 *    - 原生组装文生图标准工作流 JSON 并发送至 /prompt，支持实时 WebSocket 进度推送与 /history 轮询兜底；
 *    - 自动解析 AI 消息中的 <image>prompt</image> 标签，支持手势滑动多图轮播、全屏大图灯箱预览、重新生成；
 *    - 消息栏「🎨」快捷绘图按钮与 /comfy 斜杠命令。
 * 
 * 2. 独立纯净 TTS 语音朗读：
 *    - 原生 Web Speech API（开箱即用、零服务器依赖、零网络开销、支持设备全语种声音）；
 *    - OpenAI 兼容格式音频服务（/v1/audio/speech，适配 Edge-TTS、CosyVoice、GPT-SoVITS、Fish-Speech 等）；
 *    - 手机触屏手滑划选、电脑鼠标划选就地升起「🔊 朗读选中文字」浮动胶囊；
 *    - 消息栏「🔊」一键朗读（智能剥离 <think> 思考链、代码块与图像标签）；
 *    - 屏幕右下角全局播放/停止常驻指示徽章与 /tts 斜杠命令。
 * 
 * 3. 标准酒馆配置中心：
 *    - 接入酒馆右侧抽屉 Extensions Settings 与顶部魔杖菜单，支持模型探测、参数微调与即时试听测试。
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__sctExtensionLoaded) return;
  window.__sctExtensionLoaded = true;

  const MODULE_NAME = 'sillytavern-comfy-tts';
  const DISPLAY_NAME = 'ComfyUI 绘图 & TTS 语音朗读';

  // 默认配置（纯净原生配置，无任何外部桥接依赖）
  const DEFAULT_SETTINGS = {
    // ComfyUI 设置
    comfyEnabled: true,
    comfyHost: 'http://127.0.0.1:8188',
    comfyCheckpoint: '',
    comfyAutoDrawTags: true,
    comfyShowMesButton: true,
    comfyPromptPrefix: '(masterpiece, best quality, highly detailed), ',
    comfyPromptSuffix: ', 8k, photorealistic, cinematic lighting',
    comfyNegativePrompt: '(worst quality, low quality:1.4), deformed, bad anatomy, bad hands, missing fingers, extra limbs, blurry, cropped, watermark',
    comfyBatchCount: 1,
    comfyWidth: 512,
    comfyHeight: 768,
    comfySteps: 20,
    comfyCfg: 7.0,
    comfySampler: 'euler',
    comfyScheduler: 'normal',

    // TTS 设置
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

  // 运行期全局状态
  let currentUtterance = null;
  let currentAudio = null;
  let isTtsPlaying = false;
  let currentPlayingText = '';
  let ttsButton = null;
  let playingBadge = null;
  let selectedTextCache = '';
  let lastActionTime = 0;
  let lightboxEl = null;

  /* ==========================================================================
     1. 上下文与持久化配置 (Context & Settings Management)
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
        extSettings[MODULE_NAME] = Object.assign({}, DEFAULT_SETTINGS);
      } else {
        extSettings[MODULE_NAME] = Object.assign({}, DEFAULT_SETTINGS, extSettings[MODULE_NAME]);
      }
      return extSettings[MODULE_NAME];
    }
    return Object.assign({}, DEFAULT_SETTINGS);
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
  }

  function getCleanComfyHost() {
    const s = getSettings();
    let host = (s.comfyHost || 'http://127.0.0.1:8188').trim().replace(/\/+$/, '');
    if (!host.startsWith('http://') && !host.startsWith('https://')) {
      host = 'http://' + host;
    }
    return host;
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
     2. 全屏大图灯箱预览 (Lightbox Viewer)
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
     3. TTS 语音朗读引擎 (Web Speech API & OpenAI 兼容协议)
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
    text = text.replace(/<img_prompt>[\s\S]*?<\/img_prompt>/gi, '');
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

    // 引擎分支 1：OpenAI 兼容协议 / 自定义 TTS API 端点
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
        audio.onerror = (e) => {
          URL.revokeObjectURL(audioUrl);
          currentAudio = null;
          setTtsPlayingState(false);
          showToast(`音频播放失败: ${e.message || '未知解码错误'}`, 'error');
        };

        await audio.play();
        return;
      } catch (err) {
        console.warn('[SCT_TTS] OpenAI TTS 失败，降级至原生 Web Speech API', err);
        showToast(`OpenAI TTS 失败 (${err.message})，转用浏览器原生朗读`, 'warning');
      }
    }

    // 引擎分支 2：浏览器原生 Web Speech API（零门槛、零网络延迟、全平台支持）
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

        utterance.onerror = (e) => {
          console.warn('[SCT_TTS] WebSpeech 错误', e);
          currentUtterance = null;
          setTtsPlayingState(false);
        };

        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        setTtsPlayingState(false);
        showToast(`语音朗读启动失败: ${err.message}`, 'error');
      }
    } else {
      setTtsPlayingState(false);
      showToast('当前浏览器环境不支持 Web Speech API，请配置 OpenAI 兼容 TTS 端点', 'error');
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

  /* ==========================================================================
     4. 划选文本浮动胶囊 (Selection Floating Pill)
     ========================================================================== */

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
     5. ComfyUI 原生工作流组装与通信 (Direct ComfyUI Workflow & API Client)
     ========================================================================== */

  // 探查 ComfyUI 已安装的模型权重与可用节点信息
  async function fetchComfyObjectInfo(host) {
    try {
      const res = await fetch(`${host}/object_info/CheckpointLoaderSimple`);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
    } catch (_) {
      return null;
    }
  }

  // 轮播卡片状态管理 Map
  const cardStateMap = new Map();

  function renderCarouselCard(container, images, promptText) {
    if (!images || images.length === 0) return;
    const cardId = container.dataset.sctCardId || `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    container.dataset.sctCardId = cardId;

    let state = cardStateMap.get(cardId);
    if (!state) {
      state = { currentIdx: 0, images: images, prompt: promptText };
      cardStateMap.set(cardId, state);
    } else {
      state.images = images;
    }

    const total = images.length;
    const safeIdx = ((state.currentIdx % total) + total) % total;
    state.currentIdx = safeIdx;
    const currentUrl = images[safeIdx];

    container.innerHTML = `
      <div class="sct-comfy-card">
        <div class="sct-comfy-card-header">
          <div class="sct-title">
            <span>🎨</span>
            <span>ComfyUI 画面生成</span>
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
            <span style="font-size: 11px; opacity: 0.5;">点击图片可放大查看</span>
            <button type="button" class="sct-comfy-btn sct-retry-btn">🔄 重新生成</button>
          `}
        </div>
      </div>
    `;

    const vp = container.querySelector(`#vp_${cardId}`);
    vp.querySelector('img').addEventListener('click', () => openLightbox(currentUrl));

    let touchStartX = 0;
    vp.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) touchStartX = e.touches[0].clientX;
    }, { passive: true });

    vp.addEventListener('touchend', (e) => {
      if (e.changedTouches && e.changedTouches.length > 0 && total > 1) {
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (diff > 45) {
          state.currentIdx = (state.currentIdx - 1 + total) % total;
          renderCarouselCard(container, images, promptText);
        } else if (diff < -45) {
          state.currentIdx = (state.currentIdx + 1) % total;
          renderCarouselCard(container, images, promptText);
        }
      }
    }, { passive: true });

    const prevBtn = container.querySelector('.sct-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.currentIdx = (state.currentIdx - 1 + total) % total;
        renderCarouselCard(container, images, promptText);
      });
    }

    const nextBtn = container.querySelector('.sct-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.currentIdx = (state.currentIdx + 1) % total;
        renderCarouselCard(container, images, promptText);
      });
    }

    container.querySelectorAll('.sct-comfy-dot').forEach((dot) => {
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(dot.dataset.idx, 10);
        if (!isNaN(idx)) {
          state.currentIdx = idx;
          renderCarouselCard(container, images, promptText);
        }
      });
    });

    const retryBtn = container.querySelector('.sct-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerComfyDraw(promptText, container);
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

  function renderErrorCard(container, promptText, err) {
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
      triggerComfyDraw(promptText, container);
    });
  }

  // 纯正的 ComfyUI 原生 API 调度器
  async function triggerComfyDraw(promptText, container) {
    const s = getSettings();
    if (!s.comfyEnabled) {
      showToast('ComfyUI 绘图功能未开启', 'warning');
      return;
    }

    renderLoadingCard(container, promptText, '🎨 正在连接 ComfyUI 引擎…');

    const comfyHost = getCleanComfyHost();
    const fullPositivePrompt = `${s.comfyPromptPrefix || ''}${promptText}${s.comfyPromptSuffix || ''}`.trim();
    const negativePrompt = s.comfyNegativePrompt || '';
    const batch = Math.min(4, Math.max(1, s.comfyBatchCount || 1));
    const width = s.comfyWidth || 512;
    const height = s.comfyHeight || 768;
    const steps = s.comfySteps || 20;
    const cfg = s.comfyCfg || 7.0;
    const sampler = s.comfySampler || 'euler';
    const scheduler = s.comfyScheduler || 'normal';
    const seed = Math.floor(Math.random() * 1000000000);

    // 探查或使用指定模型 Checkpoint
    let ckpt = s.comfyCheckpoint || '';
    if (!ckpt) {
      const availableModels = await fetchComfyObjectInfo(comfyHost);
      if (availableModels && availableModels.length > 0) {
        ckpt = availableModels[0];
      } else {
        ckpt = 'v1-5-pruned-emaonly.safetensors';
      }
    }

    // 组装标准原生 ComfyUI txt2img 工作流
    const workflow = {
      "3": {
        "class_type": "KSampler",
        "inputs": {
          "cfg": cfg,
          "denoise": 1,
          "latent_image": ["5", 0],
          "model": ["4", 0],
          "negative": ["7", 0],
          "positive": ["6", 0],
          "sampler_name": sampler,
          "scheduler": scheduler,
          "seed": seed,
          "steps": steps
        }
      },
      "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
          "ckpt_name": ckpt
        }
      },
      "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {
          "batch_size": batch,
          "height": height,
          "width": width
        }
      },
      "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "clip": ["4", 1],
          "text": fullPositivePrompt
        }
      },
      "7": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "clip": ["4", 1],
          "text": negativePrompt
        }
      },
      "8": {
        "class_type": "VAEDecode",
        "inputs": {
          "samples": ["3", 0],
          "vae": ["4", 2]
        }
      },
      "9": {
        "class_type": "SaveImage",
        "inputs": {
          "filename_prefix": "SillyTavern",
          "images": ["8", 0]
        }
      }
    };

    const clientId = 'st_' + Math.random().toString(36).slice(2, 10);

    try {
      // 1. 尝试建立 WebSocket 实时进度监听
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
              renderLoadingCard(container, promptText, `🎨 渲染进度: ${value}/${max} (${percent}%)`);
            } else if (msg.type === 'executing') {
              const node = msg.data.node;
              if (node === '3') renderLoadingCard(container, promptText, `🎨 正在执行 KSampler 采样…`);
              else if (node === '8') renderLoadingCard(container, promptText, `🎨 正在执行 VAE 解码…`);
            }
          } catch (_) {}
        };
      } catch (_) {}

      // 2. 提交任务至 ComfyUI /prompt 端点
      const res = await fetch(`${comfyHost}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: clientId })
      });

      if (!res.ok) {
        throw new Error(`ComfyUI 响应失败 HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const promptId = data.prompt_id;
      if (!promptId) {
        if (data.node_errors && Object.keys(data.node_errors).length > 0) {
          throw new Error(`工作流节点配置异常: ${JSON.stringify(data.node_errors)}`);
        }
        throw new Error('未获取到 ComfyUI 任务 ID');
      }

      // 3. 轮询 /history/{promptId} 获取最终生成的图像
      let pollCount = 0;
      const maxPoll = 120; // 120 * 1.5s = 180s 超时
      const pollTimer = setInterval(async () => {
        pollCount++;
        if (pollCount > maxPoll) {
          clearInterval(pollTimer);
          if (ws) ws.close();
          renderErrorCard(container, promptText, '生图等待超时（超过 180 秒）');
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

            renderCarouselCard(container, images, promptText);
            showToast('ComfyUI 绘图成功！', 'success');
          }
        } catch (_) {}
      }, 1500);

    } catch (e) {
      renderErrorCard(container, promptText, e.message);
    }
  }

  /* ==========================================================================
     6. 消息扫描与自动化注入 (Message Parsing & DOM Injection)
     ========================================================================== */

  function processSingleMessage(mesEl) {
    if (!mesEl || mesEl.dataset.sctProcessed) return;
    mesEl.dataset.sctProcessed = 'true';

    const s = getSettings();
    const textEl = mesEl.querySelector('.mes_text');
    if (!textEl) return;

    // 1. 扫描并替换 <image>prompt</image> 标签
    const textHtml = textEl.innerHTML;
    const tagRegex = /<image>([\s\S]*?)<\/image>|<img_prompt>([\s\S]*?)<\/img_prompt>/gi;
    let match;
    const promptsToDraw = [];

    while ((match = tagRegex.exec(textHtml)) !== null) {
      const prompt = (match[1] || match[2] || '').trim();
      if (prompt) promptsToDraw.push({ raw: match[0], prompt: prompt });
    }

    if (promptsToDraw.length > 0) {
      promptsToDraw.forEach((item, idx) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'sct-comfy-card-container';
        cardContainer.dataset.sctPrompt = item.prompt;

        textEl.innerHTML = textEl.innerHTML.replace(item.raw, `<div class="sct-comfy-slot" data-idx="${idx}"></div>`);
        const slot = textEl.querySelector(`.sct-comfy-slot[data-idx="${idx}"]`);
        if (slot) {
          slot.replaceWith(cardContainer);
        } else {
          textEl.appendChild(cardContainer);
        }

        if (s.comfyAutoDrawTags) {
          triggerComfyDraw(item.prompt, cardContainer);
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
            triggerComfyDraw(item.prompt, cardContainer);
          });
        }
      });
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
            triggerComfyDraw(userPrompt.trim(), container);
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
     7. 斜杠命令支持 (Slash Commands)
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
      triggerComfyDraw(p, container);
    }, [], '直接使用 ComfyUI 根据提示词生成插画', true, true);

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
     8. 原生设置面板与魔杖菜单 (Settings UI & Menu Injection)
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
          <b>🎨 ComfyUI 绘图 & 🔊 TTS 语音朗读 (原生独立版)</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content" style="display: block;">
          
          <!-- ComfyUI 板块 -->
          <div class="sct-settings-section">
            <div class="sct-settings-section-title purple">
              <span>🎨</span>
              <span>ComfyUI 生图设置</span>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-comfy-enabled">启用 ComfyUI 生图功能</label>
              <input type="checkbox" id="sct-cfg-comfy-enabled" ${s.comfyEnabled ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-auto-draw">自动解析 &lt;image&gt; 标签生图</label>
              <input type="checkbox" id="sct-cfg-auto-draw" ${s.comfyAutoDrawTags ? 'checked' : ''} />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-mes-draw-btn">在每条消息下显示生图按钮</label>
              <input type="checkbox" id="sct-cfg-mes-draw-btn" ${s.comfyShowMesButton ? 'checked' : ''} />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-comfy-host">ComfyUI 服务地址 (默认 8188 端口)</label>
              <input type="text" id="sct-cfg-comfy-host" class="text_pole" placeholder="http://127.0.0.1:8188" value="${s.comfyHost || 'http://127.0.0.1:8188'}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-checkpoint">模型检查点权重 (Checkpoint)</label>
              <input type="text" id="sct-cfg-checkpoint" class="text_pole" placeholder="留空自动选择 ComfyUI 内首个可用模型" value="${s.comfyCheckpoint || ''}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-prompt-prefix">画风前缀提示词 (Prompt Prefix)</label>
              <input type="text" id="sct-cfg-prompt-prefix" class="text_pole" value="${s.comfyPromptPrefix || ''}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-prompt-suffix">画风后缀提示词 (Prompt Suffix)</label>
              <input type="text" id="sct-cfg-prompt-suffix" class="text_pole" value="${s.comfyPromptSuffix || ''}" />
            </div>

            <div class="sct-setting-col">
              <label for="sct-cfg-neg-prompt">通用负向提示词 (Negative Prompt)</label>
              <textarea id="sct-cfg-neg-prompt" class="text_pole" rows="2">${s.comfyNegativePrompt || ''}</textarea>
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-batch">每次生图张数 (1-4)</label>
              <input type="number" id="sct-cfg-batch" class="text_pole" min="1" max="4" style="width: 70px;" value="${s.comfyBatchCount || 1}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-steps">采样步数 (Steps)</label>
              <input type="number" id="sct-cfg-steps" class="text_pole" min="1" max="100" style="width: 70px;" value="${s.comfySteps || 20}" />
            </div>

            <div class="sct-setting-row">
              <label for="sct-cfg-cfg">CFG Scale</label>
              <input type="number" id="sct-cfg-cfg" class="text_pole" min="1" max="30" step="0.5" style="width: 70px;" value="${s.comfyCfg || 7.0}" />
            </div>

            <div class="sct-test-btn-group">
              <button type="button" class="sct-comfy-btn" id="sct-btn-test-comfy">📡 测试 ComfyUI 连接与模型探测</button>
            </div>
          </div>

          <!-- TTS 语音板块 -->
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

            <!-- Web Speech 音色 -->
            <div class="sct-setting-col" id="sct-wrap-voice-ws" style="${s.ttsEngine === 'webspeech' ? '' : 'display:none;'}">
              <label for="sct-cfg-voice">发音人音色 (Voice)</label>
              <select id="sct-cfg-voice" class="text_pole">
                <option value="">加载中…</option>
              </select>
            </div>

            <!-- OpenAI 兼容配置 -->
            <div id="sct-wrap-openai" style="${s.ttsEngine === 'openai' ? '' : 'display:none;'}">
              <div class="sct-setting-col" style="margin-bottom: 8px;">
                <label for="sct-cfg-openai-ep">API 端点 (如 https://api.openai.com)</label>
                <input type="text" id="sct-cfg-openai-ep" class="text_pole" placeholder="http://127.0.0.1:8000" value="${s.ttsOpenAiEndpoint || ''}" />
              </div>
              <div class="sct-setting-col" style="margin-bottom: 8px;">
                <label for="sct-cfg-openai-key">API Key (留空免鉴权)</label>
                <input type="password" id="sct-cfg-openai-key" class="text_pole" placeholder="sk-..." value="${s.ttsOpenAiKey || ''}" />
              </div>
              <div class="sct-setting-col" style="margin-bottom: 8px;">
                <label for="sct-cfg-openai-voice">音色名称 (如 alloy / echo / 角色名)</label>
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

    const drawerToggle = container.querySelector('.inline-drawer-toggle');
    const drawerContent = container.querySelector('.inline-drawer-content');
    drawerToggle.addEventListener('click', () => {
      const isHidden = drawerContent.style.display === 'none';
      drawerContent.style.display = isHidden ? 'block' : 'none';
      drawerToggle.querySelector('.inline-drawer-icon').className = isHidden 
        ? 'inline-drawer-icon fa-solid fa-circle-chevron-down down'
        : 'inline-drawer-icon fa-solid fa-circle-chevron-right right';
    });

    const voiceSelect = container.querySelector('#sct-cfg-voice');
    populateVoiceList(voiceSelect);
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = () => populateVoiceList(voiceSelect);
    }

    // 引擎切换展示联动
    const engineSelect = container.querySelector('#sct-cfg-tts-engine');
    const wrapWs = container.querySelector('#sct-wrap-voice-ws');
    const wrapOai = container.querySelector('#sct-wrap-openai');
    engineSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      saveSettings({ ttsEngine: val });
      wrapWs.style.display = val === 'webspeech' ? '' : 'none';
      wrapOai.style.display = val === 'openai' ? '' : 'none';
    });

    // 绑定改动保存
    container.querySelector('#sct-cfg-comfy-enabled').addEventListener('change', (e) => saveSettings({ comfyEnabled: e.target.checked }));
    container.querySelector('#sct-cfg-auto-draw').addEventListener('change', (e) => saveSettings({ comfyAutoDrawTags: e.target.checked }));
    container.querySelector('#sct-cfg-mes-draw-btn').addEventListener('change', (e) => saveSettings({ comfyShowMesButton: e.target.checked }));
    container.querySelector('#sct-cfg-comfy-host').addEventListener('input', (e) => saveSettings({ comfyHost: e.target.value.trim() }));
    container.querySelector('#sct-cfg-checkpoint').addEventListener('input', (e) => saveSettings({ comfyCheckpoint: e.target.value.trim() }));
    container.querySelector('#sct-cfg-prompt-prefix').addEventListener('input', (e) => saveSettings({ comfyPromptPrefix: e.target.value }));
    container.querySelector('#sct-cfg-prompt-suffix').addEventListener('input', (e) => saveSettings({ comfyPromptSuffix: e.target.value }));
    container.querySelector('#sct-cfg-neg-prompt').addEventListener('input', (e) => saveSettings({ comfyNegativePrompt: e.target.value }));
    container.querySelector('#sct-cfg-batch').addEventListener('change', (e) => saveSettings({ comfyBatchCount: parseInt(e.target.value, 10) || 1 }));
    container.querySelector('#sct-cfg-steps').addEventListener('change', (e) => saveSettings({ comfySteps: parseInt(e.target.value, 10) || 20 }));
    container.querySelector('#sct-cfg-cfg').addEventListener('change', (e) => saveSettings({ comfyCfg: parseFloat(e.target.value) || 7.0 }));

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

    // 探查 ComfyUI 连接
    container.querySelector('#sct-btn-test-comfy').addEventListener('click', async () => {
      const testBtn = container.querySelector('#sct-btn-test-comfy');
      const host = getCleanComfyHost();
      testBtn.textContent = '⏳ 正在探查 ComfyUI…';
      try {
        const statsRes = await fetch(`${host}/system_stats`);
        if (!statsRes.ok) throw new Error(`HTTP ${statsRes.status}`);
        const models = await fetchComfyObjectInfo(host);
        if (models && models.length > 0) {
          showToast(`成功连接 ComfyUI！探查到 ${models.length} 个模型 (默认推荐: ${models[0]})`, 'success');
          if (!container.querySelector('#sct-cfg-checkpoint').value) {
            container.querySelector('#sct-cfg-checkpoint').value = models[0];
            saveSettings({ comfyCheckpoint: models[0] });
          }
        } else {
          showToast(`成功连接 ComfyUI (${host})，服务就绪！`, 'success');
        }
      } catch (err) {
        showToast(`无法连通 ComfyUI (${host}): ${err.message}。请确保已启动 ComfyUI 且允许跨域`, 'error');
      } finally {
        testBtn.textContent = '📡 测试 ComfyUI 连接与模型探测';
      }
    });

    container.querySelector('#sct-btn-test-tts').addEventListener('click', () => {
      speakText('您好！这是 SillyTavern 纯净原生插件的语音朗读测试，祝您使用愉快！');
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
     9. 插件生命周期启动与事件监听 (Lifecycle)
     ========================================================================== */

  function init() {
    console.log(`[${DISPLAY_NAME}] 正在初始化纯净酒馆原生插件…`);

    bindSelectionListeners();
    registerSlashCommands();

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

      if (initChecks > 10) clearInterval(initTimer);
    }, 800);

    console.log(`[${DISPLAY_NAME}] 纯净原生插件就绪！`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
