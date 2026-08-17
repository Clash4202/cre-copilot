import { describe, it, expect } from 'vitest'
import { classifyInboxFile } from './inbox-classify'

describe('classifyInboxFile', () => {
  it('classifies a .xlsx detected as a T12 as a property document', () => {
    expect(classifyInboxFile('Monthly Operating Statement.xlsx', 't12')).toBe('property_document')
  })

  it('classifies a .xlsx detected as a rent roll as a property document', () => {
    expect(classifyInboxFile('Rent Roll.xlsx', 'rent_roll')).toBe('property_document')
  })

  it('classifies a .xlsx that matches neither shape as a candidate template', () => {
    expect(classifyInboxFile('Office DCF Template.xlsx', 'unknown')).toBe('candidate_template')
  })

  it('classifies a .pptx as a candidate bov, regardless of xlsxKind', () => {
    expect(classifyInboxFile('Office BOV.pptx', null)).toBe('candidate_bov')
  })

  it('classifies anything else as a general document', () => {
    expect(classifyInboxFile('Offering Memorandum.pdf', null)).toBe('general_document')
    expect(classifyInboxFile('notes.txt', null)).toBe('general_document')
  })

  it('is case-insensitive on file extension', () => {
    expect(classifyInboxFile('Deck.PPTX', null)).toBe('candidate_bov')
  })
})
