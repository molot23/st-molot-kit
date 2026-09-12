/**
 * Module: one-click Simplified Chinese for First Message + Alternate Greetings
 * Uses the user's currently connected SillyTavern AI (generateRaw via getContext).
 */

import { getContext } from '../../../../extensions.js';

const LOG = '[首条汉化]';
const VERSION = '1.2.0';
const BTN_ID = 'st_mk_first_mes_zh';
const ALT_BTN_ID = 'st_mk_alt_greetings_zh';
const BAR_ID = 'st_mk_fmzh_bar';

const SYSTEM_PROMPT = `你是专业翻译。把用户给出的角色卡开场白（First Message / Alternate Greeting）译成通顺的简体中文。

硬性规则：
1. 原样保留所有 {{宏}}（如 {{user}}、{{char}}），不要翻译、不要改写、不要加空格破坏。
2. 若文本中出现占位符 ⟦§数字§⟧，必须原样保留。
3. 保留 markdown / HTML / 引号 / 换行与叙事口吻。
4. 只输出译文本身：不要前言、不要「译文：」、不要用代码块包裹。`;

function shieldMacros(text) {
    const macros = [];
    const shielded = String(text).replace(/\{\{[\s\S]*?\}\}/g, (m) => {
        const i = macros.length;
        macros.push(m);
        return `⟦§${i}§⟧`;
    });
    return { shielded, macros };
}

function restoreMacros(text, macros) {
    let out = String(text ?? '');
    out = out.replace(/⟦§(\d+)§⟧/g, (_, n) => {
        const i = Number(n);
        return Number.isFinite(i) && macros[i] !== undefined ? macros[i] : _;
    });
    out = out.replace(/\[\[§(\d+)§\]\]/g, (_, n) => {
        const i = Number(n);
        return Number.isFinite(i) && macros[i] !== undefined ? macros[i] : _;
    });
    return out;
}

function stripModelChrome(text) {
    let t = String(text ?? '').trim();
    t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    t = t.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
    if (t.startsWith('```')) {
        t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }
    t = t.replace(/^(译文|翻译结果|Translation)\s*[:：]\s*/i, '').trim();
    return t;
}

function looksMostlyChinese(text) {
    const s = String(text).replace(/\{\{[\s\S]*?\}\}/g, '').replace(/\s+/g, '');
    if (!s) return false;
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    return cjk / s.length >= 0.35;
}

function getGenerateRaw() {
    const ctx = getContext();
    if (typeof ctx?.generateRaw === 'function') return ctx.generateRaw.bind(ctx);
    // fallback named import path may not exist on some forks
    throw new Error('当前酒馆版本没有 generateRaw，无法用 AI 翻译');
}

function assertConnected() {
    const ctx = getContext();
    const status = ctx?.onlineStatus ?? window.online_status;
    if (status === 'no_connection' || status == null || status === '') {
        // some builds leave onlineStatus undefined while still connected — only hard-fail on explicit no_connection
        if (status === 'no_connection') {
            throw new Error('当前未连接 API。请先在插头页连上模型。');
        }
    }
}

async function translateWithAi(text) {
    assertConnected();
    const generateRaw = getGenerateRaw();
    const { shielded, macros } = shieldMacros(text);
    const approxTokens = Math.ceil(shielded.length / 2);
    const responseLength = Math.min(4000, Math.max(300, approxTokens * 2));

    const raw = await generateRaw({
        prompt: shielded,
        systemPrompt: SYSTEM_PROMPT,
        responseLength,
    });

    if (raw == null || String(raw).trim() === '') {
        throw new Error('模型没有返回内容');
    }
    return restoreMacros(stripModelChrome(raw), macros);
}

function setTextareaValue($ta, value) {
    $ta.val(value).trigger('input').trigger('change');
    try {
        $ta[0].dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) { /* ignore */ }
}

