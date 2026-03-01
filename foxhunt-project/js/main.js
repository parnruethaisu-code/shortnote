// ==========================================
// SYSTEM STATE (สถานะของระบบ)
// ==========================================
const historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 15; 
let selectedElement = null;
let isResizing = false;
let isDragging = false; 
let appScale = 1; 
let currentPaperFormat = [250, 250]; 
let currentPaperName = 'square';
let currentOrientation = 'portrait';
let zoomLevel = 1;
let isAutoZoom = true;
let dragStartX = 0, dragStartY = 0;
let initialLeft = 0, initialTop = 0;
let initialWidth = 0, initialHeight = 0;
let initialFontSize = 0;
let savedRange = null;

// ==========================================
// CORE UI & INTERACTION LOGIC
// ==========================================
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); }
function toggleSidebar(e) { if(e) e.stopPropagation(); document.getElementById('sidebar').classList.toggle('open'); }
function closeSidebarOnMobile(e) { if (window.innerWidth <= 1024 && document.getElementById('sidebar').classList.contains('open')) { document.getElementById('sidebar').classList.remove('open'); } }
function showDialog(msg, isConfirm = false, onOk = null) {
    const dialog = document.getElementById('custom-dialog');
    document.getElementById('dialog-msg').innerHTML = msg;
    const btnCancel = document.getElementById('dialog-btn-cancel');
    const btnOk = document.getElementById('dialog-btn-ok');
    btnCancel.style.display = isConfirm ? 'block' : 'none';
    btnCancel.onclick = function() { dialog.style.display = 'none'; };
    btnOk.onclick = function() { dialog.style.display = 'none'; if(onOk) onOk(); };
    dialog.style.display = 'flex';
}
function handleGlobalKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); exportProject(); }
    if (e.key === 'Tab' && e.target.isContentEditable) { e.preventDefault(); saveState(); document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'); triggerAutoSave(); }
}
function handleBodyClick(event) {
    if (!event.target.closest('#emoji-picker') && !event.target.closest('.sb-section')) {
        document.getElementById('emoji-picker').style.display = 'none';
    }
    if (!event.target.closest('.smart-object') && !event.target.closest('.sidebar') && !event.target.closest('.show-ans-btn') && !event.target.closest('.zoom-controls')) {
            document.querySelectorAll('.smart-object').forEach(el => el.classList.remove('selected'));
            selectedElement = null;
    }
}
document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === 1 ? container : container.parentElement;
        if (element && element.closest('.content-editable-area')) { savedRange = range.cloneRange(); }
    }
});

// ==========================================
// ZOOM & PAPER SETTINGS
// ==========================================
function zoomIn() { zoomLevel = Math.min(3.0, (isAutoZoom ? appScale : zoomLevel) + 0.1); isAutoZoom = false; applyZoom(); }
function zoomOut() { zoomLevel = Math.max(0.2, (isAutoZoom ? appScale : zoomLevel) - 0.1); isAutoZoom = false; applyZoom(); }
function fitZoom() { isAutoZoom = true; applyZoom(); }

function applyZoom() {
    const container = document.getElementById('app-content');
    if(!container) return;
    const screenWidth = window.innerWidth;
    const root = getComputedStyle(document.documentElement);
    const pageWidthStr = root.getPropertyValue('--page-width').trim();
    const pageWidthMM = parseFloat(pageWidthStr) || 250;
    const targetWidthPx = pageWidthMM * 3.78; 
    const sidebarWidth = screenWidth > 1024 ? 320 : 0;
    const availableWidth = screenWidth - sidebarWidth;
    const paddingHorizontal = 40; 
    
    if (isAutoZoom) {
        if (availableWidth < targetWidthPx + paddingHorizontal) {
            appScale = Math.max(0.2, (availableWidth - paddingHorizontal) / targetWidthPx); 
        } else { appScale = 1; }
        const zd = document.getElementById('zoom-display'); if(zd) zd.innerText = 'Auto';
    } else {
        appScale = zoomLevel; const zd = document.getElementById('zoom-display'); if(zd) zd.innerText = Math.round(appScale * 100) + '%';
    }
    container.style.transform = `scale(${appScale})`;
    container.style.marginBottom = `-${(1 - appScale) * container.offsetHeight}px`;
}

function setOrientation(orient) {
    if (currentOrientation === orient) return;
    saveState(); currentOrientation = orient;
    document.getElementById('btn-portrait').classList.toggle('active', orient === 'portrait');
    document.getElementById('btn-landscape').classList.toggle('active', orient === 'landscape');
    setPaperSize(currentPaperName);
}

function setPaperSize(size) {
    saveState(); let root = document.documentElement; let displayTxt = '(1:1)'; let width, height;
    switch(size) {
        case 'a4': width = 210; height = 297; displayTxt = '(A4)'; break;
        case 'a5': width = 148; height = 210; displayTxt = '(A5)'; break;
        case 'b5': width = 176; height = 250; displayTxt = '(B5)'; break;
        case 'letter': width = 215.9; height = 279.4; displayTxt = '(Letter)'; break;
        case 'square': default: width = 250; height = 250; displayTxt = '(1:1)'; break;
    }
    if (currentOrientation === 'landscape' && size !== 'square') { let temp = width; width = height; height = temp; displayTxt += ' แนวนอน'; } 
    else if (currentOrientation === 'portrait' && size !== 'square') { displayTxt += ' แนวตั้ง'; }
    root.style.setProperty('--page-width', width + 'mm'); root.style.setProperty('--page-height', height + 'mm');
    currentPaperFormat = [width, height]; currentPaperName = size;
    const pd = document.getElementById('paper-display'); if(pd) pd.innerText = displayTxt; 
    const ps = document.getElementById('paper-select'); if(ps) ps.value = size;
    let printStyle = document.getElementById('dynamic-print-style');
    if (!printStyle) { printStyle = document.createElement('style'); printStyle.id = 'dynamic-print-style'; document.head.appendChild(printStyle); }
    printStyle.innerHTML = `@media print { @page { size: ${width}mm ${height}mm; margin: 0; } .a4-page { width: ${width}mm !important; height: ${height}mm !important; } .page-separator { width: ${width}mm !important; height: ${height}mm !important; } }`;
    applyZoom(); triggerAutoSave();
}

// ==========================================
// SMART OBJECTS & DRAG-DROP
// ==========================================
function makeSmartObject(element) {
    if (element.dataset.isSmart) return;
    element.dataset.isSmart = 'true';
    const img = element.querySelector('img');
    if(img) img.addEventListener('dragstart', (e) => e.preventDefault());
    element.addEventListener('mousedown', handleStart);
    element.addEventListener('touchstart', handleStart, {passive: false});

    function handleStart(e) {
        if (e.target.classList.contains('delete-handle')) { saveState(); element.remove(); triggerAutoSave(); return; }
        if (e.target.closest('.content-editable-area') || e.target.isContentEditable) {
            selectedElement = element;
            document.querySelectorAll('.smart-object').forEach(el => el.classList.remove('selected'));
            element.classList.add('selected');
            return; 
        }
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        selectedElement = element;
        document.querySelectorAll('.smart-object').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');

        if (e.target.classList.contains('resize-handle')) {
            isResizing = true; dragStartX = clientX; dragStartY = clientY; initialWidth = element.offsetWidth; initialHeight = element.offsetHeight; initialFontSize = parseFloat(window.getComputedStyle(element).fontSize);
        } else {
            isResizing = false; isDragging = true; dragStartX = clientX; dragStartY = clientY; initialLeft = element.offsetLeft; initialTop = element.offsetTop;
            element.classList.add('is-moving'); document.body.classList.add('is-dragging');
        }
        e.stopPropagation();
    }
}

