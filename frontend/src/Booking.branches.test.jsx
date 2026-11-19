import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import Booking from './Booking'
import { mockFetch, mockDownloads, ok, fail, callsTo } from './test/mockApi'

vi.mock('./MedicinePurchase', () => ({ default: () => <div>Medicine panel</div> }))

const patient = { name: 'Asha' }

const doctors = [
  { id: 'd1', name: 'Dr Rao', specialty: 'Cardiology', experience: 12 },
  { id: 'd2', name: 'Dr Iyer', specialty: 'Dermatology', experience: 7 },
]

function baseRoutes(overrides = {}) {
  return {
    'GET /doctors': ok({ doctors }),
    'GET /doctors/d1/slots': ok({ slots: ['09:00', '10:00'] }),
    'GET /doctors/d2/slots': ok({ slots: ['11:00'] }),
    'GET /appointments/me': ok({ appointments: [] }),
    'GET /patient/medical-records': ok({ records: [], reports: [] }),
    'GET /patient/bills/me': ok({ bills: [] }),
    'GET /prescriptions/me': ok({ prescriptions: [] }),
    ...overrides,
  }
}

function setup(overrides = {}, props = {}) {
  localStorage.setItem('token', 'pat-token')
  const fetchMock = mockFetch(baseRoutes(overrides))
  const utils = render(<Booking user={patient} onLogout={vi.fn()} {...props} />)
  return { fetchMock, ...utils }
}

const form = () => screen.getByRole('button', { name: /confirm appointment/i }).closest('form')

describe('Booking – doctors and header', () => {
  it('lists doctors, shows experience and welcomes the patient', async () => {
    setup()
    expect(await screen.findByRole('option', { name: /Dr Rao — Cardiology/ })).toBeInTheDocument()
    expect(screen.getByText('12 years of experience')).toBeInTheDocument()
    expect(screen.getByText(/Welcome, Asha/)).toBeInTheDocument()
  })

  it('falls back to "Patient" and calls onLogout', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    setup({}, { user: undefined, onLogout })
    expect(screen.getByText(/Welcome, Patient/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onLogout).toHaveBeenCalled()
    await screen.findByRole('option', { name: /Dr Rao/ })
  })

  it('reports when no doctors are available', async () => {
    setup({ 'GET /doctors': ok({ doctors: [] }) })
    expect(await screen.findByText('No doctors are currently available.')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'No doctors available' })).toBeInTheDocument()
    expect(screen.getByLabelText('Choose a doctor')).toBeDisabled()
  })

  it('treats a non-array doctors payload as empty', async () => {
    setup({ 'GET /doctors': ok({ doctors: 'bad' }) })
    expect(await screen.findByText('No doctors are currently available.')).toBeInTheDocument()
  })

  it('shows an error when doctors fail to load', async () => {
    setup({ 'GET /doctors': fail(500, { message: 'DB offline' }) })
    expect(await screen.findByText('Unable to load doctors: DB offline')).toBeInTheDocument()
  })
})

