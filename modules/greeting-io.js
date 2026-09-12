/**
 * First message + alternate greetings: export to clipboard / import from clipboard.
 * For external 汉化 (e.g. Grok) then paste back. No AI translate here.
 */

const LOG = '[开场导入导出]';
const VERSION = '1.4.6';
const STYLE_ID = 'st_mk_gio_style';

const FIRST_EXPORT_ID = 'st_mk_gio_first_export';
const FIRST_IMPORT_ID = 'st_mk_gio_first_import';
const ALT_EXPORT_ID = 'st_mk_gio_alt_export';
const ALT_IMPORT_ID = 'st_mk_gio_alt_import';

const FIRST_MARK_START = '===ST_FIRST_MES_v1===';
const FIRST_MARK_END = '===END_FIRST_MES===';
const ALT_MARK_START = '===ST_ALT_GREETINGS_v1===';
const ALT_MARK_END = '===END_ALT_GREETINGS===';
const ALT_SEP = (n) => `---ALT ${n}---`;
const BACKUP_PREFIX = 'st_mk_gio_backup_v1:';
const FIRST_RESTORE_ID = 'st_mk_gio_first_restore';
const ALT_RESTORE_ID = 'st_mk_gio_alt_restore';



function cardKeyFromBundleMeta(meta) {
    if (meta?.avatar) return `avatar:${meta.avatar}`;
    if (meta?.name) return `name:${meta.name}`;
    if (meta?.chid != null && meta.chid !== '') return `chid:${meta.chid}`;
    if (meta?.createMode) return 'create_new';
    return 'unknown';
}

function readBackup(key) {
    try {
        const raw = localStorage.getItem(BACKUP_PREFIX + key);
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return null;
        return o;
    } catch (_) {
        return null;
    }
}

function writeBackup(key, payload) {
    localStorage.setItem(BACKUP_PREFIX + key, JSON.stringify(payload));
}

/** First export only — never overwrite existing original backup for this card. */
function maybeBackupOriginal(bundle) {
    const key = bundle.key || 'unknown';
    if (readBackup(key)) return { saved: false, key, reason: 'exists' };
    const first = String(bundle.first ?? '');
    let alts = Array.isArray(bundle.alts) ? bundle.alts.map(String) : [];
    const dom = [];
    document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text').forEach((el) => {
        dom.push(String(el.value ?? ''));
    });
    if (dom.length) alts = dom;
    const payload = {
        key,
        name: bundle.meta?.name || '',
        avatar: bundle.meta?.avatar || '',
        first,
        alts,
        at: Date.now(),
    };
    writeBackup(key, payload);
    console.log(LOG, 'original backup saved', key);
    return { saved: true, key };
}

export function restoreOriginalBackup() {
    const bundle = resolveBundle();
    const key = bundle.key || 'unknown';
    const snap = readBackup(key);
    if (!snap) {
        toastr?.info?.('这张卡还没有导出备份（先点一次「导出开场」）', '开场导入导出');
        return { ok: false, reason: 'empty' };
    }
    if (!confirm('还原到第一次导出时的原文？（主开场 + 候选都会覆盖，请确认后保存角色卡）')) {
        return { ok: false, reason: 'cancelled' };
    }
    if (snap.first != null) bundle.writeFirst(String(snap.first));
    if (Array.isArray(snap.alts)) bundle.writeAlts(snap.alts.map(String));
    const when = snap.at ? new Date(snap.at).toLocaleString() : '';
    toastr?.success?.(when ? `已还原首次导出备份（${when}）` : '已还原首次导出备份', '开场导入导出');
    return { ok: true, key };
}

function getCtx() {
    try {
        if (globalThis.SillyTavern?.getContext) return globalThis.SillyTavern.getContext();
    } catch (_) { /* ignore */ }
    return null;
}

