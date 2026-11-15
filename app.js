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
    { k: 'semSite', label: 'Sem site', re: /\bsem (site|website)\b/, strip: /\bsem (site|website)\b/i },
    { k: 'poucas', label: 'Poucas avaliações', re: /\bpoucas? avaliac\w*\b/, strip: /\bpoucas? avalia\S*/i },
    { k: 'notaBaixa', label: 'Nota baixa', re: /\bnota baixa\b/, strip: /\bnota baixa\b/i },
    { k: 'celular', label: 'Celular', re: /\b(celular|whats(app)?)\b/, strip: /\b(celular|whats(app)?)\b/i },
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
    ['dedetiz', 'praga', 'desratiz', 'cupim', 'descupiniz'],
    ['limpeza', 'higieniz', 'faxina'],
    ['academia', 'crossfit', 'musculac'],
    ['salao', 'cabeleir', 'barbearia', 'barbeiro'],
    ['farmacia', 'drogaria'],
    ['construtora', 'engenharia', 'reforma'],
    ['grafica', 'impressao', 'comunicacao visual'],
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
      const ids = new Set(base.map(e => e.id));
      extraLocal().forEach(e => { if (!ids.has(e.id)) base.push(e); });
      state.meta = m;
    } catch { base = []; }
    prepare();
    search();
  }

  function limparNome(e) {
    let n = nome(e.n);
    const cidade = norm(e.cid);
    let w = n.split(/\s+/);
    const tira = () => {
      const lw = w.map(norm);
      if (cidade) {
        const cw = cidade.split(' ');
        const k = lw.length - cw.length;
        if (k >= 1 && lw.slice(k).join(' ') === cidade) { w = w.slice(0, k); return true; }
      }
      if (w.length > 2 && ['em', 'de', 'no', 'na', '-'].includes(lw[lw.length - 1])) { w.pop(); return true; }
      const termo = norm((e.q || '').split(/\s+em\s+/i)[0]);
      if (w.length > 2 && termo && termo.split(' ').includes(lw[lw.length - 1])) { w.pop(); return true; }
      return false;
    };
    for (let i = 0; i < 6 && tira(); i++);
    n = w.join(' ').replace(/[\s,.-]+$/, '');
    return n.length >= 3 ? n : nome(e.n);
  }

  const EXTRA = 'nanovendas.extra';
  function extraLocal() { try { return JSON.parse(localStorage.getItem(EXTRA)) || []; } catch { return []; } }
  function guardarExtra(novos) {
    const m = new Map(extraLocal().map(e => [e.id, e]));
    novos.forEach(e => m.set(e.id, e));
    try { localStorage.setItem(EXTRA, JSON.stringify([...m.values()].slice(-3000))); } catch { /* sem espaço: segue só na memória */ }
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
      e._f = f; e._st = st; e._nome = limparNome(e);
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
    }
    rows.sort((a, b) => b.m - a.m || b.e._score - a.e._score || b.nb - a.nb || (b.e.av || 0) - (a.e.av || 0));
    state.rows = rows.map(r => r.e);
    state.shown = PAGE;
    const ms = Math.max(1, Math.round(performance.now() - t0));
    const upd = state.meta && state.meta.atualizado ? ` · atualizado em ${new Date(state.meta.atualizado + 'T12:00').toLocaleDateString('pt-BR')}` : '';
    $('#meta').innerHTML = !base.length ? '' : (state.rows.length
      ? `${fmt(state.rows.length)} empresas${aprox ? ' parecidas' : ''} · ${ms} ms${upd}${state.q.trim() ? ' · <button class="link" id="abrirLive">buscar ao vivo</button>' : ''}`
      : (state.q.trim() ? 'Ainda não está na base.' : ''));
    prepareLive(!state.rows.length || aprox);
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
    const proxGoogle = state.placesNext && norm(state.placesNext.q) === norm(state.q);
    $('#more').hidden = state.rows.length <= state.shown && !proxGoogle;
  }

  const ICON_WA = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2s.2-1.1.1-1.2l-.4-.2Z"/></svg>';
  const ICON_EDIT = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4"/></svg>';
  const ICON_PIN = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  /* =================== MENSAGENS ===================
     Regra: curta, humana, um fato que só quem pesquisou saberia, termina com pergunta.
     Sem preço, sem promessa, sem clichê. Cada empresa ganha os ganchos que os dados sustentam. */
  const PUBLICO = [
    [/odonto|dentist|clinic|fisio|medic|estetic|psico|nutri|saude|pilates|laborat/, 'pacientes'],
    [/escola|idioma|ingles|curso|colegio|academia|ensino/, 'alunos'],
    [/pet|veterin|animal/, 'tutores'],
  ];
  const TEMAS = [
    [/atendiment/, 'o atendimento'], [/pontual|no horario|sem atraso/, 'a pontualidade'], [/limp|higien/, 'a limpeza'],
    [/atencios|carinh|acolhed/, 'o cuidado com cada pessoa'], [/explic|tirou (todas as )?duvidas|paciencia/, 'a paciência para explicar'],
    [/rapid|agil|rapidez/, 'a rapidez'], [/ambiente|espaco|estrutura/, 'o ambiente'], [/confian|honest|transparen/, 'a confiança'],
    [/resultado|resolveu|eficien/, 'o resultado'], [/educad|simpati|gentil/, 'a simpatia da equipe'],
  ];
  const titulo = s => s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) : s;
  const hash = s => [...(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

  function insights(e) {
    const rv = e.rv || [];
    const textos = rv.map(r => r.t || '').filter(Boolean);
    const nomes = {};
    textos.forEach(t => {
      const vistos = new Set();
      for (const m of t.matchAll(/\b(Dra?\.?|Doutora?|Prof(?:a|essora)?\.?)\s+([A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]{2,})/g)) {
        const k = `${/^(Dra|Doutora|Profa|Professora)/.test(m[1]) ? (m[1].startsWith('P') ? 'a professora' : 'a Dra.') : (m[1].startsWith('P') ? 'o professor' : 'o Dr.')} ${m[2]}`;
        if (!vistos.has(k)) { nomes[k] = (nomes[k] || 0) + 1; vistos.add(k); }
      }
    });
    const pessoa = Object.entries(nomes).sort((a, b) => b[1] - a[1])[0];
    const temaCount = TEMAS.map(([re, label]) => [label, textos.filter(t => re.test(norm(t))).length]).sort((a, b) => b[1] - a[1])[0];
    const semResposta = rv.length >= 3 && rv.every(r => r.r === false);
    const negativaSemResposta = rv.find(r => r.s && r.s <= 2 && r.r === false);
    return {
      pessoa: pessoa ? { nome: pessoa[0], n: pessoa[1] } : null,
      tema: temaCount && temaCount[1] >= 2 ? temaCount[0] : null,
      semResposta, negativaSemResposta, nRv: rv.length,
    };
  }

  function ganchos(e) {
    const st = e._st || {}, f = e._f, i = insights(e);
    const n = titulo(e._nome);
    const termo = ((e.q || '').split(/\s+em\s+/i)[0] || e.c || '').toLowerCase().trim();
    const seg = termo || (e.c || '').toLowerCase();
    const fem = /^(vila|praia|rua|avenida|cidade|chacara|estancia|fazenda|ilha|lagoa|serra|zona|regiao|ponta|barra|colonia|quadra)\b/i.test(norm(e.b));
    const onde = e.b ? `${fem ? 'na' : 'no'} ${e.b}` : (e.cid ? `em ${e.cid}` : '');
    const publico = (PUBLICO.find(([re]) => re.test(norm(e.c))) || [0, 'clientes'])[1];
    const oi = [`Oi, pessoal da ${n}!`, `Oi! Tudo bem por aí na ${n}?`, `Oi, equipe ${n}!`][Math.abs(hash(e.id)) % 3];
    const H = [];

    if (i.pessoa && i.pessoa.n >= 2) H.push({
      k: 'pessoa', servicos: ['Google', 'Tráfego pago', 'IA'],
      fato: `Nas avaliações do Google, ${i.pessoa.nome} é citado(a) pelo nome em ${i.pessoa.n} de ${i.nRv} comentários recentes.`,
      oportunidade: 'Transformar a reputação pessoal em conteúdo e anúncios locais; capturar e responder avaliações com automação.',
      msg: `${oi} Lendo as avaliações de vocês no Google, ${i.pessoa.nome} aparece pelo nome em vários comentários. Esses elogios chegam a virar conteúdo ou ficam só lá no Google?`,
    });
    if (i.semResposta) H.push({
      k: 'resposta', servicos: ['Google', 'Automação', 'CRM'],
      fato: `As ${i.nRv} avaliações mais recentes no Google estão sem resposta da empresa.`,
      oportunidade: 'Rotina de resposta às avaliações (pesa no ranqueamento local) + pedido de avaliação automatizado.',
      msg: `${oi} Vi que vocês têm ${nota(e.nota)} no Google com ${fmt(e.av)} avaliações, mas as últimas estão sem resposta. Alguém da equipe acompanha esse perfil hoje?`,
    });
    if (f.semSite) H.push({
      k: 'site', servicos: ['Site', 'SEO', 'AEO', 'GEO'],
      fato: 'Perfil do Google sem site.',
      oportunidade: 'Site enxuto + SEO local + AEO/GEO para aparecer também em respostas de IA.',
      msg: `${oi} Quem procura "${seg}" ${onde} encontra vocês no Google com ${nota(e.nota)} de nota, mas sem um site para conhecer melhor. Hoje esses ${publico} chamam direto no WhatsApp?`,
    });
    if (f.social) H.push({
      k: 'social', servicos: ['Site', 'SEO', 'Automação'],
      fato: `O botão de site do perfil leva para uma rede social (${e.site}).`,
      oportunidade: 'Página própria com agendamento/orçamento e rastreio de origem dos contatos.',
      msg: `${oi} Reparei que o botão de site do perfil de vocês no Google leva para o Instagram. Funciona bem ou muita gente acaba perguntando a mesma coisa no WhatsApp?`,
    });
    if (st.n >= 5 && (e.av || 0) < st.max * 0.25) H.push({
      k: 'ranking', servicos: ['Google', 'SEO', 'Tráfego pago'],
      fato: `${fmt(e.av)} avaliações; a mais avaliada de "${e.c}" em ${e.cid} tem ${fmt(st.max)} (mediana local: ${fmt(st.med)}).`,
      oportunidade: 'Ganhar prova social e posição no Google local com rotina de avaliações e Perfil da Empresa otimizado.',
      msg: `${oi} Comparei "${seg}" em ${e.cid} no Google: vocês têm nota ${nota(e.nota)}, mas ${fmt(e.av)} avaliações, contra ${fmt(st.max)} da mais avaliada. Vocês costumam pedir avaliação depois do atendimento?`,
    });
    if (f.semHorario) H.push({
      k: 'horario', servicos: ['Google'],
      fato: 'Perfil do Google sem horário de funcionamento.',
      oportunidade: 'Completar e otimizar o Perfil da Empresa para aparecer em buscas "aberto agora".',
      msg: `${oi} O perfil de vocês no Google está sem horário de funcionamento, aí não aparece pra quem busca "${seg} aberto agora". Foi de propósito?`,
    });
    if (i.tema) H.push({
      k: 'tema', servicos: ['Tráfego pago', 'IA', 'Automação'],
      fato: `Tema mais elogiado nas avaliações recentes: ${i.tema}.`,
      oportunidade: 'Usar o diferencial que os clientes já reconhecem como mensagem central de anúncios e atendimento.',
      msg: `${oi} Li as avaliações de vocês e ${i.tema} é o que mais aparece nos elogios. Isso já entra na divulgação ou fica só no boca a boca?`,
    });
    if (f.notaBaixa && i.negativaSemResposta) H.push({
      k: 'reputacao', servicos: ['Google', 'CRM', 'Automação'],
      fato: `Nota ${nota(e.nota)}; há avaliação negativa recente sem resposta.`,
      oportunidade: 'Gestão de reputação: responder, recuperar o cliente e ampliar avaliações positivas.',
      msg: `${oi} Vi uma avaliação recente de vocês no Google que ficou sem resposta. Vocês preferem resolver direto com o cliente ou ainda não tinham visto?`,
    });
    if (e.nota >= 4.6 && st.n >= 5 && (e.av || 0) >= st.med) H.push({
      k: 'forte', servicos: ['Tráfego pago', 'IA', 'Automação', 'CRM'],
      fato: `Nota ${nota(e.nota)} com ${fmt(e.av)} avaliações, acima da mediana local (${fmt(st.med)}).`,
      oportunidade: 'Escalar a demanda com tráfego pago e organizar o atendimento com IA e CRM.',
      msg: `${oi} ${nota(e.nota)} com ${fmt(e.av)} avaliações coloca vocês entre as referências em "${seg}" ${onde}. Com esse movimento, como fica o WhatsApp nos horários de pico?`,
    });
    if (!H.length) H.push({
      k: 'origem', servicos: ['Google', 'SEO', 'Tráfego pago'],
      fato: `Nota ${nota(e.nota)} com ${fmt(e.av)} avaliações.`,
      oportunidade: 'Mapear de onde vêm os clientes e fortalecer o canal com mais potencial (Google, anúncios ou indicação).',
      msg: `${oi} Encontrei vocês pesquisando "${seg}" ${onde} no Google. Hoje a maioria dos novos ${publico} chega por lá, pelo Instagram ou por indicação?`,
    });
    return H;
  }

  function diagnose(e, idx = 0) {
    const H = ganchos(e), h = H[idx % H.length];
    const fatos = [`Google Maps: nota ${nota(e.nota)}, ${fmt(e.av)} avaliações.`, ...H.filter(x => !['forte', 'origem'].includes(x.k)).map(x => x.fato)];
    return { diagnostico: [...new Set(fatos)].join(' '), oportunidade: h.oportunidade, servicos: h.servicos, mensagem: h.msg, gancho: idx % H.length, nGanchos: H.length };
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

  $('#busca').addEventListener('submit', e => {
    e.preventDefault(); $('#q').blur(); state.q = $('#q').value; search();
    if (!state.rows.length && state.q.trim() && fonteAtual() === 'google' && LS.get('nanovendas.gkey') && $('#liveO').value && $('#liveOnde').value) $('#liveForm').requestSubmit();
  });
  let deb;
  $('#q').addEventListener('input', e => { state.q = e.target.value; clearTimeout(deb); deb = setTimeout(search, 60); });
  $('#flags').innerHTML = FLAGS.map(f => `<label><input type="checkbox" value="${f.k}"><span>${f.label}</span></label>`).join('');
  $('#flags').addEventListener('change', e => {
    const k = e.target.value, f = FLAGS.find(x => x.k === k);
    if (e.target.checked) state.flags.add(k);
    else { state.flags.delete(k); state.q = (' ' + state.q + ' ').replace(new RegExp(f.re.source, 'i'), ' ').replace(/\s+/g, ' ').trim(); $('#q').value = state.q; }
    search();
  });
  $('#more').onclick = () => {
    if (state.rows.length > state.shown) { state.shown += PAGE; renderResults(); return; }
    const nx = state.placesNext;
    if (nx && !liveBusy) viaPlaces(nx.o, nx.onde, nx.token);
  };
  $('#results').addEventListener('click', ev => {
    const wa = ev.target.closest('[data-wa]');
    if (wa) { const e = base.find(x => x.id === wa.dataset.wa); if (e) { registrarAbordagem(leadFrom(e)); setTimeout(renderResults, 400); } return; }
    if (ev.target.closest('a')) return;
    const ed = ev.target.closest('[data-edit]') || ev.target.closest('.res');
    if (ed) {
      const pid = ed.dataset.edit || (ed.querySelector('[data-edit]') || {}).dataset?.edit;
      const e = base.find(x => x.id === pid);
      if (!e) return;
      const existing = leads.find(l => l.placeId === pid);
      openForm(existing || leadFrom(e), !existing);
      show('form');
    }
  });


  /* =================== BUSCA AO VIVO ===================
     Dispara a coleta no GitHub Actions (gosom/google-maps-scraper), acompanha a execução
     e recarrega a base direto do repositório quando termina. */
  const GH = (() => {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    const repo = location.pathname.split('/').filter(Boolean)[0];
    return { owner: m ? m[1] : 'mateusoliveer', repo: m && repo ? repo : 'Nano-vendas', wf: 'coletar.yml' };
  })();
  const LS = {
    get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
  };
  const api = (path, opts = {}) => fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}${path}`, {
    ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${LS.get('nanovendas.gh')}`, ...(opts.headers || {}) },
  });
  const capital = s => s.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
  let liveBusy = false;

  /* separa "o quê" de "onde": "dedetizadora em curitiba", "dedetizadora curitiba", "dedetizadora bh" */
  function splitQuery(q) {
    let txt = q || '';
    FLAGS.forEach(f => { txt = txt.replace(f.strip, ' '); });
    txt = txt.replace(/\s+/g, ' ').trim();
    const m = txt.match(/^(.*?)\s+(?:em|no|na)\s+(.+)$/i);
    if (m) return { o: m[1].trim(), onde: m[2].trim() };
    let words = txt.split(' ');
    for (let k = 0; k < words.length; k++) {
      const full = ALIAS[norm(words[k])];
      if (full) { words.splice(k, 1); return { o: words.join(' '), onde: capital(full) }; }
    }
    const cidades = [...new Set(base.map(e => e.cid).filter(Boolean))].sort((a, b) => b.length - a.length);
    for (const c of cidades) {
      const cw = norm(c).split(' ');
      for (let k = 0; k + cw.length <= words.length; k++) {
        if (words.slice(k, k + cw.length).map(norm).join(' ') === cw.join(' ')) {
          words.splice(k, cw.length);
          return { o: words.join(' ').trim() || txt, onde: c };
        }
      }
    }
    return { o: txt, onde: LS.get('nanovendas.cidade') };
  }

  function prepareLive(show) {
    if (liveBusy) return;
    const q = state.q.trim();
    const { o, onde } = splitQuery(q);
    $('#liveO').value = o;
    $('#liveOnde').value = onde;
    $('#live').hidden = !(q && show);
    $('#semFonte').hidden = true;
    $('#liveStatus').textContent = '';
  }
  document.addEventListener('click', e => {
    if (e.target.id === 'abrirLive') { prepareLive(true); $('#liveO').focus(); }
  });

  $('#ghLink').href = `https://github.com/settings/personal-access-tokens/new?name=Nano%20Vendas&target_name=${GH.owner}&expires_in=none&actions=write&contents=read`;


  /* ---------- Google Places API (New): resposta em ~1 s ----------
     Mesmo desenho do ProspectOS (nando0x/ProspectOS, fontes_maps.py): places:searchText
     paginado até 60 resultados, convertido para o formato da coleta do gosom. */
  const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
  const PLACES_MASK = ['id', 'displayName', 'primaryTypeDisplayName', 'formattedAddress', 'addressComponents', 'rating',
    'userRatingCount', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri', 'googleMapsUri',
    'regularOpeningHours.weekdayDescriptions', 'businessStatus', 'reviews'].map(f => 'places.' + f).join(',') + ',nextPageToken';

  function placeParaEmpresa(pl, consulta) {
    const comp = tipo => (pl.addressComponents || []).find(c => (c.types || []).includes(tipo));
    const cidade = comp('administrative_area_level_2') || comp('locality');
    return {
      id: pl.id, n: (pl.displayName || {}).text || '', c: (pl.primaryTypeDisplayName || {}).text || '', cs: [],
      end: pl.formattedAddress || '',
      b: ((comp('sublocality_level_1') || comp('sublocality') || comp('neighborhood')) || {}).longText || '',
      cid: (cidade || {}).longText || '', uf: (comp('administrative_area_level_1') || {}).shortText || '',
      tel: pl.internationalPhoneNumber || pl.nationalPhoneNumber || '', site: pl.websiteUri || '',
      nota: pl.rating || 0, av: pl.userRatingCount || 0, maps: pl.googleMapsUri || '',
      hor: !!pl.regularOpeningHours, desc: false, email: [],
      rv: (pl.reviews || []).slice(0, 5).map(r => ({ s: r.rating || 0, t: (((r.originalText || r.text) || {}).text || '').replace(/\s+/g, ' ').slice(0, 260), r: null, w: r.relativePublishTimeDescription || '' })),
      q: consulta, upd: new Date().toISOString().slice(0, 10), src: 'places',
    };
  }

  async function placesPagina(chave, consulta, token) {
    const r = await fetch(PLACES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': PLACES_MASK },
      body: JSON.stringify({ textQuery: consulta, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, ...(token ? { pageToken: token } : {}) }),
    });
    if (!r.ok) {
      let det = ''; try { det = ((await r.json()).error || {}).message || ''; } catch { /* sem corpo */ }
      throw Object.assign(new Error('places'), { status: r.status, det });
    }
    return r.json();
  }

  /* limite diário no próprio app (além do teto no Google Cloud): garante ficar na cota gratuita */
  const LIMITE_DIA = 30;
  function usoHoje(somar) {
    const hoje = new Date().toISOString().slice(0, 10);
    let u; try { u = JSON.parse(localStorage.getItem('nanovendas.guso')) || {}; } catch { u = {}; }
    if (u.d !== hoje) u = { d: hoje, n: 0 };
    if (somar) { u.n++; try { localStorage.setItem('nanovendas.guso', JSON.stringify(u)); } catch { /* ok */ } }
    return u.n;
  }

  async function viaPlaces(o, onde, pageToken) {
    const consulta = `${o} em ${onde}`;
    const chave = LS.get('nanovendas.gkey');
    if (usoHoje() >= LIMITE_DIA) {
      $('#live').hidden = false;
      $('#liveStatus').textContent = `Limite gratuito de hoje atingido (${LIMITE_DIA} consultas ao Google). Amanhã libera de novo.`;
      return;
    }
    const status = $('#liveStatus'), btn = $('#liveForm button');
    liveBusy = true; btn.disabled = true; btn.textContent = 'Buscando…';
    status.textContent = `Buscando “${consulta}” no Google…`;
    const t0 = performance.now();
    const antes = new Set(base.map(x => x.id));
    const aplicar = lista => {
      const ids = new Map(base.map((x, i) => [x.id, i]));
      lista.forEach(e => { if (ids.has(e.id)) base[ids.get(e.id)] = { ...base[ids.get(e.id)], ...e, q: base[ids.get(e.id)].q || e.q }; else base.push(e); });
      guardarExtra(lista);
      prepare();
      state.q = consulta; $('#q').value = consulta;
      liveBusy = false; search(); liveBusy = true;
    };
    try {
      let token = null, total = 0;
      const d = await placesPagina(chave, consulta, pageToken);
      usoHoje(true);
      const lista = (d.places || []).filter(pl => pl.businessStatus !== 'CLOSED_PERMANENTLY').map(pl => placeParaEmpresa(pl, consulta));
      total = lista.length;
      token = d.nextPageToken || null;
      state.placesNext = token ? { o, onde, token, q: consulta } : null;
      if (pageToken) { const keep = state.shown; aplicar(lista); state.shown = keep + PAGE; renderResults(); } else aplicar(lista);
      $('#live').hidden = true;
      const novos = base.filter(x => !antes.has(x.id)).length;
      if (!total) { $('#live').hidden = false; status.textContent = 'O Google não encontrou empresas para essa busca.'; }
      else toast(`${novos || total} empresas em ${((performance.now() - t0) / 1000).toFixed(1)}s · ${usoHoje()}/${LIMITE_DIA} consultas hoje`);
    } catch (err) {
      $('#live').hidden = false;
      status.textContent = err.status === 403 || err.status === 400
        ? 'O Google recusou a chave. Confira se a Places API (New) está ativa e se a chave permite este site.'
        : err.status === 429 ? 'Limite de buscas do Google atingido por agora. Tente em alguns minutos.'
        : 'Não foi possível falar com o Google agora.';
      if (err.status === 403 || err.status === 400) $('#semFonte').hidden = false;
    } finally {
      liveBusy = false; btn.disabled = false; btn.textContent = 'Buscar ao vivo';
    }
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  $('#liveForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (liveBusy) return;
    const o = $('#liveO').value.trim(), onde = $('#liveOnde').value.trim();
    if (!o || !onde) return;
    LS.set('nanovendas.cidade', onde);
    const fonte = fonteAtual();
    if (fonte === 'google' && LS.get('nanovendas.gkey')) return viaPlaces(o, onde);
    if (fonte === 'gh' && LS.get('nanovendas.gh')) { /* segue para a coleta pelo GitHub */ }
    else { $('#semFonte').hidden = false; return; }
    const consulta = `${o} em ${onde}`;
    const id = `ao-vivo-${Date.now().toString(36)}`;
    const status = $('#liveStatus'), btn = $('#liveForm button');
    liveBusy = true; btn.disabled = true; btn.textContent = 'Buscando…';
    const t0 = Date.now();
    let msg = '';
    const say = m => { msg = m; status.textContent = `${msg} · ${Math.round((Date.now() - t0) / 1000)}s`; };
    const tick = setInterval(() => say(msg), 1000);
    try {
      say(`Pedindo ao Google Maps: “${consulta}”`);
      const repo = await api('').then(r => r.ok ? r.json() : Promise.reject(new Error(r.status === 401 || r.status === 403 ? 'token' : 'repo')));
      const ref = repo.default_branch;
      const d = await api(`/actions/workflows/${GH.wf}/dispatches`, { method: 'POST', body: JSON.stringify({ ref, inputs: { consultas: consulta, profundidade: '2', id } }) });
      if (d.status === 401 || d.status === 403) throw new Error('token');
      if (!d.ok) throw new Error('dispatch');
      let run = null, pronto = false;
      for (let i = 0; i < 100 && !pronto; i++) {
        await sleep(i < 3 ? 3000 : 5000);
        const runs = await api(`/actions/workflows/${GH.wf}/runs?event=workflow_dispatch&per_page=10`).then(r => r.json());
        run = (runs.workflow_runs || []).find(r => r.display_title === id) || run;
        if (!run) { say('Na fila do GitHub'); continue; }
        if (run.status === 'completed') { pronto = true; break; }
        if (run.status !== 'in_progress') { say('Na fila do GitHub'); continue; }
        say('Coletando no Google Maps');
        /* os dados ficam prontos quando o job de coleta termina, antes da publicação do site */
        const jobs = await api(`/actions/runs/${run.id}/jobs`).then(r => r.json()).catch(() => ({}));
        const col = (jobs.jobs || []).find(j => j.name === 'coletar');
        if (col && col.status === 'completed') { run = { ...run, conclusion: col.conclusion }; pronto = true; }
      }
      if (!pronto) throw new Error('timeout');
      if (run.conclusion !== 'success') throw Object.assign(new Error('run'), { url: run.html_url });
      say('Atualizando a base');
      const data = await api(`/contents/data/empresas.json?ref=${encodeURIComponent(ref)}`, { headers: { Accept: 'application/vnd.github.raw+json' } }).then(r => r.json());
      const antes = new Set(base.map(x => x.id));
      if (Array.isArray(data)) base = data;
      const novos = base.filter(x => !antes.has(x.id)).length;
      state.meta = { ...(state.meta || {}), atualizado: new Date().toISOString().slice(0, 10) };
      prepare();
      state.q = consulta; $('#q').value = consulta;
      liveBusy = false;
      search();
      $('#live').hidden = true;
      toast(novos ? `${novos} empresas novas em ${Math.round((Date.now() - t0) / 1000)}s` : 'Busca atualizada. Nenhuma empresa nova.');
    } catch (err) {
      const txt = err.message === 'token' ? 'O GitHub recusou o token. Conecte de novo.'
        : err.message === 'timeout' ? 'Está demorando mais que o normal. As empresas entram na base quando a coleta terminar.'
        : err.url ? 'A coleta falhou no GitHub.' : 'Não foi possível iniciar a busca ao vivo.';
      clearInterval(tick);
      status.textContent = txt;
      if (err.url) status.insertAdjacentHTML('beforeend', ` <a href="${esc(err.url)}" target="_blank" rel="noopener">Ver detalhes</a>`);
      if (err.message === 'token') { LS.set('nanovendas.gh', ''); $('#semFonte').hidden = false; }
    } finally {
      clearInterval(tick); liveBusy = false; btn.disabled = false; btn.textContent = 'Buscar ao vivo';
    }
  });


  /* =================== AJUSTES =================== */
  function fonteAtual() {
    const m = LS.get('nanovendas.modo');
    if (m === 'google' || m === 'gh') return m;
    return LS.get('nanovendas.gkey') ? 'google' : (LS.get('nanovendas.gh') ? 'gh' : 'google');
  }
  const mascara = v => v ? `conectada ••••${v.slice(-4)}` : '';
  function renderAjustes() {
    const f = fonteAtual();
    $$('[name=fonte]').forEach(r => { r.checked = r.value === f; });
    $('#gkStatus').textContent = mascara(LS.get('nanovendas.gkey'));
    $('#ghStatus').textContent = LS.get('nanovendas.gh') ? mascara(LS.get('nanovendas.gh')).replace('conectada', 'conectado') : '';
    $('#gkUso').textContent = LS.get('nanovendas.gkey') ? `Hoje: ${usoHoje()}/${LIMITE_DIA}.` : '';
    $('#cfgGoogle').classList.toggle('dim', f !== 'google');
    $('#cfgGh').classList.toggle('dim', f !== 'gh');
  }
  $$('[name=fonte]').forEach(r => r.addEventListener('change', () => { LS.set('nanovendas.modo', r.value); renderAjustes(); toast(r.value === 'google' ? 'Busca ao vivo pelo Google.' : 'Busca ao vivo pelo GitHub.'); }));
  $('#gkForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#gkKey').value.trim(); if (!v) return;
    LS.set('nanovendas.gkey', v); LS.set('nanovendas.modo', 'google'); $('#gkKey').value = '';
    renderAjustes(); toast('Chave do Google salva.');
  });
  $('#gkDel').onclick = () => { LS.set('nanovendas.gkey', ''); renderAjustes(); toast('Chave removida.'); };
  $('#ghForm').addEventListener('submit', async e => {
    e.preventDefault();
    const v = $('#ghToken').value.trim(); if (!v) return;
    LS.set('nanovendas.gh', v);
    const r = await api('').catch(() => null);
    if (!r || !r.ok) { LS.set('nanovendas.gh', ''); toast('Token não aceito. Confira o repositório e as permissões.'); return; }
    LS.set('nanovendas.modo', 'gh'); $('#ghToken').value = '';
    renderAjustes(); toast('GitHub conectado.');
  });
  $('#ghDel').onclick = () => { LS.set('nanovendas.gh', ''); renderAjustes(); toast('Token removido.'); };

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
    const e = base.find(x => x.id === l.placeId);
    F.dataset.g = l.gancho || 0;
    $('#outra').hidden = !e || ganchos(e).length < 2;
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
  $('#outra').addEventListener('click', () => {
    const e = base.find(x => x.id === F.elements.placeId.value);
    if (!e) return;
    const d = diagnose(e, (+F.dataset.g || 0) + 1);
    F.dataset.g = d.gancho;
    F.elements.mensagem.value = d.mensagem;
    F.elements.oportunidade.value = d.oportunidade;
    $$('[name=servicos]', F).forEach(i => { i.checked = d.servicos.includes(i.value); });
    update();
  });

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
  F.addEventListener('submit', e => { e.preventDefault(); persist(formData()); toast('Salvo no funil.'); show(anterior); });
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
  let anterior = 'buscar';
  $('#voltar').onclick = () => show(anterior);
  function show(view) {
    const atual = ($('.view.on') || {}).id;
    if (view === 'form' && atual && atual !== 'form') anterior = atual;
    if (view === 'ajustes') renderAjustes();
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
