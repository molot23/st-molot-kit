/**
 * st-molot-kit — 酒馆小工具合集
 * Bundles: 角色置顶与归档 + 开场导入导出 + 复制聊天到剪贴板
 * Author: molot23
 * Version: 1.6.0
 */

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { initPinArchive } from './modules/pin-archive.js';

const KIT = 'st-molot-kit';
const VERSION = '1.6.0';
const LOG = '[酒馆小工具]';
const CPA = 'st-char-pin-archive';

const defaultKit = () => ({
    pinArchive: true,
    firstMesZh: true, // greeting import/export
    shareChat: true,
    shareChatLimit: 100,
    showAdvanced: false,
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
    // Drop removed module keys from older kit versions
    if ('autoRetry' in s) delete s.autoRetry;
    return s;
}

function saveKit() {
    ensureKitSettings();
    saveSettingsDebounced();
}


function ensureCpaSettings() {
    if (!extension_settings[CPA] || typeof extension_settings[CPA] !== 'object') {
        extension_settings[CPA] = { pinned: [], archived: [], showArchivedOnly: false };
    }
    const s = extension_settings[CPA];
    if (!Array.isArray(s.pinned)) s.pinned = [];
    if (!Array.isArray(s.archived)) s.archived = [];
    return s;
}

function hideLegacyModulePanels() {
    $('#st_cpa_settings').hide();
}

function injectKitPanel() {
    if ($('#st_molot_kit_settings').length) {
        hideLegacyModulePanels();
        return true;
    }

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
                    <p class="st-mk-lead">置顶归档 · 开场导入导出 · 复制聊天 <span class="st-mk-ver">v${VERSION}</span></p>
                    <p class="st-mk-note">Megumin 请单独安装。开关变更后需刷新页面生效。</p>

                    <div class="st-mk-section">
                        <div class="st-mk-section-title">功能开关</div>
                        <div class="st-mk-toggle-list">
                            <label class="checkbox_label st-mk-toggle" for="st_mk_tog_pin">
                                <input type="checkbox" id="st_mk_tog_pin" ${s.pinArchive ? 'checked' : ''}/>
                                <span>角色置顶与归档</span>
                            </label>
                            <label class="checkbox_label st-mk-toggle" for="st_mk_tog_greeting">
                                <input type="checkbox" id="st_mk_tog_greeting" ${s.firstMesZh ? 'checked' : ''}/>
                                <span>开场导入导出</span>
                            </label>
                            <label class="checkbox_label st-mk-toggle" for="st_mk_tog_share">
                                <input type="checkbox" id="st_mk_tog_share" ${s.shareChat ? 'checked' : ''}/>
                                <span>复制聊天到剪贴板</span>
                            </label>
                        </div>
                    </div>


                    <div class="st-mk-section">
                        <div class="st-mk-section-title">复制聊天</div>
                        <div class="st-mk-row">
                            <label for="st_mk_share_limit">条数（0=全部）</label>
                            <input type="number" id="st_mk_share_limit" class="text_pole st-mk-num" min="0" max="9999" step="1" value="${Number(s.shareChatLimit) || 0}"/>
                        </div>
                        <button type="button" id="st_mk_run_share" class="menu_button st-mk-action-btn">复制当前聊天到剪贴板</button>
                    </div>

                    <div class="st-mk-section">
                        <div class="st-mk-section-title">开场导入导出</div>
                        <p class="st-mk-hint">导出 → 外面汉化 → 导入 → 保存角色卡。角色编辑页也有同款按钮。</p>
                        <div class="st-mk-btn-grid">
                            <button type="button" id="st_mk_gio_first_export" class="menu_button st-mk-action-btn">导出主开场</button>
                            <button type="button" id="st_mk_gio_first_import" class="menu_button st-mk-action-btn">导入主开场</button>
                            <button type="button" id="st_mk_gio_alt_export" class="menu_button st-mk-action-btn">导出候选</button>
                            <button type="button" id="st_mk_gio_alt_import" class="menu_button st-mk-action-btn">导入候选</button>
                        </div>
                    </div>

                    <div class="st-mk-section">
                        <label class="checkbox_label st-mk-check" for="st_mk_show_advanced">
                            <input type="checkbox" id="st_mk_show_advanced" ${s.showAdvanced ? 'checked' : ''}/>
                            <span>显示高级选项</span>
                        </label>
                        <div id="st_mk_advanced" class="st-mk-advanced" style="${s.showAdvanced ? '' : 'display:none;'}">
                            <div class="st-mk-subsection">开场</div>
                            <button type="button" id="st_mk_gio_restore" class="menu_button st-mk-action-btn">还原首次导出原文</button>
                            <div class="st-mk-subsection">置顶归档</div>
                            <div class="st-mk-btn-grid">
                                <button type="button" id="st_mk_cpa_clear_pins" class="menu_button st-mk-action-btn">清空全部置顶</button>
                                <button type="button" id="st_mk_cpa_clear_arch" class="menu_button st-mk-action-btn">清空全部归档</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    $target.prepend(html);
    hideLegacyModulePanels();

    const refreshNote = () => toastr.info('已保存。刷新页面后生效。', '酒馆小工具');

    $('#st_mk_tog_pin').on('change', function () {
        ensureKitSettings().pinArchive = $(this).is(':checked');
        saveKit();
        refreshNote();
    });
    $('#st_mk_tog_greeting').on('change', function () {
        ensureKitSettings().firstMesZh = $(this).is(':checked');
        saveKit();
        refreshNote();
    });
    $('#st_mk_tog_share').on('change', function () {
        ensureKitSettings().shareChat = $(this).is(':checked');
        saveKit();
        refreshNote();
    });
    $('#st_mk_share_limit').on('change', function () {
        let n = parseInt($(this).val(), 10);
        if (!Number.isFinite(n) || n < 0) n = 100;
        ensureKitSettings().shareChatLimit = n;
        saveKit();
        toastr.info(n === 0 ? '已保存：导出全部聊天。' : `已保存：最近 ${n} 条。`, '酒馆小工具');
    });
    $('#st_mk_show_advanced').on('change', function () {
        const on = $(this).is(':checked');
        ensureKitSettings().showAdvanced = on;
        saveKit();
        $('#st_mk_advanced').toggle(on);
    });


    $('#st_mk_cpa_clear_pins').on('click', function () {
        ensureCpaSettings().pinned = [];
        saveSettingsDebounced();
        toastr.success('已清空置顶', '酒馆小工具');
        try { if (typeof printCharactersDebounced === 'function') printCharactersDebounced(); } catch (_) { /* ignore */ }
    });
    $('#st_mk_cpa_clear_arch').on('click', function () {
        const c = ensureCpaSettings();
        c.archived = [];
        c.showArchivedOnly = false;
        saveSettingsDebounced();
        toastr.success('已清空归档', '酒馆小工具');
        try { if (typeof printCharactersDebounced === 'function') printCharactersDebounced(); } catch (_) { /* ignore */ }
    });

    $('#st_mk_run_share').on('click', async function () {
        try {
            ensureKitSettings().shareChat = true;
            $('#st_mk_tog_share').prop('checked', true);
            saveKit();
            const m = await import('./modules/share-chat-txt.js');
            m.initShareChatTxt();
            await m.shareCurrentChat();
        } catch (e) {
            console.error(LOG, e);
            toastr.error(String(e && e.message ? e.message : e), '复制失败');
        }
    });

    async function withGreetingIo(fn) {
        ensureKitSettings().firstMesZh = true;
        $('#st_mk_tog_greeting').prop('checked', true);
        saveKit();
        const m = await import('./modules/greeting-io.js');
        m.initGreetingIo();
        await fn(m);
    }
    $('#st_mk_gio_first_export').on('click', async function () {
        try { await withGreetingIo((m) => m.exportFirstMes()); }
        catch (e) { console.error(LOG, e); toastr.error(String(e && e.message ? e.message : e), '导出失败'); }
    });
    $('#st_mk_gio_first_import').on('click', async function () {
        try { await withGreetingIo((m) => m.importFirstMes()); }
        catch (e) { console.error(LOG, e); toastr.error(String(e && e.message ? e.message : e), '导入失败'); }
    });
    $('#st_mk_gio_alt_export').on('click', async function () {
        try { await withGreetingIo((m) => m.exportAltGreetings()); }
        catch (e) { console.error(LOG, e); toastr.error(String(e && e.message ? e.message : e), '导出失败'); }
    });
    $('#st_mk_gio_alt_import').on('click', async function () {
        try { await withGreetingIo((m) => m.importAltGreetings()); }
        catch (e) { console.error(LOG, e); toastr.error(String(e && e.message ? e.message : e), '导入失败'); }
    });
    $('#st_mk_gio_restore').on('click', async function () {
        try { await withGreetingIo((m) => m.restoreOriginalBackup()); }
        catch (e) { console.error(LOG, e); toastr.error(String(e && e.message ? e.message : e), '还原失败'); }
    });

    return true;
}

function waitKitPanel() {
    if (injectKitPanel()) return;
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        hideLegacyModulePanels();
        if (injectKitPanel() || tries > 60) clearInterval(timer);
    }, 500);
}

