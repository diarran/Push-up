import { formatShortDate } from "../../core/date.js";

// [{ date, total }] -> SVG (chaine). Pas de dependance graphique : un
// simple polyline/area suffit pour une tendance sur quelques semaines.
export function renderLineChart(data, { width = 320, height = 160 } = {}) {
  const padding = 24;
  const max = Math.max(...data.map((d) => d.total), 1);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const stepX = innerWidth / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => {
    const x = padding + i * stepX;
    const y = padding + innerHeight - (d.total / max) * innerHeight;
    return [x, y];
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const floorY = (height - padding).toFixed(1);
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${floorY} L${points[0][0].toFixed(1)},${floorY} Z`;

  const labelEvery = Math.max(Math.ceil(data.length / 5), 1);
  const lastIndex = data.length - 1;
  const labelIndices = new Set();
  for (let i = 0; i < data.length; i += labelEvery) labelIndices.add(i);
  // Le dernier point est toujours affiche ; s'il est trop proche du repere
  // regulier precedent, on retire ce dernier plutot que de les superposer.
  const previousShown = Math.max(-1, ...Array.from(labelIndices).filter((i) => i < lastIndex));
  if (previousShown >= 0 && lastIndex - previousShown < labelEvery) labelIndices.delete(previousShown);
  labelIndices.add(lastIndex);

  const labels = Array.from(labelIndices)
    .map((i) => `<text x="${points[i][0].toFixed(1)}" y="${height - 6}" class="chartLabel">${formatShortDate(data[i].date)}</text>`)
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chartSvg" preserveAspectRatio="none" role="img" aria-label="Repetitions par jour">
      <line x1="${padding}" y1="${floorY}" x2="${width - padding}" y2="${floorY}" class="chartAxis" />
      <path d="${areaPath}" class="chartArea" />
      <path d="${linePath}" class="chartLine" />
      ${labels}
    </svg>
  `;
}
