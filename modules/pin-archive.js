/**
 * Module: character pin & archive (from st-char-pin-archive v1.0.2)
 * Settings key kept as st-char-pin-archive for migration continuity.
 */
import {
    eventSource,
    event_types,
    characters,
    printCharactersDebounced,
    entitiesFilter,
    saveSettingsDebounced,
} from '../../../../../script.js';
import {
    extension_settings,
} from '../../../../extensions.js';

const MODULE = 'st-char-pin-archive';
const LOG = '[角色置顶归档]';
const VERSION = '1.0.2';
let skipSettingsPanel = false;

const defaultSettings = () => ({
    /** @type {string[]} avatar filenames */
    pinned: [],
    /** @type {string[]} avatar filenames */
    archived: [],
    /** false = hide archived; true = show only archived */
    showArchivedOnly: false,
});

function ensureSettings() {
    if (!extension_settings[MODULE] || typeof extension_settings[MODULE] !== 'object') {
        extension_settings[MODULE] = defaultSettings();
    }
    const s = extension_settings[MODULE];
    if (!Array.isArray(s.pinned)) s.pinned = [];
    if (!Array.isArray(s.archived)) s.archived = [];
    if (typeof s.showArchivedOnly !== 'boolean') s.showArchivedOnly = false;
    return s;
}

function save() {
    ensureSettings();
    saveSettingsDebounced();
}

function isPinned(avatar) {
    return !!avatar && ensureSettings().pinned.includes(avatar);
}

function isArchived(avatar) {
    return !!avatar && ensureSettings().archived.includes(avatar);
}

function togglePinned(avatar) {
    if (!avatar) return;
    const s = ensureSettings();
    const i = s.pinned.indexOf(avatar);
    if (i >= 0) s.pinned.splice(i, 1);
    else {
        s.pinned.push(avatar);
        // pinned characters should not stay archived
        const a = s.archived.indexOf(avatar);
        if (a >= 0) s.archived.splice(a, 1);
    }
    save();
    printCharactersDebounced();
}

function toggleArchived(avatar) {
    if (!avatar) return;
    const s = ensureSettings();
    const i = s.archived.indexOf(avatar);
    if (i >= 0) s.archived.splice(i, 1);
    else {
        s.archived.push(avatar);
        const p = s.pinned.indexOf(avatar);
        if (p >= 0) s.pinned.splice(p, 1);
    }
    save();
    printCharactersDebounced();
}

function avatarFromEntity(entity) {
    if (!entity || entity.type !== 'character') return null;
    return entity.item?.avatar || null;
}

/**
 * Array subclass so sortEntitiesList's entities.sort(compareFn) keeps pins on top.
 * Tags/folders still win via the original comparator (it already forces tags first).
 */
class PinAwareArray extends Array {
    sort(compareFn) {
        const pinnedSet = new Set(ensureSettings().pinned);
        return super.sort((a, b) => {
            if (a?.type === 'tag' || b?.type === 'tag') {
                return compareFn ? compareFn(a, b) : 0;
            }
            const aPin = a?.type === 'character' && pinnedSet.has(a.item?.avatar);
            const bPin = b?.type === 'character' && pinnedSet.has(b.item?.avatar);
            if (aPin !== bPin) return aPin ? -1 : 1;
            return compareFn ? compareFn(a, b) : 0;
        });
    }
}

function toPinAware(list) {
    if (!Array.isArray(list)) return list;
    const out = new PinAwareArray();
    for (const item of list) out.push(item);
    return out;
}

function applyArchiveFilter(list) {
    const s = ensureSettings();
    const archived = new Set(s.archived);
    if (!archived.size && !s.showArchivedOnly) return toPinAware(list);

    const filtered = list.filter((entity) => {
        if (entity.type !== 'character') return true;
        const avatar = avatarFromEntity(entity);
        const arch = archived.has(avatar);
        if (s.showArchivedOnly) return arch;
        return !arch;
    });
    return toPinAware(filtered);
}

function patchEntitiesFilter() {
    if (entitiesFilter.__stPinArchivePatched) return;
    const original = entitiesFilter.applyFilters.bind(entitiesFilter);
    entitiesFilter.applyFilters = function (data, options) {
        const result = original(data, options);
        try {
            return applyArchiveFilter(result);
        } catch (e) {
            console.error(LOG, 'applyArchiveFilter failed', e);
            return result;
        }
    };
    entitiesFilter.__stPinArchivePatched = true;
}

