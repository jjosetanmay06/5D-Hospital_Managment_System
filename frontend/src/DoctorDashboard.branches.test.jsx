import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DoctorDashboard from './DoctorDashboard'
import { mockFetch, mockDownloads, ok, fail, failNoJson, callsTo } from './test/mockApi'

vi.mock('./BedAvailability', () => ({ default: () => <div>Bed panel</div> }))

const doctor = { name: 'Dr Rao' }

const appointment = (overrides = {}) => ({
  id: 'a1',
  patientName: 'Asha',
  patientEmail: 'asha@example.com',
  date: '2026-12-01',
  time: '10:00',
  status: 'Booked',
  medicalHistory: [
    { id: 'm1', diagnosis: 'Flu', treatmentNotes: 'Rest and fluids', createdAt: '2026-10-01T10:00:00Z' },
  ],
  reports: [
    { id: 'r1', reportName: 'Blood test', instructions: 'Fasting', status: 'Pending', hasFile: true, originalName: 'blood.pdf' },
  ],
  ...overrides,
})

const catalogue = ok({ medicines: [{ id: 'med1', name: 'Paracetamol' }, { id: 'med2', name: 'Ibuprofen' }] })

function setup(routes = {}, props = {}) {
  localStorage.setItem('token', 'doc-token')
  const fetchMock = mockFetch({
    'GET /doctor/appointments': ok({ appointments: [appointment()] }),
    'GET /medicines/catalogue': catalogue,
    ...routes,
  })
  const onLogout = vi.fn()
  const utils = render(<DoctorDashboard user={doctor} onLogout={onLogout} {...props} />)
  return { fetchMock, onLogout, ...utils }
}

describe('DoctorDashboard – loading, empty and error states', () => {
  it('shows a loading message before appointments arrive', () => {
    setup()
    expect(screen.getByText('Loading appointments...')).toBeInTheDocument()
  })

  it('shows the empty state when no appointments are assigned', async () => {
    setup({ 'GET /doctor/appointments': ok({ appointments: [] }) })
    expect(await screen.findByText(/no appointments are currently assigned/i)).toBeInTheDocument()
    expect(screen.queryByText('Enter diagnosis')).not.toBeInTheDocument()
  })

  it('treats a non-array appointments payload as empty', async () => {
    setup({ 'GET /doctor/appointments': ok({ appointments: 'oops' }) })
    expect(await screen.findByText(/no appointments are currently assigned/i)).toBeInTheDocument()
  })

  it('shows the server message when appointments fail to load', async () => {
    setup({ 'GET /doctor/appointments': fail(500, { message: 'Server down' }) })
    expect(await screen.findByRole('status')).toHaveTextContent('Server down')
  })

  it('falls back to a status-code message when the error body is not JSON', async () => {
    setup({ 'GET /doctor/appointments': failNoJson(503) })
    expect(await screen.findByRole('status')).toHaveTextContent('Request failed (503).')
  })

  it('shows an error when the medicine catalogue fails to load', async () => {
    setup({ 'GET /medicines/catalogue': fail(500, { message: 'Catalogue unavailable' }) })
    expect(await screen.findByText('Catalogue unavailable')).toBeInTheDocument()
  })

  it('ignores a non-array medicine catalogue', async () => {
    setup({ 'GET /medicines/catalogue': ok({ medicines: null }) })
    await screen.findByText('Create prescription')
    expect(screen.getByRole('button', { name: 'Save prescription' })).toBeDisabled()
  })

  it('does not update state when unmounted before appointments load', async () => {
    localStorage.setItem('token', 'doc-token')
    let resolveAppointments
    mockFetch({
      'GET /doctor/appointments': () => new Promise((resolve) => { resolveAppointments = resolve }),
      'GET /medicines/catalogue': catalogue,
    })
    const { unmount } = render(<DoctorDashboard user={doctor} onLogout={vi.fn()} />)
    unmount()
    resolveAppointments(ok({ appointments: [] }))
  })

  it('does not update state when unmounted before catalogue loads or errors', async () => {
    localStorage.setItem('token', 'doc-token')
    let resolveCatalogue
    mockFetch({
      'GET /doctor/appointments': ok({ appointments: [] }),
      'GET /medicines/catalogue': () => new Promise((resolve) => { resolveCatalogue = resolve }),
    })
    const { unmount } = render(<DoctorDashboard user={doctor} onLogout={vi.fn()} />)
    unmount()
    resolveCatalogue(fail(500, { message: 'err' }))
  })
})

