import './style.css';
import './test.css';
import JSZip from 'jszip';
import { Dwg_File_Type, LibreDwg } from '@mlightcad/libredwg-web';

const $ = (selector) => document.querySelector(selector);
const ui = {
  dropzone: $('#dropzone'), fileInput: $('#fileInput'), engineStatus: $('#engineStatus'),
  summary: $('#summary'), clearButton: $('#clearButton'), fileTabs: $('#fileTabs'),
  dataEmpty: $('#dataEmpty'), dataView: $('#dataView'), dimensionView: $('#dimensionView'), dimensionSummary: $('#dimensionSummary'), includeHeader: $('#includeHeader'),
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
    const wasmBase = new URL('../', window.location.href).href.replace(/\/$/, '');
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

function parseBalloonLabel(value) {
  const normalized = plainText(value).toUpperCase().replace(/（/g, '(').replace(/）/g, ')').trim();
  const match = normalized.match(/^(?:(\d+)\s*[\)×X*.:_-]?\s*)?([A-Z]{1,2})$/);
  if (!match) return null;
  return { item: match[2], qty: Math.max(1, Number(match[1] || 1)), label: normalized };
}

function collectBalloons(database, texts) {
  const circles = database.entities.filter((entity) => entity.type === 'CIRCLE' && entity.center && Number.isFinite(entity.radius) && entity.radius > 0);
  const leaderLines = database.entities.filter((entity) => entity.type === 'LINE' && (entity.layer || entity.layerName) === 'LABELS' && entity.startPoint && entity.endPoint);
  return circles.map((circle) => {
    const candidates = texts.map((entry) => ({ entry, distance: Math.hypot(entry.x - circle.center.x, entry.y - circle.center.y) })).filter(({ distance }) => distance <= circle.radius * 1.45).sort((a, b) => a.distance - b.distance);
    const combinedText = candidates.map(({ entry }) => entry).sort((a, b) => a.x - b.x).map((entry) => entry.text).join(' ');
    const combined = parseBalloonLabel(combinedText);
    const parsedCandidate = candidates.map(({ entry }) => ({ entry, parsed: parseBalloonLabel(entry.text) })).find(({ parsed }) => parsed);
    const leader = leaderLines.map((line) => { const startDistance = Math.hypot(line.startPoint.x - circle.center.x, line.startPoint.y - circle.center.y); const endDistance = Math.hypot(line.endPoint.x - circle.center.x, line.endPoint.y - circle.center.y); return { line, near: Math.min(startDistance, endDistance), anchor: startDistance > endDistance ? line.startPoint : line.endPoint }; }).filter((entry) => entry.near <= circle.radius * 1.7).sort((a, b) => a.near - b.near)[0];
    const anchor = leader?.anchor || circle.center;
    return { x: anchor.x, y: anchor.y, circleX: circle.center.x, circleY: circle.center.y, radius: circle.radius, parsed: combined || parsedCandidate?.parsed || null, raw: combinedText || candidates[0]?.entry.text || '' };
  });
}

function collectCrossBoxes(segments) {
  const boxes = [];
  for (let first = 0; first < segments.length; first += 1) for (let second = first + 1; second < segments.length; second += 1) {
    const a = segments[first]; const b = segments[second];
    if (Math.abs(a.dx) < a.length * .25 || Math.abs(a.dy) < a.length * .25 || Math.abs(b.dx) < b.length * .25 || Math.abs(b.dy) < b.length * .25) continue;
    if (Math.sign(a.dx * a.dy) === Math.sign(b.dx * b.dy)) continue;
    const minX = Math.min(a.minX, b.minX); const maxX = Math.max(a.maxX, b.maxX); const minY = Math.min(a.minY, b.minY); const maxY = Math.max(a.maxY, b.maxY);
    const tolerance = Math.max(maxX - minX, maxY - minY) * .08;
    if (Math.abs(a.minX - b.minX) <= tolerance && Math.abs(a.maxX - b.maxX) <= tolerance && Math.abs(a.minY - b.minY) <= tolerance && Math.abs(a.maxY - b.maxY) <= tolerance) boxes.push({ minX, maxX, minY, maxY });
  }
  return boxes;
}

