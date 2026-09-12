/**
 * Module: First Message + Alternate Greetings → Simplified Chinese via user's AI.
 * Zero static imports from ST core. Uses SillyTavern.getContext() at runtime.
 * v1.4.1 — no edit-page inject (clipboard IO takes over), floating FAB, character-data translate path.
 */

const LOG = '[首条汉化]';
const VERSION = '1.4.2';
const BTN_ID = 'st_mk_first_mes_zh';
const ALT_BTN_ID = 'st_mk_alt_greetings_zh';
const RESTORE_BTN_ID = 'st_mk_first_mes_zh_restore';
const ALT_RESTORE_BTN_ID = 'st_mk_alt_greetings_zh_restore';
const FAB_ID = 'st_mk_fmzh_fab';
const STYLE_ID = 'st_mk_fmzh_style';

const SYSTEM_PROMPT = `你是机器翻译器，不是聊天助手，也不是分析师。

任务：把用户消息里的角色卡开场白（First Message / Alternate Greeting）译成通顺的简体中文。

绝对禁止输出：
- 任何思考过程、推理、分析、自评（包括：翻译思考记录、Paragraph、I realized、硬性规则复述、中英对照说明）
- 前言、后记、「译文：」「翻译输出」「如下：」、标题、清单、代码块围栏
- <think> / <reasoning> 标签及其内容

必须遵守：
1. 所有 {{宏}}（如 {{user}}、{{char}}）原样保留，不翻译、不改写、不删。
2. 占位符 ⟦§数字§⟧ 必须原样保留。
3. 保留原文的 markdown / HTML / 引号 / 换行 / 叙事口吻与人称。
4. 回复里只能出现最终中文译文正文。

再次强调：不要解释你怎么译的。只输出译文。`;

function getCtx() {
    try {
        if (globalThis.SillyTavern?.getContext) return globalThis.SillyTavern.getContext();
    } catch (_) { /* ignore */ }
    try {
        if (typeof getContext === 'function') return getContext();
    } catch (_) { /* ignore */ }
    return null;
}

function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BTN_ID}, #${ALT_BTN_ID}, #${RESTORE_BTN_ID}, #${ALT_RESTORE_BTN_ID} {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        visibility: visible !important;
        opacity: 1 !important;
        z-index: 50 !important;
        margin: 4px 6px 4px 0 !important;
        padding: 6px 10px !important;
        border-radius: 8px !important;
        border: 1px solid rgba(245,158,11,.55) !important;
        background: rgba(245,158,11,.18) !important;
        color: var(--SmartThemeBodyColor, #eee) !important;
        cursor: pointer !important;
        font-weight: 600 !important;
        white-space: nowrap !important;
      }
      #${BTN_ID}.st-mk-fmzh-busy, #${ALT_BTN_ID}.st-mk-fmzh-busy, #${RESTORE_BTN_ID}.st-mk-fmzh-busy, #${ALT_RESTORE_BTN_ID}.st-mk-fmzh-busy, #${FAB_ID}.st-mk-fmzh-busy {
        opacity: .5 !important;
        pointer-events: none !important;
      }
      #st_mk_fmzh_wrap {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        gap: 6px !important;
        width: 100% !important;
        margin: 6px 0 !important;
      }
      #${FAB_ID} {
        position: fixed !important;
        right: 18px !important;
        bottom: 88px !important;
        z-index: 2147483000 !important;
        display: none;
        align-items: center !important;
        gap: 8px !important;
        padding: 10px 14px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(245,158,11,.7) !important;
        background: rgba(20,20,24,.92) !important;
        color: #fbbf24 !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.45) !important;
        cursor: pointer !important;
        font-weight: 700 !important;
        font-size: 14px !important;
      }
      #${FAB_ID}.st-mk-fmzh-fab-show {
        display: inline-flex !important;
      }
      #${RESTORE_BTN_ID}, #${ALT_RESTORE_BTN_ID} {
        border-color: rgba(96,165,250,.55) !important;
        background: rgba(96,165,250,.16) !important;
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

function shieldMacros(text) {
    const macros = [];
    const shielded = String(text).replace(/\{\{[\s\S]*?\}\}/g, (m) => {
        macros.push(m);
        return `⟦§${macros.length - 1}§⟧`;
    });
    return { shielded, macros };
}

function restoreMacros(text, macros) {
    return String(text ?? '').replace(/⟦§(\d+)§⟧/g, (_, n) => {
        const i = Number(n);
        return Number.isFinite(i) && macros[i] !== undefined ? macros[i] : _;
    });
}

