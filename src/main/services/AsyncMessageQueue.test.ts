import { describe, expect, it } from 'vitest'
import { AsyncMessageQueue } from './AsyncMessageQueue'

async function collect<T>(queue: AsyncMessageQueue<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of queue) {
    items.push(item)
  }
  return items
}

describe('AsyncMessageQueue', () => {
  it('push 済みアイテムを順序どおり yield する', async () => {
    const queue = new AsyncMessageQueue<number>()
    queue.push(1)
    queue.push(2)
    queue.push(3)
    queue.close()
    expect(await collect(queue)).toEqual([1, 2, 3])
  })

  it('イテレーション開始後の push も受け取れる（待ち合わせ）', async () => {
    const queue = new AsyncMessageQueue<string>()
    const resultPromise = collect(queue)
    queue.push('a')
    await Promise.resolve()
    queue.push('b')
    queue.close()
    expect(await resultPromise).toEqual(['a', 'b'])
  })

  it('close 時にバッファ済みアイテムは失われない', async () => {
    const queue = new AsyncMessageQueue<number>()
    queue.push(1)
    queue.close()
    expect(await collect(queue)).toEqual([1])
  })

  it('close 後の push は例外を投げる', () => {
    const queue = new AsyncMessageQueue<number>()
    queue.close()
    expect(() => queue.push(1)).toThrow('closed')
  })

  it('close 後のイテレーションは即終了する', async () => {
    const queue = new AsyncMessageQueue<number>()
    queue.close()
    expect(await collect(queue)).toEqual([])
  })
})
