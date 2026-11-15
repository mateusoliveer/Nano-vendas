/* Nano Vendas — busca de empresas (Google Maps, coletadas pelo GitHub Actions) + funil.
   A busca roda no navegador sobre data/empresas.json: instantânea e sem custo por consulta.
   O funil fica salvo neste navegador; use Exportar para backup. */
(() => {
  const KEY = 'nanovendas.leads.v1';
  const LOTE = 5;
  const PAGE = 30;

  const STATUS = ['Pesquisando', 'Pronto', 'Abordado', 'Respondeu', 'Reunião', 'Proposta', 'Ganho', 'Perdido'];
  const ABORDADOS = ['Abordado', 'Respondeu', 'Reunião', 'Proposta', 'Ganho', 'Perdido'];
  const SERVICOS = ['Google', 'SEO', 'GEO', 'AEO', 'Tráfego pago', 'IA', 'Automação', 'CRM', 'Site'];

  const CLICHES = ['alavancar', 'potencializar', 'próximo nível', 'transformar seu negócio', 'soluções inovadoras', 'parceria de sucesso',
    'oportunidade única', 'espero que esteja bem', 'gostaria de apresentar', 'somos uma agência', 'impulsionar', 'decolar',
    'sem compromisso', 'você sabia', 'resultados incríveis', 'escalar suas vendas'];
  const PROMESSAS = ['garant', 'dobrar', 'triplicar', 'multiplicar', '100%', 'sem falta', 'com certeza vai', 'primeira página'];
  const PRECO = /(r\$\s?\d|\d+\s?(reais|mil)\b|preç|valor promocional|desconto|a partir de)/i;
  const SOCIAL = /(instagram\.com|facebook\.com|linktr\.ee|wa\.me|whatsapp\.com|linkbio|bio\.link|tiktok\.com)/i;

  /* filtros: chip na tela + frases que a busca entende */
  const FLAGS = [
    { k: 'semSite', label: 'Sem site', re: /\bsem (site|website)\b/ },
    { k: 'poucas', label: 'Poucas avaliações', re: /\bpoucas? avaliac\w*\b/ },
    { k: 'notaBaixa', label: 'Nota baixa', re: /\bnota baixa\b/ },
    { k: 'celular', label: 'Celular', re: /\b(celular|whats(app)?)\b/ },
  ];
  /* sinônimos: qualquer raiz do grupo encontra as outras */
  const SINONIMOS = [
    ['odonto', 'dentist', 'dental', 'ortodont', 'implante'],
    ['contab', 'contador', 'contabil'],
    ['advoga', 'advocacia', 'juridic', 'direito'],
    ['fisio', 'pilates', 'reabilita'],
    ['pet', 'veterin', 'animal', 'banho e tosa'],
    ['imobil', 'imove', 'corretor', 'aluguel', 'imovel'],
    ['idioma', 'ingles', 'lingua', 'espanhol'],
    ['movei', 'marcenaria', 'planejad', 'moveis'],
    ['mecanic', 'oficina', 'automotiv', 'auto center'],
    ['restaurant', 'lanchonete', 'pizzari', 'hamburgu', 'comida'],
    ['estetic', 'beleza', 'spa', 'salao'],
    ['industria', 'fabrica', 'fabricante'],
  ];
  const ALIAS = { bh: 'belo horizonte', poa: 'porto alegre', floripa: 'florianopolis', sampa: 'sao paulo', bc: 'balneario camboriu', cwb: 'curitiba' };
  const STOP = new Set(['em', 'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'e', 'com', 'para', 'a', 'o', 'as', 'os']);

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const digits = s => (s || '').replace(/\D/g, '');
  const esc = s => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmt = n => (n || 0).toLocaleString('pt-BR');
  const nota = n => n ? n.toFixed(1).replace('.', ',') : '–';
  const nome = n => (n || '').split(/\s+[|–—-]\s+/)[0].trim() || n;

  function phoneIntl(p) {
    let d = digits(p).replace(/^0+/, '');
    if (!d) return '';
    if ((d.length === 10 || d.length === 11) && !(p || '').trim().startsWith('+')) d = '55' + d;
    return d;
  }
  const isCelularBR = p => { const d = phoneIntl(p); return d.length === 13 && d.startsWith('55') && d[4] === '9'; };
  const waLink = (tel, msg) => { const d = phoneIntl(tel); return d ? `https://wa.me/${d}?text=${encodeURIComponent(msg || '')}` : ''; };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2400);
  }

  /* =================== BASE =================== */
  let base = [];
  const state = { q: '', flags: new Set(), shown: PAGE, rows: [] };

  async function loadBase() {
    try {
      const [r, m] = await Promise.all([
        fetch('data/empresas.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : []),
        fetch('data/meta.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      base = Array.isArray(r) ? r : [];
      state.meta = m;
    } catch { base = []; }
    prepare();
    search();
  }

  const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  function prepare() {
    const groups = {};
    base.forEach(e => { const g = norm(e.c) + '|' + norm(e.cid); (groups[g] = groups[g] || []).push(e); });
    const stats = {};
    Object.entries(groups).forEach(([g, list]) => {
      const avs = list.map(e => e.av || 0);
      stats[g] = { n: list.length, med: median(avs), max: Math.max(...avs) };
    });
    base.forEach(e => {
      const st = stats[norm(e.c) + '|' + norm(e.cid)];
      const f = {
        semSite: !e.site,
        social: !!e.site && SOCIAL.test(e.site),
        poucas: (e.av || 0) < 20,
        abaixo: !!st && st.n >= 5 && (e.av || 0) < st.med * 0.5,
        notaBaixa: e.nota > 0 && e.nota < 4.2,
        semHorario: !e.hor,
        celular: isCelularBR(e.tel),
      };
      e._f = f; e._st = st; e._nome = nome(e.n);
      e._score = (f.semSite ? 3 : 0) + (f.social ? 2 : 0) + (f.poucas ? 2 : 0) + (f.abaixo ? 2 : 0) +
        (f.notaBaixa ? 1 : 0) + (f.semHorario ? 1 : 0) + (f.celular ? 1.5 : 0) + (e.tel ? 0 : -4);
      e._idx = ' ' + norm([e.n, e.c, (e.cs || []).join(' '), e.b, e.cid, e.uf, e.end, e.q].join(' ')).replace(/[^a-z0-9]+/g, ' ') + ' ';
      e._nidx = ' ' + norm(e.n).replace(/[^a-z0-9]+/g, ' ') + ' ';
    });
    $('#semBase').hidden = base.length > 0;
  }

  /* cada termo vira uma lista de alternativas (sinônimos, singular, apelidos de cidade) */
  function parse(q) {
    let text = ' ' + norm(q) + ' ';
    const flags = new Set();
    FLAGS.forEach(f => { if (f.re.test(text)) { flags.add(f.k); text = text.replace(f.re, ' '); } });
    Object.entries(ALIAS).forEach(([a, full]) => { text = text.replace(new RegExp(`\\b${a}\\b`, 'g'), full); });
    const terms = text.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t)).map(t => {
      const stem = t.length > 4 ? t.replace(/(oes|aes|ais|eis|es|s)$/, '') : t;
      const g = SINONIMOS.find(g => g.some(r => (stem.length >= 3 && r.startsWith(stem)) || (r.length >= 3 && stem.startsWith(r))));
      return { t, alts: g ? [...new Set([stem, ...g])] : [stem], short: t.length <= 2 };
    });
    return { terms, flags };
  }
  const hit = (e, term) => term.short ? e._idx.includes(' ' + term.t + ' ') : term.alts.some(a => e._idx.includes(a));

  function search() {
    const t0 = performance.now();
    const { terms, flags } = parse(state.q);
    const allFlags = new Set([...flags, ...state.flags]);
    $$('#flags input').forEach(i => { i.checked = allFlags.has(i.value); });
    const pool = base.filter(e => [...allFlags].every(k => e._f[k]));
    const score = e => {
      let m = 0, nameBonus = 0;
      terms.forEach(term => { if (hit(e, term)) { m++; if (term.alts.some(a => e._nidx.includes(a))) nameBonus++; } });
      return { m, nameBonus };
    };
    let rows = [], aprox = false;
    if (!terms.length) rows = pool.map(e => ({ e, m: 0, nb: 0 }));
    else {
      const scored = pool.map(e => { const s = score(e); return { e, m: s.m, nb: s.nameBonus }; });
      rows = scored.filter(r => r.m === terms.length);
      if (!rows.length) { rows = scored.filter(r => r.m > 0); aprox = rows.length > 0; }
    }
    rows.sort((a, b) => b.m - a.m || b.e._score - a.e._score || b.nb - a.nb || (b.e.av || 0) - (a.e.av || 0));
    state.rows = rows.map(r => r.e);
    state.shown = PAGE;
    const ms = Math.max(1, Math.round(performance.now() - t0));
    const upd = state.meta && state.meta.atualizado ? ` · atualizado em ${new Date(state.meta.atualizado + 'T12:00').toLocaleDateString('pt-BR')}` : '';
    $('#meta').innerHTML = !base.length ? '' : (state.rows.length
      ? `${fmt(state.rows.length)} empresas${aprox ? ' parecidas' : ''} · ${ms} ms${upd}`
      : `Nada encontrado. <a href="https://www.google.com/maps/search/${encodeURIComponent(state.q)}" target="_blank" rel="noopener">Ver no Google Maps</a>`);
    renderResults();
  }

  function flagText(e) {
    const f = e._f, out = [];
    if (f.semSite) out.push('sem site'); else if (f.social) out.push('site é rede social');
    if (f.abaixo) out.push('abaixo da média local'); else if (f.poucas) out.push('poucas avaliações');
    if (f.notaBaixa) out.push('nota baixa');
    if (f.semHorario) out.push('sem horário');
    return out.join(' · ');
  }

  function renderResults() {
    const noFunil = new Map(leads.filter(l => l.placeId).map(l => [l.placeId, l]));
    $('#results').innerHTML = state.rows.slice(0, state.shown).map(e => {
      const lead = noFunil.get(e.id);
      const op = flagText(e);
      const wa = e.tel ? waLink(e.tel, diagnose(e).mensagem) : '';
      return `<li class="res">
        <div class="res-main">
          <h3>${esc(e._nome)}</h3>
          <p class="cat">${esc([e.c, e.b, e.cid].filter(Boolean).join(' · '))}</p>
          <p class="facts"><span class="star">★ ${nota(e.nota)}</span><span>${fmt(e.av)} avaliações</span>${e.tel ? `<span>${esc(e.tel)}</span>` : ''}${lead ? `<span class="pill">${esc(lead.status)}</span>` : ''}</p>
          ${op ? `<p class="op">${esc(op)}</p>` : ''}
        </div>
        <div class="res-act">
          ${wa ? `<a class="icon wa-btn" href="${esc(wa)}" target="_blank" rel="noopener" data-wa="${esc(e.id)}" title="Abrir WhatsApp com mensagem pronta" aria-label="WhatsApp">${ICON_WA}</a>` : ''}
          <button class="icon" data-edit="${esc(e.id)}" title="Ajustar mensagem" aria-label="Ajustar mensagem">${ICON_EDIT}</button>
          ${e.maps ? `<a class="icon" href="${esc(e.maps)}" target="_blank" rel="noopener" title="Ver no Google Maps" aria-label="Google Maps">${ICON_PIN}</a>` : ''}
        </div>
      </li>`;
    }).join('');
    $('#more').hidden = state.rows.length <= state.shown;
  }

  const ICON_WA = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2s.2-1.1.1-1.2l-.4-.2Z"/></svg>';
  const ICON_EDIT = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4"/></svg>';
  const ICON_PIN = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  /* diagnóstico + rascunho com fatos reais do perfil */
  function diagnose(e) {
    const st = e._st || {}, f = e._f, n = e._nome;
    const fatos = [`Google Maps: nota ${nota(e.nota)} com ${fmt(e.av)} avaliações.`];
    if (st.n >= 5) fatos.push(`Entre ${st.n} empresas de "${e.c}" em ${e.cid} na base, a mediana é ${fmt(st.med)} avaliações e a mais avaliada tem ${fmt(st.max)}.`);
    if (f.semSite) fatos.push('Perfil sem site.');
    if (f.social) fatos.push(`O site do perfil é uma rede social (${e.site}).`);
    if (f.semHorario) fatos.push('Perfil sem horário de funcionamento.');
    const onde = e.b ? ` no ${e.b}` : (e.cid ? ` em ${e.cid}` : '');
    const seg = (e.c || 'empresas do segmento').toLowerCase();
    let oportunidade, servicos, mensagem;
    if (f.semSite || f.social) {
      oportunidade = 'Site enxuto + SEO local + AEO/GEO para converter quem encontra a empresa no Google e em respostas de IA.';
      servicos = ['Site', 'SEO', 'Google', 'AEO', 'GEO'];
      mensagem = f.social
        ? `Olá! Vi a ${n} no Google Maps, ${nota(e.nota)} com ${fmt(e.av)} avaliações${onde}. O site do perfil leva para a rede social. Quem chega pelo Google costuma chamar direto no WhatsApp ou se perde no caminho?`
        : `Olá! Vi a ${n} no Google Maps, ${nota(e.nota)} com ${fmt(e.av)} avaliações${onde}, mas o perfil não tem site. Hoje os novos clientes chegam mais pelo Google ou por indicação?`;
    } else if (f.abaixo || f.poucas) {
      oportunidade = 'Rotina de avaliações + Perfil da Empresa otimizado + tráfego local para ganhar prova social.';
      servicos = ['Google', 'SEO', 'Tráfego pago', 'Automação'];
      mensagem = st.n >= 5
        ? `Olá! Pesquisando ${seg} em ${e.cid}, vi que a ${n} tem ${fmt(e.av)} avaliações no Google, enquanto a mais avaliada da cidade passa de ${fmt(st.max)}. Vocês já pedem avaliação aos clientes depois do atendimento?`
        : `Olá! Vi a ${n} no Google Maps com ${fmt(e.av)} avaliações${onde}. Vocês já pedem avaliação aos clientes depois do atendimento?`;
    } else if (f.notaBaixa) {
      oportunidade = 'Resposta às avaliações + pedido de avaliação automatizado + CRM pós-venda.';
      servicos = ['Google', 'CRM', 'Automação'];
      mensagem = `Olá! Vi a ${n} no Google Maps${onde}: ${fmt(e.av)} avaliações e nota ${nota(e.nota)}. Vocês têm alguém cuidando das respostas às avaliações hoje?`;
    } else {
      oportunidade = 'Perfil forte. Escalar com tráfego pago, atendimento com IA e CRM.';
      servicos = ['Tráfego pago', 'IA', 'Automação', 'CRM'];
      mensagem = `Olá! Vi a ${n} no Google Maps, ${nota(e.nota)} com ${fmt(e.av)} avaliações${onde}, das mais bem avaliadas da região. Com esse volume, como vocês organizam os contatos que chegam pelo WhatsApp?`;
    }
    return { diagnostico: fatos.join(' '), oportunidade, servicos, mensagem };
  }

  function leadFrom(e) {
    const d = diagnose(e);
    return {
      placeId: e.id, empresa: e._nome, segmento: e.c, local: [e.b, e.cid && `${e.cid}${e.uf ? '/' + e.uf : ''}`].filter(Boolean).join(', '),
      site: e.site, gmb: e.maps, telefone: e.tel, ...d,
      ticketTipo: e._f.semSite ? 'Entrada' : 'Médio', status: 'Pesquisando', lote: loteAtual(),
    };
  }

  /* abrir WhatsApp direto do resultado: registra no funil como Abordado */
  function registrarAbordagem(data) {
    const now = Date.now();
    const prev = leads.find(l => (data.placeId && l.placeId === data.placeId) || (data.id && l.id === data.id));
    if (prev && ABORDADOS.includes(prev.status) && prev.status !== 'Abordado') return prev;
    const lead = { ...(prev || {}), ...data, id: prev ? prev.id : uid(), status: 'Abordado', abordado: now, atualizado: now, criado: prev ? prev.criado : now };
    put(lead);
    return lead;
  }

  $('#busca').addEventListener('submit', e => { e.preventDefault(); $('#q').blur(); search(); });
  let deb;
  $('#q').addEventListener('input', e => { state.q = e.target.value; clearTimeout(deb); deb = setTimeout(search, 60); });
  $('#flags').innerHTML = FLAGS.map(f => `<label><input type="checkbox" value="${f.k}"><span>${f.label}</span></label>`).join('');
  $('#flags').addEventListener('change', e => {
    const k = e.target.value, f = FLAGS.find(x => x.k === k);
    if (e.target.checked) state.flags.add(k);
    else { state.flags.delete(k); state.q = (' ' + state.q + ' ').replace(new RegExp(f.re.source, 'i'), ' ').replace(/\s+/g, ' ').trim(); $('#q').value = state.q; }
    search();
  });
  $('#more').onclick = () => { state.shown += PAGE; renderResults(); };
  $('#results').addEventListener('click', ev => {
    const wa = ev.target.closest('[data-wa]');
    if (wa) { const e = base.find(x => x.id === wa.dataset.wa); if (e) { registrarAbordagem(leadFrom(e)); setTimeout(renderResults, 400); } return; }
    const ed = ev.target.closest('[data-edit]');
    if (ed) {
      const e = base.find(x => x.id === ed.dataset.edit);
      const existing = leads.find(l => l.placeId === ed.dataset.edit);
      openForm(existing || leadFrom(e), !existing);
      show('form');
    }
  });

  /* =================== FUNIL =================== */
  let leads = loadLocal();
  function loadLocal() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
  function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(leads)); } catch { toast('Não foi possível salvar neste navegador.'); } }
  function put(l) { const i = leads.findIndex(x => x.id === l.id); if (i >= 0) leads[i] = l; else leads.push(l); saveLocal(); renderBadge(); }
  function remove(id) { leads = leads.filter(l => l.id !== id); saveLocal(); renderBadge(); }
  function renderBadge() { $('#funilN').textContent = leads.length || ''; }

  const loteAtual = () => {
    const max = Math.max(1, ...leads.map(l => +l.lote || 1));
    return leads.filter(l => (+l.lote || 1) === max).length >= LOTE ? max + 1 : max;
  };

  function checkMsg(msg, l = {}) {
    const m = (msg || '').trim(), low = norm(m);
    const cliche = CLICHES.find(c => low.includes(norm(c)));
    const promessa = PROMESSAS.find(p => low.includes(norm(p)));
    const first = norm(l.decisor).split(' ')[0];
    const out = [
      { label: 'Termina com pergunta', ok: m.endsWith('?') },
      { label: `${m.length}/400 caracteres`, ok: m.length > 0 && m.length <= 400 },
      { label: cliche ? `Clichê: “${cliche}”` : 'Sem clichês', ok: !cliche },
      { label: PRECO.test(m) ? 'Menciona preço' : 'Sem preço', ok: !PRECO.test(m) },
      { label: promessa ? `Promessa: “${promessa}”` : 'Sem promessas', ok: !promessa },
    ];
    if (first) out.push({ label: 'Chama o decisor pelo nome', ok: low.includes(first) });
    return out.map(c => ({ ...c, state: !m ? '' : c.ok ? 'ok' : 'bad' }));
  }

  function renderLeads() {
    const q = norm($('#lq').value), fs = $('#fStatus').value;
    const rows = leads.filter(l => !fs || l.status === fs)
      .filter(l => !q || norm([l.empresa, l.local, l.segmento, l.decisor].join(' ')).includes(q))
      .sort((a, b) => (b.atualizado || 0) - (a.atualizado || 0));
    $('#list').innerHTML = rows.map(l => {
      const wa = waLink(l.telefone, l.mensagem);
      const cls = l.status === 'Perdido' ? 'lost' : l.status === 'Pesquisando' ? 'warn' : '';
      return `<li class="item" data-id="${l.id}">
        <h3>${esc(l.empresa)}</h3>
        <div class="right">
          <span class="pill ${cls}">${esc(l.status)}</span>
          ${wa ? `<a class="icon wa-btn" href="${esc(wa)}" target="_blank" rel="noopener" data-wa="${l.id}" aria-label="WhatsApp">${ICON_WA}</a>` : ''}
        </div>
        <p>${esc([l.segmento, l.local, l.lote ? 'Lote ' + l.lote : ''].filter(Boolean).join(' · '))}</p>
      </li>`;
    }).join('');
    $('#empty').style.display = leads.length ? 'none' : 'block';
    const ab = leads.filter(l => ABORDADOS.includes(l.status)).length;
    const conv = leads.filter(l => ['Respondeu', 'Reunião', 'Proposta', 'Ganho'].includes(l.status)).length;
    $('#stats').innerHTML = [['Leads', leads.length], ['Abordados', ab],
      ['Conversas', ab ? `${conv} <small>(${Math.round(conv / ab * 100)}%)</small>` : conv], ['Vendas', leads.filter(l => l.status === 'Ganho').length]]
      .map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    const la = loteAtual();
    $('#loteInfo').textContent = `Lote ${la} · ${leads.filter(l => (+l.lote || 1) === la).length}/${LOTE}`;
  }
  $('#list').addEventListener('click', e => {
    const wa = e.target.closest('[data-wa]');
    if (wa) { const l = leads.find(x => x.id === wa.dataset.wa); if (l && ['Pesquisando', 'Pronto'].includes(l.status)) { registrarAbordagem(l); setTimeout(renderLeads, 400); } return; }
    const it = e.target.closest('.item');
    if (it) { openForm(leads.find(l => l.id === it.dataset.id)); show('form'); }
  });
  $('#lq').addEventListener('input', renderLeads);
  $('#fStatus').addEventListener('change', renderLeads);

  /* ---------- lead ---------- */
  const F = $('#leadForm');
  $('#fStatus').insertAdjacentHTML('beforeend', STATUS.map(s => `<option>${s}</option>`).join(''));
  $('#statusSel').innerHTML = STATUS.map(s => `<option>${s}</option>`).join('');
  $('#servicos').innerHTML = SERVICOS.map(s => `<label><input type="checkbox" name="servicos" value="${s}"><span>${s}</span></label>`).join('');

  function formData() {
    const d = Object.fromEntries(new FormData(F));
    d.servicos = $$('[name=servicos]:checked', F).map(i => i.value);
    return d;
  }
  function openForm(l, isNew) {
    F.reset();
    Object.entries(l).forEach(([k, v]) => { const el = F.elements[k]; if (el && k !== 'servicos' && !(el instanceof RadioNodeList)) el.value = v ?? ''; });
    $$('[name=servicos]', F).forEach(i => { i.checked = (l.servicos || []).includes(i.value); });
    F.elements.id.value = isNew ? '' : l.id;
    $('#formTitle').textContent = l.empresa || 'Lead';
    $('#formSub').innerHTML = [l.gmb && `<a href="${esc(l.gmb)}" target="_blank" rel="noopener">Google Maps</a>`, l.site && `<a href="${esc(/^https?:/.test(l.site) ? l.site : 'https://' + l.site)}" target="_blank" rel="noopener">Site</a>`].filter(Boolean).join(' · ');
    $('#del').hidden = !!isNew;
    update();
  }
  function update() {
    const d = formData();
    $('#checks').innerHTML = checkMsg(d.mensagem, d).map(c => `<li class="${c.state}">${esc(c.label)}</li>`).join('');
    const dup = leads.find(o => o.id !== d.id && ((d.placeId && o.placeId === d.placeId) || (phoneIntl(d.telefone) && phoneIntl(o.telefone) === phoneIntl(d.telefone))));
    $('#dup').textContent = dup && ABORDADOS.includes(dup.status) ? `Já abordada (${dup.status}).` : '';
    const wa = waLink(d.telefone, d.mensagem);
    $('#waPreview').href = wa || '#';
    $('#waPreview').setAttribute('aria-disabled', String(!wa));
  }
  F.addEventListener('input', update);

  function persist(d, status) {
    const now = Date.now();
    const prev = leads.find(l => l.id === d.id) || leads.find(l => d.placeId && l.placeId === d.placeId);
    const lead = { ...(prev || {}), ...d, id: prev ? prev.id : uid(), atualizado: now, criado: prev ? prev.criado : now };
    if (!lead.lote) lead.lote = loteAtual();
    if (status) lead.status = status;
    put(lead);
    F.elements.id.value = lead.id;
    $('#del').hidden = false;
    return lead;
  }
  F.addEventListener('submit', e => { e.preventDefault(); persist(formData()); toast('Salvo no funil.'); show('leads'); });
  $('#waPreview').addEventListener('click', () => {
    const d = formData();
    const st = ['Pesquisando', 'Pronto', ''].includes(d.status || '') ? 'Abordado' : d.status;
    persist({ ...d, abordado: Date.now() }, st);
    F.status.value = st;
  });
  $('#del').addEventListener('click', e => {
    const b = e.currentTarget;
    if (!b.dataset.armed) {
      b.dataset.armed = '1'; b.textContent = 'Confirmar exclusão';
      setTimeout(() => { delete b.dataset.armed; b.textContent = 'Excluir'; }, 4000);
      return;
    }
    delete b.dataset.armed; b.textContent = 'Excluir';
    remove(F.elements.id.value); toast('Lead excluído.'); show('leads');
  });

  /* ---------- backup ---------- */
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  $('#exportJson').onclick = () => download(`nano-vendas-${stamp()}.json`, JSON.stringify(leads, null, 2), 'application/json');
  $('#exportCsv').onclick = () => {
    const cols = ['lote', 'status', 'empresa', 'segmento', 'local', 'site', 'gmb', 'decisor', 'telefone',
      'diagnostico', 'oportunidade', 'servicos', 'ticketTipo', 'mensagem', 'wa', 'notas'];
    const cell = v => `"${(Array.isArray(v) ? v.join('; ') : v ?? '').toString().replace(/"/g, '""')}"`;
    const rows = leads.map(l => cols.map(c => cell(c === 'wa' ? waLink(l.telefone, l.mensagem) : l[c])).join(','));
    download(`nano-vendas-${stamp()}.csv`, '﻿' + [cols.join(','), ...rows].join('\n'), 'text/csv');
  };
  $('#importJson').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data)) throw 0;
      let add = 0;
      data.forEach(l => { if (l && l.empresa && !leads.some(o => o.id === l.id || (l.placeId && o.placeId === l.placeId))) { put({ ...l, id: l.id || uid() }); add++; } });
      renderLeads(); toast(`${add} lead(s) importado(s).`);
    } catch { toast('Arquivo inválido.'); }
    e.target.value = '';
  };

  /* =================== NAVEGAÇÃO =================== */
  function show(view) {
    $$('.view').forEach(v => v.classList.toggle('on', v.id === view));
    $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view || (view === 'form' && b.dataset.view === 'leads')));
    if (view === 'leads') renderLeads();
    if (view === 'buscar') renderResults();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-view]');
    if (!v) return;
    e.preventDefault();
    show(v.dataset.view);
  });

  renderBadge();
  loadBase();
})();