document.addEventListener('mousemove', handleMove); document.addEventListener('touchmove', handleMove, {passive: false});
function handleMove(e) {
    if (!selectedElement) return;
    if (!isDragging && !isResizing) return; 
    const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const dx = (clientX - dragStartX) / appScale;
    const dy = (clientY - dragStartY) / appScale;

    if (isResizing) {
        if (selectedElement.classList.contains('post-it')) {
            const newWidth = Math.max(150, initialWidth + dx); 
            const newHeight = Math.max(150, initialHeight + dy); 
            selectedElement.style.width = newWidth + 'px';
            selectedElement.style.height = newHeight + 'px';
        } else if (selectedElement.querySelector('img')) {
            selectedElement.style.width = Math.max(50, initialWidth + dx) + 'px';
            selectedElement.style.height = 'auto';
        } else {
            const newSize = Math.max(10, initialFontSize + (dx / 2));
            selectedElement.style.fontSize = newSize + 'px';
        }
    } else {
        const pageBounds = selectedElement.closest('.a4-page').getBoundingClientRect();
        let newX = initialLeft + dx; let newY = initialTop + dy;
        const minX = -selectedElement.offsetWidth / 2; const minY = -selectedElement.offsetHeight / 2;
        const maxX = (pageBounds.width / appScale) - (selectedElement.offsetWidth / 2); const maxY = (pageBounds.height / appScale) - (selectedElement.offsetHeight / 2);
        newX = Math.max(minX, Math.min(newX, maxX)); newY = Math.max(minY, Math.min(newY, maxY));
        selectedElement.style.left = newX + 'px'; selectedElement.style.top = newY + 'px';
    }
    if(e.cancelable) e.preventDefault();
}

document.addEventListener('mouseup', handleEnd); document.addEventListener('touchend', handleEnd);
document.addEventListener('mouseleave', handleEnd); window.addEventListener('blur', handleEnd);
function handleEnd(e) {
    if (selectedElement) {
        selectedElement.classList.remove('is-moving'); document.body.classList.remove('is-dragging');
        if (isDragging || isResizing) { saveState(); triggerAutoSave(); }
        isDragging = false; isResizing = false;
    }
}

let draggedBlock = null;
document.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (handle) { const block = handle.closest('.draggable-block'); if (block) block.setAttribute('draggable', 'true'); } 
    else { document.querySelectorAll('.draggable-block[draggable="true"]').forEach(b => b.removeAttribute('draggable')); }
});
document.addEventListener('dragstart', (e) => {
    const block = e.target.closest('.draggable-block');
    if (block && block.getAttribute('draggable') === 'true') {
        draggedBlock = block; e.dataTransfer.effectAllowed = 'move';
        if (e.dataTransfer.setData) e.dataTransfer.setData('text/plain', '');
        setTimeout(() => draggedBlock.classList.add('is-dragging'), 0);
    }
});
document.addEventListener('dragend', (e) => {
    if (draggedBlock) { draggedBlock.classList.remove('is-dragging'); draggedBlock.removeAttribute('draggable'); draggedBlock = null; saveState(); triggerAutoSave(); }
});
document.addEventListener('dragover', (e) => {
    if (draggedBlock) {
        e.preventDefault(); const dropZone = e.target.closest('.layout-col, .content-editable-area');
        if (dropZone) {
            const afterElement = getDragAfterElement(dropZone, e.clientY);
            if (afterElement == null) { dropZone.appendChild(draggedBlock); } 
            else { if (afterElement.parentNode) { afterElement.parentNode.insertBefore(draggedBlock, afterElement); } }
        }
    }
});
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.draggable-block:not(.is-dragging)')].filter(el => el.closest('.layout-col, .content-editable-area') === container);
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2; 
        if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; } else { return closest; }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ==========================================
// PAGE SORTER LOGIC
// ==========================================
let sorterDraggedItem = null;
function openPageSorter() {
    const pages = document.querySelectorAll('.a4-page');
    if (pages.length <= 1) { showDialog("มีเพียง 1 หน้ากระดาษ ไม่สามารถจัดเรียงได้ครับ"); return; }
    const grid = document.getElementById('sorter-grid'); grid.innerHTML = '';
    
    pages.forEach((page, index) => {
        const header = page.querySelector('h1, h2, h3, .quiz-q');
        let title = header && header.innerText ? header.innerText.trim() : 'หน้ากระดาษ';
        let icon = 'ph-file-text';
        if(page.classList.contains('page-cover')) icon = 'ph-book-bookmark';
        else if(page.querySelector('.quiz-q')) icon = 'ph-target';
        else if(page.classList.contains('page-separator')) icon = 'ph-bookmark-simple';

        const thumb = document.createElement('div');
        thumb.className = 'sorter-thumb'; thumb.setAttribute('draggable', 'true'); thumb.dataset.originalIndex = index;
        thumb.innerHTML = `<div class="sorter-thumb-num">${index + 1}</div><div class="sorter-thumb-preview"><i class="ph ${icon}"></i></div><div class="sorter-thumb-title" title="${title}">${title}</div>`;

        thumb.addEventListener('dragstart', function(e) {
            sorterDraggedItem = this; setTimeout(() => this.classList.add('sortable-ghost'), 0);
            e.dataTransfer.effectAllowed = 'move'; if (e.dataTransfer.setData) e.dataTransfer.setData('text/plain', '');
        });
        thumb.addEventListener('dragend', function() {
            this.classList.remove('sortable-ghost'); sorterDraggedItem = null;
            document.querySelectorAll('.sorter-thumb').forEach(el => el.classList.remove('drag-over'));
        });
        thumb.addEventListener('dragover', function(e) { e.preventDefault(); if (this !== sorterDraggedItem) { this.classList.add('drag-over'); } });
        thumb.addEventListener('dragleave', function() { this.classList.remove('drag-over'); });
        thumb.addEventListener('drop', function(e) {
            e.preventDefault(); this.classList.remove('drag-over');
            if (this !== sorterDraggedItem && sorterDraggedItem) {
                const gridChildren = [...grid.children]; const droppedIndex = gridChildren.indexOf(this); const draggedIndex = gridChildren.indexOf(sorterDraggedItem);
                if (draggedIndex < droppedIndex) { this.after(sorterDraggedItem); } else { this.before(sorterDraggedItem); }
                updateSorterNumbers();
            }
        });
        grid.appendChild(thumb);
    });
    openModal('sorter-modal');
}
function updateSorterNumbers() {
    const thumbs = document.querySelectorAll('.sorter-thumb');
    thumbs.forEach((thumb, index) => { thumb.querySelector('.sorter-thumb-num').innerText = index + 1; });
}
function applyPageOrder() {
    saveState(); const container = document.getElementById('app-content');
    const originalPages = [...document.querySelectorAll('.a4-page')];
    const thumbs = document.querySelectorAll('.sorter-thumb');
    const fragment = document.createDocumentFragment();
    thumbs.forEach(thumb => { const originalIndex = parseInt(thumb.dataset.originalIndex); fragment.appendChild(originalPages[originalIndex]); });
    container.innerHTML = ''; container.appendChild(fragment);
    closeModal('sorter-modal'); updatePageNumbersControls(); triggerAutoSave(); applyZoom();
    showDialog("จัดเรียงหน้ากระดาษเรียบร้อยครับ! 🦊");
}

