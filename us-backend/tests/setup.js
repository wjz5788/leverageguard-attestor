// Setup file for backend tests
const db = require('../src/db');

// Clear database before each test
beforeEach(() => {
  // Add any necessary setup code here
});

// Close database connections after all tests
afterAll(() => {
  db.close();
});