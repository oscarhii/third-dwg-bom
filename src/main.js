import './style.css';
import JSZip from 'jszip';
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';

const $ = (selector) => document.querySelector(selector);
const ui = {
  dropzone: $('#dropzone'), fileInput: $('#fileInput'), engineStatus: $('#engineStatus'),
  summary: $('#summary'), clearButton: $('#clearButton'), fileTabs: $('#fileTabs'),
  dataEmpty: $('#dataEmpty'), dataView: $('#dataView'), includeHeader: $('#includeHeader'),
  editButton: $('#editButton'), undoButton: $('#undoButton'), resetButton: $('#resetButton'), csvButton: $('#csvButton'), zipButton: $('#zipButton'), activeFileLabel: $('#activeFileLabel'),
  totalIn: $('#totalIn'), totalMm: $('#totalMm'), totalWarning: $('#totalWarning'), formula: $('#formula'), itemFilter: $('#itemFilter'),
  showAllButton: $('#showAllButton'), selectAllButton: $('#selectAllButton'),
  clearChecksButton: $('#clearChecksButton'), selectVisibleButton: $('#selectVisibleButton'),
  clearVisibleButton: $('#clearVisibleButton'), filterHint: $('#filterHint'), checkList: $('#checkList'),
};

const jobs = [];
let activeIndex = 0;
let enginePromise;
let processingPromise = Promise.resolve();

function getEngine() {
  if (!enginePromise) {
    const wasmBase = new URL('.', window.location.href).href.replace(/\/$/, '');
    enginePromise = LibreDwg.create(wasmBase).then((engine) => {
      ui.engineStatus.innerHTML = '<i></i>解析引擎已就緒';
      ui.engineStatus.className = 'engine-status ready';
      return engine;
    }).catch((error) => {
      ui.engineStatus.textContent = '解析引擎載入失敗，請重新整理';
      ui.engineStatus.className = 'engine-status failed';
      throw error;
    });
  }
  return enginePromise;
}

const cleanAlnum = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const plainText = (value) => String(value || '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').trim();
const fmt = (value) => Math.abs(value - Math.round(value)) < 1e-9 ? String(Math.round(value)) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
const escapeHtml = (value) => { const node = document.createElement('span'); node.textContent = String(value); return node.innerHTML; };
const baseName = (name) => name.replace(/\.dwg$/i, '');

function parseCatalog(code) {
  const normalized = cleanAlnum(code);
  if (!normalized.startsWith('BFC')) {
    if (/M\d{2}N$/.test(normalized)) return { values: [0], details: ['末端件→0'], body: normalized };
    throw new Error('無法辨識型號格式');
  }
  if (!/M\d{2}N$/.test(normalized)) throw new Error('型號結尾需為 M + 兩位數字 + N');
  const gPosition = normalized.indexOf('G');
  if (gPosition < 0) throw new Error('型號中找不到 G');
  const body = normalized.slice(gPosition + 1, -4);
  const values = [];
  const details = [];
  for (const match of body.matchAll(/(\d+)([A-Z]?)/g)) {
    const raw = Number(match[1]);
    const letter = match[2];
    const value = letter === 'S' && raw >= 1 && raw <= 10 ? raw * 12 : raw;
    values.push(value);
    details.push(`${match[1]}${letter}→${value}`);
  }
  return { values, details, body };
}

function collectTexts(database) {
  return database.entities.flatMap((entity) => {
    if (entity.type === 'TEXT' && entity.startPoint) return [{ text: plainText(entity.text), x: entity.startPoint.x, y: entity.startPoint.y }];
    if (entity.type === 'MTEXT' && entity.insertionPoint) return [{ text: plainText(entity.text), x: entity.insertionPoint.x, y: entity.insertionPoint.y }];
    return [];
  }).filter((entry) => entry.text && Number.isFinite(entry.x) && Number.isFinite(entry.y));
}

