(() => {
  'use strict';

  const COLUMNS = [
    { id: 'todo',   name: 'Pendiente',   color: '#8f9bbb' },
    { id: 'doing',  name: 'En curso',    color: '#5b8cff' },
    { id: 'review', name: 'En revisión', color: '#f59e0b' },
    { id: 'done',   name: 'Hecho',       color: '#22a06b' }
  ];
  const PRI = { high: 'Alta', medium: 'Media', low: 'Baja' };
  const KEY = 'kanbanboard.v1';
  const THEME_KEY = 'kanbanboard.theme';

  const $ = (id) => document.getElementById(id);
  const el = {
    board: $('board'), summary: $('summary'), pct: $('pct'), bar: $('bar'), fill: $('bar-fill'),
    search: $('search'), fpri: $('filter-priority'), theme: $('theme'), newTask: $('new-task'),
    dialog: $('dialog'), form: $('form'), dlgTitle: $('dlg-title'),
    title: $('f-title'), desc: $('f-desc'), pri: $('f-priority'), col: $('f-col'),
    due: $('f-due'), tag: $('f-tag'), err: $('f-err'), del: $('f-delete'), cancel: $('f-cancel'),
    toast: $('toast')
  };

  /* ---------- Datos ---------- */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => new Date().toISOString().slice(0, 10);

  function seed() {
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    return [
      { id: uid(), col: 'todo',   title: 'Preparar la reunión semanal', desc: 'Revisar objetivos y puntos abiertos.', priority: 'medium', due: d(2), tag: 'Equipo' },
      { id: uid(), col: 'todo',   title: 'Responder correos pendientes', desc: '', priority: 'low', due: '', tag: 'Admin' },
      { id: uid(), col: 'doing',  title: 'Diseñar la nueva página de inicio', desc: 'Boceto, paleta y tipografías.', priority: 'high', due: d(1), tag: 'Diseño' },
      { id: uid(), col: 'review', title: 'Revisar el informe trimestral', desc: 'Comprobar cifras antes de enviarlo.', priority: 'high', due: d(-1), tag: 'Finanzas' },
      { id: uid(), col: 'done',   title: 'Configurar el repositorio', desc: 'Ramas y permisos listos.', priority: 'low', due: '', tag: 'Dev' }
    ];
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) return v; }
    } catch (_) { /* ignorar datos dañados */ }
    return seed();
  }
  let tasks = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch (_) { /* sin espacio */ } };

  /* ---------- Utilidades ---------- */
  function node(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((c) => c && n.append(c));
    return n;
  }
  const fmtDate = (s) => new Date(s + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.hidden = true), 2200);
  }

  /* ---------- Pintar ---------- */
  function matches(t) {
    const q = el.search.value.trim().toLowerCase();
    if (el.fpri.value && t.priority !== el.fpri.value) return false;
    if (!q) return true;
    return (t.title + ' ' + t.desc + ' ' + t.tag).toLowerCase().includes(q);
  }

  function cardEl(t) {
    const idx = COLUMNS.findIndex((c) => c.id === t.col);
    const late = t.due && t.col !== 'done' && t.due < today();

    const meta = node('div', { class: 'meta' },
      node('span', { class: 'chip pri', text: PRI[t.priority] }),
      t.tag && node('span', { class: 'chip tag', text: t.tag }),
      t.due && node('span', { class: 'chip due' + (late ? ' late' : ''), text: (late ? 'Vencida · ' : '') + fmtDate(t.due) }),
      node('span', { class: 'move' },
        node('button', { type: 'button', 'aria-label': 'Mover a la columna anterior', title: 'Mover a la izquierda', disabled: idx === 0, text: '◀', onclick: () => move(t.id, -1) }),
        node('button', { type: 'button', 'aria-label': 'Mover a la columna siguiente', title: 'Mover a la derecha', disabled: idx === COLUMNS.length - 1, text: '▶', onclick: () => move(t.id, 1) })
      )
    );

    const c = node('article', { class: 'card' + (t.col === 'done' ? ' done' : ''), draggable: 'true', 'data-id': t.id, 'data-priority': t.priority },
      node('div', { class: 'card-top' },
        node('h3', { class: 'title', text: t.title }),
        node('button', { class: 'edit-btn', type: 'button', 'aria-label': 'Editar tarea: ' + t.title, title: 'Editar', onclick: () => openDialog(t.id) },
          '✎')
      ),
      t.desc && node('p', { class: 'desc', text: t.desc }),
      meta
    );

    c.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', t.id);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => c.classList.add('dragging'));
    });
    c.addEventListener('dragend', () => {
      c.classList.remove('dragging');
      document.querySelectorAll('.column.over').forEach((x) => x.classList.remove('over'));
    });
    c.addEventListener('dblclick', () => openDialog(t.id));
    return c;
  }

  function render() {
    el.board.textContent = '';
    COLUMNS.forEach((col) => {
      const all = tasks.filter((t) => t.col === col.id);
      const shown = all.filter(matches);

      const list = node('div', { class: 'cards' }, shown.map(cardEl));
      if (!shown.length) list.append(node('div', { class: 'empty', text: all.length ? 'Sin resultados' : 'Arrastra tareas aquí' }));

      const section = node('section', { class: 'column', 'data-col': col.id, 'aria-label': col.name },
        node('div', { class: 'col-head' },
          node('span', { class: 'dot', style: '--c:' + col.color }),
          node('h2', { text: col.name }),
          node('span', { class: 'count', text: String(all.length), title: 'Tareas en esta columna' }),
          node('button', { class: 'add-inline', type: 'button', 'aria-label': 'Añadir tarea en ' + col.name, title: 'Añadir tarea', text: '+', onclick: () => openDialog(null, col.id) })
        ),
        list
      );

      section.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; section.classList.add('over'); });
      section.addEventListener('dragleave', (e) => { if (!section.contains(e.relatedTarget)) section.classList.remove('over'); });
      section.addEventListener('drop', (e) => {
        e.preventDefault();
        section.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        dropOn(id, col.id, list, e.clientY);
      });
      el.board.append(section);
    });
    updateStats();
  }

  function updateStats() {
    const total = tasks.length;
    const done = tasks.filter((t) => t.col === 'done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    el.summary.textContent = `${total} ${total === 1 ? 'tarea' : 'tareas'} · ${done} ${done === 1 ? 'hecha' : 'hechas'}`;
    el.pct.textContent = pct + '%';
    el.fill.style.width = pct + '%';
    el.bar.setAttribute('aria-valuenow', String(pct));
  }

  /* ---------- Acciones ---------- */
  function dropOn(id, colId, list, y) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    // posición: antes de la primera tarjeta cuyo centro queda por debajo del cursor
    const cards = [...list.querySelectorAll('.card:not(.dragging)')];
    const before = cards.find((c) => y < c.getBoundingClientRect().top + c.offsetHeight / 2);
    tasks = tasks.filter((x) => x.id !== id);
    t.col = colId;
    if (before) {
      const i = tasks.findIndex((x) => x.id === before.dataset.id);
      tasks.splice(i, 0, t);
    } else {
      tasks.push(t);
    }
    save(); render();
  }

  function move(id, dir) {
    const t = tasks.find((x) => x.id === id);
    const i = COLUMNS.findIndex((c) => c.id === t.col) + dir;
    if (i < 0 || i >= COLUMNS.length) return;
    t.col = COLUMNS[i].id;
    save(); render();
    toast(`Movida a “${COLUMNS[i].name}”`);
  }

  /* ---------- Diálogo ---------- */
  let editing = null;
  COLUMNS.forEach((c) => el.col.append(node('option', { value: c.id, text: c.name })));

  function openDialog(id, colId) {
    editing = id;
    const t = id ? tasks.find((x) => x.id === id) : null;
    el.dlgTitle.textContent = t ? 'Editar tarea' : 'Nueva tarea';
    el.title.value = t ? t.title : '';
    el.desc.value = t ? t.desc : '';
    el.pri.value = t ? t.priority : 'medium';
    el.col.value = t ? t.col : (colId || 'todo');
    el.due.value = t ? t.due : '';
    el.tag.value = t ? t.tag : '';
    el.del.hidden = !t;
    el.err.hidden = true;
    el.dialog.showModal();
    el.title.focus();
  }

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = el.title.value.trim();
    if (!title) { el.err.hidden = false; el.title.focus(); return; }
    const data = { title, desc: el.desc.value.trim(), priority: el.pri.value, col: el.col.value, due: el.due.value, tag: el.tag.value.trim() };
    if (editing) Object.assign(tasks.find((x) => x.id === editing), data);
    else tasks.push({ id: uid(), ...data });
    save(); render();
    el.dialog.close();
    toast(editing ? 'Tarea actualizada' : 'Tarea creada');
  });

  el.cancel.addEventListener('click', () => el.dialog.close());
  el.del.addEventListener('click', () => {
    if (!editing) return;
    tasks = tasks.filter((x) => x.id !== editing);
    save(); render();
    el.dialog.close();
    toast('Tarea eliminada');
  });
  // cerrar al hacer clic fuera
  el.dialog.addEventListener('click', (e) => { if (e.target === el.dialog) el.dialog.close(); });

  el.newTask.addEventListener('click', () => openDialog(null));
  el.search.addEventListener('input', render);
  el.fpri.addEventListener('change', render);

  /* ---------- Tema ---------- */
  function applyTheme(t) { document.documentElement.dataset.theme = t; }
  const saved = (() => { try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; } })();
  applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  el.theme.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* nada */ }
  });

  render();
})();
