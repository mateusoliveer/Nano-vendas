/* Nano Vendas — busca de empresas (Google Maps, coletadas pelo GitHub Actions) + funil de prospecção.
   A busca roda no navegador sobre data/empresas.json: instantânea e sem custo por consulta.
   O funil fica salvo neste navegador; use Exportar para backup. */
(() => {
  const KEY = 'nanovendas.leads.v1';
  const LOTE = 5;
  const PAGE = 30;

  const STATUS = ['Pesquisando', 'Pronto', 'Abordado', 'Respondeu', 'Reunião', 'Proposta', 'Ganho', 'Perdido'];
  const ABORDADOS = ['Abordado', 'Respondeu', 'Reunião', 'Proposta', 'Ganho', 'Perdido'];
  const SERVICOS = ['Google / Perfil da Empresa', 'SEO', 'GEO', 'AEO', 'Tráfego pago', 'IA', 'Automação', 'CRM', 'Site', 'Design'];

  const CLICHES = ['alavancar', 'potencializar', 'próximo nível', 'transformar seu negócio', 'soluções inovadoras', 'parceria de sucesso',
    'oportunidade única', 'espero que esteja bem', 'gostaria de apresentar', 'somos uma agência', 'impulsionar', 'decolar',
    'sem compromisso', 'você sabia', 'resultados incríveis', 'escalar suas vendas'];
  const PROMESSAS = ['garant', 'dobrar', 'triplicar', 'multiplicar', '100%', 'sem falta', 'com certeza vai', 'primeira página'];
  const PRECO = /(r\$\s?\d|\d+\s?(reais|mil)\b|preç|valor promocional|desconto|a partir de)/i;
  const SOCIAL = /(instagram\.com|facebook\.com|linktr\.ee|wa\.me|whatsapp\.com|linkbio|bio\.link|tiktok\.com)/i;

  const FLAGS = [
    { k: 'semSite', label: 'Sem site' },
    { k: 'social', label: 'Site é rede social' },
    { k: 'poucas', label: 'Menos de 20 avaliações' },
    { k: 'abaixo', label: 'Abaixo da média local' },
    { k: 'notaBaixa', label: 'Nota abaixo de 4,2' },
    { k: 'semHorario', label: 'Sem horário no perfil' },
    { k: 'celular', label: 'Celular' },
  ];

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const digits = s => (s || '').replace(/\D/g, '');
  const esc = s => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmt = n => (n || 0).toLocaleString('pt-BR');
  const nota = n => n ? n.toFixed(1).replace('.', ',') : '–';

  function phoneIntl(p) {
    let d = digits(p);
    if (!d) return '';
    if (d.startsWith('0')) d = d.replace(/^0+/, '');
    if ((d.length === 10 || d.length === 11) && !(p || '').trim().startsWith('+')) d = '55' + d;
    return d;
  }
  const isCelularBR = p => { const d = phoneIntl(p); return d.length === 13 && d.startsWith('55') && d[4] === '9'; };
  const waLink = (tel, msg) => { const d = phoneIntl(tel); return d ? `https://wa.me/${d}?text=${encodeURIComponent(msg || '')}` : ''; };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600);
  }

  /* =================== BASE DE EMPRESAS =================== */
  let base = [];
  let localStats = {};
  const state = { q: '', cidade: '', cat: '', ordem: 'op', flags: new Set(), shown: PAGE, rows: [] };

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

  function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }

  function prepare() {
    const groups = {};
    base.forEach(e => {
      const g = norm(e.c) + '|' + norm(e.cid);
      (groups[g] = groups[g] || []).push(e);
    });
    localStats = {};
    Object.entries(groups).forEach(([g, list]) => {
      const avs = list.map(e => e.av || 0);
      localStats[g] = { n: list.length, med: median(avs), max: Math.max(...avs), notaMed: median(list.filter(e => e.nota).map(e => e.nota)) };
    });
    base.forEach(e => {
      const st = localStats[norm(e.c) + '|' + norm(e.cid)];
      const f = {
        semSite: !e.site,
        social: !!e.site && SOCIAL.test(e.site),
        poucas: (e.av || 0) < 20,
        abaixo: st && st.n >= 5 && (e.av || 0) < st.med * 0.5,
        notaBaixa: e.nota > 0 && e.nota < 4.2,
        semHorario: !e.hor,
        celular: isCelularBR(e.tel),
      };
      e._f = f;
      e._st = st;
      e._score = (f.semSite ? 3 : 0) + (f.social ? 2 : 0) + (f.poucas ? 2 : 0) + (f.abaixo ? 2 : 0) +
        (f.notaBaixa ? 1 : 0) + (f.semHorario ? 1 : 0) + (f.celular ? 1.5 : 0) + (e.tel ? 0.5 : -3);
      e._idx = norm([e.n, e.c, (e.cs || []).join(' '), e.b, e.cid, e.uf, e.end].join(' '));
    });

    const cidades = [...new Set(base.map(e => e.cid && `${e.cid}${e.uf ? '/' + e.uf : ''}`).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    $('#fCidade').innerHTML = '<option value="">Todas as cidades</option>' + cidades.map(c => `<option>${esc(c)}</option>`).join('');
    const cats = {};
    base.forEach(e => { if (e.c) cats[e.c] = (cats[e.c] || 0) + 1; });
    $('#fCat').innerHTML = '<option value="">Todas as categorias</option>' +
      Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join('');
    $('#semBase').hidden = base.length > 0;
  }

  function search() {
    const t0 = performance.now();
    const terms = norm(state.q).split(/\s+/).filter(t => t && !['em', 'de', 'do', 'da', 'no', 'na', 'e'].includes(t));
    const rows = base.filter(e =>
      terms.every(t => e._idx.includes(t)) &&
      (!state.cidade || `${e.cid}${e.uf ? '/' + e.uf : ''}` === state.cidade) &&
      (!state.cat || e.c === state.cat) &&
      [...state.flags].every(k => e._f[k]));
    const by = { op: (a, b) => b._score - a._score || (b.av || 0) - (a.av || 0), av: (a, b) => (b.av || 0) - (a.av || 0), nota: (a, b) => (b.nota || 0) - (a.nota || 0) || (b.av || 0) - (a.av || 0) };
    rows.sort(by[state.ordem]);
    state.rows = rows;
    state.shown = PAGE;
    const ms = Math.max(1, Math.round(performance.now() - t0));
    const upd = state.meta && state.meta.atualizado ? ` · base de ${new Date(state.meta.atualizado + 'T12:00').toLocaleDateString('pt-BR')}` : '';
    $('#meta').textContent = base.length ? `${fmt(rows.length)} de ${fmt(base.length)} empresas · ${ms} ms${upd}` : '';
    renderResults();
  }

  function renderResults() {
    const abordados = new Set(leads.map(l => l.placeId).filter(Boolean));
    const slice = state.rows.slice(0, state.shown);
    $('#results').innerHTML = slice.map(e => {
      const flags = FLAGS.filter(f => e._f[f.k] && f.k !== 'celular').map(f => `<span class="flag">${f.label}</span>`).join('');
      const ja = abordados.has(e.id);
      const site = e.site ? `<a href="${esc(/^https?:/.test(e.site) ? e.site : 'https://' + e.site)}" target="_blank" rel="noopener">${esc(e.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 40))}</a>` : '';
      return `<li class="res">
        <div class="res-main">
          <h3>${esc(e.n)}</h3>
          <p class="cat">${esc([e.c, e.b, e.cid && `${e.cid}${e.uf ? '/' + e.uf : ''}`].filter(Boolean).join(' · '))}</p>
          <p class="facts"><span class="star">★ ${nota(e.nota)}</span> <span>${fmt(e.av)} avaliações</span>${e.tel ? `<span class="tel">${esc(e.tel)}${e._f.celular ? ' · celular' : ''}</span>` : '<span class="muted">sem telefone</span>'}${site}</p>
          ${flags ? `<div class="flags">${flags}</div>` : ''}
        </div>
        <div class="res-act">
          ${ja ? '<span class="pill">No funil</span>' : `<button class="btn sm" data-abordar="${esc(e.id)}">Abordar</button>`}
          ${e.maps ? `<a class="link" href="${esc(e.maps)}" target="_blank" rel="noopener">Maps</a>` : ''}
        </div>
      </li>`;
    }).join('');
    $('#more').hidden = state.rows.length <= state.shown;
  }

  /* diagnóstico + rascunho com fatos reais do perfil */
  function diagnose(e) {
    const st = e._st || {};
    const f = e._f;
    const fatos = [`Google Maps: nota ${nota(e.nota)} com ${fmt(e.av)} avaliações.`];
    if (st.n >= 5) fatos.push(`Entre ${st.n} empresas de "${e.c}" em ${e.cid} na base, a mediana é ${fmt(st.med)} avaliações e a mais avaliada tem ${fmt(st.max)}.`);
    if (f.semSite) fatos.push('Perfil sem site.');
    if (f.social) fatos.push(`O link de site aponta para rede social (${e.site}).`);
    if (f.semHorario) fatos.push('Perfil sem horário de funcionamento.');
    if (f.notaBaixa) fatos.push('Nota abaixo de 4,2.');

    let oportunidade, servicos, msg;
    const onde = e.b ? ` no ${e.b}` : (e.cid ? ` em ${e.cid}` : '');
    const seg = (e.c || 'empresas do seu segmento').toLowerCase();
    if (f.semSite || f.social) {
      oportunidade = 'Quem encontra a empresa no Google não tem um site para conhecer e decidir. Site enxuto + SEO local + AEO/GEO para aparecer em buscas e respostas de IA.';
      servicos = ['Site', 'SEO', 'Google / Perfil da Empresa', 'AEO', 'GEO'];
      msg = f.social
        ? `Olá! Vi a ${e.n} no Google Maps, ${nota(e.nota)} de nota com ${fmt(e.av)} avaliações${onde}. O link de site do perfil leva para a rede social. Hoje quem chega pelo Google costuma chamar direto no WhatsApp ou se perde no caminho?`
        : `Olá! Vi a ${e.n} no Google Maps, ${nota(e.nota)} de nota com ${fmt(e.av)} avaliações${onde}, mas o perfil não tem site. Hoje os novos clientes chegam mais pelo Google ou por indicação?`;
    } else if (f.abaixo || f.poucas) {
      oportunidade = 'Pouca prova social frente aos concorrentes locais. Rotina de avaliações + otimização do Perfil da Empresa + tráfego local.';
      servicos = ['Google / Perfil da Empresa', 'SEO', 'Tráfego pago', 'Automação'];
      msg = st.n >= 5
        ? `Olá! Pesquisando ${seg} em ${e.cid}, vi que a ${e.n} tem ${fmt(e.av)} avaliações no Google, enquanto a mais avaliada da cidade passa de ${fmt(st.max)}. Vocês já pedem avaliação aos clientes depois do atendimento?`
        : `Olá! Vi a ${e.n} no Google Maps com ${fmt(e.av)} avaliações${onde}. Vocês já pedem avaliação aos clientes depois do atendimento?`;
    } else if (f.notaBaixa) {
      oportunidade = 'Reputação no Google abaixo do esperado. Resposta às avaliações + rotina de pedido de avaliação + CRM pós-venda.';
      servicos = ['Google / Perfil da Empresa', 'CRM', 'Automação'];
      msg = `Olá! Vi a ${e.n} no Google Maps${onde}: ${fmt(e.av)} avaliações e nota ${nota(e.nota)}. Vocês têm alguém cuidando das respostas às avaliações hoje?`;
    } else {
      oportunidade = 'Perfil forte no Google. Escalar com tráfego pago, automação de atendimento e CRM.';
      servicos = ['Tráfego pago', 'IA', 'Automação', 'CRM'];
      msg = `Olá! Vi a ${e.n} no Google Maps, ${nota(e.nota)} com ${fmt(e.av)} avaliações${onde}, das melhores da região. Com esse volume, como vocês organizam hoje os contatos que chegam pelo WhatsApp?`;
    }
    return { diagnostico: fatos.join(' '), oportunidade, servicos, mensagem: msg };
  }

  function abordar(id) {
    const e = base.find(x => x.id === id);
    if (!e) return;
    const d = diagnose(e);
    openForm({
      placeId: e.id, empresa: e.n, segmento: e.c, local: [e.b, e.cid && `${e.cid}${e.uf ? '/' + e.uf : ''}`].filter(Boolean).join(', '),
      site: e.site, gmb: e.maps, telefone: e.tel, telefoneFonte: 'Google Maps', whatsOk: false,
      diagnostico: d.diagnostico, oportunidade: d.oportunidade, servicos: d.servicos, mensagem: d.mensagem,
      ticketTipo: e._f.semSite ? 'Entrada' : 'Médio', status: 'Pesquisando', lote: loteAtual(),
    }, true);
    show('form');
  }

  $('#busca').addEventListener('submit', e => { e.preventDefault(); search(); });
  let deb;
  $('#q').addEventListener('input', e => { state.q = e.target.value; clearTimeout(deb); deb = setTimeout(search, 80); });
  $('#fCidade').onchange = e => { state.cidade = e.target.value; search(); };
  $('#fCat').onchange = e => { state.cat = e.target.value; search(); };
  $('#fOrdem').onchange = e => { state.ordem = e.target.value; search(); };
  $('#flags').innerHTML = FLAGS.map(f => `<label><input type="checkbox" value="${f.k}"><span>${f.label}</span></label>`).join('');
  $('#flags').addEventListener('change', e => { e.target.checked ? state.flags.add(e.target.value) : state.flags.delete(e.target.value); search(); });
  $('#more').onclick = () => { state.shown += PAGE; renderResults(); };
  $('#results').addEventListener('click', e => { const b = e.target.closest('[data-abordar]'); if (b) abordar(b.dataset.abordar); });

  /* =================== FUNIL =================== */
  let leads = loadLocal();
  function loadLocal() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(leads)); }
    catch { toast('Não foi possível salvar neste navegador. Exporte um backup.'); }
  }
  function put(l) { const i = leads.findIndex(x => x.id === l.id); if (i >= 0) leads[i] = l; else leads.push(l); saveLocal(); }
  function remove(id) { leads = leads.filter(l => l.id !== id); saveLocal(); }

  const loteAtual = () => {
    const max = Math.max(1, ...leads.map(l => +l.lote || 1));
    return leads.filter(l => (+l.lote || 1) === max).length >= LOTE ? max + 1 : max;
  };

  function checkMsg(msg, l = {}) {
    const m = (msg || '').trim(), low = norm(m);
    const first = norm(l.decisor).split(' ')[0];
    const words = [norm(l.empresa), first].filter(Boolean);
    const cliche = CLICHES.find(c => low.includes(norm(c)));
    const promessa = PROMESSAS.find(p => low.includes(norm(p)));
    const checks = [
      { label: 'Termina com pergunta', ok: m.endsWith('?') },
      { label: `Curta (${m.length}/400)`, ok: m.length > 0 && m.length <= 400 },
      { label: 'Cita algo específico do negócio', ok: /\d/.test(m) || words.some(w => low.includes(w)) },
      { label: cliche ? `Clichê: “${cliche}”` : 'Sem clichês', ok: !cliche },
      { label: PRECO.test(m) ? 'Menciona preço' : 'Sem preço', ok: !PRECO.test(m) },
      { label: promessa ? `Promessa: “${promessa}”` : 'Sem promessas', ok: !promessa },
    ];
    if (first) checks.push({ label: 'Chama o decisor pelo nome', ok: low.includes(first), soft: true });
    return checks.map(c => ({ ...c, state: !m ? '' : c.ok ? 'ok' : 'bad' }));
  }
  function readiness(l) {
    const miss = ['empresa', 'local', 'telefone', 'diagnostico', 'oportunidade', 'mensagem'].filter(k => !(l[k] || '').toString().trim());
    if (!l.whatsOk) miss.push('whatsOk');
    if (checkMsg(l.mensagem, l).some(c => !c.ok && !c.soft)) miss.push('mensagem');
    return miss;
  }
  const host = s => norm(s).replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
  function findDup(l) {
    const tel = phoneIntl(l.telefone), nome = norm(l.empresa), site = SOCIAL.test(l.site || '') ? '' : host(l.site);
    return leads.find(o => o.id !== l.id && (
      (l.placeId && o.placeId === l.placeId) || (tel && phoneIntl(o.telefone) === tel) ||
      (nome && norm(o.empresa) === nome) || (site && host(o.site) === site)));
  }

  function renderLeads() {
    const q = norm($('#lq').value), fs = $('#fStatus').value;
    const rows = leads.filter(l => !fs || l.status === fs)
      .filter(l => !q || norm([l.empresa, l.local, l.segmento, l.decisor].join(' ')).includes(q))
      .sort((a, b) => (b.atualizado || 0) - (a.atualizado || 0));
    $('#list').innerHTML = rows.map(l => {
      const ready = !readiness(l).length;
      const cls = l.status === 'Perdido' ? 'lost' : (l.status === 'Pesquisando' || !ready) ? 'warn' : '';
      const wa = ready ? waLink(l.telefone, l.mensagem) : '';
      return `<li class="item" data-id="${l.id}">
        <h3>${esc(l.empresa)}</h3>
        <div class="right">
          <span class="pill ${cls}">${esc(l.status)}${!ready && l.status !== 'Pesquisando' ? ' · incompleto' : ''}</span>
          <a class="wa" href="${wa || '#'}" target="_blank" rel="noopener" aria-disabled="${!wa}" title="${wa ? 'Abrir no WhatsApp' : 'Confirme o WhatsApp e ajuste a mensagem'}" data-wa="${l.id}">➜</a>
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
    $('#loteInfo').textContent = `Lote ${la} · ${leads.filter(l => (+l.lote || 1) === la).length}/${LOTE} leads`;
    $('#funilN').textContent = leads.length ? leads.length : '';
  }
  function markAbordado(id) {
    const l = leads.find(x => x.id === id);
    if (l && l.status === 'Pronto') put({ ...l, status: 'Abordado', abordado: Date.now(), atualizado: Date.now() });
  }
  $('#list').addEventListener('click', e => {
    const wa = e.target.closest('[data-wa]');
    if (wa) { markAbordado(wa.dataset.wa); setTimeout(renderLeads, 300); return; }
    const it = e.target.closest('.item');
    if (it) { openForm(leads.find(l => l.id === it.dataset.id)); show('form'); }
  });
  $('#lq').addEventListener('input', renderLeads);
  $('#fStatus').addEventListener('change', renderLeads);

  /* ---------- formulário ---------- */
  const F = $('#leadForm');
  $('#fStatus').insertAdjacentHTML('beforeend', STATUS.map(s => `<option>${s}</option>`).join(''));
  $('#statusSel').innerHTML = STATUS.map(s => `<option>${s}</option>`).join('');
  $('#servicos').innerHTML = SERVICOS.map(s => `<label><input type="checkbox" name="servicos" value="${s}"><span>${s}</span></label>`).join('');

  function formData() {
    const d = Object.fromEntries(new FormData(F));
    d.servicos = $$('[name=servicos]:checked', F).map(i => i.value);
    d.whatsOk = F.whatsOk.checked;
    return d;
  }
  function openForm(l, isNew) {
    F.reset();
    Object.entries(l).forEach(([k, v]) => {
      const el = F.elements[k];
      if (!el || k === 'servicos' || el instanceof RadioNodeList) return;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
    });
    $$('[name=servicos]', F).forEach(i => i.checked = (l.servicos || []).includes(i.value));
    F.elements.id.value = isNew ? '' : l.id;
    $('#formTitle').textContent = l.empresa || 'Lead';
    $('#del').hidden = !!isNew;
    update();
  }
  function update() {
    const d = formData();
    $('#checks').innerHTML = checkMsg(d.mensagem, d).map(c => `<li class="${c.state}">${esc(c.label)}</li>`).join('');
    const dup = findDup(d);
    $('#dup').textContent = dup ? `Já está no funil: ${dup.empresa} (${dup.status}). Não repita quem já foi abordado.` : '';
    const ready = !readiness(d).length;
    const wa = $('#waPreview');
    wa.href = ready ? waLink(d.telefone, d.mensagem) : '#';
    wa.setAttribute('aria-disabled', String(!ready));
    wa.title = ready ? '' : 'Confirme o WhatsApp e ajuste a mensagem';
  }
  F.addEventListener('input', update);

  function persist(d) {
    const dup = findDup(d);
    if (dup && ABORDADOS.includes(dup.status)) { toast('Empresa já abordada. Não foi salva.'); return null; }
    if (d.status !== 'Pesquisando' && readiness(d).length) { toast('Confirme o WhatsApp e ajuste a mensagem para avançar.'); return null; }
    if (d.status === 'Pesquisando' && !readiness(d).length) d.status = 'Pronto';
    const now = Date.now();
    const prev = leads.find(l => l.id === d.id) || (dup && !ABORDADOS.includes(dup.status) ? dup : null);
    const lead = prev ? { ...prev, ...d, id: prev.id, atualizado: now } : { ...d, id: uid(), criado: now, atualizado: now };
    put(lead);
    F.elements.id.value = lead.id;
    return lead;
  }
  F.addEventListener('submit', e => {
    e.preventDefault();
    if (persist(formData())) { toast('Lead salvo no funil.'); show('leads'); }
  });
  $('#waPreview').addEventListener('click', () => {
    const lead = persist(formData());
    if (lead) { markAbordado(lead.id); F.status.value = 'Abordado'; $('#del').hidden = false; }
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
    const cols = ['lote', 'status', 'empresa', 'segmento', 'local', 'site', 'gmb', 'decisor', 'cargo', 'telefone', 'telefoneFonte', 'whatsOk',
      'diagnostico', 'oportunidade', 'servicos', 'ticketTipo', 'ticket', 'mensagem', 'wa', 'notas'];
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
      data.forEach(l => { if (l && l.empresa && !findDup({ ...l, id: null })) { put({ ...l, id: l.id || uid() }); add++; } });
      renderLeads(); toast(`${add} lead(s) importado(s). Duplicados ignorados.`);
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

  renderLeads();
  loadBase();
})();
