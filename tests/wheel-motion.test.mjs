import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLockMotion,
  getBranchReveal,
  getShackleTransform,
} from '../src/utils/wheelMotion.ts';

const branchCount = 5;
const samples = Array.from({ length: 1001 }, (_, index) => index / 1000);
const closedLock = getLockMotion(0);
const openLock = getLockMotion(1);
const revealsAt = (progress) =>
  Array.from({ length: branchCount }, (_, index) => getBranchReveal(progress, index));

test('the shackle lifts clear before rotating and emits a valid CSS transform', () => {
  assert.ok(openLock.lift < closedLock.lift, 'opening lifts the shackle');
  assert.notEqual(openLock.angle, closedLock.angle, 'opening rotates the shackle');
  assert.ok(samples.some((progress) => {
    const lock = getLockMotion(progress);
    return lock.lift !== closedLock.lift && lock.lift !== openLock.lift;
  }), 'the lift has an intermediate phase');

  for (const progress of samples) {
    const lock = getLockMotion(progress);
    if (lock.lift !== openLock.lift) {
      assert.equal(lock.angle, closedLock.angle, 'rotation waits for the lift to finish');
    }
    const transform = getShackleTransform(progress);
    assert.match(transform, /^translateY\([-\d.e+]+px\) rotate\([-\d.e+]+deg\)$/,
      'the transform supplies CSS units for the lift and rotation');
  }
});

test('branches stay hidden until the shackle and rim have finished opening', () => {
  for (const progress of samples) {
    if (revealsAt(progress).some((reveal) => reveal > 0)) {
      assert.deepEqual(getLockMotion(progress), openLock,
        'no node or track reveal while the lock is still opening');
    }
  }
});

test('all five branches reveal in order and are fully visible at the open endpoint', () => {
  assert.deepEqual(revealsAt(0), [0, 0, 0, 0, 0]);
  assert.deepEqual(revealsAt(1), [1, 1, 1, 1, 1]);

  const starts = Array.from({ length: branchCount }, (_, index) =>
    samples.find((progress) => getBranchReveal(progress, index) > 0));
  for (let index = 1; index < branchCount; index += 1) {
    assert.ok(starts[index] > starts[index - 1], 'each branch begins after its predecessor');
  }

  let previous = revealsAt(0);
  for (const progress of samples) {
    const current = revealsAt(progress);
    current.forEach((reveal, index) => {
      assert.ok(reveal >= previous[index], 'opening never makes a revealed branch retreat');
      if (index > 0) assert.ok(reveal <= current[index - 1], 'later branches never overtake earlier ones');
    });
    previous = current;
  }
});

test('reversing the playhead hides every branch before the shackle rotates home and seats', () => {
  let previous = revealsAt(1);
  for (const progress of [...samples].reverse()) {
    const lock = getLockMotion(progress);
    const current = revealsAt(progress);
    current.forEach((reveal, index) => {
      assert.ok(reveal <= previous[index], 'closing never makes a branch reappear');
    });
    if (lock.angle !== openLock.angle) {
      assert.deepEqual(current, [0, 0, 0, 0, 0], 'branches finish retracting before the hinge closes');
    }
    if (lock.lift !== openLock.lift) {
      assert.equal(lock.angle, closedLock.angle, 'the hinge returns before the shackle seats');
    }
    previous = current;
  }
  assert.deepEqual(previous, [0, 0, 0, 0, 0]);
});

test('overshooting progress clamps to finite closed and open poses', () => {
  for (const progress of [-100, -1, 0, ...samples, 1, 2, 100]) {
    const lock = getLockMotion(progress);
    const reveals = revealsAt(progress);
    assert.ok(Object.values(lock).every(Number.isFinite));
    assert.ok(reveals.every((reveal) => Number.isFinite(reveal) && reveal >= 0 && reveal <= 1));
    assert.doesNotMatch(getShackleTransform(progress), /NaN|Infinity/);
    if (progress <= 0) {
      assert.deepEqual(lock, closedLock);
      assert.deepEqual(reveals, [0, 0, 0, 0, 0]);
    }
    if (progress >= 1) {
      assert.deepEqual(lock, openLock);
      assert.deepEqual(reveals, [1, 1, 1, 1, 1]);
    }
  }
});
