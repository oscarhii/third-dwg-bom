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
  workspaceTabs: [...document.querySelectorAll('[data-workspace-tab]')], dashboard: document.querySelector('.dashboard'),
};

const jobs = [];
let activeIndex = 0;
let enginePromise;
let processingPromise = Promise.resolve();

function installHelpDialog() {
  const brand = document.querySelector('.topbar .brand'); if (!brand || document.querySelector('#helpButton')) return;
  const button = document.createElement('button'); button.id = 'helpButton'; button.type = 'button'; button.className = 'help-button'; button.textContent = '\uff1f \u4f7f\u7528\u8aaa\u660e'; brand.appendChild(button);
  const dialog = document.createElement('dialog'); dialog.id = 'helpDialog'; dialog.className = 'help-dialog';
  dialog.innerHTML = `<div class="help-head"><div><small>BFC DWG BOM</small><h2>\u5b8c\u6574\u4f7f\u7528\u8aaa\u660e</h2></div><button type="button" data-help-close aria-label="\u95dc\u9589">\u00d7</button></div><div class="help-content"><section><h3>1. \u4e0a\u50b3\u8207\u8cc7\u6599\u6aa2\u8996</h3><ol><li>\u5c07\u4e00\u500b\u6216\u591a\u500b DWG \u62d6\u9032\u4e0a\u50b3\u5340\uff0c\u6216\u9ede\u64ca\u9078\u64c7\u6a94\u6848\u3002</li><li>\u6bcf\u500b DWG/\u8868\u683c\u6703\u5efa\u7acb\u7368\u7acb\u5206\u9801\uff1b\u9ec3\u8272\u5206\u9801\u8868\u793a\u6a94\u540d\u91cd\u8907\u3002</li><li>\u8cc7\u6599\u6aa2\u8996\u53ef\u624b\u52d5\u7de8\u8f2f\u3001Undo \u8207 Reset\uff0c\u4e26\u53ef\u4e0b\u8f09 CSV \u6216\u5168\u90e8 ZIP\u3002</li></ol></section><section><h3>2. Dimension \u9577\u5ea6\u9a57\u7b97</h3><p>\u7cfb\u7d71\u8b80\u53d6\u539f\u751f Dimension\uff0c\u4e5f\u5617\u8a66\u5f9e DIMS \u5716\u5c64\u7684\u6578\u5b57 TEXT \u9084\u539f Explode \u5f8c\u7684\u5c3a\u5bf8\u3002\u518d\u5c07 Catalog Number \u89e3\u6790\u6210\u82f1\u540b\u6750\u6599\u6bb5\uff0c\u4ee5 25.4 \u8f49\u63db\u70ba mm\uff0c\u641c\u5c0b\u53ef\u80fd\u7d44\u5408\u4e26\u986f\u793a\u7406\u8ad6\u503c\u3001\u5dee\u7570\u8207\u8a08\u7b97\u5f0f\u3002</p><ul><li>LEM/LFM \u4f9d\u96d9\u65b9\u5411\u908f\u8f2f\u7522\u751f\u5169\u6bb5\u76f8\u540c\u9577\u5ea6\u3002</li><li>\u591a\u6bb5\u5f4e\u6298\u4ef6\u6703\u62c6\u6210 2\u20133 \u500b\u53ef\u5206\u914d\u6750\u6599\u6bb5\u3002\u9019\u4e9b\u6750\u6599\u6bb5\u4ecd\u4fdd\u7559\u540c\u4e00 component \u8eab\u5206\uff1b\u82e5\u67d0\u8173\u51fa\u73fe\u5728\u7576\u524d Dimension \u7684\u7d50\u5c3e\uff0c\u5176\u9918\u8173\u6703\u512a\u5148\u5206\u914d\u5230\u6cbf A \u8d77\u9ede\u65b9\u5411\u7684\u4e0b\u4e00\u500b Dimension\u3002 Dimension \u6e05\u55ae\u4e5f\u4f7f\u7528\u540c\u4e00\u500b component \u505a\u63a5\u529b\u6392\u5e8f\uff1a\u4f8b\u5982\u7b2c\u4e00\u5217\u7d50\u5c3e\u542b F \u7684\u4e00\u689d\u8173\uff0c\u5c31\u5148\u5c0b\u627e\u542b F \u53e6\u4e00\u689d\u8173\u7684 Dimension \u4f5c\u70ba\u4e0b\u4e00\u5217\uff1b\u627e\u4e0d\u5230\u53ef\u63a5\u529b\u7684\u5143\u4ef6\u6642\u624d\u56de\u5230 A \u8ddd\u96e2\u6392\u5e8f\u3002</li><li>\u512a\u5148\u8b93\u6bcf\u6bb5\u6750\u6599\u53ea\u88ab\u4f7f\u7528\u4e00\u6b21\uff0c\u4e26\u4ee5\u5168\u5716\u6392\u9664\u6cd5\u5c0b\u627e\u7d44\u5408\u3002</li><li>\u82e5\u5716\u9762\u6709 ITEM A\uff0c\u4ee5 A \u7684 leader \u6307\u5411\u7aef\u70ba\u8fd1\u4f3c\u8def\u5f91\u8d77\u9ede\uff0c\u6bd4\u8f03\u6750\u6599\u8207 Dimension \u5f9e A \u5f80\u5916\u7684\u76f8\u5c0d\u8ddd\u96e2\u3002</li><li>\u5c3a\u5bf8\u7dda\u6709\u660e\u986f\u6c34\u5e73/\u659c\u5411\u5206\u91cf\u6642\u5217\u70ba\u5e73\u9762\u6bb5\uff0c\u914d\u5c0d\u8aa4\u5dee\u6b0a\u91cd\u9ad8\u65bc\u63a5\u8fd1\u5782\u76f4\u7684\u76f4\u7acb\u6bb5\u3002\u56e0\u6b64\u5fc5\u8981\u6642\u6703\u4fdd\u7559\u5e73\u9762\u6bb5\u7684\u6b63\u78ba\u7387\uff0c\u5c07\u8f03\u5927\u4e0d\u78ba\u5b9a\u6027\u7559\u7d66\u5169\u7aef\u76f4\u7acb\u6bb5\u3002</li></ul><div class="help-detail"><h4>\u7d44\u5408\u63a8\u6f14\u7684\u5b8c\u6574\u6d41\u7a0b</h4><ol><li><strong>Catalog \u62c6\u89e3\uff1a</strong>\u5148\u5f9e\u6bcf\u500b ITEM \u7684 Catalog Number \u53d6\u51fa\u9577\u5ea6\u3002\u55ae\u6bb5\u76f4\u4ef6\u7522\u751f 1 \u500b\u9577\u5ea6 token\uff1b\u5f4e\u6298\u4ef6\u4f9d Catalog \u62c6\u6210 2 \u6216 3 \u6bb5\uff1bLEM/LFM \u985e\u578b\u5247\u7522\u751f\u5169\u500b\u76f8\u540c\u65b9\u5411\u8173\u3002QTY \u5927\u65bc 1 \u6642\uff0c\u6bcf\u4ef6\u90fd\u5efa\u7acb\u7368\u7acb token\uff0c\u4e0d\u6703\u5171\u7528\u3002</li><li><strong>\u5c3a\u5bf8\u6a19\u6e96\u5316\uff1a</strong>\u5716\u9762 Dimension \u4ee5 mm \u8868\u793a\uff0cCatalog \u9577\u5ea6\u4ee5 inch \u8868\u793a\u3002\u7cfb\u7d71\u4ee5 <code>inch \u00d7 25.4</code> \u8f49\u70ba\u7406\u8ad6 mm\uff0c\u540c\u6642\u4fdd\u7559\u5c0f\u6578\u5dee\u7570\uff0c\u4e0d\u53ea\u6bd4\u5c0d\u56db\u6368\u4e94\u5165\u5f8c\u7684\u6574\u6578\u3002</li><li><strong>\u5019\u9078\u7d44\u5408\uff1a</strong>\u5c0d\u6bcf\u4e00\u500b Dimension\uff0c\u8a08\u7b97\u55ae\u6bb5\u6216\u591a\u6bb5 token \u52a0\u7e3d\u7684\u53ef\u80fd\u7d44\u5408\u3002\u4f8b\u5982 <code>40 in \u00d7 25.4 = 1016 mm</code> \u53ef\u76f4\u63a5\u5c0d\u61c9\u55ae\u6bb5 40\uff1b<code>21 + 42 = 63 in</code> \u5247\u662f <code>1600.2 mm</code>\uff0c\u53ef\u5c0d\u61c9\u7d04 1600 mm \u7684\u5716\u9762\u5c3a\u5bf8\u3002</li><li><strong>\u5168\u5716\u5206\u914d\uff1a</strong>\u4e0d\u662f\u6bcf\u4e00\u5217\u5404\u81ea\u53d6\u6700\u63a5\u8fd1\u503c\uff0c\u800c\u662f\u540c\u6642\u6bd4\u8f03\u6240\u6709 Dimension\uff0c\u4ee5\u300c\u6bcf\u500b token \u53ea\u7528\u4e00\u6b21\u300d\u70ba\u9650\u5236\u5c0b\u627e\u6574\u9ad4\u5dee\u7570\u6700\u5c0f\u7684\u5206\u914d\u3002\u9019\u53ef\u907f\u514d\u540c\u4e00\u652f\u6750\u6599\u88ab\u5169\u500b\u5c3a\u5bf8\u91cd\u8907\u4f7f\u7528\u3002</li><li><strong>\u6392\u9664\u6cd5\uff1a</strong>\u7576\u67d0\u4e9b\u5c3a\u5bf8\u5df2\u6709\u660e\u78ba\u7d44\u5408\uff0c\u9019\u4e9b token \u6703\u5f9e\u5269\u9918\u5019\u9078\u79fb\u9664\u3002\u4f8b\u5982\u67d0\u652f 60 in \u5df2\u5c0d\u61c9\u5176\u4ed6 Dimension\uff0c\u5f8c\u7e8c\u5c3a\u5bf8\u5c31\u53ea\u80fd\u7528\u5269\u4e0b\u7684 11 + 25\u300140 + 21 \u7b49\u7d44\u5408\u3002\u6240\u6709 Dimension \u8655\u7406\u5f8c\u4ecd\u672a\u5206\u914d\u7684 token \u6703\u5217\u5728\u300c\u5c1a\u672a\u4f7f\u7528\u300d\u3002</li><li><strong>\u5e7e\u4f55\u8f14\u52a9\uff1a</strong>\u82e5 Dimension \u7684\u7dda\u8207\u7aef\u9ede\u5b8c\u6574\uff0c\u6703\u5c07\u6750\u6599\u6a19\u8a18\u4f4d\u7f6e\u8207\u5c3a\u5bf8\u65b9\u5411\u7d0d\u5165\u6392\u5e8f\u3002Explode \u5f8c\u5e7e\u4f55\u4e0d\u5b8c\u6574\u6642\u6703\u964d\u70ba\u4f4e\u4fe1\u5fc3\uff0c\u4ee5\u9577\u5ea6\u8207\u5168\u5716\u6392\u9664\u70ba\u4e3b\uff0c\u907f\u514d\u7528\u932f\u8aa4\u4f4d\u7f6e\u5f37\u5236\u914d\u5c0d\u3002</li><li><strong>\u4eba\u5de5\u78ba\u8a8d\uff1a</strong>\u82e5\u81ea\u52d5\u7d44\u5408\u4e0d\u7b26\u5408\u5be6\u969b\u5716\u9762\uff0c\u53ef\u7528\u300c\u8abf\u6574\u6750\u6599\u300d\u6539\u914d\u3002\u7576\u67d0\u5217\u5df2\u78ba\u8a8d\u6b63\u78ba\uff0c\u53ef\u7528\u8a72\u5217\u7684\u300c\u9396\u5b9a\u300d\u4e00\u6b21\u9396\u4f4f\u6240\u6709\u5df2\u5206\u914d token\uff0c\u7136\u5f8c\u518d\u8655\u7406\u5269\u9918\u5c3a\u5bf8\u3002\u6309\u300c\u4f9d\u9396\u5b9a\u91cd\u65b0\u63a8\u6f14\u300d\u6642\uff0c\u9396\u5b9a token \u8207\u6240\u5c6c Dimension \u4fdd\u6301\u4e0d\u52d5\uff0c\u6bcf\u500b Dimension \u5148\u6263\u9664\u5df2\u9396\u5b9a\u9577\u5ea6\uff0c\u518d\u7528\u6240\u6709\u672a\u9396\u5b9a token \u5c0d\u5269\u9918\u9577\u5ea6\u505a\u5168\u5716\u6700\u4f73\u5206\u914d\u3002\u6309\u4e00\u6b21\u6703\u81ea\u52d5\u9023\u7e8c\u63a8\u6f14\u6700\u591a 10 \u8f2a\uff0c\u6bcf\u8f2a\u8f2a\u66ff\u8aa4\u5dee\u76f8\u540c\u6216\u975e\u5e38\u63a5\u8fd1\u7684\u5019\u9078\u3002\u4e00\u65e6\u300c\u6bcf\u4e00\u6bb5\u6750\u6599\u90fd\u5df2\u4f7f\u7528\u300d\u5c31\u63d0\u524d\u505c\u6b62\uff1b\u82e5 10 \u8f2a\u5f8c\u4ecd\u7121\u6cd5\u5168\u6578\u4f7f\u7528\uff0c\u5247\u4fdd\u7559\u300c\u672a\u4f7f\u7528\u6578\u91cf\u6700\u5c11\uff0c\u5176\u6b21\u7e3d\u8aa4\u5dee\u6700\u5c0f\u300d\u7684\u90a3\u4e00\u8f2a\u3002\u5168\u7a0b\u4e0d\u6703\u79fb\u52d5\u9396\u5b9a\u6750\u6599\u3002</li></ol></div><div class="help-evaluation"><strong>\u5df2\u9a57\u7b97 DWG \u6a23\u672c\u7d50\u679c\uff087 \u6a94\uff09</strong><span>\u5168\u6750\u6599\u4f7f\u7528\u6210\u529f\uff1a5/7 \u6a94\uff0871.4%\uff09</span><span>\u6750\u6599\u6bb5\u4f7f\u7528\u7387\uff1a128/137\uff0893.4%\uff09</span><span>\u5e73\u9762 Dimension \u00b110 mm\uff1a23/25\uff0892.0%\uff09</span><span>\u5168\u90e8 Dimension \u00b110 mm\uff1a43/47\uff0891.5%\uff09</span><small>\u6a23\u672c\u6c92\u6709\u9010\u6bb5\u4eba\u5de5 ITEM\u2194Dimension \u914d\u5c0d\u6a19\u7c64\uff0c\u4ee5\u300c\u6750\u6599\u662f\u5426\u4f7f\u7528\u300d\u8207\u300c\u5c3a\u5bf8\u8aa4\u5dee\u300d\u4f5c\u70ba\u6210\u529f\u7387\u4ee3\u7406\u6307\u6a19\u3002</small></div></section><section><h3>3. \u641c\u5c0b\u8207\u624b\u52d5\u8abf\u6574</h3><ul><li>\u9577\u5ea6\u8207\u6750\u6599\u641c\u5c0b\u90fd\u652f\u63f4\u7a7a\u683c\u5206\u9694\u591a\u500b\u689d\u4ef6\uff0c\u4efb\u4e00\u689d\u4ef6\u7b26\u5408\u5373\u986f\u793a\u3002\u4f8b\u5982\uff1a<code>1016 2210</code> \u6216 <code>F 25 G</code>\u3002\u6750\u6599\u7d50\u679c\u6703\u4f9d\u641c\u5c0b\u8f38\u5165\u7684\u5148\u5f8c\u6392\u5e8f\u3002\u82e5 ITEM \u53ea\u6709\u4e00\u7a2e\u9577\u5ea6\uff0c\u53ef\u8f38\u5165 <code>F*3 G*2</code> \u5f8c\u6309 Enter\uff0c\u76f4\u63a5\u52fe\u9078\u6307\u5b9a\u6578\u91cf\uff1b\u6709\u591a\u7a2e\u9577\u5ea6\u7684 ITEM \u4ecd\u9700\u4eba\u5de5\u9078\u64c7\u3002</li><li>\u5728\u641c\u5c0b\u6b04\u6309 Esc \u53ef\u7acb\u5373\u6e05\u9664\u3002</li><li>\u300c\u8abf\u6574\u6750\u6599\u300d\u53ef\u91cd\u65b0\u5206\u914d\u6750\u6599\uff1b\u52fe\u9078\u5f8c\u9ede\u9396\u982d\u53ef\u9396\u5b9a\uff0c\u907f\u514d\u88ab\u5176\u4ed6 Dimension \u79fb\u8d70\u3002\u9700\u5148\u89e3\u9396\u624d\u80fd\u53d6\u6d88\u6216\u91cd\u65b0\u5206\u914d\u3002</li></ul></section><section><h3>4. \u5224\u5b9a\u539f\u5247</h3><ul><li>\u5dee\u7570\u5f88\u5c0f\u3001\u56db\u6368\u4e94\u5165\u5f8c\u4e00\u81f4\u6216\u5728\u5bb9\u8a31\u7bc4\u570d\u5167\uff0c\u6703\u986f\u793a\u4e00\u81f4/\u63a5\u8fd1\u3002</li><li>\u76f4\u7acb\u6bb5\u8207\u4f4e\u4fe1\u5fc3\u5e7e\u4f55\u6703\u964d\u4f4e\u4f4d\u7f6e\u6b0a\u91cd\uff0c\u907f\u514d Explode \u5f8c\u7dda\u6bb5\u4e0d\u5b8c\u6574\u5c0e\u81f4\u8aa4\u6392\u9664\u3002</li><li>\u7d05\u8272\u6216\u9700\u6ce8\u610f\u7684\u7d50\u679c\u4ee3\u8868\u7cfb\u7d71\u7121\u6cd5\u5728\u76ee\u524d\u6750\u6599\u7d44\u5408\u4e2d\u53ef\u9760\u5c0d\u61c9\uff0c\u4e0d\u7b49\u65bc\u5716\u9762\u4e00\u5b9a\u932f\u8aa4\u3002</li></ul></section><section class="help-limit"><h3>5. \u5c40\u9650\u8207\u6ce8\u610f</h3><ul><li>\u672c\u5de5\u5177\u662f\u898f\u5247\u8207\u7d44\u5408\u63a8\u6f14\uff0c\u4e0d\u662f CAD \u5e7e\u4f55\u6c42\u89e3\u5668\uff0c\u7d50\u679c\u4ecd\u9700\u5de5\u7a0b\u4eba\u54e1\u78ba\u8a8d\u3002 A \u8d77\u9ede\u76ee\u524d\u4f7f\u7528 leader \u7aef\u9ede\u8207\u76f4\u7dda\u8ddd\u96e2\u4f5c\u70ba\u62d3\u64b2\u8fd1\u4f3c\uff0c\u5c1a\u672a\u5b8c\u6574\u8ffd\u8e64\u6240\u6709\u9752\u8272 BUSWAY \u5916\u6846\u7684\u9023\u901a\u95dc\u4fc2\u3002</li><li>\u5716\u5c64\u540d\u7a31\u3001\u8868\u683c\u6392\u7248\u3001Catalog Number \u683c\u5f0f\u6216 Explode \u65b9\u5f0f\u8207\u7bc4\u4f8b\u5dee\u7570\u592a\u5927\u6642\uff0c\u53ef\u80fd\u6f0f\u8b80\u6216\u8aa4\u914d\u3002</li><li>\u91cd\u8907\u7684\u5c3a\u5bf8\u6578\u5b57\u6703\u4fdd\u7559\u70ba\u7368\u7acb\u9805\u76ee\uff1b\u4f46\u82e5 DWG \u4e2d\u6578\u5b57\u672c\u8eab\u4e0d\u5728 DIMS \u5716\u5c64\u6216\u4e26\u975e\u7d14\u6578\u5b57\uff0c\u53ef\u80fd\u7121\u6cd5\u8fa8\u8b58\u3002</li><li>\u9396\u5b9a\u53ea\u5c0d\u7576\u524d\u5df2\u4e0a\u50b3\u7684\u9801\u9762\u968e\u6bb5\u6709\u6548\uff1b\u91cd\u65b0\u6574\u7406\u6216\u91cd\u65b0\u4e0a\u50b3\u5f8c\u9700\u91cd\u65b0\u8a2d\u5b9a\u3002</li><li>DWG \u5168\u90e8\u5728\u700f\u89bd\u5668\u5167\u89e3\u6790\uff0c\u5927\u6a94\u6216\u540c\u6642\u4e0a\u50b3\u592a\u591a\u6a94\u6848\u6703\u53d7\u96fb\u8166\u8a18\u61b6\u9ad4\u9650\u5236\u3002</li></ul></section></div><div class="help-foot"><button type="button" data-help-close>\u95dc\u9589</button></div>`;
  document.body.appendChild(dialog); button.addEventListener('click', () => dialog.showModal()); dialog.addEventListener('click', (event) => { if (event.target === dialog || event.target.closest('[data-help-close]')) dialog.close(); });
}

