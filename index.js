/**
 * SillyTavern ComfyUI 绘图 & TTS 语音朗读插件 (sillytavern-comfy-tts)
 * 
 * 功能亮点：
 * 1. ComfyUI 智能生图：自动解析 AI 回复中的 <image>prompt</image> 标签，驱动本地/远程 ComfyUI 引擎后台绘制；
 * 2. 轮播卡片交互：在消息中呈现多图滑动轮播、小圆点指示、触摸手势支持、全屏灯箱大图预览与重新生成；
 * 3. 划选文本即时语音朗读：手机触屏划选、电脑鼠标划选就地弹出「🔊 朗读选中文字」胶囊，一键原声发音；
 * 4. 消息一键朗读：自动剥离 <think> 思考过程、代码块与图像标签，只纯净朗读叙事内容；
 * 5. 多通道 TTS 支持：原生 Web Speech API 浏览器引擎（零门槛无依赖）、DSH 本地语音桥、自定义 HTTP 接口；
 * 6. 原生酒馆设置面板：在右侧扩展菜单注册控制面板，支持音色切换、语速调节、画风前缀后缀与尺寸配置。
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__sctExtensionLoaded) return;
  window.__sctExtensionLoaded = true;

  const MODULE_NAME = 'sillytavern-comfy-tts';
  const DISPLAY_NAME = 'ComfyUI 绘图 & TTS 语音朗读';

  // 默认配置
  const DEFAULT_SETTINGS = {
    // ComfyUI 设置
    comfyEnabled: true,
    comfyEndpointType: 'dsh', // 'dsh' (3092/3090) | 'direct' (ComfyUI 8188)
    comfyHost: '', // 留空则自动探测当前主机名:3092
    comfyDirectHost: 'http://127.0.0.1:8188',
    comfyAutoDrawTags: true,
    comfyShowMesButton: true,
    comfyPromptPrefix: '(masterpiece, best quality, highly detailed), ',
    comfyPromptSuffix: ', 8k, photorealistic, cinematic lighting',
    comfyNegativePrompt: '(worst quality, low quality:1.4), deformed, bad anatomy, bad hands, missing fingers, extra limbs, blurry, cropped, watermark',
    comfyBatchCount: 1,
    comfyWidth: 512,
    comfyHeight: 768,

    // TTS 设置
    ttsEnabled: true,
    ttsFloatingSelection: true,
    ttsShowMesButton: true,
    ttsFilterThinking: true,
    ttsEngine: 'webspeech', // 'webspeech' | 'dsh' | 'custom_http'
    ttsVoice: '',
    ttsRate: 1.0,
    ttsPitch: 1.0,
    ttsVolume: 1.0,
    ttsDshHost: '', // 留空则自动探测
    ttsCustomEndpoint: '',
  };

  // 状态变量
  let currentUtterance = null;
  let isTtsPlaying = false;
  let currentPlayingText = '';
  let ttsButton = null;
  let playingBadge = null;
  let selectedTextCache = '';
  let lastActionTime = 0;
  let lightboxEl = null;

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

  function getBridgeHost() {
    return (window.location && window.location.hostname) ? window.location.hostname : '127.0.0.1';
  }

  function getBridgePort() {
    return (typeof window !== 'undefined' && window.location && window.location.port === '3080') ? '3090' : '3092';
  }

  function getEffectiveComfyHost() {
    const s = getSettings();
    if (s.comfyHost && s.comfyHost.trim()) return s.comfyHost.trim().replace(/\/+$/, '');
    return `http://${getBridgeHost()}:${getBridgePort()}`;
  }

  function getEffectiveTtsHost() {
    const s = getSettings();
    if (s.ttsDshHost && s.ttsDshHost.trim()) return s.ttsDshHost.trim().replace(/\/+$/, '');
    return `http://${getBridgeHost()}:${getBridgePort()}`;
  }

  /* ==========================================================================
     2. 辅助提示工具 (Toast & Feedback)
     ========================================================================== */

  function showToast(msg, type = 'info') {
    if (typeof toastr !== 'undefined') {
      if (type === 'error') toastr.error(msg, DISPLAY_NAME);
      else if (type === 'success') toastr.success(msg, DISPLAY_NAME);
      else toastr.info(msg, DISPLAY_NAME);
      return;
    }
    console.log(`[${DISPLAY_NAME}] [${type}]`, msg);
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
     4. TTS 语音朗读核心引擎 (TTS Audio Engine)
     ========================================================================== */

  // 过滤掉思考标签、代码块、图像标签以及多余 markdown
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

    // 更新浮动胶囊
    if (ttsButton) {
      if (playing) {
        ttsButton.className = 'sct-tts-pill-btn sct-tts-playing';
        ttsButton.innerHTML = '<span>⏹</span> <span>停止朗读</span>';
      } else {
        ttsButton.className = 'sct-tts-pill-btn sct-tts-idle';
        ttsButton.innerHTML = '<span>🔊</span> <span>朗读选中文字</span>';
      }
    }

    // 更新全局悬浮徽章
    const badge = getGlobalTtsBadge();
    if (badge) {
      if (playing) {
        badge.style.display = 'flex';
        badge.innerHTML = '<span>🔊</span> <span>正在朗读… [点击停止]</span>';
      } else {
        badge.style.display = 'none';
      }
    }

    // 更新消息栏上的朗读按钮状态
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
      showToast('TTS 语音功能已在设置中关闭', 'warning');
      return;
    }

    // 如果正在播放且再次点击相同的文本，则停止
    if (isTtsPlaying) {
      stopTts();
      return;
    }

    setTtsPlayingState(true, text);

    // 引擎 1：原生 Web Speech API (零配置、跨平台完美兼容)
    if (s.ttsEngine === 'webspeech' || typeof window.speechSynthesis !== 'undefined') {
      if (s.ttsEngine === 'webspeech' || !window.DshaTts) {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          currentUtterance = utterance;

          utterance.rate = s.ttsRate || 1.0;
          utterance.pitch = s.ttsPitch || 1.0;
          utterance.volume = s.ttsVolume || 1.0;

          // 匹配音色
          const voices = window.speechSynthesis.getVoices();
          if (s.ttsVoice) {
            const matched = voices.find((v) => v.voiceURI === s.ttsVoice || v.name === s.ttsVoice);
            if (matched) utterance.voice = matched;
          } else {
            // 默认优先匹配中文
            const zhVoice = voices.find((v) => v.lang && (v.lang.startsWith('zh') || v.lang.startsWith('cmn')));
            if (zhVoice) utterance.voice = zhVoice;
          }

          utterance.onend = () => {
            currentUtterance = null;
            setTtsPlayingState(false);
          };

          utterance.onerror = (e) => {
            console.warn('[SCT_TTS] WebSpeech error', e);
            currentUtterance = null;
            setTtsPlayingState(false);
          };

          window.speechSynthesis.speak(utterance);
          return;
        } catch (err) {
          console.warn('[SCT_TTS] WebSpeech failed, fallback to DSH host', err);
        }
      }
    }

    // 引擎 2：DSH 本地通道 (Android 原生通道 / HTTP 桥)
    if (window.DshaTts && typeof window.DshaTts.postMessage === 'function') {
      try {
        window.DshaTts.postMessage(JSON.stringify({ action: 'speak', text: text }));
        startDshStatusPolling();
        return;
      } catch (err) {
        console.warn('[SCT_TTS] DshaTts WebMessage failed', err);
      }
    }

    const host = getEffectiveTtsHost();
    try {
      const res = await fetch(`${host}/app/tts?action=speak&text=${encodeURIComponent(text)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) {
        setTtsPlayingState(false);
        showToast(data.error || 'TTS 朗读失败', 'error');
      } else {
        startDshStatusPolling();
      }
    } catch (e) {
      setTtsPlayingState(false);
      showToast(`连接 TTS 服务失败: ${e.message}`, 'error');
    }
  }

  function stopTts() {
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.cancel();
      currentUtterance = null;
    }

    if (window.DshaTts && typeof window.DshaTts.postMessage === 'function') {
      try { window.DshaTts.postMessage(JSON.stringify({ action: 'stop' })); } catch (_) {}
    }

    const host = getEffectiveTtsHost();
    fetch(`${host}/app/tts?action=stop`).catch(() => {});

    setTtsPlayingState(false);
  }

  let statusPollTimer = null;
  function startDshStatusPolling() {
    if (statusPollTimer) clearInterval(statusPollTimer);
    const host = getEffectiveTtsHost();
    let pollCount = 0;

    statusPollTimer = setInterval(async () => {
      pollCount++;
      if (pollCount > 120) {
        clearInterval(statusPollTimer);
        setTtsPlayingState(false);
        return;
      }
      try {
        const res = await fetch(`${host}/app/tts?action=status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && !data.playing) {
          clearInterval(statusPollTimer);
          setTtsPlayingState(false);
        }
      } catch (_) {}
    }, 1000);
  }

  /* ==========================================================================
     5. 划选文本浮动胶囊 (Selection Floating Pill)
     ========================================================================= */

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

    // 边界检测
    const margin = 12;
    if (left < margin) left = margin;
    if (left + btnWidth > window.innerWidth - margin) {
      left = window.innerWidth - btnWidth - margin;
    }

    // 如果顶部空间不足，则置于划选下方
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

    // 点击其他空白区域收起
    document.addEventListener('mousedown', (e) => {
      if (ttsButton && !ttsButton.contains(e.target) && !isTtsPlaying) {
        ttsButton.style.display = 'none';
      }
    });
  }

  /* ==========================================================================
     6. ComfyUI 生图与轮播交互 (ComfyUI Generation & Carousel)
     ========================================================================== */

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

    const host = getBridgeHost();
    const currentUrl = images[safeIdx].replace('127.0.0.1', host);

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

    // 绑定点击大图预览
    const vp = container.querySelector(`#vp_${cardId}`);
    vp.querySelector('img').addEventListener('click', () => openLightbox(currentUrl));

    // 绑定触摸滑动 (Touch Swipe)
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

    // 左右按钮
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

    // 圆点点击
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

    // 重新生成按钮
    const retryBtn = container.querySelector('.sct-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerComfyDraw(promptText, container);
      });
    }
  }

  function renderLoadingCard(container, promptText) {
    container.innerHTML = `
      <div class="sct-comfy-card">
        <div class="sct-comfy-loading">
          <div class="sct-spinner"></div>
          <div class="sct-loading-text">🎨 ComfyUI 正在后台生成画面…</div>
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
          <div style="opacity: 0.8; font-size: 12px; margin-bottom: 8px;">${err || '未能连接到 ComfyUI 绘画服务'}</div>
          <button type="button" class="sct-comfy-btn sct-error-retry">🔄 重新尝试</button>
        </div>
      </div>
    `;
    container.querySelector('.sct-error-retry').addEventListener('click', () => {
      triggerComfyDraw(promptText, container);
    });
  }

  async function triggerComfyDraw(promptText, container) {
    const s = getSettings();
    if (!s.comfyEnabled) {
      showToast('ComfyUI 绘图功能未开启', 'warning');
      return;
    }

    renderLoadingCard(container, promptText);

    const fullPrompt = `${s.comfyPromptPrefix || ''}${promptText}${s.comfyPromptSuffix || ''}`.trim();
    const batch = s.comfyBatchCount || 1;

    // 通道 1：DSH 服务模式 (默认本地 3092/3090 端口)
    if (s.comfyEndpointType === 'dsh') {
      const host = getEffectiveComfyHost();
      try {
        // 触发异步生图
        const drawUrl = `${host}/app/comfy/draw?prompt=${encodeURIComponent(fullPrompt)}&count=${batch}&sync=0`;
        await fetch(drawUrl).catch(() => {});

        // 轮询查询图片就绪状态
        let attempts = 0;
        const maxAttempts = 80; // 80 * 1.5s = 120 秒超时

        const pollTimer = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            clearInterval(pollTimer);
            renderErrorCard(container, promptText, '生图等待超时（超过 120 秒）');
            return;
          }

          try {
            const queryUrl = `${host}/app/comfy/image?prompt=${encodeURIComponent(fullPrompt)}`;
            const res = await fetch(queryUrl);
            if (!res.ok) return;
            const data = await res.json();

            if (data.status === 'ready' && data.images && data.images.length > 0) {
              clearInterval(pollTimer);
              renderCarouselCard(container, data.images, promptText);
              showToast('ComfyUI 生图完成！', 'success');
            } else if (data.status === 'error') {
              clearInterval(pollTimer);
              renderErrorCard(container, promptText, data.error || '后台生成失败');
            }
          } catch (_) {}
        }, 1500);

      } catch (err) {
        renderErrorCard(container, promptText, err.message);
      }
    } else {
      // 通道 2：直连标准 ComfyUI (8188 端口)
      const comfyUrl = s.comfyDirectHost ? s.comfyDirectHost.replace(/\/+$/, '') : 'http://127.0.0.1:8188';
      try {
        // 发送简单标准文生图工作流至 /prompt
        const res = await fetch(`${comfyUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: {
              3: {
                class_type: "KSampler",
                inputs: {
                  cfg: 8,
                  denoise: 1,
                  latent_image: ["5", 0],
                  model: ["4", 0],
                  negative: ["7", 0],
                  positive: ["6", 0],
                  sampler_name: "euler",
                  scheduler: "normal",
                  seed: Math.floor(Math.random() * 1000000000),
                  steps: 20
                }
              },
              4: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "v1-5-pruned-emaonly.safetensors" } },
              5: { class_type: "EmptyLatentImage", inputs: { batch_size: batch, height: s.comfyHeight || 768, width: s.comfyWidth || 512 } },
              6: { class_type: "CLIPTextEncode", inputs: { clip: ["4", 1], text: fullPrompt } },
              7: { class_type: "CLIPTextEncode", inputs: { clip: ["4", 1], text: s.comfyNegativePrompt || "" } },
              8: { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
              9: { class_type: "SaveImage", inputs: { filename_prefix: "SillyTavern", images: ["8", 0] } }
            }
          })
        });

        if (!res.ok) throw new Error(`ComfyUI 响应异常 HTTP ${res.status}`);
        const data = await res.json();
        const promptId = data.prompt_id;
        if (!promptId) throw new Error('未获取到任务 prompt_id');

        // 轮询历史
        let pollCount = 0;
        const directTimer = setInterval(async () => {
          pollCount++;
          if (pollCount > 80) {
            clearInterval(directTimer);
            renderErrorCard(container, promptText, 'ComfyUI 任务处理超时');
            return;
          }

          try {
            const hRes = await fetch(`${comfyUrl}/history/${promptId}`);
            if (!hRes.ok) return;
            const hData = await hRes.json();
            const task = hData[promptId];
            if (task && task.outputs && task.outputs['9'] && task.outputs['9'].images) {
              clearInterval(directTimer);
              const outImages = task.outputs['9'].images.map(img => 
                `${comfyUrl}/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`
              );
              renderCarouselCard(container, outImages, promptText);
              showToast('ComfyUI 生图完成！', 'success');
            }
          } catch (_) {}
        }, 1500);

      } catch (e) {
        renderErrorCard(container, promptText, `直连 ComfyUI 失败: ${e.message}`);
      }
    }
  }

  /* ==========================================================================
     7. 消息 DOM 扫描与按钮注入 (Message Processing & DOM Injection)
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
        // 创建卡片占位容器
        const cardContainer = document.createElement('div');
        cardContainer.className = 'sct-comfy-card-container';
        cardContainer.dataset.sctPrompt = item.prompt;

        // 在 DOM 中找到对应标签位置并替换
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
          // 提供点击开始生图占位
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
      // 朗读按钮
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

      // 生图按钮
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
     8. 注册斜杠命令 (Slash Commands)
     ========================================================================== */

  function registerSlashCommands() {
    const ctx = getSTContext();
    if (!ctx) return;

    if (typeof ctx.registerSlashCommand === 'function') {
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
      }, [], '使用 ComfyUI 根据提示词生成插画', true, true);

      ctx.registerSlashCommand('tts', (args) => {
        const t = (args || '').trim();
        if (!t) {
          showToast('用法: /tts <需要朗读的文本>', 'warning');
          return;
        }
        speakText(t);
      }, [], '使用 TTS 语音朗读指定文本', true, true);
    }
  }

  /* ==========================================================================
     9. 扩展设置面板 (Settings UI & Menu)
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
          <b>🎨 ComfyUI 绘图 & 🔊 TTS 语音朗读</b>
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
              <label for="sct-cfg-endpoint-type">后端连接方式</label>
              <select id="sct-cfg-endpoint-type" class="text_pole">
                <option value="dsh" ${s.comfyEndpointType === 'dsh' ? 'selected' : ''}>DSH 本地桥服务 (3092/3090 端口，推荐)</option>
                <option value="direct" ${s.comfyEndpointType === 'direct' ? 'selected' : ''}>原生 ComfyUI 直连 (8188 端口)</option>
              </select>
            </div>

            <div class="sct-setting-col" id="sct-dsh-host-wrap">
              <label for="sct-cfg-comfy-host">DSH 服务地址 (留空自动匹配)</label>
              <input type="text" id="sct-cfg-comfy-host" class="text_pole" placeholder="http://127.0.0.1:3092" value="${s.comfyHost || ''}" />
            </div>

            <div class="sct-setting-col" id="sct-direct-host-wrap">
              <label for="sct-cfg-direct-host">ComfyUI 直连地址</label>
              <input type="text" id="sct-cfg-direct-host" class="text_pole" placeholder="http://127.0.0.1:8188" value="${s.comfyDirectHost || ''}" />
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

            <div class="sct-test-btn-group">
              <button type="button" class="sct-comfy-btn" id="sct-btn-test-comfy">📡 测试 ComfyUI 连接</button>
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
              <label for="sct-cfg-tts-engine">语音引擎</label>
              <select id="sct-cfg-tts-engine" class="text_pole">
                <option value="webspeech" ${s.ttsEngine === 'webspeech' ? 'selected' : ''}>浏览器原生 Web Speech API (推荐，即开即用)</option>
                <option value="dsh" ${s.ttsEngine === 'dsh' ? 'selected' : ''}>DSH 本地语音通道 (3092/3090/原生)</option>
              </select>
            </div>

            <div class="sct-setting-col" id="sct-voice-select-wrap">
              <label for="sct-cfg-voice">发音人音色 (Voice)</label>
              <select id="sct-cfg-voice" class="text_pole">
                <option value="">加载中…</option>
              </select>
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

    // 绑定展开/收起
    const drawerToggle = container.querySelector('.inline-drawer-toggle');
    const drawerContent = container.querySelector('.inline-drawer-content');
    drawerToggle.addEventListener('click', () => {
      const isHidden = drawerContent.style.display === 'none';
      drawerContent.style.display = isHidden ? 'block' : 'none';
      drawerToggle.querySelector('.inline-drawer-icon').className = isHidden 
        ? 'inline-drawer-icon fa-solid fa-circle-chevron-down down'
        : 'inline-drawer-icon fa-solid fa-circle-chevron-right right';
    });

    // 绑定音色列表加载
    const voiceSelect = container.querySelector('#sct-cfg-voice');
    populateVoiceList(voiceSelect);
    if (typeof window.speechSynthesis !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = () => populateVoiceList(voiceSelect);
    }

    // 绑定所有表单项的改动保存
    container.querySelector('#sct-cfg-comfy-enabled').addEventListener('change', (e) => saveSettings({ comfyEnabled: e.target.checked }));
    container.querySelector('#sct-cfg-auto-draw').addEventListener('change', (e) => saveSettings({ comfyAutoDrawTags: e.target.checked }));
    container.querySelector('#sct-cfg-mes-draw-btn').addEventListener('change', (e) => saveSettings({ comfyShowMesButton: e.target.checked }));
    container.querySelector('#sct-cfg-endpoint-type').addEventListener('change', (e) => saveSettings({ comfyEndpointType: e.target.value }));
    container.querySelector('#sct-cfg-comfy-host').addEventListener('input', (e) => saveSettings({ comfyHost: e.target.value.trim() }));
    container.querySelector('#sct-cfg-direct-host').addEventListener('input', (e) => saveSettings({ comfyDirectHost: e.target.value.trim() }));
    container.querySelector('#sct-cfg-prompt-prefix').addEventListener('input', (e) => saveSettings({ comfyPromptPrefix: e.target.value }));
    container.querySelector('#sct-cfg-prompt-suffix').addEventListener('input', (e) => saveSettings({ comfyPromptSuffix: e.target.value }));
    container.querySelector('#sct-cfg-neg-prompt').addEventListener('input', (e) => saveSettings({ comfyNegativePrompt: e.target.value }));
    container.querySelector('#sct-cfg-batch').addEventListener('change', (e) => saveSettings({ comfyBatchCount: parseInt(e.target.value, 10) || 1 }));

    container.querySelector('#sct-cfg-tts-enabled').addEventListener('change', (e) => saveSettings({ ttsEnabled: e.target.checked }));
    container.querySelector('#sct-cfg-float-sel').addEventListener('change', (e) => saveSettings({ ttsFloatingSelection: e.target.checked }));
    container.querySelector('#sct-cfg-mes-tts-btn').addEventListener('change', (e) => saveSettings({ ttsShowMesButton: e.target.checked }));
    container.querySelector('#sct-cfg-filter-think').addEventListener('change', (e) => saveSettings({ ttsFilterThinking: e.target.checked }));
    container.querySelector('#sct-cfg-tts-engine').addEventListener('change', (e) => saveSettings({ ttsEngine: e.target.value }));
    voiceSelect.addEventListener('change', (e) => saveSettings({ ttsVoice: e.target.value }));

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

    // 测试连接 ComfyUI 按钮
    container.querySelector('#sct-btn-test-comfy').addEventListener('click', async () => {
      const curS = getSettings();
      const testBtn = container.querySelector('#sct-btn-test-comfy');
      testBtn.textContent = '⏳ 测试中…';
      try {
        if (curS.comfyEndpointType === 'dsh') {
          const host = getEffectiveComfyHost();
          const res = await fetch(`${host}/app/comfy/image`);
          if (res.ok) showToast(`成功连通 DSH 绘图服务 (${host})`, 'success');
          else throw new Error(`HTTP ${res.status}`);
        } else {
          const direct = curS.comfyDirectHost ? curS.comfyDirectHost.replace(/\/+$/, '') : 'http://127.0.0.1:8188';
          const res = await fetch(`${direct}/system_stats`);
          if (res.ok) showToast(`成功连通 ComfyUI 服务 (${direct})`, 'success');
          else throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        showToast(`ComfyUI 服务连接失败: ${err.message}`, 'error');
      } finally {
        testBtn.textContent = '📡 测试 ComfyUI 连接';
      }
    });

    // 测试试听 TTS 按钮
    container.querySelector('#sct-btn-test-tts').addEventListener('click', () => {
      speakText('你好！这是 SillyTavern 智能语音朗读测试，祝您玩得愉快！');
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
      // 打开右侧抽屉并滚动至扩展设置
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
     10. 插件主生命周期初始化 (Initialization)
     ========================================================================== */

  function init() {
    console.log(`[${DISPLAY_NAME}] 正在初始化…`);

    // 划选浮动胶囊监听
    bindSelectionListeners();

    // 注册斜杠命令
    registerSlashCommands();

    // 监听消息渲染事件
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

    // DOM 轮询观察器兜底（确保无论何时翻页或切换楼层均能处理）
    const chatObserver = new MutationObserver(() => {
      scanAllMessages();
    });

    const targetChat = document.getElementById('chat');
    if (targetChat) {
      chatObserver.observe(targetChat, { childList: true, subtree: true });
    }

    // 扩展菜单与设置注入轮询
    let initChecks = 0;
    const initTimer = setInterval(() => {
      initChecks++;
      injectSettingsPanel();
      injectWandMenuButton();
      scanAllMessages();

      if (initChecks > 10) clearInterval(initTimer);
    }, 800);

    console.log(`[${DISPLAY_NAME}] 初始化就绪！`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