function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .st-mk-gio-btn {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 50 !important;
        margin: 4px 6px 4px 0 !important;
        padding: 6px 10px !important;
        border-radius: 8px !important;
        border: 1px solid rgba(52,211,153,.55) !important;
        background: rgba(52,211,153,.16) !important;
        color: var(--SmartThemeBodyColor, #eee) !important;
        cursor: pointer !important;
        font-weight: 600 !important;
        white-space: nowrap !important;
      }
      .st-mk-gio-btn.st-mk-gio-import {
        border-color: rgba(96,165,250,.55) !important;
        background: rgba(96,165,250,.16) !important;
      }
      .st-mk-gio-btn.st-mk-gio-restore {
        border-color: rgba(251,191,36,.55) !important;
        background: rgba(251,191,36,.16) !important;
      }
      .st-mk-gio-row-btns {
        display: inline-flex !important;
        gap: 4px !important;
        margin: 4px 0 !important;
        flex-wrap: wrap !important;
      }
      .st-mk-gio-row-btns .st-mk-gio-btn {
        padding: 4px 8px !important;
        font-size: 0.85em !important;
      }
      #st_mk_gio_first_bar {
        display: inline-flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 6px !important;
        margin: 6px 0 !important;
        max-width: 100% !important;
        z-index: 60 !important;
      }
      .st-mk-gio-ta-wrap {
        position: relative !important;
      }
      #st_mk_gio_first_bar.st-mk-gio-overlay {
        position: absolute !important;
        right: 6px !important;
        bottom: 6px !important;
        margin: 0 !important;
        background: rgba(20,20,24,.88) !important;
        padding: 4px !important;
        border-radius: 10px !important;
      }
    `;
    document.head.appendChild(style);
}

function isVisiblyLaidOut(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
    return true;
}

function findFirstMesTextarea() {
    const selectors = [
        '#firstmessage_textarea',
        'textarea[name="first_mes"]',
        '#first_message_div textarea',
        'textarea[data-for="first_mes"]',
    ];
    const found = [];
    for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => {
            if (el instanceof HTMLTextAreaElement && !found.includes(el)) found.push(el);
        });
    }
    return found.find(isVisiblyLaidOut) || found[0] || null;
}

function setVal(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) window.jQuery(el).trigger('input').trigger('change');
}

function resolveBundle() {
    const ctx = getCtx();
    const ta = findFirstMesTextarea();
    let chid = null;
    let createMode = false;
    try {
        const alt = document.querySelector('.open_alternate_greetings');
        if (alt && window.jQuery) {
            const d = window.jQuery(alt).data('chid');
            if (d === -1) createMode = true;
            else if (d != null && d !== '') chid = Number(d);
        }
    } catch (_) { /* ignore */ }
    if (chid == null && ctx?.characterId != null) chid = ctx.characterId;
    if (chid == null && typeof globalThis.this_chid !== 'undefined') chid = globalThis.this_chid;

    if (createMode && globalThis.create_save) {
        if (!Array.isArray(globalThis.create_save.alternate_greetings)) {
            globalThis.create_save.alternate_greetings = [];
        }
        const meta = { createMode: true, name: String(globalThis.create_save?.name || 'new'), avatar: '', chid: -1 };
        return {
            key: cardKeyFromBundleMeta(meta),
            meta,
            first: String(ta?.value ?? globalThis.create_save.first_mes ?? ''),
            alts: Array.isArray(globalThis.create_save.alternate_greetings)
                ? globalThis.create_save.alternate_greetings.map(String)
                : [],
            writeFirst(v) {
                if (ta) setVal(ta, v);
                if (globalThis.create_save) globalThis.create_save.first_mes = v;
            },
            writeAlts(arr) {
                if (!Array.isArray(globalThis.create_save.alternate_greetings)) {
                    globalThis.create_save.alternate_greetings = [];
                }
                globalThis.create_save.alternate_greetings = arr.map(String);
                arr.forEach((v, i) => {
                    const el = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text')[i];
                    if (el) setVal(el, v);
                });
            },
        };
    }

    const characters = ctx?.characters || globalThis.characters;
    const ch = characters && chid != null ? characters[chid] : null;
    if (ch) {
        if (!ch.data) ch.data = {};
        if (!Array.isArray(ch.data.alternate_greetings)) ch.data.alternate_greetings = [];
        const firstFromData = ch.data.first_mes ?? ch.first_mes ?? '';
        const meta = {
            createMode: false,
            name: String(ch.name || ch.data?.name || ''),
            avatar: String(ch.avatar || ''),
            chid,
        };
        return {
            key: cardKeyFromBundleMeta(meta),
            meta,
            first: String(ta?.value ?? firstFromData ?? ''),
            alts: ch.data.alternate_greetings.map(String),
            writeFirst(v) {
                if (ta) setVal(ta, v);
                ch.first_mes = v;
                ch.data.first_mes = v;
            },
            writeAlts(arr) {
                ch.data.alternate_greetings = arr.map(String);
                arr.forEach((v, i) => {
                    const el = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text')[i];
                    if (el) setVal(el, v);
                });
            },
        };
    }

    const meta = { createMode: false, name: '', avatar: '', chid };
    return {
        key: cardKeyFromBundleMeta(meta),
        meta,
        first: String(ta?.value ?? ''),
        alts: [...document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text')].map((el) => String(el.value ?? '')),
        writeFirst(v) {
            if (ta) setVal(ta, v);
        },
        writeAlts(arr) {
            arr.forEach((v, i) => {
                const el = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text')[i];
                if (el) setVal(el, v);
            });
        },
    };
}

async function copyText(text) {
    const s = String(text ?? '');
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(s);
        return;
    }
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
}

function promptPasteDialog(hint) {
    return new Promise((resolve, reject) => {
        const old = document.getElementById('st_mk_gio_paste_mask');
        old?.remove();

        const mask = document.createElement('div');
        mask.id = 'st_mk_gio_paste_mask';
        mask.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:2147483647',
            'background:rgba(0,0,0,.55)', 'display:flex',
            'align-items:center', 'justify-content:center', 'padding:16px',
        ].join(';');

        const box = document.createElement('div');
        box.style.cssText = [
            'width:min(560px,96vw)', 'max-height:85vh', 'overflow:auto',
            'background:var(--SmartThemeBlurTintColor, #1e1e24)',
            'color:var(--SmartThemeBodyColor, #eee)',
            'border:1px solid rgba(255,255,255,.15)', 'border-radius:12px',
            'padding:14px', 'box-shadow:0 12px 40px rgba(0,0,0,.5)',
        ].join(';');

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700;margin-bottom:8px;font-size:15px;';
        title.textContent = '粘贴译文后点确定';

        const tip = document.createElement('div');
        tip.style.cssText = 'opacity:.8;font-size:12px;margin-bottom:8px;line-height:1.4;';
        tip.textContent = (hint || '请长按下方框粘贴') + '。点确定会直接覆盖，无需再确认。';

        const ta = document.createElement('textarea');
        ta.className = 'text_pole';
        ta.rows = 12;
        ta.placeholder = '在这里粘贴汉化后的开场…';
        ta.style.cssText = 'width:100%;min-height:180px;resize:vertical;box-sizing:border-box;';

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap;';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'menu_button';
        cancel.textContent = '取消';

        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'menu_button';
        ok.textContent = '确定并覆盖导入';
        ok.style.fontWeight = '700';

        function close() { mask.remove(); }

        cancel.addEventListener('click', () => {
            close();
            resolve(null);
        });
        mask.addEventListener('click', (e) => {
            if (e.target === mask) {
                close();
                resolve(null);
            }
        });
        ok.addEventListener('click', () => {
            const v = String(ta.value ?? '');
            if (!v.trim()) {
                toastr?.info?.('还没有粘贴内容', '开场导入导出');
                return;
            }
            close();
            resolve(v);
        });

        row.appendChild(cancel);
        row.appendChild(ok);
        box.appendChild(title);
        box.appendChild(tip);
        box.appendChild(ta);
        box.appendChild(row);
        mask.appendChild(box);
        (document.documentElement || document.body).appendChild(mask);
        setTimeout(() => {
            try { ta.focus(); } catch (_) { /* ignore */ }
        }, 50);
    });
}

/** Prefer clipboard read; on Android denial fall back to paste dialog. */
async function readClipboard(hint) {
    try {
        if (navigator.clipboard?.readText) {
            const t = await navigator.clipboard.readText();
            if (String(t ?? '').trim()) return t;
        }
    } catch (e) {
        console.warn(LOG, 'clipboard read denied, use paste dialog', e);
    }
    return promptPasteDialog(hint || '请长按输入框粘贴译文，再点确定导入');
}

function packFirst(text) {
    // Plain text only — markers confuse external 汉化 (Grok etc.)
    return String(text ?? '');
}

function unpackFirst(raw) {
    let s = String(raw ?? '');
    // Drop accidental UI / old marker chrome
    s = s.replace(/^translate-to-chinese skill\s*/i, '').trim();
    const m = s.match(new RegExp(`${FIRST_MARK_START}\\r?\\n([\\s\\S]*?)\\r?\\n${FIRST_MARK_END}`));
    if (m) return m[1];
    s = s.replace(new RegExp(`^\\s*${FIRST_MARK_START}\\s*`, 'm'), '');
    s = s.replace(new RegExp(`\\s*${FIRST_MARK_END}\\s*$`, 'm'), '');
    if (s.includes(ALT_MARK_START) || /【候选\s*\d+】/.test(s)) {
        throw new Error('剪贴板像是「候选开场」导出，请用候选区的导入按钮');
    }
    return s.trim();
}

function packAlts(alts) {
    // Human-readable separators for multi-alt; single alt = plain body only
    const list = (alts || []).map((x) => String(x ?? ''));
    if (list.length <= 1) return list[0] || '';
    return list.map((text, i) => `【候选${i + 1}】\n${text}`).join('\n\n');
}

function unpackAlts(raw) {
    let s = String(raw ?? '').trim();
    if (!s) throw new Error('剪贴板为空');
    // strip accidental chrome
    s = s.replace(/^translate-to-chinese skill\s*/i, '').trim();
    s = s.replace(new RegExp(`^${FIRST_MARK_START}\\s*`, 'm'), '').replace(new RegExp(`${FIRST_MARK_END}\\s*$`, 'm'), '').trim();

    if (s.includes(FIRST_MARK_START) && !s.includes(ALT_MARK_START) && !/【候选\s*\d+】/.test(s)) {
        throw new Error('剪贴板像是「主开场」导出，请用主开场的导入按钮');
    }

    // New: 【候选N】
    if (/【候选\s*\d+】/.test(s)) {
        const parts = s.split(/【候选\s*(\d+)】/);
        const map = new Map();
        for (let i = 1; i + 1 < parts.length; i += 2) {
            const idx = Number(parts[i]) - 1;
            const text = String(parts[i + 1] ?? '').replace(/^\n+/, '').replace(/\n+$/, '');
            if (Number.isFinite(idx) && idx >= 0) map.set(idx, text);
        }
        if (map.size) {
            const max = Math.max(...map.keys());
            const arr = [];
            for (let i = 0; i <= max; i++) arr.push(map.has(i) ? map.get(i) : '');
            return arr;
        }
    }

    // Legacy marked format
    if (s.includes(ALT_MARK_START)) {
        const body = s.split(ALT_MARK_START)[1]?.split(ALT_MARK_END)[0] ?? '';
        const parts = body.split(/---ALT\s+(\d+)---/);
        const map = new Map();
        for (let i = 1; i + 1 < parts.length; i += 2) {
            const idx = Number(parts[i]) - 1;
            const text = String(parts[i + 1] ?? '').replace(/^\n/, '').replace(/\n$/, '');
            if (Number.isFinite(idx) && idx >= 0) map.set(idx, text);
        }
        if (!map.size) throw new Error('未能解析候选开场导出格式');
        const max = Math.max(...map.keys());
        const arr = [];
        for (let i = 0; i <= max; i++) arr.push(map.has(i) ? map.get(i) : '');
        return arr;
    }

    // Plain single block
    return [s];
}

export async function exportFirstMes() {
    const b = resolveBundle();
    if (!String(b.first || '').trim()) {
        toastr?.info?.('主开场是空的', '开场导入导出');
        return { ok: false };
    }
    const bak = maybeBackupOriginal(b);
    await copyText(packFirst(b.first));
    toastr?.success?.(
        bak.saved ? '主开场已复制，并已备份原文（可点「还原」）' : '主开场已复制（纯文本）',
        '开场导入导出',
    );
    return { ok: true, backup: bak };
}

export async function importFirstMes() {
    const raw = await readClipboard('把汉化后的「主开场」粘贴到下方（长按粘贴）');
    if (raw == null) return { ok: false, reason: 'cancelled' };
    const text = unpackFirst(raw);
    if (!String(text).trim()) {
        toastr?.info?.('解析后内容为空', '开场导入导出');
        return { ok: false };
    }
    // No window.confirm — Android/WebView often blocks it after paste dialog
    resolveBundle().writeFirst(text);
    toastr?.success?.('已导入主开场（请保存角色卡）', '开场导入导出');
    return { ok: true };
}

export async function exportAltGreetings() {
    const b = resolveBundle();
    const dom = [];
    document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text').forEach((el) => {
        dom.push(String(el.value ?? ''));
    });
    const alts = dom.length ? dom : (b.alts || []);
    if (!alts.length || !alts.some((x) => String(x).trim())) {
        toastr?.info?.('没有候选开场可导出', '开场导入导出');
        return { ok: false };
    }
    // Prefer live alts for backup snapshot
    const snapBundle = { ...b, alts };
    const bak = maybeBackupOriginal(snapBundle);
    await copyText(packAlts(alts));
    toastr?.success?.(
        bak.saved ? `已复制 ${alts.length} 条候选，并备份原文` : `已复制 ${alts.length} 条候选开场`,
        '开场导入导出',
    );
    return { ok: true, count: alts.length, backup: bak };
}

export async function importAltGreetings() {
    toastr?.info?.('打开粘贴框…', '开场导入导出', { timeOut: 1500 });
    const raw = await readClipboard('把汉化后的「候选开场」粘贴到下方（多条可用【候选N】分隔）');
    if (raw == null) return { ok: false, reason: 'cancelled' };
    const alts = unpackAlts(raw);
    if (!alts.length || !alts.some((x) => String(x).trim())) {
        toastr?.info?.('解析后没有可用的候选开场', '开场导入导出');
        return { ok: false };
    }
    const written = await writeAltsRobust(alts);
    toastr?.success?.(
        `已导入 ${written} 条候选开场（请保存角色卡）`,
        '开场导入导出',
    );
    return { ok: true, count: alts.length };
}

export async function exportOneAlt(index) {
    const b = resolveBundle();
    const nodes = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text');
    const el = nodes[index];
    const text = el ? String(el.value ?? '') : String(b.alts[index] ?? '');
    if (!text.trim()) {
        toastr?.info?.('这条候选开场是空的', '开场导入导出');
        return { ok: false };
    }
    maybeBackupOriginal(b);
    await copyText(packAlts([text]));
    toastr?.success?.(`候选 #${index + 1} 已复制`, '开场导入导出');
    return { ok: true };
}