function stripChrome(text) {
    let t = String(text ?? '').trim();
    t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    t = t.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
    t = t.replace(/<\/?think>/gi, '').trim();
    t = t.replace(/^[\s\S]*?(?:最终译文|最终结果|译文正文)\s*[:：]\s*/i, '').trim();
    if (t.startsWith('```')) t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    t = t.replace(/^(译文|翻译结果|Translation|中文译文|翻译输出)\s*[:：]?\s*/i, '').trim();
    t = t.replace(/^\*{0,2}\s*翻译输出\s*\*{0,2}\s*[:：]?\s*/im, '').trim();
    t = t.replace(/^#+\s*翻译输出\s*[:：]?\s*/im, '').trim();
    // Keep stripping a lone first-line label like **翻译输出**
    t = t.replace(/^\*\*翻译输出\*\*\s*/m, '').trim();
    if (/^(翻译思考|Paragraph\s*\d|I realized|硬性规则)/i.test(t)) {
        const parts = t.split(/\n{2,}/);
        const kept = parts.filter((block) => !/^(翻译思考|Paragraph\s*\d|I realized|硬性规则|Here is|以下是)/i.test(block.trim()));
        if (kept.length) t = kept.join('\n\n').trim();
    }
    return t;
}

function looksLikeReasoningDump(text) {
    const s = String(text ?? '');
    if (!s.trim()) return true;
    if (/翻译思考记录/.test(s)) return true;
    if (/Paragraph\s*\d/i.test(s) && /I realized/i.test(s)) return true;
    const hits = [
        /翻译思考记录/,
        /Paragraph\s*\d/i,
        /\bI realized\b/i,
        /硬性规则/,
        /最终只输出/,
        /翻译过程/,
    ].filter((re) => re.test(s)).length;
    return hits >= 2;
}

function looksMostlyChinese(text) {
    const s = String(text).replace(/\{\{[\s\S]*?\}\}/g, '').replace(/\s+/g, '');
    if (!s) return false;
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    return cjk / s.length >= 0.35;
}

async function translateWithAi(text) {
    const ctx = getCtx();
    if (!ctx?.generateRaw) throw new Error('找不到 generateRaw（SillyTavern.getContext）');
    if (ctx.onlineStatus === 'no_connection') throw new Error('API 未连接');

    const { shielded, macros } = shieldMacros(text);
    const responseLength = Math.min(4000, Math.max(300, Math.ceil(shielded.length * 1.2)));
    const userPrompt = '只输出简体中文译文正文，不要任何思考或说明。\n\n' + shielded;

    async function once(extraSystem) {
        const raw = await ctx.generateRaw({
            prompt: userPrompt,
            systemPrompt: extraSystem ? (SYSTEM_PROMPT + '\n\n' + extraSystem) : SYSTEM_PROMPT,
            responseLength,
        });
        if (raw == null || !String(raw).trim()) throw new Error('模型返回为空');
        return restoreMacros(stripChrome(raw), macros);
    }

    let out = await once('');
    if (looksLikeReasoningDump(out)) {
        console.warn(LOG, 'reasoning dump detected, retrying once');
        out = await once('上一次你输出了思考过程。这次只准输出开场白译文，一个字的解释都不要。');
    }
    if (looksLikeReasoningDump(out)) {
        throw new Error('模型仍在输出思考过程而非译文，请换模型或重试');
    }
    return out;
}

/** Last pre-translate snapshot for 复原 */
let lastSnapshot = null;

function takeSnapshot(bundle, altJobs) {
    const alts = [];
    if (altJobs && altJobs.length) {
        altJobs.forEach((j) => { alts[j.index] = j.text; });
    } else if (bundle && Array.isArray(bundle.alts)) {
        bundle.alts.forEach((x, i) => { alts[i] = String(x ?? ''); });
    }
    lastSnapshot = {
        first: String(bundle && bundle.first != null ? bundle.first : ''),
        alts,
        at: Date.now(),
    };
    return lastSnapshot;
}

export function restoreLastTranslate() {
    if (!lastSnapshot) {
        toastr?.info?.('没有可复原的汉化快照（先成功汉化一次）', '开场汉化');
        return { ok: false, reason: 'empty' };
    }
    const bundle = resolveCharacterBundle();
    if (lastSnapshot.first != null) bundle.writeFirst(lastSnapshot.first);
    const maxIdx = Math.max(lastSnapshot.alts.length, (bundle.alts || []).length);
    for (let i = 0; i < maxIdx; i++) {
        if (lastSnapshot.alts[i] === undefined) continue;
        bundle.writeAlt(i, lastSnapshot.alts[i]);
    }
    toastr?.success?.('已复原到汉化前内容（记得保存角色卡）', '开场汉化');
    return { ok: true };
}

function setVal(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) window.jQuery(el).trigger('input').trigger('change');
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
    // Label-based: 第一条消息 / First message
    document.querySelectorAll('h4, h3, label, .title_restorable, .inline-drawer-header, span, div').forEach((node) => {
        const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/^(第一条消息|First message|First Message)/i.test(t) && !t.includes('第一条消息')) return;
        const root = node.closest('#first_message_div, .form_create_bottom_part, #form_create, #rm_ch_create') || node.parentElement;
        const ta = root?.querySelector?.('textarea');
        if (ta instanceof HTMLTextAreaElement && !found.includes(ta)) found.push(ta);
    });
    const visible = found.find(isVisiblyLaidOut);
    return visible || found[0] || null;
}

