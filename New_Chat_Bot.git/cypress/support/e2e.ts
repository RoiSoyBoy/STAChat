/// <reference types="cypress" />

// Import commands.js using ES2015 syntax:
import './commands';

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command to select DOM element by data-cy attribute.
       * @example cy.dataCy('greeting')
       */
      dataCy(value: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}

// Prevent TypeScript from reading file as legacy script
export {}; 