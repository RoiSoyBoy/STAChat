describe('Chat Widget', () => {
  beforeEach(() => {
    // Mock Firebase Auth
    cy.intercept('POST', 'https://identitytoolkit.googleapis.com/v1/token', {
      statusCode: 200,
      body: {
        access_token: 'mock-token',
        expires_in: '3600',
      },
    });

    // Mock initial messages
    cy.intercept('GET', '/api/messages*', {
      statusCode: 200,
      body: {
        messages: [],
        hasMore: false,
      },
    });

    // Visit the test page
    cy.visit('/test');
  });

  it('opens and closes the chat widget', () => {
    // Chat should be closed initially
    cy.get('[aria-label="פתח צ\'אט"]').should('be.visible');
    cy.get('[aria-label="חלון צ\'אט"]').should('not.exist');

    // Open chat
    cy.get('[aria-label="פתח צ\'אט"]').click();
    cy.get('[aria-label="חלון צ\'אט"]').should('be.visible');

    // Close chat
    cy.get('[aria-label="סגור צ\'אט"]').click();
    cy.get('[aria-label="חלון צ\'אט"]').should('not.exist');
  });

  it('sends and receives messages', () => {
    // Mock chat response
    cy.intercept('POST', '/api/chat', {
      statusCode: 200,
      body: {
        response: 'I can help you with that!',
      },
    });

    // Open chat
    cy.get('[aria-label="פתח צ\'אט"]').click();

    // Type and send message
    cy.get('[aria-label="תיבת טקסט להודעה"]').type('Can you help me?');
    cy.get('[aria-label="שלח הודעה"]').click();

    // Check messages
    cy.contains('Can you help me?').should('be.visible');
    cy.contains('I can help you with that!').should('be.visible');
  });

  it('handles network errors', () => {
    // Mock failed chat response
    cy.intercept('POST', '/api/chat', {
      statusCode: 500,
      body: {
        error: 'שגיאה בעיבוד הבקשה',
      },
    });

    // Open chat
    cy.get('[aria-label="פתח צ\'אט"]').click();

    // Type and send message
    cy.get('[aria-label="תיבת טקסט להודעה"]').type('Test message');
    cy.get('[aria-label="שלח הודעה"]').click();

    // Check error toast
    cy.contains('שגיאה בשליחת ההודעה, אנא נסה שוב').should('be.visible');
  });

  it('loads more messages on scroll', () => {
    // Mock initial messages
    cy.intercept('GET', '/api/messages?clientId=*&offset=0', {
      statusCode: 200,
      body: {
        messages: [
          {
            id: '1',
            content: 'Recent message',
            role: 'user',
            timestamp: Date.now(),
          },
        ],
        hasMore: true,
      },
    });

    // Mock older messages
    cy.intercept('GET', '/api/messages?clientId=*&offset=1', {
      statusCode: 200,
      body: {
        messages: [
          {
            id: '2',
            content: 'Older message',
            role: 'user',
            timestamp: Date.now() - 1000,
          },
        ],
        hasMore: false,
      },
    });

    // Open chat
    cy.get('[aria-label="פתח צ\'אט"]').click();

    // Check recent message
    cy.contains('Recent message').should('be.visible');

    // Scroll to top
    cy.get('.overflow-y-auto').scrollTo('top');

    // Check older message
    cy.contains('Older message').should('be.visible');
  });

  it('sanitizes message input', () => {
    // Mock chat response
    cy.intercept('POST', '/api/chat', {
      statusCode: 200,
      body: {
        response: 'Safe response',
      },
    });

    // Open chat
    cy.get('[aria-label="פתח צ\'אט"]').click();

    // Type message with HTML
    const unsafeInput = '<script>alert("xss")</script>Hello';
    cy.get('[aria-label="תיבת טקסט להודעה"]').type(unsafeInput);
    cy.get('[aria-label="שלח הודעה"]').click();

    // Check sanitized message
    cy.get('[role="article"]').should('not.contain', '<script>');
  });

  it('handles rate limiting', () => {
    // Mock rate limited response
    cy.intercept('POST', '/api/chat', {
      statusCode: 429,
      body: {
        error: 'נא לנסות שוב בעוד דקה',
      },
    });

    // Open chat
    cy.get('[aria-label="פתח צ\'אט"]').click();

    // Type and send message
    cy.get('[aria-label="תיבת טקסט להודעה"]').type('Test message');
    cy.get('[aria-label="שלח הודעה"]').click();

    // Check rate limit message
    cy.contains('נא לנסות שוב בעוד דקה').should('be.visible');
  });
}); 