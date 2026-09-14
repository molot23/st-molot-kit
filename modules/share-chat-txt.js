/**
 * Copy current chat to clipboard as plain text.
 * No download, no Android Intent / Web Share probes.
 */

const LOG = '[聊天复制]';
const VERSION = '2.0.0';
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
    return 100;
}

function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BTN_ID} {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 2.1rem !important;
        height: 2.1rem !important;
        margin: 0 2px !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        opacity: 0.85 !important;
        color: var(--SmartThemeBodyColor, #ddd) !important;
        flex-shrink: 0 !important;
      }
      #${BTN_ID}:hover { opacity: 1 !important; color: var(--SmartThemeQuoteColor, #f59e0b) !important; }
      #${BTN_ID}.st-mk-share-busy { opacity: 0.45 !important; pointer-events: none !important; }
      #leftSendForm { display: flex !important; align-items: center !important; gap: 2px !important; }
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

function collectMessages() {
    const ctx = getCtx();
    const chat = Array.isArray(ctx?.chat) ? ctx.chat : (Array.isArray(globalThis.chat) ? globalThis.chat : []);
    const usable = [];
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (!msg || typeof msg !== 'object') continue;
        if (msg.is_system) continue;
        const text = stripHtml(msg.mes);
        if (!text) continue;
        usable.push({ index: i, is_user: !!msg.is_user, name: speakerLabel(msg), text });
    }
    const limit = getLimit();
    const sliced = limit > 0 && usable.length > limit ? usable.slice(-limit) : usable;
    return { allCount: usable.length, exported: sliced, limit, totalInChat: chat.length };
}

function buildTxt({ exported, allCount, limit, totalInChat }) {
    const stamp = new Date().toISOString();
    const lines = [];
    lines.push('SillyTavern chat export');
    lines.push(`exported_at: ${stamp}`);
    lines.push(`messages_in_file: ${exported.length}`);
    lines.push(`messages_usable: ${allCount} (of ${totalInChat} raw)`);
    lines.push(`limit: ${limit === 0 ? 'all' : `last ${limit}`}`);
    lines.push('note: chat text only; no character card data');
    lines.push('');
    lines.push('---');
    lines.push('');
    exported.forEach((m, i) => {
        lines.push(`[${i + 1}] ${m.name}:`);
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
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.classList.add('st-mk-share-busy');
    try {
        await copyToClipboard(text);
        toastr?.success?.(`已复制 ${pack.exported.length} 条到剪贴板。可粘贴到 Grok。`, '聊天复制');
        return { ok: true, mode: 'clipboard', count: pack.exported.length };
    } catch (e) {
        console.error(LOG, e);
        toastr?.error?.(String(e?.message || e), '复制失败');
        return { ok: false, reason: String(e?.message || e) };
    } finally {
        if (btn) btn.classList.remove('st-mk-share-busy');
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

function injectLeftButton() {
    ensureCss();
    if (document.getElementById(BTN_ID)) return true;
    const left = document.querySelector('#leftSendForm');
    if (!left) return false;

    const btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.className = 'fa-solid fa-copy interactable';
    btn.title = '复制聊天到剪贴板';
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        shareCurrentChat();
    });

    const options = left.querySelector('#options_button');
    if (options && options.nextSibling) left.insertBefore(btn, options.nextSibling);
    else if (options) left.appendChild(btn);
    else left.prepend(btn);
    return true;
}

let started = false;

export function initShareChatTxt() {
    ensureCss();
    const tryInject = () => {
        try {
            injectOptionsMenuItem();
            injectLeftButton();
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
    console.log(LOG, `module loaded v${VERSION} (clipboard only)`);
}
