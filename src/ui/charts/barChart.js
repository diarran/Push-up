import { escapeHtml } from "../escapeHtml.js";

// [{ label, total }] -> SVG (chaine). Barres horizontales, une par ligne.
export function renderBarChart(data, { width = 320, barHeight = 22, gap = 12 } = {}) {
  const max = Math.max(...data.map((d) => d.total), 1);
  const labelWidth = 96;
  const valueWidth = 40;
  const chartWidth = width - labelWidth - valueWidth;
  const height = data.length * (barHeight + gap);

  const bars = data
    .map((d, i) => {
      const y = i * (barHeight + gap);
      const barWidth = Math.max((d.total / max) * chartWidth, 3);
      const textY = y + barHeight / 1.6;
      return `
        <text x="0" y="${textY}" class="chartBarLabel">${escapeHtml(d.label)}</text>
        <rect x="${labelWidth}" y="${y}" width="${barWidth.toFixed(1)}" height="${barHeight}" rx="5" class="chartBar" />
        <text x="${(labelWidth + chartWidth + 6).toFixed(1)}" y="${textY}" class="chartBarValue">${d.total}</text>
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="chartSvg" role="img" aria-label="Repartition par exercice">
      ${bars}
    </svg>
  `;
}