export async function importOneAlt(index) {
    const raw = await readClipboard(`把候选 #${index + 1} 的译文粘贴到下方`);
    if (raw == null) return { ok: false, reason: 'cancelled' };
    let text;
    try {
        const arr = unpackAlts(raw);
        text = arr.length === 1 ? arr[0] : (arr[index] ?? arr[0]);
    } catch (_) {
        text = unpackFirst(raw);
    }
    if (!String(text).trim()) {
        toastr?.info?.('内容为空', '开场导入导出');
        return { ok: false };
    }
    const b = resolveBundle();
    const alts = [...(b.alts || [])];
    // Prefer live DOM length
    const domLen = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text').length;
    const baseLen = Math.max(alts.length, domLen, index + 1);
    while (alts.length < baseLen) alts.push('');
    for (let i = 0; i < baseLen; i++) {
        if (alts[i] === undefined || alts[i] === '') {
            const el = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text')[i];
            if (el) alts[i] = String(el.value ?? '');
        }
    }
    alts[index] = text;
    await writeAltsRobust(alts);
    toastr?.success?.(`已导入候选 #${index + 1}（请保存角色卡）`, '开场导入导出');
    return { ok: true };
}


function getAltTextareas() {
    return [...document.querySelectorAll(
        '.alternate_greetings_list .alternate_greeting_text, .alternate_grettings .alternate_greeting_text, textarea.alternate_greeting_text',
    )];
}