function extractTable(database) {
  const texts = collectTexts(database);
  let header;
  for (const item of texts.filter((cell) => cell.text.toUpperCase() === 'ITEM')) {
    const qty = texts.filter((cell) => cell.text.toUpperCase() === 'QTY' && Math.abs(cell.y - item.y) <= 1 && cell.x > item.x).sort((a, b) => a.x - b.x)[0];
    if (!qty) continue;
    const catalog = texts.filter((cell) => cell.text.toUpperCase().replace(/\s+/g, ' ') === 'CATALOG NUMBER' && Math.abs(cell.y - item.y) <= 1 && cell.x > qty.x).sort((a, b) => a.x - b.x)[0];
    if (catalog) { header = { item, qty, catalog }; break; }
  }
  if (!header) throw new Error('找不到 ITEM、QTY、CATALOG NUMBER 表頭');
  const itemQtyBoundary = (header.item.x + header.qty.x) / 2;
  const qtyCatalogBoundary = (header.qty.x + header.catalog.x) / 2;
  const rows = [];
  const catalogCells = texts.filter((cell) => cell.y < header.item.y - 1 && cell.x >= qtyCatalogBoundary && /^[A-Za-z0-9][A-Za-z0-9._+/#-]{4,}$/.test(cell.text));
  for (const catalog of catalogCells) {
    const sameRow = texts.filter((cell) => Math.abs(cell.y - catalog.y) <= 1);
    const qty = sameRow.filter((cell) => cell.x >= itemQtyBoundary && cell.x < qtyCatalogBoundary && /^\d+$/.test(cell.text)).sort((a, b) => Math.abs(a.x - header.qty.x) - Math.abs(b.x - header.qty.x))[0];
    const item = sameRow.filter((cell) => cell.x < itemQtyBoundary && /^[A-Za-z]+$/.test(cell.text)).sort((a, b) => Math.abs(a.x - header.item.x) - Math.abs(b.x - header.item.x))[0];
    if (item && qty) rows.push({ item: item.text.toUpperCase(), qty: Number(qty.text), catalog: catalog.text, y: catalog.y });
  }
  rows.sort((a, b) => b.y - a.y);
  if (!rows.length) throw new Error('找到表頭，但沒有有效資料列');
  return rows.map((row) => ({ ...row, modifiedFields: [] }));
}

function prepareRows(rows) {
  const catalogItems = new Map();
  const catalogCounts = new Map();
  rows.forEach((row) => {
    const key = cleanAlnum(row.catalog);
    if (!catalogItems.has(key)) catalogItems.set(key, new Set());
    catalogItems.get(key).add(row.item);
    catalogCounts.set(key, (catalogCounts.get(key) || 0) + 1);
  });
  return rows.map((row) => {
    const catalogKey = cleanAlnum(row.catalog);
    const duplicateItems = [...(catalogItems.get(catalogKey) || [])];
    const duplicateCatalog = (catalogCounts.get(catalogKey) || 0) > 1;
    const crossItemDuplicate = duplicateItems.length > 1;
    try {
      const parsed = parseCatalog(row.catalog);
      const firstIsTotal = parsed.values.length > 1 && parsed.values[0] === parsed.values.slice(1).reduce((sum, value) => sum + value, 0);
      const selectable = firstIsTotal ? parsed.values.slice(1) : [...parsed.values];
      const checks = [];
      if (selectable.length === 1) {
        checks.push({ value: selectable[0], label: `${selectable[0]} in${row.qty > 1 ? `（原 QTY ${row.qty}，同長度只列 1 個）` : ''}`, selected: false, locked: false, multiplier: 1 });
      } else {
        for (let copy = 1; copy <= row.qty; copy += 1) selectable.forEach((value, index) => checks.push({ value, label: row.qty > 1 ? `#${copy}-${index + 1}: ${value} in` : `${index + 1}: ${value} in`, selected: false, locked: false, multiplier: 1 }));
      }
      return { ...row, ...parsed, firstIsTotal, selectable, checks, duplicateItems, duplicateCatalog, crossItemDuplicate, error: '' };
    } catch (error) {
      return { ...row, values: [], details: [], selectable: [], checks: [], duplicateItems, duplicateCatalog, crossItemDuplicate, error: error.message };
    }
  });
}

function csvField(value) { const text = String(value); return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function makeCsv(job) {
  const lines = job.rows.map((row) => [row.item, row.qty, row.catalog].map(csvField).join(','));
  if (ui.includeHeader.checked) lines.unshift('ITEM,QTY,CATALOG NUMBER');
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function currentJob() { return jobs[activeIndex]; }

function cloneRawRows(rows) { return rows.map((row) => ({ ...row, modifiedFields: [...(row.modifiedFields || [])] })); }
function syncModifiedFields(job, index) {
  const row = job.rawRows[index]; const original = job.originalRows[index];
  row.modifiedFields = ['item', 'qty', 'catalog'].filter((field) => row[field] !== original[field]);
}
function hasModifications(job) { return Boolean(job?.rawRows?.some((row) => row.modifiedFields?.length)); }

function parseQuery() {
  const normalized = ui.itemFilter.value.trim().toUpperCase().replace(/\s*\*\s*/g, '*');
  const query = new Map();
  normalized.split(/[,;\s]+/).filter(Boolean).forEach((token) => {
    const match = token.match(/^([A-Z]{1,2})(?:\*(\d+))?$/);
    if (match && Number(match[2] || 1) >= 1) query.set(match[1], Number(match[2] || 1));
  });
  return query;
}

function applyFilter() {
  const job = currentJob();
  if (!job?.rows) return renderChecks();
  const query = parseQuery();
  if (!query.size) {
    job.rows.forEach((row) => row.checks.forEach((check) => { check.multiplier = 1; }));
    ui.filterHint.textContent = `顯示全部，共 ${new Set(job.rows.map((row) => row.item)).size} 個 ITEM`;
  } else {
    const available = new Set(job.rows.map((row) => row.item));
    const missing = [...query.keys()].filter((item) => !available.has(item));
    const ignored = [];
    job.rows.forEach((row) => {
      if (!query.has(row.item)) return;
      if (row.selectable.length === 1) row.checks.forEach((check) => { check.multiplier = query.get(row.item); check.selected = true; });
      else if (query.get(row.item) > 1) ignored.push(`${row.item}×${query.get(row.item)}`);
    });
    let message = `顯示：${[...query].map(([item, value]) => value > 1 ? `${item}×${value}` : item).join(', ')}`;
    if (missing.length) message += ` ｜ 找不到：${missing.join(', ')}`;
    if (ignored.length) message += ` ｜ 多長度不套用乘數：${ignored.join(', ')}`;
    ui.filterHint.textContent = message;
  }
  renderChecks();
}

function renderTabs() {
  const nameCounts = new Map();
  jobs.forEach((job) => { const key = job.file.name.toLocaleLowerCase(); nameCounts.set(key, (nameCounts.get(key) || 0) + 1); });
  ui.fileTabs.innerHTML = jobs.map((job, index) => {
    const duplicateName = nameCounts.get(job.file.name.toLocaleLowerCase()) > 1;
    return `<div class="file-tab ${index === activeIndex ? 'active' : ''} ${job.status} ${duplicateName ? 'duplicate-name' : ''}" data-tab="${index}" role="tab" title="${duplicateName ? '檔名重複：' : ''}${escapeHtml(job.file.name)}"><i>${job.status === 'done' ? '✓' : job.status === 'error' ? '!' : '•'}</i><span>${escapeHtml(baseName(job.file.name))}</span><button type="button" class="remove-tab" data-remove="${index}" title="移除此檔案" aria-label="移除 ${escapeHtml(job.file.name)}">×</button></div>`;
  }).join('');
}

function renderData() {
  const job = currentJob();
  const done = jobs.filter((entry) => entry.status === 'done').length;
  ui.summary.textContent = jobs.length ? `${jobs.length} 個檔案・${done} 完成` : '尚未加入檔案';
  ui.dataEmpty.hidden = Boolean(job);
  ui.dataView.hidden = !job;
  ui.csvButton.disabled = job?.status !== 'done';
  ui.zipButton.disabled = done === 0;
  ui.editButton.disabled = job?.status !== 'done';
  ui.undoButton.disabled = job?.status !== 'done' || !job.editHistory?.length;
  ui.resetButton.disabled = job?.status !== 'done' || !hasModifications(job);
  ui.editButton.textContent = job?.editing ? '完成編輯' : '編輯資料';
  if (!job) { ui.dataView.innerHTML = ''; return; }
  if (job.status === 'working' || job.status === 'queued') { ui.dataView.innerHTML = '<div class="loading-box"><span class="spinner"></span>正在讀取圖面…</div>'; return; }
  if (job.status === 'error') { ui.dataView.innerHTML = `<div class="error-box"><strong>解析失敗</strong><p>${escapeHtml(job.error)}</p></div>`; return; }
  const rows = job.rows.map((row, index) => {
    const modified = new Set(row.modifiedFields || []);
    const cell = (field, value, type = 'text') => job.editing ? `<input class="cell-input ${modified.has(field) ? 'modified-cell' : ''}" data-edit-row="${index}" data-edit-field="${field}" type="${type}" value="${escapeHtml(value)}" ${type === 'number' ? 'min="1"' : ''}/>` : `<span class="${modified.has(field) ? 'modified-cell text-cell' : ''}">${escapeHtml(value)}</span>`;
    const icons = `${row.duplicateCatalog ? '<span class="status-icon warning-icon" title="此 CATALOG NUMBER 在本檔案中重複">!</span>' : ''}${modified.size ? '<span class="status-icon modified-icon" title="此列含有手動修改的欄位">✎</span>' : ''}`;
    return `<tr class="${row.crossItemDuplicate || row.error ? 'warning-row' : ''}"><td>${cell('item', row.item)}</td><td>${cell('qty', row.qty, 'number')}</td><td>${cell('catalog', row.catalog)}</td><td>${row.error ? 'ERROR' : row.values.join(', ')}</td><td class="row-status">${icons}</td></tr>`;
  }).join('');
  const catalogGroups = new Map();
  job.rows.forEach((row) => {
    const key = cleanAlnum(row.catalog); if (!catalogGroups.has(key)) catalogGroups.set(key, []); catalogGroups.get(key).push(row);
  });
  const duplicates = [...catalogGroups.values()].filter((group) => group.length > 1);
  const duplicateNotice = duplicates.length ? `<div class="duplicate-summary"><strong>⚠ 發現相同 CATALOG NUMBER</strong><ul>${duplicates.map((group) => `<li><code>${escapeHtml(group[0].catalog)}</code><span>${group.length} 筆｜ITEM ${escapeHtml([...new Set(group.map((row) => row.item))].join(', '))}</span></li>`).join('')}</ul></div>` : '';
  ui.dataView.innerHTML = `<table><thead><tr><th>ITEM</th><th>QTY</th><th>CATALOG NUMBER</th><th>解析長度</th><th></th></tr></thead><tbody>${rows}</tbody></table>${duplicateNotice}`;
}

function renderChecks() {
  const job = currentJob();
  ui.activeFileLabel.textContent = job ? job.file.name : '請先加入 DWG';
  if (!job || job.status !== 'done') {
    ui.checkList.innerHTML = job?.status === 'error' ? `<div class="operation-empty error-box"><h3>此檔案無法建立選項</h3><p>${escapeHtml(job.error)}</p></div>` : '<div class="operation-empty"><span>✓</span><h3>等待圖面資料</h3><p>解析完成後會依 ITEM / QTY 產生可選長度</p></div>';
    updateTotal(); return;
  }
  const query = parseQuery();
  const visibleRows = query.size ? job.rows.filter((row) => query.has(row.item)) : job.rows;
  if (!visibleRows.length) { ui.checkList.innerHTML = '<div class="operation-empty"><h3>找不到符合的 ITEM</h3></div>'; updateTotal(); return; }
  ui.checkList.innerHTML = visibleRows.map((row, rowIndex) => {
    if (row.error) return `<article class="item-card invalid"><div class="item-card-head"><strong>ITEM ${escapeHtml(row.item)}</strong><span>${escapeHtml(row.error)}</span></div></article>`;
    const originalIndex = job.rows.indexOf(row);
    const duplicate = row.crossItemDuplicate ? `<p class="duplicate">⚠ 相同 CATALOG 亦出現在 ITEM ${row.duplicateItems.filter((item) => item !== row.item).join(', ')}</p>` : '';
    const statusIcons = `<div class="card-status">${row.duplicateCatalog ? '<span class="status-icon warning-icon" title="此 CATALOG NUMBER 在本檔案中重複">!</span>' : ''}${row.modifiedFields?.length ? '<span class="status-icon modified-icon" title="此 ITEM 含有手動修改的欄位">✎</span>' : ''}</div>`;
    const totalNote = row.firstIsTotal ? `總長 ${row.values[0]} in 已略過｜` : '';
    const info = row.selectable.length === 1 ? `${totalNote}實際長度 1 個${row.qty > 1 ? `｜QTY ${row.qty} 同長度只計 1 次` : ''}` : `${totalNote}共 ${row.qty * row.selectable.length} 個可選長度`;
    const isMultiLength = row.selectable.length > 1;
    const renderChoice = (check, checkIndex) => `<div class="length-choice ${check.locked ? 'locked' : ''}"><label class="length-check"><input type="checkbox" data-row="${originalIndex}" data-check="${checkIndex}" ${check.selected ? 'checked' : ''} ${check.locked ? 'disabled' : ''}/><span></span><b>${escapeHtml(check.label)}</b>${check.multiplier > 1 ? `<em>× ${check.multiplier} = ${fmt(check.value * check.multiplier)} in</em>` : ''}</label>${isMultiLength ? `<button type="button" class="lock-button ${check.locked ? 'is-locked' : ''}" data-lock-row="${originalIndex}" data-lock-check="${checkIndex}" title="${check.locked ? '解除鎖定，恢復可選' : '鎖定此長度，排除本次加總'}" aria-label="${check.locked ? '解除鎖定' : '鎖定'}">${check.locked ? '🔒' : '🔓'}</button>` : ''}</div>`;
    let checks;
    if (isMultiLength && row.qty > 1) {
      const perCopy = row.selectable.length;
      checks = Array.from({ length: row.qty }, (_, copyIndex) => {
        const start = copyIndex * perCopy;
        const choices = row.checks.slice(start, start + perCopy).map((check, offset) => renderChoice(check, start + offset)).join('');
        return `<div class="length-group"><span class="copy-label">#${copyIndex + 1}</span><div class="copy-choices">${choices}</div></div>`;
      }).join('');
    } else {
      checks = row.checks.map(renderChoice).join('');
    }
    return `<article class="item-card ${isMultiLength ? 'multi-length-card' : ''} ${row.crossItemDuplicate ? 'duplicate-card' : ''}">${statusIcons}<div class="item-card-head"><strong>ITEM ${escapeHtml(row.item)}</strong><span>QTY ${row.qty}</span><code>${escapeHtml(row.catalog)}</code></div>${duplicate}<div class="length-options ${isMultiLength && row.qty > 1 ? 'grouped' : ''}">${checks}</div><p class="item-note">${info}</p></article>`;
  }).join('');
  updateTotal();
}

function updateTotal() {
  const job = currentJob();
  const selected = job?.rows?.flatMap((row) => row.checks.filter((check) => check.selected).map((check) => ({ item: row.item, ...check }))) || [];
  const total = selected.reduce((sum, entry) => sum + entry.value * entry.multiplier, 0);
  ui.totalIn.textContent = fmt(total); ui.totalMm.textContent = fmt(total * 25.4);
  const query = parseQuery();
  const exceeded = [];
  if (job?.rows && query.size) job.rows.forEach((row) => { const requested = query.get(row.item); if (requested && requested > row.qty) exceeded.push(`${row.item}×${requested}（原 QTY ${row.qty}）`); });
  ui.totalWarning.hidden = exceeded.length === 0;
  ui.totalWarning.textContent = exceeded.length ? `注意：輸入數量超過 QTY：${exceeded.join('、')}` : '';
  if (!selected.length) { ui.formula.textContent = '尚未勾選'; return; }
  const grouped = new Map();
  selected.forEach((entry) => { if (!grouped.has(entry.item)) grouped.set(entry.item, []); grouped.get(entry.item).push(entry); });
  ui.formula.textContent = [...grouped].sort().map(([item, entries]) => `${item}: ${entries.map((entry) => entry.multiplier > 1 ? `${fmt(entry.value)}×${entry.multiplier}` : fmt(entry.value)).join(' + ')} = ${fmt(entries.reduce((sum, entry) => sum + entry.value * entry.multiplier, 0))} in`).join('  ｜  ');
}

function render() { activeIndex = Math.min(activeIndex, Math.max(0, jobs.length - 1)); renderTabs(); renderData(); renderChecks(); }

async function processJob(job) {
  job.status = 'working'; render(); let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let pointer; let engine;
    try {
      const buffer = await job.file.arrayBuffer(); engine = await getEngine();
      pointer = engine.dwg_read_data(buffer, Dwg_File_Type.DWG);
      if (!pointer) throw new Error('DWG 解析器回傳 null，檔案可能損壞或版本不相容');
      job.rawRows = extractTable(engine.convert(pointer)); job.originalRows = cloneRawRows(job.rawRows); job.editHistory = [];
      job.rows = prepareRows(job.rawRows); job.status = 'done'; job.editing = false; render(); return;
    } catch (error) {
      console.error(error); lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /null|memory|out of bounds|function signature|abort/i.test(message);
      if (!retryable || attempt === 1) break;
      enginePromise = undefined;
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      if (pointer && engine) { try { engine.dwg_free(pointer); } catch (freeError) { console.warn(freeError); } }
    }
  }
  job.status = 'error'; job.error = lastError instanceof Error ? lastError.message : '未知錯誤'; render();
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.name.toLowerCase().endsWith('.dwg'));
  if (!files.length) return;
  const start = jobs.length; files.forEach((file) => jobs.push({ file, status: 'queued' })); activeIndex = start; render();
  processingPromise = processingPromise.then(async () => {
    let queued; while ((queued = jobs.find((entry) => entry.status === 'queued'))) await processJob(queued);
  });
  await processingPromise; ui.fileInput.value = '';
}

ui.fileInput.addEventListener('change', () => addFiles(ui.fileInput.files));
['dragenter', 'dragover'].forEach((name) => ui.dropzone.addEventListener(name, (event) => { event.preventDefault(); ui.dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((name) => ui.dropzone.addEventListener(name, (event) => { event.preventDefault(); ui.dropzone.classList.remove('dragging'); }));
ui.dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
ui.fileTabs.addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    event.stopPropagation();
    const removeIndex = Number(remove.dataset.remove);
    jobs.splice(removeIndex, 1);
    if (!jobs.length) activeIndex = 0;
    else if (removeIndex < activeIndex) activeIndex -= 1;
    else if (removeIndex === activeIndex) activeIndex = Math.min(removeIndex, jobs.length - 1);
    ui.itemFilter.value = ''; render(); return;
  }
  const tab = event.target.closest('[data-tab]');
  if (tab) { activeIndex = Number(tab.dataset.tab); ui.itemFilter.value = ''; render(); }
});
ui.checkList.addEventListener('change', (event) => { const input = event.target.closest('[data-row]'); if (!input) return; const check = currentJob().rows[Number(input.dataset.row)].checks[Number(input.dataset.check)]; if (!check.locked) check.selected = input.checked; updateTotal(); });
ui.checkList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-lock-row]'); if (!button) return;
  const check = currentJob().rows[Number(button.dataset.lockRow)].checks[Number(button.dataset.lockCheck)];
  check.locked = !check.locked; if (check.locked) { check.selected = false; check.multiplier = 1; }
  renderChecks();
});
ui.editButton.addEventListener('click', () => { const job = currentJob(); if (!job?.rows) return; job.editing = !job.editing; renderData(); });
ui.undoButton.addEventListener('click', () => {
  const job = currentJob(); const action = job?.editHistory?.pop(); if (!action) return;
  if (action.type === 'reset') job.rawRows = cloneRawRows(action.rows);
  else { job.rawRows[action.index][action.field] = action.previous; syncModifiedFields(job, action.index); }
  job.rows = prepareRows(job.rawRows); render();
});
ui.resetButton.addEventListener('click', () => {
  const job = currentJob(); if (!job?.rows || !hasModifications(job)) return;
  job.editHistory.push({ type: 'reset', rows: cloneRawRows(job.rawRows) });
  job.rawRows = cloneRawRows(job.originalRows); job.rows = prepareRows(job.rawRows); render();
});
ui.dataView.addEventListener('change', (event) => {
  const input = event.target.closest('[data-edit-row]'); if (!input) return;
  const job = currentJob(); const index = Number(input.dataset.editRow); const field = input.dataset.editField; let value = input.value.trim();
  if (field === 'item') value = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  if (field === 'qty') value = Math.max(1, Number.parseInt(value, 10) || 1);
  if (field === 'catalog') value = cleanAlnum(value);
  const previous = job.rawRows[index][field]; if (value === previous) return;
  job.editHistory.push({ type: 'edit', index, field, previous }); job.rawRows[index][field] = value; syncModifiedFields(job, index);
  job.rows = prepareRows(job.rawRows); render();
});
ui.itemFilter.addEventListener('input', applyFilter);
ui.showAllButton.addEventListener('click', () => { ui.itemFilter.value = ''; applyFilter(); ui.itemFilter.focus(); });
function setVisible(value) { const job = currentJob(); if (!job?.rows) return; const query = parseQuery(); job.rows.filter((row) => !query.size || query.has(row.item)).forEach((row) => row.checks.forEach((check) => { if (!check.locked) check.selected = value; })); renderChecks(); }
ui.selectVisibleButton.addEventListener('click', () => setVisible(true)); ui.clearVisibleButton.addEventListener('click', () => setVisible(false));
ui.selectAllButton.addEventListener('click', () => { const job = currentJob(); job?.rows?.forEach((row) => row.checks.forEach((check) => { if (!check.locked) check.selected = true; })); renderChecks(); });
function clearAllChecks() { const job = currentJob(); job?.rows?.forEach((row) => row.checks.forEach((check) => { check.selected = false; check.multiplier = 1; })); renderChecks(); }
ui.clearChecksButton.addEventListener('click', clearAllChecks);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { clearAllChecks(); ui.filterHint.textContent = '已按 Esc：全部取消並歸零'; } });
ui.clearButton.addEventListener('click', () => { jobs.length = 0; activeIndex = 0; ui.itemFilter.value = ''; render(); });
ui.csvButton.addEventListener('click', () => { const job = currentJob(); if (job?.status === 'done') downloadBlob(new Blob([makeCsv(job)], { type: 'text/csv;charset=utf-8' }), `${baseName(job.file.name)}.csv`); });
ui.zipButton.addEventListener('click', async () => { const zip = new JSZip(); jobs.filter((job) => job.status === 'done').forEach((job) => zip.file(`${baseName(job.file.name)}.csv`, makeCsv(job))); ui.zipButton.disabled = true; ui.zipButton.textContent = '打包中…'; downloadBlob(await zip.generateAsync({ type: 'blob' }), `dwg-csv-${new Date().toISOString().slice(0, 10)}.zip`); ui.zipButton.textContent = '全部 ZIP'; ui.zipButton.disabled = false; });
ui.includeHeader.addEventListener('change', renderData);

render(); getEngine();
