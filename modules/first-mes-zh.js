/**
 * Module: one-click Simplified Chinese for character First Message
 * Uses the user's currently connected SillyTavern AI (generateRaw), not Google Translate.
 */

import {
    generateRaw,
    online_status,
} from '../../../../../script.js';

const LOG = '[首条汉化]';
const VERSION = '1.1.0';
const BTN_ID = 'st_mk_first_mes_zh';

const SYSTEM_PROMPT = `你是专业翻译。把用户给出的角色卡「第一条消息 / First Message」译成通顺的简体中文。

硬性规则：
1. 原样保留所有 {{宏}}（如 {{user}}、{{char}}），不要翻译、不要改写、不要加空格破坏。
2. 保留 markdown / HTML / 引号 / 换行与叙事口吻（角色扮演开场白）。
3. 只输出译文本身：不要前言、不要「译文：」、不要用代码块包裹。
4. 专有名词可保留英文或常用译法，以自然可读为准。`;

/** Protect {{macros}} so the model is less likely to alter them. */
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
    let out = String(text);
    out = out.replace(/⟦§(\d+)§⟧/g, (_, n) => {
        const i = Number(n);
        return Number.isFinite(i) && macros[i] !== undefined ? macros[i] : _;
    });
    // Fallback if the model rewrote the shield markers oddly but left index
    out = out.replace(/\[\[§(\d+)§\]\]/g, (_, n) => {
        const i = Number(n);
        return Number.isFinite(i) && macros[i] !== undefined ? macros[i] : _;
    });
    return out;
}

function stripModelChrome(text) {
    let t = String(text ?? '').trim();
    // common reasoning wrappers
    t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    t = t.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
    // strip accidental fences
    if (t.startsWith('```')) {
        t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }
    // strip leading labels
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
    if (online_status === 'no_connection' || !online_status) {
        throw new Error('当前未连接 API。请先在插头页连上模型。');
    }

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

async function onClickTranslate() {
    const $ta = $('#firstmessage_textarea');
    if (!$ta.length) {
        toastr.warning('找不到第一条消息输入框', '首条汉化');
        return;
    }
    const original = String($ta.val() ?? '');
    if (!original.trim()) {
        toastr.info('第一条消息是空的', '首条汉化');
        return;
    }
    if (looksMostlyChinese(original)) {
        const ok = confirm('这段看起来已经偏中文了。仍要再用 AI 翻译一遍吗？');
        if (!ok) return;
    }

    const $btn = $(`#${BTN_ID}`);
    $btn.addClass('st-mk-fmzh-busy').prop('disabled', true);
    const prevTitle = $btn.attr('title');
    $btn.attr('title', 'AI 翻译中…');
    toastr.info('正在用当前 API 汉化第一条消息…', '首条汉化');

    try {
        const out = await translateWithAi(original);
        if (!out || !String(out).trim()) {
            throw new Error('翻译结果为空');
        }
        $ta.val(out).trigger('input').trigger('change');
        try {
            $ta[0].dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) { /* ignore */ }
        toastr.success('已用 AI 汉化（请记得保存角色卡）', '首条汉化');
    } catch (e) {
        console.error(LOG, e);
        toastr.error(String(e?.message || e), '首条汉化失败');
    } finally {
        $btn.removeClass('st-mk-fmzh-busy').prop('disabled', false);
        $btn.attr('title', prevTitle || '用当前 AI 一键汉化第一条消息');
    }
}

function injectButton() {
    if ($(`#${BTN_ID}`).length) return true;
    const $header = $('#first_message_div');
    if (!$header.length) return false;

    const $btn = $(`
        <div id="${BTN_ID}" class="menu_button menu_button_icon st-mk-fmzh-btn margin0"
             title="用当前 AI 一键汉化第一条消息（保留 {{宏}}）" role="button" tabindex="0">
            <i class="fa-solid fa-language"></i>
            <span>汉化</span>
        </div>
    `);
    $btn.on('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClickTranslate();
    });
    $btn.on('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClickTranslate();
        }
    });

    const $alt = $header.find('.open_alternate_greetings');
    if ($alt.length) $alt.before($btn);
    else $header.append($btn);
    return true;
}

function watchForEditor() {
    if (injectButton()) return;
    const root = document.getElementById('rm_ch_create_block')
        || document.getElementById('right-nav-panel')
        || document.body;
    const obs = new MutationObserver(() => {
        injectButton();
    });
    obs.observe(root, { childList: true, subtree: true });
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        injectButton();
        if (tries > 40) clearInterval(timer);
    }, 500);
}

export function initFirstMesZh() {
    try {
        watchForEditor();
        console.log(LOG, `module loaded v${VERSION} (AI / generateRaw)`);
    } catch (e) {
        console.error(LOG, 'init failed', e);
    }
}