// ==========================================
// PAGE ACTIONS (ADD, REMOVE, MOVE)
// ==========================================
function getPageHTML(page, index, content = null) {
    const pageControls = `<div class="page-controls no-print items-center"><div class="bg-white border border-gray-200 text-gray-500 font-bold text-[11px] px-3 py-1.5 rounded-full shadow-sm mr-1 flex items-center justify-center pointer-events-none select-none">หน้า <span class="current-page-num ml-1">1</span></div><button class="move-up-btn" onmousedown="event.preventDefault();" onclick="movePageUp(this)" title="เลื่อนขึ้น"><i class="ph ph-caret-up"></i></button><button class="move-down-btn" onmousedown="event.preventDefault();" onclick="movePageDown(this)" title="เลื่อนลง"><i class="ph ph-caret-down"></i></button><button class="add-page-btn" onmousedown="event.preventDefault();" onclick="addPageAfter(this, '${page.type}')" title="เพิ่มหน้าใหม่ต่อจากหน้านี้"><i class="ph ph-plus"></i></button><button class="remove-page-btn" onmousedown="event.preventDefault();" onclick="removePage(this)" title="ลบหน้านี้"><i class="ph ph-trash"></i></button></div>`;
    let title = 'พิมพ์ชื่อเรื่อง...'; let def = 'พิมพ์นิยาม...'; let easy = 'พิมพ์คำอธิบาย...'; let trick = 'พิมพ์ทริก...'; let q = 'พิมพ์โจทย์...'; let choices = `<div>ก. ...</div><div>ข. ...</div><div>ค. ...</div><div>ง. ...</div>`; let ans = '...';
    if (content) { title = content.title || title; def = content.full || def; easy = content.easy || (content.super || easy); trick = content.fox || trick; q = content.q || q; if(content.choices) choices = content.choices.map(c => `<div>${c}</div>`).join(''); ans = content.step || ans; }
    const ctx = { controls: pageControls, title: title, def: def, easy: easy, q: q, uid: Date.now(), randQ: foxQuotes[Math.floor(Math.random() * foxQuotes.length)], content: content };
    const templateFn = UI_TEMPLATES.pages[page.type] || UI_TEMPLATES.pages['blank'];
    return templateFn(ctx);
}
function addPage(t, d=null) { saveState(); const w = document.createElement('div'); w.innerHTML = getPageHTML({type: t, data: d}, 0, d); document.getElementById('app-content').appendChild(w.firstChild); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100); rebindSmartObjects(); updateMathJax(); updatePageNumbersControls(); triggerAutoSave(); applyZoom(); }
function addPageAfter(btn, t, d=null) { saveState(); const currentPage = btn.closest('.a4-page'); const w = document.createElement('div'); w.innerHTML = getPageHTML({type: t, data: d}, 0, d); currentPage.after(w.firstChild); rebindSmartObjects(); updateMathJax(); updatePageNumbersControls(); triggerAutoSave(); applyZoom(); }
function removePage(btn) { if (document.querySelectorAll('.a4-page').length <= 1) { showDialog('ต้องมีอย่างน้อย 1 หน้ากระดาษครับ!'); return; } showDialog('ยืนยันที่จะลบหน้านี้?', true, () => { saveState(); btn.closest('.a4-page').remove(); updatePageNumbersControls(); triggerAutoSave(); applyZoom(); }); }
function removeVisiblePage() {
    if (document.querySelectorAll('.a4-page').length <= 1) { showDialog('ต้องมีอย่างน้อย 1 หน้ากระดาษครับ!'); return; }
    showDialog('ยืนยันที่จะลบหน้าที่กำลังดูอยู่นี้ใช่ไหม?', true, () => { saveState(); const page = getVisiblePage(); if(page) page.remove(); updatePageNumbersControls(); triggerAutoSave(); applyZoom(); });
}
function updatePageNumbersControls() {
    const pages = document.querySelectorAll('.a4-page');
    pages.forEach((page, index) => {
        const numSpan = page.querySelector('.current-page-num'); if (numSpan) numSpan.innerText = index + 1;
        const displaySpan = page.querySelector('.page-num-display'); if (displaySpan) displaySpan.innerText = index + 1;
    });
}
function movePageUp(btn) {
    const currentPage = btn.closest('.a4-page'); const prevPage = currentPage.previousElementSibling;
    if (prevPage && prevPage.classList.contains('a4-page')) { saveState(); prevPage.before(currentPage); updatePageNumbersControls(); triggerAutoSave(); currentPage.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
function movePageDown(btn) {
    const currentPage = btn.closest('.a4-page'); const nextPage = currentPage.nextElementSibling;
    if (nextPage && nextPage.classList.contains('a4-page')) { saveState(); nextPage.after(currentPage); updatePageNumbersControls(); triggerAutoSave(); currentPage.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
function getVisiblePage() {
    const pages = document.querySelectorAll('.a4-page'); if(!pages.length) return null;
    let bestPage = pages[0]; let minDistance = Infinity;
    pages.forEach(page => { const rect = page.getBoundingClientRect(); const pageCenterY = rect.top + (rect.height / 2); const viewportCenterY = window.innerHeight / 2; const distance = Math.abs(pageCenterY - viewportCenterY); if (distance < minDistance) { minDistance = distance; bestPage = page; } });
    return bestPage;
}

// ==========================================
// EDITOR & MEDIA LOGIC
// ==========================================
function setPagePattern(pattern) { saveState(); const page = getVisiblePage(); if(!page) return; page.classList.remove('pattern-lines', 'pattern-grid', 'pattern-dots'); if(pattern !== 'blank') page.classList.add('pattern-' + pattern); triggerAutoSave(); }
function setPageMargin(margin) { saveState(); const page = getVisiblePage(); if(!page) return; page.classList.remove('margin-narrow', 'margin-normal', 'margin-wide', 'margin-10', 'margin-15', 'margin-20'); page.classList.add('margin-' + margin); triggerAutoSave(); }

function insertLayout(t) { 
    saveState(); let h = ''; 
    const templateFn = UI_TEMPLATES.layouts[t];
    if(templateFn) h = templateFn();
    insertContent(h); 
}

function insertBlock(t) { 
    saveState(); let h = ''; let uid = Date.now(); 
    const templateFn = UI_TEMPLATES.blocks[t];
    if(templateFn) h = templateFn(uid);
    insertContent(h);
}

function formatDoc(cmd, value = null) { 
    restoreSelection(); 
    if(savedRange) { saveState(); document.execCommand(cmd, false, value); triggerAutoSave(); } 
    else { showDialog("กรุณาคลิกเลือกหรือคลุมดำข้อความที่ต้องการก่อนครับ"); }
}

function restoreSelection() { if (savedRange) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); } }

function triggerImageUpload() { document.getElementById('img-upload').click(); }
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file) {
        if (!file.type.match(/image.*/)) return;
        const reader = new FileReader();
        reader.onload = function(readerEvent) {
            const image = new Image();
            image.onload = function() {
                const canvas = document.createElement('canvas');
                const max_size = 800; let w = image.width; let h = image.height;
                if (w > h) { if (w > max_size) { h *= max_size / w; w = max_size; } } else { if (h > max_size) { w *= max_size / h; h = max_size; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, w, h);
                insertFloatingImage(canvas.toDataURL('image/jpeg', 0.8));
            }
            image.src = readerEvent.target.result;
        }
        reader.readAsDataURL(file);
    }
    event.target.value = ''; 
}

function insertFloatingFox() {
    insertFloatingImage(FOX_URL);
}

function insertFloatingImage(src) { 
    saveState(); 
    const t = getVisiblePage(); const w = document.createElement('div'); w.className = 'smart-object selected'; 
    w.style.top = (20 + Math.random()*10) + '%'; w.style.left = (35 + Math.random()*10) + '%'; w.style.width = '200px'; 
    w.innerHTML = `<img src="${src}" class="w-full h-auto rounded shadow-sm border border-gray-200 pointer-events-none"><div class="controls"><div class="delete-handle">✕</div><div class="resize-handle"></div></div>`; 
    t.appendChild(w); makeSmartObject(w); triggerAutoSave(); 
}

function insertFloatingEmoji(e) { 
    saveState(); 
    const t = getVisiblePage(); const w = document.createElement('div'); w.className = 'smart-object selected text-6xl'; 
    w.style.top = (30 + Math.random()*15) + '%'; w.style.left = (40 + Math.random()*15) + '%'; 
    w.innerHTML = `<div class="emoji-content pointer-events-none">${e}</div><div class="controls"><div class="delete-handle">✕</div><div class="resize-handle"></div></div>`; 
    t.appendChild(w); makeSmartObject(w); triggerAutoSave(); 
}

function insertEmoji(e) { insertFloatingEmoji(e); document.getElementById('emoji-picker').style.display = 'none'; }
function toggleEmojiPicker(e) { e.stopPropagation(); document.getElementById('emoji-picker').style.display = document.getElementById('emoji-picker').style.display==='flex'?'none':'flex'; }

function insertFloatingPostIt() {
    saveState();
    const t = getVisiblePage(); 
    const w = document.createElement('div'); 
    w.className = 'smart-object selected post-it'; 
    w.style.top = (30 + Math.random()*10) + '%'; 
    w.style.left = (30 + Math.random()*10) + '%'; 
    w.style.width = '220px'; 
    w.style.minHeight = '150px'; 
    w.style.backgroundColor = '#fef08a'; 
    w.style.boxShadow = '3px 5px 15px rgba(0,0,0,0.15)';
    w.style.borderRadius = '2px 2px 10px 2px'; 
    w.style.padding = '16px';
    w.style.border = '1px solid #fde047'; 
    
    w.innerHTML = `
        <div class="content-editable-area outline-none text-gray-800 text-sm leading-relaxed w-full h-full overflow-auto" style="font-family: 'Mali', cursive;" contenteditable="true">จดโน้ตสั้นๆ ตรงนี้...<br>✨ ลากไปมาได้เลย!</div>
        <div class="controls"><div class="delete-handle">✕</div><div class="resize-handle"></div></div>
    `; 
    t.appendChild(w); 
    makeSmartObject(w); 
    triggerAutoSave(); 
}

function insertContent(h) {
    if (!window.getSelection().rangeCount && savedRange) { restoreSelection(); }
    const s = window.getSelection(); let range;
    if (s.rangeCount > 0) {
        let c = s.getRangeAt(0).commonAncestorContainer; if (c.nodeType === 3) c = c.parentNode; 
        if (c.closest('.content-editable-area') || c.closest('.layout-col') || c.closest('.article-text') || c.closest('.fox-explanation') || c.closest('.quiz-ans-box') || c.closest('.summary-list')) { range = s.getRangeAt(0); }
    }
    if (!range) {
        const visiblePage = getVisiblePage(); 
        if (!visiblePage) { showDialog('กรุณาเพิ่มหน้ากระดาษก่อนครับ'); return; }
        const contentArea = visiblePage.querySelector('.content-editable-area');
        if (contentArea) { contentArea.focus(); range = document.createRange(); range.selectNodeContents(contentArea); range.collapse(false); s.removeAllRanges(); s.addRange(range); savedRange = range.cloneRange(); } 
        else { showDialog('กรุณาคลิกเลือกพื้นที่ในหน้ากระดาษก่อนแทรกเนื้อหานะครับ'); return; }
    }
    if (range) {
        const t = document.createElement('div'); t.innerHTML = h; range.deleteContents();
        const f = document.createDocumentFragment(); let l; while (t.firstChild) { l = t.firstChild; f.appendChild(l); }
        range.insertNode(f); if (l) { range.setStartAfter(l); range.collapse(true); s.removeAllRanges(); s.addRange(range); savedRange = range.cloneRange(); }
        saveState(); updateMathJax(); triggerAutoSave(); applyZoom();
    }
}

// ==========================================
// EXPORT & STORAGE LOGIC
// ==========================================
let currentExportType = 'png';
function openExportModal(type) {
    currentExportType = type; document.getElementById('export-type-display').innerText = type;
    const pages = document.querySelectorAll('.a4-page'); const listContainer = document.getElementById('export-page-list'); listContainer.innerHTML = '';
    pages.forEach((page, index) => {
        const pageNum = index + 1; let titleStr = "หน้า " + pageNum; const header = page.querySelector('h1, h2, h3, .quiz-q');
        if(header && header.innerText) { titleStr += ` <span class="text-[10px] text-gray-400 block font-normal truncate mt-0.5">${header.innerText.substring(0, 20)}...</span>`; } else { titleStr += ` <span class="text-[10px] text-gray-400 block font-normal mt-0.5">ไม่มีหัวข้อ</span>`; }
        listContainer.innerHTML += `<label class="flex items-start gap-2 p-2 border bg-white border-gray-200 rounded-lg cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"><input type="checkbox" class="export-page-cb mt-1 w-4 h-4 accent-indigo-600 flex-shrink-0" value="${index}" checked><div class="text-sm text-gray-700 font-bold overflow-hidden w-full">${titleStr}</div></label>`;
    });
    document.getElementById('btn-confirm-export').onclick = () => {
        closeModal('export-modal'); const selectedIndexes = Array.from(document.querySelectorAll('.export-page-cb:checked')).map(cb => parseInt(cb.value));
        if(selectedIndexes.length === 0) { showDialog("⚠️ กรุณาเลือกอย่างน้อย 1 หน้าเพื่อบันทึกครับ"); return; }
        if(currentExportType === 'png') doExportPNG(selectedIndexes); else doExportPDF(selectedIndexes);
    }; openModal('export-modal');
}
function selectAllExportPages() { document.querySelectorAll('.export-page-cb').forEach(cb => cb.checked = true); }
function deselectAllExportPages() { document.querySelectorAll('.export-page-cb').forEach(cb => cb.checked = false); }

async function doExportPNG(selectedIndexes) {
    const pages = document.querySelectorAll('.a4-page'); 
    const toast = document.getElementById('auto-save-toast'); toast.innerHTML = '<i class="ph ph-spinner animate-spin"></i> กำลังเตรียมไฟล์ภาพ...'; toast.style.opacity = '1';
    document.querySelectorAll('.smart-object').forEach(el => el.classList.remove('selected')); document.body.classList.add('is-exporting');
    const container = document.getElementById('app-content'); const oldMargin = container.style.marginBottom;
    container.style.transform = 'scale(1)'; container.style.transformOrigin = 'top left'; container.style.marginBottom = '0';
    document.body.style.width = '3000px'; document.body.style.minHeight = '3000px'; document.body.style.overflow = 'hidden'; window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 600));
    for (let i of selectedIndexes) {
        try {
            const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: pages[i].offsetWidth, height: pages[i].offsetHeight, windowWidth: 3000, windowHeight: 3000 });
            const link = document.createElement('a'); link.download = `Foxhunt_Page_${i + 1}.png`; link.href = canvas.toDataURL('image/png', 1.0); link.click();
        } catch (err) { console.error(err); showDialog("เกิดข้อผิดพลาดในการบันทึกภาพหน้า " + (i+1)); }
    }
    document.body.style.width = ''; document.body.style.minHeight = ''; document.body.style.overflow = '';
    container.style.transformOrigin = 'top center'; container.style.marginBottom = oldMargin;
    document.body.classList.remove('is-exporting'); applyZoom(); 
    toast.innerHTML = '<i class="ph ph-check-circle text-green-400"></i> บันทึกภาพเรียบร้อย!'; setTimeout(() => toast.style.opacity = '0', 2000); setTimeout(() => toast.innerHTML = '<i class="ph ph-check-circle text-green-400"></i> Auto-saved', 2500); 
}

