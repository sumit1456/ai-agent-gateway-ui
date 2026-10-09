import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Horizon landing page', () => {
  window.location.hash = '';
  render(<App />);
  const logo = screen.getAllByText('Horizon');
  expect(logo.length).toBeGreaterThan(0);
  expect(screen.getByText(/event horizon/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
});

test('renders the login form with a log in button', () => {
  window.location.hash = '#/login';
  render(<App />);
  expect(screen.getByText('Welcome back')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Register' })).toBeInTheDocument();
});

test('renders the register form with a switch to log in', () => {
  window.location.hash = '#/register';
  render(<App />);
  expect(screen.getByText('Register your agent')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
});