function getAddAltButton() {
    return document.querySelector(
        '.popup:not(.displayNone) .add_alternate_greeting, dialog .add_alternate_greeting, .alternate_grettings .add_alternate_greeting, .alternate_greetings .add_alternate_greeting, .add_alternate_greeting',
    );
}

async function ensureAltSlotCount(need) {
    let nodes = getAltTextareas();
    let guard = 0;
    while (nodes.length < need && guard < 40) {
        guard += 1;
        const add = getAddAltButton();
        if (!add) break;
        add.click();
        await new Promise((r) => setTimeout(r, 80));
        nodes = getAltTextareas();
    }
    return getAltTextareas();
}

/** Write alts to character data + live popup textareas (create missing rows). */
async function writeAltsRobust(alts) {
    const list = (alts || []).map((x) => String(x ?? ''));
    const b = resolveBundle();
    // Data first
    try { b.writeAlts(list); } catch (e) { console.warn(LOG, 'writeAlts data', e); }

    const nodes = await ensureAltSlotCount(list.length);
    list.forEach((text, i) => {
        if (nodes[i]) setVal(nodes[i], text);
    });
    // Sync data again after DOM grow
    try { b.writeAlts(list); } catch (_) { /* ignore */ }

    // If popup closed / no DOM, still OK if data written
    const visible = getAltTextareas().filter((el) => String(el.value ?? '').trim()).length;
    console.log(LOG, 'writeAltsRobust', { want: list.length, dom: nodes.length, visible });
    return list.length;
}