function resolveCharacterBundle() {
    const ctx = getCtx();
    const ta = findFirstMesTextarea();
    let ch = null;
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
        return {
            mode: 'create',
            first: String(ta?.value ?? globalThis.create_save.first_mes ?? ''),
            alts: Array.isArray(globalThis.create_save.alternate_greetings)
                ? globalThis.create_save.alternate_greetings.map(String)
                : [],
            ta,
            writeFirst(v) {
                if (globalThis.create_save) globalThis.create_save.first_mes = v;
                setVal(ta, v);
            },
            writeAlt(i, v) {
                if (!globalThis.create_save) return;
                if (!Array.isArray(globalThis.create_save.alternate_greetings)) {
                    globalThis.create_save.alternate_greetings = [];
                }
                globalThis.create_save.alternate_greetings[i] = v;
                const el = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text')[i];
                if (el) setVal(el, v);
            },
        };
    }

    if (chid != null && ctx?.characters?.[chid]) {
        ch = ctx.characters[chid];
        if (!ch.data) ch.data = {};
        if (!Array.isArray(ch.data.alternate_greetings)) ch.data.alternate_greetings = [];
        const firstFromData = ch.data.first_mes ?? ch.first_mes ?? '';
        return {
            mode: 'edit',
            chid,
            first: String(ta?.value ?? firstFromData ?? ''),
            alts: ch.data.alternate_greetings.map(String),
            ta,
            writeFirst(v) {
                ch.first_mes = v;
                ch.data.first_mes = v;
                setVal(ta, v);
            },
            writeAlt(i, v) {
                ch.data.alternate_greetings[i] = v;
                const el = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text')[i];
                if (el) setVal(el, v);
            },
        };
    }

    // Fallback: DOM / empty
    const altJobs = [];
    document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text').forEach((el, index) => {
        altJobs.push(String(el.value ?? ''));
    });
    return {
        mode: 'dom',
        first: String(ta?.value ?? ''),
        alts: altJobs,
        ta,
        writeFirst(v) { setVal(ta, v); },
        writeAlt(i, v) {
            const el = document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text')[i];
            if (el) setVal(el, v);
        },
    };
}

function collectAltJobs(bundle) {
    const jobs = [];
    document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text').forEach((el, index) => {
        const text = String(el.value ?? '');
        if (text.trim()) jobs.push({ source: 'dom', index, text, el });
    });
    if (jobs.length) return jobs;
    (bundle?.alts || []).forEach((text, index) => {
        if (String(text || '').trim()) jobs.push({ source: 'data', index, text: String(text) });
    });
    return jobs;
}

export async function runBatchTranslate({ includeFirst = true, includeAlts = true } = {}) {
    const bundle = resolveCharacterBundle();
    const altJobs = includeAlts ? collectAltJobs(bundle) : [];
    const tasks = [];
    if (includeFirst && String(bundle.first || '').trim()) {
        tasks.push({ kind: 'first', text: bundle.first });
    }
    for (const job of altJobs) tasks.push({ kind: 'alt', job, text: job.text });

    if (!tasks.length) {
        toastr?.info?.(includeAlts ? '第一条消息和候选开场都是空的' : '第一条消息是空的', '开场汉化');
        return { ok: false, reason: 'empty' };
    }
    if (looksMostlyChinese(tasks.map(t => t.text).join('\n'))) {
        if (!confirm('内容看起来已经偏中文了。仍要再用 AI 翻译一遍吗？')) {
            return { ok: false, reason: 'cancelled' };
        }
    }

    takeSnapshot(bundle, altJobs);
    setBusy(true);
    toastr?.info?.(`正在用当前 AI 汉化（${tasks.length} 段）…`, '开场汉化');
    let done = 0;
    let failed = 0;
    try {
        for (const task of tasks) {
            try {
                const out = await translateWithAi(task.text);
                if (!out?.trim()) throw new Error('空结果');
                if (task.kind === 'first') bundle.writeFirst(out);
                else if (task.job.source === 'dom') setVal(task.job.el, out);
                else bundle.writeAlt(task.job.index, out);
                done += 1;
            } catch (e) {
                failed += 1;
                console.error(LOG, e);
            }
        }
        if (done && !failed) toastr?.success?.(`已汉化 ${done} 段（请点保存角色卡）`, '开场汉化');
        else if (done) toastr?.warning?.(`完成 ${done}，失败 ${failed}`, '开场汉化');
        else toastr?.error?.('全部失败，请确认 API 已连接', '开场汉化');
        return { ok: done > 0, done, failed, mode: bundle.mode };
    } finally {
        setBusy(false);
    }
}