function tableCenter(table) {
  const points = [table.header.item, table.header.qty, table.header.catalog, ...table.sourceRows.flatMap((row) => [row.itemCell, row.qtyCell, row.catalogCell])];
  return { x: (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2, y: (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2 };
}

function catalogLengthOptions(catalog) {
  const normalized = cleanAlnum(catalog);
  const square = normalized.match(/G(?:LEM|LFM)(\d+)/);
  if (square) return { options: [Number(square[1])], special: normalized.includes('LEM') ? 'LEM 雙方向' : 'LFM 雙方向', ambiguous: false };
  try {
    const parsed = parseCatalog(normalized); let options = [...parsed.values];
    if (options.length > 1 && options[0] === options.slice(1).reduce((sum, value) => sum + value, 0)) options = options.slice(1);
    return { options: [...new Set(options.filter((value) => value > 0))], special: '', ambiguous: options.length > 1 };
  } catch { return { options: [], special: '', ambiguous: true }; }
}

function bestDimensionCombination(entries, targetIn) {
  let states = [{ total: 0, formula: [], ambiguous: false }];
  entries.forEach((entry) => {
    const info = catalogLengthOptions(entry.catalog); const options = info.options.length ? info.options : [0];
    const next = [];
    states.forEach((state) => options.forEach((length) => next.push({ total: state.total + length * entry.qty, formula: [...state.formula, `${entry.item} ${length}${entry.qty > 1 ? `×${entry.qty}` : ''}${info.special ? ` (${info.special})` : ''}`], ambiguous: state.ambiguous || info.ambiguous || !info.options.length })));
    states = next.sort((a, b) => Math.abs(a.total - targetIn) - Math.abs(b.total - targetIn)).slice(0, 500);
  });
  return states.sort((a, b) => Math.abs(a.total - targetIn) - Math.abs(b.total - targetIn))[0];
}

function collectExplodedDimensions(database) {
  const dimEntities = database.entities.filter((entity) => (entity.layer || entity.layerName) === 'DIMS' && (entity.type === 'LINE' || entity.type === 'TEXT' || entity.type === 'MTEXT'));
  const dimensions = []; let lines = [];
  dimEntities.forEach((entity) => {
    if (entity.type === 'LINE') { lines.push(entity); if (lines.length > 20) lines = lines.slice(-20); return; }
    const raw = entity.type === 'TEXT' ? entity.text : entity.text; const text = plainText(raw);
    if (!/^\d+(?:\.\d+)?$/.test(text) || lines.length < 10) return;
    const group = lines.slice(-10); const firstDimensionLine = group[8]; const secondDimensionLine = group[9];
    const p1 = firstDimensionLine?.startPoint; const p2 = secondDimensionLine?.startPoint;
    if (p1 && p2 && [p1.x, p1.y, p2.x, p2.y].every(Number.isFinite)) dimensions.push({ type: 'DIMENSION', subclassMarker: 'ExplodedDimension', subDefinitionPoint1: p1, subDefinitionPoint2: p2, measurement: Number(text), text, textPoint: entity.startPoint || entity.insertionPoint, exploded: true });
    lines = [];
  });
  return dimensions;
}

function materialLegs(catalog) {
  const normalized = cleanAlnum(catalog); const square = normalized.match(/G(?:LEM|LFM)(\d+)/);
  if (square) return [Number(square[1]), Number(square[1])];
  try { const parsed = parseCatalog(normalized); const values = [...parsed.values]; return values.length > 1 && values[0] === values.slice(1).reduce((sum, value) => sum + value, 0) ? values.slice(1) : values; }
  catch { return []; }
}

function auditFromTokens(dimension, tokens, tokenIds, manual = false) {
  const assigned = tokenIds.map((id) => tokens.find((token) => token.id === id)).filter(Boolean);
  const calculatedIn = assigned.reduce((sum, token) => sum + token.length, 0); const calculatedMm = calculatedIn * 25.4; const difference = calculatedMm - dimension.shownValue;
  const verticalItems = new Set(['A', 'B', 'D', 'F', 'R', 'O', 'Q', 'P', 'L']); const vertical = assigned.length > 0 && assigned.every((token) => verticalItems.has(token.item));
  const withinRound = Math.abs(difference) <= 1; const withinTolerance = Math.abs(difference) <= 10; let status; let level;
  if (!assigned.length) { status = '尚未分配材料'; level = 'review'; }
  else if (vertical) { status = withinTolerance ? '直立 ITEM：低信心一致' : '直立 ITEM：低信心差異'; level = 'review'; }
  else if (withinRound) { status = manual ? '手動分配一致' : '全料排除後一致'; level = 'ok'; }
  else if (withinTolerance) { status = manual ? '手動分配：±10 mm 內' : '全料排除：±10 mm 內'; level = 'tolerance'; }
  else { status = manual ? '手動分配有差異' : '全料排除仍有差異'; level = 'bad'; }
  return { ...dimension, calculatedMm, difference, formula: assigned.map((token) => token.label).join(' + ') || '—', status, level, vertical, tokenIds, manual };
}

function tokenDistancePenalty(token, dimension) {
  const dx = dimension.p2.x - dimension.p1.x; const dy = dimension.p2.y - dimension.p1.y; const span = Math.hypot(dx, dy) || 1; const ux = dx / span; const uy = dy / span;
  const bx = token.x - dimension.p1.x; const by = token.y - dimension.p1.y; const along = bx * ux + by * uy; const perpendicular = Math.abs(bx * uy - by * ux);
  const outside = along < 0 ? -along : along > span ? along - span : 0;
  return perpendicular / span + outside / span * 3;
}

function dimensionCandidates(tokens, dimension) {
  const target = Math.max(0, Math.round(dimension.shownValue / 25.4)); const maxSum = target + 10; const perSum = 70;
  let states = new Map([[0, [{ mask: 0n, ids: [], geometry: 0 }]]]);
  tokens.forEach((token, index) => {
    const bit = 1n << BigInt(index); const penalty = tokenDistancePenalty(token, dimension); const snapshot = [...states.entries()];
    snapshot.forEach(([sum, list]) => { const nextSum = sum + token.length; if (nextSum > maxSum) return; const bucket = states.get(nextSum) || [];
      list.forEach((state) => bucket.push({ mask: state.mask | bit, ids: [...state.ids, token.id], geometry: state.geometry + penalty }));
      bucket.sort((a, b) => a.geometry - b.geometry); states.set(nextSum, bucket.slice(0, perSum));
    });
  });
  const candidates = [];
  states.forEach((list, sum) => { if (Math.abs(sum - target) > 10) return; list.forEach((state) => candidates.push({ ...state, sum, cost: Math.abs(sum - target) * 40 + state.geometry })); });
  return candidates.sort((a, b) => a.cost - b.cost).slice(0, 140);
}

function solveDimensionAssignments(tokens, dimensions) {
  const prepared = dimensions.map((dimension, index) => ({ index, dimension, candidates: dimensionCandidates(tokens, dimension) })).sort((a, b) => a.candidates.length - b.candidates.length);
  let states = [{ mask: 0n, cost: 0, assignments: new Map() }];
  prepared.forEach(({ index, candidates }) => {
    const next = [];
    states.forEach((state) => candidates.forEach((candidate) => { if ((state.mask & candidate.mask) !== 0n) return; const assignments = new Map(state.assignments); assignments.set(index, candidate.ids); next.push({ mask: state.mask | candidate.mask, cost: state.cost + candidate.cost, assignments }); }));
    if (!next.length) return;
    const bestByMask = new Map(); next.forEach((state) => { const key = state.mask.toString(); if (!bestByMask.has(key) || state.cost < bestByMask.get(key).cost) bestByMask.set(key, state); });
    states = [...bestByMask.values()].sort((a, b) => a.cost - b.cost).slice(0, 5000);
  });
  const fullMask = tokens.length ? (1n << BigInt(tokens.length)) - 1n : 0n;
  states.sort((a, b) => { const unusedA = (fullMask ^ (fullMask & a.mask)).toString(2).replace(/0/g, '').length; const unusedB = (fullMask ^ (fullMask & b.mask)).toString(2).replace(/0/g, '').length; return unusedA - unusedB || a.cost - b.cost; });
  return states[0]?.assignments || new Map();
}

function collectDimensionAudits(database, tableMeta, crossBoxes) {
  const nativeDimensions = database.entities.filter((entity) => entity.type === 'DIMENSION' && entity.subclassMarker === 'AcDbAlignedDimension' && entity.subDefinitionPoint1 && entity.subDefinitionPoint2 && Number.isFinite(entity.measurement) && entity.measurement > 0);
  const rawDimensions = [...nativeDimensions, ...collectExplodedDimensions(database)]; const grouped = tableMeta.map(() => []);
  rawDimensions.forEach((entity) => {
    const p1 = entity.subDefinitionPoint1; const p2 = entity.subDefinitionPoint2; if (![p1.x,p1.y,p2.x,p2.y].every(Number.isFinite)) return;
    const midX=(p1.x+p2.x)/2,midY=(p1.y+p2.y)/2;if(crossBoxes.some((box)=>midX>=box.minX&&midX<=box.maxX&&midY>=box.minY&&midY<=box.maxY))return;
    const choice=tableMeta.map((meta,index)=>({index,distance:Math.hypot(midX-meta.center.x,midY-meta.center.y)/Math.max(meta.table.header.span,1)})).sort((a,b)=>a.distance-b.distance)[0];if(!choice||choice.distance>35)return;
    const shownValue=/^\s*\d+(?:\.\d+)?\s*$/.test(String(entity.text||''))?Number(entity.text):Number(entity.measurement); grouped[choice.index].push({shownValue,p1,p2,exploded:Boolean(entity.exploded)});
  });
  return tableMeta.map((meta,tableIndex)=>{
    const rowMap=new Map(meta.table.rows.map((row)=>[row.item,row]));const tokens=[];
    meta.balloons.forEach((balloon,balloonIndex)=>{const row=rowMap.get(balloon.parsed.item);if(!row)return;const legs=materialLegs(row.catalog);for(let copy=0;copy<balloon.parsed.qty;copy+=1)legs.forEach((length,legIndex)=>tokens.push({id:`${balloonIndex}-${copy}-${legIndex}`,item:balloon.parsed.item,length,label:`${balloon.parsed.item} ${length}`,x:balloon.x,y:balloon.y,catalog:row.catalog}));});
    const dimensions=grouped[tableIndex].sort((a,b)=>a.shownValue-b.shownValue);const assignments=solveDimensionAssignments(tokens,dimensions);const audits=dimensions.map((dimension,index)=>auditFromTokens(dimension,tokens,assignments.get(index)||[]));
    return {audits,tokens};
  });
}

function collectSegments(database) {
  const segments = [];
  const add = (a, b) => {
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return;
    const dx = b.x - a.x; const dy = b.y - a.y; const length = Math.hypot(dx, dy);
    if (length > 0) segments.push({ a, b, dx, dy, length, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) });
  };
  database.entities.forEach((entity) => {
    if (entity.type === 'LINE') add(entity.startPoint, entity.endPoint);
    if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE2D' || entity.type === 'POLYLINE3D') && Array.isArray(entity.vertices)) {
      for (let index = 1; index < entity.vertices.length; index += 1) add(entity.vertices[index - 1], entity.vertices[index]);
      if (entity.closed && entity.vertices.length > 2) add(entity.vertices.at(-1), entity.vertices[0]);
    }
  });
  return segments;
}