jQuery(() => {
    try {
        const s = ensureKitSettings();
        waitKitPanel();
        setInterval(hideLegacyModulePanels, 2000);

        if (s.pinArchive) {
            initPinArchive({ skipSettingsPanel: true });
        } else {
            console.log(LOG, '角色置顶与归档已关闭');
        }

        if (s.firstMesZh) {
            import('./modules/greeting-io.js')
                .then((m) => m.initGreetingIo())
                .catch((err) => {
                    console.error(LOG, '开场导入导出加载失败', err);
                    toastr.error('开场导入导出加载失败，请看控制台', '酒馆小工具');
                });
        } else {
            console.log(LOG, '开场导入导出已关闭');
        }

        if (s.shareChat) {
            import('./modules/share-chat-txt.js')
                .then((m) => m.initShareChatTxt())
                .catch((err) => {
                    console.error(LOG, '聊天复制模块加载失败', err);
                    toastr.error('聊天复制模块加载失败，请看控制台', '酒馆小工具');
                });
        } else {
            console.log(LOG, '聊天复制已关闭');
        }

        const parts = [];
        if (s.pinArchive) parts.push('置顶归档');
        if (s.firstMesZh) parts.push('开场导入导出');
        if (s.shareChat) parts.push('聊天复制');
        console.log(LOG, `loaded v${VERSION}`, parts.length ? parts.join('+') : 'all off', s);
    } catch (e) {
        console.error(LOG, 'init failed', e);
        toastr.error('合集加载失败，请看控制台', '酒馆小工具');
    }
});
