/**
 * First message + alternate greetings: export to clipboard / import from clipboard.
 * For external 汉化 (e.g. Grok) then paste back. No AI translate here.
 */

const LOG = '[开场导入导出]';
const VERSION = '1.4.3';
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
        return {
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
        return {
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

    return {
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

async function readClipboard() {
    if (navigator.clipboard?.readText) {
        return await navigator.clipboard.readText();
    }
    throw new Error('当前环境无法读取剪贴板，请检查权限');
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
    await copyText(packFirst(b.first));
    toastr?.success?.('主开场已复制（纯文本，无标记）', '开场导入导出');
    return { ok: true };
}

export async function importFirstMes() {
    const raw = await readClipboard();
    const text = unpackFirst(raw);
    if (!String(text).trim()) {
        toastr?.info?.('解析后内容为空', '开场导入导出');
        return { ok: false };
    }
    if (!confirm('用剪贴板内容覆盖「第一条消息 / 主开场」？')) return { ok: false, reason: 'cancelled' };
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
    await copyText(packAlts(alts));
    toastr?.success?.(`已复制 ${alts.length} 条候选开场到剪贴板`, '开场导入导出');
    return { ok: true, count: alts.length };
}

export async function importAltGreetings() {
    const raw = await readClipboard();
    const alts = unpackAlts(raw);
    if (!confirm(`用剪贴板覆盖候选开场（共 ${alts.length} 条）？`)) {
        return { ok: false, reason: 'cancelled' };
    }
    resolveBundle().writeAlts(alts);
    toastr?.success?.(`已导入 ${alts.length} 条候选开场（请保存角色卡）`, '开场导入导出');
    return { ok: true, count: alts.length };
}

export async function exportOneAlt(index) {
    const nodes = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text');
    const el = nodes[index];
    const text = el ? String(el.value ?? '') : String(resolveBundle().alts[index] ?? '');
    if (!text.trim()) {
        toastr?.info?.('这条候选开场是空的', '开场导入导出');
        return { ok: false };
    }
    await copyText(packAlts([text]));
    toastr?.success?.(`候选 #${index + 1} 已复制（单条格式）`, '开场导入导出');
    return { ok: true };
}

export async function importOneAlt(index) {
    const raw = await readClipboard();
    let text;
    try {
        const arr = unpackAlts(raw);
        text = arr.length === 1 ? arr[0] : (arr[index] ?? arr[0]);
    } catch (_) {
        text = unpackFirst(raw);
    }
    if (!String(text).trim()) {
        toastr?.info?.('剪贴板内容为空', '开场导入导出');
        return { ok: false };
    }
    if (!confirm(`用剪贴板覆盖候选开场 #${index + 1}？`)) return { ok: false, reason: 'cancelled' };
    const nodes = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text');
    if (nodes[index]) setVal(nodes[index], text);
    const b = resolveBundle();
    const alts = [...(b.alts || [])];
    while (alts.length <= index) alts.push('');
    alts[index] = text;
    b.writeAlts(alts);
    toastr?.success?.(`已导入候选 #${index + 1}（请保存角色卡）`, '开场导入导出');
    return { ok: true };
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
    bar.appendChild(makeBtn(FIRST_EXPORT_ID, '导出开场', '复制主开场到剪贴板', () => exportFirstMes()));
    bar.appendChild(makeBtn(FIRST_IMPORT_ID, '导入开场', '用剪贴板覆盖主开场', () => importFirstMes(), 'st-mk-gio-import'));
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
    if (!document.getElementById(FIRST_EXPORT_ID) || !document.getElementById(FIRST_IMPORT_ID) || bar.childElementCount < 2) {
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
        '.popup:not(.displayNone) .alternate_grettings .title_restorable, .popup .alternate_grettings .title_restorable, dialog .alternate_grettings .title_restorable, .popup .alternate_greetings .title_restorable',
    );
    if (!title) return false;
    let exp = document.getElementById(ALT_EXPORT_ID);
    let imp = document.getElementById(ALT_IMPORT_ID);
    if (!exp || !imp) {
        exp?.remove();
        imp?.remove();
        exp = makeBtn(ALT_EXPORT_ID, '导出候选', '复制全部候选开场到剪贴板', () => exportAltGreetings());
        imp = makeBtn(ALT_IMPORT_ID, '导入候选', '用剪贴板覆盖全部候选开场', () => importAltGreetings(), 'st-mk-gio-import');
        const add = title.querySelector('.add_alternate_greeting');
        if (add) {
            title.insertBefore(exp, add);
            title.insertBefore(imp, add);
        } else {
            title.appendChild(exp);
            title.appendChild(imp);
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