async function doExportPDF(selectedIndexes) {
    const { jsPDF } = window.jspdf; const pages = document.querySelectorAll('.a4-page'); 
    const doc = new jsPDF({ orientation: currentOrientation, unit: 'mm', format: currentPaperFormat });
    const toast = document.getElementById('auto-save-toast'); toast.innerHTML = '<i class="ph ph-spinner animate-spin"></i> กำลังสร้างไฟล์ PDF...'; toast.style.opacity = '1';
    document.querySelectorAll('.smart-object').forEach(el => el.classList.remove('selected')); document.body.classList.add('is-exporting');
    const container = document.getElementById('app-content'); const oldMargin = container.style.marginBottom;
    container.style.transform = 'scale(1)'; container.style.transformOrigin = 'top left'; container.style.marginBottom = '0';
    document.body.style.width = '3000px'; document.body.style.minHeight = '3000px'; document.body.style.overflow = 'hidden'; window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 600));
    let firstPageAdded = false;
    for (let i of selectedIndexes) {
        try {
            const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: pages[i].offsetWidth, height: pages[i].offsetHeight, windowWidth: 3000, windowHeight: 3000 });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            if (firstPageAdded) doc.addPage(currentPaperFormat, currentOrientation); 
            doc.addImage(imgData, 'JPEG', 0, 0, currentPaperFormat[0], currentPaperFormat[1]);
            firstPageAdded = true;
        } catch (err) { console.error(err); }
    }
    document.body.style.width = ''; document.body.style.minHeight = ''; document.body.style.overflow = '';
    container.style.transformOrigin = 'top center'; container.style.marginBottom = oldMargin;
    document.body.classList.remove('is-exporting'); applyZoom(); 
    if (firstPageAdded) doc.save('Foxhunt_Note.pdf');
    toast.innerHTML = '<i class="ph ph-check-circle text-green-400"></i> บันทึก PDF เรียบร้อย!'; setTimeout(() => toast.style.opacity = '0', 2000); setTimeout(() => toast.innerHTML = '<i class="ph ph-check-circle text-green-400"></i> Auto-saved', 2500);
}

