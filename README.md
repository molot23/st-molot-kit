# 酒馆小工具合集（st-molot-kit）

把常用小插件合成一个扩展，少装几个：

| 模块 | 原仓库 | 说明 |
|------|--------|------|
| API 自动重试 | [st-api-auto-retry](https://github.com/molot23/st-api-auto-retry) | 对话生成失败时自动重试 |
| 角色置顶与归档 | [st-char-pin-archive](https://github.com/molot23/st-char-pin-archive) | 列表置顶 / 归档隐藏 |

**不含** [Megumin Suite 汉化版](https://github.com/molot23/Megumin-Suite-zh)（体积大、职责不同，请继续单独装）。

## 安装

SillyTavern → 扩展 → 安装 URL：

```
https://github.com/molot23/st-molot-kit
```

启用「酒馆小工具合集」后刷新。

若你以前装过上面两个单独插件：**先装合集并确认功能正常 → 再禁用/删除那两个单独扩展**，避免重复劫持 `fetch` 或重复按钮。

旧设置键名保持不变（`st-api-auto-retry` / `st-char-pin-archive`），一般不用重配。

## 模块开关

扩展设置里「酒馆小工具合集」可分别开关；改完需刷新。

## 版本

1.0.0