function migrateAvatarKey(oldAvatar, newAvatar) {
    if (!oldAvatar || !newAvatar || oldAvatar === newAvatar) return;
    const s = ensureSettings();
    let changed = false;
    for (const key of ['pinned', 'archived']) {
        const arr = s[key];
        const i = arr.indexOf(oldAvatar);
        if (i >= 0) {
            arr[i] = newAvatar;
            changed = true;
        }
    }
    if (changed) save();
}

function removeDeletedAvatar(avatar) {
    if (!avatar) return;
    const s = ensureSettings();
    let changed = false;
    for (const key of ['pinned', 'archived']) {
        const i = s[key].indexOf(avatar);
        if (i >= 0) {
            s[key].splice(i, 1);
            changed = true;
        }
    }
    if (changed) save();
}

function injectToolbar() {
    // Prefer #rm_buttons_container (ST's extension slot on the create/import row).
    // Fallback: rm_button_bar, then tag filter row — mobile layouts often hide
    // overflow next to the sort <select>, which made the old toggle invisible.
    if ($('#st_cpa_toggle_archive_view').length) {
        syncToolbarState();
        return;
    }
    if (!$('#rm_button_bar').length && !$('.rm_tag_controls').length) return;

    const $btn = $(`
        <div id="st_cpa_toggle_archive_view"
             class="menu_button fa-solid fa-box-archive st-cpa-toolbtn"
             title="查看归档角色（再点返回主列表）"
             role="button"
             tabindex="0"></div>
    `);
    const $count = $(`<span id="st_cpa_counts" class="st-cpa-counts"></span>`);

    const $host = $('#rm_buttons_container');
    if ($host.length) {
        $host.append($btn);
        $host.append($count);
    } else if ($('#rm_button_bar').length) {
        $('#character_sort_order').before($btn);
        $btn.after($count);
    } else {
        $('.rm_tag_controls').first().prepend($btn, $count);
    }

    const toggle = () => {
        const s = ensureSettings();
        s.showArchivedOnly = !s.showArchivedOnly;
        save();
        syncToolbarState();
        printCharactersDebounced();
        toastr.info(
            s.showArchivedOnly
                ? `正在查看归档（${s.archived.length}）`
                : '已回到主列表（归档已隐藏）',
            '角色置顶与归档',
        );
    };
    $btn.on('click', toggle);
    $btn.on('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
        }
    });
    syncToolbarState();
}

function syncToolbarState() {
    const s = ensureSettings();
    const $btn = $('#st_cpa_toggle_archive_view');
    $btn.toggleClass('st-cpa-active', !!s.showArchivedOnly);
    $btn.attr(
        'title',
        s.showArchivedOnly
            ? '当前：仅看归档（点此返回主列表）'
            : `查看归档角色（已归档 ${s.archived.length}）`,
    );
    const $c = $('#st_cpa_counts');
    if ($c.length) $c.text(`钉${s.pinned.length} · 档${s.archived.length}`);
}

function avatarFromCharacterBlock($el) {
    const chid = $el.attr('data-chid') ?? $el.attr('chid');
    if (chid === undefined || chid === null || chid === '') return null;
    const idx = Number(chid);
    if (!Number.isFinite(idx)) return null;
    return characters[idx]?.avatar || null;
}

