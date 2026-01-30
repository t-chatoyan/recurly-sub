/**
 * Project Configuration Module
 * Defines Recurly project identifiers and their configurations
 *
 * Each project corresponds to a different Recurly site with its own
 * API credentials and currency settings.
 */

/**
 * Project configuration definitions
 * Frozen to prevent accidental mutation (Finding 3)
 * @type {Object.<string, Object>}
 */
const PROJECT_IDENTIFIERS = Object.freeze({
  eur: Object.freeze({
    id: 'eur',
    name: 'EUR Project',
    siteId: 'eur-site', // TODO: Replace with actual Recurly site ID
    currency: 'EUR',
    description: 'European project (EUR currency only)'
  }),
  multi: Object.freeze({
    id: 'multi',
    name: 'Multi-Currency Project',
    siteId: 'multi-site', // TODO: Replace with actual Recurly site ID
    currency: null, // Supports multiple currencies
    description: 'Multi-currency project (EUR, USD, GBP, etc.)'
  })
});

/**
 * Get project configuration by ID
 * @param {string} projectId - Project identifier (eur, multi)
 * @returns {Object} Project configuration object
 * @throws {Error} If project ID is invalid or missing
 */
function getProjectConfig(projectId) {
  if (!projectId || typeof projectId !== 'string') {
    throw new Error('Project ID is required');
  }

  const normalizedId = projectId.toLowerCase().trim();

  if (normalizedId === '') {
    throw new Error('Project ID is required');
  }

  const config = PROJECT_IDENTIFIERS[normalizedId];

  if (!config) {
    const validIds = Object.keys(PROJECT_IDENTIFIERS).join(', ');
    throw new Error(
      `Invalid project identifier: "${projectId}". Valid options: ${validIds}`
    );
  }

  return { ...config }; // Return a copy to prevent mutation
}

/**
 * Get list of valid project identifiers
 * Returns a new array each time to prevent mutation (Finding 4)
 * @returns {string[]} Array of valid project IDs
 */
function getValidProjectIds() {
  return [...Object.keys(PROJECT_IDENTIFIERS)];
}

/**
 * Check if a project ID is valid
 * @param {string} projectId - Project identifier to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidProjectId(projectId) {
  if (!projectId || typeof projectId !== 'string') {
    return false;
  }
  return projectId.toLowerCase().trim() in PROJECT_IDENTIFIERS;
}

module.exports = {
  PROJECT_IDENTIFIERS,
  getProjectConfig,
  getValidProjectIds,
  isValidProjectId
};