function exportProject() {
    saveState(); 
    const projectData = { version: "2.6_UltimateFox", timestamp: new Date().toISOString(), content: document.getElementById('app-content').innerHTML, settings: userKeywords, paperSize: currentPaperName, orientation: currentOrientation };
    const blob = new Blob([JSON.stringify(projectData)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url;
    const date = new Date(); a.download = `Foxhunt_${date.getFullYear()}${date.getMonth()+1}${date.getDate()}_${date.getHours()}${date.getMinutes()}.fox`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function importProject(event) {
    const file = event.target.files[0]; if (!file) return;
    showDialog("การโหลดโปรเจกต์จะเขียนทับงานปัจจุบัน ยืนยันไหมครับ?", true, () => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.content) {
                    saveState(); document.getElementById('app-content').innerHTML = data.content;
                    if (data.settings) { userKeywords = data.settings; document.getElementById('kw-trick').value = userKeywords.trick || ""; document.getElementById('kw-exam').value = userKeywords.exam || ""; document.getElementById('kw-def').value = userKeywords.def || ""; document.getElementById('kw-easy').value = userKeywords.easy || ""; document.getElementById('kw-dashed').value = userKeywords.dashed || ""; document.getElementById('kw-solid').value = userKeywords.solid || ""; document.getElementById('kw-red').value = userKeywords.red || ""; }
                    if (data.orientation) { currentOrientation = data.orientation; document.getElementById('btn-portrait').classList.toggle('active', currentOrientation === 'portrait'); document.getElementById('btn-landscape').classList.toggle('active', currentOrientation === 'landscape'); }
                    document.querySelectorAll('.smart-object').forEach(el => delete el.dataset.isSmart);
                    setPaperSize(data.paperSize || 'square'); rebindSmartObjects(); updateMathJax(); updatePageNumbersControls(); triggerAutoSave(); showDialog("โหลดโปรเจกต์เรียบร้อย! 🦊");
                } else { showDialog("รูปแบบไฟล์ไม่ถูกต้องครับ"); }
            } catch (err) { console.error(err); showDialog("เกิดข้อผิดพลาดในการอ่านไฟล์"); }
        }; reader.readAsText(file);
    }); event.target.value = ''; 
}

