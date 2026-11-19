import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import MedicinePurchase from './MedicinePurchase'
import { mockFetch, ok, fail, callsTo } from './test/mockApi'

const medicines = [
  { id: 'm1', name: 'Paracetamol', dosage: '500 mg', frequency: '3/day', instructions: 'After food', price: 30 },
  { id: 'm2', name: 'Ibuprofen', dosage: '200 mg', frequency: '2/day', instructions: 'With water', price: 50 },
]
const prescriptions = [
  {
    id: 'p1',
    doctorName: 'Dr Rao',
    createdAt: '2026-10-01T10:00:00Z',
    notes: 'Rest well',
    items: [{ medicineId: 'm1', name: 'Paracetamol', dosage: '500 mg', frequency: '3/day', instructions: 'After food' }],
  },
]

function setup(overrides = {}) {
  localStorage.setItem('token', 'pat-token')
  const fetchMock = mockFetch({
    'GET /medicines/prescribed': ok({ medicines, prescriptions }),
    'GET /medicine-orders/me': ok({ orders: [] }),
    ...overrides,
  })
  render(<MedicinePurchase />)
  return fetchMock
}

describe('MedicinePurchase – loading and empty states', () => {
  it('shows empty messages when there is nothing to show', async () => {
    setup({
      'GET /medicines/prescribed': ok({ medicines: [], prescriptions: [] }),
    })
    expect(await screen.findByText('No prescription saved by your doctor yet.')).toBeInTheDocument()
    expect(screen.getByText(/No prescribed medicines available/)).toBeInTheDocument()
    expect(screen.getByText('No medicine orders yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Proceed to Checkout' })).toBeDisabled()
  })

  it('ignores non-array payloads', async () => {
    setup({
      'GET /medicines/prescribed': ok({ medicines: 'x', prescriptions: 'y' }),
      'GET /medicine-orders/me': ok({ orders: 'z' }),
    })
    expect(await screen.findByText('No prescription saved by your doctor yet.')).toBeInTheDocument()
    expect(screen.getByText('No medicine orders yet.')).toBeInTheDocument()
  })

  it('shows the server message when loading fails and refreshes on demand', async () => {
    const user = userEvent.setup()
    let calls = 0
    setup({
      'GET /medicines/prescribed': () => {
        calls += 1
        return calls === 1 ? fail(500, { message: 'Pharmacy offline' }) : ok({ medicines, prescriptions })
      },
    })
    expect(await screen.findByText('Pharmacy offline')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Refresh prescriptions' }))
    expect(await screen.findByText('Ibuprofen')).toBeInTheDocument()
  })

  it('uses the status code when the failed response has no message', async () => {
    setup({ 'GET /medicines/prescribed': fail(503) })
    expect(await screen.findByText('Request failed (503)')).toBeInTheDocument()
  })

  it('shows prescriptions with doctor, notes and items', async () => {
    setup()
    expect(await screen.findByText('Dr Rao')).toBeInTheDocument()
    expect(screen.getByText('Notes: Rest well')).toBeInTheDocument()
    expect(screen.getByText(/Paracetamol — Dosage: 500 mg; Frequency: 3\/day; Instructions: After food/)).toBeInTheDocument()
  })

  it('omits the notes line when a prescription has no notes', async () => {
    setup({ 'GET /medicines/prescribed': ok({ medicines: [], prescriptions: [{ ...prescriptions[0], notes: '' }] }) })
    await screen.findByText('Dr Rao')
    expect(screen.queryByText(/^Notes:/)).not.toBeInTheDocument()
  })
})

describe('MedicinePurchase – building a cart', () => {
  it('totals the selected medicines and clamps quantities between 1 and 20', async () => {
    const user = userEvent.setup()
    setup()
    await screen.findByText('Ibuprofen')
    const qty = screen.getAllByRole('spinbutton')
    expect(qty[0]).toBeDisabled()

    await user.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('Selected items: 1')).toBeInTheDocument()
    expect(screen.getByText('Total: ₹30.00')).toBeInTheDocument()

    fireEvent.change(qty[0], { target: { value: '3' } })
    expect(screen.getByText('Total: ₹90.00')).toBeInTheDocument()
    fireEvent.change(qty[0], { target: { value: '99' } })
    expect(qty[0]).toHaveValue(20)
    fireEvent.change(qty[0], { target: { value: '0' } })
    expect(qty[0]).toHaveValue(1)

    await user.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByText('Total: ₹80.00')).toBeInTheDocument()
    await user.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByText('Selected items: 1')).toBeInTheDocument()
  })

  it('treats a medicine without a price as free', async () => {
    const user = userEvent.setup()
    setup({
      'GET /medicines/prescribed': ok({ medicines: [{ id: 'm9', name: 'Sample', price: 0 }], prescriptions: [] }),
    })
    await user.click(await screen.findByRole('checkbox'))
    expect(screen.getByText('Total: ₹0.00')).toBeInTheDocument()
  })
})

