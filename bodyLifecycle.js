export function beginBodyRemovalState(body) {
  if (!body) {
    return body;
  }
  body.removing = true;
  body.clearOccupying = false;
  body.clearOccupyX = null;
  body.clearOccupyY = null;
  body.inChain = false;
  return body;
}

export function isBodyPhysicsActive(body) {
  return !!body && !body.dead && !body.removing;
}

export function isBodyOccupying(body) {
  return isBodyPhysicsActive(body);
}

export function isBodyVisible(body) {
  return !!body && !body.dead;
}