installHelpDialog();

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
    if (!/^\d+(?:\.\d+)?$/.test(text)) return;
    const textPoint = entity.startPoint || entity.insertionPoint; const group = lines.slice(-Math.max(2, Math.min(lines.length, 14)));
    let p1 = group.length >= 10 ? group.at(-2)?.startPoint : group.at(-2)?.startPoint; let p2 = group.at(-1)?.startPoint;
    const validPair = p1 && p2 && [p1.x, p1.y, p2.x, p2.y].every(Number.isFinite) && Math.hypot(p2.x - p1.x, p2.y - p1.y) > .01;
    if ((!validPair || lines.length < 8) && textPoint) { p1 = { x: textPoint.x - 1, y: textPoint.y }; p2 = { x: textPoint.x + 1, y: textPoint.y }; }
    if (p1 && p2) dimensions.push({ type: 'DIMENSION', subclassMarker: 'ExplodedDimension', subDefinitionPoint1: p1, subDefinitionPoint2: p2, measurement: Number(text), text, textPoint, exploded: true, geometryConfidence: lines.length >= 10 ? 'high' : 'low' });
    lines = [];
  });
  return dimensions;
}

function materialLegs(catalog) {
  const normalized = cleanAlnum(catalog); const square = normalized.match(/G(?:LEM|LFM)(\d+)/);
  if (square) return [Number(square[1]), Number(square[1])].filter((value) => value > 0);
  try { const parsed = parseCatalog(normalized); const values = [...parsed.values].filter((value) => Number.isFinite(value) && value > 0); return values.length > 1 && values[0] === values.slice(1).reduce((sum, value) => sum + value, 0) ? values.slice(1) : values; }
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
  if (dimension.geometryConfidence === 'low') return 0;
  const dx = dimension.p2.x - dimension.p1.x; const dy = dimension.p2.y - dimension.p1.y; const span = Math.hypot(dx, dy) || 1; const ux = dx / span; const uy = dy / span;
  const bx = token.x - dimension.p1.x; const by = token.y - dimension.p1.y; const along = bx * ux + by * uy; const perpendicular = Math.abs(bx * uy - by * ux);
  const outside = along < 0 ? -along : along > span ? along - span : 0;
  const route = Number.isFinite(token.routeRank) && Number.isFinite(dimension.routeRank) ? Math.abs(token.routeRank - dimension.routeRank) * .65 : 0;
  const continuity = Number.isFinite(token.continuityTarget) && Number.isFinite(dimension.routeIndex) ? Math.abs(token.continuityTarget - dimension.routeIndex) * 12 : 0;
  return perpendicular / span + outside / span * 3 + route + continuity;
}

