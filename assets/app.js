/* 香港巴士抽獎機 — HK Bus Lottery
 * 純靜態：無框架、無後端，可直接放上 GitHub Pages。
 * 路線資料：優先即時抓 data.gov.hk 開放資料，失敗則用倉庫內 data/routes.json，再失敗用內置極簡清單。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('hkbl.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('hkbl.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  var CO_NAME = { KMB: '九巴', LWB: '龍運', CTB: '城巴', NLB: '嶼巴' };
  var CO_COLOR = { KMB: '#ff3d81', LWB: '#8b7bff', CTB: '#ffc93c', NLB: '#22e6c8' };

  /* 內置極簡清單：開 file:// 或連不到任何資料時的保底 */
  var BUILTIN = (function () {
    var spec = {
      KMB: '1A 2 5 6 7B 8 11 11K 12 14 16 18 21 26 27 28 35A 42C 46X 52X 58M 59X 60X 66X 68X 72 73X 74X 81 85 87D 89D 91M 92 98D 101 104 106 112 116 118 170 182 213X 234X 238X 241X 259D 260X 263 268B 268X 269B 271 276 281 286X 290 296C 297',
      LWB: 'A31 A33 A36 A41 E31 E33 E36 E42 S1 S64',
      CTB: '1 2 5B 6 7 8X 10 11 12 23 26 37A 40 70 72 77 85 91 96 970 793 A11 A21 E11 E22 N11',
      NLB: '2 3M 11 23 36 37 38 B2 B4 B6'
    };
    var out = [];
    Object.keys(spec).forEach(function (co) {
      spec[co].split(' ').forEach(function (r) { out.push({ co: co, route: r, orig: '', dest: '' }); });
    });
    return out;
  })();

  var state = {
    all: [],
    drawn: LS.get('drawn', []),
    history: LS.get('history', []),
    co: 'ALL',
    spinning: false,
    last: null,
    names: LS.get('names', ''),
    winners: LS.get('winners', [])
  };

  /* ---------- 音效（Web Audio，無需外部檔案） ---------- */
  var actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = false; } }
    return actx;
  }
  function beep(freq, dur, type, vol) {
    if (!$('opt-sound').checked && !$('opt-sound2').checked) return;
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.04, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  }
  function tick() { beep(420 + Math.random() * 260, 0.05, 'square', 0.03); }
  function fanfare() {
    var a = audio(); if (!a) return;
    [523, 659, 784, 1047].forEach(function (f, i) {
      setTimeout(function () { beep(f, 0.16, 'triangle', 0.07); }, i * 90);
    });
  }

  /* ---------- 資料載入 ---------- */
  function normalize(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (r) {
      if (!r || !r.route) return;
      var co = CO_NAME[r.co] ? r.co : (/^[A-Z]/.test(r.route) ? 'CTB' : 'KMB');
      var key = co + '|' + r.route;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ co: co, route: String(r.route), orig: r.orig || '', dest: r.dest || '' });
    });
    return out;
  }

  function liveSources() {
    return [
      { url: 'https://data.etabus.gov.hk/v1/transport/kmb/route/', map: function (j) {
          return j.data.filter(function (r) { return r.service_type === '1'; })
            .map(function (r) { return { co: r.co === 'LWB' ? 'LWB' : 'KMB', route: r.route, orig: r.orig_tc, dest: r.dest_tc }; });
        } },
      { url: 'https://rt.data.gov.hk/v2/transport/citybus/route/CTB', map: function (j) {
          return j.data.map(function (r) { return { co: 'CTB', route: r.route, orig: r.orig_tc, dest: r.dest_tc }; });
        } },
      { url: 'https://rt.data.gov.hk/v2/transport/nlb/route.php?action=list', map: function (j) {
          return (j.routes || []).map(function (r) {
            var p = (r.routeName_c || '').split('至');
            return { co: 'NLB', route: r.routeNo, orig: (p[0] || '').trim(), dest: (p[1] || '').trim() };
          });
        } }
    ];
  }

  function loadData() {
    var status = $('data-status');
    var wantLive = LS.get('optLive', true);
    $('opt-live').checked = wantLive;

    fetchJSON('data/routes.json').then(function (j) {
      if (j && j.routes && j.routes.length) {
        state.all = normalize(j.routes);
        state.base = '路線庫 ' + state.all.length + ' 條（資料時間：' + (j.generated || '—') +
          '）' + (j.sources && j.sources.indexOf('offline-fallback') >= 0 ? ' · 離線備用清單' : '');
        status.textContent = state.base;
        $('gen-time').textContent = j.generated ? '路線資料 ' + j.generated : '';
      } else { throw new Error('empty'); }
    }).catch(function () {
      state.all = normalize(BUILTIN);
      state.base = '用緊內置極簡清單（' + state.all.length + ' 條）。完整路線庫請用 GitHub Pages 或本機伺服器開啟。';
      status.textContent = state.base;
    }).then(function () {
      if (!wantLive) { refreshMeta(); return; }
      var jobs = liveSources().map(function (s) {
        return fetchJSON(s.url).then(function (j) { return s.map(j); }).catch(function () { return []; });
      });
      return Promise.all(jobs).then(function (groups) {
        var live = [];
        groups.forEach(function (g) { live = live.concat(normalize(g)); });
        if (live.length > 50) {
          state.all = live;
          var now = new Date();
          state.base = '即時路線庫 ' + live.length + ' 條 · 更新於 ' +
            now.getHours() + ':' + ('0' + now.getMinutes()).slice(-2) + '（來源：data.gov.hk）';
          status.textContent = state.base;
          $('gen-time').textContent = '即時資料取自 data.gov.hk';
        }
        refreshMeta();
      });
    });
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  /* ---------- 抽獎機動畫 ---------- */
  function roll(el, pool, finalText, duration) {
    return new Promise(function (resolve) {
      var start = performance.now(), last = 0;
      el.classList.add('spinning');
      function frame(now) {
        var p = Math.min(1, (now - start) / duration);
        var iv = 45 + p * p * 300;                 // 越滾越慢
        if (now - last >= iv) {
          last = now;
          el.textContent = pool[(Math.random() * pool.length) | 0];
          tick();
        }
        if (p < 1) { requestAnimationFrame(frame); return; }
        el.textContent = finalText;
        el.classList.remove('spinning');
        el.classList.add('pop');
        setTimeout(function () { el.classList.remove('pop'); }, 500);
        resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function buildReels(text) {
    var box = $('reels');
    box.innerHTML = '';
    var chars = String(text).split('');
    return chars.map(function (c) {
      var d = document.createElement('div');
      d.className = 'reel';
      d.textContent = '?';
      box.appendChild(d);
      return { el: d, ch: c };
    });
  }

  function pickRoute() {
    var pool = state.all.filter(function (r) { return state.co === 'ALL' || r.co === state.co; });
    if ($('opt-norepeat').checked) {
      var fresh = pool.filter(function (r) { return state.drawn.indexOf(r.co + '|' + r.route) < 0; });
      if (fresh.length) pool = fresh;
      else { state.drawn = []; LS.set('drawn', []); }   // 抽完一輪，重新開始
    }
    if (!pool.length) return null;
    return pool[(Math.random() * pool.length) | 0];
  }

  function spinBus() {
    if (state.spinning) return;
    if (!state.all.length) { $('data-status').textContent = '路線庫仲未載入好，等一秒再試。'; return; }
    var r = pickRoute();
    if (!r) return;

    state.spinning = true;
    $('btn-spin').disabled = true;
    $('btn-spin').textContent = '滾緊…';
    $('result').hidden = true;

    var reels = buildReels(r.route);
    var pool = state.all.map(function (x) { return x.route; });
    var jobs = reels.map(function (it, i) {
      var chars = [];
      pool.forEach(function (s) { String(s).split('').forEach(function (c) { if (chars.indexOf(c) < 0) chars.push(c); }); });
      if (chars.indexOf(it.ch) < 0) chars.push(it.ch);
      return roll(it.el, chars, it.ch, 900 + i * 420);
    });

    Promise.all(jobs).then(function () {
      state.spinning = false;
      $('btn-spin').disabled = false;
      $('btn-spin').textContent = '🎰 再抽一次';

      $('r-co').textContent = CO_NAME[r.co] || r.co;
      $('r-co').style.color = CO_COLOR[r.co] || 'var(--neon)';
      $('r-co').style.borderColor = (CO_COLOR[r.co] || '#22e6c8') + '66';
      $('r-co').style.background = (CO_COLOR[r.co] || '#22e6c8') + '22';
      $('r-orig').textContent = r.orig || '—';
      $('r-dest').textContent = r.dest || '—';
      $('r-meta').textContent = r.orig ? '路線 ' + r.route + ' · ' + (CO_NAME[r.co] || r.co) + ' · 起點出發，搭到總站！'
        : '路線 ' + r.route + ' · ' + (CO_NAME[r.co] || r.co) + '（離線清單，未載入起訖點）';
      $('result').hidden = false;

      state.last = r;
      if ($('opt-norepeat').checked) { state.drawn.push(r.co + '|' + r.route); LS.set('drawn', state.drawn); }
      var t = new Date();
      state.history.unshift({ co: r.co, route: r.route, orig: r.orig, dest: r.dest, time: t.getHours() + ':' + ('0' + t.getMinutes()).slice(-2) });
      state.history = state.history.slice(0, 60);
      LS.set('history', state.history);
      renderHistory();
      fanfare();
    });
  }

  /* ---------- 名單模式 ---------- */
  function namePool() {
    return $('name-input').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function renderListMeta() {
    $('list-meta').textContent = '共 ' + namePool().length + ' 個名 · 已抽出 ' + state.winners.length + ' 位';
    $('win-count').textContent = state.winners.length ? '(' + state.winners.length + ')' : '';
  }
  function spinName() {
    if (state.spinning) return;
    var pool = namePool();
    if (!pool.length) { $('name-display').innerHTML = '名單係空嘅<br><span>上面輸入幾個名先</span>'; return; }
    var winner = pool[(Math.random() * pool.length) | 0];
    state.spinning = true;
    $('btn-spin-name').disabled = true;
    $('btn-spin-name').textContent = '滾緊…';

    var el = $('name-display');
    el.classList.remove('placeholder');
    roll(el, pool, winner, 2400).then(function () {
      state.spinning = false;
      $('btn-spin-name').disabled = false;
      $('btn-spin-name').textContent = '🎰 再抽';
      state.winners.unshift({ name: winner, time: new Date().getHours() + ':' + ('0' + new Date().getMinutes()).slice(-2) });
      state.winners = state.winners.slice(0, 60);
      LS.set('winners', state.winners);
      if ($('opt-remove').checked) {
        var left = pool.filter(function (n) { return n !== winner; });
        $('name-input').value = left.join('\n');
        state.names = $('name-input').value; LS.set('names', state.names);
      }
      renderWinners(); renderListMeta(); fanfare();
    });
  }
  function renderWinners() {
    var ul = $('winners');
    ul.innerHTML = '';
    if (!state.winners.length) { ul.innerHTML = '<li class="empty">未有中獎者</li>'; return; }
    state.winners.forEach(function (w, i) {
      var li = document.createElement('li');
      li.innerHTML = '<b>' + esc(w.name) + '</b><span class="t">' + (i === 0 ? '最新' : '#' + (i + 1)) + ' · ' + w.time + '</span>';
      ul.appendChild(li);
    });
  }

  /* ---------- 共用 ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  function renderHistory() {
    var ul = $('history');
    ul.innerHTML = '';
    $('history-count').textContent = state.history.length ? '(' + state.history.length + ')' : '';
    if (!state.history.length) { ul.innerHTML = '<li class="empty">仲未抽過，撳上面個掣啦</li>'; return; }
    state.history.forEach(function (h) {
      var li = document.createElement('li');
      li.innerHTML = '<b>' + esc(h.route) + '</b><span class="t">' + esc(CO_NAME[h.co] || h.co) + ' · ' + h.time + '</span>';
      ul.appendChild(li);
    });
  }
  function refreshMeta() {
    var n = state.all.filter(function (r) { return state.co === 'ALL' || r.co === state.co; }).length;
    if (n) $('data-status').textContent = (state.base || '') + ' · 目前可抽 ' + n + ' 條';
  }
  function copy(text, btn) {
    if (!text) return;
    function ok() { if (!btn) return; var old = btn.textContent; btn.textContent = '✅ 已複製'; setTimeout(function () { btn.textContent = old; }, 1200); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () {});
    } else {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  /* ---------- 綁定 ---------- */
  function bind() {
    $('btn-spin').addEventListener('click', spinBus);
    $('btn-spin-name').addEventListener('click', spinName);
    $('btn-copy').addEventListener('click', function () {
      copy(state.last ? (CO_NAME[state.last.co] + ' ' + state.last.route +
        (state.last.orig ? '：' + state.last.orig + ' ➜ ' + state.last.dest : '')) : '', this);
    });
    $('btn-copy-name').addEventListener('click', function () {
      copy(state.winners.length ? state.winners[0].name : '', this);
    });
    $('btn-clear-history').addEventListener('click', function () {
      state.history = []; state.drawn = []; LS.set('history', []); LS.set('drawn', []); renderHistory();
    });
    $('btn-reset-name').addEventListener('click', function () {
      state.winners = []; LS.set('winners', []); renderWinners(); renderListMeta();
      $('name-display').className = 'reel placeholder';
      $('name-display').innerHTML = '輸入名單<br><span>每行一個</span>';
    });

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
        t.classList.add('active'); t.setAttribute('aria-selected', 'true');
        var bus = t.dataset.mode === 'bus';
        $('panel-bus').hidden = !bus;
        $('panel-list').hidden = bus;
      });
    });

    document.querySelectorAll('#co-chips .chip').forEach(function (c) {
      c.addEventListener('click', function () {
        document.querySelectorAll('#co-chips .chip').forEach(function (x) { x.classList.remove('active'); });
        c.classList.add('active');
        state.co = c.dataset.co;
      });
    });

    $('opt-norepeat').checked = LS.get('noRepeat', false);
    $('opt-norepeat').addEventListener('change', function () { LS.set('noRepeat', this.checked); });
    $('opt-live').addEventListener('change', function () { LS.set('optLive', this.checked); });
    $('opt-sound').checked = LS.get('sound', true);
    $('opt-sound').addEventListener('change', function () { LS.set('sound', this.checked); $('opt-sound2').checked = this.checked; });
    $('opt-sound2').checked = LS.get('sound', true);
    $('opt-sound2').addEventListener('change', function () { LS.set('sound', this.checked); $('opt-sound').checked = this.checked; });
    $('opt-remove').checked = LS.get('remove', true);
    $('opt-remove').addEventListener('change', function () { LS.set('remove', this.checked); });

    var inp = $('name-input');
    inp.value = state.names;
    inp.addEventListener('input', function () { state.names = inp.value; LS.set('names', inp.value); renderListMeta(); });

    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        $('panel-bus').hidden ? spinName() : spinBus();
      }
    });

    // 換成你自己的倉庫網址：改 index.html 裡 #gh-link 的 href 即可
    var gh = $('gh-link').getAttribute('href');
    if (gh && gh.indexOf('github.com/') > -1) { /* ok */ }
  }

  bind();
  loadData();
  renderHistory();
  renderWinners();
  renderListMeta();
})();
