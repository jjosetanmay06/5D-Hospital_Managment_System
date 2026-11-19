import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import App from './App'
import { mockFetch, ok, fail, failNoJson, callsTo } from './test/mockApi'

vi.mock('./Booking', () => ({
  default: ({ user, onLogout }) => (
    <div>
      <p>Booking page for {user.name}</p>
      <button onClick={onLogout}>Log out</button>
    </div>
  ),
}))
vi.mock('./DoctorDashboard', () => ({
  default: ({ user, onLogout }) => (
    <div>
      <p>Doctor page for {user.name}</p>
      <button onClick={onLogout}>Doctor log out</button>
    </div>
  ),
}))

async function fillLogin(user, email = 'a@b.com', password = 'password123') {
  await user.type(screen.getByPlaceholderText('you@example.com'), email)
  await user.type(screen.getByPlaceholderText(/at least 8 characters|doctor password/i), password)
}

describe('App – mode switching', () => {
  it('shows the patient login form by default', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
  })

  it('switches to register and back to login', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Create an account' }))
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('switches to doctor login and back to patient login', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Doctor login' }))
    expect(screen.getByRole('heading', { name: 'Doctor login' })).toBeInTheDocument()
    expect(screen.getByText('Authorized clinical staff only.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Doctor password')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Patient login' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })
})

describe('App – login', () => {
  it('logs a patient in, stores the token and shows the booking page', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({
      'POST /auth/login': ok({ token: 'tok-1', user: { name: 'Asha', role: 'patient' } }),
    })
    render(<App />)
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByText('Booking page for Asha')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBe('tok-1')
    const [call] = callsTo(fetchMock, 'POST', '/auth/login')
    expect(JSON.parse(call[1].body)).toEqual({ email: 'a@b.com', password: 'password123' })
  })

  it('logs a doctor in through the doctor endpoint and shows the dashboard', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({
      'POST /auth/doctor-login': ok({ token: 'tok-d', user: { name: 'Dr Rao', role: 'doctor' } }),
    })
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Doctor login' }))
    await fillLogin(user, 'doc@b.com', 'x')
    await user.click(screen.getByRole('button', { name: 'Log in as doctor' }))
    expect(await screen.findByText('Doctor page for Dr Rao')).toBeInTheDocument()
    expect(callsTo(fetchMock, 'POST', '/auth/doctor-login')).toHaveLength(1)
  })

  it('shows the server message when login is rejected', async () => {
    const user = userEvent.setup()
    mockFetch({ 'POST /auth/login': fail(401, { message: 'Invalid credentials' }) })
    render(<App />)
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Invalid credentials')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    const user = userEvent.setup()
    mockFetch({ 'POST /auth/login': failNoJson(500) })
    render(<App />)
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Request failed.')
  })

  it('tells the user when the backend cannot be reached', async () => {
    const user = userEvent.setup()
    mockFetch({ 'POST /auth/login': new Error('network down') })
    render(<App />)
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/cannot connect to the backend/i)
  })
})

describe('App – registration and OTP', () => {
  async function register(user) {
    await user.click(screen.getByRole('button', { name: 'Create an account' }))
    await user.type(screen.getByPlaceholderText('Enter your full name'), 'Asha Rao')
    await user.type(screen.getByPlaceholderText('10-digit mobile number'), '9876543210')
    await user.type(screen.getByPlaceholderText('you@example.com'), 'asha@b.com')
    await user.type(screen.getByPlaceholderText('At least 8 characters'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
  }

  it('moves to OTP verification after a successful registration', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({ 'POST /auth/register': ok({}) })
    render(<App />)
    await register(user)
    expect(await screen.findByRole('heading', { name: 'Verify your phone' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/registration successful/i)
    expect(screen.getByText(/9876543210/)).toBeInTheDocument()
    const [call] = callsTo(fetchMock, 'POST', '/auth/register')
    expect(JSON.parse(call[1].body)).toMatchObject({ name: 'Asha Rao', phone: '9876543210' })
  })

  it('keeps the user on the register form when registration fails', async () => {
    const user = userEvent.setup()
    mockFetch({ 'POST /auth/register': fail(409, { message: 'Email already registered' }) })
    render(<App />)
    await register(user)
    expect(await screen.findByRole('status')).toHaveTextContent('Email already registered')
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
  })

  it('accepts only digits (max six) in the OTP box and returns to login after verifying', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch({
      'POST /auth/register': ok({}),
      'POST /auth/verify-otp': ok({}),
    })
    render(<App />)
    await register(user)
    const otpBox = await screen.findByPlaceholderText('Enter OTP')
    await user.type(otpBox, '12ab3456789')
    expect(otpBox).toHaveValue('123456')
    await user.click(screen.getByRole('button', { name: 'Verify OTP' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/phone verified successfully/i)
    const [call] = callsTo(fetchMock, 'POST', '/auth/verify-otp')
    expect(JSON.parse(call[1].body)).toEqual({ phone: '9876543210', otp: '123456' })
  })

  it('shows an error for a wrong OTP and lets the user register again', async () => {
    const user = userEvent.setup()
    mockFetch({
      'POST /auth/register': ok({}),
      'POST /auth/verify-otp': fail(400, { message: 'Incorrect OTP' }),
    })
    render(<App />)
    await register(user)
    await user.type(await screen.findByPlaceholderText('Enter OTP'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify OTP' }))
    expect(await screen.findByText('Incorrect OTP')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Register again' }))
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument()
  })
})

describe('App – logout', () => {
  it('clears the token and returns to the login page with a message', async () => {
    const user = userEvent.setup()
    mockFetch({
      'POST /auth/login': ok({ token: 'tok-1', user: { name: 'Asha', role: 'patient' } }),
    })
    render(<App />)
    await fillLogin(user)
    await user.click(screen.getByRole('button', { name: 'Log in' }))
    await user.click(await screen.findByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(localStorage.getItem('token')).toBeNull())
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('You have logged out.')
  })
})