function dimensionCandidates(tokens, dimension) {
  const target = Math.max(0, Math.round(dimension.shownValue / 25.4)); const maxSum = target + 10; const complex = tokens.length > 40; const perSum = complex ? 28 : 70; const candidateLimit = complex ? 72 : 140;
  let states = new Map([[0, [{ mask: 0n, ids: [], geometry: 0 }]]]);
  tokens.forEach((token, index) => {
    if (!(token.length > 0) || token.length > maxSum) return;
    const bit = 1n << BigInt(index); const penalty = tokenDistancePenalty(token, dimension); const snapshot = [...states.entries()];
    snapshot.forEach(([sum, list]) => { const nextSum = sum + token.length; if (nextSum > maxSum) return; const bucket = states.get(nextSum) || [];
      list.forEach((state) => { if (tokens.length > 80 && state.ids.length >= 24) return; bucket.push({ mask: state.mask | bit, ids: [...state.ids, token.id], geometry: state.geometry + penalty }); });
      bucket.sort((a, b) => a.geometry - b.geometry); states.set(nextSum, bucket.slice(0, perSum));
    });
  });
  const candidates = [];
  states.forEach((list, sum) => { if (Math.abs(sum - target) > 10) return; list.forEach((state) => candidates.push({ ...state, sum, cost: Math.abs(sum - target) * (dimension.isPlanar ? 90 : 24) + state.geometry })); });
  return candidates.sort((a, b) => a.cost - b.cost).slice(0, candidateLimit);
}

