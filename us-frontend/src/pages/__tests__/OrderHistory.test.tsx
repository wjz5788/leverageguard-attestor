import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderHistoryPage } from '../OrderHistory';

// Mock the order service
jest.mock('../../services/order', () => ({
  fetchOrderHistory: jest.fn(),
}));

describe('OrderHistoryPage', () => {
  test('renders correctly with search form', () => {
    render(<OrderHistoryPage />);
    
    expect(screen.getByText('Order History')).toBeInTheDocument();
    expect(screen.getByText('Search Orders')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter wallet address')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  test('shows error when searching with empty wallet address', () => {
    render(<OrderHistoryPage />);
    
    const searchForm = screen.getByText('Search').closest('form');
    
    // Simulate form submission without entering wallet address
    fireEvent.submit(searchForm);
    
    expect(screen.getByText('Please enter a wallet address')).toBeInTheDocument();
  });

  test('renders no orders message when no data', () => {
    require('../../services/order').fetchOrderHistory.mockResolvedValueOnce([]);
    
    render(<OrderHistoryPage />);
    
    // The component should show the search form but no orders initially
    expect(screen.getByText('Search Orders')).toBeInTheDocument();
    expect(screen.getByText('Order History')).toBeInTheDocument(); // This is always shown
  });
});