function makeBtn(id, label, title, onClick, extraClass = '') {
    const btn = document.createElement('div');
    if (id) btn.id = id;
    btn.className = `menu_button menu_button_icon st-mk-gio-btn ${extraClass}`.trim();
    btn.title = title;
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    btn.innerHTML = `<span>${label}</span>`;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        Promise.resolve(onClick()).catch((err) => {
            console.error(LOG, err);
            toastr?.error?.(String(err?.message || err), '开场导入导出');
        });
    });
    return btn;
}

function purgeAiTranslateButtons() {
    ['st_mk_first_mes_zh', 'st_mk_alt_greetings_zh', 'st_mk_first_mes_zh_restore', 'st_mk_alt_greetings_zh_restore', 'st_mk_fmzh_fab'].forEach((id) => {
        document.getElementById(id)?.remove();
    });
    document.getElementById('st_mk_fmzh_wrap')?.remove();
}

function ensureFirstBar() {
    let bar = document.getElementById('st_mk_gio_first_bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'st_mk_gio_first_bar';
        bar.className = 'st-mk-gio-row-btns';
    }
    return bar;
}

function fillFirstBar(bar) {
    bar.innerHTML = '';
    bar.appendChild(makeBtn(FIRST_EXPORT_ID, '导出开场', '复制主开场到剪贴板（首次导出自动备份原文）', () => exportFirstMes()));
    bar.appendChild(makeBtn(FIRST_IMPORT_ID, '导入开场', '用剪贴板覆盖主开场', () => importFirstMes(), 'st-mk-gio-import'));
    bar.appendChild(makeBtn(FIRST_RESTORE_ID, '还原', '还原到本卡第一次导出时的原文', () => restoreOriginalBackup(), 'st-mk-gio-restore'));
}