describe('Booking – slots', () => {
  it('shows slots for the first doctor', async () => {
    setup()
    expect(await screen.findByRole('button', { name: '09:00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10:00' })).toBeInTheDocument()
  })

  it('says so when there are no slots on the chosen date', async () => {
    setup({ 'GET /doctors/d1/slots': ok({ slots: [] }) })
    expect(await screen.findByText(/no slots available for this date/i)).toBeInTheDocument()
  })

  it('treats a non-array slots payload as empty', async () => {
    setup({ 'GET /doctors/d1/slots': ok({ slots: null }) })
    expect(await screen.findByText(/no slots available for this date/i)).toBeInTheDocument()
  })

  it('shows an error when slots fail to load', async () => {
    setup({ 'GET /doctors/d1/slots': fail(500, { message: 'Slot service down' }) })
    expect(await screen.findByText('Unable to load time slots: Slot service down')).toBeInTheDocument()
  })

  it('loads the other doctor\'s slots and clears the chosen time when the doctor changes', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(await screen.findByRole('button', { name: '09:00' }))
    expect(screen.getByRole('button', { name: '09:00' })).toHaveAttribute('aria-pressed', 'true')
    await user.selectOptions(screen.getByLabelText('Choose a doctor'), 'd2')
    expect(await screen.findByRole('button', { name: '11:00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm appointment/i })).toBeDisabled()
  })

  it('reloads slots when the date changes', async () => {
    const { fetchMock } = setup()
    await screen.findByRole('button', { name: '09:00' })
    fireEvent.change(screen.getByLabelText('Appointment date'), { target: { value: '2099-01-01' } })
    await waitFor(() =>
      expect(
        callsTo(fetchMock, 'GET', '/doctors/d1/slots').some(([url]) => String(url).includes('2099-01-01'))
      ).toBe(true)
    )
  })
})

describe('Booking – booking an appointment', () => {
  it('books the selected slot and shows the server message', async () => {
    const user = userEvent.setup()
    const { fetchMock } = setup({ 'POST /appointments': ok({ message: 'Booked for you.' }) })
    await user.click(await screen.findByRole('button', { name: '10:00' }))
    await user.click(screen.getByRole('button', { name: /confirm appointment/i }))
    expect(await screen.findByText('Booked for you.')).toBeInTheDocument()
    const [call] = callsTo(fetchMock, 'POST', '/appointments')
    expect(JSON.parse(call[1].body)).toMatchObject({ doctorId: 'd1', time: '10:00' })
    expect(screen.getByRole('button', { name: /confirm appointment/i })).toBeDisabled()
  })

  it('uses the default success message when none is returned', async () => {
    const user = userEvent.setup()
    setup({ 'POST /appointments': ok({}) })
    await user.click(await screen.findByRole('button', { name: '09:00' }))
    await user.click(screen.getByRole('button', { name: /confirm appointment/i }))
    expect(await screen.findByText('Appointment booked successfully.')).toBeInTheDocument()
  })

  it('shows the conflict message when the slot was just taken', async () => {
    const user = userEvent.setup()
    setup({ 'POST /appointments': fail(409, { message: 'Slot already booked' }) })
    await user.click(await screen.findByRole('button', { name: '09:00' }))
    await user.click(screen.getByRole('button', { name: /confirm appointment/i }))
    expect(await screen.findByText('Slot already booked')).toBeInTheDocument()
  })

  it('refuses to submit without a chosen time', async () => {
    const { fetchMock } = setup()
    await screen.findByRole('button', { name: '09:00' })
    fireEvent.submit(form())
    expect(await screen.findByText('Please select a doctor, date and available time.')).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/appointments')).toHaveLength(0)
  })
})

describe('Booking – upcoming and past appointments', () => {
  it('shows empty messages for both lists', async () => {
    setup()
    expect(await screen.findByText('You have no upcoming appointments.')).toBeInTheDocument()
    expect(screen.getByText('You have no past appointments.')).toBeInTheDocument()
  })

  it('splits, sorts and labels appointments', async () => {
    setup({
      'GET /appointments/me': ok({
        appointments: [
          { id: 'u2', doctorName: 'Dr Later', specialty: 'ENT', date: '2099-02-01', time: '09:00', status: 'Booked' },
          { id: 'u1', doctorName: 'Dr Sooner', specialty: 'ENT', date: '2099-01-01', time: '09:00', status: 'Booked' },
          { id: 'p1', doctorName: 'Dr Old', specialty: 'ENT', date: '2020-01-01', time: '09:00', status: 'Completed' },
          { id: 'p2', doctorName: 'Dr Older', specialty: 'ENT', date: '2019-01-01', time: '09:00', status: 'Completed' },
          { id: 'c1', doctorName: 'Dr Cancelled', specialty: 'ENT', date: '2099-03-01', time: '09:00', status: 'Cancelled' },
          { id: 'n1', doctorName: 'Dr NoDate', specialty: 'ENT', time: '09:00', status: 'Booked' },
        ],
      }),
    })
    const upcomingHeading = await screen.findByRole('heading', { name: 'Upcoming appointments' })
    const upcoming = upcomingHeading.closest('section')
    const names = within(upcoming).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names).toEqual(['Dr Sooner', 'Dr Later'])

    const past = screen.getByRole('heading', { name: 'Past appointments' }).closest('section')
    expect(within(past).getByText('Dr Old')).toBeInTheDocument()
    expect(within(past).getByText('Dr Cancelled')).toBeInTheDocument()
    expect(within(past).getByText('Dr NoDate')).toBeInTheDocument()
    expect(within(past).getByText('Cancelled')).toHaveClass('cancelled')
  })

  it('ignores a non-array appointments payload', async () => {
    setup({ 'GET /appointments/me': ok({ appointments: 'bad' }) })
    expect(await screen.findByText('You have no upcoming appointments.')).toBeInTheDocument()
  })

  it('shows an error when appointments fail to load', async () => {
    setup({ 'GET /appointments/me': fail(500, { message: 'No appts' }) })
    expect(await screen.findByText('Unable to load appointments: No appts')).toBeInTheDocument()
  })
})

describe('Booking – cancelling', () => {
  const upcomingRoute = {
    'GET /appointments/me': ok({
      appointments: [{ id: 'u1', doctorName: 'Dr Sooner', specialty: 'ENT', date: '2099-01-01', time: '09:00', status: 'Booked' }],
    }),
  }

  it('does nothing when the patient declines the confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { fetchMock } = setup(upcomingRoute)
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }))
    expect(callsTo(fetchMock, 'PATCH', '/appointments/u1/cancel')).toHaveLength(0)
  })

  it('cancels after confirmation and shows the server message', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { fetchMock } = setup({ ...upcomingRoute, 'PATCH /appointments/u1/cancel': ok({ message: 'Cancelled it.' }) })
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }))
    expect(await screen.findByText('Cancelled it.')).toBeInTheDocument()
    expect(callsTo(fetchMock, 'PATCH', '/appointments/u1/cancel')).toHaveLength(1)
  })

  it('uses the default message when the server sends none', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    setup({ ...upcomingRoute, 'PATCH /appointments/u1/cancel': ok({}) })
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }))
    expect(await screen.findByText('Appointment cancelled successfully.')).toBeInTheDocument()
  })

  it('shows the error when cancelling fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    setup({ ...upcomingRoute, 'PATCH /appointments/u1/cancel': fail(400, { message: 'Too late to cancel' }) })
    await user.click(await screen.findByRole('button', { name: 'Cancel appointment' }))
    expect(await screen.findByText('Too late to cancel')).toBeInTheDocument()
  })
})