function assignmentContinuityPenalty(assignments, tokens, dimensions) {
  const routeOrder = dimensions.map((dimension, index) => ({ index, distance: dimension.routeDistance ?? index })).sort((a, b) => a.distance - b.distance).map((entry) => entry.index); const routePosition = new Map(routeOrder.map((index, position) => [index, position]));
  const owner = new Map(); assignments.forEach((ids, dimensionIndex) => ids.forEach((id) => owner.set(id, routePosition.get(dimensionIndex) ?? dimensionIndex))); const groups = new Map();
  tokens.forEach((token) => { if (!token.componentId || token.legCount < 2) return; if (!groups.has(token.componentId)) groups.set(token.componentId, []); groups.get(token.componentId).push(token.id); });
  let penalty = 0; groups.forEach((ids) => { const positions = ids.map((id) => owner.get(id)).filter(Number.isInteger); if (positions.length < ids.length) return; const unique = [...new Set(positions)].sort((a, b) => a - b); if (unique.length < 2) penalty += 3; else penalty += Math.max(0, unique.at(-1) - unique[0] - (unique.length - 1)) + Math.max(0, ids.length - unique.length); }); return penalty;
}

function solveDimensionAssignments(tokens, dimensions) {
  tokens = tokens.filter((token) => token.length > 0);
  const complex = tokens.length > 40 || dimensions.length > 12; const stateLimit = complex ? 1800 : 5000;
  const prepared = dimensions.map((dimension, index) => ({ index, dimension, candidates: dimensionCandidates(tokens, dimension) })).sort((a, b) => Number(b.dimension.isPlanar) - Number(a.dimension.isPlanar) || a.candidates.length - b.candidates.length);
  let states = [{ mask: 0n, cost: 0, assignments: new Map() }];
  prepared.forEach(({ index, candidates }) => {
    const next = [];
    states.forEach((state) => candidates.forEach((candidate) => { if ((state.mask & candidate.mask) !== 0n) return; const assignments = new Map(state.assignments); assignments.set(index, candidate.ids); next.push({ mask: state.mask | candidate.mask, cost: state.cost + candidate.cost, assignments }); }));
    if (!next.length) return;
    const bestByMask = new Map(); next.forEach((state) => { const key = state.mask.toString(); if (!bestByMask.has(key) || state.cost < bestByMask.get(key).cost) bestByMask.set(key, state); });
    states = [...bestByMask.values()].sort((a, b) => a.cost - b.cost).slice(0, stateLimit);
  });
  const fullMask = tokens.length ? (1n << BigInt(tokens.length)) - 1n : 0n;
  states.forEach((state) => { state.continuity = assignmentContinuityPenalty(state.assignments, tokens, dimensions); });
  states.sort((a, b) => { const unusedA = (fullMask ^ (fullMask & a.mask)).toString(2).replace(/0/g, '').length; const unusedB = (fullMask ^ (fullMask & b.mask)).toString(2).replace(/0/g, '').length; return unusedA - unusedB || (a.cost + a.continuity * 20) - (b.cost + b.continuity * 20); });
  return states[0]?.assignments || new Map();
}

