/**
 * Module: one-click Simplified Chinese for character First Message
 * Uses SillyTavern's /api/translate/google (same as Chat Translation).
 */

import {
    getRequestHeaders,
} from '../../../../../script.js';

const LOG = '[首条汉化]';
const VERSION = '1.0.0';
const BTN_ID = 'st_mk_first_mes_zh';
const LANG = 'zh-CN';

/** Protect {{macros}} so MT does not mangle them. */
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
    return String(text).replace(/⟦§(\d+)§⟧/g, (_, n) => {
        const i = Number(n);
        return Number.isFinite(i) && macros[i] !== undefined ? macros[i] : _;
    });
}

async function translateGoogle(text, lang = LANG) {
    if (!text) return '';
    const response = await fetch('/api/translate/google', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ text, lang }),
    });
    if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        throw new Error(errText || response.statusText || `HTTP ${response.status}`);
    }
    return await response.text();
}

async function translatePreservingMacros(text) {
    const { shielded, macros } = shieldMacros(text);
    // Chunk large greetings similarly to ST's translate extension
    const chunkSize = 5000;
    let translated;
    if (shielded.length <= chunkSize) {
        translated = await translateGoogle(shielded);
    } else {
        const parts = [];
        for (let i = 0; i < shielded.length; i += chunkSize) {
            parts.push(await translateGoogle(shielded.slice(i, i + chunkSize)));
        }
        translated = parts.join('');
    }
    return restoreMacros(translated, macros);
}

function looksMostlyChinese(text) {
    const s = String(text).replace(/\{\{[\s\S]*?\}\}/g, '').replace(/\s+/g, '');
    if (!s) return false;
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    return cjk / s.length >= 0.35;
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
        const ok = confirm('这段看起来已经偏中文了。仍要再翻译一遍吗？');
        if (!ok) return;
    }

    const $btn = $(`#${BTN_ID}`);
    $btn.addClass('st-mk-fmzh-busy').prop('disabled', true);
    const prevTitle = $btn.attr('title');
    $btn.attr('title', '翻译中…');

    try {
        const out = await translatePreservingMacros(original);
        if (!out || !String(out).trim()) {
            throw new Error('翻译结果为空');
        }
        $ta.val(out).trigger('input').trigger('change');
        // Keep create_save / editors in sync if ST listens on those
        try {
            $ta[0].dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) { /* ignore */ }
        toastr.success('已汉化第一条消息（请记得保存角色卡）', '首条汉化');
    } catch (e) {
        console.error(LOG, e);
        toastr.error(String(e?.message || e), '首条汉化失败');
    } finally {
        $btn.removeClass('st-mk-fmzh-busy').prop('disabled', false);
        $btn.attr('title', prevTitle || '一键汉化第一条消息');
    }
}

function injectButton() {
    if ($(`#${BTN_ID}`).length) return true;
    const $header = $('#first_message_div');
    if (!$header.length) return false;

    const $btn = $(`
        <div id="${BTN_ID}" class="menu_button menu_button_icon st-mk-fmzh-btn margin0"
             title="一键汉化第一条消息（保留 {{宏}}）" role="button" tabindex="0">
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

    // Prefer sitting next to「其他开场」
    const $alt = $header.find('.open_alternate_greetings');
    if ($alt.length) $alt.before($btn);
    else $header.append($btn);
    return true;
}

function watchForEditor() {
    if (injectButton()) return;
    // Character editor mounts later / on select
    const root = document.getElementById('rm_ch_create_block')
        || document.getElementById('right-nav-panel')
        || document.body;
    const obs = new MutationObserver(() => {
        if (injectButton()) {
            // keep observing lightly in case editor re-renders
        }
    });
    obs.observe(root, { childList: true, subtree: true });
    // Also periodic fallback for a bit
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
        console.log(LOG, `module loaded v${VERSION}`);
    } catch (e) {
        console.error(LOG, 'init failed', e);
    }
}
