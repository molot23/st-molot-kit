/**
 * Module: First Message + Alternate Greetings → Simplified Chinese via user's AI.
 * Zero static imports from ST core (avoids path/export breakage on TauriTavern forks).
 * Uses SillyTavern.getContext() at runtime.
 */

const LOG = '[首条汉化]';
const VERSION = '1.3.0';
const BTN_ID = 'st_mk_first_mes_zh';
const ALT_BTN_ID = 'st_mk_alt_greetings_zh';
const STYLE_ID = 'st_mk_fmzh_style';

const SYSTEM_PROMPT = `你是专业翻译。把用户给出的角色卡开场白（First Message / Alternate Greeting）译成通顺的简体中文。

硬性规则：
1. 原样保留所有 {{宏}}（如 {{user}}、{{char}}），不要翻译、不要改写。
2. 若出现占位符 ⟦§数字§⟧，必须原样保留。
3. 保留 markdown / HTML / 引号 / 换行与叙事口吻。
4. 只输出译文本身：不要前言、不要「译文：」、不要代码块。`;

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
      #${BTN_ID}, #${ALT_BTN_ID} {
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
      #${BTN_ID}.st-mk-fmzh-busy, #${ALT_BTN_ID}.st-mk-fmzh-busy {
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
    `;
    document.head.appendChild(style);
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
    if (t.startsWith('```')) t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    t = t.replace(/^(译文|翻译结果|Translation)\s*[:：]\s*/i, '').trim();
    return t;
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
    const responseLength = Math.min(4000, Math.max(300, Math.ceil(shielded.length)));
    const raw = await ctx.generateRaw({
        prompt: shielded,
        systemPrompt: SYSTEM_PROMPT,
        responseLength,
    });
    if (raw == null || !String(raw).trim()) throw new Error('模型返回为空');
    return restoreMacros(stripChrome(raw), macros);
}

function setVal(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) window.jQuery(el).trigger('input').trigger('change');
}

function collectAltJobs() {
    const jobs = [];
    document.querySelectorAll('.alternate_greetings_list .alternate_greeting_text').forEach((el, index) => {
        const text = String(el.value ?? '');
        if (text.trim()) jobs.push({ source: 'dom', index, text, el });
    });
    if (jobs.length) return jobs;

    try {
        const ctx = getCtx();
        const chidBtn = document.querySelector('.open_alternate_greetings');
        const chid = chidBtn ? window.jQuery?.(chidBtn).data('chid') : undefined;
        let arr = null;
        if (chid === -1 && globalThis.create_save?.alternate_greetings) {
            arr = globalThis.create_save.alternate_greetings;
        } else if (chid != null && ctx?.characters?.[chid]?.data) {
            if (!Array.isArray(ctx.characters[chid].data.alternate_greetings)) {
                ctx.characters[chid].data.alternate_greetings = [];
            }
            arr = ctx.characters[chid].data.alternate_greetings;
        } else if (ctx?.characterId != null && ctx.characters?.[ctx.characterId]?.data) {
            const c = ctx.characters[ctx.characterId];
            if (!Array.isArray(c.data.alternate_greetings)) c.data.alternate_greetings = [];
            arr = c.data.alternate_greetings;
        }
        if (Array.isArray(arr)) {
            arr.forEach((text, index) => {
                if (String(text || '').trim()) jobs.push({ source: 'data', index, text: String(text), arr });
            });
        }
    } catch (e) {
        console.warn(LOG, e);
    }
    return jobs;
}

