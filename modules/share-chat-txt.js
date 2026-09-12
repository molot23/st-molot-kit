/**
 * Share current chat as .txt via system share sheet only. NEVER download/save locally.
 * Chat text only — no character card / Megumin memory.
 */

const LOG = '[聊天分享]';
const VERSION = '1.1.0';
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

function isAbort(e) {
    return e && (e.name === 'AbortError' || e.name === 'NotAllowedError');
}

function isIosRuntime() {
    const ua = String(navigator.userAgent || '');
    if (/iphone|ipad|ipod/i.test(ua)) return true;
    return navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1;
}

function isAndroidRuntime() {
    return /android/i.test(String(navigator.userAgent || ''));
}

function getTauriInvoke() {
    const invoke = globalThis.__TAURI__?.core?.invoke;
    return typeof invoke === 'function' ? invoke : null;
}

/** iOS TauriTavern: stage temp file → system share sheet → cleanup. Never touches Downloads. */
async function shareViaIosNative(filename, text) {
    const invoke = getTauriInvoke();
    if (!invoke || !isIosRuntime()) throw new Error('ios native share unavailable');

    const pathApi = globalThis.__TAURI__?.path;
    if (!pathApi?.join || !pathApi?.cacheDir) throw new Error('tauri path api missing');

    const cacheDir = await pathApi.cacheDir();
    const stageDir = await pathApi.join(cacheDir, 'st-molot-kit-share');
    const filePath = await pathApi.join(stageDir, filename);

    // mkdir + write via fs plugin
    try {
        await invoke('plugin:fs|mkdir', { path: stageDir, options: { recursive: true } });
    } catch (_) {
        // may already exist
    }
    const bytes = new TextEncoder().encode(text);
    await invoke('plugin:fs|write_file', bytes, {
        headers: {
            path: encodeURIComponent(filePath),
            options: JSON.stringify({ create: true, append: false }),
        },
    });

    try {
        const shareResult = await invoke('ios_share_file', { filePath });
        return shareResult;
    } finally {
        try {
            await invoke('plugin:fs|remove', { path: filePath, options: {} });
        } catch (e) {
            console.warn(LOG, 'cleanup staged share file failed', e);
        }
    }
}

async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
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
    return true;
}

/**
 * System share sheet only. NEVER download / save to local storage folders.
 * Order: file share → text share → iOS native share sheet → clipboard (not a file save).
 */
async function shareOnly(filename, text) {
    const file = new File([text], filename, { type: 'text/plain' });

    // 1) Web Share API — file
    if (typeof navigator.share === 'function') {
        try {
            const dataFile = { files: [file], title: filename, text: filename };
            if (!navigator.canShare || navigator.canShare(dataFile)) {
                await navigator.share(dataFile);
                return 'shared-file';
            }
        } catch (e) {
            if (isAbort(e)) return 'cancelled';
            console.warn(LOG, 'file share failed', e);
        }

        // 2) Web Share API — plain text (shows the same system sheet; Grok can accept text)
        try {
            const dataText = { title: filename, text };
            if (!navigator.canShare || navigator.canShare(dataText)) {
                await navigator.share(dataText);
                return 'shared-text';
            }
        } catch (e) {
            if (isAbort(e)) return 'cancelled';
            console.warn(LOG, 'text share failed', e);
        }
    }

    // 3) TauriTavern iOS native share sheet (temp cache only, cleaned after)
    if (getTauriInvoke() && isIosRuntime()) {
        try {
            const result = await shareViaIosNative(filename, text);
            if (result && result.completed === false) return 'cancelled';
            return 'shared-ios';
        } catch (e) {
            console.warn(LOG, 'ios_share_file failed', e);
        }
    }

    // 4) Clipboard — not saving a file to disk
    try {
        await copyToClipboard(text);
        return 'clipboard';
    } catch (e) {
        console.error(LOG, 'clipboard failed', e);
    }

    throw new Error(
        isAndroidRuntime()
            ? '当前环境无法打开系统分享。请确认 TauriTavern / WebView 允许分享，或换用支持 Web Share 的版本。不会下载到本地。'
            : '无法打开系统分享，且复制到剪贴板也失败。不会下载到本地。',
    );
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
        toastr?.info?.(`正在打包 ${pack.exported.length} 条（仅系统分享，不保存本地）…`, '聊天分享');
        const mode = await shareOnly(filename, text);
        if (mode === 'cancelled') {
            toastr?.info?.('已取消分享', '聊天分享');
        } else if (mode === 'clipboard') {
            toastr?.warning?.(
                `系统分享面板不可用，已复制 ${pack.exported.length} 条到剪贴板（未保存文件）。请打开 Grok 粘贴。`,
                '聊天分享',
                { timeOut: 8000 },
            );
        } else {
            toastr?.success?.(`已打开分享（${pack.exported.length} 条）。请选 Grok。`, '聊天分享');
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

    const candidates = [
        document.querySelector('#options .options-content'),
        document.querySelector('#options'),
        document.querySelector('.options-content'),
        document.querySelector('#option_select_chat')?.parentElement,
        document.querySelector('#option_start_new_chat')?.parentElement,
    ].filter(Boolean);

    // TauriTavern / i18n: find menu that contains「管理聊天文件」or Manage chat
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
    a.innerHTML = '<i class="fa-lg fa-solid fa-share-nodes"></i><span>分享聊天为 txt</span>';
    a.title = '打包当前聊天为 txt，分享到 Grok 等（不含角色卡）';
    a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeOptionsMenu();
        shareCurrentChat();
    });

    // Put at TOP so it is hard to miss on mobile
    const first = content.firstElementChild;
    if (first) content.insertBefore(a, first);
    else content.appendChild(a);

    console.log(LOG, 'share item injected at top of options menu');
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