function setBusy(on) {
    [BTN_ID, ALT_BTN_ID, RESTORE_BTN_ID, ALT_RESTORE_BTN_ID, FAB_ID].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('st-mk-fmzh-busy', on);
        el.style.pointerEvents = on ? 'none' : '';
    });
}

function makeBtn(id, label, title, onClick, icon = 'fa-language') {
    const btn = document.createElement('div');
    btn.id = id;
    btn.className = 'menu_button menu_button_icon st-mk-fmzh-btn';
    btn.title = title;
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    btn.innerHTML = `<i class="fa-solid ${icon}"></i><span>${label}</span>`;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });
    return btn;
}

function purgeInvisibleDupes(id) {
    const nodes = [...document.querySelectorAll(`#${id}`)];
    if (nodes.length <= 1) {
        if (nodes[0] && !nodes[0].isConnected) nodes[0].remove();
        return document.getElementById(id);
    }
    let keep = nodes.find(isVisiblyLaidOut) || nodes[nodes.length - 1];
    nodes.forEach((n) => { if (n !== keep) n.remove(); });
    if (keep && !isVisiblyLaidOut(keep)) {
        keep.remove();
        return null;
    }
    return keep;
}

function editorLikelyOpen() {
    const ta = findFirstMesTextarea();
    if (ta && isVisiblyLaidOut(ta)) return true;
    const anchors = [
        '#first_message_div',
        '#form_create',
        '#rm_ch_create',
        '#character_name_pole',
        'textarea[name="first_mes"]',
    ];
    return anchors.some((sel) => {
        const el = document.querySelector(sel);
        return el && isVisiblyLaidOut(el);
    });
}


function ensureRestoreBeside(anchorBtn, restoreId, scopeLabel) {
    if (!anchorBtn || !anchorBtn.parentElement) return;
    if (document.getElementById(restoreId)) return;
    const rb = makeBtn(
        restoreId,
        '复原',
        '复原' + scopeLabel + '到上次汉化前的内容',
        () => restoreLastTranslate(),
        'fa-rotate-left',
    );
    if (anchorBtn.nextSibling) anchorBtn.parentElement.insertBefore(rb, anchorBtn.nextSibling);
    else anchorBtn.parentElement.appendChild(rb);
}

function injectMain() {
    ensureCss();
    const existingMain = purgeInvisibleDupes(BTN_ID);
    if (existingMain) {
        ensureRestoreBeside(existingMain, RESTORE_BTN_ID, '开场');
        return { ok: true, where: 'existing' };
    }

    const ta = findFirstMesTextarea();
    const btn = makeBtn(
        BTN_ID,
        '汉化开场',
        '用当前 AI 汉化第一条消息 + 全部候选开场',
        () => runBatchTranslate({ includeFirst: true, includeAlts: true }),
    );

    // A) beside 其他开场 — prefer visible
    const alts = [...document.querySelectorAll('.open_alternate_greetings, [class*="open_alternate"]')];
    const alt = alts.find(isVisiblyLaidOut) || alts[0];
    if (alt?.parentElement) {
        alt.parentElement.insertBefore(btn, alt);
        if (isVisiblyLaidOut(btn) || btn.isConnected) {
            ensureRestoreBeside(btn, RESTORE_BTN_ID, '开场');
            console.log(LOG, 'button injected before 其他开场');
            return { ok: true, where: 'beside-alt' };
        }
    }

    // B) inside #first_message_div header
    const fmDiv = document.querySelector('#first_message_div');
    if (fmDiv) {
        const header = fmDiv.querySelector('.title_restorable, .flex-container, div') || fmDiv;
        header.appendChild(btn);
        ensureRestoreBeside(btn, RESTORE_BTN_ID, '开场');
        console.log(LOG, 'button injected into #first_message_div');
        return { ok: true, where: 'first_message_div' };
    }

    // C) wrap above textarea
    if (ta?.parentElement) {
        let wrap = document.getElementById('st_mk_fmzh_wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'st_mk_fmzh_wrap';
            ta.parentElement.insertBefore(wrap, ta);
        }
        wrap.appendChild(btn);
        ensureRestoreBeside(btn, RESTORE_BTN_ID, '开场');
        console.log(LOG, 'button injected above first-mes textarea');
        return { ok: true, where: 'above-ta' };
    }

    btn.remove();
    return { ok: false, where: 'none', reason: 'no textarea / first_message_div' };
}

