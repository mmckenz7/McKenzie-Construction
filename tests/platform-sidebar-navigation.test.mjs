import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync("src/app/globals.css", "utf8");

test("expanded desktop navigation scrolls inside the fixed sidebar", () => {
  const navigationRule = styles.match(/\.platform-nav \{[^}]+\}/)?.[0] ?? "";
  assert.match(navigationRule, /min-height: 0/);
  assert.match(navigationRule, /flex: 1 1 auto/);
  assert.match(navigationRule, /max-height: calc\(100vh - 285px\)/);
  assert.match(navigationRule, /overflow-y: scroll/);
  assert.match(navigationRule, /scrollbar-gutter: stable/);
  assert.match(navigationRule, /overscroll-behavior: contain/);
  assert.match(styles, /\.platform-nav::-webkit-scrollbar-thumb/);
  assert.match(styles, /\.platform-sidebar-footer \{[^}]*flex: 0 0 auto/);
  const groupRule = styles.match(/\.platform-nav-group \{[^}]+\}/)?.[0] ?? "";
  assert.match(groupRule, /min-height: max-content/);
  assert.match(groupRule, /flex: 0 0 auto/);
  assert.match(groupRule, /overflow: visible/);
});

test("compact navigation retains horizontal scrolling", () => {
  const compact = styles.match(/@media \(max-width: 1023px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(compact, /\.platform-nav \{[^}]*overflow-x: auto/);
  assert.match(compact, /overflow-y: visible/);
  assert.match(compact, /max-height: none/);
});
