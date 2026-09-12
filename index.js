/**
 * st-molot-kit — 酒馆小工具合集
 * Bundles: API 自动重试 + 角色置顶与归档 + 开场汉化 + 聊天分享 txt
 * Author: molot23
 * Version: 1.2.2
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { initAutoRetry } from './modules/auto-retry.js';
import { initPinArchive } from './modules/pin-archive.js';

const KIT = 'st-molot-kit';
const VERSION = '1.2.2';
const LOG = '[酒馆小工具]';

const defaultKit = () => ({
    autoRetry: true,
    pinArchive: true,
    firstMesZh: true,
    shareChat: true,
    shareChatLimit: 100,
});

function ensureKitSettings() {
    if (!extension_settings[KIT] || typeof extension_settings[KIT] !== 'object') {
        extension_settings[KIT] = defaultKit();
    }
    const s = extension_settings[KIT];
    const d = defaultKit();
    for (const [k, v] of Object.entries(d)) {
        if (typeof v === 'boolean') {
            if (typeof s[k] !== 'boolean') s[k] = v;
        } else if (typeof v === 'number') {
            if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) s[k] = v;
        } else if (s[k] === undefined) {
            s[k] = v;
        }
    }
    return s;
}

function saveKit() {
    ensureKitSettings();
    saveSettingsDebounced();
}

function injectKitPanel() {
    if ($('#st_molot_kit_settings').length) return true;

    const $target = $('#extensions_settings2').length
        ? $('#extensions_settings2')
        : ($('#extensions_settings').length ? $('#extensions_settings') : null);
    if (!$target) return false;

    const s = ensureKitSettings();
    const html = `
        <div id="st_molot_kit_settings" class="st-molot-kit-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>酒馆小工具合集</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <p class="st-mk-note">
                        合集模块：API 自动重试、角色置顶与归档、开场汉化、聊天分享 txt。下面可分别开关。
                        旧插件的设置会沿用（无需重配）。装好本合集后，请禁用并卸载那两个单独扩展，避免重复加载。
                        Megumin Suite 汉化版请继续单独安装。
                    </p>
                    <div class="st-mk-row">
                        <label class="checkbox_label">
                            <input type="checkbox" id="st_mk_auto_retry" ${s.autoRetry ? 'checked' : ''}/>
                            <span>API 自动重试</span>
                        </label>
                    </div>
                    <div class="st-mk-row">
                        <label class="checkbox_label">
                            <input type="checkbox" id="st_mk_pin_archive" ${s.pinArchive ? 'checked' : ''}/>
                            <span>角色置顶与归档</span>
                        </label>
                    </div>
                    <div class="st-mk-row">
                        <label class="checkbox_label">
                            <input type="checkbox" id="st_mk_first_mes_zh" ${s.firstMesZh ? 'checked' : ''}/>
                            <span>开场汉化（首条+候选，当前 AI）</span>
                        </label>
                    </div>
                    <div class="st-mk-row">
                        <label class="checkbox_label">
                            <input type="checkbox" id="st_mk_share_chat" ${s.shareChat ? 'checked' : ''}/>
                            <span>聊天分享 txt（三条杠菜单 + 立即分享）</span>
                        </label>
                    </div>
                    <div class="st-mk-row">
                        <label for="st_mk_share_limit">分享条数（0=全部）</label>
                        <input type="number" id="st_mk_share_limit" class="text_pole" min="0" max="9999" step="1" value="${Number(s.shareChatLimit) || 0}" style="max-width:6rem;"/>
                    </div>
                    <small class="st-mk-note">开关变更后需刷新页面生效。合集 v${VERSION}</small>
                    <div class="st-mk-actions">
                        <button type="button" id="st_mk_run_share" class="menu_button st-mk-action-btn">立即分享当前聊天</button>
                        <button type="button" id="st_mk_run_fmzh" class="menu_button st-mk-action-btn">立即汉化当前角色开场</button>
                        <button type="button" id="st_mk_force_fmzh" class="menu_button st-mk-action-btn">重新注入 / 诊断「汉化开场」</button>
                    </div>
                    <small class="st-mk-note">聊天分享：先点上面「立即分享」最稳。三条杠菜单最上面也会有「分享聊天为 txt」（TauriTavern 可用）。不含角色卡。</small>
                </div>
            </div>
        </div>`;
    $target.prepend(html);

    $('#st_mk_auto_retry').on('change', function () {
        ensureKitSettings().autoRetry = $(this).is(':checked');
        saveKit();
        toastr.info('已保存。刷新页面后生效。', '酒馆小工具');
    });
    $('#st_mk_pin_archive').on('change', function () {
        ensureKitSettings().pinArchive = $(this).is(':checked');
        saveKit();
        toastr.info('已保存。刷新页面后生效。', '酒馆小工具');
    });
    $('#st_mk_first_mes_zh').on('change', function () {
        ensureKitSettings().firstMesZh = $(this).is(':checked');
        saveKit();
        toastr.info('已保存。刷新页面后生效。', '酒馆小工具');
    });
    $('#st_mk_share_chat').on('change', function () {
        ensureKitSettings().shareChat = $(this).is(':checked');
        saveKit();
        toastr.info('已保存。刷新页面后生效。', '酒馆小工具');
    });
    $('#st_mk_share_limit').on('change', function () {
        let n = parseInt($(this).val(), 10);
        if (!Number.isFinite(n) || n < 0) n = 100;
        ensureKitSettings().shareChatLimit = n;
        saveKit();
        toastr.info(n === 0 ? '已保存：导出全部聊天。' : `已保存：最近 ${n} 条。`, '酒馆小工具');
    });
    $('#st_mk_run_fmzh').on('click', async function () {
        try {
            ensureKitSettings().firstMesZh = true;
            $('#st_mk_first_mes_zh').prop('checked', true);
            saveKit();
            const m = await import('./modules/first-mes-zh.js');
            m.initFirstMesZh();
            await m.runBatchTranslate({ includeFirst: true, includeAlts: true });
        } catch (e) {
            console.error(LOG, e);
            toastr.error(String(e && e.message ? e.message : e), '汉化失败');
        }
    });
    $('#st_mk_force_fmzh').on('click', async function () {
        try {
            ensureKitSettings().firstMesZh = true;
            $('#st_mk_first_mes_zh').prop('checked', true);
            saveKit();
            const m = await import('./modules/first-mes-zh.js');
            const d = m.initFirstMesZh();
            const lines = [
                `模块 ${d.moduleVersion}`,
                `textarea: ${d.textareaFound ? (d.textareaVisible ? '可见' : '找到但不可见') : '未找到'}`,
                `编辑页按钮: ${d.buttonVisible ? '可见' : (d.buttonInDom ? '在DOM但不可见' : '无')}`,
                `悬浮球: ${d.fabVisible ? '已显示' : '未显示（先打开角色编辑）'}`,
                `generateRaw: ${d.hasGenerateRaw ? '有' : '无'}`,
                `inject: ${d.inject && d.inject.where}`,
            ];
            console.log(LOG, 'diagnose', d);
            if (d.buttonVisible || d.fabVisible) {
                toastr.success(lines.join(' · '), '开场汉化诊断');
            } else {
                toastr.warning(lines.join(' · ') + ' —— 请用「立即汉化当前角色开场」', '开场汉化诊断');
            }
        } catch (e) {
            console.error(LOG, e);
            toastr.error(String(e && e.message ? e.message : e), '注入失败');
        }
    });
    $('#st_mk_run_share').on('click', async function () {
        try {
            ensureKitSettings().shareChat = true;
            $('#st_mk_share_chat').prop('checked', true);
            saveKit();
            const m = await import('./modules/share-chat-txt.js');
            m.initShareChatTxt();
            await m.shareCurrentChat();
        } catch (e) {
            console.error(LOG, e);
            toastr.error(String(e && e.message ? e.message : e), '分享失败');
        }
    });
    return true;
}

function waitKitPanel() {
    if (injectKitPanel()) return;
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        if (injectKitPanel() || tries > 60) clearInterval(timer);
    }, 500);
}

jQuery(() => {
    try {
        const s = ensureKitSettings();
        waitKitPanel();

        if (s.autoRetry) {
            initAutoRetry();
        } else {
            console.log(LOG, 'API 自动重试已关闭');
        }

        if (s.pinArchive) {
            initPinArchive();
        } else {
            console.log(LOG, '角色置顶与归档已关闭');
        }

        if (s.firstMesZh) {
            import('./modules/first-mes-zh.js')
                .then((m) => m.initFirstMesZh())
                .catch((err) => {
                    console.error(LOG, '开场汉化模块加载失败', err);
                    toastr.error('开场汉化模块加载失败，请看控制台', '酒馆小工具');
                });
        } else {
            console.log(LOG, '首条汉化已关闭');
        }

        if (s.shareChat) {
            import('./modules/share-chat-txt.js')
                .then((m) => m.initShareChatTxt())
                .catch((err) => {
                    console.error(LOG, '聊天分享模块加载失败', err);
                    toastr.error('聊天分享模块加载失败，请看控制台', '酒馆小工具');
                });
        } else {
            console.log(LOG, '聊天分享已关闭');
        }

        const parts = [];
        if (s.autoRetry) parts.push('自动重试');
        if (s.pinArchive) parts.push('置顶归档');
        if (s.firstMesZh) parts.push('首条汉化');
        if (s.shareChat) parts.push('聊天分享');
        toastr.info(
            parts.length ? `已加载：${parts.join(' + ')}（v${VERSION}）` : `合集已加载，但模块均已关闭（v${VERSION}）`,
            '酒馆小工具',
        );
        console.log(LOG, `loaded v${VERSION}`, s);
    } catch (e) {
        console.error(LOG, 'init failed', e);
        toastr.error('合集加载失败，请看控制台', '酒馆小工具');
    }
});
