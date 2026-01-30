/**
 * Random Data Generation Module
 * Provides helpers for generating random test data for seeding
 *
 * No external dependencies - uses simple randomization
 */

// Allowed currencies for multi-currency mode
const ALLOWED_CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP', 'CAD'];

// Sample first names
const FIRST_NAMES = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Edward',
  'Fiona', 'George', 'Hannah', 'Ivan', 'Julia',
  'Kevin', 'Laura', 'Michael', 'Nina', 'Oscar',
  'Patricia', 'Quentin', 'Rachel', 'Samuel', 'Teresa',
  'Ulrich', 'Victoria', 'William', 'Xena', 'Yves', 'Zoe'
];

// Sample last names
const LAST_NAMES = [
  'Anderson', 'Brown', 'Clark', 'Davis', 'Evans',
  'Foster', 'Garcia', 'Harris', 'Ingram', 'Johnson',
  'King', 'Lee', 'Miller', 'Nelson', 'Owen',
  'Parker', 'Quinn', 'Roberts', 'Smith', 'Taylor',
  'Underwood', 'Vance', 'Wilson', 'Xavier', 'Young', 'Zhang'
];

// Email domains for test accounts
const EMAIL_DOMAINS = [
  'test.example.com',
  'seed.example.org',
  'demo.example.net'
];

/**
 * Get random element from array
 * @param {Array} arr - Array to pick from
 * @returns {*} Random element
 */
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate random integer between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random first name
 * @returns {string} Random first name
 */
function randomFirstName() {
  return randomElement(FIRST_NAMES);
}

/**
 * Generate random last name
 * @returns {string} Random last name
 */
function randomLastName() {
  return randomElement(LAST_NAMES);
}

/**
 * Generate random name object
 * @returns {{ firstName: string, lastName: string }} Random name
 */
function randomName() {
  return {
    firstName: randomFirstName(),
    lastName: randomLastName()
  };
}

/**
 * Generate unique email address with seed prefix
 * @param {string} [prefix='seed'] - Prefix for uniqueness
 * @returns {string} Unique email address
 */
function randomEmail(prefix = 'seed') {
  const timestamp = Date.now();
  const random = randomInt(1000, 9999);
  const domain = randomElement(EMAIL_DOMAINS);
  return `${prefix}-${timestamp}-${random}@${domain}`;
}

/**
 * Generate random currency from allowed list
 * @param {string[]} [allowed=ALLOWED_CURRENCIES] - List of allowed currencies
 * @returns {string} Random currency code
 */
function randomCurrency(allowed = ALLOWED_CURRENCIES) {
  return randomElement(allowed);
}

/**
 * Generate random date between start and end
 * @param {Date} start - Start date (inclusive)
 * @param {Date} end - End date (inclusive)
 * @returns {Date} Random date within range
 * @throws {Error} If date range is invalid
 */
function randomDate(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    throw new Error('Start and end must be Date objects');
  }

  if (start > end) {
    throw new Error('Start date must be before or equal to end date');
  }

  const startTime = start.getTime();
  const endTime = end.getTime();
  const randomTime = startTime + Math.random() * (endTime - startTime);

  return new Date(randomTime);
}

// Global counter for additional uniqueness within same millisecond
let globalCounter = 0;

/**
 * Generate unique account code with type prefix
 * Uses timestamp + random string + counter for collision resistance
 * @param {string} prefix - Account type prefix (e.g., 'seed-active', 'seed-legit', 'seed-dunning')
 * @returns {string} Unique account code
 */
function randomAccountCode(prefix) {
  if (!prefix || typeof prefix !== 'string') {
    throw new Error('Prefix must be a non-empty string');
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8); // 6 random alphanumeric chars
  const counter = (globalCounter++ % 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}-${random}-${counter}`;
}

/**
 * Generate complete random account data
 * Note: currency is NOT included - accounts don't have currency, subscriptions do
 * @param {string} typePrefix - Account type prefix (e.g., 'seed-active')
 * @returns {Object} Account data object
 */
function randomAccountData(typePrefix) {
  const name = randomName();
  const code = randomAccountCode(typePrefix);
  const email = randomEmail(typePrefix);

  return {
    code,
    email,
    first_name: name.firstName,
    last_name: name.lastName
  };
}

module.exports = {
  ALLOWED_CURRENCIES,
  randomElement,
  randomInt,
  randomFirstName,
  randomLastName,
  randomName,
  randomEmail,
  randomCurrency,
  randomDate,
  randomAccountCode,
  randomAccountData
};
