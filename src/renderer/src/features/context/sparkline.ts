/**
 * 依存ライブラリなしの簡易グラフ用ヘルパー（F-2 トークン/コスト推移）。
 */

/** 値列を SVG polyline の points 文字列へ変換する */
export function toSparklinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1e-9)
  const stepX = values.length > 1 ? width / (values.length - 1) : 0
  return values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : i * stepX
      const y = height - (v / max) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

/** 値列を 0..1 に正規化した棒グラフ高さへ変換する */
export function toBarHeights(values: number[]): number[] {
  const max = Math.max(...values, 1e-9)
  return values.map((v) => v / max)
}
