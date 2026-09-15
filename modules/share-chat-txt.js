/**
 * Copy current chat to clipboard as plain text.
 * No download, no Android Intent / Web Share probes.
 */

const LOG = '[聊天复制]';
const VERSION = '2.1.0';
const BTN_ID = 'st_mk_share_chat_btn';
const OPT_ID = 'st_mk_share_chat_option';
const STYLE_ID = 'st_mk_share_chat_style';
const KIT = 'st-molot-kit';

function getCtx() {
    try {
        if (globalThis.SillyTavern?.getContext) return globalThis.SillyTavern.getContext();
    } catch (_) { /* ignore */ }
    return null;
}

function getKitSettings() {
    try {
        const ext = getCtx()?.extensionSettings || globalThis.extension_settings;
        const s = ext?.[KIT];
        if (s && typeof s === 'object') return s;
    } catch (_) { /* ignore */ }
    return {};
}

function getLimit() {
    const n = Number(getKitSettings().shareChatLimit);
    if (n === 0) return 0;
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    return 0; // default: all floors (incl. LittleWhiteX-hidden)
}

function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OPT_ID}, a.st-mk-share-option {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        width: 100% !important;
        box-sizing: border-box !important;
        padding: 10px 12px !important;
        font-weight: 600 !important;
        color: var(--SmartThemeQuoteColor, #f59e0b) !important;
      }
    `;
    document.head.appendChild(style);
}

function stripHtml(text) {
    let t = String(text ?? '');
    t = t.replace(/<br\s*\/?>/gi, '\n');
    t = t.replace(/<\/p>/gi, '\n');
    t = t.replace(/<[^>]+>/g, '');
    t = t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    t = t.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return t;
}

function speakerLabel(msg) {
    if (msg?.is_user) return 'User';
    const name = String(msg?.name || '').trim();
    return name || 'Assistant';
}

function looksLikeRealChat(msg, text) {
    // LittleWhiteX "隐藏已总结楼层" marks old dialogue as is_system without deleting mes.
    if (!text) return false;
    if (!msg.is_system) return true;
    if (msg.is_user) return true;
    const name = String(msg.name || '').trim();
    if (name && name.toLowerCase() !== 'system') return true;
    if (text.length >= 8) return true;
    return false;
}

function collectMessages() {
    const ctx = getCtx();
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : (Array.isArray(globalThis.chat) ? globalThis.chat : []);
    const usable = [];
    let hiddenIncluded = 0;
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (!msg || typeof msg !== 'object') continue;
        const text = stripHtml(msg.mes);
        if (!looksLikeRealChat(msg, text)) continue;
        if (msg.is_system) hiddenIncluded += 1;
        usable.push({
            index: i,
            is_user: !!msg.is_user,
            is_system: !!msg.is_system,
            name: speakerLabel(msg),
            text,
        });
    }
    const limit = getLimit();
    const sliced = limit > 0 && usable.length > limit ? usable.slice(-limit) : usable;
    return {
        allCount: usable.length,
        exported: sliced,
        limit,
        totalInChat: chat.length,
        hiddenIncluded,
    };
}

function buildTxt({ exported, allCount, limit, totalInChat, hiddenIncluded }) {
    const stamp = new Date().toISOString();
    const lines = [];
    lines.push('SillyTavern chat export');
    lines.push(`exported_at: ${stamp}`);
    lines.push(`messages_in_file: ${exported.length}`);
    lines.push(`messages_usable: ${allCount} (of ${totalInChat} raw)`);
    lines.push(`hidden_floors_included: ${Number(hiddenIncluded) || 0}`);
    lines.push(`limit: ${limit === 0 ? 'all' : `last ${limit}`}`);
    lines.push('note: includes floors hidden by LittleWhiteX (is_system); chat text only');
    lines.push('');
    lines.push('---');
    lines.push('');
    exported.forEach((m, i) => {
        const tag = m.is_system ? ' [hidden]' : '';
        lines.push(`[${i + 1}] ${m.name}${tag}:`);
        lines.push(m.text);
        lines.push('');
    });
    return lines.join('\n').trim() + '\n';
}

async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('clipboard copy failed');
}

export async function shareCurrentChat() {
    const pack = collectMessages();
    if (!pack.exported.length) {
        toastr?.info?.('当前没有可导出的聊天内容', '聊天复制');
        return { ok: false, reason: 'empty' };
    }
    const text = buildTxt(pack);
    try {
        await copyToClipboard(text);
        toastr?.success?.(
            pack.hiddenIncluded
                ? `已复制 ${pack.exported.length} 条（含 ${pack.hiddenIncluded} 条被小白x隐藏的楼）。`
                : `已复制 ${pack.exported.length} 条到剪贴板。`,
            '聊天复制',
        );
        return { ok: true, mode: 'clipboard', count: pack.exported.length };
    } catch (e) {
        console.error(LOG, e);
        toastr?.error?.(String(e?.message || e), '复制失败');
        return { ok: false, reason: String(e?.message || e) };
    }
}

function closeOptionsMenu() {
    const opts = document.getElementById('options');
    if (opts) opts.style.display = 'none';
}

function injectOptionsMenuItem() {
    if (document.getElementById(OPT_ID)) return true;

    const candidates = [
        document.querySelector('#options .options-content'),
        document.querySelector('#options'),
        document.querySelector('.options-content'),
        document.querySelector('#option_select_chat')?.parentElement,
        document.querySelector('#option_start_new_chat')?.parentElement,
    ].filter(Boolean);

    if (!candidates.length) {
        for (const root of document.querySelectorAll('div, nav, aside, dialog')) {
            const tx = (root.textContent || '');
            if (tx.includes('管理聊天文件') || tx.includes('Manage chat files') || tx.includes('开始新聊天')) {
                if (root.querySelector('a, .menu_button, [id^="option_"]')) {
                    candidates.push(root);
                    break;
                }
            }
        }
    }

    const content = candidates[0];
    if (!content) return false;

    const a = document.createElement('a');
    a.id = OPT_ID;
    a.href = 'javascript:void(0)';
    a.className = 'st-mk-share-option';
    a.innerHTML = '<i class="fa-lg fa-solid fa-copy"></i><span>复制聊天到剪贴板</span>';
    a.title = '把当前聊天复制为纯文本（不含角色卡）';
    a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const run = shareCurrentChat();
        setTimeout(closeOptionsMenu, 0);
        return run;
    });

    const first = content.firstElementChild;
    if (first) content.insertBefore(a, first);
    else content.appendChild(a);
    console.log(LOG, 'clipboard item injected at top of options menu');
    return true;
}

function removeLeftButton() {
    document.getElementById(BTN_ID)?.remove();
}

let started = false;

export function initShareChatTxt() {
    ensureCss();
    const tryInject = () => {
        try {
            removeLeftButton();
            injectOptionsMenuItem();
        } catch (e) {
            console.warn(LOG, e);
        }
    };
    tryInject();
    if (!started) {
        started = true;
        const obs = new MutationObserver(() => tryInject());
        obs.observe(document.body, { childList: true, subtree: true });
        setInterval(tryInject, 2000);
    }
    console.log(LOG, `module loaded v${VERSION} (settings + options menu; no input-bar button)`);
}