describe('DoctorDashboard – header and patient detail', () => {
  it('greets the doctor by name and calls onLogout', async () => {
    const user = userEvent.setup()
    const { onLogout } = setup()
    expect(screen.getByText(/Welcome, Dr Rao/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
    await screen.findByRole('heading', { name: 'Asha' })
  })

  it('falls back to "Doctor" when no user name is available', async () => {
    setup({}, { user: undefined })
    expect(screen.getByText(/Welcome, Doctor\./)).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'Asha' })
  })

  it('shows the selected patient, history and reports', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Asha' })).toBeInTheDocument()
    expect(screen.getByText('asha@example.com')).toBeInTheDocument()
    expect(screen.getByText('Flu')).toBeInTheDocument()
    expect(screen.getByText('Rest and fluids')).toBeInTheDocument()
    expect(screen.getByText('Blood test')).toBeInTheDocument()
    expect(screen.getByText('Fasting')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download attached file' })).toBeInTheDocument()
  })

  it('uses fallbacks for missing email, notes, instructions and files', async () => {
    setup({
      'GET /doctor/appointments': ok({
        appointments: [
          appointment({
            patientEmail: '',
            medicalHistory: [{ id: 'm1', diagnosis: 'Cold', createdAt: '2026-10-01T10:00:00Z' }],
            reports: [{ id: 'r1', reportName: 'X-ray', status: 'Done', hasFile: false }],
          }),
        ],
      }),
    })
    expect(await screen.findByText('Not available')).toBeInTheDocument()
    expect(screen.getByText('No treatment notes recorded.')).toBeInTheDocument()
    expect(screen.getByText('No additional instructions.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download attached file' })).not.toBeInTheDocument()
  })

  it('shows empty-history and empty-report messages and switches patients', async () => {
    const user = userEvent.setup()
    setup({
      'GET /doctor/appointments': ok({
        appointments: [
          appointment(),
          appointment({ id: 'a2', patientName: 'Ravi', medicalHistory: [], reports: undefined }),
        ],
      }),
    })
    await screen.findByRole('heading', { name: 'Asha' })
    await user.click(screen.getByRole('button', { name: /Ravi/ }))
    expect(screen.getByRole('heading', { name: 'Ravi' })).toBeInTheDocument()
    expect(screen.getByText('No previous diagnoses recorded for this patient.')).toBeInTheDocument()
    expect(screen.getByText('No reports or scans recorded.')).toBeInTheDocument()
  })
})

describe('DoctorDashboard – saving a diagnosis', () => {
  it('posts the diagnosis, shows the server message and clears the form', async () => {
    const user = userEvent.setup()
    const { fetchMock } = setup({
      'POST /doctor/appointments/a1/diagnoses': ok({ message: 'Diagnosis stored.' }),
    })
    await screen.findByRole('heading', { name: 'Asha' })
    await user.type(screen.getByLabelText('Diagnosis'), 'Migraine')
    await user.type(screen.getByLabelText('Treatment notes'), 'Dark room')
    await user.click(screen.getByRole('button', { name: 'Save diagnosis' }))
    expect(await screen.findByText('Diagnosis stored.')).toBeInTheDocument()
    const [call] = callsTo(fetchMock, 'POST', '/doctor/appointments/a1/diagnoses')
    expect(JSON.parse(call[1].body)).toEqual({ diagnosis: 'Migraine', treatmentNotes: 'Dark room' })
    expect(call[1].headers.Authorization).toBe('Bearer doc-token')
    expect(screen.getByLabelText('Diagnosis')).toHaveValue('')
  })

  it('uses the default success message when the server sends none', async () => {
    const user = userEvent.setup()
    setup({ 'POST /doctor/appointments/a1/diagnoses': ok({}) })
    await screen.findByRole('heading', { name: 'Asha' })
    await user.type(screen.getByLabelText('Diagnosis'), 'Migraine')
    await user.click(screen.getByRole('button', { name: 'Save diagnosis' }))
    expect(await screen.findByText('Diagnosis saved.')).toBeInTheDocument()
  })

  it('shows the error and keeps the text when saving fails', async () => {
    const user = userEvent.setup()
    setup({ 'POST /doctor/appointments/a1/diagnoses': fail(403, { message: 'Not your patient' }) })
    await screen.findByRole('heading', { name: 'Asha' })
    await user.type(screen.getByLabelText('Diagnosis'), 'Migraine')
    await user.click(screen.getByRole('button', { name: 'Save diagnosis' }))
    expect(await screen.findByText('Not your patient')).toBeInTheDocument()
    expect(screen.getByLabelText('Diagnosis')).toHaveValue('Migraine')
  })
})

