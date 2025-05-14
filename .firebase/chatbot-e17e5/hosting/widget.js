(() => {
  // Store the queue of commands to be executed
  const queue = window.hcw.q || [];
  
  // Configuration object
  let config = null;

  // Initialize the widget
  const init = (clientConfig) => {
    config = clientConfig;
    
    // Create widget container
    const container = document.createElement('div');
    container.id = 'hebrew-chat-widget';
    document.body.appendChild(container);

    // Load React widget
    const script = document.createElement('script');
    script.src = 'https://your-domain.com/widget-bundle.js';
    script.async = true;
    script.onload = () => {
      // Initialize React widget with config
      window.HebrewChatWidgetInit(config);
    };
    document.body.appendChild(script);
  };

  // Define the widget API
  window.hcw = function() {
    const args = Array.prototype.slice.call(arguments);
    const command = args[0];
    
    switch (command) {
      case 'init':
        init(args[1]);
        break;
      default:
        console.warn('Unknown command:', command);
    }
  };

  // Process queued commands
  queue.forEach((args) => {
    window.hcw.apply(null, args);
  });
})(); 