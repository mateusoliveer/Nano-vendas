/* Nano Vendas — prospecção B2B. Dados ficam no navegador (localStorage); use Exportar para backup. */
(() => {
  const KEY = 'nanovendas.leads.v1';
  const LOTE = 5;

  const STATUS = ['Pesquisando', 'Pronto', 'Abordado', 'Respondeu', 'Reunião', 'Proposta', 'Ganho', 'Perdido'];
  const ABORDADOS = ['Abordado', 'Respondeu', 'Reunião', 'Proposta', 'Ganho', 'Perdido'];
  const SERVICOS = ['Google / Perfil da Empresa', 'SEO', 'GEO', 'AEO', 'Tráfego pago', 'IA', 'Automação', 'CRM', 'Site', 'Design'];

  const CLICHES = [
    'alavancar', 'potencializar', 'próximo nível', 'proximo nivel', 'transformar seu negócio', 'soluções inovadoras',
    'parceria de sucesso', 'oportunidade única', 'espero que esteja bem', 'gostaria de apresentar', 'somos uma agência',
    'somos a', 'impulsionar', 'decolar', 'sem compromisso', 'você sabia', 'resultados incríveis', 'escalar suas vendas'
  ];
  const PROMESSAS = ['garant', 'dobrar', 'triplicar', 'multiplicar', '100%', 'sem falta', 'com certeza vai', 'primeira página'];
  const PRECO = /(r\$\s?\d|\d+\s?(reais|mil)\b|preç|valor promocional|desconto|a partir de)/i;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- storage ---------- */
  let leads = load();
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(leads)); }
    catch { toast('Não foi possível salvar neste navegador. Exporte um backup.'); }
  }

  /* ---------- helpers ---------- */
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const digits = s => (s || '').replace(/\D/g, '');
  function phoneIntl(p) {
    let d = digits(p);
    if (!d) return '';
    if ((d.length === 10 || d.length === 11) && !(p || '').trim().startsWith('+')) d = '55' + d;
    return d;
  }
  const waLink = (tel, msg) => {
    const d = phoneIntl(tel);
    return d ? `https://wa.me/${d}?text=${encodeURIComponent(msg || '')}` : '';
  };
  const esc = s => (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const loteAtual = () => {
    const max = Math.max(1, ...leads.map(l => +l.lote || 1));
    const n = leads.filter(l => (+l.lote || 1) === max).length;
    return n >= LOTE ? max + 1 : max;
  };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600);
  }

  /* ---------- message quality ---------- */
  function checkMsg(msg, l = {}) {
    const m = (msg || '').trim();
    const low = norm(m);
    const first = norm(l.decisor).split(' ')[0];
    const words = [norm(l.empresa), first, ...norm(l.segmento).split(' ').filter(w => w.length > 4)].filter(Boolean);
    const specific = /\d/.test(m) || words.some(w => low.includes(w));
    const cliche = CLICHES.find(c => low.includes(norm(c)));
    const promessa = PROMESSAS.find(p => low.includes(norm(p)));
    return [
      { label: 'Termina com pergunta', ok: m.endsWith('?') },
      { label: `Curta (${m.length}/400)`, ok: m.length > 0 && m.length <= 400 },
      { label: 'Cita algo específico do negócio', ok: specific },
      { label: 'Fala com o decisor pelo nome', ok: !!first && low.includes(first) },
      { label: cliche ? `Clichê: “${cliche}”` : 'Sem clichês', ok: !cliche, hard: true },
      { label: PRECO.test(m) ? 'Menciona preço' : 'Sem preço', ok: !PRECO.test(m), hard: true },
      { label: promessa ? `Promessa: “${promessa}”` : 'Sem promessas', ok: !promessa, hard: true },
    ].map(c => ({ ...c, state: !m ? '' : c.ok ? 'ok' : 'bad' }));
  }
  function readiness(l) {
    const miss = [];
    ['empresa', 'local', 'decisor', 'decisorFonte', 'telefone', 'telefoneFonte', 'diagnostico', 'oportunidade', 'mensagem']
      .forEach(k => { if (!(l[k] || '').trim()) miss.push(k); });
    if (!l.whatsOk) miss.push('whatsOk');
    if (checkMsg(l.mensagem, l).some(c => !c.ok)) miss.push('mensagem');
    return miss;
  }
  function findDup(l) {
    const tel = phoneIntl(l.telefone), nome = norm(l.empresa), site = norm(l.site).replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
    return leads.find(o => o.id !== l.id && (
      (tel && phoneIntl(o.telefone) === tel) ||
      (nome && norm(o.empresa) === nome) ||
      (site && norm(o.site).replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') === site)
    ));
  }

  /* ---------- views ---------- */
  function show(view) {
    $$('.view').forEach(v => v.classList.toggle('on', v.id === view));
    $$('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
    if (view === 'form' && !$('#leadForm').elements.id.value) openForm();
    if (view === 'leads') render();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-view]');
    if (!v) return;
    e.preventDefault();
    if (v.dataset.view === 'form') openForm();
    show(v.dataset.view);
  });

  /* ---------- list ---------- */
  function render() {
    const q = norm($('#q').value), fs = $('#fStatus').value;
    const rows = leads
      .filter(l => !fs || l.status === fs)
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
          <a class="wa" href="${wa || '#'}" target="_blank" rel="noopener" aria-disabled="${!wa}" title="${wa ? 'Abrir no WhatsApp' : 'Complete e verifique o lead'}" data-wa="${l.id}">➜</a>
        </div>
        <p>${esc([l.decisor, l.local, l.segmento, l.lote ? 'Lote ' + l.lote : ''].filter(Boolean).join(' · '))}</p>
      </li>`;
    }).join('');
    $('#empty').style.display = leads.length ? 'none' : 'block';

    const ab = leads.filter(l => ABORDADOS.includes(l.status)).length;
    const conv = leads.filter(l => ['Respondeu', 'Reunião', 'Proposta', 'Ganho'].includes(l.status)).length;
    const ganhos = leads.filter(l => l.status === 'Ganho').length;
    $('#stats').innerHTML = [
      ['Leads', leads.length], ['Abordados', ab],
      ['Conversas', ab ? `${conv} <small>(${Math.round(conv / ab * 100)}%)</small>` : conv], ['Vendas', ganhos]
    ].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');

    const la = loteAtual(), n = leads.filter(l => (+l.lote || 1) === la).length;
    $('#loteInfo').textContent = `Lote ${la} · ${n}/${LOTE} leads pesquisados`;
  }
  $('#list').addEventListener('click', e => {
    const wa = e.target.closest('[data-wa]');
    if (wa) {
      const l = leads.find(x => x.id === wa.dataset.wa);
      if (l && l.status === 'Pronto') { l.status = 'Abordado'; l.abordado = Date.now(); l.atualizado = Date.now(); save(); setTimeout(render, 300); }
      return;
    }
    const it = e.target.closest('.item');
    if (it) { openForm(leads.find(l => l.id === it.dataset.id)); show('form'); }
  });
  $('#q').addEventListener('input', render);
  $('#fStatus').addEventListener('change', render);

  /* ---------- form ---------- */
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
  function openForm(l) {
    F.reset();
    const data = l || { lote: loteAtual(), status: 'Pesquisando', pais: 'Brasil' };
    Object.entries(data).forEach(([k, v]) => {
      const el = F.elements[k];
      if (!el || k === 'servicos') return;
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
    });
    $$('[name=servicos]', F).forEach(i => i.checked = (data.servicos || []).includes(i.value));
    F.elements.id.value = l ? l.id : '';
    $('#formTitle').textContent = l ? l.empresa : 'Novo lead';
    $('#del').hidden = !l;
    update();
  }
  function update() {
    const d = formData();
    $('#checks').innerHTML = checkMsg(d.mensagem, d).map(c => `<li class="${c.state}">${esc(c.label)}</li>`).join('');
    const dup = findDup(d);
    $('#dup').textContent = dup ? `Já existe: ${dup.empresa} (${dup.status}). Não repita quem já foi abordado.` : '';
    const ready = !readiness(d).length;
    const wa = $('#waPreview');
    wa.href = ready ? waLink(d.telefone, d.mensagem) : '#';
    wa.setAttribute('aria-disabled', String(!ready));
    wa.title = ready ? '' : 'Preencha os campos obrigatórios, verifique o WhatsApp e ajuste a mensagem';
  }
  F.addEventListener('input', update);

  F.addEventListener('submit', e => {
    e.preventDefault();
    const d = formData();
    const dup = findDup(d);
    if (dup && ABORDADOS.includes(dup.status)) return toast('Lead já abordado — não salvo.');
    const miss = readiness(d);
    if (ABORDADOS.slice(0, 5).includes(d.status) || d.status === 'Pronto') {
      if (miss.length) return toast('Para avançar o status, complete o lead e ajuste a mensagem.');
    }
    if (d.status === 'Pesquisando' && !miss.length) d.status = 'Pronto';
    const now = Date.now();
    if (d.id) {
      const i = leads.findIndex(l => l.id === d.id);
      leads[i] = { ...leads[i], ...d, atualizado: now };
    } else {
      leads.push({ ...d, id: uid(), criado: now, atualizado: now });
    }
    save(); toast('Lead salvo.'); show('leads');
  });
  $('#waPreview').addEventListener('click', () => {
    const id = F.elements.id.value, l = leads.find(x => x.id === id);
    if (l && l.status === 'Pronto') { l.status = 'Abordado'; l.abordado = Date.now(); save(); F.status.value = 'Abordado'; }
  });
  $('#del').addEventListener('click', () => {
    if (!confirm('Excluir este lead?')) return;
    leads = leads.filter(l => l.id !== F.elements.id.value);
    save(); toast('Lead excluído.'); show('leads');
  });

  /* ---------- import / export ---------- */
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  $('#exportJson').onclick = () => download(`nano-vendas-${stamp()}.json`, JSON.stringify(leads, null, 2), 'application/json');
  $('#exportCsv').onclick = () => {
    const cols = ['lote', 'status', 'empresa', 'segmento', 'local', 'pais', 'porte', 'site', 'instagram', 'gmb', 'outros', 'decisor', 'cargo',
      'decisorFonte', 'telefone', 'telefoneFonte', 'whatsOk', 'diagnostico', 'oportunidade', 'servicos', 'ticketTipo', 'ticket', 'mensagem', 'wa', 'notas'];
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
      data.forEach(l => { if (l && l.empresa && !findDup({ ...l, id: null })) { leads.push({ ...l, id: l.id || uid() }); add++; } });
      save(); render(); toast(`${add} lead(s) importado(s). Duplicados ignorados.`);
    } catch { toast('Arquivo inválido.'); }
    e.target.value = '';
  };

  render();
})();
