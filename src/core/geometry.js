// Calcule l'angle au sommet b, forme par les segments b->a et b->c, en degres.
export function angleAt(a, b, c) {
  const rad = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs((rad * 180) / Math.PI);
  if (deg > 180) deg = 360 - deg;
  return deg;
}

export function isVisible(point, threshold) {
  return Boolean(point) && (point.visibility === undefined || point.visibility >= threshold);
}

export function areVisible(points, threshold) {
  return points.every((p) => isVisible(p, threshold));
}