describe('DoctorDashboard – recording a report', () => {
  it('saves report details without a file', async () => {
    const user = userEvent.setup()
    const { fetchMock } = setup({ 'POST /doctor/appointments/a1/reports': ok({}) })
    await screen.findByRole('heading', { name: 'Asha' })
    await user.type(screen.getByLabelText('Report / scan name'), 'MRI')
    await user.click(screen.getByRole('button', { name: 'Save report details' }))
    expect(await screen.findByText('Report details saved.')).toBeInTheDocument()
    const [call] = callsTo(fetchMock, 'POST', '/doctor/appointments/a1/reports')
    expect(call[1].body).toBeInstanceOf(FormData)
    expect(call[1].body.get('reportName')).toBe('MRI')
    expect(call[1].body.has('file')).toBe(false)
  })

  it('attaches the chosen file to the upload', async () => {
    const user = userEvent.setup()
    const { fetchMock } = setup({
      'POST /doctor/appointments/a1/reports': ok({ message: 'Uploaded with file.' }),
    })
    await screen.findByRole('heading', { name: 'Asha' })
    await user.type(screen.getByLabelText('Report / scan name'), 'Scan')
    await user.type(screen.getByLabelText(/Instructions \/ details/), 'Fasting required')
    const file = new File(['pdf-bytes'], 'scan.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText(/Attach PDF, JPG or PNG/), file)
    await user.click(screen.getByRole('button', { name: 'Save report details' }))
    expect(await screen.findByText('Uploaded with file.')).toBeInTheDocument()
    const [call] = callsTo(fetchMock, 'POST', '/doctor/appointments/a1/reports')
    expect(call[1].body.get('file').name).toBe('scan.pdf')
    expect(call[1].body.get('instructions')).toBe('Fasting required')
  })

  it('shows an error when the upload is rejected', async () => {
    const user = userEvent.setup()
    setup({ 'POST /doctor/appointments/a1/reports': fail(400, { message: 'File too large' }) })
    await screen.findByRole('heading', { name: 'Asha' })
    await user.type(screen.getByLabelText('Report / scan name'), 'Scan')
    await user.click(screen.getByRole('button', { name: 'Save report details' }))
    expect(await screen.findByText('File too large')).toBeInTheDocument()
  })
})

describe('DoctorDashboard – downloading a report', () => {
  it('downloads the attached file', async () => {
    const user = userEvent.setup()
    const downloads = mockDownloads()
    const { fetchMock } = setup({ 'GET /reports/r1/download': ok({}) })
    await user.click(await screen.findByRole('button', { name: 'Download attached file' }))
    await waitFor(() => expect(downloads.click).toHaveBeenCalled())
    expect(downloads.created).toHaveBeenCalled()
    expect(downloads.revoked).toHaveBeenCalledWith('blob:mock-url')
    expect(callsTo(fetchMock, 'GET', '/reports/r1/download')).toHaveLength(1)
  })

  it('shows the server message when the download is refused', async () => {
    const user = userEvent.setup()
    mockDownloads()
    setup({ 'GET /reports/r1/download': fail(403, { message: 'Forbidden report' }) })
    await user.click(await screen.findByRole('button', { name: 'Download attached file' }))
    expect(await screen.findByText('Forbidden report')).toBeInTheDocument()
  })

  it('shows a generic message when the failed download has no JSON body', async () => {
    const user = userEvent.setup()
    mockDownloads()
    setup({ 'GET /reports/r1/download': failNoJson(500) })
    await user.click(await screen.findByRole('button', { name: 'Download attached file' }))
    expect(await screen.findByText('Unable to download report.')).toBeInTheDocument()
  })
})

describe('DoctorDashboard – prescriptions', () => {
  async function fillFirstMedicine(user, medicine = 'Paracetamol') {
    await screen.findByRole('option', { name: medicine })
    await user.selectOptions(screen.getByLabelText('Medicine'), medicine)
    await user.type(screen.getByLabelText('Dosage'), '500 mg')
    await user.type(screen.getByLabelText('Frequency'), '3/day')
    await user.type(screen.getByLabelText('Instructions'), 'After food')
  }

  it('saves a prescription and resets the form', async () => {
    const user = userEvent.setup()
    const { fetchMock } = setup({
      'POST /doctor/appointments/a1/prescriptions': ok({ message: 'Prescription stored.' }),
    })
    await screen.findByRole('heading', { name: 'Asha' })
    await fillFirstMedicine(user)
    await user.type(screen.getByLabelText('Additional notes'), 'Drink water')
    await user.click(screen.getByRole('button', { name: 'Save prescription' }))
    expect(await screen.findByText('Prescription stored.')).toBeInTheDocument()
    const [call] = callsTo(fetchMock, 'POST', '/doctor/appointments/a1/prescriptions')
    expect(JSON.parse(call[1].body)).toEqual({
      items: [{ medicineId: 'med1', dosage: '500 mg', frequency: '3/day', instructions: 'After food' }],
      notes: 'Drink water',
    })
    expect(screen.getByLabelText('Dosage')).toHaveValue('')
  })

  it('uses the default message when the server sends none', async () => {
    const user = userEvent.setup()
    setup({ 'POST /doctor/appointments/a1/prescriptions': ok({}) })
    await screen.findByRole('heading', { name: 'Asha' })
    await fillFirstMedicine(user)
    await user.click(screen.getByRole('button', { name: 'Save prescription' }))
    expect(await screen.findByText('Prescription saved.')).toBeInTheDocument()
  })

  it('shows the error when saving a prescription fails', async () => {
    const user = userEvent.setup()
    setup({ 'POST /doctor/appointments/a1/prescriptions': fail(409, { message: 'Already prescribed' }) })
    await screen.findByRole('heading', { name: 'Asha' })
    await fillFirstMedicine(user)
    await user.click(screen.getByRole('button', { name: 'Save prescription' }))
    expect(await screen.findByText('Already prescribed')).toBeInTheDocument()
  })

  it('adds and removes medicine rows', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('option', { name: 'Paracetamol' })
    expect(screen.queryByRole('button', { name: 'Remove medicine' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add another medicine' }))
    expect(screen.getByText('Medicine 2')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove medicine' })).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: 'Remove medicine' })[1])
    expect(screen.queryByText('Medicine 2')).not.toBeInTheDocument()
  })

  it('stops adding rows at 20 medicines', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByRole('option', { name: 'Paracetamol' })
    const add = screen.getByRole('button', { name: 'Add another medicine' })
    for (let i = 0; i < 19; i += 1) await user.click(add)
    expect(add).toBeDisabled()
  })

  it('disables saving when the appointment is not in Booked status', async () => {
    setup({
      'GET /doctor/appointments': ok({ appointments: [appointment({ status: 'Cancelled' })] }),
    })
    await screen.findByRole('option', { name: 'Paracetamol' })
    expect(screen.getByRole('button', { name: 'Save prescription' })).toBeDisabled()
  })
})

describe('DoctorDashboard – automatic refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    return () => vi.useRealTimers()
  })

  it('reloads appointments every five seconds and keeps the selected patient', async () => {
    const { fetchMock } = setup()
    await screen.findByRole('heading', { name: 'Asha' })
    const before = callsTo(fetchMock, 'GET', '/doctor/appointments').length
    await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
    await waitFor(() =>
      expect(callsTo(fetchMock, 'GET', '/doctor/appointments').length).toBeGreaterThan(before)
    )
    expect(screen.getByRole('heading', { name: 'Asha' })).toBeInTheDocument()
  })

  it('selects the first appointment again if the selected one disappears', async () => {
    let round = 0
    setup({
      'GET /doctor/appointments': () => {
        round += 1
        return round === 1
          ? ok({ appointments: [appointment(), appointment({ id: 'a2', patientName: 'Ravi' })] })
          : ok({ appointments: [appointment({ id: 'a3', patientName: 'Meena' })] })
      },
    })
    await screen.findByRole('heading', { name: 'Asha' })
    await act(async () => { await vi.advanceTimersByTimeAsync(5100) })
    expect(await screen.findByRole('heading', { name: 'Meena' })).toBeInTheDocument()
    const list = screen.getByRole('button', { name: /Meena/ }).parentElement
    expect(within(list).queryByText('Ravi')).not.toBeInTheDocument()
  })
})