function isInsideCross(table, segments) {
  const points = [table.header.item, table.header.qty, table.header.catalog, ...table.sourceRows.flatMap((row) => [row.itemCell, row.qtyCell, row.catalogCell])];
  const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y));
  const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
  const tableSize = Math.max(maxX - minX, maxY - minY, 1);
  const diagonals = segments.filter((line) => Math.abs(line.dx) > tableSize * .6 && Math.abs(line.dy) > tableSize * .35 && line.length > tableSize * 1.2 && centerX >= line.minX && centerX <= line.maxX && centerY >= line.minY && centerY <= line.maxY);
  for (let first = 0; first < diagonals.length; first += 1) for (let second = first + 1; second < diagonals.length; second += 1) {
    const a = diagonals[first]; const b = diagonals[second];
    if (Math.sign(a.dx * a.dy) === Math.sign(b.dx * b.dy)) continue;
    const width = Math.max(a.maxX, b.maxX) - Math.min(a.minX, b.minX); const height = Math.max(a.maxY, b.maxY) - Math.min(a.minY, b.minY);
    const tolerance = Math.max(width, height) * .08;
    const sameBounds = Math.abs(a.minX - b.minX) <= tolerance && Math.abs(a.maxX - b.maxX) <= tolerance && Math.abs(a.minY - b.minY) <= tolerance && Math.abs(a.maxY - b.maxY) <= tolerance;
    if (sameBounds) return true;
  }
  return false;
}