function saveState() {
    const container = document.getElementById('app-content'); if(!container) return;
    if (historyIndex < historyStack.length - 1) historyStack.splice(historyIndex + 1);
    const currentHTML = container.innerHTML;
    if(historyStack.length === 0 || historyStack[historyStack.length - 1] !== currentHTML) { historyStack.push(currentHTML); if (historyStack.length > MAX_HISTORY) historyStack.shift(); else historyIndex++; }
}

function triggerAutoSave() {
    try {
        localStorage.setItem('foxhunt_autosave', document.getElementById('app-content').innerHTML); 
        localStorage.setItem('foxhunt_paper_size', currentPaperName); localStorage.setItem('foxhunt_paper_orient', currentOrientation);
        const toast = document.getElementById('auto-save-toast'); toast.style.opacity = '1'; setTimeout(() => toast.style.opacity = '0', 2000); checkStorageHealth(); 
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') { showDialog("⚠️ พื้นที่จัดเก็บชั่วคราว (Cache) เต็ม! แนะนำให้กดปุ่มเซฟโปรเจกต์ (รูปแผ่นดิสก์) เพื่อโหลดเป็นไฟล์ .fox เก็บไว้ และลดจำนวนรูปภาพขนาดใหญ่ลงครับ"); }
    }
}

function loadAutoSave() {
    const saved = localStorage.getItem('foxhunt_autosave');
    if (saved && saved.trim() !== '') {
        document.getElementById('app-content').innerHTML = saved.replace(/width:\s*250mm\s*!important/g, 'width: var(--page-width) !important').replace(/height:\s*250mm\s*!important/g, 'height: var(--page-height) !important');
        document.querySelectorAll('.smart-object').forEach(el => delete el.dataset.isSmart);
        rebindSmartObjects(); updateMathJax(); updatePageNumbersControls();
        const savedOrient = localStorage.getItem('foxhunt_paper_orient');
        if (savedOrient) { currentOrientation = savedOrient; document.getElementById('btn-portrait').classList.toggle('active', currentOrientation === 'portrait'); document.getElementById('btn-landscape').classList.toggle('active', currentOrientation === 'landscape'); }
        setPaperSize(localStorage.getItem('foxhunt_paper_size') || 'square'); return true;
    } return false;
}

function updateMathJax() {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise().catch(err => console.log('MathJax Error:', err.message));
    }
}

function undo() { if (historyIndex > 0) { historyIndex--; document.getElementById('app-content').innerHTML = historyStack[historyIndex]; document.querySelectorAll('.smart-object').forEach(el => delete el.dataset.isSmart); rebindSmartObjects(); updateMathJax(); updatePageNumbersControls(); triggerAutoSave(); applyZoom(); } }
function redo() { if (historyIndex < historyStack.length - 1) { historyIndex++; document.getElementById('app-content').innerHTML = historyStack[historyIndex]; document.querySelectorAll('.smart-object').forEach(el => delete el.dataset.isSmart); rebindSmartObjects(); updateMathJax(); updatePageNumbersControls(); triggerAutoSave(); applyZoom(); } }
function rebindSmartObjects() { document.querySelectorAll('.smart-object').forEach(el => makeSmartObject(el)); }

// ==========================================
// AI & SMART IMPORT LOGIC
// ==========================================
function saveKeywords() {
    userKeywords.trick = document.getElementById('kw-trick').value; userKeywords.exam = document.getElementById('kw-exam').value; userKeywords.def = document.getElementById('kw-def').value; userKeywords.easy = document.getElementById('kw-easy').value; userKeywords.dashed = document.getElementById('kw-dashed').value; userKeywords.solid = document.getElementById('kw-solid').value; userKeywords.red = document.getElementById('kw-red').value;
    closeModal('settings-modal'); showDialog("บันทึกการตั้งค่าเรียบร้อย!");
}

function loadExample(type) {
    if (type.startsWith('smart')) { document.getElementById('json-input').value = promptExamples[type]; } 
    else { document.getElementById('ai-input').value = promptExamples[type]; }
}

function processSmartImport() {
    const input = document.getElementById('json-input').value.trim(); if (!input) return;
    try {
        let data; try { data = JSON.parse(input); } catch(e) { throw new Error("Invalid JSON"); }
        if (Array.isArray(data)) { 
            showDialog("ล้างหน้าเดิมและสร้างใหม่?", true, () => {
                saveState(); document.getElementById('app-content').innerHTML = ''; 
                let html = getPageHTML({type:'cover'},0) + getPageHTML({type:'preface'},1) + getPageHTML({type:'separator'},2);
                data.forEach(item => html += getPageHTML({ type: 'content', data: item },0, item)); html += getPageHTML({type:'last'},3);
                document.getElementById('app-content').innerHTML = html; closeModal('json-modal'); rebindSmartObjects(); updatePageNumbersControls(); triggerAutoSave(); applyZoom();
            }); return; 
        }
    } catch (e) {}
    const lines = input.split('\n'); let title = "บทเรียนใหม่"; if (lines.length>0 && lines[0].length<100) title = lines[0].trim();
    let formatted = smartFormatText(input); saveState(); const wrapper = document.createElement('div'); wrapper.innerHTML = getPageHTML({type:'content'}, 0);
    const newPage = wrapper.firstChild; const t = newPage.querySelector('.page-header h3'); if(t && title!=="บทเรียนใหม่") t.innerText = title; 
    const c = newPage.querySelector('.content-editable-area'); if(c) { c.innerHTML = formatted; }
    document.getElementById('app-content').appendChild(newPage);
    closeModal('json-modal'); updatePageNumbersControls(); showDialog("Import เรียบร้อย!"); triggerAutoSave(); applyZoom();
}