describe('Booking – medical history', () => {
  it('shows empty messages', async () => {
    setup()
    expect(await screen.findByText('No medical history records are available yet.')).toBeInTheDocument()
    expect(screen.getByText('No medical reports are available yet.')).toBeInTheDocument()
  })

  it('shows records and reports with all fields', async () => {
    setup({
      'GET /patient/medical-records': ok({
        records: [{ id: 'r1', diagnosis: 'Asthma', treatmentNotes: 'Inhaler', appointmentId: 'apt-9', createdAt: '2026-10-01T10:00:00Z' }],
        reports: [{ id: 'rp1', reportName: 'Lung scan', status: 'Ready', hasFile: true, instructions: 'Bring ID', createdAt: '2026-10-02T10:00:00Z', originalName: 'lung.pdf' }],
      }),
    })
    expect(await screen.findByText('Asthma')).toBeInTheDocument()
    expect(screen.getByText('Inhaler')).toBeInTheDocument()
    expect(screen.getByText('apt-9')).toBeInTheDocument()
    expect(screen.getByText('Lung scan')).toBeInTheDocument()
    expect(screen.getByText('Bring ID')).toBeInTheDocument()
    expect(screen.getByText('lung.pdf')).toBeInTheDocument()
    expect(screen.getByText('Report file available.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download Report' })).toBeInTheDocument()
  })

  it('uses fallbacks for missing fields', async () => {
    setup({
      'GET /patient/medical-records': ok({
        records: [{ id: 'r1' }],
        reports: [{ id: 'rp1', hasFile: false }],
      }),
    })
    expect(await screen.findByText('Diagnosis not recorded')).toBeInTheDocument()
    expect(screen.getByText('No treatment notes recorded.')).toBeInTheDocument()
    expect(screen.getByText('Date unavailable')).toBeInTheDocument()
    expect(screen.getByText('Medical report')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download Report' })).not.toBeInTheDocument()
  })

  it('shows an error with a working Retry button', async () => {
    const user = userEvent.setup()
    let calls = 0
    setup({
      'GET /patient/medical-records': () => {
        calls += 1
        return calls === 1
          ? fail(500, { message: 'History unavailable' })
          : ok({ records: [{ id: 'r1', diagnosis: 'Recovered' }], reports: [] })
      },
    })
    expect(await screen.findByText('History unavailable')).toBeInTheDocument()
    const alert = screen.getByText('History unavailable').closest('[role="alert"]')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Recovered')).toBeInTheDocument()
  })

  it('ignores non-array records and reports', async () => {
    setup({ 'GET /patient/medical-records': ok({ records: 'x', reports: 'y' }) })
    expect(await screen.findByText('No medical history records are available yet.')).toBeInTheDocument()
  })
})

