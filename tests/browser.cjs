// 導入済みplaywright-coreが持つChromiumの実行pathを一箇所で解決する。
// 版でpath形が変わってもtest側の記述を変えずに固定browserへ追従する。

'use strict';

const path = require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve(__dirname, '../tmp/playwright-browsers');
const { chromium, firefox, webkit } = require('../tmp/playwright/node_modules/playwright-core');

const browserPath = chromium.executablePath(); // package-lock.jsonで固定したChromium。

module.exports = { browserPath, chromium, firefox, webkit };
