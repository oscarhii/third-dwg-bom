import './style.css';
import JSZip from 'jszip';
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';

const ui = {
  dropzone: document.querySelector('#dropzone'),
  fileInput: document.querySelector('#fileInput'),
  includeHeader: document.querySelector('#includeHeader'),
  engineStatus: document.querySelector('#engineStatus'),
  resultsSection: document.querySelector('#resultsSection'),
  summary: document.querySelector('#summary'),
  zipButton: document.querySelector('#zipButton'),
  clearButton: document.querySelector('#clearButton'),
  emptyState: document.querySelector('#emptyState'),
  resultContent: document.querySelector('#resultContent'),
  fileTabs: document.querySelector('#fileTabs'),
  activeResult: document.querySelector('#activeResult'),
};

const jobs = [];
let activeIndex = 0;
let enginePromise;

function getEngine() {
  if (!enginePromise) {
    const wasmBase = new URL('.', window.location.href).href.replace(/\/$/, '');
    enginePromise = LibreDwg.create(wasmBase).then((engine) => {
      ui.engineStatus.classList.add('ready');
      ui.engineStatus.innerHTML = '<span class="ready-dot"></span><span>解析引擎已就緒</span>';
      return engine;
    }).catch((error) => {
      ui.engineStatus.classList.add('failed');
      ui.engineStatus.textContent = '解析引擎載入失敗，請重新整理頁面。';
      throw error;
    });
  }
  return enginePromise;
}

function plainText(value = '') {
  return String(value)
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .trim();
}

function collectTexts(database) {
  return database.entities.flatMap((entity) => {
    if (entity.type === 'TEXT' && entity.startPoint) {
      return [{ text: plainText(entity.text), x: entity.startPoint.x, y: entity.startPoint.y }];
    }
    if (entity.type === 'MTEXT' && entity.insertionPoint) {
      return [{ text: plainText(entity.text), x: entity.insertionPoint.x, y: entity.insertionPoint.y }];
    }
    return [];
  }).filter((entry) => entry.text && Number.isFinite(entry.x) && Number.isFinite(entry.y));
}

