import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import BedAvailability from './BedAvailability'
import { mockFetch, ok, fail, failNoJson, callsTo } from './test/mockApi'

const beds = [
  { id: 'B1', ward: 'ICU', room: '201', status: 'Available' },
  { id: 'B2', ward: 'ICU', room: '202', status: 'Occupied', patientName: 'Ravi' },
  { id: 'B3', ward: 'General', room: '10', status: 'Occupied' },
]
const bedPayload = {
  beds,
  wards: ['ICU', 'General'],
  summary: { total: 3, available: 1, occupied: 2 },
}

function setup(routes = {}) {
  const fetchMock = mockFetch({ 'GET /beds': ok(bedPayload), ...routes })
  render(<BedAvailability token="doc-token" />)
  return fetchMock
}

describe('BedAvailability – display', () => {
  it('shows a loading message first', () => {
    setup()
    expect(screen.getByText('Loading bed availability...')).toBeInTheDocument()
  })

  it('shows the summary and every bed', async () => {
    setup()
    expect(await screen.findByText('B1')).toBeInTheDocument()
    expect(screen.getByText('Patient: Ravi')).toBeInTheDocument()
    expect(screen.getByText('Patient: Not specified')).toBeInTheDocument()
    expect(screen.getByText('Total beds').nextSibling).toHaveTextContent('3')
    expect(screen.getByRole('option', { name: 'General' })).toBeInTheDocument()
  })

  it('shows an empty message and zero summary when the server sends no beds or summary', async () => {
    setup({ 'GET /beds': ok({ beds: 'x', wards: 'y' }) })
    expect(await screen.findByText('No beds found for this ward.')).toBeInTheDocument()
    expect(screen.getByText('Total beds').nextSibling).toHaveTextContent('0')
  })

  it('shows an alert when beds cannot be loaded', async () => {
    setup({ 'GET /beds': fail(403, { message: 'Doctor access only' }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Doctor access only')
  })

  it('falls back to a generic message when the error has no JSON body', async () => {
    setup({ 'GET /beds': failNoJson(500) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Bed request failed.')
  })

  it('filters by ward', async () => {
    const user = userEvent.setup()
    const fetchMock = setup()
    await screen.findByText('B1')
    await user.selectOptions(screen.getByLabelText('Filter beds by ward'), 'ICU')
    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/beds').some(([u]) => String(u).includes('?ward=ICU'))).toBe(true))
  })
})

describe('BedAvailability – allocating and releasing', () => {
  it('keeps Allocate disabled until a patient name is typed, then allocates', async () => {
    const user = userEvent.setup()
    const fetchMock = setup({ 'PATCH /beds/B1/allocate': ok({ message: 'Bed allocated.' }) })
    await screen.findByText('B1')
    const allocate = screen.getByRole('button', { name: 'Allocate bed' })
    expect(allocate).toBeDisabled()
    await user.type(screen.getByLabelText('Patient name for bed B1'), '  Meena ')
    expect(allocate).toBeEnabled()
    await user.click(allocate)
    expect(await screen.findByText('Bed allocated.')).toBeInTheDocument()
    const [call] = callsTo(fetchMock, 'PATCH', '/beds/B1/allocate')
    expect(JSON.parse(call[1].body)).toEqual({ patientName: '  Meena ' })
    expect(screen.getByLabelText('Patient name for bed B1')).toHaveValue('')
  })

  it('uses the default message when the server sends none', async () => {
    const user = userEvent.setup()
    setup({ 'PATCH /beds/B1/allocate': ok({}) })
    await user.type(await screen.findByLabelText('Patient name for bed B1'), 'Meena')
    await user.click(screen.getByRole('button', { name: 'Allocate bed' }))
    expect(await screen.findByText('Bed status updated.')).toBeInTheDocument()
  })

  it('shows an error when allocation is refused', async () => {
    const user = userEvent.setup()
    setup({ 'PATCH /beds/B1/allocate': fail(409, { message: 'Bed already occupied' }) })
    await user.type(await screen.findByLabelText('Patient name for bed B1'), 'Meena')
    await user.click(screen.getByRole('button', { name: 'Allocate bed' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bed already occupied')
  })

  it('releases an occupied bed without sending a body', async () => {
    const user = userEvent.setup()
    const fetchMock = setup({ 'PATCH /beds/B2/release': ok({ message: 'Bed released.' }) })
    await screen.findByText('B2')
    await user.click(screen.getAllByRole('button', { name: 'Release bed' })[0])
    expect(await screen.findByText('Bed released.')).toBeInTheDocument()
    const [call] = callsTo(fetchMock, 'PATCH', '/beds/B2/release')
    expect(call[1].body).toBeUndefined()
  })

  it('shows "Updating..." while a bed change is in progress', async () => {
    const user = userEvent.setup()
    let release
    setup({
      'PATCH /beds/B2/release': () => new Promise((resolve) => { release = () => resolve(ok({ message: 'Done.' })) }),
    })
    await screen.findByText('B2')
    // Route functions may return promises because fetch itself is async.
    await user.click(screen.getAllByRole('button', { name: 'Release bed' })[0])
    expect(await screen.findByRole('button', { name: 'Updating...' })).toBeDisabled()
    await act(async () => { release() })
    expect(await screen.findByText('Done.')).toBeInTheDocument()
  })
})

describe('BedAvailability – automatic refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    return () => vi.useRealTimers()
  })

  it('reloads beds every five seconds', async () => {
    const fetchMock = setup()
    await screen.findByText('B1')
    const before = callsTo(fetchMock, 'GET', '/beds').length
    await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
    await waitFor(() => expect(callsTo(fetchMock, 'GET', '/beds').length).toBeGreaterThan(before))
  })
})