describe('Booking – downloading a medical report', () => {
  const withReport = {
    'GET /patient/medical-records': ok({
      records: [],
      reports: [{ id: 'rp1', reportName: 'Lung scan', status: 'Ready', hasFile: true, originalName: 'lung.pdf' }],
    }),
  }

  it('downloads the file', async () => {
    const user = userEvent.setup()
    const downloads = mockDownloads()
    setup({ ...withReport, 'GET /reports/rp1/download': ok({}) })
    await user.click(await screen.findByRole('button', { name: 'Download Report' }))
    await waitFor(() => expect(downloads.click).toHaveBeenCalled())
    expect(downloads.created).toHaveBeenCalled()
  })

  it('shows the server message when the download is refused', async () => {
    const user = userEvent.setup()
    mockDownloads()
    setup({ ...withReport, 'GET /reports/rp1/download': fail(403, { message: 'Not your report' }) })
    await user.click(await screen.findByRole('button', { name: 'Download Report' }))
    expect(await screen.findByText('Not your report')).toBeInTheDocument()
  })

  it('uses the fallback name when the report has no originalName and revokes URL', async () => {
    const user = userEvent.setup()
    const downloads = mockDownloads()
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    setup({
      'GET /patient/medical-records': ok({
        records: [],
        reports: [{ id: 'rp2', reportName: 'Blood scan', status: 'Ready', hasFile: true }],
      }),
      'GET /reports/rp2/download': ok({}),
    })
    await user.click(await screen.findByRole('button', { name: 'Download Report' }))
    await waitFor(() => expect(downloads.click).toHaveBeenCalled())
    vi.advanceTimersByTime(1050)
    expect(downloads.revoked).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('uses default error message when report download fails without JSON', async () => {
    const user = userEvent.setup()
    mockDownloads()
    setup({ ...withReport, 'GET /reports/rp1/download': fail(500, {}) })
    await user.click(await screen.findByRole('button', { name: 'Download Report' }))
    expect(await screen.findByText('Unable to download report.')).toBeInTheDocument()
  })

  it('asks the patient to log in again when the token is gone', async () => {
    const user = userEvent.setup()
    mockDownloads()
    setup(withReport)
    const button = await screen.findByRole('button', { name: 'Download Report' })
    localStorage.removeItem('token')
    await user.click(button)
    expect(await screen.findByText('Please log in again to download this report.')).toBeInTheDocument()
  })
})

const bill = (overrides = {}) => ({
  id: 'b1',
  billNumber: 'BILL-001',
  date: '2026-10-01T10:00:00Z',
  totalAmount: 150,
  paymentStatus: 'Pending',
  items: [{ name: 'Paracetamol', quantity: 2, unitPrice: 25, subtotal: 50 }],
  ...overrides,
})

describe('Booking – bills', () => {
  it('offers demo bills when there are none and loads them', async () => {
    const user = userEvent.setup()
    let billCalls = 0
    const { fetchMock } = setup({
      'GET /patient/bills/me': () => {
        billCalls += 1
        return billCalls === 1 ? ok({ bills: [] }) : ok({ bills: [bill()] })
      },
      'POST /patient/bills/demo': ok({}),
    })
    await user.click(await screen.findByRole('button', { name: 'Load Demo Bills' }))
    expect(await screen.findByText('BILL-001')).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/patient/bills/demo')).toHaveLength(1)
  })

  it('shows an error if demo bills cannot be created', async () => {
    const user = userEvent.setup()
    let resolveDemo
    setup({ 'POST /patient/bills/demo': () => new Promise(resolve => { resolveDemo = resolve }) })
    const button = await screen.findByRole('button', { name: 'Load Demo Bills' })
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Loading demo bills...' })).toBeInTheDocument()
    resolveDemo(fail(500, {}))
    expect(await screen.findByText('Unable to create demo bills.')).toBeInTheDocument()
  })

  it('shows an error with Retry when bills fail to load', async () => {
    const user = userEvent.setup()
    let calls = 0
    setup({
      'GET /patient/bills/me': () => {
        calls += 1
        return calls === 1 ? fail(500, { message: 'Bills down' }) : ok({ bills: [bill()] })
      },
    })
    expect(await screen.findByText('Bills down')).toBeInTheDocument()
    const alert = screen.getByText('Bills down').closest('[role="alert"]')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('BILL-001')).toBeInTheDocument()
  })

  it('expands and collapses bill details, including paid information', async () => {
    const user = userEvent.setup()
    setup({
      'GET /patient/bills/me': ok({
        bills: [bill({ paymentStatus: 'Paid', paidAt: '2026-10-02T10:00:00Z' })],
      }),
    })
    await user.click(await screen.findByRole('button', { name: 'View bill' }))
    expect(screen.getByText('Bill details')).toBeInTheDocument()
    expect(screen.getByText(/Paid on:/)).toBeInTheDocument()
    expect(screen.getByText('This order is marked as paid in the demo system.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide details' }))
    expect(screen.queryByText('Bill details')).not.toBeInTheDocument()
  })

  it('handles a pending bill without a date', async () => {
    const user = userEvent.setup()
    setup({ 'GET /patient/bills/me': ok({ bills: [bill({ date: undefined })] }) })
    expect(await screen.findByText(/Unavailable/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View bill' }))
    expect(screen.queryByText(/Paid on:/)).not.toBeInTheDocument()
    expect(screen.queryByText('This order is marked as paid in the demo system.')).not.toBeInTheDocument()
  })

  it('downloads a bill as a text file', async () => {
    const user = userEvent.setup()
    const downloads = mockDownloads()
    setup({ 'GET /patient/bills/me': ok({ bills: [bill()] }) })
    await user.click(await screen.findByRole('button', { name: 'Download bill' }))
    expect(downloads.created).toHaveBeenCalled()
    expect(downloads.click).toHaveBeenCalled()
  })

  it('downloads a bill that has no date', async () => {
    const user = userEvent.setup()
    const downloads = mockDownloads()
    setup({ 'GET /patient/bills/me': ok({ bills: [bill({ date: undefined, billNumber: undefined })] }) })
    await user.click(await screen.findByRole('button', { name: 'Download bill' }))
    expect(downloads.click).toHaveBeenCalled()
  })

  it('ignores a non-array bills payload', async () => {
    setup({ 'GET /patient/bills/me': ok({ bills: 'x' }) })
    expect(await screen.findByText("You don't have any bills yet.")).toBeInTheDocument()
  })
})

describe('Booking – prescriptions', () => {
  it('shows an empty message', async () => {
    setup()
    expect(await screen.findByText('No prescriptions are available yet.')).toBeInTheDocument()
  })

  it('lists prescriptions with name fallbacks and optional fields', async () => {
    setup({
      'GET /prescriptions/me': ok({
        prescriptions: [
          { id: 'p1', medicineName: 'Amoxicillin', instructions: 'After food', dosage: '250 mg', createdAt: '2026-10-01T10:00:00Z' },
          { id: 'p2', name: 'Cetirizine' },
          { },
        ],
      }),
    })
    expect(await screen.findByText('Amoxicillin')).toBeInTheDocument()
    expect(screen.getByText('Instructions: After food')).toBeInTheDocument()
    expect(screen.getByText('Dosage: 250 mg')).toBeInTheDocument()
    expect(screen.getByText('Cetirizine')).toBeInTheDocument()
    expect(screen.getByText('Prescription')).toBeInTheDocument()
  })

  it('downloads a prescription as JSON', async () => {
    const user = userEvent.setup()
    const downloads = mockDownloads()
    setup({ 'GET /prescriptions/me': ok({ prescriptions: [{ id: 'p1', medicineName: 'Amoxicillin' }] }) })
    await user.click(await screen.findByRole('button', { name: 'Download Prescription' }))
    expect(downloads.created).toHaveBeenCalled()
    expect(downloads.click).toHaveBeenCalled()
  })

  it('downloads a prescription that has no id using the fallback filename and revokes URL', async () => {
    const user = userEvent.setup()
    const downloads = mockDownloads()
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    setup({ 'GET /prescriptions/me': ok({ prescriptions: [{ medicineName: 'Amoxicillin' }] }) })
    await user.click(await screen.findByRole('button', { name: 'Download Prescription' }))
    expect(downloads.created).toHaveBeenCalled()
    expect(downloads.click).toHaveBeenCalled()
    vi.advanceTimersByTime(1050)
    expect(downloads.revoked).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('reports a failed prescription download', async () => {
    const user = userEvent.setup()
    mockDownloads()
    URL.createObjectURL = vi.fn(() => { throw new Error('blob failed') })
    setup({ 'GET /prescriptions/me': ok({ prescriptions: [{ id: 'p1', medicineName: 'Amoxicillin' }] }) })
    await user.click(await screen.findByRole('button', { name: 'Download Prescription' }))
    expect(await screen.findByText('Unable to download prescription.')).toBeInTheDocument()
  })

  it('shows the server message when prescriptions cannot be loaded', async () => {
    setup({ 'GET /prescriptions/me': fail(500, { message: 'Rx service down' }) })
    expect(await screen.findByText('Rx service down')).toBeInTheDocument()
  })

  it('asks the user to log in again when there is no token', async () => {
    mockFetch(baseRoutes())
    render(<Booking user={patient} onLogout={vi.fn()} />)
    expect(await screen.findByText('Please log in again.')).toBeInTheDocument()
  })

  it('ignores a non-array prescriptions payload', async () => {
    setup({ 'GET /prescriptions/me': ok({ prescriptions: 'x' }) })
    expect(await screen.findByText('No prescriptions are available yet.')).toBeInTheDocument()
  })
})
