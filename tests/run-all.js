/*
    TakeFive - Website Time Tracker & Blocker
    Copyright (C) 2026  Xue Tianhao (GitHub: @lumiaxth)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
/*
 * run-all.js — 测试统一入口：逐个运行 tests/test_*.js，汇总退出码。
 * 用法：npm test（或 node tests/run-all.js）
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = __dirname;
const files = fs
  .readdirSync(testsDir)
  .filter((f) => /^test_.+\.js$/.test(f))
  .sort();

if (files.length === 0) {
  console.error('No test files found in', testsDir);
  process.exit(1);
}

const failed = [];
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(testsDir, file)], {
    stdio: 'inherit',
    timeout: 120000
  });
  const ok = result.status === 0;
  console.log(ok ? '[ OK  ] ' + file : '[ FAIL] ' + file);
  if (!ok) failed.push(file);
}

console.log('----');
if (failed.length === 0) {
  console.log('ALL ' + files.length + ' TEST FILES PASS');
  process.exit(0);
} else {
  console.log(failed.length + ' TEST FILE(S) FAILED: ' + failed.join(', '));
  process.exit(1);
}