function placeNearFirstMes(bar) {
    const alts = [...document.querySelectorAll('.open_alternate_greetings, [class*="open_alternate"]')];
    const alt = alts.find(isVisiblyLaidOut) || alts[0];
    if (alt?.parentElement) {
        if (bar.parentElement !== alt.parentElement || bar.nextSibling !== alt) {
            alt.parentElement.insertBefore(bar, alt);
        }
        bar.classList.remove('st-mk-gio-overlay');
        if (bar.isConnected) return 'beside-alt';
    }
    const fmDiv = document.querySelector('#first_message_div');
    if (fmDiv) {
        const header = fmDiv.querySelector('.title_restorable, .flex-container') || fmDiv;
        if (!header.contains(bar)) header.appendChild(bar);
        bar.classList.remove('st-mk-gio-overlay');
        if (bar.isConnected) return 'first_message_div';
    }
    const ta = findFirstMesTextarea();
    if (ta?.parentElement) {
        const parent = ta.parentElement;
        parent.classList.add('st-mk-gio-ta-wrap');
        if (!parent.contains(bar)) parent.insertBefore(bar, ta);
        bar.classList.add('st-mk-gio-overlay');
        if (bar.isConnected) return 'above-ta';
    }
    return null;
}

function injectFirstButtons() {
    ensureCss();
    purgeAiTranslateButtons();
    const bar = ensureFirstBar();
    if (!document.getElementById(FIRST_EXPORT_ID) || !document.getElementById(FIRST_IMPORT_ID) || !document.getElementById(FIRST_RESTORE_ID) || bar.childElementCount < 3) {
        fillFirstBar(bar);
    }
    return !!placeNearFirstMes(bar);
}