function extractTable(database) {
  const texts = collectTexts(database);
  let header;

  for (const item of texts.filter((cell) => cell.text.toUpperCase() === 'ITEM')) {
    const qty = texts
      .filter((cell) => cell.text.toUpperCase() === 'QTY' && Math.abs(cell.y - item.y) <= 1 && cell.x > item.x)
      .sort((a, b) => a.x - b.x)[0];
    if (!qty) continue;
    const catalog = texts
      .filter((cell) => cell.text.toUpperCase().replace(/\s+/g, ' ') === 'CATALOG NUMBER' && Math.abs(cell.y - item.y) <= 1 && cell.x > qty.x)
      .sort((a, b) => a.x - b.x)[0];
    if (catalog) {
      header = { item, qty, catalog };
      break;
    }
  }

  if (!header) throw new Error('找不到同一列的 ITEM、QTY、CATALOG NUMBER 表頭');

  const itemQtyBoundary = (header.item.x + header.qty.x) / 2;
  const qtyCatalogBoundary = (header.qty.x + header.catalog.x) / 2;
  const tolerance = 1;
  const catalogCells = texts.filter((cell) =>
    cell.y < header.item.y - tolerance &&
    cell.x >= qtyCatalogBoundary &&
    /^[A-Za-z0-9][A-Za-z0-9._+/#-]{4,}$/.test(cell.text)
  );

  const rows = [];
  for (const catalog of catalogCells) {
    const sameRow = texts.filter((cell) => Math.abs(cell.y - catalog.y) <= tolerance);
    const qty = sameRow
      .filter((cell) => cell.x >= itemQtyBoundary && cell.x < qtyCatalogBoundary && /^\d+$/.test(cell.text))
      .sort((a, b) => Math.abs(a.x - header.qty.x) - Math.abs(b.x - header.qty.x))[0];
    const item = sameRow
      .filter((cell) => cell.x < itemQtyBoundary && /^[A-Za-z]+$/.test(cell.text))
      .sort((a, b) => Math.abs(a.x - header.item.x) - Math.abs(b.x - header.item.x))[0];
    if (item && qty) rows.push({ item: item.text, qty: Number(qty.text), catalog: catalog.text, y: catalog.y });
  }

  rows.sort((a, b) => b.y - a.y);
  if (!rows.length) throw new Error('已找到表頭，但沒有有效的資料列');
  return rows;
}

function csvField(value) {
  const text = String(value);
  return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function makeCsv(rows) {
  const lines = rows.map((row) => [row.item, row.qty, row.catalog].map(csvField).join(','));
  if (ui.includeHeader.checked) lines.unshift('ITEM,QTY,CATALOG NUMBER');
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function baseName(fileName) {
  return fileName.replace(/\.dwg$/i, '');
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

function render() {
  const success = jobs.filter((job) => job.status === 'done');
  const failed = jobs.filter((job) => job.status === 'error');
  const working = jobs.filter((job) => job.status === 'working' || job.status === 'queued');
  ui.emptyState.hidden = jobs.length > 0;
  ui.resultContent.hidden = jobs.length === 0;
  ui.summary.innerHTML = `<span>${jobs.length} 個檔案</span><i></i><span class="ok">${success.length} 完成</span>${failed.length ? `<i></i><span class="bad">${failed.length} 失敗</span>` : ''}${working.length ? `<i></i><span>${working.length} 處理中</span>` : ''}`;
  ui.zipButton.disabled = success.length === 0;

  if (!jobs.length) return;
  activeIndex = Math.min(activeIndex, jobs.length - 1);
  ui.fileTabs.innerHTML = jobs.map((job, index) => {
    const mark = job.status === 'done' ? '✓' : job.status === 'error' ? '!' : '•';
    return `<button type="button" role="tab" aria-selected="${index === activeIndex}" class="file-tab ${job.status} ${index === activeIndex ? 'active' : ''}" data-tab="${index}"><i>${mark}</i><span>${escapeHtml(baseName(job.file.name))}</span></button>`;
  }).join('');

  const job = jobs[activeIndex];
  if (job.status === 'done') {
    const rows = job.rows.map((row) => `<tr><td>${escapeHtml(row.item)}</td><td>${row.qty}</td><td>${escapeHtml(row.catalog)}</td></tr>`).join('');
    ui.activeResult.innerHTML = `<div class="active-meta"><div><h3>${escapeHtml(job.file.name)}</h3><p>${formatBytes(job.file.size)} ・ ${job.rows.length} 筆資料</p></div><button class="download-button wide" data-download="${activeIndex}"><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 19h14" /></svg><span>下載 CSV</span></button></div><div class="table-wrap"><table><thead><tr><th>ITEM</th><th>QTY</th><th>CATALOG NUMBER</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else if (job.status === 'error') {
    ui.activeResult.innerHTML = `<div class="result-message error-message"><strong>解析失敗</strong><p>${escapeHtml(job.error)}</p></div>`;
  } else {
    ui.activeResult.innerHTML = `<div class="result-message"><span class="spinner"></span><strong>${job.status === 'queued' ? '等待處理' : '正在讀取圖面…'}</strong></div>`;
  }
}

async function processJob(job) {
  job.status = 'working';
  render();
  let pointer;
  try {
    const [engine, buffer] = await Promise.all([getEngine(), job.file.arrayBuffer()]);
    pointer = engine.dwg_read_data(buffer, Dwg_File_Type.DWG);
    if (!pointer) throw new Error('DWG 格式無法讀取');
    const database = engine.convert(pointer);
    job.rows = extractTable(database);
    job.csvName = `${baseName(job.file.name)}.csv`;
    job.csv = makeCsv(job.rows);
    job.status = 'done';
  } catch (error) {
    console.error(error);
    job.status = 'error';
    job.error = error instanceof Error ? error.message : '未知錯誤';
  } finally {
    if (pointer) (await getEngine()).dwg_free(pointer);
    render();
  }
}

async function addFiles(fileList) {
  const files = [...fileList].filter((file) => file.name.toLowerCase().endsWith('.dwg'));
  if (!files.length) return;
  for (const file of files) jobs.push({ file, status: 'queued' });
  activeIndex = jobs.length - files.length;
  render();
  for (const job of jobs.filter((entry) => entry.status === 'queued')) await processJob(job);
  ui.fileInput.value = '';
}

ui.fileInput.addEventListener('change', () => addFiles(ui.fileInput.files));
['dragenter', 'dragover'].forEach((eventName) => ui.dropzone.addEventListener(eventName, (event) => {
  event.preventDefault();
  ui.dropzone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((eventName) => ui.dropzone.addEventListener(eventName, (event) => {
  event.preventDefault();
  ui.dropzone.classList.remove('dragging');
}));
ui.dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

ui.fileTabs.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (!tab) return;
  activeIndex = Number(tab.dataset.tab);
  render();
});

ui.activeResult.addEventListener('click', (event) => {
  const button = event.target.closest('[data-download]');
  if (!button) return;
  const job = jobs[Number(button.dataset.download)];
  downloadBlob(new Blob([job.csv], { type: 'text/csv;charset=utf-8' }), job.csvName);
});

ui.zipButton.addEventListener('click', async () => {
  const zip = new JSZip();
  jobs.filter((job) => job.status === 'done').forEach((job) => zip.file(job.csvName, job.csv));
  ui.zipButton.disabled = true;
  ui.zipButton.lastChild.textContent = ' 打包中…';
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `dwg-csv-${new Date().toISOString().slice(0, 10)}.zip`);
  ui.zipButton.lastChild.textContent = ' 下載全部 ZIP';
  ui.zipButton.disabled = false;
});

ui.clearButton.addEventListener('click', () => {
  jobs.length = 0;
  activeIndex = 0;
  render();
});

ui.includeHeader.addEventListener('change', () => {
  jobs.filter((job) => job.status === 'done').forEach((job) => { job.csv = makeCsv(job.rows); });
});

getEngine();