function extractTables(database) {
  const texts = collectTexts(database);
  const headers = [];
  for (const item of texts.filter((cell) => cell.text.toUpperCase() === 'ITEM')) {
    const qty = texts.filter((cell) => cell.text.toUpperCase() === 'QTY' && Math.abs(cell.y - item.y) <= 1 && cell.x > item.x).sort((a, b) => a.x - b.x)[0];
    if (!qty) continue;
    const catalog = texts.filter((cell) => cell.text.toUpperCase().replace(/\s+/g, ' ') === 'CATALOG NUMBER' && Math.abs(cell.y - item.y) <= 1 && cell.x > qty.x).sort((a, b) => a.x - b.x)[0];
    if (catalog) headers.push({ item, qty, catalog, span: Math.max(catalog.x - item.x, 1), sourceRows: [] });
  }
  if (!headers.length) throw new Error('找不到 ITEM、QTY、CATALOG NUMBER 表頭');
  const catalogCells = texts.filter((cell) => /^[A-Za-z0-9][A-Za-z0-9._+/#-]{4,}$/.test(cell.text));
  for (const catalogCell of catalogCells) {
    const choices = [];
    headers.forEach((header, headerIndex) => {
      if (catalogCell.y >= header.item.y - 1 || Math.abs(catalogCell.x - header.catalog.x) > header.span * 1.6 || header.item.y - catalogCell.y > header.span * 14) return;
      const itemQtyBoundary = (header.item.x + header.qty.x) / 2; const qtyCatalogBoundary = (header.qty.x + header.catalog.x) / 2;
      const sameRow = texts.filter((cell) => Math.abs(cell.y - catalogCell.y) <= 1);
      const qtyCell = sameRow.filter((cell) => cell.x >= itemQtyBoundary && cell.x < qtyCatalogBoundary && /^\d+$/.test(cell.text)).sort((a, b) => Math.abs(a.x - header.qty.x) - Math.abs(b.x - header.qty.x))[0];
      const itemCell = sameRow.filter((cell) => cell.x < itemQtyBoundary && cell.x > header.item.x - header.span && /^[A-Za-z]+$/.test(cell.text)).sort((a, b) => Math.abs(a.x - header.item.x) - Math.abs(b.x - header.item.x))[0];
      if (!itemCell || !qtyCell) return;
      const score = Math.abs(catalogCell.x - header.catalog.x) / header.span * 5 + (header.item.y - catalogCell.y) / header.span;
      choices.push({ headerIndex, score, itemCell, qtyCell });
    });
    choices.sort((a, b) => a.score - b.score);
    if (choices.length) { const match = choices[0]; headers[match.headerIndex].sourceRows.push({ itemCell: match.itemCell, qtyCell: match.qtyCell, catalogCell }); }
  }
  const segments = collectSegments(database);
  const tables = headers.filter((header) => header.sourceRows.length).map((header) => {
    header.sourceRows.sort((a, b) => b.catalogCell.y - a.catalogCell.y);
    const rows = header.sourceRows.map(({ itemCell, qtyCell, catalogCell }) => ({ item: itemCell.text.toUpperCase(), qty: Number(qtyCell.text), catalog: catalogCell.text, y: catalogCell.y, modifiedFields: [] }));
    return { header, sourceRows: header.sourceRows, rows };
  });
  if (!tables.length) throw new Error('找到表頭，但沒有有效資料列');
  const marked = tables.map((table) => ({ ...table, crossed: isInsideCross(table, segments) }));
  const valid = marked.filter((table) => !table.crossed);
  if (!valid.length) throw new Error(`找到 ${marked.length} 個表格，但全部位於打叉圖框內`);
  const crossBoxes = collectCrossBoxes(segments);
  const tableMeta = valid.map((table) => ({ table, center: tableCenter(table), items: new Set(table.rows.map((row) => row.item)), counts: {}, unreadable: [], balloons: [] }));
  const balloons = collectBalloons(database, texts).filter((balloon) => !crossBoxes.some((box) => balloon.x >= box.minX && balloon.x <= box.maxX && balloon.y >= box.minY && balloon.y <= box.maxY));
  balloons.forEach((balloon) => {
    let choices = tableMeta;
    if (balloon.parsed) { const matching = tableMeta.filter((meta) => meta.items.has(balloon.parsed.item)); if (matching.length) choices = matching; }
    const selected = choices.map((meta) => ({ meta, distance: Math.hypot(balloon.x - meta.center.x, balloon.y - meta.center.y) / Math.max(meta.table.header.span, 1) })).sort((a, b) => a.distance - b.distance)[0];
    if (!selected || selected.distance > 30) return;
    if (!balloon.parsed) selected.meta.unreadable.push(balloon.raw || '(空白)');
    else { selected.meta.counts[balloon.parsed.item] = (selected.meta.counts[balloon.parsed.item] || 0) + balloon.parsed.qty; selected.meta.balloons.push(balloon); }
  });
  const dimensionResults = collectDimensionAudits(database, tableMeta, crossBoxes);
  const auditedTables = tableMeta.map(({ table, counts, unreadable }, index) => ({ ...table, audit: { counts, unreadable, dimensionAudits: dimensionResults[index].audits, materialTokens: dimensionResults[index].tokens, balloonCount: Object.values(counts).reduce((sum, qty) => sum + qty, 0) } }));
  return { tables: auditedTables, excludedCount: marked.length - valid.length, detectedCount: marked.length };
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
  jobs.forEach((job) => { const key = (job.displayName || job.file.name).toLocaleLowerCase(); nameCounts.set(key, (nameCounts.get(key) || 0) + 1); });
  ui.fileTabs.innerHTML = jobs.map((job, index) => {
    const duplicateName = nameCounts.get((job.displayName || job.file.name).toLocaleLowerCase()) > 1;
    return `<div class="file-tab ${index === activeIndex ? 'active' : ''} ${job.status} ${duplicateName ? 'duplicate-name' : ''}" data-tab="${index}" role="tab" title="${duplicateName ? '檔名重複：' : ''}${escapeHtml(job.file.name)}"><i>${job.status === 'done' ? '✓' : job.status === 'error' ? '!' : '•'}</i><span>${escapeHtml(job.displayName || baseName(job.file.name))}</span><button type="button" class="remove-tab" data-remove="${index}" title="移除此檔案" aria-label="移除 ${escapeHtml(job.file.name)}">×</button></div>`;
  }).join('');
}

function renderDimensionAudit(job) {
  if (!job || job.status !== 'done') {
    ui.dimensionSummary.textContent = job ? '等待 DWG 解析完成' : '請先加入 DWG';
    ui.dimensionView.innerHTML = '<div class="dimension-empty-state">上傳 DWG 後顯示圖面尺寸、理論尺寸、差異與計算式</div>';
    return;
  }
  const audits = job.dimensionAudits || [];
  ui.dimensionSummary.textContent = audits.length ? `${audits.length} 個尺寸｜${job.displayName || job.file.name}` : `未找到尺寸｜${job.displayName || job.file.name}`;
  const rows = audits.map((audit, index) => `<tr><td>D${index + 1}</td><td>${fmt(audit.shownValue)} mm</td><td>${audit.difference == null ? '—' : `${fmt(audit.calculatedMm)} mm`}</td><td>${audit.difference == null ? '—' : `${audit.difference >= 0 ? '+' : ''}${fmt(audit.difference)} mm`}</td><td class="dimension-status dimension-${audit.level}">${escapeHtml(audit.status)}</td><td class="dimension-formula">${escapeHtml(audit.formula)}</td><td><button type="button" class="dimension-edit-button" data-dimension-edit="${index}">${job.manualDimensionIndex === index ? '收合' : '調整材料'}</button></td></tr>`).join('');
  const usedBy = new Map(); audits.forEach((audit, auditIndex) => audit.tokenIds.forEach((id) => usedBy.set(id, auditIndex)));
  const unassigned = (job.materialTokens || []).filter((token) => !usedBy.has(token.id));
  const editorIndex = job.manualDimensionIndex; const editorAudit = Number.isInteger(editorIndex) ? audits[editorIndex] : null;
  const editor = editorAudit ? `<div class="dimension-editor"><strong>調整 D${editorIndex + 1} 使用的材料</strong><p>勾選材料會自動從其他 Dimension 移除，確保每一段只使用一次。</p><div class="token-grid">${(job.materialTokens || []).map((token) => { const owner = usedBy.get(token.id); return `<label class="${owner != null && owner !== editorIndex ? 'used-elsewhere' : ''}"><input type="checkbox" data-dimension-token="${escapeHtml(token.id)}" data-dimension-index="${editorIndex}" ${editorAudit.tokenIds.includes(token.id) ? 'checked' : ''}/><span>${escapeHtml(token.label)}</span><small>${owner == null ? '未使用' : `D${owner + 1}`}</small></label>`; }).join('')}</div></div>` : '';
  const unusedNotice = unassigned.length ? `<div class="unused-materials">⚠ 尚未使用：${escapeHtml(unassigned.map((token) => token.label).join('、'))}</div>` : '<div class="all-materials-used">✓ 每一段材料都已使用</div>';
  ui.dimensionView.innerHTML = rows ? `<table><thead><tr><th>#</th><th>圖面尺寸</th><th>理論尺寸</th><th>差異</th><th>結果</th><th>計算式（in）</th><th>手動</th></tr></thead><tbody>${rows}</tbody></table>${unusedNotice}${editor}` : '<div class="dimension-empty-state">未找到可驗算的原生或 DIMS 圖層炸開尺寸。</div>';
}

function renderData() {
  const job = currentJob(); renderDimensionAudit(job);
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
    const drawingQty = Number(job.drawingCounts?.[row.item] || 0); const difference = drawingQty - row.qty;
    const auditText = difference === 0 ? '✓ 一致' : difference > 0 ? `多 ${difference}` : `少 ${Math.abs(difference)}`;
    return `<tr class="${row.crossItemDuplicate || row.error ? 'warning-row' : ''}"><td>${cell('item', row.item)}</td><td>${cell('qty', row.qty, 'number')}</td><td>${drawingQty}</td><td class="audit-result ${difference === 0 ? 'audit-ok' : 'audit-bad'}">${auditText}</td><td>${cell('catalog', row.catalog)}</td><td>${row.error ? 'ERROR' : row.values.join(', ')}</td><td class="row-status">${icons}</td></tr>`;
  }).join('');
  const catalogGroups = new Map();
  job.rows.forEach((row) => {
    const key = cleanAlnum(row.catalog); if (!catalogGroups.has(key)) catalogGroups.set(key, []); catalogGroups.get(key).push(row);
  });
  const duplicates = [...catalogGroups.values()].filter((group) => group.length > 1);
  const duplicateNotice = duplicates.length ? `<div class="duplicate-summary"><strong>⚠ 發現相同 CATALOG NUMBER</strong><ul>${duplicates.map((group) => `<li><code>${escapeHtml(group[0].catalog)}</code><span>${group.length} 筆｜ITEM ${escapeHtml([...new Set(group.map((row) => row.item))].join(', '))}</span></li>`).join('')}</ul></div>` : '';
  const tableItems = new Set(job.rows.map((row) => row.item));
  const extraItems = Object.entries(job.drawingCounts || {}).filter(([item]) => !tableItems.has(item));
  const auditIssues = [
    ...extraItems.map(([item, qty]) => `圖面有 ITEM ${item} × ${qty}，Table 中沒有`),
    ...(job.unreadableBalloons || []).map((label) => `無法辨識圓圈文字：${label}`),
  ];
  const auditNotice = auditIssues.length ? `<div class="audit-summary"><strong>⚠ 圖面數量驗算提示</strong><ul>${auditIssues.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul></div>` : '';
  ui.dataView.innerHTML = `<table><thead><tr><th>ITEM</th><th>TABLE QTY</th><th>圖面數量</th><th>驗算</th><th>CATALOG NUMBER</th><th>解析長度</th><th></th></tr></thead><tbody>${rows}</tbody></table>${auditNotice}${duplicateNotice}`;
}