function injectPerAltButtons() {
    const texts = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text');
    texts.forEach((ta, index) => {
        const parent = ta.closest('.alternate_greeting') || ta.parentElement;
        if (!parent) return;
        if (parent.querySelector(`.st-mk-gio-alt-${index}`)) return;
        const row = document.createElement('div');
        row.className = `st-mk-gio-row-btns st-mk-gio-alt-${index}`;
        row.appendChild(makeBtn(null, '导出', `复制候选 #${index + 1}`, () => exportOneAlt(index)));
        row.appendChild(makeBtn(null, '导入', `覆盖候选 #${index + 1}`, () => importOneAlt(index), 'st-mk-gio-import'));
        ta.parentElement?.insertBefore(row, ta);
    });
}

function injectAltHeaderButtons() {
    ensureCss();
    const title = document.querySelector(
        '.popup:not(.displayNone) .alternate_grettings .title_restorable, .popup:not(.displayNone) .alternate_greetings .title_restorable, dialog:not([hidden]) .alternate_grettings .title_restorable, dialog .alternate_greetings .title_restorable, .popup .alternate_grettings .title_restorable, .popup .alternate_greetings .title_restorable',
    );
    if (!title) return false;

    if (!title.contains(document.getElementById(ALT_EXPORT_ID))
        || !title.contains(document.getElementById(ALT_IMPORT_ID))
        || !title.contains(document.getElementById(ALT_RESTORE_ID))) {
        document.getElementById(ALT_EXPORT_ID)?.remove();
        document.getElementById(ALT_IMPORT_ID)?.remove();
        document.getElementById(ALT_RESTORE_ID)?.remove();
        const exp = makeBtn(ALT_EXPORT_ID, '导出候选', '复制全部候选开场到剪贴板（首次导出自动备份）', () => exportAltGreetings());
        const imp = makeBtn(ALT_IMPORT_ID, '导入候选', '粘贴并覆盖全部候选开场', () => importAltGreetings(), 'st-mk-gio-import');
        const rst = makeBtn(ALT_RESTORE_ID, '还原', '还原到本卡第一次导出时的原文', () => restoreOriginalBackup(), 'st-mk-gio-restore');
        const add = title.querySelector('.add_alternate_greeting');
        if (add) {
            title.insertBefore(exp, add);
            title.insertBefore(imp, add);
            title.insertBefore(rst, add);
        } else {
            title.appendChild(exp);
            title.appendChild(imp);
            title.appendChild(rst);
        }
    }
    document.getElementById('st_mk_alt_greetings_zh')?.remove();
    document.getElementById('st_mk_alt_greetings_zh_restore')?.remove();
    injectPerAltButtons();
    return true;
}

function tick() {
    try {
        injectFirstButtons();
        injectAltHeaderButtons();
    } catch (e) {
        console.warn(LOG, e);
    }
}

let started = false;

export function initGreetingIo() {
    ensureCss();
    tick();
    if (!started) {
        started = true;
        const obs = new MutationObserver(() => tick());
        obs.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('click', (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (t.closest('.open_alternate_greetings, .character_select, #rm_button_selected, #rm_button_create, #rm_button_characters')) {
                setTimeout(tick, 100);
                setTimeout(tick, 400);
                setTimeout(tick, 1000);
            }
        }, true);
        setInterval(tick, 1500);
    }
    console.log(LOG, `module loaded v${VERSION}`);
}