async function runBatch({ includeFirst, includeAlts }) {
    const ta = document.querySelector('#firstmessage_textarea');
    const first = ta ? String(ta.value ?? '') : '';
    const altJobs = includeAlts ? collectAltJobs() : [];
    const tasks = [];
    if (includeFirst && first.trim()) tasks.push({ kind: 'first', text: first });
    for (const job of altJobs) tasks.push({ kind: 'alt', job, text: job.text });

    if (!tasks.length) {
        toastr?.info?.(includeAlts ? '第一条消息和候选开场都是空的' : '第一条消息是空的', '开场汉化');
        return;
    }
    if (looksMostlyChinese(tasks.map(t => t.text).join('\n'))) {
        if (!confirm('内容看起来已经偏中文了。仍要再用 AI 翻译一遍吗？')) return;
    }

    setBusy(true);
    toastr?.info?.(`正在用当前 AI 汉化（${tasks.length} 段）…`, '开场汉化');
    let done = 0;
    let failed = 0;
    try {
        for (const task of tasks) {
            try {
                const out = await translateWithAi(task.text);
                if (!out?.trim()) throw new Error('空结果');
                if (task.kind === 'first') setVal(ta, out);
                else if (task.job.source === 'dom') setVal(task.job.el, out);
                else if (task.job.source === 'data' && task.job.arr) task.job.arr[task.job.index] = out;
                done += 1;
            } catch (e) {
                failed += 1;
                console.error(LOG, e);
            }
        }
        if (done && !failed) toastr?.success?.(`已汉化 ${done} 段（请保存角色卡）`, '开场汉化');
        else if (done) toastr?.warning?.(`完成 ${done}，失败 ${failed}`, '开场汉化');
        else toastr?.error?.('全部失败，请确认 API 已连接', '开场汉化');
    } finally {
        setBusy(false);
    }
}

function setBusy(on) {
    [BTN_ID, ALT_BTN_ID].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('st-mk-fmzh-busy', on);
        el.style.pointerEvents = on ? 'none' : '';
    });
}

function makeBtn(id, label, title, onClick) {
    const btn = document.createElement('div');
    btn.id = id;
    btn.className = 'menu_button menu_button_icon st-mk-fmzh-btn';
    btn.title = title;
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    btn.innerHTML = `<i class="fa-solid fa-language"></i><span>${label}</span>`;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });
    return btn;
}

function injectMain() {
    ensureCss();
    if (document.getElementById(BTN_ID)) return true;

    const ta = document.querySelector('#firstmessage_textarea');
    if (!ta) return false;

    const btn = makeBtn(
        BTN_ID,
        '汉化开场',
        '用当前 AI 汉化第一条消息 + 全部候选开场',
        () => runBatch({ includeFirst: true, includeAlts: true }),
    );

    // A) beside 其他开场
    const alt = document.querySelector('#first_message_div .open_alternate_greetings, .open_alternate_greetings');
    if (alt?.parentElement) {
        alt.parentElement.insertBefore(btn, alt);
        console.log(LOG, 'button injected before 其他开场');
        return true;
    }

    // B) wrap above textarea — impossible to miss
    let wrap = document.getElementById('st_mk_fmzh_wrap');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'st_mk_fmzh_wrap';
        ta.parentElement?.insertBefore(wrap, ta);
    }
    wrap.appendChild(btn);
    console.log(LOG, 'button injected above #firstmessage_textarea');
    return true;
}

function injectAlt() {
    ensureCss();
    if (document.getElementById(ALT_BTN_ID)) return true;
    const title = document.querySelector('.popup:not(.displayNone) .alternate_grettings .title_restorable, .popup .alternate_grettings .title_restorable, dialog .alternate_grettings .title_restorable');
    if (!title) return false;
    const add = title.querySelector('.add_alternate_greeting');
    const btn = makeBtn(
        ALT_BTN_ID,
        '全部汉化',
        '汉化弹窗内全部候选开场',
        () => runBatch({ includeFirst: false, includeAlts: true }),
    );
    if (add) title.insertBefore(btn, add);
    else title.appendChild(btn);
    console.log(LOG, 'alt popup button injected');
    return true;
}

function tick() {
    try {
        injectMain();
        injectAlt();
    } catch (e) {
        console.warn(LOG, 'tick', e);
    }
}

export function initFirstMesZh() {
    ensureCss();
    tick();
    const obs = new MutationObserver(() => tick());
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t.closest('.character_select, .open_alternate_greetings, #rm_button_create, #rm_button_selected')) {
            setTimeout(tick, 100);
            setTimeout(tick, 400);
            setTimeout(tick, 1000);
        }
    }, true);
    setInterval(tick, 1000);
    console.log(LOG, `module loaded v${VERSION} (no static ST imports)`);
    try {
        toastr?.info?.('开场汉化已就绪：打开角色编辑，看「其他开场」旁或输入框上方的「汉化开场」', '酒馆小工具', { timeOut: 5000 });
    } catch (_) { /* ignore */ }
}
