/* Atlantyx TV — player e layout estilo Bloomberg (v3.153)
 * modos: tv (playlist circular) · layout (template do Egress do webinar / prévia) · sala (público do webinar) · convidado (entrevistado)
 * Sem dependências além do livekit-client (UMD, só nos modos de webinar) e da API de iframe do YouTube (só se houver vídeo do YouTube). */
(function () {
  'use strict';
  var C = window.ATV_CFG || {}, MODO = C.modo || 'tv', D = null, SEQ = [], idx = -1, timer = null, som = !!C.transmissao, ytPronto = null, cache = {}, room = null, vozes = [];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var fmt = function (v, d) { return v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); };
  var seta = function (p) { return p == null ? '' : (p >= 0 ? '<span class="up">▲ ' + fmt(Math.abs(p)) + '%</span>' : '<span class="dn">▼ ' + fmt(Math.abs(p)) + '%</span>'); };
  var LOGO = '/logo-atlantyx-branco.png';

  var CSS = '*{box-sizing:border-box}.atv{position:fixed;inset:0;display:grid;grid-template-rows:7.4vh 1fr 11.4vh;background:#000;color:#EAF0FF;font-family:Montserrat,Calibri,Arial,sans-serif}'
    + '.top{display:flex;align-items:center;gap:1.4vw;padding:0 1.6vw;background:linear-gradient(180deg,#0A0F1F,#000);border-bottom:.35vh solid #00C4CC}'
    + '.top img{height:3.6vh}.marca{font-weight:800;letter-spacing:.3vw;font-size:2.6vh;padding:.5vh .9vw;border:1px solid #1E2A52;border-radius:.6vh}.marca b{color:#00C4CC}'
    + '.prog{flex:1;font-size:2.2vh;font-weight:600;color:#AAB6D8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.live{display:flex;align-items:center;gap:.5vw;font-weight:800;font-size:1.9vh;letter-spacing:.15vw;background:#E0123A;color:#fff;padding:.6vh .8vw;border-radius:.5vh}'
    + '.live i{width:1.1vh;height:1.1vh;border-radius:50%;background:#fff;animation:pisca 1.2s infinite}@keyframes pisca{50%{opacity:.25}}.rel{text-align:right;font-variant-numeric:tabular-nums}.rel b{display:block;font-size:3vh}.rel span{font-size:1.5vh;color:#8E9BC0}'
    + '.meio{display:grid;grid-template-columns:1fr 25vw;gap:.8vw;padding:.9vh .9vw;min-height:0}'
    + '.palco{position:relative;background:#05070F;border:1px solid #1E2A52;border-radius:.8vh;overflow:hidden;min-height:0}#tela{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}'
    + '#tela video,#tela iframe{width:100%;height:100%;object-fit:contain;border:0;background:#000}'
    + '.lt{position:absolute;left:2vw;bottom:3vh;max-width:70%;display:none;animation:lt .7s ease}.lt.on{display:block}@keyframes lt{from{transform:translateX(-4vw);opacity:0}}'
    + '.lt1{background:#00C4CC;color:#000;font-weight:800;font-size:2.6vh;padding:.8vh 1.2vw;text-transform:uppercase;letter-spacing:.06vw}.lt2{background:rgba(6,10,24,.92);font-size:2vh;padding:.7vh 1.2vw;border-left:.5vw solid #00FCA8}'
    + '.bug{position:absolute;right:1.4vw;top:1.6vh;opacity:.85;display:flex;align-items:center;gap:.5vw;font-weight:800;font-size:1.6vh;letter-spacing:.2vw}.bug img{height:2.4vh}.bug b{color:#00C4CC}'
    + '.lado{display:flex;flex-direction:column;gap:.8vh;min-height:0}.bloco{background:#070B18;border:1px solid #1E2A52;border-radius:.8vh;padding:1vh .9vw;min-height:0;overflow:hidden}'
    + '.bloco h4{margin:0 0 .7vh;font-size:1.5vh;letter-spacing:.2vw;color:#00C4CC;font-weight:800;display:flex;justify-content:space-between}.bloco h4 small{color:#6E7BA0;font-weight:600;letter-spacing:0}'
    + '.mk{display:flex;justify-content:space-between;align-items:baseline;font-size:1.95vh;padding:.45vh 0;border-bottom:1px solid #121A36;font-variant-numeric:tabular-nums}.mk:last-child{border:0}.mk b{font-weight:700}.mk .v{font-weight:700}.up{color:#00FCA8;font-weight:700;font-size:1.6vh;margin-left:.5vw}.dn{color:#FF4D6D;font-weight:700;font-size:1.6vh;margin-left:.5vw}'
    + '.seg{font-size:1.85vh;padding:.55vh 0;border-bottom:1px solid #121A36;display:flex;gap:.6vw}.seg:last-child{border:0}.seg i{font-style:normal;color:#00C4CC;font-weight:800;min-width:1.6vw}.seg span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.prod{flex:1}.prod .n{font-size:2.6vh;font-weight:800;margin-top:.4vh}.prod .f{font-size:1.85vh;color:#AAB6D8;margin-top:.6vh;line-height:1.35}.prod .s{margin-top:1vh;font-size:1.6vh;color:#8E9BC0;line-height:1.6}'
    + 'footer{display:grid;grid-template-rows:5.6vh 5.8vh}.manch{display:flex;align-items:center;gap:1vw;background:#0A0F1F;border-top:1px solid #1E2A52;padding-right:1vw;min-width:0}'
    + '.tag{background:#00C4CC;color:#000;font-weight:800;height:100%;display:flex;align-items:center;padding:0 1.2vw;font-size:2vh;letter-spacing:.15vw}#manch{flex:1;font-size:2.3vh;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#fonte{font-size:1.6vh;color:#8E9BC0;white-space:nowrap}'
    + '.ticker{background:#000;border-top:1px solid #1E2A52;overflow:hidden;position:relative;display:flex;align-items:center}.trilho{display:inline-flex;white-space:nowrap;animation:corre linear infinite;will-change:transform}.trilho span{font-size:2.2vh;padding:0 1.4vw;font-weight:600}.trilho span.x{color:#00C4CC}'
    + '@keyframes corre{from{transform:translateX(0)}to{transform:translateX(-50%)}}'
    + '.card{position:absolute;inset:0;padding:4vh 3vw;display:flex;flex-direction:column;background:radial-gradient(ellipse at 20% 0%,#0B1A3A,#03050C 70%)}.card h2{margin:0;font-size:4.4vh;font-weight:800}.card h2 b{color:#00C4CC}.card .sub{color:#8E9BC0;font-size:1.9vh;margin-top:.6vh}'
    + '.gmk{display:grid;grid-template-columns:repeat(3,1fr);gap:1.6vh 1.2vw;margin-top:3vh}.gk{background:#0A1024;border:1px solid #1E2A52;border-radius:1vh;padding:2vh 1.2vw}.gk .l{font-size:1.8vh;color:#8E9BC0;font-weight:700;letter-spacing:.1vw}.gk .v{font-size:5vh;font-weight:800;margin-top:.6vh;font-variant-numeric:tabular-nums}.gk .up,.gk .dn{font-size:2.4vh;margin:0}'
    + '.nt{margin-top:2.4vh;display:flex;flex-direction:column;gap:1.4vh}.nt div{border-left:.45vw solid #00C4CC;padding:.4vh 1vw}.nt b{display:block;font-size:2.7vh}.nt span{font-size:1.8vh;color:#AAB6D8}.nt em{font-style:normal;color:#00C4CC;font-size:1.5vh;font-weight:700;letter-spacing:.1vw}'
    + '.pc{margin:auto 0;max-width:80%}.pc .k{font-size:2vh;color:#00C4CC;font-weight:800;letter-spacing:.3vw}.pc .n{font-size:8vh;font-weight:800;line-height:1.05;margin-top:1vh}.pc .f{font-size:3vh;color:#C8D2EE;margin-top:2vh;line-height:1.35}.pc ul{margin:3vh 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:1vh .8vw}.pc li{border:1px solid #1E2A52;border-radius:4vh;padding:.8vh 1.2vw;font-size:1.9vh;color:#AAB6D8}'
    + '.vin{position:absolute;inset:0;overflow:hidden;background:#000}.vin .bg{position:absolute;inset:-20%;background:conic-gradient(from 0deg,#000,#00303A,#000,#002A22,#000);animation:gira 25s linear infinite;opacity:.9}@keyframes gira{to{transform:rotate(360deg)}}'
    + '.vin .ln{position:absolute;left:-30%;width:160%;height:.25vh;background:linear-gradient(90deg,transparent,#00C4CC,transparent);animation:var 3s ease-in-out infinite}.vin .ln.b{animation-delay:1.4s;background:linear-gradient(90deg,transparent,#00FCA8,transparent)}@keyframes var{0%{top:-5%}100%{top:105%}}'
    + '.vin .ab{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 6vw}.vin img{height:9vh;animation:zoom 2.4s cubic-bezier(.2,.8,.2,1)}@keyframes zoom{from{transform:scale(.3);opacity:0;filter:blur(1vh)}}'
    + '.vin .m{font-size:7vh;font-weight:800;letter-spacing:1.2vw;margin-top:2vh;animation:sobe 1.2s .8s both}.vin .m b{color:#00C4CC}.vin .sl{font-size:2.4vh;color:#AAB6D8;margin-top:1vh;animation:sobe 1s 1.6s both}@keyframes sobe{from{transform:translateY(3vh);opacity:0}}'
    + '.vin .a{margin-top:5vh;animation:sobe 1s both;max-width:80%}.vin .a span{display:inline-block;background:#00C4CC;color:#000;font-weight:800;font-size:2vh;letter-spacing:.3vw;padding:.5vh 1vw}.vin .a h3{font-size:5vh;margin:1.4vh 0 0;font-weight:800}.vin .a p{font-size:2.5vh;color:#C8D2EE;margin:1vh 0 0}.vin .dp{margin-top:3vh;font-size:2vh;color:#8E9BC0;animation:sobe 1s both}'
    + '.vin .bar{position:absolute;left:0;bottom:0;height:.5vh;background:#00C4CC;animation:enche linear forwards}@keyframes enche{from{width:0}to{width:100%}}'
    + '.somp{position:absolute;right:1.4vw;bottom:1.6vh;background:rgba(0,0,0,.75);border:1px solid #1E2A52;border-radius:3vh;padding:.7vh 1.1vw;font-size:1.7vh;cursor:pointer;z-index:5}'
    + '.grid{position:absolute;inset:0;display:grid;gap:.5vw;padding:.5vw}.grid video{width:100%;height:100%;object-fit:cover;border-radius:.6vh;background:#0A1024}.pip{position:absolute;right:1.4vw;bottom:2vh;width:22%;aspect-ratio:16/9;border:2px solid #00C4CC;border-radius:.6vh;overflow:hidden;z-index:3}.pip video{width:100%;height:100%;object-fit:cover}'
    + '.nome{position:absolute;left:.8vw;bottom:.8vh;background:rgba(0,0,0,.7);font-size:1.6vh;padding:.3vh .6vw;border-radius:.4vh}.cel{position:relative;min-height:0}'
    + '.msg{margin:auto;text-align:center;color:#8E9BC0;font-size:2.4vh;padding:2vh}.msg h2{color:#EAF0FF;font-size:4vh;margin:0 0 1vh}.msg input{font:inherit;font-size:2.2vh;padding:1.2vh 1vw;border-radius:.8vh;border:1px solid #1E2A52;background:#0A1024;color:#fff;margin-top:2vh;width:60%}'
    + '.msg button,.ctl button{font:inherit;font-weight:800;font-size:2.1vh;background:#00C4CC;color:#000;border:0;border-radius:.8vh;padding:1.2vh 1.6vw;margin-top:2vh;cursor:pointer}.ctl{position:absolute;left:50%;transform:translateX(-50%);bottom:1.6vh;display:flex;gap:.6vw;z-index:6}.ctl button{margin:0;background:#0A1024;color:#fff;border:1px solid #1E2A52}.ctl button.off{background:#E0123A}'
    + '.prev{position:absolute;inset:0;object-fit:cover;width:100%;height:100%;opacity:.35}';

  function esqueleto() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    $('atv').innerHTML = '<div class="atv"><div class="top"><img src="/atlantyx-tv-logo.png" alt="Atlantyx TV" style="height:4.4vh" onerror="this.outerHTML=\'<img src=&quot;' + LOGO + '&quot; alt=&quot;Atlantyx&quot;><div class=&quot;marca&quot;>ATLANTYX <b>TV</b></div>\'"><div class="prog" id="prog"></div>'
      + '<div class="live" id="live"><i></i>AO VIVO</div><div class="rel"><b id="hora">--:--</b><span id="data"></span></div></div>'
      + '<div class="meio"><div class="palco"><div id="tela"><div class="msg">Carregando a Atlantyx TV…</div></div><div class="lt" id="lt"><div class="lt1" id="lt1"></div><div class="lt2" id="lt2"></div></div>'
      + '<div class="bug"><img src="' + LOGO + '" alt="" onerror="this.style.display=\'none\'"><span>TV</span></div></div>'
      + '<div class="lado"><div class="bloco"><h4>MERCADOS <small id="mkh"></small></h4><div id="mk"></div></div><div class="bloco"><h4 id="segT">A SEGUIR</h4><div id="seg"></div></div><div class="bloco prod" id="prod"></div></div></div>'
      + '<footer><div class="manch"><div class="tag">ÚLTIMAS</div><div id="manch"></div><div id="fonte"></div></div><div class="ticker"><div class="trilho" id="trilho"></div></div></footer></div>';
    relogio(); setInterval(relogio, 1000);
  }
  function relogio() { var a = new Date(); $('hora').textContent = a.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) + ' BRT';
    $('data').textContent = a.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }); }

  // ── barras laterais e de base ──
  var iProd = 0, iMan = 0, tProd = null, tMan = null;
  function barras() {
    var M = D.mercado || {}, L = (M.moedas || []).map(function (m) { return { n: m.nome, v: m.valor, p: m.var_pct, d: m.par === 'BTC-BRL' ? 0 : (m.valor > 100 ? 2 : 3) }; })
      .concat((M.acoes || []).map(function (a) { return { n: a.simbolo, v: a.valor, p: a.var_pct, d: a.simbolo === 'IBOV' ? 0 : 2 }; }));
    $('mk').innerHTML = L.slice(0, 8).map(function (x) { return '<div class="mk"><b>' + esc(x.n) + '</b><span><span class="v">' + fmt(x.v, x.d) + '</span>' + seta(x.p) + '</span></div>'; }).join('') || '<div class="seg"><span>cotações indisponíveis</span></div>';
    $('mkh').textContent = M.em ? 'atualizado ' + new Date(M.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
    var N = D.noticias || [], P = D.produtos || [], S = D.servicos || [];
    var itens = L.map(function (x) { return '<span>' + esc(String(x.n).toUpperCase()) + ' ' + fmt(x.v, x.d) + ' ' + (x.p == null ? '' : (x.p >= 0 ? '<b class="up">▲' : '<b class="dn">▼') + fmt(Math.abs(x.p)) + '%</b>') + '</span>'; })
      .concat(N.map(function (n) { return '<span>' + esc(n.titulo) + ' <small style="color:#6E7BA0">(' + esc(n.fonte) + ')</small></span>'; }))
      .concat(P.map(function (p) { return '<span class="x">' + esc(String(p.nome).toUpperCase()) + '</span><span>' + esc(p.frase) + '</span>'; }))
      .concat(S.map(function (s) { return '<span class="x">ATLANTYX</span><span>' + esc(s) + '</span>'; }))
      .concat((D.faixa || []).map(function (f) { return '<span class="x">●</span><span>' + esc(f) + '</span>'; }));
    var h = itens.join(''); $('trilho').innerHTML = h + h; $('trilho').style.animationDuration = Math.max(40, itens.length * 7) + 's';
    clearInterval(tProd); clearInterval(tMan);
    var mp = function () { if (!P.length) { $('prod').innerHTML = '<h4>ATLANTYX</h4><div class="f">' + esc(D.slogan || '') + '</div>'; return; } var p = P[iProd++ % P.length];
      $('prod').innerHTML = '<h4>PRODUTOS ATLANTYX <small>' + (((iProd - 1) % P.length) + 1) + '/' + P.length + '</small></h4><div class="n">' + esc(p.nome) + '</div><div class="f">' + esc(p.frase) + '</div>' + (S.length ? '<div class="s">' + S.slice(0, 4).map(esc).join(' · ') + '</div>' : ''); };
    var mm = function () { if (!N.length) { $('manch').textContent = D.slogan || 'Atlantyx TV'; $('fonte').textContent = ''; return; } var n = N[iMan++ % N.length]; $('manch').textContent = n.titulo; $('fonte').textContent = n.fonte + ' · texto IA Atlantyx'; };
    mp(); mm(); tProd = setInterval(mp, 12000); tMan = setInterval(mm, 9000);
  }
  function faixa(t1, t2) { var lt = $('lt'); if (!t1) { lt.className = 'lt'; return; } $('lt1').textContent = t1; $('lt2').textContent = t2 || ''; $('lt2').style.display = t2 ? '' : 'none'; lt.className = 'lt'; void lt.offsetWidth; lt.className = 'lt on'; }

  function api(q) { return fetch('/api/atv?' + q + '&_=' + Date.now()).then(function (r) { return r.json(); }).then(function (r) { if (!r.success) throw new Error(r.error || 'erro'); return r.dados; }); }
  var qDados = function () { return MODO === 'tv' ? 't=' + encodeURIComponent(C.cod) + '&dados=1' : MODO === 'layout' ? 't=' + encodeURIComponent(C.cod) + '&layout=' + encodeURIComponent(C.webinar_id) + '&dados=1' : (MODO === 'sala' ? 'sala=' : 'convidado=') + encodeURIComponent(C.tok) + '&dados=1'; };

  // ═════════ MODO TV: playlist circular ═════════
  function montarSeq() {
    var V = D.playlist || [], I = D.intercalar || {}, s = [], nv = 0, pi = 0, P = D.produtos || [];
    var extras = function () { nv++;
      if (I.mercado_cada && nv % I.mercado_cada === 0) s.push({ tipo: 'mercado', dur: I.mercado_s || 15, titulo: 'Mercados agora' });
      if (I.noticias_cada && nv % I.noticias_cada === 0 && (D.noticias || []).length) s.push({ tipo: 'noticias', dur: I.noticias_s || 20, titulo: 'Últimas notícias' });
      if (I.produto_cada && nv % I.produto_cada === 0 && P.length) { var p = P[pi++ % P.length]; s.push({ tipo: 'produto', p: p, dur: I.produto_s || 12, titulo: p.nome }); } };
    if (!V.length) { s.push({ tipo: 'vinheta', dur: I.vinheta_s || 25 }); s.push({ tipo: 'mercado', dur: I.mercado_s || 15, titulo: 'Mercados agora' }); if ((D.noticias || []).length) s.push({ tipo: 'noticias', dur: I.noticias_s || 20, titulo: 'Últimas notícias' }); P.forEach(function (p) { s.push({ tipo: 'produto', p: p, dur: I.produto_s || 12, titulo: p.nome }); }); return s; }
    V.forEach(function (v, i) { if (I.vinheta !== false) s.push({ tipo: 'vinheta', alvo: v, depois: V.length > 1 ? V[(i + 1) % V.length] : null, dur: I.vinheta_s || 25 }); s.push(v); extras(); });
    // playlist curta: cada intercalação ligada aparece pelo menos uma vez por volta
    var tem = function (t) { return s.some(function (x) { return x.tipo === t; }); };
    if (I.mercado_cada && !tem('mercado')) s.push({ tipo: 'mercado', dur: I.mercado_s || 15, titulo: 'Mercados agora' });
    if (I.noticias_cada && !tem('noticias') && (D.noticias || []).length) s.push({ tipo: 'noticias', dur: I.noticias_s || 20, titulo: 'Últimas notícias' });
    if (I.produto_cada && !tem('produto') && P.length) { var p0 = P[0]; s.push({ tipo: 'produto', p: p0, dur: I.produto_s || 12, titulo: p0.nome }); }
    return s;
  }
  function proximos(n) { var o = [], k = idx; for (var j = 1; j < SEQ.length * 2 && o.length < n; j++) { var x = SEQ[(k + j) % SEQ.length]; if (x.tipo === 'video' || x.tipo === 'mercado' || x.tipo === 'noticias') o.push(x); } return o; }
  function limpar() { clearTimeout(timer); var t = $('tela'); var v = t.querySelector('video'); if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (_) {} } t.innerHTML = ''; if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (_) {} }
  // ── v3.154: GRADE SINCRONIZADA PELO RELÓGIO — todo mundo vê o mesmo programa na mesma hora (como TV de verdade) ──
  var cum = [], T = 0, skew = 0, t0 = 0, dentro0 = 0;
  var GRADE = function () { return MODO === 'tv' && D && D.grade !== false && SEQ.length > 0; };
  function durDe(x) { return x.tipo === 'video' ? (x.dur || 180) : (x.dur || 15); }
  function preparar() { cum = []; T = 0; SEQ.forEach(function (x) { cum.push(T); T += durDe(x); }); }
  function agora() { return Date.now() + skew; }
  function ondeEstamos() { var e = Date.parse(D.grade_inicio) || 0, s = ((agora() - e) / 1000) % T; if (s < 0) s += T;
    for (var i = SEQ.length - 1; i >= 0; i--) if (cum[i] <= s) return { i: i, dentro: s - cum[i] }; return { i: 0, dentro: 0 }; }
  function sincronizar(ultimo) { if (!T) preparar(); var p = ondeEstamos();
    if (ultimo != null && p.i === ultimo && SEQ[ultimo].tipo === 'video') { var resta = durDe(SEQ[ultimo]) - p.dentro; if (resta > 1.5) return tPreencher(ultimo, resta); }
    tocar(p.i, p.dentro); }
  function proxima() { if (GRADE()) sincronizar(idx); else tocar(idx + 1); }
  function tPreencher(i, resta) { idx = i; limpar(); dentro0 = 0; tMercado({ dur: resta }); }
  var hhmm = function (ms) { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); };
  function seguir(ms) { clearTimeout(timer); timer = setTimeout(proxima, Math.max(300, ms)); }
  function restaMs(it) { return ((it.dur || durDe(it)) - dentro0) * 1000; }
  function tocar(n, dentro) {
    if (!SEQ.length) return; if (n >= SEQ.length) { recarregar(true); return; }
    idx = n; dentro0 = GRADE() ? Math.max(0, dentro || 0) : 0; t0 = agora() - dentro0 * 1000; var it = SEQ[idx]; limpar(); faixa(null);
    $('prog').textContent = it.tipo === 'video' ? it.titulo : it.tipo === 'vinheta' ? (D.nome || 'Atlantyx TV') + ' · ' + (D.slogan || '') : it.titulo || '';
    if (GRADE()) { var o = [], ac = t0 + durDe(it) * 1000; for (var j = 1; j < SEQ.length * 2 && o.length < 4; j++) { var x = SEQ[(idx + j) % SEQ.length]; if (x.tipo === 'video' || x.tipo === 'mercado' || x.tipo === 'noticias') o.push({ x: x, h: ac }); ac += durDe(x) * 1000; }
      $('segT').textContent = 'A SEGUIR · GRADE'; $('seg').innerHTML = o.map(function (y) { return '<div class="seg"><i style="min-width:3.6vw">' + hhmm(y.h) + '</i><span>' + esc(y.x.titulo) + '</span></div>'; }).join(''); }
    else $('seg').innerHTML = proximos(4).map(function (x, i) { return '<div class="seg"><i>' + (i + 1) + '</i><span>' + esc(x.titulo) + '</span></div>'; }).join('');
    try { ({ video: tVideo, vinheta: tVinheta, mercado: tMercado, noticias: tNoticias, produto: tProduto })[it.tipo](it); } catch (e) { seguir(2000); }
    prefetch();
  }
  function botaoSom() { if (som || C.transmissao) return ''; return '<div class="somp" id="somp">🔇 toque para ligar o som</div>'; }
  document.addEventListener('click', function () { if (MODO !== 'tv' || som) return; som = true; var v = $('tela').querySelector('video'); if (v) { v.muted = false; v.play().catch(function () {}); } if (window._yt) try { _yt.unMute(); } catch (_) {} var b = $('somp'); if (b) b.remove();
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {}); });
  function blobDe(it) {
    var k = it.m || it.e; if (cache[k]) return cache[k];
    cache[k] = (async function () { var P = []; for (var i = 0; i < it.partes; i++) { var r, t; for (t = 0; t < 3; t++) { r = await fetch('/api/atv?t=' + encodeURIComponent(C.cod) + '&parte=' + i + (it.m ? '&m=' + it.m : '&e=' + it.e)); if (r.ok) break; await new Promise(function (x) { setTimeout(x, 1500); }); }
      if (!r.ok) throw new Error('parte ' + i); P.push(await r.blob()); } return URL.createObjectURL(new Blob(P, { type: it.ct || 'video/mp4' })); })();
    cache[k].catch(function () { delete cache[k]; });
    var ks = Object.keys(cache); if (ks.length > 3) { var velho = ks[0]; Promise.resolve(cache[velho]).then(function (u) { try { URL.revokeObjectURL(u); } catch (_) {} }); delete cache[velho]; }
    return cache[k];
  }
  function prefetch() { for (var j = 1; j < 4; j++) { var x = SEQ[(idx + j) % SEQ.length]; if (x && x.tipo === 'video' && x.partes) { blobDe(x).catch(function () {}); break; } } }
  function tVideo(it) {
    faixa(it.titulo, it.subtitulo || it.chamada); setTimeout(function () { if (SEQ[idx] === it) $('lt').className = 'lt'; }, 9000);
    if (it.youtube_id) return tYoutube(it);
    var t = $('tela'); t.innerHTML = '<div class="msg">Carregando o vídeo…</div>' + botaoSom();
    var tocarSrc = function (src) { if (SEQ[idx] !== it) return; var v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.muted = !som; v.src = src;
      var off = GRADE() ? (agora() - t0) / 1000 : 0; if (GRADE() && it.dur && off >= it.dur - 1) return proxima();
      if (off > 1) v.addEventListener('loadedmetadata', function () { try { if (!v.duration || off < v.duration - 1) v.currentTime = off; } catch (_) {} }, { once: true });
      v.onended = function () { proxima(); }; v.onerror = function () { seguir(1500); };
      t.innerHTML = botaoSom(); t.insertBefore(v, t.firstChild); v.play().catch(function () { v.muted = true; v.play().catch(function () { seguir(2000); }); });
      seguir(GRADE() && it.dur ? (it.dur - off) * 1000 + 800 : 3 * 3600000); };
    if (it.url) return tocarSrc(it.url);
    blobDe(it).then(tocarSrc).catch(function () { seguir(1500); });
  }
  function carregarYT() { if (ytPronto) return ytPronto; ytPronto = new Promise(function (ok) { window.onYouTubeIframeAPIReady = ok; var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s); setTimeout(ok, 8000); }); return ytPronto; }
  function tYoutube(it) {
    $('tela').innerHTML = '<div id="ytp"></div>' + botaoSom();
    carregarYT().then(function () { if (SEQ[idx] !== it || !window.YT || !YT.Player) return seguir(1000);
      window._yt = new YT.Player('ytp', { videoId: it.youtube_id, playerVars: { autoplay: 1, mute: som ? 0 : 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, start: GRADE() ? Math.floor((agora() - t0) / 1000) : 0 },
        events: { onReady: function (e) { if (som) e.target.unMute(); e.target.playVideo(); }, onStateChange: function (e) { if (e.data === 0) proxima(); }, onError: function () { seguir(1500); } } });
      seguir(GRADE() && it.dur ? (it.dur - (agora() - t0) / 1000) * 1000 + 800 : 3 * 3600000); });
  }
  function jingle() { if (!som) return; try { var A = new (window.AudioContext || window.webkitAudioContext)(), t0 = A.currentTime + .05, g = A.createGain(); g.gain.value = .0001; g.connect(A.destination);
    g.gain.exponentialRampToValueAtTime(.18, t0 + .3); g.gain.exponentialRampToValueAtTime(.0001, t0 + 5.5);
    [[523.25, 0], [659.25, .35], [783.99, .7], [1046.5, 1.05], [783.99, 2.1], [1046.5, 2.45]].forEach(function (n) { var o = A.createOscillator(); o.type = 'triangle'; o.frequency.value = n[0]; o.connect(g); o.start(t0 + n[1]); o.stop(t0 + n[1] + 1.4); });
    var pad = A.createOscillator(), pg = A.createGain(); pad.type = 'sine'; pad.frequency.value = 130.81; pg.gain.value = .05; pad.connect(pg); pg.connect(A.destination); pad.start(t0); pad.stop(t0 + 5); setTimeout(function () { A.close(); }, 7000); } catch (_) {} }
  function falar(txt) { if (!som || !window.speechSynthesis) return; try { var u = new SpeechSynthesisUtterance(txt); u.lang = 'pt-BR'; u.rate = 1.02; var v = (vozes.length ? vozes : speechSynthesis.getVoices()).filter(function (x) { return /pt(-|_)BR/i.test(x.lang); })[0]; if (v) u.voice = v; speechSynthesis.speak(u); } catch (_) {} }
  if (window.speechSynthesis) try { speechSynthesis.onvoiceschanged = function () { vozes = speechSynthesis.getVoices(); }; } catch (_) {}
  function tVinheta(it) {
    var a = it.alvo, d = it.depois, ms = (it.dur || 25) * 1000;
    $('tela').innerHTML = '<div class="vin"><div class="bg"></div><div class="ln"></div><div class="ln b"></div><div class="ab" id="vab"><img src="' + LOGO + '" alt="Atlantyx" onerror="this.style.display=\'none\'"><div class="m">ATLANTYX <b>TV</b></div><div class="sl">' + esc(D.slogan || '') + '</div></div><div class="bar" style="animation-duration:' + ms + 'ms;animation-delay:-' + Math.round(dentro0 * 1000) + 'ms"></div></div>' + botaoSom();
    jingle(); var fase = setTimeout(function () { if (SEQ[idx] !== it || !a) return; var ab = $('vab'); if (!ab) return;
      ab.innerHTML = '<div class="m" style="font-size:4vh;animation:none">ATLANTYX <b>TV</b></div><div class="a"><span>A SEGUIR</span><h3>' + esc(a.titulo) + '</h3><p>' + esc(a.chamada || a.subtitulo || '') + '</p></div>' + (d && d.id !== a.id ? '<div class="dp">Depois: <b>' + esc(d.titulo) + '</b></div>' : '');
      if (dentro0 < 3) falar('Você está na ' + (D.nome || 'Atlantyx TV') + '. A seguir: ' + a.titulo + '. ' + (a.chamada || '')); }, Math.max(0, Math.min(7000, ms * .3) - dentro0 * 1000));
    if (!a && dentro0 < 3) falar('Você está na ' + (D.nome || 'Atlantyx TV') + '. ' + (D.slogan || ''));
    seguir(ms - dentro0 * 1000); void fase;
  }
  function tMercado(it) { var M = D.mercado || {}, L = (M.moedas || []).map(function (m) { return { n: m.nome, v: m.valor, p: m.var_pct, d: m.par === 'BTC-BRL' ? 0 : 3 }; }).concat((M.acoes || []).map(function (a) { return { n: a.nome, v: a.valor, p: a.var_pct, d: a.simbolo === 'IBOV' ? 0 : 2, pts: a.simbolo === 'IBOV' }; }));
    $('tela').innerHTML = '<div class="card"><h2>MERCADOS <b>AGORA</b></h2><div class="sub">' + (M.em ? 'Cotações de ' + new Date(M.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) + ' · podem ter atraso' : '') + '</div>'
      + '<div class="gmk">' + L.slice(0, 9).map(function (x) { return '<div class="gk"><div class="l">' + esc(String(x.n).toUpperCase()) + '</div><div class="v">' + (x.pts ? '' : 'R$ ') + fmt(x.v, x.d) + (x.pts ? ' <small style="font-size:2.2vh;color:#8E9BC0">pts</small>' : '') + '</div>' + seta(x.p) + '</div>'; }).join('') + '</div></div>';
    faixa('Mercados', 'Dólar, euro, bitcoin, Ibovespa e ações'); seguir(restaMs(it)); }
  function tNoticias(it) { var N = (D.noticias || []).slice(0, 5);
    $('tela').innerHTML = '<div class="card"><h2>ÚLTIMAS <b>NOTÍCIAS</b></h2><div class="sub">Selecionadas e escritas pela IA da Atlantyx a partir das fontes citadas</div><div class="nt">' + N.map(function (n) { return '<div><em>' + esc(String(n.fonte).toUpperCase()) + '</em><b>' + esc(n.titulo) + '</b><span>' + esc(n.resumo || '') + '</span></div>'; }).join('') + '</div></div>';
    seguir(restaMs(it)); }
  function tProduto(it) { var p = it.p || {};
    $('tela').innerHTML = '<div class="card"><div class="pc"><div class="k">PRODUTOS ATLANTYX</div><div class="n">' + esc(p.nome) + '</div><div class="f">' + esc(p.frase) + '</div><ul>' + (D.servicos || []).slice(0, 6).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div></div>';
    faixa(p.nome, 'Conheça na ' + (D.nome || 'Atlantyx TV')); seguir(restaMs(it)); }
  function comecar() { SEQ = montarSeq(); preparar(); if (GRADE()) sincronizar(); else tocar(0); }
  function recarregar(reiniciar) { var t1 = Date.now(); return api(qDados()).then(function (d) { if (d.agora) skew = d.agora - Math.round((t1 + Date.now()) / 2); D = d; barras(); if (reiniciar || !SEQ.length) comecar(); })
    .catch(function (e) { if (!D) $('tela').innerHTML = '<div class="msg"><h2>Sem sinal</h2>' + esc(e.message) + '<br>Tentando de novo…</div>'; else if (reiniciar) comecar(); setTimeout(function () { if (!D) recarregar(true); }, 20000); }); }

  // ═════════ MODOS WEBINAR (LiveKit) ═════════
  function lk() { return window.LivekitClient; }
  function desenharSala() {
    var t = $('tela'); if (!room) return; var LK = lk(), cams = [], tela = null;
    var todos = [room.localParticipant].concat(Array.from(room.remoteParticipants.values()));
    todos.forEach(function (p) { p.trackPublications.forEach(function (pub) { if (!pub.track || pub.kind !== 'video' || (pub.isMuted && pub.source !== LK.Track.Source.ScreenShare)) return;
      if (pub.source === LK.Track.Source.ScreenShare) tela = { p: p, t: pub.track }; else cams.push({ p: p, t: pub.track }); }); });
    var ctl = t.querySelector('.ctl'); t.innerHTML = '';
    var cel = function (x, cls) { var d = document.createElement('div'); d.className = cls || 'cel'; var v = x.t.attach(); v.muted = true; d.appendChild(v); var n = document.createElement('div'); n.className = 'nome'; n.textContent = x.p.name || x.p.identity; if (!/^pub-|^previa|^atx-/.test(x.p.identity)) d.appendChild(n); return d; };
    if (tela) { var g = document.createElement('div'); g.className = 'grid'; g.appendChild(cel(tela)); t.appendChild(g); if (cams[0]) t.appendChild(cel(cams[0], 'pip')); }
    else if (cams.length) { var g2 = document.createElement('div'); g2.className = 'grid'; var n = Math.min(cams.length, 6), c = n <= 1 ? 1 : n <= 4 ? 2 : 3; g2.style.gridTemplateColumns = 'repeat(' + c + ',1fr)'; cams.slice(0, 6).forEach(function (x) { g2.appendChild(cel(x)); }); t.appendChild(g2); }
    else t.innerHTML = '<div class="msg"><h2>' + esc(D && D.webinar ? D.webinar.titulo : 'Atlantyx TV') + '</h2>Aguardando o início da transmissão…</div>';
    if (ctl) t.appendChild(ctl);
  }
  function anexarAudio(track) { if (track.kind === 'audio') { var a = track.attach(); a.style.display = 'none'; document.body.appendChild(a); } }
  async function conectar(url, token) {
    var LK = lk(); if (!LK) throw new Error('Não carregou o módulo de vídeo — confira a internet');
    room = new LK.Room({ adaptiveStream: true, dynacast: true });
    ['trackSubscribed', 'trackUnsubscribed', 'participantConnected', 'participantDisconnected', 'trackMuted', 'trackUnmuted', 'localTrackPublished', 'localTrackUnpublished'].forEach(function (ev) { room.on(ev, function (a) { if (ev === 'trackSubscribed') anexarAudio(a); desenharSala(); }); });
    room.on('disconnected', function () { $('tela').innerHTML = '<div class="msg"><h2>Transmissão encerrada</h2>Obrigado pela audiência!</div>'; if (MODO === 'layout') console.log('END_RECORDING'); });
    await room.connect(url, token); desenharSala(); return room;
  }
  function pollWebinar() { setInterval(function () { api(qDados()).then(function (d) { var fx = (d.webinar || {}).faixa || {}, antes = JSON.stringify((D.webinar || {}).faixa || {}); D = d; barras(); if (JSON.stringify(fx) !== antes) faixa(fx.titulo, fx.subtitulo);
    if (d.webinar && d.webinar.status === 'encerrado' && MODO === 'layout') { console.log('END_RECORDING'); if (room) room.disconnect(); } }).catch(function () {}); }, 15000); }
  async function modoLayout() {
    var fx = (D.webinar || {}).faixa || {}; faixa(fx.titulo, fx.subtitulo); $('prog').textContent = (D.webinar || {}).titulo || '';
    $('segT').textContent = 'NESTE PROGRAMA'; $('seg').innerHTML = '<div class="seg"><span>' + esc((D.webinar || {}).titulo || '') + '</span></div>' + (fx.subtitulo ? '<div class="seg"><span>' + esc(fx.subtitulo) + '</span></div>' : '');
    var u = new URLSearchParams(location.search); var url = u.get('url') || C.lk_url, tk = u.get('token') || C.lk_token;
    if (!url || !tk) { $('tela').innerHTML = '<div class="msg"><h2>Layout da transmissão</h2>Esta página é aberta pelo servidor de transmissão.</div>'; return; }
    try { await conectar(url, tk); } catch (e) { $('tela').innerHTML = '<div class="msg"><h2>Sem conexão com a sala</h2>' + esc(e.message) + '</div>'; }
    setTimeout(function () { console.log('START_RECORDING'); }, 1500); pollWebinar();
  }
  async function modoSala() {
    var w = D.webinar || {}, fx = w.faixa || {}; $('prog').textContent = w.titulo || ''; faixa(fx.titulo, fx.subtitulo); $('segT').textContent = 'NESTE PROGRAMA';
    $('seg').innerHTML = '<div class="seg"><span>' + esc(w.titulo) + '</span></div>' + (w.inicio ? '<div class="seg"><span>' + new Date(w.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</span></div>' : '');
    var conv = MODO === 'convidado';
    $('tela').innerHTML = '<div class="msg">' + (conv ? '<video class="prev" id="pv" autoplay muted playsinline></video>' : '') + '<div style="position:relative"><h2>' + esc(w.titulo || 'Webinar Atlantyx') + '</h2>' + (conv ? 'Você foi convidado para participar ao vivo. Confira câmera e microfone e diga seu nome.' : 'Sala privada da Atlantyx TV. Diga seu nome para entrar.')
      + '<br><input id="nm" placeholder="Seu nome" maxlength="50"><br><button id="ent">' + (conv ? '🎙 Entrar ao vivo' : '▶ Entrar na sala') + '</button><div id="er" style="color:#FF4D6D;margin-top:1vh"></div></div></div>';
    var stream = null; if (conv && navigator.mediaDevices) navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function (s) { stream = s; var pv = $('pv'); if (pv) pv.srcObject = s; }).catch(function () { $('er').textContent = 'Libere a câmera e o microfone no cadeado da barra de endereço.'; });
    $('ent').onclick = async function () { var nm = $('nm').value.trim(); if (!nm) { $('er').textContent = 'Diga seu nome.'; return; } this.disabled = true; this.textContent = 'Entrando…';
      try { var r = await fetch('/api/atv?' + (conv ? 'convidado=' : 'sala=') + encodeURIComponent(C.tok) + '&tk=1&nome=' + encodeURIComponent(nm)).then(function (x) { return x.json(); }); if (!r.success) throw new Error(r.error);
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        await conectar(r.url, r.token); try { await room.startAudio(); } catch (_) {}
        if (conv) { await room.localParticipant.enableCameraAndMicrophone(); controles(); }
      } catch (e) { $('er').textContent = e.message; this.disabled = false; this.textContent = 'Tentar de novo'; } };
    pollWebinar();
  }
  function controles() { var c = document.createElement('div'); c.className = 'ctl';
    c.innerHTML = '<button id="bm">🎤 Microfone</button><button id="bc">📷 Câmera</button><button id="bs">✖ Sair</button>'; $('tela').appendChild(c);
    $('bm').onclick = async function () { var on = room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(!on); this.className = on ? 'off' : ''; };
    $('bc').onclick = async function () { var on = room.localParticipant.isCameraEnabled; await room.localParticipant.setCameraEnabled(!on); this.className = on ? 'off' : ''; desenharSala(); };
    $('bs').onclick = function () { room.disconnect(); }; desenharSala(); }

  esqueleto();
  if (MODO === 'tv') { recarregar(true); setInterval(function () { var t1 = Date.now(); api(qDados()).then(function (d) { if (d.agora) skew = d.agora - Math.round((t1 + Date.now()) / 2); var pl = JSON.stringify([D.playlist, D.intercalar, D.grade, D.grade_inicio]); D = d; barras();
      if (JSON.stringify([d.playlist, d.intercalar, d.grade, d.grade_inicio]) !== pl) { SEQ = montarSeq(); preparar(); if (idx >= SEQ.length) idx = -1; } }).catch(function () {}); }, 10 * 60000);
    document.addEventListener('keydown', function (e) { if (GRADE()) return; if (e.keyCode === 39) tocar(idx + 1); if (e.keyCode === 37) tocar(Math.max(0, idx - 1)); });
    window.__atv = { onde: function () { return ondeEstamos(); }, seq: function () { return SEQ; }, idx: function () { return idx; }, T: function () { return T; } };
    setTimeout(function () { location.reload(); }, 12 * 3600000); }
  else api(qDados()).then(function (d) { D = d; barras(); return MODO === 'layout' ? modoLayout() : modoSala(); })
    .catch(function (e) { $('tela').innerHTML = '<div class="msg"><h2>Sem sinal</h2>' + esc(e.message) + '</div>'; });
})();