/** Collect alternate greeting strings from open popup and/or character data. */
function collectAlternateJobs() {
    /** @type {{ source: 'dom'|'data', index: number, text: string, $el?: JQuery }[]} */
    const jobs = [];

    const $doms = $('.alternate_greetings_list .alternate_greeting_text');
    if ($doms.length) {
        $doms.each(function (index) {
            const text = String($(this).val() ?? '');
            if (text.trim()) jobs.push({ source: 'dom', index, text, $el: $(this) });
        });
        return jobs;
    }

    // Popup closed: still translate stored array so next open shows Chinese
    try {
        const chid = $('.open_alternate_greetings').first().data('chid');
        const ctx = getContext();
        let arr = null;
        if (chid === -1 && window.create_save?.alternate_greetings) {
            arr = window.create_save.alternate_greetings;
        } else if (chid !== undefined && ctx?.characters?.[chid]?.data) {
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
                if (String(text || '').trim()) {
                    jobs.push({ source: 'data', index, text: String(text) });
                }
            });
        }
    } catch (e) {
        console.warn(LOG, 'collect alt greetings failed', e);
    }
    return jobs;
}

function writeAlternateResult(job, translated, dataArrRef) {
    if (job.source === 'dom' && job.$el?.length) {
        setTextareaValue(job.$el, translated);
        return;
    }
    if (job.source === 'data' && Array.isArray(dataArrRef)) {
        dataArrRef[job.index] = translated;
    }
}

function resolveDataArrayRef() {
    const chid = $('.open_alternate_greetings').first().data('chid');
    const ctx = getContext();
    if (chid === -1 && window.create_save?.alternate_greetings) {
        return window.create_save.alternate_greetings;
    }
    if (chid !== undefined && ctx?.characters?.[chid]?.data?.alternate_greetings) {
        return ctx.characters[chid].data.alternate_greetings;
    }
    if (ctx?.characterId != null && ctx.characters?.[ctx.characterId]?.data?.alternate_greetings) {
        return ctx.characters[ctx.characterId].data.alternate_greetings;
    }
    return null;
}

async function runBatchTranslate({ includeFirst, includeAlts }) {
    const $ta = $('#firstmessage_textarea');
    const first = $ta.length ? String($ta.val() ?? '') : '';
    const altJobs = includeAlts ? collectAlternateJobs() : [];

    const tasks = [];
    if (includeFirst && first.trim()) {
        tasks.push({ kind: 'first', text: first });
    }
    for (const job of altJobs) {
        tasks.push({ kind: 'alt', job, text: job.text });
    }

    if (!tasks.length) {
        toastr.info(includeAlts ? '第一条消息和候选开场都是空的' : '第一条消息是空的', '开场汉化');
        return;
    }

    const sample = tasks.map(t => t.text).join('\n');
    if (looksMostlyChinese(sample)) {
        const ok = confirm('内容看起来已经偏中文了。仍要再用 AI 翻译一遍吗？');
        if (!ok) return;
    }

    setBusy(true);
    toastr.info(`正在用当前 AI 汉化（共 ${tasks.length} 段）…`, '开场汉化');

    const dataArr = resolveDataArrayRef();
    let done = 0;
    let failed = 0;

    try {
        for (const task of tasks) {
            try {
                const out = await translateWithAi(task.text);
                if (!out?.trim()) throw new Error('空结果');
                if (task.kind === 'first') {
                    setTextareaValue($ta, out);
                } else {
                    writeAlternateResult(task.job, out, dataArr);
                }
                done += 1;
                toastr.info(`进度 ${done}/${tasks.length}`, '开场汉化', { timeOut: 1200 });
            } catch (e) {
                failed += 1;
                console.error(LOG, 'segment failed', e);
            }
        }
        if (done && !failed) {
            toastr.success(`已汉化 ${done} 段（请记得保存角色卡）`, '开场汉化');
        } else if (done) {
            toastr.warning(`完成 ${done} 段，失败 ${failed} 段。请看控制台。`, '开场汉化');
        } else {
            toastr.error('全部失败。请确认 API 已连接。', '开场汉化');
        }
    } finally {
        setBusy(false);
    }
}

function setBusy(on) {
    $(`#${BTN_ID}, #${ALT_BTN_ID}`).toggleClass('st-mk-fmzh-busy', on).prop('disabled', on);
}