async function processAIGenerate() {
    const input = document.getElementById('ai-input').value.trim(); const apiKey = document.getElementById('gemini-api-key').value.trim();
    if (!input) { showDialog("กรุณาใส่ข้อความก่อนครับ!"); return; }
    let title = "AI Infographic"; let subtitle = "สรุปสาระสำคัญอัตโนมัติ"; let contentLines = [];

    if (apiKey) {
        const toast = document.getElementById('auto-save-toast'); toast.innerHTML = '<i class="ph ph-spinner animate-spin"></i> AI กำลังคิดและสรุปเนื้อหา...'; toast.style.opacity = '1';
        try {
            const prompt = `ทำหน้าที่เป็นผู้เชี่ยวชาญการทำสรุปย่อ (Summarizer) สรุปเนื้อหาต่อไปนี้เพื่อทำ Infographic โดยต้องส่งกลับมาเป็นข้อความล้วนๆ แบ่งบรรทัดตามนี้เป๊ะๆ ห้ามใช้ Markdown (ห้ามใช้เครื่องหมาย ** หรือ * เด็ดขาด):\nบรรทัดที่ 1: หัวข้อหลัก (สั้นๆ กระชับ)\nบรรทัดที่ 2: คำอธิบายย่อย (1 ประโยคสั้นๆ)\nบรรทัดที่ 3-6: ประเด็นสำคัญที่สุด 4 ข้อ (สั้นๆ ประเด็นละ 1 บรรทัด)\nบรรทัดที่ 7 เป็นต้นไป: ประเด็นเสริมอื่นๆ (ประเด็นละ 1 บรรทัด)\n\nเนื้อหา:\n${input}`;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            if (!response.ok) throw new Error('API Error');
            const data = await response.json(); const aiText = data.candidates[0].content.parts[0].text;
            const lines = aiText.split('\n').map(l => l.trim().replace(/^[-•*]\s*/, '')).filter(l => l.length > 0);
            title = lines.length > 0 ? lines[0] : title; subtitle = lines.length > 1 ? lines[1] : subtitle; contentLines = lines.length > 2 ? lines.slice(2) : ["ไม่มีรายละเอียดเพิ่มเติม"];
            toast.innerHTML = '<i class="ph ph-check-circle text-green-400"></i> AI สร้างเสร็จแล้ว!'; setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.innerHTML = '<i class="ph ph-check-circle text-green-400"></i> Auto-saved', 300); }, 2000);
        } catch (err) { console.error(err); showDialog("เกิดข้อผิดพลาดในการเชื่อมต่อ AI โปรดตรวจสอบ API Key อีกครั้ง"); toast.style.opacity = '0'; return; }
    } else {
        const lines = input.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        title = lines.length > 0 ? lines[0] : title; subtitle = lines.length > 1 && lines[1].length < 100 ? lines[1] : subtitle; contentLines = lines.length > 2 ? lines.slice(2) : (lines.length > 1 ? lines.slice(1) : ["เพิ่มรายละเอียดเพิ่มเติมที่นี่..."]);
    }
    renderAIInfographic(title, subtitle, contentLines);
}

function renderAIInfographic(title, subtitle, contentLines) {
    const pageControls = `<div class="page-controls no-print items-center"><div class="bg-white border border-gray-200 text-gray-500 font-bold text-[11px] px-3 py-1.5 rounded-full shadow-sm mr-1 flex items-center justify-center pointer-events-none select-none">หน้า <span class="current-page-num ml-1">1</span></div><button class="move-up-btn" onmousedown="event.preventDefault();" onclick="movePageUp(this)" title="เลื่อนขึ้น"><i class="ph ph-caret-up"></i></button><button class="move-down-btn" onmousedown="event.preventDefault();" onclick="movePageDown(this)" title="เลื่อนลง"><i class="ph ph-caret-down"></i></button><button class="add-page-btn" onmousedown="event.preventDefault();" onclick="addPageAfter(this, 'content')" title="เพิ่มหน้าใหม่ต่อจากหน้านี้"><i class="ph ph-plus"></i></button><button class="remove-page-btn" onmousedown="event.preventDefault();" onclick="removePage(this)" title="ลบหน้านี้"><i class="ph ph-trash"></i></button></div>`;
    let html = `<div class="a4-page relative group flex flex-col" style="background-color: #FCF9F5;">${pageControls}`;
    html += `<div class="relative bg-gradient-to-r from-orange-600 via-orange-500 to-yellow-500 text-white p-8 rounded-b-[40px] shadow-lg mb-8 outline-none" contenteditable="true" style="margin: -10mm -10mm 20px -10mm;"><img src="${FOX_URL}" class="absolute right-8 top-8 w-24 h-24 opacity-20 pointer-events-none select-none"><h1 class="text-4xl font-black mb-3 tracking-wide" style="font-family: var(--font-heading);">${title}</h1><h2 class="text-xl font-medium opacity-90">${subtitle}</h2></div>`;
    html += `<div class="flex-grow flex flex-col gap-6 px-4 content-editable-area outline-none cursor-text" contenteditable="true">`;
    let gridLimit = Math.min(4, contentLines.length);
    if(gridLimit > 0) {
        html += `<div class="grid grid-cols-2 gap-5">`; const icons = [`<img src="${FOX_URL}" class="w-6 h-6 pointer-events-none">`, '🎯', '🔥', '✨'];
        for(let i=0; i<gridLimit; i++){ let cleanText = contentLines[i].replace(/^[-•*]|\d+\.\s*/, '').trim(); html += `<div class="bg-white p-5 rounded-2xl border border-orange-100 shadow-sm border-l-4 border-l-orange-500 hover:shadow-md transition"><div class="text-2xl mb-3">${icons[i%4]}</div><div class="text-sm text-gray-800 font-medium leading-relaxed">${cleanText}</div></div>`; }
        html += `</div>`;
    }
    if(contentLines.length > 4) {
        let rest = contentLines.slice(4);
        html += `<div class="bg-white rounded-2xl border border-orange-200 shadow-sm p-6 mt-2 relative overflow-hidden"><div class="absolute right-0 top-0 w-2 h-full bg-orange-400"></div><h3 class="text-lg font-bold text-orange-900 mb-4 flex items-center gap-2"><i class="ph ph-list-dashes"></i> ประเด็นเพิ่มเติม</h3><ul class="space-y-3">`;
        rest.forEach(line => { let cleanText = line.replace(/^[-•*]|\d+\.\s*/, '').trim(); html += `<li class="flex items-start gap-3 text-sm text-gray-700"><img src="${FOX_URL}" class="w-4 h-4 mt-0.5 pointer-events-none"> <span>${cleanText}</span></li>`; });
        html += `</ul></div>`;
    }
    html += `</div><div class="mt-auto pt-6 pb-2 text-center border-t border-orange-200" contenteditable="true"><img src="${FOX_URL}" class="w-8 h-8 mb-2 inline-block pointer-events-none"><p class="text-[11px] font-bold text-orange-600 tracking-wider uppercase">Auto-Generated by Foxhunt AI</p></div></div>`;
    saveState(); const w = document.createElement('div'); w.innerHTML = html; document.getElementById('app-content').appendChild(w.firstChild); 
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100); 
    closeModal('ai-modal'); document.getElementById('ai-input').value = '';
    rebindSmartObjects(); updatePageNumbersControls(); triggerAutoSave(); applyZoom();
    if(!document.getElementById('gemini-api-key').value.trim()) { showDialog("✨ สร้างหน้า Infographic เรียบร้อย!"); }
}