async function reshuffleDimensionAssignments(job, onProgress) {
  const tokens = (job.materialTokens || []).filter((token) => token.length > 0); const audits = job.dimensionAudits || []; if (!tokens.length || !audits.length) return;
  const locks = job.dimensionLocks ||= {}; const tokenById = new Map(tokens.map((token) => [token.id, token])); const fixedByDimension = audits.map(() => []); const lockedIds = new Set();
  Object.entries(locks).forEach(([id, owner]) => { const index = Number(owner); if (!tokenById.has(id) || !Number.isInteger(index) || !audits[index]) { delete locks[id]; return; } fixedByDimension[index].push(id); lockedIds.add(id); });
  const available = tokens.filter((token) => !lockedIds.has(token.id)); available.forEach((token) => { delete token.continuityTarget; }); const fixedComponents = new Map(); fixedByDimension.forEach((ids, owner) => ids.forEach((id) => { const token = tokenById.get(id); if (token?.componentId) fixedComponents.set(token.componentId, owner); })); available.forEach((token) => { if (fixedComponents.has(token.componentId)) token.continuityTarget = fixedComponents.get(token.componentId) + 1; }); const baseRound = job.dimensionShuffleCount || 0; let bestAudits = null; let bestUnused = Infinity; let bestError = Infinity; let attempts = 0;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    attempts = attempt; onProgress?.(attempt); await new Promise((resolve) => requestAnimationFrame(resolve));
    const round = baseRound + attempt; const offset = available.length ? round % available.length : 0; const shuffled = [...available.slice(offset), ...available.slice(0, offset)];
    const residualDimensions = audits.map((audit, index) => { const fixedIn = fixedByDimension[index].reduce((sum, id) => sum + (tokenById.get(id)?.length || 0), 0); return { ...audit, routeIndex: index, shownValue: Math.max(0, audit.shownValue - fixedIn * 25.4) }; });
    const assignments = solveDimensionAssignments(shuffled, residualDimensions);
    const candidateAudits = audits.map((audit, index) => auditFromTokens(audit, tokens, [...fixedByDimension[index], ...(assignments.get(index) || [])], false));
    const used = new Set(candidateAudits.flatMap((audit) => audit.tokenIds)); const unused = Math.max(0, tokens.length - used.size); const error = candidateAudits.reduce((sum, audit) => sum + Math.abs(audit.difference || 0), 0);
    if (unused < bestUnused || (unused === bestUnused && error < bestError)) { bestAudits = candidateAudits; bestUnused = unused; bestError = error; }
    if (unused === 0) break;
  }
  job.dimensionShuffleCount = baseRound + attempts; job.dimensionAudits = bestAudits || audits;
  job.dimensionShuffleMessage = bestUnused === 0 ? '\u2713 \u6bcf\u4e00\u6bb5\u6750\u6599\u90fd\u5df2\u4f7f\u7528\uff08\u672c\u6b21 ' + attempts + ' \u8f2a\uff09' : '\u5df2\u63a8\u6f14 10 \u8f2a\uff0c\u5c1a\u6709 ' + bestUnused + ' \u6bb5\u672a\u4f7f\u7528\uff08\u5df2\u4fdd\u7559\u6700\u4f73\u7d50\u679c\uff09';
}

function orderAuditsByComponentPath(audits, tokens) {
  if (audits.length < 2) return audits; const tokenById = new Map(tokens.map((token) => [token.id, token])); const remaining = new Set(audits.map((_, index) => index)); const ordered = [];
  let current = audits.map((audit, index) => ({ index, distance: audit.routeDistance ?? Infinity })).sort((a, b) => a.distance - b.distance || a.index - b.index)[0]?.index ?? 0;
  while (remaining.size) { if (!remaining.has(current)) current = [...remaining].sort((a, b) => (audits[a].routeDistance ?? Infinity) - (audits[b].routeDistance ?? Infinity) || a - b)[0]; const audit = audits[current]; ordered.push(audit); remaining.delete(current); if (!remaining.size) break;
    const bridgeComponents = new Set(audit.tokenIds.map((id) => tokenById.get(id)).filter((token) => token?.legCount > 1).map((token) => token.componentId));
    const connected = [...remaining].filter((index) => audits[index].tokenIds.some((id) => bridgeComponents.has(tokenById.get(id)?.componentId))).sort((a, b) => (audits[a].routeDistance ?? Infinity) - (audits[b].routeDistance ?? Infinity));
    current = connected[0] ?? [...remaining].sort((a, b) => (audits[a].routeDistance ?? Infinity) - (audits[b].routeDistance ?? Infinity) || a - b)[0];
  }
  return ordered;
}

function collectDimensionAudits(database, tableMeta, crossBoxes) {
  const nativeDimensions = database.entities.filter((entity) => entity.type === 'DIMENSION' && entity.subclassMarker === 'AcDbAlignedDimension' && entity.subDefinitionPoint1 && entity.subDefinitionPoint2 && Number.isFinite(entity.measurement) && entity.measurement > 0);
  const rawDimensions = [...nativeDimensions, ...collectExplodedDimensions(database)]; const grouped = tableMeta.map(() => []);
  rawDimensions.forEach((entity) => {
    const p1 = entity.subDefinitionPoint1; const p2 = entity.subDefinitionPoint2; if (![p1.x,p1.y,p2.x,p2.y].every(Number.isFinite)) return;
    const midX=(p1.x+p2.x)/2,midY=(p1.y+p2.y)/2;if(crossBoxes.some((box)=>midX>=box.minX&&midX<=box.maxX&&midY>=box.minY&&midY<=box.maxY))return;
    const choice=tableMeta.map((meta,index)=>({index,distance:Math.hypot(midX-meta.center.x,midY-meta.center.y)/Math.max(meta.table.header.span,1)})).sort((a,b)=>a.distance-b.distance)[0];if(!choice||choice.distance>35)return;
    const shownValue=/^\s*\d+(?:\.\d+)?\s*$/.test(String(entity.text||''))?Number(entity.text):Number(entity.measurement); grouped[choice.index].push({shownValue,p1,p2,exploded:Boolean(entity.exploded),geometryConfidence:entity.geometryConfidence||'high'});
  });
  return tableMeta.map((meta,tableIndex)=>{
    const rowMap=new Map(meta.table.rows.map((row)=>[row.item,row]));const tokens=[];
    meta.balloons.forEach((balloon,balloonIndex)=>{const row=rowMap.get(balloon.parsed.item);if(!row)return;const legs=materialLegs(row.catalog);for(let copy=0;copy<balloon.parsed.qty;copy+=1)legs.forEach((length,legIndex)=>tokens.push({id:`${balloonIndex}-${copy}-${legIndex}`,componentId:`${balloonIndex}-${copy}`,legIndex,legCount:legs.length,item:balloon.parsed.item,length,label:`${balloon.parsed.item} ${length}`,x:balloon.x,y:balloon.y,catalog:row.catalog}));});
    const dimensions=grouped[tableIndex].sort((a,b)=>a.shownValue-b.shownValue);dimensions.forEach((dimension)=>{dimension.isPlanar=Math.abs(dimension.p2.x-dimension.p1.x)>=Math.abs(dimension.p2.y-dimension.p1.y)*.35;});const aTokens=tokens.filter((token)=>token.item==='A').sort((a,b)=>a.x-b.x||a.y-b.y);const aToken=aTokens[0];if(aToken){const tokenDistances=tokens.map((token)=>Math.hypot(token.x-aToken.x,token.y-aToken.y));const dimensionDistances=dimensions.map((dimension)=>Math.hypot((dimension.p1.x+dimension.p2.x)/2-aToken.x,(dimension.p1.y+dimension.p2.y)/2-aToken.y));const tokenMax=Math.max(...tokenDistances,1),dimensionMax=Math.max(...dimensionDistances,1);tokens.forEach((token,index)=>{token.routeRank=tokenDistances[index]/tokenMax;});dimensions.forEach((dimension,index)=>{dimension.routeDistance=dimensionDistances[index];dimension.routeRank=dimensionDistances[index]/dimensionMax;});}const assignments=solveDimensionAssignments(tokens,dimensions);const audits=orderAuditsByComponentPath(dimensions.map((dimension,index)=>auditFromTokens(dimension,tokens,assignments.get(index)||[])),tokens);
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

function searchTerms(query) {
  return String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).map((term) => term.replace(/(?:[*x\u00d7])\d+$/i, ''));
}

function matchesSearch(value, query) {
  const terms = searchTerms(query);
  if (!terms.length) return true;
  const haystack = String(value || '').toLocaleLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function orderedMaterialTokens(tokens, query) {
  const rawTerms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).map((term) => term.replace(/(?:[*x\u00d7])\d+$/i, ''));
  return tokens.map((token, index) => { const value = (token.item + ' ' + token.length + ' ' + token.label).toLocaleLowerCase(); const priority = rawTerms.findIndex((term) => value.includes(term)); return { token, index, priority: priority < 0 ? rawTerms.length : priority }; }).sort((a, b) => a.priority - b.priority || a.index - b.index).map((entry) => entry.token);
}

function applyMaterialSearchSelection(job, dimensionIndex, query) {
  const requests = String(query || '').trim().toUpperCase().split(/\s+/).map((part) => part.match(/^([A-Z]{1,2})(?:[*X\u00d7](\d+))?$/)).filter(Boolean).map((match) => ({ item: match[1], qty: Math.max(1, Number(match[2] || 1)) }));
  if (!requests.length) return false; const tokens = job.materialTokens || []; const locks = job.dimensionLocks ||= {}; const selected = new Set(job.dimensionAudits[dimensionIndex].tokenIds); let changed = false;
  requests.forEach(({ item, qty }) => { const itemTokens = tokens.filter((token) => token.item === item); if (new Set(itemTokens.map((token) => token.length)).size !== 1) return; const candidates = itemTokens.filter((token) => locks[token.id] == null || locks[token.id] === dimensionIndex).sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id))); let added = 0; for (const token of candidates) { if (selected.has(token.id)) continue; selected.add(token.id); added += 1; changed = true; if (added >= qty) break; } });
  if (!changed) return false; job.dimensionAudits.forEach((audit, index) => { if (index !== dimensionIndex) audit.tokenIds = audit.tokenIds.filter((id) => !selected.has(id) || locks[id] === index); });
  job.dimensionAudits = job.dimensionAudits.map((audit, index) => auditFromTokens(audit, tokens, index === dimensionIndex ? [...selected] : audit.tokenIds, true)); return true;
}

