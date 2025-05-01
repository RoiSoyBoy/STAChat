/// <reference types="cypress" />

// Custom command to select by data-cy attribute
Cypress.Commands.add('dataCy', (value: string) => {
  return cy.get(`[data-cy=${value}]`);
});

// Prevent TypeScript from reading file as legacy script
export {}; 