function renderChecks() {
  const job = currentJob();
  ui.activeFileLabel.textContent = job ? `${job.displayName || job.file.name}${job.excludedCount ? `｜已排除 ${job.excludedCount} 個打叉表格` : ''}` : '請先加入 DWG';
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
      const result = extractTables(engine.convert(pointer));
      const sourceIndex = jobs.indexOf(job); const stem = baseName(job.file.name);
      const parts = result.tables.map((table, index) => {
        const suffix = result.tables.length > 1 ? `_${String(index + 1).padStart(2, '0')}` : '';
        const rawRows = table.rows;
        return { file: job.file, status: 'done', rawRows, originalRows: cloneRawRows(rawRows), editHistory: [], rows: prepareRows(rawRows), editing: false, displayName: `${stem}${suffix}`, outputName: `${stem}${suffix}.csv`, excludedCount: index === 0 ? result.excludedCount : 0, detectedCount: result.detectedCount, drawingCounts: table.audit?.counts || {}, unreadableBalloons: table.audit?.unreadable || [], dimensionAudits: table.audit?.dimensionAudits || [], materialTokens: table.audit?.materialTokens || [], manualDimensionIndex: null };
      });
      if (sourceIndex >= 0) { jobs.splice(sourceIndex, 1, ...parts); if (activeIndex === sourceIndex) activeIndex = sourceIndex; }
      render(); return;
    } catch (error) {
      console.error(error); lastError = error; const message = error instanceof Error ? error.message : String(error);
      const retryable = /null|memory|out of bounds|function signature|abort/i.test(message);
      if (!retryable || attempt === 1) break;
      enginePromise = undefined; await new Promise((resolve) => setTimeout(resolve, 0));
    } finally { if (pointer && engine) { try { engine.dwg_free(pointer); } catch (freeError) { console.warn(freeError); } } }
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
ui.dimensionView.addEventListener('click', (event) => {
  const button = event.target.closest('[data-dimension-edit]'); if (!button) return; const job = currentJob(); const index = Number(button.dataset.dimensionEdit);
  job.manualDimensionIndex = job.manualDimensionIndex === index ? null : index; renderDimensionAudit(job);
});
ui.dimensionView.addEventListener('change', (event) => {
  const input = event.target.closest('[data-dimension-token]'); if (!input) return; const job = currentJob(); const index = Number(input.dataset.dimensionIndex); const tokenId = input.dataset.dimensionToken;
  job.dimensionAudits.forEach((audit, auditIndex) => { if (auditIndex !== index) audit.tokenIds = audit.tokenIds.filter((id) => id !== tokenId); });
  const ids = new Set(job.dimensionAudits[index].tokenIds); if (input.checked) ids.add(tokenId); else ids.delete(tokenId);
  job.dimensionAudits = job.dimensionAudits.map((audit, auditIndex) => auditFromTokens(audit, job.materialTokens, auditIndex === index ? [...ids] : audit.tokenIds, true)); renderDimensionAudit(job);
});
ui.dimensionView.addEventListener('wheel', (event) => {
  const hasHorizontalOverflow = ui.dimensionView.scrollWidth > ui.dimensionView.clientWidth + 1;
  if (!hasHorizontalOverflow || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const before = ui.dimensionView.scrollLeft; ui.dimensionView.scrollLeft += event.deltaY;
  if (ui.dimensionView.scrollLeft !== before) event.preventDefault();
}, { passive: false });
ui.fileTabs.addEventListener('wheel', (event) => {
  const hasHorizontalOverflow = ui.fileTabs.scrollWidth > ui.fileTabs.clientWidth + 1;
  if (!hasHorizontalOverflow || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const before = ui.fileTabs.scrollLeft;
  ui.fileTabs.scrollLeft += event.deltaY;
  if (ui.fileTabs.scrollLeft !== before) event.preventDefault();
}, { passive: false });
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
ui.csvButton.addEventListener('click', () => { const job = currentJob(); if (job?.status === 'done') downloadBlob(new Blob([makeCsv(job)], { type: 'text/csv;charset=utf-8' }), (job.outputName || `${baseName(job.file.name)}.csv`)); });
ui.zipButton.addEventListener('click', async () => { const zip = new JSZip(); jobs.filter((job) => job.status === 'done').forEach((job) => zip.file(job.outputName || `${baseName(job.file.name)}.csv`, makeCsv(job))); ui.zipButton.disabled = true; ui.zipButton.textContent = '打包中…'; downloadBlob(await zip.generateAsync({ type: 'blob' }), `dwg-csv-${new Date().toISOString().slice(0, 10)}.zip`); ui.zipButton.textContent = '全部 ZIP'; ui.zipButton.disabled = false; });
ui.includeHeader.addEventListener('change', renderData);

render(); getEngine();
