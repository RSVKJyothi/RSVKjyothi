(function(){
  const state = {
    audioContext: null,
    analyser: null,
    scriptNode: null,
    gainNode: null,
    mediaSourceNode: null,
    micSourceNode: null,
    activeMediaEl: null, // audioEl or videoEl
    isMicActive: false,
    yin: null,
    a4Hz: 440,
    tonicHz: 261.63,
    notation: 'western',

    isAligning: false,
    words: [],
    wordBoundaries: [], // start timestamps in seconds
    mapping: null, // { words: [{text,start,end,expectedHz,expected}], ... }

    framePitchSamples: [], // {t, hz, prob}

    practice: {
      isActive: false,
      isPaused: false,
      startAt: 0,
      pausedAt: 0,
      currentWordIndex: 0,
      frames: [], // real-time practice frames
      stats: null,
    },

    draw: {
      rafId: null,
    },
  };

  // UI elements
  const els = {};

  function $(id){ return document.getElementById(id); }

  function setupUI(){
    els.fileInput = $('fileInput');
    els.micBtn = $('micBtn');
    els.playBtn = $('playBtn');
    els.stopBtn = $('stopBtn');

    els.audioEl = $('audioEl');
    els.videoEl = $('videoEl');

    els.waveCanvas = $('waveCanvas');
    els.waveCtx = els.waveCanvas.getContext('2d');

    els.detectedHz = $('detectedHz');
    els.detectedNote = $('detectedNote');
    els.expectedHz = $('expectedHz');
    els.expectedNote = $('expectedNote');
    els.centsDelta = $('centsDelta');
    els.pitchStatus = $('pitchStatus');

    els.notationSelect = $('notationSelect');
    els.a4Input = $('a4Input');
    els.tonicHzInput = $('tonicHzInput');
    els.a4Field = $('a4Field');
    els.tonicField = $('tonicField');

    els.loopStart = $('loopStart');
    els.loopEnd = $('loopEnd');
    els.enableLoop = $('enableLoop');
    els.trimStart = $('trimStart');
    els.trimEnd = $('trimEnd');

    els.startAlignBtn = $('startAlignBtn');
    els.nextWordBtn = $('nextWordBtn');
    els.finishAlignBtn = $('finishAlignBtn');
    els.exportMapBtn = $('exportMapBtn');
    els.importMapInput = $('importMapInput');

    els.lyricsInput = $('lyricsInput');
    els.wordContainer = $('wordContainer');

    els.startPracticeBtn = $('startPracticeBtn');
    els.pausePracticeBtn = $('pausePracticeBtn');
    els.resetPracticeBtn = $('resetPracticeBtn');

    els.stats = $('stats');

    // Event bindings
    els.fileInput.addEventListener('change', onPickFile);
    els.micBtn.addEventListener('click', onToggleMic);
    els.playBtn.addEventListener('click', onPlayPause);
    els.stopBtn.addEventListener('click', onStopPlayback);

    els.notationSelect.addEventListener('change', onNotationChange);
    els.a4Input.addEventListener('change', ()=>{ state.a4Hz = Number(els.a4Input.value) || 440; });
    els.tonicHzInput.addEventListener('change', ()=>{ state.tonicHz = Number(els.tonicHzInput.value) || 261.63; });

    els.loopStart.addEventListener('change', syncLoopBounds);
    els.loopEnd.addEventListener('change', syncLoopBounds);
    els.enableLoop.addEventListener('change', syncLoopBounds);

    els.startAlignBtn.addEventListener('click', onStartAlign);
    els.nextWordBtn.addEventListener('click', onNextWord);
    els.finishAlignBtn.addEventListener('click', onFinishAlign);
    els.exportMapBtn.addEventListener('click', onExportMapping);
    els.importMapInput.addEventListener('change', onImportMapping);

    els.startPracticeBtn.addEventListener('click', onStartPractice);
    els.pausePracticeBtn.addEventListener('click', onPausePractice);
    els.resetPracticeBtn.addEventListener('click', onResetPractice);

    onNotationChange();
  }

  async function ensureAudioGraph(){
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!state.analyser) {
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 2048;
      state.analyser.smoothingTimeConstant = 0.8;
    }
    if (!state.gainNode) {
      state.gainNode = state.audioContext.createGain();
      state.gainNode.gain.value = 1.0;
    }
    if (!state.scriptNode) {
      const bufferSize = 2048;
      state.scriptNode = state.audioContext.createScriptProcessor(bufferSize, 1, 1);
      const sampleRate = state.audioContext.sampleRate;
      state.yin = new window.PitchDetectorYIN(sampleRate, 0.1);
      state.scriptNode.addEventListener('audioprocess', onAudioProcess);
    }
  }

  function connectSourceNode(sourceNode){
    if (state.mediaSourceNode && state.mediaSourceNode !== sourceNode) {
      try { state.mediaSourceNode.disconnect(); } catch {}
    }
    sourceNode.connect(state.analyser);
    state.analyser.connect(state.gainNode);
    state.gainNode.connect(state.scriptNode);
    state.scriptNode.connect(state.audioContext.destination);
  }

  function disconnectMic(){
    if (state.micSourceNode) {
      try { state.micSourceNode.disconnect(); } catch {}
      state.micSourceNode = null;
    }
    state.isMicActive = false;
    els.micBtn.textContent = 'Use Microphone';
  }

  async function onPickFile(evt){
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;

    await ensureAudioGraph();
    await state.audioContext.resume();

    // Reset mic if active
    disconnectMic();

    // Reset media elements
    const isAudio = file.type.startsWith('audio/');
    const isVideo = file.type.startsWith('video/');

    const url = URL.createObjectURL(file);
    els.audioEl.style.display = isAudio ? 'block' : 'none';
    els.videoEl.style.display = isVideo ? 'block' : 'none';

    if (isAudio) {
      els.audioEl.src = url;
      state.activeMediaEl = els.audioEl;
    } else if (isVideo) {
      els.videoEl.src = url;
      state.activeMediaEl = els.videoEl;
    } else {
      alert('Unsupported file. Please choose audio or video.');
      return;
    }

    // Connect media element to audio graph
    try {
      if (state.mediaSourceNode) { try { state.mediaSourceNode.disconnect(); } catch {} }
      state.mediaSourceNode = state.audioContext.createMediaElementSource(state.activeMediaEl);
      connectSourceNode(state.mediaSourceNode);
    } catch (err) {
      console.error('Failed to connect media source:', err);
    }

    els.playBtn.disabled = false;
    els.stopBtn.disabled = false;
    els.startAlignBtn.disabled = false;
    els.exportMapBtn.disabled = false;
    els.startPracticeBtn.disabled = false;
  }

  async function onToggleMic(){
    await ensureAudioGraph();
    await state.audioContext.resume();

    if (state.isMicActive) {
      disconnectMic();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      state.micSourceNode = state.audioContext.createMediaStreamSource(stream);
      connectSourceNode(state.micSourceNode);
      state.isMicActive = true;
      els.micBtn.textContent = 'Stop Microphone';
      // When mic is active, stop media playback
      if (state.activeMediaEl) {
        try { state.activeMediaEl.pause(); } catch {}
      }
    } catch (err) {
      alert('Microphone access denied or unavailable.');
      console.error(err);
    }
  }

  async function onPlayPause(){
    if (!state.activeMediaEl) return;
    await state.audioContext.resume();
    if (state.activeMediaEl.paused) {
      state.activeMediaEl.play();
    } else {
      state.activeMediaEl.pause();
    }
  }

  function onStopPlayback(){
    if (!state.activeMediaEl) return;
    try { state.activeMediaEl.pause(); } catch {}
    try { state.activeMediaEl.currentTime = 0; } catch {}
  }

  function onNotationChange(){
    state.notation = els.notationSelect.value;
    const isIndian = state.notation === 'indian';
    els.a4Field.style.display = isIndian ? 'none' : 'grid';
    els.tonicField.style.display = isIndian ? 'grid' : 'none';
  }

  function syncLoopBounds(){
    if (!state.activeMediaEl) return;
    const start = Number(els.loopStart.value) || 0;
    const end = Number(els.loopEnd.value) || 0;
    const shouldLoop = !!els.enableLoop.checked;

    function onTimeUpdate(){
      if (!shouldLoop) return;
      const t = state.activeMediaEl.currentTime;
      const effectiveEnd = end > 0 ? end : state.activeMediaEl.duration || 0;
      if (t >= effectiveEnd) {
        state.activeMediaEl.currentTime = start;
        if (state.activeMediaEl.paused) state.activeMediaEl.play();
      }
    }

    state.activeMediaEl.removeEventListener('timeupdate', onTimeUpdate);
    if (shouldLoop) {
      state.activeMediaEl.addEventListener('timeupdate', onTimeUpdate);
    }
  }

  function tokenizeLyrics(text){
    return text
      .replace(/\n/g, ' \n ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function renderWords(words){
    els.wordContainer.innerHTML = '';
    for (let i = 0; i < words.length; i++) {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = words[i];
      span.dataset.index = String(i);
      els.wordContainer.appendChild(span);
    }
  }

  function highlightWord(index, status){
    const children = els.wordContainer.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      el.classList.remove('current','ok','bad');
    }
    const target = els.wordContainer.querySelector(`[data-index="${index}"]`);
    if (target) {
      target.classList.add('current');
      if (status === 'ok') target.classList.add('ok');
      if (status === 'bad') target.classList.add('bad');
    }
  }

  function onStartAlign(){
    const text = els.lyricsInput.value.trim();
    if (!text) {
      alert('Paste lyrics first.');
      return;
    }
    state.words = tokenizeLyrics(text);
    renderWords(state.words);
    state.wordBoundaries = [ getPlaybackTime() ];
    state.framePitchSamples = [];
    state.isAligning = true;
    els.nextWordBtn.disabled = false;
    els.finishAlignBtn.disabled = false;
    // encourage playback to start
    if (state.activeMediaEl && state.activeMediaEl.paused) { state.activeMediaEl.play(); }
  }

  function getPlaybackTime(){
    if (state.activeMediaEl) return state.activeMediaEl.currentTime;
    // When using mic, align relative clock not available
    // Use accumulated clock if needed; for now return 0
    return 0;
  }

  function onNextWord(){
    if (!state.isAligning) return;
    const t = getPlaybackTime();
    state.wordBoundaries.push(t);
    const currentIndex = Math.min(state.wordBoundaries.length - 1, state.words.length - 1);
    highlightWord(currentIndex, undefined);
  }

  function onFinishAlign(){
    if (!state.isAligning) return;
    state.isAligning = false;

    // Ensure boundaries cover all words
    while (state.wordBoundaries.length < state.words.length + 1) {
      const last = state.wordBoundaries[state.wordBoundaries.length - 1] || 0;
      state.wordBoundaries.push(last + 0.25);
    }

    // Build mapping from collected frame samples
    const frames = state.framePitchSamples.slice();
    const wordItems = [];
    for (let i = 0; i < state.words.length; i++) {
      const start = state.wordBoundaries[i];
      const end = state.wordBoundaries[i+1];
      const segment = frames.filter(f => f.t >= start && f.t < end && f.hz);
      const expectedHz = medianHz(segment.map(s => s.hz));
      const expected = expectedHz ? formatNote(expectedHz) : { name: '—' };
      wordItems.push({ text: state.words[i], start, end, expectedHz: expectedHz || null, expected });
    }

    state.mapping = {
      createdAt: new Date().toISOString(),
      notation: state.notation,
      a4Hz: state.a4Hz,
      tonicHz: state.tonicHz,
      words: wordItems,
      lyrics: state.words.join(' '),
    };

    els.startPracticeBtn.disabled = false;
    alert('Alignment complete. You can export the mapping or start practice.');
  }

  function onExportMapping(){
    if (!state.mapping) { alert('No mapping yet. Align first or import.'); return; }
    const blob = new Blob([JSON.stringify(state.mapping, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'swar_mapping.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImportMapping(evt){
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.words)) throw new Error('Invalid mapping');
        state.mapping = data;
        els.lyricsInput.value = data.lyrics || '';
        state.words = data.words.map(w => w.text);
        renderWords(state.words);
        els.startPracticeBtn.disabled = false;
        alert('Mapping imported.');
      } catch (err) {
        alert('Invalid mapping file.');
      }
    };
    reader.readAsText(file);
  }

  function onStartPractice(){
    if (!state.mapping) { alert('Create or import a mapping first.'); return; }
    state.practice = {
      isActive: true,
      isPaused: false,
      startAt: performance.now(),
      pausedAt: 0,
      currentWordIndex: 0,
      frames: [],
      stats: null,
    };
    els.pausePracticeBtn.disabled = false;
    els.resetPracticeBtn.disabled = false;
    highlightWord(0, undefined);
  }

  function onPausePractice(){
    if (!state.practice.isActive) return;
    state.practice.isPaused = !state.practice.isPaused;
    els.pausePracticeBtn.textContent = state.practice.isPaused ? 'Resume' : 'Pause';
  }

  function onResetPractice(){
    state.practice = { isActive: false, isPaused: false, startAt: 0, pausedAt: 0, currentWordIndex: 0, frames: [], stats: null };
    els.pausePracticeBtn.disabled = true;
    els.resetPracticeBtn.disabled = true;
    els.pausePracticeBtn.textContent = 'Pause';
    highlightWord(-1);
    els.stats.textContent = '';
  }

  function computePracticeClock(){
    if (!state.practice.isActive) return 0;
    if (state.practice.isPaused) return state.practice.pausedAt;
    return performance.now() - state.practice.startAt;
  }

  function formatNote(hz){
    if (!hz) return { name: '—' };
    if (state.notation === 'indian') {
      const inName = window.Notes.indianNoteName(hz, state.tonicHz);
      return { name: inName.name, octave: inName.octave };
    }
    const wn = window.Notes.westernNoteName(hz, state.a4Hz);
    return { name: wn.name, solfege: wn.solfege, octave: wn.octave };
  }

  function medianHz(values){
    const arr = values.filter(v => typeof v === 'number' && isFinite(v) && v > 0);
    if (!arr.length) return null;
    arr.sort((a,b)=>a-b);
    const mid = Math.floor(arr.length/2);
    return arr.length % 2 ? arr[mid] : (arr[mid-1] + arr[mid]) / 2;
  }

  function onAudioProcess(evt){
    const input = evt.inputBuffer.getChannelData(0);
    if (!state.yin) return;

    const freq = state.yin.getPitch(input);
    const now = state.activeMediaEl ? state.activeMediaEl.currentTime : state.audioContext.currentTime;

    // Record frame for aligning
    if (state.isAligning && state.activeMediaEl) {
      state.framePitchSamples.push({ t: now, hz: freq || null, prob: state.yin.probability });
    }

    // Practice mode logic
    if (state.practice.isActive && !state.practice.isPaused) {
      const elapsedMs = computePracticeClock();
      const elapsedSec = elapsedMs / 1000;
      const words = state.mapping.words;
      const idx = Math.min(state.practice.currentWordIndex, words.length - 1);
      const current = words[idx];
      if (elapsedSec > current.end - words[0].start) {
        state.practice.currentWordIndex = Math.min(idx + 1, words.length - 1);
      }

      const expectedHz = current.expectedHz || null;
      const cents = (expectedHz && freq) ? window.Notes.centsBetween(freq, expectedHz) : null;
      const within = cents != null ? Math.abs(cents) <= 50 : null; // ±50 cents threshold
      state.practice.frames.push({ t: elapsedSec, hz: freq || null, expectedHz, cents, within });

      const status = within == null ? '—' : within ? 'On pitch' : 'Off pitch';
      els.pitchStatus.textContent = status;
      els.detectedHz.textContent = freq ? freq.toFixed(1) : '—';
      els.detectedNote.textContent = freq ? formatNote(freq).name : '—';
      els.expectedHz.textContent = expectedHz ? expectedHz.toFixed(1) : '—';
      els.expectedNote.textContent = expectedHz ? formatNote(expectedHz).name : '—';
      els.centsDelta.textContent = cents != null ? cents.toFixed(1) : '—';

      highlightWord(idx, within == null ? undefined : within ? 'ok' : 'bad');

      // End of practice condition
      if (idx === words.length - 1 && elapsedSec >= (words[words.length-1].end - words[0].start)) {
        finalizePractice();
      }
    } else {
      // Update passive readout
      els.detectedHz.textContent = freq ? freq.toFixed(1) : '—';
      els.detectedNote.textContent = freq ? formatNote(freq).name : '—';
    }
  }

  function finalizePractice(){
    state.practice.isActive = false;
    els.pausePracticeBtn.disabled = true;

    const frames = state.practice.frames;
    const valid = frames.filter(f => f.within != null);
    const correct = valid.filter(f => f.within);
    const accuracy = valid.length ? (100 * correct.length / valid.length) : 0;
    const cents = valid.map(f => Math.abs(f.cents || 0));
    const avgCents = cents.length ? (cents.reduce((a,b)=>a+b,0)/cents.length) : 0;

    const summary = [
      `Accuracy: ${accuracy.toFixed(1)}%`,
      `Avg cents off: ${avgCents.toFixed(1)}`,
      `Frames considered: ${valid.length}`,
    ].join('\n');

    els.stats.textContent = summary;
  }

  function drawLoop(){
    if (!state.analyser) return;
    const ctx = els.waveCtx;
    const { width, height } = els.waveCanvas;
    ctx.clearRect(0,0,width,height);

    // Draw baseline
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,width,height);

    // Draw waveform
    const timeData = new Uint8Array(state.analyser.frequencyBinCount);
    state.analyser.getByteTimeDomainData(timeData);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f62fe';
    ctx.beginPath();
    const slice = width / timeData.length;
    for (let i = 0; i < timeData.length; i++) {
      const v = timeData[i] / 128.0 - 1.0;
      const x = i * slice;
      const y = height/2 + v * height * 0.4;
      if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();

    // Draw expected pitch line if available
    const expectedHzText = els.expectedHz.textContent;
    const expectedHz = expectedHzText && expectedHzText !== '—' ? Number(expectedHzText) : null;
    const detectedHzText = els.detectedHz.textContent;
    const detectedHz = detectedHzText && detectedHzText !== '—' ? Number(detectedHzText) : null;

    const freqToY = (hz) => {
      // Map 80Hz..1000Hz to canvas height
      const minF = 80, maxF = 1000;
      const clamped = Math.max(minF, Math.min(maxF, hz));
      const norm = (Math.log(clamped) - Math.log(minF)) / (Math.log(maxF) - Math.log(minF));
      return height - norm * height;
    };

    if (expectedHz) {
      ctx.strokeStyle = '#1da851';
      ctx.setLineDash([6,6]);
      ctx.beginPath();
      const y = freqToY(expectedHz);
      ctx.moveTo(0,y); ctx.lineTo(width,y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (detectedHz) {
      const status = els.pitchStatus.textContent;
      ctx.fillStyle = status === 'On pitch' ? '#1da851' : '#d93025';
      const y = freqToY(detectedHz);
      ctx.beginPath();
      ctx.arc(width - 16, y, 6, 0, Math.PI*2);
      ctx.fill();
    }

    state.draw.rafId = requestAnimationFrame(drawLoop);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    setupUI();
    await ensureAudioGraph();
    drawLoop();
  });
})();