describe('MedicinePurchase – checkout and demo payment', () => {
  async function checkout(user) {
    await screen.findByText('Ibuprofen')
    await user.click(screen.getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: 'Proceed to Checkout' }))
  }

  it('creates an order and shows the checkout box', async () => {
    const user = userEvent.setup()
    const fetchMock = setup({
      'POST /medicine-orders': ok({ order: { id: 'o1', totalAmount: 30 } }),
    })
    await checkout(user)
    expect(await screen.findByText('Order ID: o1')).toBeInTheDocument()
    expect(screen.getByText('Amount: ₹30.00')).toBeInTheDocument()
    expect(screen.getByText(/Order created/)).toBeInTheDocument()
    const [call] = callsTo(fetchMock, 'POST', '/medicine-orders')
    expect(JSON.parse(call[1].body)).toEqual({ items: [{ medicineId: 'm1', quantity: 1 }] })
  })

  it('shows the error when the order cannot be created', async () => {
    const user = userEvent.setup()
    setup({ 'POST /medicine-orders': fail(400, { message: 'Out of stock' }) })
    await checkout(user)
    expect(await screen.findByText('Out of stock')).toBeInTheDocument()
    expect(screen.queryByText('Checkout')).not.toBeInTheDocument()
  })

  it('completes the simulated payment from the checkout box', async () => {
    const user = userEvent.setup()
    setup({
      'POST /medicine-orders': ok({ order: { id: 'o1', totalAmount: 30 } }),
      'POST /medicine-orders/o1/pay-demo': ok({ message: 'Paid OK.', payment: { reference: 'REF123' } }),
    })
    await checkout(user)
    await user.click(await screen.findByRole('button', { name: 'Pay Now (Demo)' }))
    expect(await screen.findByText('Processing payment...')).toBeInTheDocument()
    expect(await screen.findByText(/Paid OK\. Reference: REF123/, {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.queryByText('Order ID: o1')).not.toBeInTheDocument()
  })

  it('uses default wording when the payment response has no message or reference', async () => {
    const user = userEvent.setup()
    setup({
      'POST /medicine-orders': ok({ order: { id: 'o1', totalAmount: 30 } }),
      'POST /medicine-orders/o1/pay-demo': ok({}),
    })
    await checkout(user)
    await user.click(await screen.findByRole('button', { name: 'Pay Now (Demo)' }))
    expect(await screen.findByText(/Demo payment successful\. Reference: N\/A/, {}, { timeout: 4000 })).toBeInTheDocument()
  })

  it('shows the error when the payment is rejected', async () => {
    const user = userEvent.setup()
    setup({
      'POST /medicine-orders': ok({ order: { id: 'o1', totalAmount: 30 } }),
      'POST /medicine-orders/o1/pay-demo': fail(409, { message: 'Order already paid' }),
    })
    await checkout(user)
    await user.click(await screen.findByRole('button', { name: 'Pay Now (Demo)' }))
    expect(await screen.findByText('Order already paid', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Now (Demo)' })).toBeEnabled()
  })
})

describe('MedicinePurchase – existing orders', () => {
  it('lists orders and lets the patient pay a pending one', async () => {
    const user = userEvent.setup()
    setup({
      'GET /medicine-orders/me': ok({
        orders: [
          { id: 'o1', totalAmount: 30, paymentStatus: 'Pending' },
          { id: 'o2', totalAmount: 50, paymentStatus: 'Paid', paymentReference: 'TXN-77' },
        ],
      }),
      'POST /medicine-orders/o1/pay-demo': ok({ message: 'Settled.', payment: { reference: 'R1' } }),
    })
    expect(await screen.findByText('Order o1')).toBeInTheDocument()
    expect(screen.getByText('Transaction reference: TXN-77')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Pay (Demo)' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Pay (Demo)' }))
    expect(await screen.findByRole('button', { name: 'Processing...' })).toBeInTheDocument()
    expect(await screen.findByText(/Settled\. Reference: R1/, {}, { timeout: 4000 })).toBeInTheDocument()
  })
})
