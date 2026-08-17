import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { extractPptxSlideText } from './pptx-text'

async function buildFakePptx(slideXmls: string[]): Promise<Buffer> {
  const zip = new JSZip()
  slideXmls.forEach((xml, i) => {
    zip.file(`ppt/slides/slide${i + 1}.xml`, xml)
  })
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  return buf
}

const SLIDE_1 = `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Office Building BOV</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:txBody><a:p><a:r><a:t>123 Main St</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`

const SLIDE_2 = `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Comparable Sales</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`

describe('extractPptxSlideText', () => {
  it('extracts text runs from each slide, in slide order, joined with spaces', async () => {
    const buffer = await buildFakePptx([SLIDE_1, SLIDE_2])

    const result = await extractPptxSlideText(buffer)

    expect(result).toEqual(['Office Building BOV 123 Main St', 'Comparable Sales'])
  })

  it('decodes basic XML entities in extracted text', async () => {
    const slide = `<?xml version="1.0"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Cap Rate &amp; NOI</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`
    const buffer = await buildFakePptx([slide])

    const result = await extractPptxSlideText(buffer)

    expect(result).toEqual(['Cap Rate & NOI'])
  })

  it('returns an empty array when there are no slides', async () => {
    const buffer = await buildFakePptx([])

    expect(await extractPptxSlideText(buffer)).toEqual([])
  })
})