function makeButton(id, label, title, onClick) {
    const $btn = $(`
        <div id="${id}" class="menu_button menu_button_icon st-mk-fmzh-btn margin0"
             title="${title}" role="button" tabindex="0">
            <i class="fa-solid fa-language"></i>
            <span>${label}</span>
        </div>
    `);
    $btn.on('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
    });
    $btn.on('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    });
    return $btn;
}

function injectMainButton() {
    if ($(`#${BTN_ID}`).length) return true;
    const $ta = $('#firstmessage_textarea');
    if (!$ta.length || !$ta.is(':visible')) {
        // still allow inject if present in DOM (mobile may consider visible oddly)
        if (!$ta.length) return false;
    }

    const $btn = makeButton(
        BTN_ID,
        '汉化开场',
        '用当前 AI 汉化「第一条消息」+ 全部候选开场（保留 {{宏}}）',
        () => runBatchTranslate({ includeFirst: true, includeAlts: true }),
    );

    // 1) Preferred: beside「其他开场」
    const $header = $('#first_message_div');
    const $alt = $header.find('.open_alternate_greetings');
    if ($alt.length) {
        $alt.before($btn);
        return true;
    }
    if ($header.length) {
        $header.append($btn);
        return true;
    }

    // 2) Fallback: bar directly above the textarea (always visible in your screenshot)
    if ($(`#${BAR_ID}`).length) return true;
    const $bar = $(`<div id="${BAR_ID}" class="st-mk-fmzh-bar flex-container alignItemsCenter gap5px"></div>`);
    $bar.append($btn);
    $ta.before($bar);
    return true;
}

function injectAltPopupButton() {
    const $listRoot = $('.alternate_grettings, .alternate_greetings_list').first().closest('.alternate_grettings');
    // popup clones .alternate_grettings from template
    const $popupTitle = $('.popup:visible .alternate_grettings .title_restorable, dialog .alternate_grettings .title_restorable, .popup-content .alternate_grettings .title_restorable').first();
    const $title = $popupTitle.length
        ? $popupTitle
        : $('.alternate_grettings:visible .title_restorable').first();

    if (!$title.length) return false;
    if ($(`#${ALT_BTN_ID}`).length) return true;

    const $btn = makeButton(
        ALT_BTN_ID,
        '全部汉化',
        '用当前 AI 汉化弹窗内全部候选开场',
        () => runBatchTranslate({ includeFirst: false, includeAlts: true }),
    );
    const $add = $title.find('.add_alternate_greeting');
    if ($add.length) $add.before($btn);
    else $title.append($btn);
    return true;
}

function tickInject() {
    try {
        injectMainButton();
        injectAltPopupButton();
    } catch (e) {
        console.warn(LOG, 'inject tick', e);
    }
}

function watch() {
    tickInject();

    const roots = [
        document.getElementById('rm_ch_create_block'),
        document.getElementById('right-nav-panel'),
        document.getElementById('firstMessageWrapper'),
        document.body,
    ].filter(Boolean);

    const obs = new MutationObserver(() => tickInject());
    for (const root of roots) {
        obs.observe(root, { childList: true, subtree: true });
    }

    // Character select / editor open
    $(document).on('click.stMkFmZh', '.character_select, .open_alternate_greetings', () => {
        setTimeout(tickInject, 50);
        setTimeout(tickInject, 300);
        setTimeout(tickInject, 800);
    });

    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        tickInject();
        if (tries > 80) clearInterval(timer);
    }, 400);
}

export function initFirstMesZh() {
    try {
        watch();
        console.log(LOG, `module loaded v${VERSION} (AI generateRaw + alt greetings)`);
        // Visible breadcrumb in console + one soft toast once
        if (!window.__stMkFmZhHello) {
            window.__stMkFmZhHello = true;
            console.log(LOG, '若仍看不到按钮：打开角色编辑，看「第一条消息」旁或输入框上方的「汉化开场」');
        }
    } catch (e) {
        console.error(LOG, 'init failed', e);
        toastr.error('开场汉化模块启动失败，请看控制台', '酒馆小工具');
    }
}