function smartFormatText(text) {
    const blocks = text.split(/\n\s*\n/); let html = ''; let gridBuffer = []; 
    const flush = () => { if (gridBuffer.length) { if (gridBuffer.length===1) html+=gridBuffer[0]; else for(let i=0;i<gridBuffer.length;i+=2) html+= i+1<gridBuffer.length ? `<div class="grid grid-cols-2 gap-4 mb-4"><div>${gridBuffer[i]}</div><div>${gridBuffer[i+1]}</div></div>` : gridBuffer[i]; gridBuffer=[]; } };
    const getRegex = (k) => new RegExp(`^(${userKeywords[k].replace(/,/g, '|')})`, 'i');
    blocks.forEach((b, i) => {
        b = b.trim(); if(!b) return; if(i===0 && b.length<100 && !b.includes('\n')) return; let c = b;
        if (getRegex('trick').test(b) || b.includes('🦊')) { flush(); c=b.replace(getRegex('trick'),'').replace(/^[:\s]+/,'').trim(); html+=`<div class="draggable-block group relative">${DH}<div class="fox-explanation mb-0"><img src="${FOX_URL}" class="w-5 h-5 inline-block align-middle mr-1 pointer-events-none"><b>Trick:</b> ${c}</div></div>`; }
        else if (getRegex('exam').test(b)) { flush(); c=b.replace(getRegex('exam'),'').replace(/^[:\s]+/,'').trim(); let uid = Date.now() + i; html+=`<div class="draggable-block group relative">${DH}<div class="quiz-card mb-0"><span class="quiz-q">${c.replace(/\n/g,'<br>')}</span><div id="ans_${uid}" class="quiz-ans-box" style="display:block;" contenteditable="true"><b>เฉลย:</b> ...</div></div></div>`; }
        else if (getRegex('def').test(b)) { c=b.replace(getRegex('def'),'').replace(/^[:\s]+/,'').trim(); html+=`<div class="draggable-block group relative">${DH}<div class="article-card mb-0"><span class="article-label">นิยาม</span><div class="article-text">${c}</div></div></div>`; }
        else if (getRegex('easy').test(b)) { c=b.replace(getRegex('easy'),'').replace(/^[:\s]+/,'').trim(); gridBuffer.push(`<div class="draggable-block group relative">${DH}<div class="block-easy mb-0"><div class="font-bold text-green-800 mb-1 flex items-center gap-2"><span>🟢 SUPER EASY</span></div><div class="text-green-700 font-medium text-sm">${c}</div></div></div>`); }
        else if (getRegex('dashed').test(b)) { flush(); c=b.replace(getRegex('dashed'),'').replace(/^[:\s]+/,'').trim(); html+=`<div class="draggable-block group relative">${DH}<div class="block-dashed mb-0"><div class="font-bold text-gray-500 mb-1 flex items-center gap-2"><span>✂️</span> <span>NOTE</span></div><div class="text-gray-700 text-sm">${c}</div></div></div>`; }
        else if (getRegex('solid').test(b)) { flush(); c=b.replace(getRegex('solid'),'').replace(/^[:\s]+/,'').trim(); html+=`<div class="draggable-block group relative">${DH}<div class="block-solid mb-0"><div class="font-bold text-indigo-800 mb-1 flex items-center gap-2"><span>🎨</span> <span>CONCEPT</span></div><div class="text-indigo-900 text-sm">${c}</div></div></div>`; }
        else if (getRegex('red').test(b)) { flush(); c=b.replace(getRegex('red'),'').replace(/^[:\s]+/,'').trim(); html+=`<div class="draggable-block group relative">${DH}<div class="block-red mb-0"><div class="font-bold text-red-700 mb-1 flex items-center gap-2"><span>🚨</span> <span>WARNING</span></div><div class="text-red-800 text-sm">${c}</div></div></div>`; }
        else if (/^[-•*]|\d+\./.test(b)) { flush(); const items=b.split('\n').map(l=>`<li class="ml-4">${l.replace(/^[-•*]|\d+\.\s*/,'')}</li>`).join(''); html+=`<ul class="list-disc pl-2 mb-4 text-sm text-gray-700 space-y-1">${items}</ul>`; }
        else { flush(); if(b.length<50 && !b.includes('\n')) html+=`<h3 class="text-lg font-bold text-gray-800 mt-4 mb-2 border-b border-gray-200 pb-1">${b}</h3>`; else html+=`<p class="text-sm text-gray-700 leading-relaxed mb-3 text-justify indent-8">${b}</p>`; }
    });
    flush(); return html;
}

// ==========================================
// INITIALIZATION & RECOVERY
// ==========================================
function checkStorageHealth() {
    try {
        let data = localStorage.getItem('foxhunt_autosave') || ""; let bytes = data.length * 2; let maxBytes = 4.5 * 1024 * 1024; 
        let percentage = (bytes / maxBytes) * 100; let bar = document.getElementById('storage-bar');
        if(bar) {
            bar.style.width = Math.min(percentage, 100) + '%';
            if (percentage > 85) { bar.className = 'h-full transition-all bg-red-500'; }
            else if (percentage > 60) { bar.className = 'h-full transition-all bg-yellow-500'; }
            else { bar.className = 'h-full transition-all bg-green-500'; }
        }
        if (percentage > 90) {
            const toast = document.getElementById('auto-save-toast'); toast.innerHTML = '<i class="ph ph-warning text-red-400"></i> แคชใกล้เต็ม!'; toast.style.background = 'rgba(185, 28, 28, 0.9)'; toast.style.opacity = '1';
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.style.background = 'rgba(0, 0, 0, 0.8)', 300); }, 3000);
        }
    } catch(e) {}
}

function startFreshProject() {
    closeModal('recovery-modal'); localStorage.removeItem('foxhunt_autosave'); document.getElementById('app-content').innerHTML = '';
    addPage('cover'); addPage('content'); setPaperSize('square'); historyStack.length = 0; historyIndex = -1; saveState(); checkStorageHealth();
}

function recoverProject() { closeModal('recovery-modal'); loadAutoSave(); checkStorageHealth(); }

function init() { 
    const saved = localStorage.getItem('foxhunt_autosave');
    if (saved && saved.trim() !== '') { openModal('recovery-modal'); } else { startFreshProject(); }

    const g = document.getElementById('emoji-grid'); g.innerHTML = ''; 
    for (const [category, list] of Object.entries(emojis)) { 
        const header = document.createElement('div'); header.className = 'emoji-category'; header.textContent = category; g.appendChild(header);
        list.forEach(e => { const b = document.createElement('div'); b.className = 'emoji-btn'; b.textContent = e; b.onclick = () => insertEmoji(e); g.appendChild(b); }); 
    } 
    
    window.addEventListener('resize', applyZoom);
    
    let typeTimer;
    document.addEventListener('input', (e) => { 
        if(e.target.isContentEditable) { triggerAutoSave(); clearTimeout(typeTimer); typeTimer = setTimeout(() => { saveState(); }, 1500); } 
    });

    document.addEventListener('paste', function(e) {
        if (e.target.isContentEditable || e.target.closest('.content-editable-area')) {
            e.preventDefault(); let text = (e.originalEvent || e).clipboardData.getData('text/plain'); document.execCommand('insertText', false, text); triggerAutoSave(); saveState();
        }
    });

    document.addEventListener('change', function(e) {
        if (e.target.type === 'checkbox') {
            if (e.target.checked) e.target.setAttribute('checked', 'checked'); else e.target.removeAttribute('checked'); triggerAutoSave(); saveState();
        }
    });
    
    setTimeout(updatePageNumbersControls, 100);
    
    document.getElementById('fontNameSelect').addEventListener('change', function() { formatDoc('fontName', this.value); });
    document.getElementById('fontSizeSelect').addEventListener('change', function() { formatDoc('fontSize', this.value); });
}

window.onload = init;