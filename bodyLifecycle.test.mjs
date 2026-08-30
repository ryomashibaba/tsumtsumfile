import assert from "node:assert/strict";
import test from "node:test";

import {
  beginBodyRemovalState,
  isBodyOccupying,
  isBodyPhysicsActive,
  isBodyVisible
} from "./bodyLifecycle.js";

test("body lifecycle keeps waiting Tsums solid and makes removing Tsums visual-only", () => {
  const normal = { dead: false, removing: false, clearOccupying: false };
  const waiting = { dead: false, removing: false, clearOccupying: true };
  const removing = { dead: false, removing: true, clearOccupying: true };
  const dead = { dead: true, removing: false, clearOccupying: false };

  assert.deepEqual(
    [normal, waiting, removing, dead].map((body) => ({
      physics: isBodyPhysicsActive(body),
      occupying: isBodyOccupying(body),
      visible: isBodyVisible(body)
    })),
    [
      { physics: true, occupying: true, visible: true },
      { physics: true, occupying: true, visible: true },
      { physics: false, occupying: false, visible: true },
      { physics: false, occupying: false, visible: false }
    ]
  );
});

test("every removal route releases frozen chain occupancy at removal start", () => {
  for (const route of ["chain", "splash", "large-final-step", "bomb-cancel"]) {
    const body = {
      route,
      dead: false,
      removing: false,
      clearOccupying: true,
      clearOccupyX: 180,
      clearOccupyY: 420,
      inChain: true
    };

    beginBodyRemovalState(body);

    assert.equal(body.removing, true, route);
    assert.equal(body.clearOccupying, false, route);
    assert.equal(body.clearOccupyX, null, route);
    assert.equal(body.clearOccupyY, null, route);
    assert.equal(body.inChain, false, route);
    assert.equal(isBodyOccupying(body), false, route);
    assert.equal(isBodyVisible(body), true, route);
  }
});
