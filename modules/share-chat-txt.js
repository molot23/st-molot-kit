/**
 * Share current chat as .txt via Web Share API (mobile) or download fallback.
 * Chat text only — no character card / Megumin memory.
 */

const LOG = '[聊天分享]';
const VERSION = '1.0.1';
const BTN_ID = 'st_mk_share_chat';
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
    if (n === 0) return 0; // 0 = all
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
    const now = new Date();
    const stamp = now.toISOString();
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

function safeFilename() {
    const ctx = getCtx();
    const raw = String(ctx?.chatId || ctx?.name2 || 'chat').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 40);
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const tag = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `${raw || 'chat'}_${tag}.txt`;
}

function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function shareOrDownload(filename, text) {
    const file = new File([text], filename, { type: 'text/plain' });
    try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: filename });
            return 'shared';
        }
    } catch (e) {
        if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return 'cancelled';
        console.warn(LOG, 'file share failed, fallback', e);
    }
    try {
        // Some clients share text only (often truncated) — prefer download for full log
        if (navigator.share && text.length <= 8000) {
            await navigator.share({ title: filename, text });
            return 'shared-text';
        }
    } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        console.warn(LOG, 'text share failed, download', e);
    }
    downloadText(filename, text);
    return 'downloaded';
}

export async function shareCurrentChat() {
    const pack = collectMessages();
    if (!pack.exported.length) {
        toastr?.info?.('当前没有可导出的聊天内容', '聊天分享');
        return { ok: false, reason: 'empty' };
    }
    const text = buildTxt(pack);
    const filename = safeFilename();
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.classList.add('st-mk-share-busy');
    try {
        toastr?.info?.(`正在打包 ${pack.exported.length} 条…`, '聊天分享');
        const mode = await shareOrDownload(filename, text);
        if (mode === 'cancelled') {
            toastr?.info?.('已取消分享', '聊天分享');
        } else if (mode === 'shared' || mode === 'shared-text') {
            toastr?.success?.(`已分享 ${pack.exported.length} 条（${filename}）`, '聊天分享');
        } else {
            toastr?.success?.(`已下载 ${filename}（${pack.exported.length} 条）。手机上可再从文件管理器分享到 Grok。`, '聊天分享');
        }
        return { ok: true, mode, count: pack.exported.length, filename };
    } catch (e) {
        console.error(LOG, e);
        toastr?.error?.(String(e?.message || e), '聊天分享失败');
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
    const content = document.querySelector('#options .options-content, #options');
    if (!content) return false;

    const a = document.createElement('a');
    a.id = OPT_ID;
    a.href = 'javascript:void(0)';
    a.innerHTML = '<i class="fa-lg fa-solid fa-share-nodes"></i><span>分享聊天为 txt</span>';
    a.title = '打包当前聊天为 txt，分享到 Grok 等（不含角色卡）';
    a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeOptionsMenu();
        shareCurrentChat();
    });

    // Prefer near 管理聊天文件 / select chat
    const anchor =
        content.querySelector('#option_select_chat') ||
        content.querySelector('#option_start_new_chat') ||
        content.querySelector('hr');
    if (anchor) content.insertBefore(a, anchor);
    else content.appendChild(a);

    console.log(LOG, 'share item injected into #options menu');
    return true;
}

function injectLeftButton() {
    ensureCss();
    if (document.getElementById(BTN_ID)) return true;
    const left = document.querySelector('#leftSendForm');
    if (!left) return false;

    const btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.className = 'fa-solid fa-share-nodes interactable';
    btn.title = '分享聊天为 txt（给 Grok 等）';
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
    console.log(LOG, `module loaded v${VERSION}`);
}
