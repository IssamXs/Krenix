import { describe, it, expect } from 'vitest'
import { classifyInboundMessage, MAX_INBOUND_IMAGES } from './meta-inbound'

const imageAttachment = (url: string) => ({ type: 'image', payload: { url } })

describe('classifyInboundMessage', () => {
  it('classifies a photo-only message as an image (the silence regression)', () => {
    // A photo DM has no message.text. The old webhook guard dropped this event
    // before any handler ran, so the customer got nothing back at all.
    const result = classifyInboundMessage({ attachments: [imageAttachment('https://cdn/1.jpg')] })
    expect(result).toEqual({ kind: 'image', text: '', imageUrls: ['https://cdn/1.jpg'] })
  })

  it('keeps the caption when a photo is sent with text', () => {
    const result = classifyInboundMessage({
      text: '  combien ?  ',
      attachments: [imageAttachment('https://cdn/1.jpg')],
    })
    expect(result).toEqual({ kind: 'image', text: 'combien ?', imageUrls: ['https://cdn/1.jpg'] })
  })

  it(`caps the number of images at ${MAX_INBOUND_IMAGES}`, () => {
    const result = classifyInboundMessage({
      attachments: [
        imageAttachment('https://cdn/1.jpg'),
        imageAttachment('https://cdn/2.jpg'),
        imageAttachment('https://cdn/3.jpg'),
      ],
    })
    expect(result).toEqual({
      kind: 'image',
      text: '',
      imageUrls: ['https://cdn/1.jpg', 'https://cdn/2.jpg'],
    })
  })

  it('treats a sticker as text, never as a product photo', () => {
    // Messenger delivers the thumbs-up sticker as an image attachment.
    const result = classifyInboundMessage({
      sticker_id: 369239263222822,
      attachments: [imageAttachment('https://cdn/thumbsup.png')],
    })
    expect(result).toEqual({ kind: 'text', text: '👍' })
  })

  it('flags an unreadable attachment type instead of dropping it', () => {
    // Instagram story mentions and shared reels arrive constantly.
    expect(classifyInboundMessage({ attachments: [{ type: 'story_mention', payload: {} }] }))
      .toEqual({ kind: 'unsupported' })
    expect(classifyInboundMessage({ attachments: [{ type: 'video', payload: { url: 'https://cdn/v.mp4' } }] }))
      .toEqual({ kind: 'unsupported' })
  })

  it('answers the text of a video sent with a caption rather than calling it unsupported', () => {
    const result = classifyInboundMessage({
      text: 'vous avez ça ?',
      attachments: [{ type: 'video', payload: { url: 'https://cdn/v.mp4' } }],
    })
    expect(result).toEqual({ kind: 'text', text: 'vous avez ça ?' })
  })

  it('classifies a plain text message as text', () => {
    expect(classifyInboundMessage({ text: 'bonjour' })).toEqual({ kind: 'text', text: 'bonjour' })
  })

  it('skips echoes, empty messages and undefined', () => {
    expect(classifyInboundMessage({ text: 'sent by the page', is_echo: true })).toEqual({ kind: 'skip' })
    expect(classifyInboundMessage({})).toEqual({ kind: 'skip' })
    expect(classifyInboundMessage({ text: '   ' })).toEqual({ kind: 'skip' })
    expect(classifyInboundMessage(undefined)).toEqual({ kind: 'skip' })
  })

  it('ignores an image attachment whose payload has no url', () => {
    expect(classifyInboundMessage({ attachments: [{ type: 'image', payload: {} }] }))
      .toEqual({ kind: 'unsupported' })
  })
})