function decorateCharacterBlocks() {
    const s = ensureSettings();
    $('#rm_print_characters_block .character_select').each(function () {
        const $el = $(this);
        if ($el.find('.st-cpa-actions').length) {
            // refresh state classes
            const avatar = avatarFromCharacterBlock($el);
            $el.toggleClass('st-cpa-pinned', isPinned(avatar));
            $el.toggleClass('st-cpa-archived', isArchived(avatar));
            $el.find('.st-cpa-pin').toggleClass('st-cpa-on', isPinned(avatar));
            $el.find('.st-cpa-archive').toggleClass('st-cpa-on', isArchived(avatar));
            return;
        }

        const avatar = avatarFromCharacterBlock($el);
        if (!avatar) return;

        const pinned = isPinned(avatar);
        const archived = isArchived(avatar);
        $el.toggleClass('st-cpa-pinned', pinned);
        $el.toggleClass('st-cpa-archived', archived);

        const $actions = $(`
            <div class="st-cpa-actions">
                <button type="button" class="st-cpa-btn st-cpa-pin ${pinned ? 'st-cpa-on' : ''}" title="置顶 / 取消置顶">
                    <i class="fa-solid fa-thumbtack"></i>
                </button>
                <button type="button" class="st-cpa-btn st-cpa-archive ${archived ? 'st-cpa-on' : ''}" title="归档 / 取消归档">
                    <i class="fa-solid fa-box-archive"></i>
                </button>
            </div>
        `);

        $actions.find('.st-cpa-pin').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePinned(avatarFromCharacterBlock($el));
        });
        $actions.find('.st-cpa-archive').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const av = avatarFromCharacterBlock($el);
            const willArchive = !isArchived(av);
            toggleArchived(av);
            if (willArchive) toastr.info('已归档（主列表中隐藏）', '角色置顶与归档');
        });

        // Prefer placing next to the name row
        const $nameRow = $el.find('.character_name_block, .ch_name').first().parent();
        if ($nameRow.length) $nameRow.append($actions);
        else $el.append($actions);
    });

    scrubArchivedFromHotswap();
    syncToolbarState();
}

function scrubArchivedFromHotswap() {
    const archived = new Set(ensureSettings().archived);
    if (!archived.size) return;
    $('#right-nav-panel .hotswap .character_select, #HotSwapWrapper .character_select').each(function () {
        const avatar = avatarFromCharacterBlock($(this));
        if (avatar && archived.has(avatar)) $(this).remove();
    });
}

function addSettingsPanel() {
    if ($('#st_cpa_settings').length) return;
    const html = `
        <div id="st_cpa_settings" class="st-cpa-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>角色置顶与归档</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <p class="st-cpa-help">
                        在角色列表每张卡上使用图钉（置顶）与箱子（归档）。
                        归档角色默认从主列表隐藏，点工具栏箱子图标可切换「仅看归档」。
                        数据按头像文件名保存在本机扩展设置中，不会写入角色卡。
                    </p>
                    <div class="flex-container gap10px">
                        <button type="button" id="st_cpa_clear_pins" class="menu_button">清空全部置顶</button>
                        <button type="button" id="st_cpa_clear_archives" class="menu_button">清空全部归档</button>
                    </div>
                    <small class="st-cpa-ver">v${VERSION}</small>
                </div>
            </div>
        </div>`;
    $('#extensions_settings').append(html);
    $('#st_cpa_clear_pins').on('click', () => {
        ensureSettings().pinned = [];
        save();
        printCharactersDebounced();
        toastr.success('已清空置顶');
    });
    $('#st_cpa_clear_archives').on('click', () => {
        ensureSettings().archived = [];
        ensureSettings().showArchivedOnly = false;
        save();
        printCharactersDebounced();
        toastr.success('已清空归档');
    });
}

function bindEvents() {
    eventSource.on(event_types.CHARACTER_PAGE_LOADED, () => {
        injectToolbar();
        decorateCharacterBlocks();
    });
    eventSource.on(event_types.CHARACTER_RENAMED, (oldAvatar, newAvatar) => {
        migrateAvatarKey(oldAvatar, newAvatar);
    });
    eventSource.on(event_types.CHARACTER_DELETED, (data) => {
        const avatar = data?.character?.avatar || data?.avatar || null;
        removeDeletedAvatar(avatar);
    });
    eventSource.on(event_types.APP_READY, () => {
        injectToolbar();
        if (!skipSettingsPanel) addSettingsPanel();
        printCharactersDebounced();
    });
}

export function initPinArchive(options = {}) {
    try {
        skipSettingsPanel = !!(options && options.skipSettingsPanel);
        ensureSettings();
        patchEntitiesFilter();
        bindEvents();
        if (!skipSettingsPanel) addSettingsPanel();
        injectToolbar();
        console.log(LOG, `module loaded v${VERSION}`);
    } catch (e) {
        console.error(LOG, 'init failed', e);
    }
}
