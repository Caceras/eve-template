import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDrag,
  dragProgress,
  FLING_SPEED,
  releaseVelocity,
  settleDuration,
  settleTarget,
} from "../lib/chat/drawer-gesture.ts";

test("a drag commits only once it clearly moves sideways in the drawer's direction", () => {
  assert.equal(classifyDrag("open", 4, 2), "pending");
  assert.equal(classifyDrag("open", 20, 3), "drag");
  assert.equal(classifyDrag("open", -20, 3), "ignore", "a left swipe never opens");
  assert.equal(classifyDrag("close", -20, 3), "drag");
  assert.equal(classifyDrag("close", 20, 3), "ignore", "a right swipe never closes");
  assert.equal(classifyDrag("open", 12, 30), "ignore", "vertical scrolling stays with the page");
});

test("the drawer follows the finger one to one and stays within its track", () => {
  assert.equal(dragProgress(0, 150, 300), 0.5);
  assert.equal(dragProgress(1, -75, 300), 0.75);
  assert.equal(dragProgress(0, 900, 300), 1);
  assert.equal(dragProgress(1, -900, 300), 0);
});

test("release velocity reads the most recent 100 ms", () => {
  assert.equal(releaseVelocity([]), 0);
  assert.equal(
    releaseVelocity([
      { x: 0, t: 0 },
      { x: 10, t: 200 },
      { x: 60, t: 250 },
      { x: 110, t: 300 },
    ]),
    1,
  );
});

test("the thumb's last direction wins; a still release settles on the nearer side", () => {
  assert.equal(settleTarget(0.2, FLING_SPEED), 1);
  assert.equal(settleTarget(0.9, -FLING_SPEED), 0);
  assert.equal(settleTarget(0.6, 0), 1);
  assert.equal(settleTarget(0.4, 0.05), 0);
});

test("settling is quick after a fling and never sluggish", () => {
  assert.ok(settleDuration(300, 3) < settleDuration(300, 0));
  assert.equal(settleDuration(0, 0), 140);
  assert.equal(settleDuration(2000, 0), 300);
});