function materialLabelHtml(label) {
  const match = String(label || '').match(/^(\S+)(.*)$/);
  if (!match) return escapeHtml(label);
  return `<span class="material-item-no">${escapeHtml(match[1])}</span><span class="material-length">${escapeHtml(match[2])}</span>`;
}

function materialFormulaHtml(formula) {
  if (!formula || formula === '\u2014') return '\u2014';
  return String(formula).split(' + ').map(materialLabelHtml).join('<span class="material-plus"> + </span>');
}

function progressMarkup(job) {
  const progress = job?.progress || { percent: job?.status === 'queued' ? 0 : 5, label: job?.status === 'queued' ? '等待處理' : '準備中', detail: '' };
  const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
  const steps = [['read', '讀取'], ['decode', '解碼'], ['detect', '辨識'], ['infer', '推演'], ['finish', '完成']];
  const stageOrder = { queued: -1, read: 0, decode: 1, detect: 2, infer: 3, finish: 4 }; const current = stageOrder[progress.stage] ?? -1;
  return `<div class="analysis-progress" role="status" aria-live="polite"><div class="analysis-progress-head"><strong>${escapeHtml(progress.label)}</strong><span>${Math.round(percent)}%</span></div><div class="analysis-progress-track"><i style="width:${percent}%"></i></div><div class="analysis-progress-steps">${steps.map(([key, label], index) => `<span class="${index < current ? 'done' : index === current ? 'current' : ''}">${label}</span>`).join('')}</div>${progress.detail ? `<p>${escapeHtml(progress.detail)}</p>` : ''}</div>`;
}
async function updateJobProgress(job, percent, stage, label, detail = '') {
  job.progress = { percent, stage, label, detail }; render();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function renderDimensionAudit(job) {
  if (!job || job.status !== 'done') {
    ui.dimensionSummary.textContent = job ? (job.progress?.label || '等待 DWG 解析完成') : '請先加入 DWG';
    ui.dimensionView.innerHTML = job ? progressMarkup(job) : '<div class="dimension-empty-state">完成 DWG 讀取後，會嘗試從原生 Dimension 或炸開尺寸建立驗算。</div>';
    return;
  }
  const audits = job.dimensionAudits || [];
  ui.dimensionSummary.textContent = audits.length ? `${audits.length} 個尺寸｜${job.displayName || job.file.name}` : `未找到尺寸｜${job.displayName || job.file.name}`;
  const dimensionQuery = String(job.dimensionSearch || '').trim().toLocaleLowerCase();
  const dimensionLocks = job.dimensionLocks ||= {};
  const rows = audits.map((audit, index) => {
    const searchValue = `${audit.shownValue} ${fmt(audit.shownValue)} ${audit.shownValue}mm`.toLocaleLowerCase();
    const hidden = !matchesSearch(searchValue, dimensionQuery);
    const rowLocked = audit.tokenIds.length > 0 && audit.tokenIds.every((id) => dimensionLocks[id] === index);
    return `<tr data-dimension-row data-search-value="${escapeHtml(searchValue)}" class="${rowLocked ? 'dimension-locked-row' : ''}" ${hidden ? 'hidden' : ''}><td>D${index + 1}</td><td>${fmt(audit.shownValue)} mm</td><td>${audit.difference == null ? '\u2014' : `${fmt(audit.calculatedMm)} mm`}</td><td>${audit.difference == null ? '\u2014' : `${audit.difference >= 0 ? '+' : ''}${fmt(audit.difference)} mm`}</td><td class="dimension-status dimension-${audit.level}">${escapeHtml(audit.status)}</td><td class="dimension-formula">${materialFormulaHtml(audit.formula)}</td><td><div class="dimension-row-actions"><button type="button" class="dimension-edit-button" data-dimension-edit="${index}">${job.manualDimensionIndex === index ? '\u6536\u5408' : '\u8abf\u6574\u6750\u6599'}</button><button type="button" class="dimension-bulk-lock ${rowLocked ? 'is-locked' : ''}" data-dimension-lock="${index}" ${audit.tokenIds.length ? '' : 'disabled'} title="${rowLocked ? '\u89e3\u9396\u9019\u4e00\u5217\u7684\u5168\u90e8\u6750\u6599' : '\u9396\u5b9a\u9019\u4e00\u5217\u76ee\u524d\u4f7f\u7528\u7684\u5168\u90e8\u6750\u6599'}">${rowLocked ? '\ud83d\udd12 \u5df2\u9396\u5b9a' : '\ud83d\udd13 \u9396\u5b9a'}</button></div></td></tr>`;
  }).join('');
  const usedBy = new Map(); audits.forEach((audit, auditIndex) => audit.tokenIds.forEach((id) => usedBy.set(id, auditIndex)));
  const unassigned = (job.materialTokens || []).filter((token) => !usedBy.has(token.id));
  const editorIndex = job.manualDimensionIndex; const editorAudit = Number.isInteger(editorIndex) ? audits[editorIndex] : null;
  const materialQuery = String(job.materialSearch || '').trim().toLocaleLowerCase();
  const materialTokensForDisplay = orderedMaterialTokens(job.materialTokens || [], materialQuery);
  const editor = editorAudit ? `<div class="dimension-editor"><strong>\u8abf\u6574 D${editorIndex + 1} \u4f7f\u7528\u7684\u6750\u6599</strong><p>\u52fe\u9078\u6750\u6599\u6703\u81ea\u52d5\u5f9e\u5176\u4ed6 Dimension \u79fb\u9664\u3002\u5df2\u9396\u5b9a\u7684\u6750\u6599\u4e0d\u6703\u88ab\u79fb\u8d70\uff0c\u9700\u5148\u89e3\u9396\u624d\u80fd\u8abf\u6574\u3002</p><div class="dimension-search material-search"><span>\u641c\u5c0b\u6750\u6599</span><input type="search" data-material-search value="${escapeHtml(job.materialSearch || '')}" placeholder="\u7a7a\u683c\u5206\u9694\uff1aF 25 G" title="\u591a\u500b\u689d\u4ef6\u4ee5\u7a7a\u683c\u5206\u9694\uff0cEsc \u6e05\u9664" /><button type="button" class="clear-visible-materials" data-clear-visible-materials="${editorIndex}">\u53d6\u6d88\u756b\u9762\u5df2\u52fe\u9078</button><button type="button" class="lock-visible-materials" data-lock-visible-materials="${editorIndex}">\ud83d\udd12 \u9396\u5b9a\u756b\u9762\u5df2\u52fe\u9078</button></div><div class="token-grid">${materialTokensForDisplay.map((token) => { const owner = usedBy.get(token.id); const locked = dimensionLocks[token.id] != null; const searchValue = `${token.label} ${token.id}`.toLocaleLowerCase(); const hidden = !matchesSearch(searchValue, materialQuery); return `<label data-material-row data-search-value="${escapeHtml(searchValue)}" class="${owner != null && owner !== editorIndex ? 'used-elsewhere' : ''} ${locked ? 'material-locked' : ''}" ${hidden ? 'hidden' : ''}><input type="checkbox" data-dimension-token="${escapeHtml(token.id)}" data-dimension-index="${editorIndex}" ${editorAudit.tokenIds.includes(token.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}/><span class="material-label">${materialLabelHtml(token.label)}</span><small>${owner == null ? '\u672a\u4f7f\u7528' : `D${owner + 1}`}</small><button type="button" class="material-lock-button ${locked ? 'is-locked' : ''}" data-material-lock="${escapeHtml(token.id)}" data-lock-owner="${owner == null ? '' : owner}" ${owner == null ? 'disabled' : ''} title="${owner == null ? '\u5148\u52fe\u9078\u6750\u6599\u624d\u80fd\u9396\u5b9a' : locked ? '\u89e3\u9396\u6750\u6599' : '\u9396\u5b9a\u6750\u6599\uff0c\u9632\u6b62\u88ab\u79fb\u8d70'}">${locked ? '\ud83d\udd12' : '\ud83d\udd13'}</button></label>`; }).join('')}</div><div class="search-no-results" data-material-empty ${materialQuery && !(job.materialTokens || []).some((token) => matchesSearch(`${token.label} ${token.id}`, materialQuery)) ? '' : 'hidden'}>\u627e\u4e0d\u5230\u7b26\u5408\u7684\u6750\u6599</div></div>` : '';
  const unusedNotice = unassigned.length ? `<div class="unused-materials">⚠ 尚未使用：${escapeHtml(unassigned.map((token) => token.label).join('、'))}</div>` : '<div class="all-materials-used">✓ 每一段材料都已使用</div>';
  const visibleCount = audits.filter((audit) => matchesSearch(`${audit.shownValue} ${fmt(audit.shownValue)} ${audit.shownValue}mm`, dimensionQuery)).length;
  const shuffleNotice = job.dimensionShuffleMessage ? `<em class="dimension-shuffle-message">${escapeHtml(job.dimensionShuffleMessage)}</em>` : '';
  ui.dimensionView.innerHTML = rows ? `<div class="dimension-search dimension-length-search"><span>\u641c\u5c0b\u9577\u5ea6</span><input type="search" inputmode="decimal" data-dimension-search value="${escapeHtml(job.dimensionSearch || '')}" placeholder="\u7a7a\u683c\u5206\u9694\uff1a1016 2210" title="\u591a\u500b\u9577\u5ea6\u4ee5\u7a7a\u683c\u5206\u9694\uff0cEsc \u6e05\u9664" /><small data-dimension-count>${visibleCount} / ${audits.length}</small><button type="button" class="dimension-shuffle-button" data-dimension-shuffle title="\u4fdd\u7559\u9396\u5b9a\u6750\u6599\uff0c\u91cd\u65b0\u5206\u914d\u5176\u9918\u6750\u6599">\u21bb \u4f9d\u9396\u5b9a\u91cd\u65b0\u63a8\u6f14</button>${shuffleNotice}</div><table><thead><tr><th>#</th><th>\u5716\u9762\u5c3a\u5bf8</th><th>\u7406\u8ad6\u5c3a\u5bf8</th><th>\u5dee\u7570</th><th>\u7d50\u679c</th><th>\u8a08\u7b97\u5f0f\uff08in\uff09</th><th>\u624b\u52d5</th></tr></thead><tbody>${rows}</tbody></table><div class="search-no-results" data-dimension-empty ${visibleCount ? 'hidden' : ''}>\u627e\u4e0d\u5230\u7b26\u5408\u7684\u5716\u9762\u9577\u5ea6</div>${unusedNotice}${editor}` : '<div class="dimension-empty-state">\u672a\u627e\u5230\u53ef\u9a57\u7b97\u7684\u539f\u751f\u6216 DIMS \u5716\u5c64\u70b8\u958b\u5c3a\u5bf8\u3002</div>';
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
  if (job.status === 'working' || job.status === 'queued') { ui.dataView.innerHTML = progressMarkup(job); return; }
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
  job.status = 'working'; job.progress = { percent: 3, stage: 'read', label: '準備讀取 DWG', detail: job.file.name }; render(); let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let pointer; let engine;
    try {
      await updateJobProgress(job, 8, 'read', '讀取圖檔', job.file.name);
      const buffer = await job.file.arrayBuffer();
      await updateJobProgress(job, 18, 'decode', '載入 DWG 解析引擎', '大型圖檔可能需要較長時間');
      engine = await getEngine();
      await updateJobProgress(job, 28, 'decode', '解碼 DWG 內容', '正在轉換 CAD 物件');
      pointer = engine.dwg_read_data(buffer, Dwg_File_Type.DWG);
      if (!pointer) throw new Error('DWG 解析器回傳 null，檔案可能損壞或版本不相容');
      const database = engine.convert(pointer);
      await updateJobProgress(job, 48, 'detect', '辨識表格、ITEM 與 Dimension', '正在排除打叉圖框與重建尺寸');
      await updateJobProgress(job, 62, 'infer', '進行長度組合推演', '正在建立候選與全圖分配；複雜圖可能需要較長時間');
      const result = extractTables(database);
      await updateJobProgress(job, 94, 'finish', '整理解析結果', String(result.tables.length) + ' 個有效表格');
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
  const start = jobs.length; files.forEach((file, index) => jobs.push({ file, status: 'queued', progress: { percent: 0, stage: 'queued', label: '等待處理', detail: '佇列中第 ' + (index + 1) + ' / ' + files.length + ' 個檔案' } })); activeIndex = start; render();
  processingPromise = processingPromise.then(async () => {
    let queued; while ((queued = jobs.find((entry) => entry.status === 'queued'))) await processJob(queued);
  });
  await processingPromise; ui.fileInput.value = '';
}

ui.workspaceTabs.forEach((button) => button.addEventListener('click', () => { ui.dashboard.dataset.workspace = button.dataset.workspaceTab; ui.workspaceTabs.forEach((tab) => { const active = tab === button; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); }); }));
ui.fileInput.addEventListener('change', () => addFiles(ui.fileInput.files));
['dragenter', 'dragover'].forEach((name) => ui.dropzone.addEventListener(name, (event) => { event.preventDefault(); ui.dropzone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach((name) => ui.dropzone.addEventListener(name, (event) => { event.preventDefault(); ui.dropzone.classList.remove('dragging'); }));
ui.dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
ui.dimensionView.addEventListener('click', async (event) => {
  const shuffleButton = event.target.closest('[data-dimension-shuffle]');
  if (shuffleButton) {
    event.preventDefault(); const job = currentJob(); if (!job || shuffleButton.disabled) return; shuffleButton.disabled = true;
    await reshuffleDimensionAssignments(job, (attempt) => { shuffleButton.textContent = '↻ 推演 ' + attempt + ' / 10...'; }); renderDimensionAudit(job); return;
  }
  const lockVisibleButton = event.target.closest('[data-lock-visible-materials]');
  if (lockVisibleButton) {
    event.preventDefault(); const job = currentJob(); const index = Number(lockVisibleButton.dataset.lockVisibleMaterials); if (!job?.dimensionAudits?.[index]) return; const locks = job.dimensionLocks ||= {};
    ui.dimensionView.querySelectorAll('[data-material-row]:not([hidden]) input[data-dimension-token]:checked').forEach((input) => { locks[input.dataset.dimensionToken] = index; }); renderDimensionAudit(job); return;
  }
  const clearVisibleButton = event.target.closest('[data-clear-visible-materials]');
  if (clearVisibleButton) {
    event.preventDefault(); const job = currentJob(); const index = Number(clearVisibleButton.dataset.clearVisibleMaterials); const audit = job?.dimensionAudits?.[index]; if (!audit) return;
    const removable = new Set([...ui.dimensionView.querySelectorAll('[data-material-row]:not([hidden]) input[data-dimension-token]:checked:not(:disabled)')].map((input) => input.dataset.dimensionToken));
    if (!removable.size) return; audit.tokenIds = audit.tokenIds.filter((id) => !removable.has(id));
    job.dimensionAudits = job.dimensionAudits.map((entry, auditIndex) => auditFromTokens(entry, job.materialTokens, auditIndex === index ? audit.tokenIds : entry.tokenIds, true)); renderDimensionAudit(job); return;
  }
  const rowLockButton = event.target.closest('[data-dimension-lock]');
  if (rowLockButton) {
    event.preventDefault(); const job = currentJob(); const index = Number(rowLockButton.dataset.dimensionLock); const audit = job?.dimensionAudits?.[index]; if (!audit?.tokenIds?.length) return;
    const locks = job.dimensionLocks ||= {}; const allLocked = audit.tokenIds.every((id) => locks[id] === index);
    audit.tokenIds.forEach((id) => { if (allLocked) { if (locks[id] === index) delete locks[id]; } else locks[id] = index; }); renderDimensionAudit(job); return;
  }
  const lockButton = event.target.closest('[data-material-lock]');
  if (lockButton) {
    event.preventDefault(); event.stopPropagation(); const job = currentJob(); const tokenId = lockButton.dataset.materialLock; const owner = Number(lockButton.dataset.lockOwner);
    if (!job || !Number.isInteger(owner)) return; const locks = job.dimensionLocks ||= {}; if (locks[tokenId] != null) delete locks[tokenId]; else locks[tokenId] = owner; renderDimensionAudit(job); return;
  }
  const button = event.target.closest('[data-dimension-edit]'); if (!button) return; const job = currentJob(); const index = Number(button.dataset.dimensionEdit);
  job.manualDimensionIndex = job.manualDimensionIndex === index ? null : index; renderDimensionAudit(job);
});
ui.dimensionView.addEventListener('change', (event) => {
  const input = event.target.closest('[data-dimension-token]'); if (!input) return; const job = currentJob(); const index = Number(input.dataset.dimensionIndex); const tokenId = input.dataset.dimensionToken;
  if (job.dimensionLocks?.[tokenId] != null) { renderDimensionAudit(job); return; }
  job.dimensionAudits.forEach((audit, auditIndex) => { if (auditIndex !== index) audit.tokenIds = audit.tokenIds.filter((id) => id !== tokenId); });
  const ids = new Set(job.dimensionAudits[index].tokenIds); if (input.checked) ids.add(tokenId); else ids.delete(tokenId);
  job.dimensionAudits = job.dimensionAudits.map((audit, auditIndex) => auditFromTokens(audit, job.materialTokens, auditIndex === index ? [...ids] : audit.tokenIds, true)); renderDimensionAudit(job);
});
ui.dimensionView.addEventListener('input', (event) => {
  const job = currentJob(); if (!job) return;
  if (event.target.matches('[data-dimension-search]')) {
    job.dimensionSearch = event.target.value; const query = event.target.value.trim().toLocaleLowerCase(); let visible = 0;
    ui.dimensionView.querySelectorAll('[data-dimension-row]').forEach((row) => { row.hidden = !matchesSearch(row.dataset.searchValue, query); if (!row.hidden) visible += 1; });
    const count = ui.dimensionView.querySelector('[data-dimension-count]'); if (count) count.textContent = `${visible} / ${(job.dimensionAudits || []).length}`;
    const empty = ui.dimensionView.querySelector('[data-dimension-empty]'); if (empty) empty.hidden = visible > 0;
  }
  if (event.target.matches('[data-material-search]')) {
    job.materialSearch = event.target.value; const query = event.target.value.trim().toLocaleLowerCase(); let visible = 0;
    ui.dimensionView.querySelectorAll('[data-material-row]').forEach((row) => { row.hidden = !matchesSearch(row.dataset.searchValue, query); if (!row.hidden) visible += 1; });
    const empty = ui.dimensionView.querySelector('[data-material-empty]'); if (empty) empty.hidden = visible > 0;
  }
});
ui.dimensionView.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.matches('[data-material-search]')) { const job = currentJob(); const index = job?.manualDimensionIndex; if (job && Number.isInteger(index)) { event.preventDefault(); if (applyMaterialSearchSelection(job, index, event.target.value)) renderDimensionAudit(job); } return; }
  if (event.key !== 'Escape' || !event.target.matches('[data-dimension-search], [data-material-search]')) return;
  event.preventDefault(); event.stopPropagation(); event.target.value = ''; event.target.dispatchEvent(new Event('input', { bubbles: true }));
});
ui.dimensionView.addEventListener('wheel', (event) => {
  const view = ui.dimensionView; const verticalMax = Math.max(0, view.scrollHeight - view.clientHeight);
  const canContinueVertically = event.deltaY < 0 ? view.scrollTop > 1 : event.deltaY > 0 ? view.scrollTop < verticalMax - 1 : false;
  if (canContinueVertically) return;
  const hasHorizontalOverflow = view.scrollWidth > view.clientWidth + 1;
  if (!hasHorizontalOverflow || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  const before = view.scrollLeft; view.scrollLeft += event.deltaY;
  if (view.scrollLeft !== before) event.preventDefault();
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
