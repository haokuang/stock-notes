/**
 * H5 端特殊样式注入
 * 如无必要，请勿修改本文件
 */

import { IS_H5_ENV } from './env';

const H5_BASE_STYLES = `
/* Taro H5 textarea 默认 -internal 白色背景,显式覆盖让 wrapper 灰底透出来 */
textarea.taro-textarea {
    background-color: transparent !important;
}

/* H5 端隐藏 TabBar 空图标（只隐藏没有 src 的图标） */
.weui-tabbar__icon:not([src]),
.weui-tabbar__icon[src=''] {
  display: none !important;
}

.weui-tabbar__item:has(.weui-tabbar__icon:not([src])) .weui-tabbar__label,
.weui-tabbar__item:has(.weui-tabbar__icon[src='']) .weui-tabbar__label {
  margin-top: 0 !important;
}

/* Vite 错误覆盖层无法选择文本的问题 */
vite-error-overlay {
  /* stylelint-disable-next-line property-no-vendor-prefix */
  -webkit-user-select: text !important;
}

vite-error-overlay::part(window) {
  max-width: 90vw;
  padding: 10px;
}

.taro_page {
  overflow: auto;
}

::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* H5 导航栏页面自动添加顶部间距 */
body.h5-navbar-visible .taro_page {
  padding-top: 44px;
}

body.h5-navbar-visible .toaster[data-position^="top"] {
  top: 44px !important;
}

/* Sheet 组件在 H5 导航栏下的位置修正 */
body.h5-navbar-visible .sheet-content:not([data-side="bottom"]) {
    top: 44px !important;
}

/*
 * H5 端 rem 适配：与小程序 rpx 缩放一致
 * 375px 屏幕：1rem = 16px，小程序 32rpx = 16px
 */
html {
    font-size: 4.2667vw !important;
}

/* H5 端组件默认样式修复 */
taro-view-core {
    display: block;
}

taro-text-core {
    display: inline;
}

taro-input-core {
    display: block;
    width: 100%;
}

taro-input-core input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
}

taro-input-core.taro-otp-hidden-input input {
    color: transparent;
    caret-color: transparent;
    -webkit-text-fill-color: transparent;
}

/* 全局按钮样式重置 */
taro-button-core,
button {
    margin: 0 !important;
    padding: 0 !important;
    line-height: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
}

taro-button-core::after,
button::after {
    border: none;
}

taro-textarea-core > textarea,
.taro-textarea,
textarea.taro-textarea {
    resize: none !important;
}
`;

const PC_WIDESCREEN_STYLES = `
/* PC 宽屏适配 - 基础布局 */
@media (min-width: 769px) {
  html {
    font-size: clamp(14px, 1vw, 16px) !important;
  }

  body {
    background-color: #EEF0F6 !important;
    min-height: 100vh !important;
  }
}
`;

const PC_WIDESCREEN_RESPONSIVE_SHELL = `
/* PC 宽屏适配 - 响应式网页壳（有 TabBar 页面） */
@media (min-width: 769px) {
  .taro-tabbar__container {
    width: 100% !important;
    max-width: 1180px !important;
    min-height: 100vh !important;
    margin: 0 auto !important;
    background-color: #EEF0F6 !important;
    transform: translateX(0) !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
    position: relative !important;
  }

  .taro-tabbar__panel {
    height: auto !important;
    min-height: 100vh !important;
    overflow: visible !important;
  }
}

/* PC 宽屏适配 - Toast 定位到网页内容范围内 */
@media (min-width: 769px) {
  body .toaster {
    left: 50% !important;
    right: auto !important;
    width: 100% !important;
    max-width: 1180px !important;
    transform: translateX(-50%) !important;
    box-sizing: border-box !important;
  }
}

/* PC 宽屏适配 - 响应式网页壳（无 TabBar 页面，通过 JS 添加 no-tabbar 类） */
@media (min-width: 769px) {
  body.no-tabbar #app {
    width: 100% !important;
    max-width: 1180px !important;
    min-height: 100vh !important;
    margin: 0 auto !important;
    background-color: #EEF0F6 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
    position: relative !important;
    transform: translateX(0) !important;
  }

  body.no-tabbar #app .taro_router {
    height: auto !important;
    min-height: 100vh !important;
    overflow: visible !important;
  }
}
`;

export function buildH5InjectedStyles() {
  return H5_BASE_STYLES + PC_WIDESCREEN_STYLES + PC_WIDESCREEN_RESPONSIVE_SHELL;
}

function injectStyles() {
  const style = document.createElement('style');
  style.innerHTML = buildH5InjectedStyles();
  document.head.appendChild(style);
}

function setupTabbarDetection() {
  const checkTabbar = () => {
    const hasTabbar = !!document.querySelector('.taro-tabbar__container');
    document.body.classList.toggle('no-tabbar', !hasTabbar);
  };

  checkTabbar();

  const observer = new MutationObserver(checkTabbar);
  observer.observe(document.body, { childList: true, subtree: true });
}

export function injectH5Styles() {
  if (!IS_H5_ENV) return;

  injectStyles();
  setupTabbarDetection();
}
