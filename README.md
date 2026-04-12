<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Atlantyx OS — Agentes S2 + S7</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#080910;--bg2:#0d0e17;--bg3:#111220;--bg4:#161728;--bg5:#1a1b2a;--bd:rgba(255,255,255,0.07);--bd2:rgba(255,255,255,0.13);--t1:#ecedfa;--t2:#7b7c9e;--t3:#44455a;--blue:#4f7cff;--blue2:rgba(79,124,255,0.12);--green:#22d3a3;--green2:rgba(34,211,163,0.1);--red:#ff5b5b;--gold:#f5a623;--gold2:rgba(245,166,35,0.1);--purple:#9c6dff;--pu2:rgba(156,109,255,0.1);--or:#f07030;--or2:rgba(240,112,48,0.12);--s7c:#f03070;--s72:rgba(240,48,112,0.12);--H:'Syne',sans-serif;--B:'DM Sans',sans-serif;--M:'DM Mono',monospace;--SB:218px;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:var(--bg);color:var(--t1);font-family:var(--B);font-size:13px;display:flex;min-height:100vh;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.2;}}
@keyframes dots{0%,33%{content:'.';}34%,66%{content:'..';}67%,100%{content:'...'}}
@keyframes fi{from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:none;}}
.sb{width:var(--SB);background:var(--bg2);border-right:1px solid var(--bd);position:fixed;top:0;left:0;bottom:0;z-index:100;display:flex;flex-direction:column;}
.sb-logo{padding:16px 14px 13px;border-bottom:1px solid var(--bd);}
.sb-name{font-family:var(--H);font-size:17px;font-weight:800;display:flex;align-items:center;gap:7px;letter-spacing:-.4px;}
.dot-logo{width:7px;height:7px;border-radius:50%;background:var(--blue);animation:pulse 2.5s infinite;flex-shrink:0;}
.sb-sub{font-family:var(--M);font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--t3);padding-left:14px;margin-top:3px;}
.sb-nav{flex:1;overflow-y:auto;padding:6px 0;}
.sb-sec{font-family:var(--M);font-size:7.5px;letter-spacing:2px;text-transform:uppercase;color:var(--t3);padding:9px 13px 3px;}
.sb-i{display:flex;align-items:center;gap:7px;padding:7px 13px;cursor:pointer;color:var(--t2);font-size:11.5px;border-left:2px solid transparent;transition:all .1s;white-space:nowrap;}
.sb-i:hover{color:var(--t1);background:rgba(255,255,255,0.025);}
.sb-i.active{color:var(--blue);border-left-color:var(--blue);background:var(--blue2);}
.sb-i.s2.active{color:var(--or);border-left-color:var(--or);background:var(--or2);}
.sb-i.s7.active{color:var(--s7c);border-left-color:var(--s7c);background:var(--s72);}
.bx{margin-left:auto;font-family:var(--M);font-size:7.5px;padding:1px 5px;border-radius:3px;}
.bx.gn{background:var(--green2);color:var(--green);}
.bx.bl{background:var(--blue2);color:var(--blue);}
.bx.of{background:var(--bg4);color:var(--t3);}
.bx.gd{background:var(--gold2);color:var(--gold);}
.sb-foot{padding:9px 13px;border-top:1px solid var(--bd);}
.sf{display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--t3);margin-bottom:3px;}
.dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.dot.on{background:var(--green);animation:pulse 2s infinite;}
.dot.w{background:var(--gold);}
.dot.off{background:var(--t3);}
.main{margin-left:var(--SB);flex:1;display:flex;flex-direction:column;}
.topbar{height:48px;background:var(--bg2);border-bottom:1px solid var(--bd);display:flex;align-items:center;padding:0 18px;gap:9px;position:sticky;top:0;z-index:50;}
.tb-t{font-family:var(--H);font-size:13.5px;font-weight:700;letter-spacing:-.3px;}
.tb-bc{font-family:var(--M);font-size:9px;color:var(--t2);}
.tb-r{margin-left:auto;display:flex;align-items:center;gap:7px;}
.ag-tag{font-family:var(--M);font-size:8.5px;padding:3px 8px;border-radius:4px;background:var(--green2);color:var(--green);border:1px solid rgba(34,211,163,0.2);}
.cnt{padding:16px;flex:1;}
.page{display:none;animation:fi .18s ease;}
.page.active{display:block;}
.sq-h{display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:13px 16px;border-radius:9px;}
.sq-h.s2{background:linear-gradient(135deg,rgba(240,112,48,.2),rgba(240,112,48,.06));border:1px solid rgba(240,112,48,.18);}
.sq-h.s7{background:linear-gradient(135deg,rgba(240,48,112,.2),rgba(240,48,112,.06));border:1px solid rgba(240,48,112,.18);}
.sq-num{font-family:var(--H);font-size:26px;font-weight:800;opacity:.13;}
.sq-inf{flex:1;}
.sq-t{font-family:var(--H);font-size:15px;font-weight:700;margin-bottom:2px;}
.sq-s{font-size:10.5px;color:var(--t2);}
.sq-stats{display:flex;gap:7px;}
.ss{font-family:var(--M);font-size:8.5px;padding:3px 8px;border-radius:4px;}
.ss.on{background:var(--green2);color:var(--green);border:1px solid rgba(34,211,163,.18);}
.ss.p{background:var(--gold2);color:var(--gold);border:1px solid rgba(245,166,35,.18);}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:11px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
.g5{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;}
.kpi{background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:11px;position:relative;overflow:hidden;}
.kpi::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
.kpi.bl::after{background:var(--blue);}
.kpi.gn::after{background:var(--green);}
.kpi.gd::after{background:var(--gold);}
.kpi.or::after{background:var(--or);}
.kpi.pk::after{background:var(--s7c);}
.kpi.pu::after{background:var(--purple);}
.kl{font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:5px;}
.kv{font-family:var(--M);font-size:17px;font-weight:700;}
.ks{font-size:9.5px;color:var(--t2);margin-top:3px;}
.ks.up{color:var(--green);}
.panel{background:var(--bg3);border:1px solid var(--bd);border-radius:9px;overflow:hidden;margin-bottom:11px;}
.ph{display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid var(--bd);gap:7px;}
.pt{font-family:var(--H);font-size:12.5px;font-weight:600;flex:1;}
.tag{font-family:var(--M);font-size:8px;padding:2px 7px;border-radius:4px;letter-spacing:.5px;text-transform:uppercase;}
.tag.live{background:var(--green2);color:var(--green);border:1px solid rgba(34,211,163,.2);}
.tag.on{background:var(--blue2);color:var(--blue);border:1px solid rgba(79,124,255,.2);}
.tag.hot{background:rgba(255,91,91,.1);color:var(--red);border:1px solid rgba(255,91,91,.2);}
.tag.off{background:var(--bg4);color:var(--t3);}
.pb{padding:13px;}
.ag-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;}
.ac{background:var(--bg4);border:1px solid var(--bd);border-radius:7px;padding:11px;transition:border-color .1s;}
.ac:hover{border-color:var(--bd2);}
.ac.on{border-color:rgba(34,211,163,.22);}
.ac-n{font-family:var(--M);font-size:7.5px;color:var(--t3);margin-bottom:3px;}
.ac-nm{font-size:12px;font-weight:600;margin-bottom:5px;}
.ac-d{font-size:10px;color:var(--t2);line-height:1.45;margin-bottom:9px;}
.ac-f{display:flex;align-items:center;justify-content:space-between;}
.ac-st{display:flex;align-items:center;gap:4px;font-family:var(--M);font-size:8px;}
.tg{width:25px;height:14px;border-radius:7px;cursor:pointer;position:relative;transition:background .12s;background:var(--bg2);border:1px solid var(--bd2);}
.tg.on{background:var(--green);}
.tg::after{content:'';position:absolute;width:8px;height:8px;border-radius:50%;background:#fff;top:2px;left:2px;transition:left .1s;}
.tg.on::after{left:13px;}
.tw{overflow-x:auto;}
table{width:100%;border-collapse:collapse;}
th{font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);padding:7px 10px;text-align:left;border-bottom:1px solid var(--bd);background:var(--bg2);}
td{padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.033);font-size:11px;}
tr:hover td{background:rgba(79,124,255,.03);}
.tb{font-family:var(--M);font-size:7.5px;padding:2px 6px;border-radius:3px;}
.sa{background:rgba(34,211,163,.12);color:var(--green);}
.sb_{background:var(--blue2);color:var(--blue);}
.sc{background:var(--bg4);color:var(--t3);}
.rfp-a{background:var(--gold2);color:var(--gold);}
.rfp-r{background:var(--pu2);color:var(--purple);}
.rfp-g{background:var(--green2);color:var(--green);}
.rfp-p{background:var(--blue2);color:var(--blue);}
.pg{display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-bottom:11px;}
.pc{background:var(--bg4);border-radius:7px;padding:8px;}
.pch{font-family:var(--M);font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;}
.pcnt{background:var(--bg);border-radius:3px;padding:1px 5px;font-family:var(--M);font-size:7.5px;}
.lc{background:var(--bg3);border:1px solid var(--bd);border-radius:5px;padding:7px;margin-bottom:4px;cursor:pointer;transition:border-color .1s;}
.lc:hover{border-color:var(--bd2);}
.lc-co{font-size:10.5px;font-weight:600;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lc-ct{font-size:9px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.lc-v{font-family:var(--M);font-size:8px;color:var(--gold);float:right;margin-top:2px;}
.wac{display:grid;grid-template-columns:300px 1fr;gap:11px;}
.fg{margin-bottom:10px;}
.fl{font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);display:block;margin-bottom:4px;}
.fi,.fsel,.fta{width:100%;background:var(--bg4);border:1px solid var(--bd);border-radius:6px;padding:7px 10px;color:var(--t1);font-family:var(--B);font-size:12px;outline:none;transition:border-color .1s;}
.fi:focus,.fsel:focus,.fta:focus{border-color:var(--blue);}
.fta{resize:vertical;min-height:72px;line-height:1.5;}
.btn{display:inline-flex;align-items:center;gap:5px;border:none;border-radius:6px;padding:7px 14px;font-family:var(--B);font-size:11.5px;font-weight:500;cursor:pointer;transition:all .1s;}
.btn-p{background:var(--blue);color:#fff;}
.btn-p:hover{opacity:.85;}
.btn-p:disabled{opacity:.4;cursor:not-allowed;}
.btn-g{background:var(--bg4);border:1px solid var(--bd);color:var(--t2);}
.btn-g:hover{border-color:var(--bd2);color:var(--t1);}
.btn-gn{background:var(--green2);border:1px solid rgba(34,211,163,.25);color:var(--green);}
.mb{background:var(--bg4);border:1px solid var(--bd);border-radius:7px;padding:13px;min-height:185px;font-size:12.5px;line-height:1.75;white-space:pre-wrap;}
.mp{color:var(--t3);font-style:italic;font-size:11.5px;}
.ld::after{content:'.';animation:dots 1.2s steps(3,end) infinite;}
::-webkit-scrollbar{width:3px;}
::-webkit-scrollbar-thumb{background:var(--bd2);border-radius:2px;}
.toast{position:fixed;bottom:18px;right:18px;background:var(--bg3);border:1px solid var(--bd2);border-radius:7px;padding:8px 13px;font-size:11px;z-index:999;opacity:0;transform:translateY(5px);transition:all .2s;pointer-events:none;}
.oc{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:11px;}
.ov{background:var(--bg4);border:1px solid var(--bd);border-radius:7px;padding:11px;text-align:center;}
.oi{font-size:16px;margin-bottom:4px;}
.oval{font-family:var(--M);font-size:18px;font-weight:700;}
.olb{font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-top:2px;}
</style>
</head>
<body>
<aside class="sb">
  <div class="sb-logo">
    <div class="sb-name"><span class="dot-logo"></span>Atlantyx OS</div>
    <div class="sb-sub">Painel de Agentes · v2.0</div>
  </div>
  <nav class="sb-nav">
    <div class="sb-sec">Geral</div>
    <div class="sb-i active" onclick="nav('dash',this)">
      <svg width="11" height="11" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
      Dashboard Geral
    </div>
    <div class="sb-sec">S2 · Marketing — 9 Agentes</div>
    <div class="sb-i s2" onclick="nav('s2ag',this)">
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="6.5"/></svg>
      Central de Agentes S2 <span class="bx gn">9</span>
    </div>
    <div class="sb-i s2" onclick="nav('s2wa',this)">
      <svg width="11" height="11" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1C4.1 1 1 4.1 1 8c0 1.2.3 2.4.9 3.4L1 15l3.7-.9c1 .5 2.1.9 3.3.9 3.9 0 7-3.1 7-7S11.9 1 8 1z"/></svg>
      Gerador WhatsApp IA <span class="bx gn">IA</span>
    </div>
    <div class="sb-i s2" onclick="nav('s2rfp',this)">
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 16 16"><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="8" y2="11"/></svg>
      Monitor de RFPs <span class="bx gd">3</span>
    </div>
    <div class="sb-i s2" onclick="nav('s2kpi',this)">
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 16 16"><polyline points="1,11 5,7 9,9 15,3"/></svg>
      KPIs Marketing
    </div>
    <div class="sb-sec">S7 · Vendas — 12 Agentes</div>
    <div class="sb-i s7" onclick="nav('s7ag',this)">
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="6.5"/></svg>
      Central de Agentes S7 <span class="bx gn">12</span>
    </div>
    <div class="sb-i s7" onclick="nav('s7pipe',this)">
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 16 16"><rect x="1" y="3" width="3" height="10" rx="1"/><rect x="6" y="5" width="3" height="8" rx="1"/><rect x="11" y="1" width="3" height="12" rx="1"/></svg>
      Pipeline + Forecast
    </div>
    <div class="sb-i s7" onclick="nav('s7out',this)">
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 16 16"><line x1="1" y1="8" x2="15" y2="8"/><polyline points="9,2 15,8 9,14"/></svg>
      Outreach Monitor
    </div>
    <div class="sb-i s7" onclick="nav('s7reu',this)">
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="11" rx="1.5"/><line x1="1" y1="7" x2="15" y2="7"/></svg>
      Agenda + Briefings
    </div>
    <div class="sb-i s7" onclick="nav('s7rfp',this)">
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 16 16"><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/></svg>
      RFPs + Propostas
    </div>
    <div class="sb-i s7" onclick="nav('s7kpi',this)">
      <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3"/></svg>
      Metas + KPIs Vendas
    </div>
  </nav>
  <div class="sb-foot">
    <div class="sf"><span class="dot on"></span>Claude API · Ativo</div>
    <div class="sf"><span class="dot on"></span>ICP Atlantyx · Carregado</div>
    <div class="sf"><span class="dot w"></span>WhatsApp API · Pendente Meta</div>
    <div class="sf"><span class="dot off"></span>HubSpot · Configurar</div>
  </div>
</aside>

<main class="main">
  <header class="topbar">
    <span class="tb-t">Atlantyx OS</span>
    <span class="tb-bc" id="tbc">/ Dashboard</span>
    <div class="tb-r">
      <span class="ag-tag" id="aCnt">● 6 ativos</span>
      <button class="btn btn-g" style="font-size:10px;padding:5px 9px;" onclick="toast('Sincronizado')">↻ Sync</button>
    </div>
  </header>
  <div class="cnt">

  <!-- DASHBOARD -->
  <div class="page active" id="page-dash">
    <div class="g5" style="margin-bottom:12px;">
      <div class="kpi or"><div class="kl">Leads Mapeados</div><div class="kv">12</div><div class="ks up">↑ Score A: 9</div></div>
      <div class="kpi gn"><div class="kl">Msgs WhatsApp</div><div class="kv">47</div><div class="ks">Agente S7 autônomo</div></div>
      <div class="kpi gd"><div class="kl">Reuniões</div><div class="kv">3</div><div class="ks up">↑ esta semana</div></div>
      <div class="kpi pk"><div class="kl">Responderam</div><div class="kv">8</div><div class="ks">17% taxa resposta</div></div>
      <div class="kpi pu"><div class="kl">Pipeline</div><div class="kv">R$7.6M</div><div class="ks up">12 oportunidades</div></div>
    </div>
    <div class="g2">
      <div class="panel"><div class="ph"><div class="pt">S2 · Marketing — 9 Agentes</div><span class="tag live">ATIVO</span></div><div class="pb" id="d-s2"></div></div>
      <div class="panel"><div class="ph"><div class="pt">S7 · Vendas — 12 Agentes</div><span class="tag live">ATIVO</span></div><div class="pb" id="d-s7"></div></div>
    </div>
    <div class="panel"><div class="ph"><div class="pt">ICP Atlantyx · Configurado</div><span class="tag on">Ativo nos agentes</span></div>
      <div class="pb" style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;">
        <div style="background:var(--bg4);border-radius:7px;padding:10px;border-left:2px solid var(--or);"><div style="font-family:var(--M);font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:4px;">Setores</div><div style="font-size:11px;line-height:1.6;">Energia · Automotivo<br>Varejo · Indústria</div></div>
        <div style="background:var(--bg4);border-radius:7px;padding:10px;border-left:2px solid var(--blue);"><div style="font-family:var(--M);font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:4px;">Porte</div><div style="font-size:11px;">R$100M–R$5B</div></div>
        <div style="background:var(--bg4);border-radius:7px;padding:10px;border-left:2px solid var(--s7c);"><div style="font-family:var(--M);font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:4px;">Decisores</div><div style="font-size:11px;line-height:1.6;">CIO · CTO · CFO<br>Dir.TI · Dir.Trans.Digital</div></div>
        <div style="background:var(--bg4);border-radius:7px;padding:10px;border-left:2px solid var(--green);"><div style="font-family:var(--M);font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:4px;">Problema Central</div><div style="font-size:10px;color:var(--t2);line-height:1.5;">Dados atrasados → decisão ruim → perda financeira</div></div>
      </div>
    </div>
  </div>

  <!-- S2 AGENTES -->
  <div class="page" id="page-s2ag">
    <div class="sq-h s2"><div class="sq-num">S2</div><div class="sq-inf"><div class="sq-t">Marketing Digital Ativo — 9 Agentes</div><div class="sq-s">Intel. de Mercado · Mapeamento · Cadastro Portais · RFPs · Campanhas · Conteúdo · SEO · Nutrição · Analytics</div></div><div class="sq-stats"><span class="ss on">● 3 Ativos</span><span class="ss p">6 Standby</span></div></div>
    <div class="ag-grid" id="s2g"></div>
  </div>

  <!-- S2 WA -->
  <div class="page" id="page-s2wa">
    <div class="sq-h s2"><div class="sq-num">S2</div><div class="sq-inf"><div class="sq-t">Agente de Mapeamento + Agente Gerador de Mensagens WhatsApp</div><div class="sq-s">Personalização por decisor e contexto · Claude IA · Follow-up automático 48h</div></div></div>
    <div class="wac">
      <div>
        <div class="panel"><div class="ph"><div class="pt">Dados do Lead</div><span class="tag on">Claude IA</span></div>
          <div class="pb">
            <div class="fg"><label class="fl">Empresa</label><input class="fi" id="wE" placeholder="Ex: Grupo Comgás"/></div>
            <div class="fg"><label class="fl">Decisor</label><input class="fi" id="wD" placeholder="Ex: Carlos Eduardo"/></div>
            <div class="fg"><label class="fl">Cargo</label><select class="fsel" id="wC"><option>CIO / Diretor de TI</option><option>CTO / Dir. Tecnologia</option><option>Dir. Transformação Digital</option><option>CFO / Dir. Financeiro</option><option>Dir. Operações</option><option>CEO / Presidente</option></select></div>
            <div class="fg"><label class="fl">Setor</label><select class="fsel" id="wS"><option>Energia (geração/distribuição)</option><option>Automotivo (concessionárias/redes)</option><option>Varejo (redes estruturadas)</option><option>Indústria / Manufatura</option><option>Construção Civil</option><option>Logística e Transporte</option></select></div>
            <div class="fg"><label class="fl">Contexto / Sinal de Compra</label><textarea class="fta" id="wX" placeholder="Ex: Empresa anunciou expansão de 3 plantas, precisa padronizar dados entre unidades..."></textarea></div>
            <div class="fg"><label class="fl">Tom</label><select class="fsel" id="wT"><option>Direto e objetivo — executivo</option><option>Consultivo — problema + solução</option><option>Provocativo — questiona o status quo</option><option>Referência — caso similar no setor</option></select></div>
            <div style="display:flex;gap:7px;"><button class="btn btn-p" style="flex:1;" id="btnG" onclick="genWA()">✦ Gerar com IA</button><button class="btn btn-g" onclick="clearWA()">✕</button></div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:11px;">
        <div class="panel" style="flex:1;"><div class="ph"><div class="pt">Mensagem Gerada pelo Agente S2</div><button class="btn btn-gn" id="btnCp" style="font-size:9px;padding:3px 8px;" onclick="cpWA()" disabled>Copiar</button></div>
          <div class="pb" style="display:flex;flex-direction:column;gap:9px;">
            <div class="mb" id="msgO"><span class="mp">Preencha os dados do decisor e clique em "Gerar com IA". O Agente S2 gera a mensagem personalizada com base no ICP da Atlantyx, no cargo e no contexto desta empresa.</span></div>
            <div id="mMeta" style="display:none;display:grid;grid-template-columns:repeat(3,1fr);gap:7px;">
              <div style="background:var(--bg4);border-radius:5px;padding:7px;"><div style="font-family:var(--M);font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);">Chars</div><div style="font-family:var(--M);font-size:13px;font-weight:600;" id="mC">0</div></div>
              <div style="background:var(--bg4);border-radius:5px;padding:7px;"><div style="font-family:var(--M);font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);">Score ICP</div><div style="font-family:var(--M);font-size:13px;font-weight:600;color:var(--green);" id="mSc">A</div></div>
              <div style="background:var(--bg4);border-radius:5px;padding:7px;"><div style="font-family:var(--M);font-size:7.5px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);">Leitura</div><div style="font-family:var(--M);font-size:13px;font-weight:600;" id="mR">~0s</div></div>
            </div>
          </div>
        </div>
        <div class="panel" id="fuP" style="display:none;"><div class="ph"><div class="pt">Follow-up Automático — 48h sem resposta</div><span class="tag on">Agente Auto</span></div><div class="pb"><div class="mb" id="fuO" style="min-height:75px;font-size:12px;"></div></div></div>
      </div>
    </div>
  </div>

  <!-- S2 RFP -->
  <div class="page" id="page-s2rfp">
    <div class="sq-h s2"><div class="sq-num">S2</div><div class="sq-inf"><div class="sq-t">Agente de Monitoramento de RFPs + Agente de Cadastro em Portais</div><div class="sq-s">ComprasNet · SAP Ariba · Beehive · Portais proprietários de grandes empresas</div></div></div>
    <div class="g2">
      <div class="panel"><div class="ph"><div class="pt">RFPs Identificados pelo Agente</div><span class="tag hot">3 Novos</span></div>
        <div class="tw"><table><thead><tr><th>Empresa</th><th>Portal</th><th>Prazo</th><th>Valor Est.</th><th>Compat.</th><th>Status</th></tr></thead><tbody>
          <tr><td><strong>Petrobras</strong></td><td style="color:var(--t2);">ComprasNet</td><td style="font-family:var(--M);font-size:9px;">25/05/26</td><td style="font-family:var(--M);font-size:9px;color:var(--gold);">R$2.8M</td><td><span class="tb sa">92%</span></td><td><span class="tb rfp-a">Analisando</span></td></tr>
          <tr><td><strong>Energisa</strong></td><td style="color:var(--t2);">Portal próprio</td><td style="font-family:var(--M);font-size:9px;">15/05/26</td><td style="font-family:var(--M);font-size:9px;color:var(--gold);">R$890k</td><td><span class="tb sa">88%</span></td><td><span class="tb rfp-r">Respondendo</span></td></tr>
          <tr><td><strong>COMGÁS</strong></td><td style="color:var(--t2);">SAP Ariba</td><td style="font-family:var(--M);font-size:9px;">02/06/26</td><td style="font-family:var(--M);font-size:9px;color:var(--gold);">R$420k</td><td><span class="tb sb_">76%</span></td><td><span class="tb rfp-a">Analisando</span></td></tr>
        </tbody></table></div>
      </div>
      <div class="panel"><div class="ph"><div class="pt">Cadastros como Fornecedor — Agente Ativo</div><span class="tag on">Automático</span></div>
        <div class="tw"><table><thead><tr><th>Portal</th><th>Empresa</th><th>Status</th><th>Documentação</th></tr></thead><tbody>
          <tr><td><strong>SAP Ariba</strong></td><td style="color:var(--t2);">Petrobras</td><td><span class="tb rfp-g">Aprovado ✓</span></td><td style="font-size:10px;color:var(--t2);">Completa</td></tr>
          <tr><td><strong>ComprasNet</strong></td><td style="color:var(--t2);">COMGÁS</td><td><span class="tb rfp-r">Em andamento</span></td><td style="font-size:10px;color:var(--t2);">85% enviada</td></tr>
          <tr><td><strong>Beehive</strong></td><td style="color:var(--t2);">Energisa</td><td><span class="tb rfp-a">Pendente doc.</span></td><td style="font-size:10px;color:var(--gold);">Certidão pendente</td></tr>
          <tr><td><strong>Portal GPA</strong></td><td style="color:var(--t2);">Grupo GPA</td><td><span class="tb rfp-a">Iniciando</span></td><td style="font-size:10px;color:var(--t2);">Formulário aberto</td></tr>
        </tbody></table></div>
      </div>
    </div>
  </div>

  <!-- S2 KPI -->
  <div class="page" id="page-s2kpi">
    <div class="sq-h s2"><div class="sq-num">S2</div><div class="sq-inf"><div class="sq-t">KPIs de Marketing — Painel Completo de Indicadores</div><div class="sq-s">Mídia Paga · Leads e Funil · SEO · E-mail e Outreach · RFPs · ROI de Marketing</div></div></div>
    <div style="font-family:var(--M);font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--or);margin-bottom:7px;">── MÍDIA PAGA</div>
    <div class="g5" style="margin-bottom:12px;">
      <div class="kpi or"><div class="kl">ROAS</div><div class="kv">4.2x</div><div class="ks up">↑ vs 3.1x mês ant.</div></div>
      <div class="kpi or"><div class="kl">CPC</div><div class="kv">R$8.40</div><div class="ks">LinkedIn Ads</div></div>
      <div class="kpi or"><div class="kl">CPL</div><div class="kv">R$127</div><div class="ks">Custo por Lead</div></div>
      <div class="kpi or"><div class="kl">CTR</div><div class="kv">3.8%</div><div class="ks up">↑ acima benchmark</div></div>
      <div class="kpi or"><div class="kl">Budget Usado</div><div class="kv">67%</div><div class="ks">R$3.4k / R$5k</div></div>
    </div>
    <div style="font-family:var(--M);font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--or);margin-bottom:7px;">── FUNIL DE LEADS</div>
    <div class="g5" style="margin-bottom:12px;">
      <div class="kpi bl"><div class="kl">Leads Totais</div><div class="kv">47</div><div class="ks">semana 1</div></div>
      <div class="kpi bl"><div class="kl">MQL</div><div class="kv">18</div><div class="ks">38% Lead→MQL</div></div>
      <div class="kpi bl"><div class="kl">SQL</div><div class="kv">8</div><div class="ks">44% MQL→SQL</div></div>
      <div class="kpi bl"><div class="kl">Custo/SQL</div><div class="kv">R$742</div><div class="ks">por qualificado</div></div>
      <div class="kpi bl"><div class="kl">Lead Score Méd.</div><div class="kv">7.4</div><div class="ks">score ICP 0-10</div></div>
    </div>
    <div style="font-family:var(--M);font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--or);margin-bottom:7px;">── ROI E RESULTADO</div>
    <div class="g4" style="margin-bottom:12px;">
      <div class="kpi gn"><div class="kl">CAC</div><div class="kv">R$8.2k</div><div class="ks">por cliente</div></div>
      <div class="kpi gn"><div class="kl">LTV/CAC</div><div class="kv">11.4x</div><div class="ks up">↑ meta >3x</div></div>
      <div class="kpi gn"><div class="kl">Receita Influenciada</div><div class="kv">R$3.2M</div><div class="ks">pelo marketing</div></div>
      <div class="kpi gn"><div class="kl">ROI Marketing</div><div class="kv">390%</div><div class="ks up">receita/investimento</div></div>
    </div>
    <div style="font-family:var(--M);font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--or);margin-bottom:7px;">── SEO · E-MAIL · RFPs</div>
    <div class="g4">
      <div class="kpi pu"><div class="kl">Posição Média SEO</div><div class="kv">8.3</div><div class="ks">keywords alvo</div></div>
      <div class="kpi pu"><div class="kl">Abertura E-mail</div><div class="kv">34%</div><div class="ks up">↑ benchmark 21%</div></div>
      <div class="kpi pu"><div class="kl">RFPs Identificados</div><div class="kv">3</div><div class="ks">esta semana</div></div>
      <div class="kpi pu"><div class="kl">Resp. Outreach C-Level</div><div class="kv">17%</div><div class="ks">taxa de resposta</div></div>
    </div>
  </div>

  <!-- S7 AGENTES -->
  <div class="page" id="page-s7ag">
    <div class="sq-h s7"><div class="sq-num">S7</div><div class="sq-inf"><div class="sq-t">Vendas Ativo — 12 Agentes Especializados</div><div class="sq-s">Prospecção · Id. RFPs · Resp. RFPs · Map. Decisores · Outreach WA · Outreach Ligação · Agendamento · Briefing · Pipeline · Propostas · Forecast · Expansão</div></div><div class="sq-stats"><span class="ss on">● 4 Ativos</span><span class="ss p">8 Standby</span></div></div>
    <div class="ag-grid" id="s7g"></div>
  </div>

  <!-- S7 PIPELINE -->
  <div class="page" id="page-s7pipe">
    <div class="sq-h s7"><div class="sq-num">S7</div><div class="sq-inf"><div class="sq-t">Agente de Pipeline + Agente de Forecast</div><div class="sq-s">Funil visual · Deals por etapa · Forecast semana/mês/trimestre · Cenários P/R/O</div></div></div>
    <div class="g5" style="margin-bottom:12px;">
      <div class="kpi pk"><div class="kl">Pipeline Total</div><div class="kv">R$7.6M</div><div class="ks up">12 oportunidades</div></div>
      <div class="kpi pk"><div class="kl">Coverage</div><div class="kv">3.8x</div><div class="ks up">↑ meta mês</div></div>
      <div class="kpi pk"><div class="kl">Velocidade</div><div class="kv">R$84k/d</div><div class="ks">por dia no funil</div></div>
      <div class="kpi pk"><div class="kl">Win Rate</div><div class="kv">28%</div><div class="ks">histórico</div></div>
      <div class="kpi pk"><div class="kl">Ticket Médio</div><div class="kv">R$635k</div><div class="ks">por deal</div></div>
    </div>
    <div class="pg" id="pgGrid"></div>
    <div class="panel"><div class="ph"><div class="pt">Forecast — Agente de Previsão de Receita</div><span class="tag on">Automático · Tempo Real</span></div>
      <div class="pb"><div class="g3">
        <div style="background:var(--bg4);border-radius:7px;padding:12px;border:1px solid rgba(255,91,91,.2);"><div style="font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--red);margin-bottom:5px;">Pessimista</div><div style="font-family:var(--M);font-size:20px;font-weight:700;color:var(--red);">R$1.8M</div><div style="font-size:9.5px;color:var(--t2);margin-top:2px;">Só deals avançados</div></div>
        <div style="background:var(--bg4);border-radius:7px;padding:12px;border:1px solid rgba(79,124,255,.25);"><div style="font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--blue);margin-bottom:5px;">Realista</div><div style="font-family:var(--M);font-size:20px;font-weight:700;color:var(--blue);">R$3.4M</div><div style="font-size:9.5px;color:var(--t2);margin-top:2px;">Pipeline atual + 28% win rate</div></div>
        <div style="background:var(--bg4);border-radius:7px;padding:12px;border:1px solid rgba(34,211,163,.25);"><div style="font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--green);margin-bottom:5px;">Otimista</div><div style="font-family:var(--M);font-size:20px;font-weight:700;color:var(--green);">R$5.2M</div><div style="font-size:9.5px;color:var(--t2);margin-top:2px;">Com RFPs ganhos</div></div>
      </div></div>
    </div>
  </div>

  <!-- S7 OUTREACH -->
  <div class="page" id="page-s7out">
    <div class="sq-h s7"><div class="sq-num">S7</div><div class="sq-inf"><div class="sq-t">Agente de Outreach WhatsApp + Outreach Ligação + Mapeamento de Decisores</div><div class="sq-s">Mensagens personalizadas · Follow-up automático 48h · Scripts de ligação · Voz IA · Monitor de respostas</div></div></div>
    <div class="oc">
      <div class="ov"><div class="oi">📱</div><div class="oval" style="color:var(--green);">47</div><div class="olb">WhatsApp Enviados</div></div>
      <div class="ov"><div class="oi">📞</div><div class="oval" style="color:var(--blue);">12</div><div class="olb">Ligações Ativas</div></div>
      <div class="ov"><div class="oi">✉️</div><div class="oval" style="color:var(--gold);">23</div><div class="olb">E-mails Enviados</div></div>
      <div class="ov"><div class="oi">💬</div><div class="oval" style="color:var(--s7c);">8</div><div class="olb">Responderam</div></div>
    </div>
    <div class="panel"><div class="ph"><div class="pt">Monitor de Outreach por Lead</div><span class="tag live">Tempo Real</span></div>
      <div class="tw"><table><thead><tr><th>Empresa</th><th>Decisor</th><th>Cargo</th><th>WhatsApp</th><th>Ligação</th><th>E-mail</th><th>Status</th><th>Score</th></tr></thead><tbody id="outTb"></tbody></table></div>
    </div>
  </div>

  <!-- S7 REUNIOES -->
  <div class="page" id="page-s7reu">
    <div class="sq-h s7"><div class="sq-num">S7</div><div class="sq-inf"><div class="sq-t">Agente de Agendamento de Reuniões + Agente de Preparação (Briefing 24h)</div><div class="sq-s">Calendário de reuniões · Dossiê executivo por conta · Perguntas sugeridas · Perfil do decisor</div></div></div>
    <div class="g2">
      <div class="panel"><div class="ph"><div class="pt">Agenda de Reuniões Comerciais</div><span class="tag on">3 Confirmadas</span></div>
        <div class="pb" style="display:flex;flex-direction:column;gap:9px;">
          <div style="background:var(--bg4);border:1px solid rgba(34,211,163,.2);border-radius:7px;padding:11px;"><div style="font-family:var(--M);font-size:8px;color:var(--green);margin-bottom:4px;">SEG 14/04 · 14h00 · Google Meet</div><div style="font-size:12.5px;font-weight:600;margin-bottom:2px;">Usiminas — Fernando Braga</div><div style="font-size:10.5px;color:var(--t2);">Dir. Transformação Digital · M&A em andamento</div><div style="display:flex;gap:5px;margin-top:7px;"><span class="tb rfp-g">Confirmado</span><span class="tb rfp-p">Briefing gerado ✓</span></div></div>
          <div style="background:var(--bg4);border:1px solid rgba(79,124,255,.2);border-radius:7px;padding:11px;"><div style="font-family:var(--M);font-size:8px;color:var(--blue);margin-bottom:4px;">TER 15/04 · 10h30 · Teams</div><div style="font-size:12.5px;font-weight:600;margin-bottom:2px;">Grupo GPA — Daniela Rios</div><div style="font-size:10.5px;color:var(--t2);">CIO · RFP BI aberta</div><div style="display:flex;gap:5px;margin-top:7px;"><span class="tb rfp-p">Confirmado</span><span class="tb rfp-a">Briefing em 13h</span></div></div>
          <div style="background:var(--bg4);border:1px solid rgba(245,166,35,.2);border-radius:7px;padding:11px;"><div style="font-family:var(--M);font-size:8px;color:var(--gold);margin-bottom:4px;">QUA 16/04 · 16h00 · Zoom</div><div style="font-size:12.5px;font-weight:600;margin-bottom:2px;">Arcelor Mittal BR — Carla Sousa</div><div style="font-size:10.5px;color:var(--t2);">CIO · Nova CIO (3 meses no cargo)</div><div style="display:flex;gap:5px;margin-top:7px;"><span class="tb rfp-a">Aguardando confirmação</span></div></div>
        </div>
      </div>
      <div class="panel"><div class="ph"><div class="pt">Briefing Gerado pelo Agente — Usiminas · 14/04</div><span class="tag on">24h antes</span></div>
        <div class="pb" style="display:flex;flex-direction:column;gap:8px;font-size:11.5px;color:var(--t2);line-height:1.65;">
          <div style="background:var(--bg4);border-radius:6px;padding:10px;border-left:2px solid var(--s7c);"><div style="font-family:var(--M);font-size:7.5px;color:var(--s7c);margin-bottom:4px;">PERFIL DA EMPRESA</div><div style="color:var(--t1);">Usiminas · Siderurgia · ~R$12B fat. · 4 plantas · SAP S/4HANA implantado 2024 · M&A com grupo japonês em curso · Time TI: ~200 pessoas</div></div>
          <div style="background:var(--bg4);border-radius:6px;padding:10px;border-left:2px solid var(--gold);"><div style="font-family:var(--M);font-size:7.5px;color:var(--gold);margin-bottom:4px;">DORES IDENTIFICADAS</div><div style="color:var(--t1);">Dados de 4 plantas não consolidados · Relatórios manuais: 3 dias · Integração SAP/BI incompleta · M&A exige visibilidade financeira em tempo real</div></div>
          <div style="background:var(--bg4);border-radius:6px;padding:10px;border-left:2px solid var(--blue);"><div style="font-family:var(--M);font-size:7.5px;color:var(--blue);margin-bottom:4px;">PRODUTOS ATLANTYX ADERENTES</div><div style="color:var(--t1);">Financial OS (consolidação multi-planta) · Integração SAP+BI em tempo real · Dashboard executivo para M&A</div></div>
          <div style="background:var(--bg4);border-radius:6px;padding:10px;border-left:2px solid var(--green);"><div style="font-family:var(--M);font-size:7.5px;color:var(--green);margin-bottom:4px;">PERGUNTAS SUGERIDAS</div><div style="color:var(--t1);">1. Como está a consolidação de dados entre as 4 plantas hoje?<br>2. Qual o maior gargalo de informação no M&A?<br>3. O SAP já está integrado com o Power BI de vocês?</div></div>
        </div>
      </div>
    </div>
  </div>

  <!-- S7 RFP -->
  <div class="page" id="page-s7rfp">
    <div class="sq-h s7"><div class="sq-num">S7</div><div class="sq-inf"><div class="sq-t">Agente de Identificação de RFPs + Agente de Resposta + Agente de Propostas</div><div class="sq-s">Análise de compatibilidade · Elaboração de respostas · Central de propostas</div></div></div>
    <div class="g2">
      <div class="panel"><div class="ph"><div class="pt">RFPs em Andamento</div><span class="tag hot">2 Ativos</span></div>
        <div class="pb" style="display:flex;flex-direction:column;gap:8px;">
          <div style="background:var(--bg4);border:1px solid rgba(245,166,35,.2);border-radius:7px;padding:11px;"><div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span style="font-size:12.5px;font-weight:600;">Energisa — RFP Analytics</span><span style="font-family:var(--M);font-size:8.5px;color:var(--gold);">15/05/26</span></div><div style="font-size:10.5px;color:var(--t2);margin-bottom:7px;">Plataforma analytics operacional · 11 estados · R$890k</div><div style="display:flex;align-items:center;gap:7px;margin-bottom:7px;"><div style="flex:1;background:var(--bg);border-radius:3px;height:4px;"><div style="height:100%;background:var(--gold);width:65%;border-radius:3px;"></div></div><span style="font-family:var(--M);font-size:8.5px;color:var(--gold);">65%</span></div><div style="display:flex;gap:6px;"><span class="tb rfp-r">Agente respondendo</span><button class="btn btn-g" style="font-size:9px;padding:2px 7px;" onclick="toast('Abrindo resposta RFP Energisa para revisão')">Revisar ↗</button></div></div>
          <div style="background:var(--bg4);border:1px solid rgba(156,109,255,.2);border-radius:7px;padding:11px;"><div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span style="font-size:12.5px;font-weight:600;">COMGÁS — RFP BI Corporativo</span><span style="font-family:var(--M);font-size:8.5px;color:var(--purple);">02/06/26</span></div><div style="font-size:10.5px;color:var(--t2);margin-bottom:7px;">BI integrado ao SAP e Power BI existente · R$420k</div><div style="display:flex;gap:6px;"><span class="tb rfp-a">Em análise</span><button class="btn btn-g" style="font-size:9px;padding:2px 7px;" onclick="toast('Agente S7 iniciando análise COMGÁS')">▶ Iniciar</button></div></div>
        </div>
      </div>
      <div class="panel"><div class="ph"><div class="pt">Central de Propostas</div></div>
        <div class="tw"><table><thead><tr><th>Cliente</th><th>Valor</th><th>Enviada</th><th>Status</th><th>Ação</th></tr></thead><tbody>
          <tr><td><strong>Grupo GPA</strong></td><td style="font-family:var(--M);font-size:9px;color:var(--gold);">R$1.2M</td><td style="font-family:var(--M);font-size:9px;">10/04/26</td><td><span class="tb rfp-r">Aguardando cliente</span></td><td><button class="btn btn-g" style="font-size:9px;padding:2px 6px;" onclick="toast('Proposta GPA aberta')">Ver</button></td></tr>
          <tr><td><strong>Arcelor Mittal</strong></td><td style="font-family:var(--M);font-size:9px;color:var(--gold);">R$1.1M</td><td style="font-family:var(--M);font-size:9px;">11/04/26</td><td><span class="tb rfp-a">Rev. jurídica</span></td><td><button class="btn btn-g" style="font-size:9px;padding:2px 6px;" onclick="toast('Proposta Arcelor em revisão S5')">Ver</button></td></tr>
          <tr><td><strong>Usiminas</strong></td><td style="font-family:var(--M);font-size:9px;color:var(--gold);">R$900k</td><td style="font-family:var(--M);font-size:9px;">—</td><td><span class="tb rfp-a">Em elaboração</span></td><td><button class="btn btn-g" style="font-size:9px;padding:2px 6px;" onclick="toast('Agente gerando proposta Usiminas')">Gerar</button></td></tr>
        </tbody></table></div>
      </div>
    </div>
  </div>

  <!-- S7 KPI/METAS -->
  <div class="page" id="page-s7kpi">
    <div class="sq-h s7"><div class="sq-num">S7</div><div class="sq-inf"><div class="sq-t">Metas Semana / Mês / Ano + KPIs Completos de Vendas</div><div class="sq-s">Agente de Forecast · Agente de Expansão · Dashboard de metas em tempo real</div></div></div>
    <div style="font-family:var(--M);font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--s7c);margin-bottom:7px;">── METAS DE RECEITA</div>
    <div class="g3" style="margin-bottom:12px;">
      <div style="background:var(--bg4);border:1px solid var(--bd);border-radius:8px;padding:13px;"><div style="font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:7px;">Semana atual</div><div style="font-family:var(--M);font-size:22px;font-weight:700;color:var(--s7c);">R$0</div><div style="display:flex;align-items:center;gap:7px;margin-top:7px;"><div style="flex:1;background:var(--bg);border-radius:3px;height:5px;"><div style="height:100%;background:var(--s7c);width:0%;border-radius:3px;"></div></div><span style="font-family:var(--M);font-size:8.5px;color:var(--t2);">0% / R$500k</span></div><div style="font-size:9.5px;color:var(--t3);margin-top:4px;">Semana 1 — pipeline ativo</div></div>
      <div style="background:var(--bg4);border:1px solid var(--bd);border-radius:8px;padding:13px;"><div style="font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:7px;">Mês (Abril)</div><div style="font-family:var(--M);font-size:22px;font-weight:700;color:var(--s7c);">R$0</div><div style="display:flex;align-items:center;gap:7px;margin-top:7px;"><div style="flex:1;background:var(--bg);border-radius:3px;height:5px;"><div style="height:100%;background:var(--s7c);width:0%;border-radius:3px;"></div></div><span style="font-family:var(--M);font-size:8.5px;color:var(--t2);">0% / R$1.5M</span></div><div style="font-size:9.5px;color:var(--t3);margin-top:4px;">3 propostas em elaboração</div></div>
      <div style="background:var(--bg4);border:1px solid var(--bd);border-radius:8px;padding:13px;"><div style="font-family:var(--M);font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--t2);margin-bottom:7px;">Meta 3 meses</div><div style="font-family:var(--M);font-size:22px;font-weight:700;color:var(--s7c);">R$0</div><div style="display:flex;align-items:center;gap:7px;margin-top:7px;"><div style="flex:1;background:var(--bg);border-radius:3px;height:5px;"><div style="height:100%;background:var(--s7c);width:0%;border-radius:3px;"></div></div><span style="font-family:var(--M);font-size:8.5px;color:var(--t2);">0% / R$5M</span></div><div style="font-size:9.5px;color:var(--green);margin-top:4px;">Pipeline R$7.6M ativo ↑</div></div>
    </div>
    <div style="font-family:var(--M);font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--s7c);margin-bottom:7px;">── QUALIDADE COMERCIAL + FINANCEIRO DE VENDAS</div>
    <div class="g5" style="margin-bottom:12px;">
      <div class="kpi pk"><div class="kl">Win Rate</div><div class="kv">28%</div><div class="ks">histórico</div></div>
      <div class="kpi pk"><div class="kl">Ticket Médio</div><div class="kv">R$635k</div><div class="ks">por deal fechado</div></div>
      <div class="kpi pk"><div class="kl">Ciclo de Venda</div><div class="kv">47d</div><div class="ks">médio histórico</div></div>
      <div class="kpi pk"><div class="kl">Lead Response</div><div class="kv">&lt;5min</div><div class="ks up">↑ meta atingida</div></div>
      <div class="kpi pk"><div class="kl">ARR Projetado</div><div class="kv">R$18M</div><div class="ks">com meta 3m</div></div>
    </div>
    <div style="font-family:var(--M);font-size:8px;letter-spacing:2px;text-transform:uppercase;color:var(--s7c);margin-bottom:7px;">── AGENTE DE EXPANSÃO — Carteira Ativa</div>
    <div class="panel" style="margin-bottom:0;"><div class="tw"><table><thead><tr><th>Cliente</th><th>Contrato Atual</th><th>Oportunidade</th><th>Valor Est.</th><th>Tipo</th></tr></thead><tbody>
      <tr><td><strong>Energisa</strong></td><td style="color:var(--t2);">Analytics v1</td><td>Módulo preditivo de manutenção + IoT</td><td style="font-family:var(--M);font-size:9px;color:var(--gold);">R$340k</td><td><span class="tb sa">Upsell</span></td></tr>
      <tr><td><strong>Grupo GPA</strong></td><td style="color:var(--t2);">BI Varejo</td><td>3 novas bandeiras + RH analytics</td><td style="font-family:var(--M);font-size:9px;color:var(--gold);">R$520k</td><td><span class="tb sb_">Cross-sell</span></td></tr>
    </tbody></table></div></div>
  </div>

  </div><!-- cnt -->
</main>
<div class="toast" id="toastEl"></div>

<script>
const S2A=[
  {n:'S2-01',nm:'Inteligência de Mercado',d:'Vasculha portais, diários oficiais, sites de grandes empresas e plataformas de licitação identificando RFPs, editais e oportunidades aderentes ao portfólio da Atlantyx.',on:true},
  {n:'S2-02',nm:'Mapeamento de Contas',d:'Pesquisa Fortune 500 Brasil e Valor 1000, mapeia estrutura organizacional, identifica decisores C-level com cargo, e-mail e contexto verificados.',on:true},
  {n:'S2-03',nm:'Cadastro em Portais',d:'Acessa portais de fornecedores (SAP Ariba, Beehive, ComprasNet) e realiza o cadastro da Atlantyx como fornecedor homologado automaticamente.',on:false},
  {n:'S2-04',nm:'Monitoramento de RFPs',d:'Monitora continuamente portais de RFP e publica alertas internos quando identifica oportunidades dentro do escopo e portfólio da Atlantyx.',on:true},
  {n:'S2-05',nm:'Campanhas Pagas',d:'Cria, monitora e otimiza campanhas Google Ads e LinkedIn Ads segmentadas por cargo, setor e empresa-alvo com gestão autônoma de ROAS mínimo.',on:false},
  {n:'S2-06',nm:'Conteúdo e Autoridade',d:'Produz artigos, cases e whitepapers posicionando a Atlantyx como referência perante os decisores das contas-alvo nos setores prioritários.',on:false},
  {n:'S2-07',nm:'SEO',d:'Audita e otimiza posicionamento orgânico para termos buscados por gestores de TI e inovação. Monitora Core Web Vitals, Domain Authority e backlinks.',on:false},
  {n:'S2-08',nm:'Nutrição de Leads',d:'Executa sequências de e-mail e conteúdo personalizadas por cargo, setor e momento da jornada para contatos mapeados.',on:false},
  {n:'S2-09',nm:'Analytics',d:'Monitora ROAS, CPL, CPA, CTR, funil Lead→MQL→SQL e todos os KPIs de marketing em tempo real com alertas de desvio configuráveis.',on:false},
];
const S7A=[
  {n:'S7-01',nm:'Prospecção Ativa',d:'Recebe lista de grandes empresas do S2 e monta dossiê de abordagem com perfil, faturamento, dores recorrentes e histórico de fornecedores por conta.',on:true},
  {n:'S7-02',nm:'Identificação de RFPs',d:'Analisa RFPs do S2, avalia compatibilidade com o portfólio Atlantyx, estima probabilidade de vitória e recomenda participar ou não com justificativa.',on:false},
  {n:'S7-03',nm:'Resposta a RFPs',d:'Com aprovação humana, elabora resposta técnica e comercial completa: escopo, metodologia, equipe, cronograma, precificação e diferenciais competitivos.',on:false},
  {n:'S7-04',nm:'Mapeamento de Decisores',d:'Identifica CEO, CTO, CIO, CFO e VPs de cada conta-alvo com dados de contato verificados e perfil no LinkedIn.',on:true},
  {n:'S7-05',nm:'Outreach via WhatsApp',d:'Redige e envia mensagens personalizadas via WhatsApp Business, monitora leitura e resposta, dispara follow-up automático em 48h sem intervenção humana.',on:true},
  {n:'S7-06',nm:'Outreach via Ligação',d:'Gera scripts personalizados por decisor, agenda ligações e registra resultado no CRM. Integra com Voz IA para ligações autônomas de qualificação.',on:false},
  {n:'S7-07',nm:'Agendamento de Reuniões',d:'Ao obter interesse, verifica agenda, propõe horários, envia convite Google Meet/Teams e registra a reunião no CRM com briefing completo da conta.',on:true},
  {n:'S7-08',nm:'Preparação de Reunião',d:'24h antes gera dossiê executivo: perfil da empresa, dores, produtos Atlantyx aderentes, cases similares e perguntas sugeridas ao vendedor.',on:false},
  {n:'S7-09',nm:'Pipeline',d:'Monitora deals em cada etapa, detecta deals parados há mais de 14 dias e sugere ações específicas de desbloqueio ao responsável.',on:false},
  {n:'S7-10',nm:'Propostas',d:'Gera propostas comerciais personalizadas com escopo, prazo e precificação baseados no perfil da conta e no histórico da Atlantyx.',on:false},
  {n:'S7-11',nm:'Forecast',d:'Calcula previsão de receita por semana, mês e trimestre com intervalos de confiança nos cenários pessimista, realista e otimista.',on:false},
  {n:'S7-12',nm:'Expansão',d:'Analisa carteira ativa e identifica oportunidades de upsell, cross-sell e renovação com valor estimado e próxima ação sugerida.',on:false},
];
const LEADS=[
  {co:'Grupo Energisa',sc:'Energia',de:'Rodrigo Limp',ca:'CTO',si:'Expansão regional',s:'A',vl:800000,st:'Abordado',m:true},
  {co:'Rede Caoa Chery',sc:'Automotivo',de:'Marcelo Araújo',ca:'Dir. TI',si:'Novo ERP SAP',s:'A',vl:450000,st:'Abordado',m:true},
  {co:'Grupo GPA',sc:'Varejo',de:'Daniela Rios',ca:'CIO',si:'RFP BI aberta',s:'A',vl:1200000,st:'Respondeu',m:true},
  {co:'Usiminas',sc:'Indústria',de:'Fernando Braga',ca:'Dir.Trans.Digital',si:'M&A andamento',s:'A',vl:900000,st:'Reunião Agendada',m:true},
  {co:'Neoenergia',sc:'Energia',de:'Ana Carvalho',ca:'CFO',si:'Pressão eficiência',s:'A',vl:650000,st:'Abordado',m:true},
  {co:'Localfrio',sc:'Logística',de:'Paulo Mendes',ca:'Dir. Operações',si:'Crescimento',s:'B',vl:280000,st:'Mapeado',m:false},
  {co:'Grupo Mateus',sc:'Varejo',de:'Thiago Andrade',ca:'Dir. TI',si:'Expansão 40 lojas',s:'A',vl:720000,st:'Abordado',m:true},
  {co:'Arcelor Mittal',sc:'Indústria',de:'Carla Sousa',ca:'CIO',si:'Novo CIO contratado',s:'A',vl:1100000,st:'Respondeu',m:true},
  {co:'COMGÁS',sc:'Energia',de:'Roberto Silva',ca:'Dir. TI',si:'Sistemas legados',s:'B',vl:390000,st:'Mapeado',m:false},
  {co:'Grupo Cosan',sc:'Energia',de:'Luciana Prado',ca:'CTO',si:'Transformação digital',s:'A',vl:980000,st:'Mapeado',m:false},
  {co:'Rede DZR Honda',sc:'Automotivo',de:'Marcos Lima',ca:'Dir. TI',si:'Redução custos',s:'B',vl:210000,st:'Mapeado',m:false},
  {co:'Klabin',sc:'Indústria',de:'Beatriz Faria',ca:'Dir.Trans.Digital',si:'BI falhou',s:'A',vl:870000,st:'Abordado',m:true},
];
const PCOLS=['Mapeado','Abordado','Respondeu','Reunião Agendada','Proposta','Fechado'];

function nav(p,el){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.sb-i').forEach(x=>x.classList.remove('active'));
  const pg=document.getElementById('page-'+p);if(pg)pg.classList.add('active');
  if(el)el.classList.add('active');
  const lb={dash:'/ Dashboard',s2ag:'/ S2 · 9 Agentes',s2wa:'/ S2 · Gerador WhatsApp',s2rfp:'/ S2 · RFPs + Portais',s2kpi:'/ S2 · KPIs Marketing',s7ag:'/ S7 · 12 Agentes',s7pipe:'/ S7 · Pipeline + Forecast',s7out:'/ S7 · Outreach',s7reu:'/ S7 · Reuniões',s7rfp:'/ S7 · RFPs + Propostas',s7kpi:'/ S7 · Metas + KPIs'};
  document.getElementById('tbc').textContent=lb[p]||'';
  if(p==='s7pipe')renderPipe();
  if(p==='s7out')renderOut();
}
function toast(m){const t=document.getElementById('toastEl');t.textContent=m;t.style.opacity='1';t.style.transform='translateY(0)';setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(5px)';},2600);}
function mkAgGrid(ag,id){
  document.getElementById(id).innerHTML=ag.map((a,i)=>`<div class="ac ${a.on?'on':''}"><div class="ac-n">${a.n}</div><div class="ac-nm">${a.nm}</div><div class="ac-d">${a.d}</div><div class="ac-f"><div class="ac-st" style="color:${a.on?'var(--green)':'var(--gold)'}"><span style="width:5px;height:5px;border-radius:50%;background:${a.on?'var(--green)':'var(--gold)'};display:inline-block;${a.on?'animation:pulse 2s infinite':''}"></span>${a.on?'Ativo':'Standby'}</div><div class="tg ${a.on?'on':''}" onclick="tog('${id}',${i})"></div></div></div>`).join('');
}
function tog(g,i){const ag=g==='s2g'?S2A:S7A;ag[i].on=!ag[i].on;mkAgGrid(ag,g);upCnt();toast(`${ag[i].on?'▶ Ativado':'⏸ Pausado'}: ${ag[i].nm}`);}
function upCnt(){const n=S2A.filter(a=>a.on).length+S7A.filter(a=>a.on).length;document.getElementById('aCnt').textContent=`● ${n} ativos`;}
function mkDash(){
  const f=(arr,id)=>{document.getElementById(id).innerHTML=arr.map(a=>`<div style="display:flex;align-items:center;gap:7px;padding:6px 0;border-bottom:1px solid var(--bd);"><span style="font-family:var(--M);font-size:7.5px;color:var(--t3);width:38px;">${a.n}</span><span style="font-size:11px;flex:1;">${a.nm}</span><span style="display:flex;align-items:center;gap:3px;font-family:var(--M);font-size:8px;color:${a.on?'var(--green)':'var(--t3)'}"><span style="width:4px;height:4px;border-radius:50%;background:${a.on?'var(--green)':'var(--t3)'};display:inline-block;${a.on?'animation:pulse 2s infinite':''}"></span>${a.on?'Ativo':'Standby'}</span></div>`).join('');};
  f(S2A,'d-s2');f(S7A,'d-s7');
}
function renderPipe(){
  document.getElementById('pgGrid').innerHTML=PCOLS.map(col=>{
    const ls=LEADS.filter(l=>l.st===col);
    return`<div class="pc"><div class="pch">${col}<span class="pcnt">${ls.length}</span></div>${ls.map(l=>`<div class="lc" onclick="loadL('${l.co}')"><div class="lc-co">${l.co}</div><div class="lc-ct">${l.de}·${l.ca}</div><span class="tb ${l.s==='A'?'sa':l.s==='B'?'sb_':'sc'}" style="margin-top:3px;display:inline-block;">${l.s}</span><span class="lc-v">R$${(l.vl/1000).toFixed(0)}k</span></div>`).join('')||'<div style="font-size:9px;color:var(--t3);padding:4px 0;">—</div>'}</div>`;
  }).join('');
}
function renderOut(){
  const sc={'Mapeado':'var(--t3)','Abordado':'var(--blue)','Respondeu':'var(--green)','Reunião Agendada':'var(--gold)'};
  document.getElementById('outTb').innerHTML=LEADS.map((l,i)=>`<tr><td><strong>${l.co}</strong></td><td>${l.de}</td><td style="font-size:10px;color:var(--t2);">${l.ca}</td><td><span style="font-family:var(--M);font-size:8.5px;color:${l.m?'var(--green)':'var(--t3)'};">${l.m?'✓ Enviado':'—'}</span></td><td><span style="font-family:var(--M);font-size:8.5px;color:${i%3===0?'var(--blue)':'var(--t3)'};">${i%3===0?'Realizada':'—'}</span></td><td><span style="font-family:var(--M);font-size:8.5px;color:${l.m?'var(--green)':'var(--t3)'};">${l.m?'✓':'—'}</span></td><td><span style="font-size:10px;color:${sc[l.st]||'var(--t2)'};">${l.st}</span></td><td><span class="tb ${l.s==='A'?'sa':l.s==='B'?'sb_':'sc'}">${l.s}</span></td></tr>`).join('');
}
function loadL(co){const l=LEADS.find(x=>x.co===co);if(!l)return;document.getElementById('wE').value=l.co;document.getElementById('wD').value=l.de;nav('s2wa',null);document.querySelectorAll('.sb-i').forEach(x=>x.classList.remove('active'));toast('Lead carregado — '+l.co);}
async function genWA(){
  const e=document.getElementById('wE').value||'a empresa',d=document.getElementById('wD').value||'o decisor',c=document.getElementById('wC').value,s=document.getElementById('wS').value,x=document.getElementById('wX').value,t=document.getElementById('wT').value;
  const btn=document.getElementById('btnG'),out=document.getElementById('msgO');
  btn.disabled=true;btn.textContent='Gerando...';
  out.innerHTML='<span style="color:var(--blue);font-family:var(--M);font-size:11px;"><span class="ld">Agente S2 gerando mensagem personalizada</span></span>';
  try{
    const r=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:600,messages:[{role:'user',content:`Você é o Agente de Prospecção da Atlantyx, empresa de BI, Dados e IA para grandes empresas.\n\nEMPRESA: ${e}\nDECISOR: ${d}\nCARGO: ${c}\nSETOR: ${s}\nCONTEXTO: ${x||'empresa com operação complexa e necessidade de dados mais ágeis'}\nTOM: ${t}\n\nATLANTYX RESOLVE: decisões com dados atrasados ou inconsistentes geram perda financeira. Transformamos dados complexos em inteligência acionável sem trocar toda a estrutura — Quick Wins em semanas, ROI mensurável.\n\nDIFERENCIAIS: entrega rápida (semanas) · integra com sistemas existentes · foco em ROI · exp. real em energia, varejo, automotivo e indústria.\n\nREGRAS:\n- Máximo 6 linhas, direto, sem enrolação\n- Mencionar algo específico do contexto desta empresa\n- Tom adequado para ${c}\n- NÃO começar com "Olá, meu nome é..."\n- NÃO usar emojis\n- Terminar com pergunta simples que abre conversa\n\nRetorne APENAS a mensagem, sem aspas ou explicações.`}]})});
    const dat=await r.json();const msg=dat.content?.[0]?.text||'Erro';
    out.textContent=msg;
    document.getElementById('mC').textContent=msg.length;
    document.getElementById('mSc').textContent=x?'A':'B';
    document.getElementById('mR').textContent='~'+Math.ceil(msg.split(' ').length/4)+'s';
    document.getElementById('mMeta').style.display='grid';
    document.getElementById('btnCp').disabled=false;
    genFU(e,d,c,msg);
  }catch(err){out.innerHTML='<span style="color:var(--red);">Erro na API</span>';}
  btn.disabled=false;btn.textContent='✦ Gerar com IA';
}
async function genFU(e,d,c,orig){
  try{const r=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:250,messages:[{role:'user',content:`Follow-up de máximo 3 linhas para ${d} (${c}) da ${e}, 48h sem resposta para:\n"${orig}"\nNova abordagem, mesmo tom direto. Só o texto.`}]})});const dat=await r.json();const fu=dat.content?.[0]?.text||'';document.getElementById('fuO').textContent=fu;document.getElementById('fuP').style.display='block';}catch(e){}
}
function cpWA(){navigator.clipboard.writeText(document.getElementById('msgO').textContent);toast('✓ Copiado!');}
function clearWA(){['wE','wD','wX'].forEach(id=>document.getElementById(id).value='');document.getElementById('msgO').innerHTML='<span class="mp">Preencha os dados e clique em "Gerar com IA".</span>';document.getElementById('mMeta').style.display='none';document.getElementById('fuP').style.display='none';document.getElementById('btnCp').disabled=true;}
mkAgGrid(S2A,'s2g');mkAgGrid(S7A,'s7g');mkDash();upCnt();
</script>
</body>
</html>