function injectAlt() {
    ensureCss();
    const existingAlt = purgeInvisibleDupes(ALT_BTN_ID);
    if (existingAlt) {
        ensureRestoreBeside(existingAlt, ALT_RESTORE_BTN_ID, '候选开场');
        return true;
    }
    const title = document.querySelector(
        '.popup:not(.displayNone) .alternate_grettings .title_restorable, .popup .alternate_grettings .title_restorable, dialog .alternate_grettings .title_restorable, .popup .alternate_greetings .title_restorable',
    );
    if (!title) return false;
    const add = title.querySelector('.add_alternate_greeting');
    const btn = makeBtn(
        ALT_BTN_ID,
        '全部汉化',
        '汉化弹窗内全部候选开场',
        () => runBatchTranslate({ includeFirst: false, includeAlts: true }),
    );
    if (add) title.insertBefore(btn, add);
    else title.appendChild(btn);
    ensureRestoreBeside(btn, ALT_RESTORE_BTN_ID, '候选开场');
    console.log(LOG, 'alt popup button injected');
    return true;
}

function injectFab() {
    ensureCss();
    let fab = document.getElementById(FAB_ID);
    if (!fab) {
        fab = document.createElement('div');
        fab.id = FAB_ID;
        fab.setAttribute('role', 'button');
        fab.title = '汉化当前角色第一条消息 + 候选开场（请先打开角色编辑）';
        fab.innerHTML = `<i class="fa-solid fa-language"></i><span>汉化开场</span>`;
        fab.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            runBatchTranslate({ includeFirst: true, includeAlts: true });
        });
        document.body.appendChild(fab);
    }
    const show = editorLikelyOpen();
    fab.classList.toggle('st-mk-fmzh-fab-show', show);
    return show;
}

export function diagnoseInject() {
    const ta = findFirstMesTextarea();
    const main = injectMain();
    injectAlt();
    const fabShow = injectFab();
    const btn = document.getElementById(BTN_ID);
    const info = {
        moduleVersion: VERSION,
        textareaFound: !!ta,
        textareaId: ta?.id || null,
        textareaVisible: !!(ta && isVisiblyLaidOut(ta)),
        buttonInDom: !!btn,
        buttonVisible: !!(btn && isVisiblyLaidOut(btn)),
        inject: main,
        fabVisible: fabShow,
        editorOpen: editorLikelyOpen(),
        hasGetContext: !!getCtx(),
        hasGenerateRaw: !!getCtx()?.generateRaw,
    };
    console.log(LOG, 'diagnose', info);
    return info;
}

function tick() {
    // Edit-page AI buttons disabled — use greeting-io 导出/导入 instead.
    // Settings「立即 AI 汉化」still works via runBatchTranslate export.
    try {
        [BTN_ID, ALT_BTN_ID, RESTORE_BTN_ID, ALT_RESTORE_BTN_ID, FAB_ID].forEach((id) => {
            document.getElementById(id)?.remove();
        });
        document.getElementById('st_mk_fmzh_wrap')?.remove();
    } catch (e) {
        console.warn(LOG, 'tick cleanup', e);
    }
}

let started = false;

export function initFirstMesZh() {
    ensureCss();
    if (!started) {
        started = true;
        const obs = new MutationObserver(() => tick());
        obs.observe(document.body, { childList: true, subtree: true });
        document.addEventListener('click', (e) => {
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (t.closest('.character_select, .open_alternate_greetings, #rm_button_create, #rm_button_selected, #rm_button_characters')) {
                setTimeout(tick, 100);
                setTimeout(tick, 400);
                setTimeout(tick, 1000);
            }
        }, true);
        setInterval(tick, 1000);
    }
    tick();
    console.log(LOG, `module loaded v${VERSION} (settings-only AI; edit UI off)`);
    return { ok: true, editUi: false };
}
